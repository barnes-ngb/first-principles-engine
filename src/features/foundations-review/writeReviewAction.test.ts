// The merge shape has exactly ONE definition (FEAT-66). These tests pin it, so a
// second write path can't quietly grow a different payload.
import { describe, expect, it, vi, beforeEach } from 'vitest'

/** The spy's signature, declared rather than written as unused parameters. */
type SetDocFn = (ref?: unknown, data?: unknown, opts?: unknown) => Promise<void>
const setDocImpl: SetDocFn = async () => {}
const setDocMock = vi.fn(setDocImpl)
vi.mock('firebase/firestore', () => ({
  setDoc: (ref?: unknown, data?: unknown, opts?: unknown) => setDocMock(ref, data, opts),
  // FEAT-242 — `applyAndWriteReviewAction` re-applies inside a transaction. The
  // fake routes `tx.set` to the same `setDoc` spy these tests assert on, and
  // `tx.get` to a per-test stored document so the "recompute from the CURRENT
  // model" behaviour is what is being measured.
  runTransaction: async (
    _db: unknown,
    fn: (tx: {
      get: (ref: unknown) => Promise<{ exists: () => boolean; data: () => unknown }>
      set: (ref: unknown, data: unknown, opts?: unknown) => void
    }) => unknown,
  ) => {
    for (let attempt = 1; ; attempt += 1) {
      // The writes are collected as thunks and run after the callback, so a
      // rejecting `setDoc` still fails the transaction — the real `tx.set` is
      // synchronous and the commit is what can fail, and the "does not swallow a
      // failed write" expectation below has to keep meaning something. Thunks
      // rather than promises so a RETRIED attempt's write is never sent at all,
      // which is what a contended transaction does.
      const writes: (() => Promise<unknown>)[] = []
      const out = await fn({
        get: async () => ({
          exists: () => stored.model !== null,
          data: () => stored.model,
        }),
        set: (ref: unknown, data: unknown, opts?: unknown) => {
          writes.push(() => Promise.resolve(setDocMock(ref, data, opts)))
        },
      })
      // FEAT-66 scope repair: a real transaction re-runs its callback against the
      // document as it stands now. `stored.contendWith` is that second read, so a
      // check that only happens on the first attempt can be seen to fail.
      if (attempt === 1 && 'contendWith' in stored) {
        stored.model = stored.contendWith
        delete stored.contendWith
        continue
      }
      await Promise.all(writes.map((w) => w()))
      return out
    }
  },
}))
vi.mock('../../core/firebase/firestore', () => ({ db: {} }))

/**
 * What the transaction's `tx.get` returns — the document as STORED.
 *
 * `null` is the "no document yet" case the writer falls back to its caller's
 * base for; a test that cares about the stale-cache behaviour sets
 * `stored.model` to a model the caller has never seen. A mutable holder rather
 * than a reassigned binding, so the mock closure reads the current value.
 *
 * `contendWith`, when present, is what the SECOND attempt reads — one simulated
 * conflicting commit, after which the key is gone and the transaction settles.
 */
const stored: { model: unknown; contendWith?: unknown } = { model: null }

import { applyReviewActionToModel } from './foundationsReviewActions'
import type { FoundationsReviewAction } from './foundationsReviewActions'
import {
  applyAndWriteReviewAction,
  buildReviewActionMerge,
  writeReviewAction,
} from './writeReviewAction'
import {
  conceptDecisionBasis,
  ReviewActionBasisError,
} from '../progress/conceptOverride'
import type { ConceptStateEntry, EvidenceRef, LearnerModel } from '../../core/types/learnerModel'

const NOW = '2026-07-25T12:00:00.000Z'
const CVC = 'reading.phonics.cvc'
const LONG = 'reading.phonics.longVowels'

function emptyModel(): LearnerModel {
  return {
    childId: 'c1',
    graphVersion: 'reading@1+math@1',
    status: 'seeded',
    conceptStates: {
      [LONG]: { state: 'frontier', evidence: [] },
    },
    modalityCalibration: {
      reading: { note: '' },
      writing: { note: '' },
      math: { note: '' },
    },
    whatMattersNext: [],
    changeFeed: [],
    openQuestions: [],
    seededAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  }
}

const attest: FoundationsReviewAction = {
  kind: 'attest',
  childId: 'c1',
  conceptId: CVC,
  state: 'solid',
  note: 'He read cat, run, sit',
}

// Stand-in for the typed DocumentReference — the writer only hands it to setDoc.
const REF = { path: 'families/f1/learnerModels/c1' } as never

beforeEach(() => {
  vi.clearAllMocks()
  // Every test states its own stored document; the default is "no document yet".
  stored.model = null
  delete stored.contendWith
})

describe('buildReviewActionMerge', () => {
  it('merges a SINGLE conceptStates key — never the whole map', () => {
    const applied = applyReviewActionToModel(emptyModel(), attest, NOW)
    const merge = buildReviewActionMerge(applied) as Record<string, unknown>

    expect(Object.keys(merge).sort()).toEqual([
      'changeFeed',
      'conceptStates',
      'openQuestions',
      'synthesisStaleAt',
      'updatedAt',
    ])
    const states = merge.conceptStates as Record<string, unknown>
    expect(Object.keys(states)).toEqual([CVC])
    // The untouched concept is absent from the payload entirely.
    expect(states[LONG]).toBeUndefined()
  })

  it('stamps synthesisStaleAt with the same updatedAt (FEAT-57 D4)', () => {
    const applied = applyReviewActionToModel(emptyModel(), attest, NOW)
    const merge = buildReviewActionMerge(applied) as Record<string, unknown>
    expect(merge.updatedAt).toBe(NOW)
    expect(merge.synthesisStaleAt).toBe(NOW)
  })

  it('omits conceptStates entirely for a queueTest (no state write)', () => {
    const applied = applyReviewActionToModel(
      emptyModel(),
      { kind: 'queueTest', childId: 'c1', conceptId: LONG },
      NOW,
    )
    const merge = buildReviewActionMerge(applied) as Record<string, unknown>
    expect(merge.conceptStates).toBeUndefined()
    expect(merge.openQuestions).toHaveLength(1)
  })
})

describe('writeReviewAction', () => {
  it('writes merge-only, once', async () => {
    const applied = applyReviewActionToModel(emptyModel(), attest, NOW)
    await writeReviewAction(REF, applied)
    expect(setDocMock).toHaveBeenCalledTimes(1)
    const [ref, payload, opts] = setDocMock.mock.calls[0] as unknown[]
    expect(ref).toBe(REF)
    expect(opts).toEqual({ merge: true })
    expect((payload as Record<string, unknown>).conceptStates).toBeDefined()
  })

  it('propagates a write failure so callers can surface it', async () => {
    setDocMock.mockRejectedValueOnce(new Error('firestore down') as never)
    const applied = applyReviewActionToModel(emptyModel(), attest, NOW)
    await expect(writeReviewAction(REF, applied)).rejects.toThrow('firestore down')
  })
})

// ── UX-322: a confirmed write promotes the model off `no-data` ───────────
describe('buildReviewActionMerge — status promotion (UX-322)', () => {
  const noData = (): LearnerModel => ({ ...emptyModel(), status: 'no-data' })

  it('promotes a no-data model to seeded when an attestation lands', () => {
    const applied = applyReviewActionToModel(noData(), attest, NOW)
    expect(buildReviewActionMerge(applied).status).toBe('seeded')
  })

  it('promotes nothing for a queueTest — a queued check is not evidence', () => {
    const applied = applyReviewActionToModel(
      noData(),
      { kind: 'queueTest', childId: 'c1', conceptId: LONG },
      NOW,
    )
    expect(buildReviewActionMerge(applied).status).toBeUndefined()
  })

  it('omits the key entirely on an already-seeded model', () => {
    const applied = applyReviewActionToModel(emptyModel(), attest, NOW)
    expect('status' in buildReviewActionMerge(applied)).toBe(false)
  })
})

describe('applyAndWriteReviewAction', () => {
  it('applies then persists, returning the next model', async () => {
    const next = await applyAndWriteReviewAction(REF, emptyModel(), attest, NOW)
    expect(next.conceptStates[CVC].state).toBe('solid')
    expect(next.conceptStates[CVC].evidence.at(-1)).toMatchObject({
      kind: 'attestation',
      overriddenBy: 'parent',
      note: 'He read cat, run, sit',
    })
    expect(setDocMock).toHaveBeenCalledTimes(1)
  })

  it('does not swallow a failed write', async () => {
    setDocMock.mockRejectedValueOnce(new Error('nope') as never)
    await expect(
      applyAndWriteReviewAction(REF, emptyModel(), attest, NOW),
    ).rejects.toThrow('nope')
  })
})

// ── FEAT-66 scope repair: the opt-in stored-basis check ───────────────────
//
// The Foundations drawer stages a decision ABOUT evidence it is showing. Between
// the tap and the commit, that evidence can be replaced, withdrawn, or belong to
// another child entirely — and a merge computed from the stored document is
// perfectly happy to record the parent's word against something they never read.
// So the drawer opts in to a check of the stored child, the exact concept, and a
// fingerprint of the basis, INSIDE the transaction. Nothing else opts in, and the
// Review Chat's write is unchanged — the first block below is what pins that.

const EVAL_REF: EvidenceRef = {
  kind: 'eval',
  sourceId: 'sess-9',
  note: 'Guided eval — needed a hand on a few',
  observedAt: '2026-07-20T00:00:00.000Z',
  readState: 'forming',
}

const ATTESTATION_REF: EvidenceRef = {
  kind: 'attestation',
  sourceId: 'reviewChat',
  note: 'He read cat, run, sit for me',
  observedAt: '2026-07-01T00:00:00.000Z',
  overriddenBy: 'parent',
  readState: 'solid',
}

/** The CVC entry a reconcile decision is made against. */
function flaggedEntry(over: Partial<ConceptStateEntry> = {}): ConceptStateEntry {
  return {
    state: 'solid',
    evidence: [{ ...ATTESTATION_REF }, { ...EVAL_REF }],
    needsReconcile: true,
    ...over,
  }
}

/** A stored model holding that entry, for child `c1`. */
function storedModel(entry: ConceptStateEntry | null = flaggedEntry()): LearnerModel {
  const model = emptyModel()
  if (entry) model.conceptStates[CVC] = entry
  return model
}

/** What the drawer carries from the tap: the child, the concept, the basis. */
function expectationFor(entry: ConceptStateEntry | undefined, childId = 'c1') {
  return { childId, conceptId: CVC, basis: conceptDecisionBasis(entry) }
}

describe('applyAndWriteReviewAction — the Review Chat is untouched', () => {
  it('writes with no expectation even when the stored basis has moved', async () => {
    // The Review-Chat caller passes four arguments. It gets the FEAT-242
    // behaviour and nothing else: recompute from the stored document, write.
    stored.model = storedModel(
      flaggedEntry({ evidence: [{ ...EVAL_REF, sourceId: 'sess-77' }] }),
    )
    const next = await applyAndWriteReviewAction(REF, emptyModel(), attest, NOW)
    expect(setDocMock).toHaveBeenCalledTimes(1)
    expect(next.conceptStates[CVC].state).toBe('solid')
    // The ref that landed in the meantime is preserved, not replaced.
    expect(next.conceptStates[CVC].evidence.map((e) => e.sourceId)).toContain('sess-77')
  })

  it('still falls back to the caller’s base when the document does not exist', async () => {
    stored.model = null
    const next = await applyAndWriteReviewAction(REF, emptyModel(), attest, NOW)
    expect(setDocMock).toHaveBeenCalledTimes(1)
    expect(next.conceptStates[CVC].state).toBe('solid')
  })
})

describe('applyAndWriteReviewAction — stored-basis refusal (opt-in)', () => {
  it('writes when the stored child, concept and basis are all still the ones decided against', async () => {
    const entry = flaggedEntry()
    stored.model = storedModel(entry)
    const next = await applyAndWriteReviewAction(
      REF,
      emptyModel(),
      attest,
      NOW,
      expectationFor(entry),
    )
    expect(setDocMock).toHaveBeenCalledTimes(1)
    expect(next.conceptStates[CVC].state).toBe('solid')
  })

  it('refuses with NO write when the document does not exist — never the fallback', async () => {
    stored.model = null
    await expect(
      applyAndWriteReviewAction(
        REF,
        storedModel(),
        attest,
        NOW,
        expectationFor(flaggedEntry()),
      ),
    ).rejects.toThrow(ReviewActionBasisError)
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('refuses when the stored model belongs to another child', async () => {
    stored.model = { ...storedModel(), childId: 'c2' }
    const err = await applyAndWriteReviewAction(
      REF,
      emptyModel(),
      attest,
      NOW,
      expectationFor(flaggedEntry()),
    ).catch((e: unknown) => e)
    expect((err as ReviewActionBasisError).reason).toBe('child-mismatch')
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('refuses when the action names a child the drawer did not capture', async () => {
    stored.model = storedModel()
    const err = await applyAndWriteReviewAction(
      REF,
      emptyModel(),
      { ...attest, childId: 'c2' },
      NOW,
      expectationFor(flaggedEntry()),
    ).catch((e: unknown) => e)
    expect((err as ReviewActionBasisError).reason).toBe('child-mismatch')
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('refuses when the action names a different concept than the one staged', async () => {
    stored.model = storedModel()
    const err = await applyAndWriteReviewAction(
      REF,
      emptyModel(),
      { ...attest, conceptId: LONG },
      NOW,
      expectationFor(flaggedEntry()),
    ).catch((e: unknown) => e)
    expect((err as ReviewActionBasisError).reason).toBe('concept-mismatch')
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('refuses when the stored model no longer carries that concept at all', async () => {
    // An absent entry is NOT an empty basis that happens to match: the concept
    // the parent was looking at is not in the document.
    stored.model = storedModel(null)
    const err = await applyAndWriteReviewAction(
      REF,
      emptyModel(),
      attest,
      NOW,
      expectationFor({ state: 'frontier', evidence: [] }),
    ).catch((e: unknown) => e)
    expect((err as ReviewActionBasisError).reason).toBe('concept-missing')
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('refuses a replacement evaluation that asserts the SAME state', async () => {
    // The dangerous one: nothing about the state changed, so a state comparison
    // sees nothing. It is a different evaluation, on a different day, and the
    // parent chose "take the model's read" about the old one.
    const decidedAgainst = flaggedEntry()
    stored.model = storedModel(
      flaggedEntry({
        evidence: [
          { ...ATTESTATION_REF },
          { ...EVAL_REF, sourceId: 'sess-12', observedAt: '2026-07-24T00:00:00.000Z' },
        ],
      }),
    )
    const err = await applyAndWriteReviewAction(
      REF,
      emptyModel(),
      attest,
      NOW,
      expectationFor(decidedAgainst),
    ).catch((e: unknown) => e)
    expect((err as ReviewActionBasisError).reason).toBe('basis-stale')
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('refuses when the basis was withdrawn rather than changed', async () => {
    const decidedAgainst = flaggedEntry()
    stored.model = storedModel(
      flaggedEntry({
        evidence: [{ ...ATTESTATION_REF }, { ...EVAL_REF, status: 'superseded' }],
      }),
    )
    const err = await applyAndWriteReviewAction(
      REF,
      emptyModel(),
      attest,
      NOW,
      expectationFor(decidedAgainst),
    ).catch((e: unknown) => e)
    expect((err as ReviewActionBasisError).reason).toBe('basis-stale')
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('refuses when the disagreement was settled under the parent’s feet', async () => {
    const decidedAgainst = flaggedEntry()
    stored.model = storedModel(flaggedEntry({ needsReconcile: false }))
    const err = await applyAndWriteReviewAction(
      REF,
      emptyModel(),
      attest,
      NOW,
      expectationFor(decidedAgainst),
    ).catch((e: unknown) => e)
    expect((err as ReviewActionBasisError).reason).toBe('basis-stale')
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('ignores an unrelated concept moving — a current draft is not thrown away', async () => {
    const entry = flaggedEntry()
    const model = storedModel(entry)
    model.conceptStates[LONG] = { state: 'solid', evidence: [{ ...EVAL_REF }] }
    stored.model = model
    await applyAndWriteReviewAction(REF, emptyModel(), attest, NOW, expectationFor(entry))
    expect(setDocMock).toHaveBeenCalledTimes(1)
  })

  it('checks on EVERY attempt, not just the first — and writes nothing when the retry refuses', async () => {
    // The first read matches; a conflicting commit lands; the transaction re-runs
    // its callback. A check hoisted out of the callback would miss this, and the
    // merge is computed after it, so the retry writes nothing at all.
    const entry = flaggedEntry()
    stored.model = storedModel(entry)
    stored.contendWith = storedModel(
      flaggedEntry({ evidence: [{ ...ATTESTATION_REF }, { ...EVAL_REF, sourceId: 'sess-13' }] }),
    )
    const err = await applyAndWriteReviewAction(
      REF,
      emptyModel(),
      attest,
      NOW,
      expectationFor(entry),
    ).catch((e: unknown) => e)
    expect((err as ReviewActionBasisError).reason).toBe('basis-stale')
    expect(setDocMock).not.toHaveBeenCalled()
  })
})
