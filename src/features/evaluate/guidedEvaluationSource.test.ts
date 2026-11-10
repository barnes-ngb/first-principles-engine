import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EvaluationFinding, EvaluationSession } from '../../core/types/evaluation'

/**
 * UX-492 — the finalized guided-evaluation source, saved atomically beside the
 * (unchanged) daily record.
 *
 * The defect these cases pin: both completed guided attempts on one day write
 * the same `evaluationSessions` document, so the later replaced the earlier even
 * when their projected evidence summaries matched and their recorded help notes
 * were OPPOSITE — and nothing stored could then say which attempt a learner-model
 * ref was evidence of.
 *
 * POSITIVE CONTROLS, each named on its case: make the writer overwrite a
 * committed source, drop the day-record pointer, or reconcile a same-id
 * mismatch instead of refusing, and the matching case fails.
 */

// ── Firestore, as a working single-document fake ────────────────

/** The stored `guidedEvaluationSources` document, by id. */
const store = new Map<string, Record<string, unknown>>()
/** Every `tx.set` this run performed, in order. */
let writes: Array<{ collection: string; id: string; data: Record<string, unknown> }> = []
/** Set to make the commit itself fail, as a dropped connection would. */
let commitThrows: Error | null = null

interface Ref {
  collection: string
  id: string
}

let autoId = 0

vi.mock('firebase/firestore', () => ({
  doc: (collection: { name: string }, id?: string): Ref => ({
    collection: collection.name,
    id: id ?? `auto_${(autoId += 1)}`,
  }),
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const staged: Array<{ ref: Ref; data: Record<string, unknown> }> = []
    const tx = {
      get: async (ref: Ref) => {
        const stored = ref.collection === 'guidedEvaluationSources' ? store.get(ref.id) : undefined
        return {
          exists: () => stored !== undefined,
          // The converter adds the id on read, which is exactly the extra key
          // normalized equality has to tolerate.
          data: () => (stored ? { ...stored, id: ref.id } : undefined),
        }
      },
      set: (ref: Ref, data: Record<string, unknown>) => {
        staged.push({ ref, data })
      },
    }
    const out = await fn(tx)
    if (commitThrows) throw commitThrows
    for (const { ref, data } of staged) {
      writes.push({ collection: ref.collection, id: ref.id, data })
      if (ref.collection === 'guidedEvaluationSources') {
        // Stored as Firestore stores it: `undefined` fields omitted, key order
        // not preserved.
        store.set(ref.id, JSON.parse(JSON.stringify(data)))
      }
    }
    return out
  },
}))

vi.mock('../../core/firebase/firestore', () => ({
  db: {},
  evaluationSessionsCollection: () => ({ name: 'evaluationSessions' }),
  guidedEvaluationSourcesCollection: () => ({ name: 'guidedEvaluationSources' }),
}))

import {
  finalizeGuidedEvaluation,
  guidedSourceContentMatches,
  GuidedEvaluationSourceMismatch,
  newGuidedEvaluationSourceId,
  normalizeForCompare,
} from './guidedEvaluationSource'

const FAMILY = 'fam-1'
const DAY_ID = 'lincoln_reading_2026-11-10'
const AT = '2026-11-10T10:00:00.000Z'

/** The two attempts of the acceptance case: same evidence, opposite help. */
const UNAIDED: EvaluationFinding = {
  skill: 'phonics.cvc.short-o',
  status: 'emerging',
  evidence: 'read hop and mop, stalled on dog',
  notes: 'read it with no help from me',
  testedAt: AT,
}
const HELPED: EvaluationFinding = {
  skill: 'phonics.cvc.short-o',
  status: 'emerging',
  evidence: 'read hop and mop, stalled on dog',
  notes: 'I sounded out the first two for him',
  testedAt: AT,
}

function session(findings: EvaluationFinding[]): Omit<EvaluationSession, 'id'> {
  return {
    childId: 'lincoln',
    domain: 'reading' as EvaluationSession['domain'],
    status: 'complete',
    messages: [],
    findings,
    recommendations: [],
    summary: 'Short-o is the frontier.',
    evaluatedAt: AT,
  }
}

function args(overrides: Partial<Parameters<typeof finalizeGuidedEvaluation>[0]> = {}) {
  const findings = overrides.findings ?? [UNAIDED]
  return {
    familyId: FAMILY,
    childId: 'lincoln',
    domain: 'reading' as EvaluationSession['domain'],
    sessionDocId: DAY_ID,
    sourceId: 'src-1',
    finalizedAt: AT,
    findings,
    session: session(findings as EvaluationFinding[]),
    ...overrides,
  }
}

const sourceWrites = () => writes.filter((w) => w.collection === 'guidedEvaluationSources')
const dayWrites = () => writes.filter((w) => w.collection === 'evaluationSessions')

beforeEach(() => {
  store.clear()
  writes = []
  commitThrows = null
})

describe('finalizeGuidedEvaluation — one commit, both documents', () => {
  it('writes the source and the day record that names it', async () => {
    const receipt = await finalizeGuidedEvaluation(args())

    expect(receipt.alreadyFinalized).toBe(false)
    expect(receipt.sourceId).toBe('src-1')
    expect(receipt.sessionDocId).toBe(DAY_ID)
    expect(receipt.findings).toEqual([UNAIDED])

    // POSITIVE CONTROL: drop the `finalizedSourceId` from the day write and this
    // is what fails — a completed record with no way to name its own version.
    expect(dayWrites()).toHaveLength(1)
    expect(dayWrites()[0].id).toBe(DAY_ID)
    expect(dayWrites()[0].data.finalizedSourceId).toBe('src-1')
    expect(dayWrites()[0].data.status).toBe('complete')

    // Only scoped metadata, the stamp and the exact findings — no transcript,
    // no recommendations, no summary.
    expect(sourceWrites()).toHaveLength(1)
    expect(sourceWrites()[0].data).toEqual({
      childId: 'lincoln',
      domain: 'reading',
      sessionDocId: DAY_ID,
      finalizedAt: AT,
      findings: [UNAIDED],
    })
  })

  it('keeps two same-day attempts with identical evidence and opposite help apart', async () => {
    const first = await finalizeGuidedEvaluation(args({ sourceId: 'src-1', findings: [UNAIDED] }))
    const second = await finalizeGuidedEvaluation(args({ sourceId: 'src-2', findings: [HELPED] }))

    // Same day document, two distinct originals — which is the whole point.
    expect(first.sessionDocId).toBe(second.sessionDocId)
    expect(first.sourceId).not.toBe(second.sourceId)
    expect(store.get('src-1')!.findings).toEqual([UNAIDED])
    expect(store.get('src-2')!.findings).toEqual([HELPED])
    // The first attempt's recorded help survived the second attempt entirely.
    expect((store.get('src-1')!.findings as EvaluationFinding[])[0].notes).toBe(
      'read it with no help from me',
    )
  })

  it('preserves recorded help verbatim and leaves absent help absent', async () => {
    const noNotes: EvaluationFinding = {
      skill: 'phonics.cvc.short-a',
      status: 'mastered',
      evidence: 'read cat, hat, mat',
      testedAt: AT,
    }
    await finalizeGuidedEvaluation(args({ findings: [noNotes, HELPED] }))

    const stored = store.get('src-1')!.findings as EvaluationFinding[]
    // Unknown, not "no help": the key is simply not there.
    expect('notes' in stored[0]).toBe(false)
    expect(stored[1].notes).toBe('I sounded out the first two for him')
    // And the order is the recorded order — a model ref stores the index.
    expect(stored.map((f) => f.skill)).toEqual(['phonics.cvc.short-a', 'phonics.cvc.short-o'])
  })

  it('never leaves a half-finalized record when the commit fails', async () => {
    commitThrows = new Error('connection lost')

    await expect(finalizeGuidedEvaluation(args())).rejects.toThrow('connection lost')

    expect(writes).toEqual([])
    expect(store.size).toBe(0)
  })
})

describe('finalizeGuidedEvaluation — create-once and the retry path', () => {
  it('acknowledges its own committed source WITHOUT rewriting the day record', async () => {
    await finalizeGuidedEvaluation(args())
    writes = []

    // The same captured payload and id, retried after an unknown result.
    const receipt = await finalizeGuidedEvaluation(args())

    expect(receipt.alreadyFinalized).toBe(true)
    expect(receipt.sourceId).toBe('src-1')
    expect(receipt.findings).toEqual([UNAIDED])
    // POSITIVE CONTROL: write the day record on this path and this fails —
    // which is the defect it exists to stop, since a NEWER attempt may own the
    // day document by the time an old retry runs.
    expect(writes).toEqual([])
  })

  it('tolerates key ordering and omitted undefined fields on the retry', async () => {
    const withUndefined: EvaluationFinding = {
      ...UNAIDED,
      // Explicitly undefined in the caller's payload; omitted in the store.
      notes: undefined,
    }
    await finalizeGuidedEvaluation(args({ findings: [withUndefined] }))
    writes = []

    const receipt = await finalizeGuidedEvaluation(args({ findings: [withUndefined] }))
    expect(receipt.alreadyFinalized).toBe(true)
    expect(writes).toEqual([])
  })

  it('FAILS CLOSED on a same-id mismatch rather than reconciling it', async () => {
    await finalizeGuidedEvaluation(args({ findings: [UNAIDED] }))
    writes = []

    // Same id, different recorded help — the one case that must never be
    // silently accepted or overwritten.
    await expect(
      finalizeGuidedEvaluation(args({ findings: [HELPED] })),
    ).rejects.toBeInstanceOf(GuidedEvaluationSourceMismatch)

    expect(writes).toEqual([])
    expect(store.get('src-1')!.findings).toEqual([UNAIDED])
  })

  it('fails closed on a mismatched scope — another child or another day', async () => {
    await finalizeGuidedEvaluation(args())

    await expect(
      finalizeGuidedEvaluation(args({ childId: 'london' })),
    ).rejects.toBeInstanceOf(GuidedEvaluationSourceMismatch)
    await expect(
      finalizeGuidedEvaluation(args({ sessionDocId: 'lincoln_reading_2026-11-11' })),
    ).rejects.toBeInstanceOf(GuidedEvaluationSourceMismatch)
  })

  it('reads the finalization stamp off the STORED record on a retry', async () => {
    await finalizeGuidedEvaluation(args({ finalizedAt: AT }))
    const receipt = await finalizeGuidedEvaluation(
      args({ finalizedAt: '2026-11-10T23:59:00.000Z' }),
    )
    // The first commit's clock is the record's; a differing stamp is not a
    // content mismatch, because what it dates is the save, not the evidence.
    expect(receipt.finalizedAt).toBe(AT)
    expect(receipt.alreadyFinalized).toBe(true)
  })
})

describe('the equality the retry path rests on', () => {
  it('ignores key order and dropped undefined values, not array order', () => {
    expect(normalizeForCompare({ a: 1, b: undefined, c: 2 })).toEqual({ a: 1, c: 2 })
    expect(JSON.stringify(normalizeForCompare({ b: 2, a: 1 }))).toBe(
      JSON.stringify(normalizeForCompare({ a: 1, b: 2 })),
    )
    expect(JSON.stringify(normalizeForCompare([1, 2]))).not.toBe(
      JSON.stringify(normalizeForCompare([2, 1])),
    )
  })

  it('reads a reordered findings list as a DIFFERENT content', () => {
    const expected = {
      childId: 'lincoln',
      domain: 'reading' as EvaluationSession['domain'],
      sessionDocId: DAY_ID,
      findings: [UNAIDED, HELPED],
    }
    expect(guidedSourceContentMatches({ ...expected }, expected)).toBe(true)
    expect(
      guidedSourceContentMatches({ ...expected, findings: [HELPED, UNAIDED] }, expected),
    ).toBe(false)
  })

  it('reads a missing or findings-less document as no match', () => {
    const expected = {
      childId: 'lincoln',
      domain: 'reading' as EvaluationSession['domain'],
      sessionDocId: DAY_ID,
      findings: [UNAIDED],
    }
    expect(guidedSourceContentMatches(undefined, expected)).toBe(false)
    expect(guidedSourceContentMatches({ childId: 'lincoln' }, expected)).toBe(false)
  })
})

describe('newGuidedEvaluationSourceId', () => {
  it('mints a fresh id per call, so each finalization has its own', () => {
    const a = newGuidedEvaluationSourceId(FAMILY)
    const b = newGuidedEvaluationSourceId(FAMILY)
    expect(a).toBeTruthy()
    expect(a).not.toBe(b)
  })
})
