import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StonebridgeProgress } from '../../../core/types/stonebridge'
import {
  advanceStonebridgeProgressIfUnchanged,
  canonicalProgressValue,
  canonicalToken,
  createStonebridgeProgressIfAbsent,
  progressDocsEqual,
  storedValuesEqual,
} from './stonebridgeProgressWrite'

/** The module's own rule, applied to a bare value rather than a document. */
const sameValue = storedValuesEqual

/**
 * The atomic write, on its own.
 *
 * Two halves are asserted here. **The decision** — create only while absent,
 * advance only while the stored document still equals the source the proposal
 * was computed from, and *absent where a document was expected writes nothing
 * and creates nothing*. And **the equality** that decision rests on: stable to
 * key order, strict about types, and carrying fields this module has never
 * heard of, because a document another client has added something to is not the
 * document we read.
 *
 * ── The replay is modelled, not assumed away ────────────────────────────────
 *
 * Firestore may run a transaction callback more than once and commits only the
 * last attempt. The fake below does exactly that: it replays the callback
 * `attemptsPerTransaction` times, lets the test move the document between
 * attempts, and keeps only the final attempt's writes. So a callback that
 * recorded anything outside its return value — a celebration flag, a counter —
 * would be recording it from attempts that were thrown away, and the last
 * block here is the assertion that the answer comes from the attempt that
 * actually committed.
 */

type Stored = Record<string, unknown>

const fx = vi.hoisted(() => ({
  /** The modelled datastore. */
  stored: new Map<string, Stored>(),
  /** Writes the committed attempt staged, in order. */
  committed: [] as { path: string; payload: Stored }[],
  /** How many times each transaction callback runs before one commits. */
  attemptsPerTransaction: 1,
  /** Callback runs across every transaction — the no-spin measure. */
  attempts: 0,
  /** The test's hook to move the document between attempts. */
  onAttempt: null as ((attempt: number) => void) | null,
}))

vi.mock('firebase/firestore', () => ({
  doc: (col: { kind: string; familyId: string }, id: string) => ({
    path: `${col.familyId}/${col.kind}/${id}`,
  }),
  runTransaction: async (
    _db: unknown,
    update: (tx: {
      get: (ref: { path: string }) => Promise<{
        exists: () => boolean
        data: () => Stored | undefined
      }>
      set: (ref: { path: string }, payload: Stored) => void
    }) => Promise<unknown>,
  ) => {
    let result: unknown
    for (let attempt = 1; attempt <= fx.attemptsPerTransaction; attempt += 1) {
      fx.attempts += 1
      fx.onAttempt?.(attempt)
      const staged: { path: string; payload: Stored }[] = []
      result = await update({
        get: async (ref: { path: string }) => {
          const stored = fx.stored.get(ref.path)
          return { exists: () => stored !== undefined, data: () => stored }
        },
        set: (ref: { path: string }, payload: Stored) => {
          staged.push({ path: ref.path, payload })
        },
      })
      // Only the final attempt is the one that commits. Everything an earlier
      // attempt staged is discarded whole.
      if (attempt === fx.attemptsPerTransaction) {
        fx.committed.push(...staged)
        staged.forEach(({ path, payload }) => fx.stored.set(path, payload))
      }
    }
    return result
  },
}))

vi.mock('../../../core/firebase/firestore', () => ({
  db: { kind: 'db' },
  stonebridgeProgressCollection: (familyId: string) => ({
    kind: 'stonebridgeProgress',
    familyId,
  }),
}))

const FAM = 'fam-1'
const LINCOLN = 'lincoln'
const PATH = `${FAM}/stonebridgeProgress/${LINCOLN}`

/** Two locations rebuilt, part-way through the third. */
const SAVED: StonebridgeProgress = {
  childId: LINCOLN,
  currentMissionId: 'library_hut',
  activeProgress: { missionId: 'library_hut', current: 3, target: 8 },
  completedMissions: ['old_bridge', 'watchtower'],
  raisedBanners: ['old_bridge', 'watchtower'],
  missionBaselines: { old_bridge: 0, watchtower: 5, library_hut: 11 },
  updatedAt: '2026-10-20T10:00:00.000Z',
}

/** The same village, reached by another client that saw more reading. */
const AHEAD: StonebridgeProgress = {
  ...SAVED,
  currentMissionId: 'the_forge',
  activeProgress: { missionId: 'the_forge', current: 0, target: 10 },
  completedMissions: ['old_bridge', 'watchtower', 'library_hut'],
  raisedBanners: ['old_bridge', 'watchtower', 'library_hut'],
  missionBaselines: { ...SAVED.missionBaselines, the_forge: 19 },
  updatedAt: '2026-10-27T10:00:00.000Z',
}

/** The proposal this client computed from {@link SAVED}. */
const PROPOSAL: StonebridgeProgress = { ...AHEAD, updatedAt: '2026-10-28T10:00:00.000Z' }

function store(state: StonebridgeProgress) {
  fx.stored.set(PATH, state as unknown as Stored)
}

beforeEach(() => {
  fx.stored.clear()
  fx.committed.length = 0
  fx.attemptsPerTransaction = 1
  fx.attempts = 0
  fx.onAttempt = null
})

describe('stored equality is the compare half of the write', () => {
  it('ignores key order, in the document and in its nested records', () => {
    const shuffled: StonebridgeProgress = {
      updatedAt: SAVED.updatedAt,
      raisedBanners: ['old_bridge', 'watchtower'],
      missionBaselines: { library_hut: 11, old_bridge: 0, watchtower: 5 },
      completedMissions: ['old_bridge', 'watchtower'],
      activeProgress: { target: 8, current: 3, missionId: 'library_hut' },
      currentMissionId: 'library_hut',
      childId: LINCOLN,
    }
    expect(progressDocsEqual(SAVED, shuffled)).toBe(true)
    expect(progressDocsEqual(shuffled, SAVED)).toBe(true)
  })

  it('reads a different value as a different document — including the stamp', () => {
    expect(progressDocsEqual(SAVED, { ...SAVED, updatedAt: '2026-10-21T10:00:00.000Z' })).toBe(
      false,
    )
    expect(progressDocsEqual(SAVED, AHEAD)).toBe(false)
    expect(
      progressDocsEqual(SAVED, { ...SAVED, missionBaselines: { ...SAVED.missionBaselines, library_hut: 10 } }),
    ).toBe(false)
  })

  it('keeps types: a number is not the string of that number', () => {
    expect(sameValue(5, '5')).toBe(false)
    expect(sameValue(0, false)).toBe(false)
    expect(sameValue(null, undefined)).toBe(false)
    expect(sameValue({ a: 1 }, { a: '1' })).toBe(false)
  })

  it('compares list ORDER, which is what completion order is', () => {
    expect(sameValue(['a', 'b'], ['b', 'a'])).toBe(false)
    expect(sameValue(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(sameValue(['a'], ['a', 'b'])).toBe(false)
  })

  it('sees a field it has never heard of, rather than ignoring it', () => {
    // A field added by a newer client (or a later schema) means the stored
    // document is NOT the one this proposal was computed from.
    const withExtra = { ...SAVED, somethingNew: { nested: [1, 2] } }
    expect(sameValue(SAVED, withExtra)).toBe(false)
    expect(sameValue(withExtra, SAVED)).toBe(false)
    // …and carries it when both sides have it, so an unknown field does not
    // make a document permanently unequal to itself.
    expect(sameValue(withExtra, { ...SAVED, somethingNew: { nested: [1, 2] } })).toBe(true)
  })

  it('treats a missing key and an explicit undefined as different', () => {
    expect(sameValue({ a: 1, b: undefined }, { a: 1 })).toBe(false)
  })

  it('names the numbers a serialisation cannot tell apart', () => {
    // `JSON.stringify` prints `null` for all three of these, which made three
    // different documents compare equal — an overwrite, in the direction that
    // loses a village.
    expect(canonicalToken(Number.NaN)).not.toBe(canonicalToken(null))
    expect(canonicalToken(Number.POSITIVE_INFINITY)).not.toBe(canonicalToken(null))
    expect(canonicalToken(Number.POSITIVE_INFINITY)).not.toBe(
      canonicalToken(Number.NEGATIVE_INFINITY),
    )
    expect(canonicalToken(-0)).not.toBe(canonicalToken(0))
    // …and two stored NaNs are still the same stored number, so a document
    // carrying one is not in conflict with itself forever.
    expect(sameValue(Number.NaN, Number.NaN)).toBe(true)
    expect(sameValue({ n: Number.NaN }, { n: Number.NaN })).toBe(true)
  })

  it('names a Date by its time, not by its (empty) key set', () => {
    // Both of these serialise to `{}`: no own enumerable keys.
    expect(canonicalToken(new Date(1))).not.toBe(canonicalToken(new Date(2)))
    expect(sameValue(new Date(1), new Date(2))).toBe(false)
    expect(sameValue(new Date(1), new Date(1))).toBe(true)
    expect(sameValue({ at: new Date(1) }, { at: new Date(1) })).toBe(true)
    expect(sameValue({ at: new Date(1) }, { at: new Date(2) })).toBe(false)
  })

  it('does not mistake a map for the class that has the same fields', () => {
    // A stored map `{ latitude, longitude }` is a map. Reading it as a GeoPoint
    // would make two different stored values compare equal.
    const asMap = { at: { latitude: 1, longitude: 2 } }
    const asGeoPoint = {
      at: Object.assign(Object.create({ kind: 'geopoint' }), { latitude: 1, longitude: 2 }),
    }
    expect(sameValue(asMap, asGeoPoint)).toBe(false)
  })

  it('refuses a value it cannot name, instead of guessing at one', () => {
    // Nothing a Firestore read produces lands here; a future stored type, or a
    // value put in by something else, would. The compare must not claim such a
    // document is unchanged — a no-op costs a retry, an overwrite costs the
    // child's history.
    // No parameter properties: `erasableSyntaxOnly` forbids them repo-wide.
    class Mystery {
      inner: number
      constructor(inner: number) {
        this.inner = inner
      }
    }
    const withMystery = { ...SAVED, oddField: new Mystery(1) }
    expect(canonicalProgressValue(withMystery).opaque).toBe(true)
    expect(sameValue(withMystery, withMystery)).toBe(false)
    expect(sameValue(withMystery, { ...SAVED, oddField: new Mystery(1) })).toBe(false)
    // The TOKEN stays deterministic even so, because a signature that changed
    // on every reconcile would re-issue a write that can never commit.
    expect(canonicalToken(withMystery)).toBe(canonicalToken({ ...SAVED, oddField: new Mystery(1) }))
    // A document with no such value is unaffected.
    expect(canonicalProgressValue(SAVED).opaque).toBe(false)
  })

  it('stays finite on a structure that points at itself', () => {
    // A generic walk hangs or throws here. Depth-bounded, it answers — with a
    // refusal, which is the safe answer.
    const cyclic: Record<string, unknown> = { a: 1 }
    cyclic.self = cyclic
    const identity = canonicalProgressValue({ ...SAVED, oddField: cyclic })
    expect(typeof identity.token).toBe('string')
    expect(identity.opaque).toBe(true)
  })
})

describe('the dedup signature and the compare are one function', () => {
  it('prints the same token for the same document, however it was built', () => {
    expect(canonicalToken({ a: 1, b: { c: 2, d: [3, 4] } })).toBe(
      canonicalToken({ b: { d: [3, 4], c: 2 }, a: 1 }),
    )
    expect(canonicalToken(SAVED)).toBe(canonicalToken({ ...SAVED }))
  })

  it('still distinguishes documents that differ', () => {
    expect(canonicalToken(SAVED)).not.toBe(canonicalToken(AHEAD))
    expect(canonicalToken([1, 2])).not.toBe(canonicalToken([2, 1]))
    expect(canonicalToken(null)).not.toBe(canonicalToken(undefined))
  })

  it('agrees with the compare on every document in this file', () => {
    // The property that matters: the dedup signature and the compare-and-set
    // can never answer "is this the document I read" differently.
    const docs: StonebridgeProgress[] = [
      SAVED,
      { ...SAVED },
      AHEAD,
      PROPOSAL,
      { ...SAVED, updatedAt: 'later' },
    ]
    docs.forEach((left) =>
      docs.forEach((right) => {
        expect(progressDocsEqual(left, right)).toBe(canonicalToken(left) === canonicalToken(right))
      }),
    )
  })
})

describe('create-if-absent', () => {
  /** The shape `initialStonebridgeProgress` builds — `activeProgress` and all. */
  const initial: StonebridgeProgress = {
    childId: LINCOLN,
    currentMissionId: 'old_bridge',
    activeProgress: null,
    completedMissions: [],
    raisedBanners: [],
    missionBaselines: { old_bridge: 7 },
    updatedAt: '2026-10-28T10:00:00.000Z',
  }

  it('writes the baseline, unchanged, while the document is absent', async () => {
    const result = await createStonebridgeProgressIfAbsent({
      familyId: FAM,
      childId: LINCOLN,
      initial,
    })

    expect(result).toEqual({ outcome: 'created', doc: initial })
    expect(fx.committed).toEqual([{ path: PATH, payload: initial }])
    // Byte for byte what the caller computed: this module does no math.
    expect(fx.stored.get(PATH)).toEqual(initial)
  })

  it('writes NOTHING over a village another client already built', async () => {
    store(AHEAD)

    const result = await createStonebridgeProgressIfAbsent({
      familyId: FAM,
      childId: LINCOLN,
      initial,
    })

    expect(result).toEqual({ outcome: 'exists', doc: AHEAD })
    expect(fx.committed).toEqual([])
    // The completion, the banner and the baselines are untouched.
    expect(fx.stored.get(PATH)).toEqual(AHEAD)
  })
})

describe('compare-and-set advance', () => {
  it('commits while the stored document still equals the source', async () => {
    store(SAVED)

    const result = await advanceStonebridgeProgressIfUnchanged({
      familyId: FAM,
      childId: LINCOLN,
      source: SAVED,
      next: PROPOSAL,
    })

    expect(result).toEqual({ outcome: 'advanced', doc: PROPOSAL })
    expect(fx.stored.get(PATH)).toEqual(PROPOSAL)
  })

  it('commits when the source differs from the stored document only in key order', async () => {
    store({
      ...SAVED,
      missionBaselines: { library_hut: 11, watchtower: 5, old_bridge: 0 },
    })

    const result = await advanceStonebridgeProgressIfUnchanged({
      familyId: FAM,
      childId: LINCOLN,
      source: SAVED,
      next: PROPOSAL,
    })

    expect(result.outcome).toBe('advanced')
  })

  it('refuses, and writes nothing, once the stored document has moved on', async () => {
    store(AHEAD)

    const result = await advanceStonebridgeProgressIfUnchanged({
      familyId: FAM,
      childId: LINCOLN,
      source: SAVED,
      next: { ...SAVED, currentMissionId: 'library_hut', updatedAt: 'later' },
    })

    expect(result).toEqual({ outcome: 'conflict', doc: AHEAD })
    expect(fx.committed).toEqual([])
    expect(fx.stored.get(PATH)).toEqual(AHEAD)
  })

  it('carries a field it has never heard of through, and compares on it', async () => {
    const unknownField = { note: 'kept', list: [1, 2] }
    const stored = { ...SAVED, fromAnotherClient: unknownField } as StonebridgeProgress
    store(stored)
    // `advanceMissions` spreads the source document, so the proposal carries
    // the field too. Nothing here reads it, strips it or rewrites it.
    const next = {
      ...stored,
      currentMissionId: 'the_forge',
      updatedAt: '2026-10-28T10:00:00.000Z',
    } as StonebridgeProgress

    const result = await advanceStonebridgeProgressIfUnchanged({
      familyId: FAM,
      childId: LINCOLN,
      source: stored,
      next,
    })

    expect(result.outcome).toBe('advanced')
    expect(fx.stored.get(PATH)).toEqual(next)
    expect((fx.stored.get(PATH) as Stored).fromAnotherClient).toEqual(unknownField)
  })

  it('refuses when the stored document has a field the source did not', async () => {
    // The newer client added something. That document is not the one this
    // proposal was computed from, whatever the fields in common say.
    store({ ...SAVED, fromAnotherClient: { note: 'new' } } as StonebridgeProgress)

    const result = await advanceStonebridgeProgressIfUnchanged({
      familyId: FAM,
      childId: LINCOLN,
      source: SAVED,
      next: PROPOSAL,
    })

    expect(result.outcome).toBe('conflict')
    expect(fx.committed).toEqual([])
  })

  it('refuses a document that moved only by its stamp — the compare is content, not order', async () => {
    // Nothing here reads `updatedAt` as an ordering: a stamp that differs is a
    // document that differs, and the caller re-reads rather than guessing which
    // of two clocks ran first.
    store({ ...SAVED, updatedAt: '2026-10-27T23:59:59.000Z' })

    const result = await advanceStonebridgeProgressIfUnchanged({
      familyId: FAM,
      childId: LINCOLN,
      source: SAVED,
      next: PROPOSAL,
    })

    expect(result.outcome).toBe('conflict')
    expect(fx.committed).toEqual([])
  })

  it('reports an absent document and creates nothing in its place', async () => {
    const result = await advanceStonebridgeProgressIfUnchanged({
      familyId: FAM,
      childId: LINCOLN,
      source: SAVED,
      next: PROPOSAL,
    })

    // Missing where a document was expected is NOT permission to recreate it.
    expect(result).toEqual({ outcome: 'absent' })
    expect(fx.committed).toEqual([])
    expect(fx.stored.has(PATH)).toBe(false)
  })

  it('commits an identical update — a re-attempt of the same work is not a conflict', async () => {
    store(SAVED)

    const result = await advanceStonebridgeProgressIfUnchanged({
      familyId: FAM,
      childId: LINCOLN,
      source: SAVED,
      next: SAVED,
    })

    expect(result).toEqual({ outcome: 'advanced', doc: SAVED })
    expect(fx.stored.get(PATH)).toEqual(SAVED)
  })

  /**
   * The replay. Firestore commits the LAST attempt, so the answer has to come
   * from the last attempt — an answer carried out of an earlier one would
   * describe a write that was discarded.
   */
  it('answers from the attempt that committed, not from an earlier one', async () => {
    store(SAVED)
    fx.attemptsPerTransaction = 2
    // The document moves under the transaction between attempts: attempt 1
    // would have committed, attempt 2 must refuse.
    fx.onAttempt = (attempt: number) => {
      if (attempt === 2) store(AHEAD)
    }

    const result = await advanceStonebridgeProgressIfUnchanged({
      familyId: FAM,
      childId: LINCOLN,
      source: SAVED,
      next: PROPOSAL,
    })

    expect(fx.attempts).toBe(2)
    // A no-op, which the caller may never celebrate…
    expect(result).toEqual({ outcome: 'conflict', doc: AHEAD })
    // …and nothing was written, from either attempt.
    expect(fx.committed).toEqual([])
    expect(fx.stored.get(PATH)).toEqual(AHEAD)
  })

  it('commits from the final attempt when THAT is the one that matches', async () => {
    store(AHEAD)
    fx.attemptsPerTransaction = 2
    // The other way round: the first attempt would have refused, and the
    // document comes back to the source before the attempt that commits.
    fx.onAttempt = (attempt: number) => {
      if (attempt === 2) store(SAVED)
    }

    const result = await advanceStonebridgeProgressIfUnchanged({
      familyId: FAM,
      childId: LINCOLN,
      source: SAVED,
      next: PROPOSAL,
    })

    expect(fx.attempts).toBe(2)
    expect(result).toEqual({ outcome: 'advanced', doc: PROPOSAL })
    expect(fx.committed).toEqual([{ path: PATH, payload: PROPOSAL }])
    expect(fx.stored.get(PATH)).toEqual(PROPOSAL)
  })
})
