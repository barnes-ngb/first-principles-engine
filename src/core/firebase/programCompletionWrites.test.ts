import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A fake Firestore with REAL transaction semantics, built for the two things a
 * single-pass mock cannot show:
 *
 *   1. **Contention.** `store.bumpOnNextRead` lets a test commit a conflicting
 *      write between the callback's first read and its commit, exactly as
 *      another device would. The callback is then re-run against the newer
 *      document — which is the whole claim these writers make.
 *   2. **Read-before-write.** The transaction refuses a `get` after a `set`, so
 *      a writer that ordered its reads wrongly fails here instead of in
 *      production.
 */
class FakeStore {
  docs = new Map<string, Record<string, unknown>>()
  /**
   * A conflicting write, committed by "another device" AFTER the given number of
   * reads in a transaction attempt — then cleared, so the retry sees a settled
   * world. Positioning it after a specific read is what lets a test make the
   * callback read a document and THEN have it change, which is the only way to
   * prove the retry rather than assume it.
   */
  interleave: { afterReads: number; run: () => void } | null = null
  attempts = 0
  writes: Array<{ path: string; data: Record<string, unknown>; merge: boolean }> = []

  set(path: string, data: Record<string, unknown>) {
    this.docs.set(path, data)
  }
  get(path: string): Record<string, unknown> | undefined {
    return this.docs.get(path)
  }
}

const store = new FakeStore()

vi.mock('firebase/firestore', () => ({
  doc: (col: { __path: string }, id: string) => ({ path: `${col.__path}/${id}` }),
  getDoc: async (ref: { path: string }) => snapOf(ref.path),
  getDocs: async (q: { __docs: Array<Record<string, unknown>> }) => ({
    empty: q.__docs.length === 0,
    docs: q.__docs.map((d) => ({ id: String(d.id ?? ''), data: () => d })),
  }),
  query: (col: { __path: string }, ...clauses: Array<(d: Record<string, unknown>) => boolean>) => ({
    __docs: [...store.docs.entries()]
      .filter(([path]) => path.startsWith(`${col.__path}/`))
      .map(([, d]) => d)
      .filter((d) => clauses.every((c) => c(d))),
  }),
  where: (field: string, _op: string, value: unknown) => (d: Record<string, unknown>) =>
    d[field] === value,
  runTransaction: async (
    _db: unknown,
    fn: (tx: {
      get: (ref: { path: string }) => Promise<ReturnType<typeof snapOf>>
      set: (ref: { path: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) => void
    }) => unknown,
  ) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      store.attempts += 1
      const staged: Array<{ path: string; data: Record<string, unknown>; merge: boolean }> = []
      let wrote = false
      let reads = 0
      const readVersions = new Map<string, string>()
      const out = await fn({
        get: async (ref) => {
          if (wrote) throw new Error('transaction read after write')
          reads += 1
          readVersions.set(ref.path, JSON.stringify(store.get(ref.path) ?? null))
          const snap = snapOf(ref.path)
          if (store.interleave && reads >= store.interleave.afterReads) {
            const { run } = store.interleave
            store.interleave = null
            run()
          }
          return snap
        },
        set: (ref, data, opts) => {
          wrote = true
          staged.push({ path: ref.path, data, merge: Boolean(opts?.merge) })
        },
      })
      // Commit only if nothing read has changed since it was read.
      const stale = [...readVersions.entries()].some(
        ([path, seen]) => JSON.stringify(store.get(path) ?? null) !== seen,
      )
      if (stale) continue // re-run the callback against the newer document
      for (const w of staged) {
        const prev = w.merge ? (store.get(w.path) ?? {}) : {}
        store.set(w.path, { ...prev, ...w.data })
        store.writes.push(w)
      }
      return out
    }
    throw new Error('transaction failed after retries')
  },
}))

function snapOf(path: string) {
  const data = store.get(path)
  return {
    exists: () => data !== undefined,
    data: () => data,
    id: path.split('/').pop() ?? '',
  }
}

vi.mock('./firestore', () => ({
  db: {},
  learnerModelsCollection: () => ({ __path: 'learnerModels' }),
  nativeProgressObservationsCollection: () => ({ __path: 'nativeProgress' }),
  nativeProgressCorrectionMarkersCollection: () => ({ __path: 'markers' }),
  programCompletionEventsCollection: () => ({ __path: 'events' }),
  programCompletionStateCollection: () => ({ __path: 'state' }),
}))

import { runTransaction } from 'firebase/firestore'
import type { Transaction } from 'firebase/firestore'

import {
  PROGRAM_COMPLETION_ALREADY_ACTIVE,
  PROGRAM_COMPLETION_CITATION_CHANGED,
  PROGRAM_COMPLETION_REPORT_CORRECTED,
  PROGRAM_COMPLETION_REPORT_NOT_ELIGIBLE,
  PROGRAM_COMPLETION_TOO_MANY_EVENTS,
  ProgramCompletionRefused,
  applyProgramCompletionProjection,
  confirmProgramCompletion,
  planCompletionRevokeForCorrection,
  withdrawProgramCompletion,
} from './programCompletionWrites'
import {
  COMPLETION_WITHDRAWAL_CEILING,
  MAX_CLAIMING_COMPLETION_EVENTS,
  MAX_COMPLETION_EVENTS,
} from '../types/programCompletion'
import { FAST_PHONICS_COMPLETION_CONCEPT_IDS } from '../foundations/fastPhonicsCompletion'

const FAMILY = 'f1'
const CHILD = 'c1'
const CVC = 'reading.phonics.cvc'
const KEY = 'draft-key-0001'
const NOW = '2026-10-17T12:00:00.000Z'

function seedModel(extra: Record<string, unknown> = {}) {
  store.set(`learnerModels/${CHILD}`, {
    childId: CHILD,
    status: 'seeded',
    conceptStates: {},
    changeFeed: [],
    openQuestions: [],
    modalityCalibration: {},
    seededAt: NOW,
    updatedAt: NOW,
    ...extra,
  })
}

function seedReport(id = `${CHILD}__r1`, over: Record<string, unknown> = {}) {
  store.set(`nativeProgress/${id}`, {
    id,
    childId: CHILD,
    program: 'fastPhonics',
    nativeNumber: 20,
    meaning: 'completedThrough',
    observedOn: '2026-09-30',
    source: 'programReport',
    recordedAt: NOW,
    entryKey: 'r1-entry-key',
    ...over,
  })
  return id
}

const confirm = (over: Record<string, unknown> = {}, entryKey = KEY) =>
  confirmProgramCompletion({
    familyId: FAMILY,
    childId: CHILD,
    program: 'fastPhonics',
    entryKey,
    completion: {
      observedOn: '2026-10-01',
      source: 'programReport',
      ...over,
    },
    recordedAt: NOW,
    today: '2026-10-17',
  } as Parameters<typeof confirmProgramCompletion>[0])

beforeEach(() => {
  store.docs.clear()
  store.writes = []
  store.attempts = 0
  store.interleave = null
})

describe('confirmProgramCompletion', () => {
  it('records the act, the projection and the coverage in one transaction', async () => {
    seedModel()
    const result = await confirm()
    expect(result.applied).toBe(true)
    expect(result.applicationPending).toBe(false)
    expect(result.conceptIds.sort()).toEqual([...FAST_PHONICS_COMPLETION_CONCEPT_IDS].sort())

    const event = store.get(`events/${CHILD}__fastPhonics__${KEY}`)
    expect(event?.kind).toBe('confirm')
    const state = store.get(`state/${CHILD}__fastPhonics`)
    expect(state?.activeEntryKey).toBe(KEY)
    const model = store.get(`learnerModels/${CHILD}`) as {
      conceptStates: Record<string, { state: string; evidence: Array<{ observedAt: string }> }>
    }
    expect(model.conceptStates[CVC].state).toBe('forming')
    // The OBSERVED day, not the save clock.
    expect(model.conceptStates[CVC].evidence[0].observedAt).toBe('2026-10-01T00:00:00.000Z')
  })

  it('needs no numeric report at all', async () => {
    seedModel()
    const result = await confirm()
    const state = store.get(`state/${CHILD}__fastPhonics`) as {
      activeAssertion: { reportObservationId?: string; assistance: string; reportedProgramVersion: string }
    }
    expect(result.applied).toBe(true)
    expect(state.activeAssertion.reportObservationId).toBeUndefined()
    expect(state.activeAssertion.assistance).toBe('unknown')
    expect(state.activeAssertion.reportedProgramVersion).toBe('unknown')
  })

  it('refuses an invalid source or assistance before any write', async () => {
    seedModel()
    await expect(confirm({ source: 'telepathy' })).rejects.toBeInstanceOf(
      ProgramCompletionRefused,
    )
    await expect(confirm({ assistance: 'maybe' })).rejects.toBeInstanceOf(
      ProgramCompletionRefused,
    )
    expect(store.writes).toHaveLength(0)
  })

  it('accepts a final-peak completedThrough citation and refuses anything else', async () => {
    seedModel()
    const good = seedReport()
    const result = await confirm({ reportObservationId: good })
    expect(result.applied).toBe(true)

    // A SECOND confirmation is a new act: its own draft key, and the first one
    // withdrawn from the record (a new key while one is active is refused for
    // its own reason, which is not the one under test here).
    store.docs.delete(`state/${CHILD}__fastPhonics`)
    const workingOn = seedReport(`${CHILD}__r2`, { meaning: 'workingOn' })
    await expect(
      confirm({ reportObservationId: workingOn }, 'draft-key-0002'),
    ).rejects.toThrow(PROGRAM_COMPLETION_REPORT_NOT_ELIGIBLE)
    const tooBig = seedReport(`${CHILD}__r3`, { nativeNumber: 24 })
    await expect(
      confirm({ reportObservationId: tooBig }, 'draft-key-0003'),
    ).rejects.toThrow(PROGRAM_COMPLETION_REPORT_NOT_ELIGIBLE)
  })

  it('refuses a RETRY whose citation disagrees with the stored confirmation', async () => {
    // The same key re-sent with a different citation is not a retry of what was
    // confirmed. Re-confirming against another entry is a new act.
    const cited = seedReport()
    await confirm({ reportObservationId: cited })
    const other = seedReport(`${CHILD}__r4`)
    await expect(confirm({ reportObservationId: other })).rejects.toThrow(
      PROGRAM_COMPLETION_CITATION_CHANGED,
    )
  })

  it('a same-key retry checks the STORED citation, even when the caller omits one', async () => {
    // The independent review's countertest. A pending confirmation cites a row;
    // a correction written before markers existed supersedes that row; the retry
    // arrives with no citation at all. The record is what was CONFIRMED, so the
    // stored citation is what gets checked — and the legacy correction needs the
    // query, which has to run against it.
    const cited = seedReport()
    const first = await confirm({ reportObservationId: cited })
    expect(first.applicationPending).toBe(true)
    store.set(`nativeProgress/${CHILD}__legacy`, {
      id: `${CHILD}__legacy`,
      childId: CHILD,
      program: 'fastPhonics',
      nativeNumber: 19,
      meaning: 'workingOn',
      observedOn: '2026-10-02',
      source: 'parentReport',
      recordedAt: NOW,
      entryKey: 'legacy-entry-key',
      correctsObservationId: cited,
    })
    seedModel()
    await expect(confirm()).rejects.toThrow(PROGRAM_COMPLETION_REPORT_CORRECTED)
    // Nothing was applied: the model carries no coverage from the pending act.
    const model = store.get(`learnerModels/${CHILD}`) as {
      conceptStates: Record<string, unknown>
    }
    expect(model.conceptStates[CVC]).toBeUndefined()
  })

  it('refuses a citation whose row was ALREADY corrected — legacy row, no marker', async () => {
    seedModel()
    const cited = seedReport()
    // A correction written before markers existed: only the descendant row.
    store.set(`nativeProgress/${CHILD}__r9`, {
      id: `${CHILD}__r9`,
      childId: CHILD,
      program: 'fastPhonics',
      nativeNumber: 12,
      meaning: 'completedThrough',
      observedOn: '2026-10-02',
      source: 'parentReport',
      recordedAt: NOW,
      entryKey: 'r9-entry-key',
      correctsObservationId: cited,
    })
    await expect(confirm({ reportObservationId: cited })).rejects.toThrow(
      PROGRAM_COMPLETION_REPORT_CORRECTED,
    )
    expect(store.writes).toHaveLength(0)
  })

  it('refuses a citation corrected CONCURRENTLY — the marker lands mid-transaction', async () => {
    seedModel()
    const cited = seedReport()
    // After the first read, and before the marker is read.
    store.interleave = {
      afterReads: 1,
      run: () => {
        store.set(`markers/${cited}`, {
          id: cited,
          childId: CHILD,
          correctionObservationId: `${CHILD}__r9`,
          correctionEntryKey: 'r9-entry-key',
          correctedAt: NOW,
        })
      },
    }
    await expect(confirm({ reportObservationId: cited })).rejects.toThrow(
      PROGRAM_COMPLETION_REPORT_CORRECTED,
    )
    expect(store.get(`state/${CHILD}__fastPhonics`)).toBeUndefined()
  })

  it('refuses a correction marker even when the replacement still says peak 20', async () => {
    seedModel()
    const cited = seedReport()
    store.set(`markers/${cited}`, {
      id: cited,
      childId: CHILD,
      correctionObservationId: `${CHILD}__r8`,
      correctionEntryKey: 'r8-entry-key',
      correctedAt: NOW,
    })
    seedReport(`${CHILD}__r8`, { correctsObservationId: cited })
    await expect(confirm({ reportObservationId: cited })).rejects.toThrow(
      PROGRAM_COMPLETION_REPORT_CORRECTED,
    )
  })

  it('is idempotent on the same entry key, and refuses a NEW key while one is active', async () => {
    seedModel()
    await confirm()
    const again = await confirm()
    expect(again.alreadyRecorded).toBe(true)
    const model = store.get(`learnerModels/${CHILD}`) as {
      conceptStates: Record<string, { evidence: unknown[] }>
    }
    expect(model.conceptStates[CVC].evidence).toHaveLength(1)

    await expect(
      confirmProgramCompletion({
        familyId: FAMILY,
        childId: CHILD,
        program: 'fastPhonics',
        entryKey: 'draft-key-0002',
        completion: { observedOn: '2026-10-02', source: 'parentReport' },
        recordedAt: NOW,
        today: '2026-10-17',
      }),
    ).rejects.toThrow(PROGRAM_COMPLETION_ALREADY_ACTIVE)
  })

  it('records the act and reports application PENDING when there is no model', async () => {
    const result = await confirm()
    expect(result.applied).toBe(false)
    expect(result.applicationPending).toBe(true)
    expect(store.get(`events/${CHILD}__fastPhonics__${KEY}`)).toBeDefined()
    expect(store.get(`learnerModels/${CHILD}`)).toBeUndefined()
    const state = store.get(`state/${CHILD}__fastPhonics`) as { projection: { status: string } }
    expect(state.projection.status).toBe('pending')

    // ...and the retry finishes it once a model exists.
    seedModel()
    const retry = await applyProgramCompletionProjection({
      familyId: FAMILY,
      childId: CHILD,
      program: 'fastPhonics',
      expectedEntryKey: KEY,
      recordedAt: NOW,
    })
    expect(retry.applied).toBe(true)
    const model = store.get(`learnerModels/${CHILD}`) as {
      conceptStates: Record<string, { state: string }>
    }
    expect(model.conceptStates[CVC].state).toBe('forming')
  })

  it('re-runs against a model written mid-transaction and keeps the newer evidence', async () => {
    seedModel()
    // After the model has been READ — so the callback has the old copy in hand
    // when the eval lands, which is the lost-update window this closes.
    store.interleave = {
      afterReads: 3,
      run: () => {
        store.set(`learnerModels/${CHILD}`, {
          childId: CHILD,
          status: 'seeded',
          conceptStates: {
            [CVC]: {
              state: 'frontier',
              evidence: [
                {
                  kind: 'eval',
                  sourceId: 'sess-9',
                  note: 'guided eval',
                  observedAt: '2026-10-16T00:00:00.000Z',
                  readState: 'frontier',
                },
              ],
            },
          },
          changeFeed: [],
          openQuestions: [],
          modalityCalibration: {},
          seededAt: NOW,
          updatedAt: '2026-10-16T00:00:00.000Z',
        })
      },
    }
    await confirm()
    expect(store.attempts).toBeGreaterThan(1)
    const model = store.get(`learnerModels/${CHILD}`) as {
      conceptStates: Record<string, { state: string; evidence: Array<{ kind: string }> }>
    }
    // The eval survives, and governs: the completion records evidence only.
    const kinds = model.conceptStates[CVC].evidence.map((e) => e.kind)
    expect(kinds).toContain('eval')
    expect(kinds).toContain('programCompletionCoverage')
    expect(model.conceptStates[CVC].state).toBe('frontier')
  })

  it('writes no hours, XP or skill snapshot', async () => {
    seedModel()
    await confirm()
    for (const w of store.writes) {
      expect(w.path).not.toMatch(/hours|xp|skillSnapshot|days|activityConfig/i)
    }
  })
})

describe('withdrawProgramCompletion and the apply retry', () => {
  it('withdraws, supersedes its own refs and reverts its own promotion', async () => {
    seedModel()
    await confirm()
    const result = await withdrawProgramCompletion({
      familyId: FAMILY,
      childId: CHILD,
      program: 'fastPhonics',
      entryKey: 'withdraw-key-001',
      withdrawsEntryKey: KEY,
      reason: 'notComplete',
      recordedAt: NOW,
    })
    expect(result.state.activeEntryKey).toBeNull()
    const model = store.get(`learnerModels/${CHILD}`) as {
      conceptStates: Record<string, { state: string; evidence: Array<{ status?: string }> }>
    }
    expect(model.conceptStates[CVC].state).toBe('not-yet')
    expect(model.conceptStates[CVC].evidence.every((e) => e.status === 'superseded')).toBe(true)
    expect(store.get(`events/${CHILD}__fastPhonics__withdraw-key-001`)).toBeDefined()
  })

  it('refuses a stale correction naming a confirmation that is no longer active', async () => {
    seedModel()
    await confirm()
    await withdrawProgramCompletion({
      familyId: FAMILY,
      childId: CHILD,
      program: 'fastPhonics',
      entryKey: 'withdraw-key-001',
      withdrawsEntryKey: KEY,
      reason: 'mistake',
      recordedAt: NOW,
    })
    await expect(
      withdrawProgramCompletion({
        familyId: FAMILY,
        childId: CHILD,
        program: 'fastPhonics',
        entryKey: 'withdraw-key-002',
        withdrawsEntryKey: KEY,
        reason: 'mistake',
        recordedAt: NOW,
      }),
    ).rejects.toBeInstanceOf(ProgramCompletionRefused)
  })

  it('is idempotent on the withdrawal key — a repeat tap is a retry', async () => {
    seedModel()
    await confirm()
    const args = {
      familyId: FAMILY,
      childId: CHILD,
      program: 'fastPhonics' as const,
      entryKey: 'withdraw-key-001',
      withdrawsEntryKey: KEY,
      reason: 'partial' as const,
      recordedAt: NOW,
    }
    await withdrawProgramCompletion(args)
    const again = await withdrawProgramCompletion(args)
    expect(again.alreadyRecorded).toBe(true)
  })

  it('a pending application REVALIDATES its stored source before applying', async () => {
    const cited = seedReport()
    await confirm({ reportObservationId: cited })
    // The citation is corrected while the application is still pending.
    store.set(`markers/${cited}`, {
      id: cited,
      childId: CHILD,
      correctionObservationId: `${CHILD}__r9`,
      correctionEntryKey: 'r9-entry-key',
      correctedAt: NOW,
    })
    seedModel()
    await expect(
      applyProgramCompletionProjection({
        familyId: FAMILY,
        childId: CHILD,
        program: 'fastPhonics',
        expectedEntryKey: KEY,
        recordedAt: NOW,
      }),
    ).rejects.toThrow(PROGRAM_COMPLETION_REPORT_CORRECTED)
    const model = store.get(`learnerModels/${CHILD}`) as { conceptStates: Record<string, unknown> }
    expect(model.conceptStates[CVC]).toBeUndefined()
  })

  it('never rewrites the reapply act a repeat repair reuses', async () => {
    // The reviewer's red fixture. The reapply event id is deterministic, so a
    // SECOND repair at the same mapping version addresses the same document —
    // writing it blind moved the `recordedAt` of an act that had happened, and
    // left `eventCount` / `lastEventAt` disagreeing with the history.
    seedModel()
    await confirm()
    const eventPath = `events/${CHILD}__fastPhonics__${KEY}-v1`
    const statePath = `state/${CHILD}__fastPhonics`
    /** A ref goes missing under the model — the graph repair this button is for. */
    const loseARef = () => {
      const model = store.get(`learnerModels/${CHILD}`) as {
        conceptStates: Record<string, { evidence: unknown[] }>
      }
      model.conceptStates[CVC].evidence = []
      store.set(`learnerModels/${CHILD}`, model as unknown as Record<string, unknown>)
    }

    loseARef()
    const first = await applyProgramCompletionProjection({
      familyId: FAMILY,
      childId: CHILD,
      program: 'fastPhonics',
      recordedAt: '2026-10-17T13:00:00.000Z',
    })
    expect(first.alreadyRecorded).toBe(false)
    expect(first.applied).toBe(true)
    const recordedAt = (store.get(eventPath) as { recordedAt: string }).recordedAt
    expect(recordedAt).toBe('2026-10-17T13:00:00.000Z')
    const eventCount = (store.get(statePath) as { eventCount: number }).eventCount
    const lastEventAt = (store.get(statePath) as { lastEventAt: string }).lastEventAt

    loseARef()
    const second = await applyProgramCompletionProjection({
      familyId: FAMILY,
      childId: CHILD,
      program: 'fastPhonics',
      recordedAt: '2026-10-17T14:00:00.000Z',
    })
    // The act is the FIRST one, byte-for-byte...
    expect((store.get(eventPath) as { recordedAt: string }).recordedAt).toBe(recordedAt)
    expect(second.event?.recordedAt).toBe(recordedAt)
    // ...no second act was counted or dated...
    expect((store.get(statePath) as { eventCount: number }).eventCount).toBe(eventCount)
    expect((store.get(statePath) as { lastEventAt: string }).lastEventAt).toBe(lastEventAt)
    // ...and the coverage WAS restored, so this is not reported as a no-op.
    expect(second.alreadyRecorded).toBe(false)
    expect(second.applied).toBe(true)
    const model = store.get(`learnerModels/${CHILD}`) as {
      conceptStates: Record<string, { evidence: unknown[] }>
    }
    expect(model.conceptStates[CVC].evidence).toHaveLength(1)
  })

  it('a withdrawal with no model to update stays PENDING, not finished', async () => {
    // Review item 2: the stored status says `withdrawalPending`, so a result
    // claiming nothing is outstanding contradicts the record.
    seedModel()
    await confirm()
    store.docs.delete(`learnerModels/${CHILD}`)
    const withdrawn = await withdrawProgramCompletion({
      familyId: FAMILY,
      childId: CHILD,
      program: 'fastPhonics',
      entryKey: 'withdraw-key-001',
      withdrawsEntryKey: KEY,
      reason: 'notComplete',
      recordedAt: NOW,
    })
    expect(withdrawn.applicationPending).toBe(true)
    const retry = await applyProgramCompletionProjection({
      familyId: FAMILY,
      childId: CHILD,
      program: 'fastPhonics',
      recordedAt: NOW,
    })
    expect(retry.applied).toBe(false)
    expect(retry.applicationPending).toBe(true)
    expect(
      (store.get(`state/${CHILD}__fastPhonics`) as { projection: { status: string } })
        .projection.status,
    ).toBe('withdrawalPending')
  })

  it('refuses to apply when the stored citation is not the one that was prechecked', async () => {
    // Review item 7: the markerless-correction query ran before the transaction
    // about the citation the state carried THEN. If another confirmation became
    // active in between, applying would rest coverage on an unchecked source.
    const cited = seedReport()
    seedModel()
    await confirm({ reportObservationId: cited })
    store.interleave = {
      afterReads: 0,
      run: () => {
        const state = store.get(`state/${CHILD}__fastPhonics`) as {
          activeAssertion: { reportObservationId: string }
        }
        state.activeAssertion.reportObservationId = `${CHILD}__r7`
        store.set(
          `state/${CHILD}__fastPhonics`,
          state as unknown as Record<string, unknown>,
        )
      },
    }
    await expect(
      applyProgramCompletionProjection({
        familyId: FAMILY,
        childId: CHILD,
        program: 'fastPhonics',
        recordedAt: NOW,
      }),
    ).rejects.toBeInstanceOf(ProgramCompletionRefused)
  })

  it('re-applying at the same version writes nothing new', async () => {
    seedModel()
    await confirm()
    const before = store.writes.length
    const again = await applyProgramCompletionProjection({
      familyId: FAMILY,
      childId: CHILD,
      program: 'fastPhonics',
      expectedEntryKey: KEY,
      recordedAt: NOW,
    })
    expect(again.alreadyRecorded).toBe(true)
    expect(store.writes.length).toBe(before)
  })
})

/**
 * The capacity bound must never cost a parent the undo (finding 4303871053).
 *
 * The bound was spent first-come-first-served, so the fiftieth slot could go to
 * a CONFIRMATION: the claim then stood on the learner model, raising concepts,
 * and the withdrawal that would take it back was refused for being the
 * fifty-first act. The old sequence that reached it was ordinary — a confirm, a
 * same-version re-apply and a withdrawal (three acts), then twenty-three
 * confirm/withdraw pairs (forty-nine), and the fiftieth act was accepted as a
 * standing claim.
 *
 * The rule under test is one sentence: **accepting a confirmation, or a
 * re-apply that keeps one, must never remove the ability to withdraw it.**
 */
describe('event capacity — the withdrawal slot is reserved', () => {
  const statePath = `state/${CHILD}__fastPhonics`

  /** A record with a history behind it and nothing in force — the usual shape. */
  function seedInactiveStateAt(eventCount: number) {
    store.set(statePath, {
      id: `${CHILD}__fastPhonics`,
      childId: CHILD,
      program: 'fastPhonics',
      activeEntryKey: null,
      activeAssertion: null,
      activeConfirmedAt: null,
      activeMappingVersion: null,
      projection: { status: 'withdrawn' },
      eventCount,
      lastEventAt: NOW,
      sourceConflict: null,
      updatedAt: NOW,
    })
  }

  /**
   * Age a REAL record's counter — how a document written before the reserve
   * existed is reproduced without faking its coverage or its history.
   */
  function setEventCount(eventCount: number) {
    store.set(statePath, { ...(store.get(statePath) ?? {}), eventCount })
  }

  /**
   * Age an APPLIED record's coverage to an EARLIER reviewed map version — how a
   * record confirmed before a re-curation is reproduced. Only the version the
   * projection records moves; the refs on the model are the real ones the
   * confirmation wrote, which is what makes the upgrade a genuine new act.
   */
  function setAppliedMappingVersion(version: number) {
    const state = (store.get(statePath) ?? {}) as Record<string, unknown> & {
      projection?: Record<string, unknown>
    }
    store.set(statePath, {
      ...state,
      projection: { ...(state.projection ?? {}), appliedMappingVersion: version },
    })
  }

  const historyPaths = () => [...store.docs.keys()].filter((p) => p.startsWith('events/'))

  const countOf = () => (store.get(statePath) as { eventCount: number }).eventCount
  const stateDoc = () =>
    store.get(statePath) as {
      eventCount: number
      activeEntryKey: string | null
      projection: { status: string }
      sourceConflict?: { correctedByObservationId: string } | null
    }
  const conceptOf = () =>
    (
      store.get(`learnerModels/${CHILD}`) as {
        conceptStates: Record<
          string,
          { state: string; evidence: Array<{ kind: string; status?: string }> }
        >
      }
    ).conceptStates[CVC]

  const withdraw = (
    entryKey: string,
    withdrawsEntryKey: string,
    reason: 'mistake' | 'notComplete' | 'partial' = 'mistake',
  ) =>
    withdrawProgramCompletion({
      familyId: FAMILY,
      childId: CHILD,
      program: 'fastPhonics',
      entryKey,
      withdrawsEntryKey,
      reason,
      recordedAt: NOW,
    })

  it('refuses a confirmation one short of the bound, in words and with ZERO writes', async () => {
    // The act that used to be accepted. Nothing is in force, so refusing costs
    // the parent nothing she cannot get back by correcting the record.
    seedModel()
    seedInactiveStateAt(MAX_CLAIMING_COMPLETION_EVENTS)
    store.writes = []

    await expect(confirm()).rejects.toThrow(PROGRAM_COMPLETION_TOO_MANY_EVENTS)
    expect(store.writes).toHaveLength(0)
    expect(store.get(`events/${CHILD}__fastPhonics__${KEY}`)).toBeUndefined()
    expect(countOf()).toBe(MAX_CLAIMING_COMPLETION_EVENTS)
    expect(stateDoc().activeEntryKey).toBeNull()
    // No coverage reached the model, so there is nothing stranded on it.
    expect(conceptOf()).toBeUndefined()
  })

  it('accepts the last claiming slot and still honours the withdrawal it reserved', async () => {
    seedModel()
    seedInactiveStateAt(MAX_CLAIMING_COMPLETION_EVENTS - 1)

    const confirmed = await confirm()
    expect(confirmed.applied).toBe(true)
    expect(countOf()).toBe(MAX_CLAIMING_COMPLETION_EVENTS)
    expect(conceptOf().state).toBe('forming')

    const undone = await withdraw('withdraw-key-001', KEY, 'notComplete')
    expect(undone.state.activeEntryKey).toBeNull()
    expect(countOf()).toBe(MAX_COMPLETION_EVENTS)
    expect(conceptOf().state).toBe('not-yet')
    expect(store.get(`events/${CHILD}__fastPhonics__withdraw-key-001`)).toBeDefined()

    // And the record is now full: the refusal lands on a NEW claim, which is
    // the only act it can land on without trapping anyone.
    await expect(confirm({}, 'draft-key-0002')).rejects.toThrow(
      PROGRAM_COMPLETION_TOO_MANY_EVENTS,
    )
  })

  it('cannot be driven, by any chain of real acts, into a claim it cannot withdraw', async () => {
    // The reported sequence, run for real: confirm/withdraw pairs until the
    // writer refuses. Whatever it refuses, the record must never be left
    // holding a confirmation with no capacity to end it.
    seedModel()
    let pairs = 0
    let refusal: string | null = null
    for (let i = 0; i < 40; i += 1) {
      const key = `chain-key-${String(i).padStart(4, '0')}`
      try {
        await confirm({}, key)
      } catch (err) {
        refusal = (err as Error).message
        break
      }
      // The claim is in force here — and the undo is never refused.
      await withdraw(`chain-wd-${String(i).padStart(4, '0')}`, key)
      expect(stateDoc().activeEntryKey).toBeNull()
      pairs += 1
    }

    expect(refusal).toBe(PROGRAM_COMPLETION_TOO_MANY_EVENTS)
    expect(pairs).toBe(MAX_COMPLETION_EVENTS / 2)
    expect(countOf()).toBe(MAX_COMPLETION_EVENTS)
    expect(stateDoc().activeEntryKey).toBeNull()

    // The history is whole: one document per counted act, none overwritten.
    const history = [...store.docs.keys()].filter((p) => p.startsWith('events/'))
    expect(history).toHaveLength(countOf())
  })

  it('lets a record already sitting AT the cap, with a live claim, be withdrawn', async () => {
    // The legacy state: written by the old rule, which let the fiftieth act be
    // a confirmation. Its coverage is real, so the recovery is the real undo —
    // not a reset, and not a rewrite of what is already recorded.
    seedModel()
    await confirm()
    setEventCount(MAX_COMPLETION_EVENTS)

    const undone = await withdraw('withdraw-key-001', KEY, 'notComplete')
    expect(undone.state.activeEntryKey).toBeNull()
    expect(conceptOf().state).toBe('not-yet')
    expect(conceptOf().evidence.every((e) => e.status === 'superseded')).toBe(true)
    // One act above the bound, which is exactly the headroom the ceiling names.
    expect(countOf()).toBe(COMPLETION_WITHDRAWAL_CEILING)
    // Both acts are still on the record — the recovery added history, took none.
    expect(store.get(`events/${CHILD}__fastPhonics__${KEY}`)).toBeDefined()
    expect(store.get(`events/${CHILD}__fastPhonics__withdraw-key-001`)).toBeDefined()
    // Still bounded: nothing new may be claimed on this record.
    await expect(confirm({}, 'draft-key-0002')).rejects.toThrow(
      PROGRAM_COMPLETION_TOO_MANY_EVENTS,
    )
  })

  it('still refuses past the recovery ceiling — the bound was reserved, not removed', async () => {
    seedModel()
    await confirm()
    setEventCount(COMPLETION_WITHDRAWAL_CEILING)
    store.writes = []

    await expect(withdraw('withdraw-key-001', KEY)).rejects.toThrow(
      PROGRAM_COMPLETION_TOO_MANY_EVENTS,
    )
    expect(store.writes).toHaveLength(0)
    expect(stateDoc().activeEntryKey).toBe(KEY)
  })

  it('counts no second act for a retry at the boundary', async () => {
    seedModel()
    seedInactiveStateAt(MAX_CLAIMING_COMPLETION_EVENTS - 1)
    await confirm()

    const again = await confirm()
    expect(again.alreadyRecorded).toBe(true)
    expect(countOf()).toBe(MAX_CLAIMING_COMPLETION_EVENTS)
    expect(conceptOf().evidence).toHaveLength(1)

    // The retry did not eat the reserved slot.
    const undone = await withdraw('withdraw-key-001', KEY)
    expect(undone.state.activeEntryKey).toBeNull()
    expect(countOf()).toBe(MAX_COMPLETION_EVENTS)
  })

  it('finishes a PENDING application at the boundary through the APPLY BUTTON', async () => {
    // Independent review F2. Confirmed with no learner model to write to, in
    // the last claiming slot: the record sits `pending` at forty-nine. The
    // visible apply button is the only route a surface offers to an outstanding
    // application — `needsApplyRetry` lights it up and nothing re-sends a stored
    // confirmation — so charging it a re-apply act left the record pending for
    // good: the one remaining slot belongs to the withdrawal, and no amount of
    // waiting or retrying frees another.
    seedInactiveStateAt(MAX_CLAIMING_COMPLETION_EVENTS - 1)
    const pending = await confirm()
    expect(pending.applicationPending).toBe(true)
    expect(countOf()).toBe(MAX_CLAIMING_COMPLETION_EVENTS)

    seedModel()
    const finished = await applyProgramCompletionProjection({
      familyId: FAMILY,
      childId: CHILD,
      program: 'fastPhonics',
      expectedEntryKey: KEY,
      recordedAt: '2026-10-17T13:00:00.000Z',
    })
    expect(finished.applied).toBe(true)
    expect(finished.applicationPending).toBe(false)
    expect(conceptOf().state).toBe('forming')

    // It finished the confirmation already recorded, so it is not a new act: no
    // re-apply event, no count, and the confirmation's own date stands.
    expect(finished.event).toBeNull()
    expect(store.get(`events/${CHILD}__fastPhonics__${KEY}-v1`)).toBeUndefined()
    expect(historyPaths()).toEqual([`events/${CHILD}__fastPhonics__${KEY}`])
    expect(countOf()).toBe(MAX_CLAIMING_COMPLETION_EVENTS)
    expect((store.get(statePath) as { lastEventAt: string }).lastEventAt).toBe(NOW)

    // ...so the slot that confirmation reserved is still the withdrawal's.
    const undone = await withdraw('withdraw-key-001', KEY, 'partial')
    expect(undone.state.activeEntryKey).toBeNull()
    expect(countOf()).toBe(MAX_COMPLETION_EVENTS)
    expect(conceptOf().state).toBe('not-yet')
  })

  it('accepts a reviewed mapping UPGRADE in the last claiming slot', async () => {
    // The other side of the same button, and the act that must stay counted: an
    // upgrade changes what the record claims was covered, so it is history.
    seedModel()
    await confirm()
    setAppliedMappingVersion(0)
    setEventCount(MAX_CLAIMING_COMPLETION_EVENTS - 1)

    const upgraded = await applyProgramCompletionProjection({
      familyId: FAMILY,
      childId: CHILD,
      program: 'fastPhonics',
      expectedEntryKey: KEY,
      recordedAt: '2026-10-17T13:00:00.000Z',
    })
    expect(upgraded.event?.kind).toBe('reapply')
    expect(upgraded.event?.entryKey).toBe(`${KEY}-v1`)
    expect(upgraded.event?.mappingVersion).toBe(1)
    // Counted and dated, because it is a new act.
    expect(countOf()).toBe(MAX_CLAIMING_COMPLETION_EVENTS)
    expect((store.get(statePath) as { lastEventAt: string }).lastEventAt).toBe(
      '2026-10-17T13:00:00.000Z',
    )
    expect(store.get(`events/${CHILD}__fastPhonics__${KEY}-v1`)).toBeDefined()

    // And the claim it kept can still be taken back.
    const undone = await withdraw('withdraw-key-001', KEY, 'notComplete')
    expect(undone.state.activeEntryKey).toBeNull()
    expect(countOf()).toBe(MAX_COMPLETION_EVENTS)
    expect(conceptOf().state).toBe('not-yet')
  })

  it('refuses a mapping UPGRADE at the bound, with zero writes, and stays withdrawable', async () => {
    // The pending finish above costs no capacity; this does, so the refusal has
    // to land here and nowhere else. Refused in words, before any write, with
    // the record exactly as it was — including the coverage it already carries.
    seedModel()
    await confirm()
    setAppliedMappingVersion(0)
    setEventCount(MAX_CLAIMING_COMPLETION_EVENTS)
    store.writes = []

    await expect(
      applyProgramCompletionProjection({
        familyId: FAMILY,
        childId: CHILD,
        program: 'fastPhonics',
        expectedEntryKey: KEY,
        recordedAt: '2026-10-17T13:00:00.000Z',
      }),
    ).rejects.toThrow(PROGRAM_COMPLETION_TOO_MANY_EVENTS)
    expect(store.writes).toHaveLength(0)
    expect(store.get(`events/${CHILD}__fastPhonics__${KEY}-v1`)).toBeUndefined()
    expect(countOf()).toBe(MAX_CLAIMING_COMPLETION_EVENTS)
    expect(stateDoc().activeEntryKey).toBe(KEY)
    expect(stateDoc().projection.status).toBe('applied')

    // The claim it refused to upgrade is still a claim she can end.
    const undone = await withdraw('withdraw-key-001', KEY, 'notComplete')
    expect(undone.state.activeEntryKey).toBeNull()
    expect(countOf()).toBe(MAX_COMPLETION_EVENTS)
    expect(conceptOf().state).toBe('not-yet')
  })

  it('repeats an existing-event repair on a record that is full', async () => {
    // The upgrade act is already on the record, and the refs under it went
    // missing again. Restoring them reuses that act, so it costs no capacity —
    // a full record must not be a record whose graph cannot be repaired.
    seedModel()
    await confirm()
    /** A ref goes missing under the model — the graph repair this button is for. */
    const loseARef = () => {
      const model = store.get(`learnerModels/${CHILD}`) as {
        conceptStates: Record<string, { evidence: unknown[] }>
      }
      model.conceptStates[CVC].evidence = []
      store.set(`learnerModels/${CHILD}`, model as unknown as Record<string, unknown>)
    }
    loseARef()
    const first = await applyProgramCompletionProjection({
      familyId: FAMILY,
      childId: CHILD,
      program: 'fastPhonics',
      recordedAt: '2026-10-17T13:00:00.000Z',
    })
    expect(first.event?.recordedAt).toBe('2026-10-17T13:00:00.000Z')
    setEventCount(MAX_CLAIMING_COMPLETION_EVENTS)

    loseARef()
    const repaired = await applyProgramCompletionProjection({
      familyId: FAMILY,
      childId: CHILD,
      program: 'fastPhonics',
      recordedAt: '2026-10-17T14:00:00.000Z',
    })
    expect(repaired.applied).toBe(true)
    expect(conceptOf().evidence).toHaveLength(1)
    // The act on the record is the earlier one, unmoved, and uncounted twice.
    expect(repaired.event?.recordedAt).toBe('2026-10-17T13:00:00.000Z')
    expect(countOf()).toBe(MAX_CLAIMING_COMPLETION_EVENTS)

    const undone = await withdraw('withdraw-key-001', KEY, 'mistake')
    expect(undone.state.activeEntryKey).toBeNull()
    expect(countOf()).toBe(MAX_COMPLETION_EVENTS)
  })

  it('finishes an outstanding WITHDRAWAL on a record above the bound', async () => {
    // The legacy-at-fifty recovery leaves the counter at the ceiling, and the
    // retraction it recorded may still be outstanding — the learner model was
    // unreachable when it ran. Finishing it writes no act (it completes one
    // already recorded), so the ceiling is not a reason to leave superseded
    // coverage standing on the graph.
    seedModel()
    await confirm()
    setEventCount(MAX_COMPLETION_EVENTS)
    const liveModel = store.get(`learnerModels/${CHILD}`) as Record<string, unknown>
    store.docs.delete(`learnerModels/${CHILD}`)

    const undone = await withdraw('withdraw-key-001', KEY, 'notComplete')
    expect(undone.applicationPending).toBe(true)
    expect(countOf()).toBe(COMPLETION_WITHDRAWAL_CEILING)
    expect(stateDoc().projection.status).toBe('withdrawalPending')

    // The model is reachable again, with this record's refs still live on it.
    store.set(`learnerModels/${CHILD}`, liveModel)
    const finished = await applyProgramCompletionProjection({
      familyId: FAMILY,
      childId: CHILD,
      program: 'fastPhonics',
      recordedAt: '2026-10-17T15:00:00.000Z',
    })
    expect(finished.event).toBeNull()
    expect(finished.applicationPending).toBe(false)
    expect(countOf()).toBe(COMPLETION_WITHDRAWAL_CEILING)
    expect(stateDoc().projection.status).toBe('withdrawn')
    expect(conceptOf().state).toBe('not-yet')
    expect(conceptOf().evidence.every((e) => e.status === 'superseded')).toBe(true)
  })

  it('never refuses the AUTOMATIC revocation of a corrected citation', async () => {
    // It runs inside the native-progress correction's own transaction: refusing
    // it would fail the parent's correction because the completion record was
    // full. It only ever ENDS a claim, so it is allowed and stays in bounds.
    const cited = seedReport()
    seedModel()
    await confirm({ reportObservationId: cited })
    setEventCount(MAX_CLAIMING_COMPLETION_EVENTS)
    const inTransaction = runTransaction as unknown as (
      db: unknown,
      fn: (tx: Transaction) => Promise<unknown>,
    ) => Promise<unknown>

    const status = (await inTransaction({}, async (tx) => {
      const plan = await planCompletionRevokeForCorrection(tx, {
        familyId: FAMILY,
        childId: CHILD,
        program: 'fastPhonics',
        correctedObservationId: cited,
        correctionObservationId: `${CHILD}__r9`,
        correctionEntryKey: 'r9-entry-key',
        nowIso: NOW,
      })
      plan.commit(tx)
      return plan.status
    })) as string

    expect(status).toBe('revoked')
    expect(stateDoc().activeEntryKey).toBeNull()
    expect(stateDoc().sourceConflict?.correctedByObservationId).toBe(`${CHILD}__r9`)
    expect(countOf()).toBe(MAX_COMPLETION_EVENTS)
    expect(countOf()).toBeLessThanOrEqual(COMPLETION_WITHDRAWAL_CEILING)
    expect(conceptOf().state).toBe('not-yet')
    expect(
      store.get(`events/${CHILD}__fastPhonics__src-r9-entry-key`),
    ).toBeDefined()
  })

  it('revokes automatically on a LEGACY record already at the bound', async () => {
    // The document the reserve did not exist for: fifty acts with a claim still
    // in force. The parent corrects the entry it rested on, and that correction
    // must land — the revocation takes the one slot the ceiling holds for it.
    const cited = seedReport()
    seedModel()
    await confirm({ reportObservationId: cited })
    setEventCount(MAX_COMPLETION_EVENTS)
    const inTransaction = runTransaction as unknown as (
      db: unknown,
      fn: (tx: Transaction) => Promise<unknown>,
    ) => Promise<unknown>

    const status = (await inTransaction({}, async (tx) => {
      const plan = await planCompletionRevokeForCorrection(tx, {
        familyId: FAMILY,
        childId: CHILD,
        program: 'fastPhonics',
        correctedObservationId: cited,
        correctionObservationId: `${CHILD}__r10`,
        correctionEntryKey: 'r10-entry-key',
        nowIso: NOW,
      })
      plan.commit(tx)
      return plan.status
    })) as string

    expect(status).toBe('revoked')
    expect(stateDoc().activeEntryKey).toBeNull()
    expect(conceptOf().state).toBe('not-yet')
    // One act above the bound — the headroom the ceiling names, and no further.
    expect(countOf()).toBe(COMPLETION_WITHDRAWAL_CEILING)
    await expect(confirm({}, 'draft-key-0002')).rejects.toThrow(
      PROGRAM_COMPLETION_TOO_MANY_EVENTS,
    )
  })

  it('leaves independent evidence standing when the reserved withdrawal runs', async () => {
    seedModel({
      conceptStates: {
        [CVC]: {
          state: 'frontier',
          evidence: [
            {
              kind: 'eval',
              sourceId: 'sess-9',
              note: 'guided eval',
              observedAt: '2026-10-16T00:00:00.000Z',
              readState: 'frontier',
            },
          ],
        },
      },
    })
    seedInactiveStateAt(MAX_CLAIMING_COMPLETION_EVENTS - 1)
    await confirm()
    await withdraw('withdraw-key-001', KEY, 'notComplete')

    const evidence = conceptOf().evidence
    const evals = evidence.filter((e) => e.kind === 'eval')
    expect(evals).toHaveLength(1)
    // The withdrawal retracts ITS OWN contribution and nothing else.
    expect(evals[0].status).toBeUndefined()
    expect(
      evidence
        .filter((e) => e.kind === 'programCompletionCoverage')
        .every((e) => e.status === 'superseded'),
    ).toBe(true)
    expect(conceptOf().state).not.toBe('not-yet')
  })
})
