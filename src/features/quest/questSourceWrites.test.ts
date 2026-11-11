import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX-494 — a quest source document is written conditionally, or not at all.
 *
 * The hazards, one per case below:
 *   • a RETRY whose first attempt actually committed and lost its
 *     acknowledgement must be recognised — but ONLY when it is the same
 *     immutable content, because one run writes one payload and a second
 *     payload under the same id is two records competing for one document;
 *   • a payload from a different run, child, mode or domain must never
 *     overwrite or edit a record it does not own;
 *   • a late `resetToIntro` partial must never turn a completed session back
 *     into a resumable one;
 *   • a stale Resume must never stamp `status: 'resumed'` onto a finalized one.
 */

const store = new Map<string, unknown>()
const writes: Array<{ path: string; data: Record<string, unknown>; merge: boolean }> = []
let transactionError: Error | null = null

function seed(path: string, value: object): void {
  store.set(path, value)
}

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => path,
  doc: (col: string, id: string) => ({ path: `${col}/${id}` }),
  getDoc: async (ref: { path: string }) => {
    const data = store.get(ref.path)
    return { exists: () => data !== undefined, data: () => data }
  },
  runTransaction: async (
    _db: unknown,
    fn: (tx: {
      get: (ref: { path: string }) => Promise<unknown>
      set: (ref: { path: string }, data: unknown, opts?: { merge?: boolean }) => void
    }) => unknown,
  ) => {
    if (transactionError) throw transactionError
    return fn({
      get: async (ref) => {
        const data = store.get(ref.path)
        return { exists: () => data !== undefined, data: () => data }
      },
      set: (ref, data, opts) => {
        writes.push({
          path: ref.path,
          data: data as Record<string, unknown>,
          merge: Boolean(opts?.merge),
        })
      },
    })
  },
}))

vi.mock('../../core/firebase/firestore', () => ({
  db: {},
  evaluationSessionsCollection: (familyId: string) => `sessions-${familyId}`,
}))

import {
  abandonQuestSource,
  canonicalQuestSourceContent,
  claimQuestSourceForResume,
  questSourceRef,
  saveFinalQuestSource,
  saveResumableQuestSource,
  type QuestSourcePayload,
} from './questSourceWrites'

const FAM = 'fam-1'
const CHILD = 'child-1'
const RUN = 'interactive_child-1_1000'
const PATH = `sessions-${FAM}/${RUN}`
const NOW = '2026-11-10T12:00:00.000Z'

function payload(partial: Partial<QuestSourcePayload> = {}): QuestSourcePayload {
  return {
    childId: CHILD,
    domain: 'reading',
    status: 'complete',
    messages: [],
    findings: [],
    recommendations: [],
    summary: 'five of five',
    evaluatedAt: NOW,
    sessionType: 'interactive',
    questMode: 'phonics',
    questions: [],
    finalLevel: 3,
    totalCorrect: 5,
    totalQuestions: 5,
    diamondsMined: 5,
    streakDays: 1,
    questRunId: RUN,
    targetPlan: [],
    sourceCommittedAt: NOW,
    modelProjection: 'pending',
    ...partial,
  } as QuestSourcePayload
}

/** What the SAME payload looks like once stored and read back. */
function stored(partial: Partial<QuestSourcePayload> = {}): Record<string, unknown> {
  return JSON.parse(JSON.stringify(payload(partial))) as Record<string, unknown>
}

const ref = () => questSourceRef(FAM, RUN)

beforeEach(() => {
  store.clear()
  writes.length = 0
  transactionError = null
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('canonicalQuestSourceContent', () => {
  it('ignores key order', () => {
    expect(canonicalQuestSourceContent({ childId: CHILD, summary: 'a' })).toBe(
      canonicalQuestSourceContent({ summary: 'a', childId: CHILD }),
    )
  })

  it('ignores only the mutable graph-projection fields', () => {
    const base = payload()
    expect(
      canonicalQuestSourceContent({
        ...base,
        modelProjection: 'projected',
        modelProjectionOutcome: 'projected',
        modelProjectedAt: NOW,
      }),
    ).toBe(canonicalQuestSourceContent(base))
  })

  it('separates payloads whose ANSWERS differ', () => {
    expect(canonicalQuestSourceContent(payload({ totalCorrect: 4 }))).not.toBe(
      canonicalQuestSourceContent(payload()),
    )
  })
})

describe('saveFinalQuestSource', () => {
  it('writes the payload when no record exists', async () => {
    expect(await saveFinalQuestSource(ref(), payload())).toBe('saved')
    expect(writes).toHaveLength(1)
    expect(writes[0].merge).toBe(false)
    expect(writes[0].data).toMatchObject({ questRunId: RUN, status: 'complete' })
  })

  it('finalizes over this run’s own resumable partial', async () => {
    seed(PATH, {
      childId: CHILD,
      sessionType: 'interactive',
      domain: 'reading',
      questMode: 'phonics',
      questRunId: RUN,
      status: 'partial',
      savedQuestState: {},
    })
    expect(await saveFinalQuestSource(ref(), payload())).toBe('saved')
    expect(writes).toHaveLength(1)
  })

  /** A committed acknowledgement lost before the retry. */
  it('recognises its own already-committed payload and writes nothing', async () => {
    seed(PATH, stored())
    expect(await saveFinalQuestSource(ref(), payload())).toBe('already-committed')
    expect(writes).toHaveLength(0)
  })

  it('still recognises it once the projection has stamped the record', async () => {
    seed(PATH, {
      ...stored(),
      modelProjection: 'projected',
      modelProjectionOutcome: 'projected',
      modelProjectedAt: NOW,
    })
    expect(await saveFinalQuestSource(ref(), payload())).toBe('already-committed')
    expect(writes).toHaveLength(0)
  })

  /** The same id carrying DIFFERENT answers is not a lost acknowledgement. */
  it('reports a conflict for the same run id with a different payload', async () => {
    seed(PATH, stored({ totalCorrect: 4, summary: 'four of five' }))
    expect(await saveFinalQuestSource(ref(), payload())).toBe('conflict')
    expect(writes).toHaveLength(0)
  })

  it('preserves a conflicting already-finalized source from another run', async () => {
    seed(PATH, stored({ questRunId: 'interactive_child-1_9999' }))
    expect(await saveFinalQuestSource(ref(), payload())).toBe('conflict')
    expect(writes).toHaveLength(0)
  })

  it('preserves a LEGACY complete record, which carries no commit stamp', async () => {
    seed(PATH, { status: 'complete', sessionType: 'interactive', questions: [{ id: 'old' }] })
    expect(await saveFinalQuestSource(ref(), payload())).toBe('conflict')
    expect(writes).toHaveLength(0)
  })

  it('refuses an un-finalized record owned by another run, child, domain or mode', async () => {
    const cases: Array<Record<string, unknown>> = [
      { questRunId: 'interactive_child-1_9999' },
      { childId: 'other-child' },
      { domain: 'math' },
      { questMode: 'comprehension' },
      { sessionType: 'guided' },
    ]
    for (const overrides of cases) {
      store.clear()
      writes.length = 0
      seed(PATH, {
        childId: CHILD,
        sessionType: 'interactive',
        domain: 'reading',
        questMode: 'phonics',
        questRunId: RUN,
        status: 'partial',
        ...overrides,
      })
      expect(await saveFinalQuestSource(ref(), payload())).toBe('conflict')
      expect(writes).toHaveLength(0)
    }
  })

  it('throws on a transport failure, so the caller keeps its payload', async () => {
    transactionError = new Error('offline')
    await expect(saveFinalQuestSource(ref(), payload())).rejects.toThrow('offline')
  })
})

describe('saveResumableQuestSource', () => {
  const partial = () => payload({ status: 'partial', sourceCommittedAt: undefined })

  it('writes the resumable partial when nothing is finalized', async () => {
    expect(await saveResumableQuestSource(ref(), partial())).toBe('saved')
    expect(writes).toHaveLength(1)
  })

  it('REFUSES to overwrite a finalized record', async () => {
    seed(PATH, stored())
    expect(await saveResumableQuestSource(ref(), partial())).toBe('refused-finalized')
    expect(writes).toHaveLength(0)
  })

  it('refuses over an insufficient close, which is committed though it reads partial', async () => {
    seed(PATH, stored({ status: 'partial' }))
    expect(await saveResumableQuestSource(ref(), partial())).toBe('refused-finalized')
    expect(writes).toHaveLength(0)
  })

  it('refuses a record owned by another run or child', async () => {
    seed(PATH, {
      childId: 'other-child',
      sessionType: 'interactive',
      domain: 'reading',
      status: 'partial',
    })
    expect(await saveResumableQuestSource(ref(), partial())).toBe('refused-mismatch')
    expect(writes).toHaveLength(0)
  })

  /** A manual exit that could not reach Firestore is reported, not lost. */
  it('throws on a transport failure so the exit can hold its payload', async () => {
    transactionError = new Error('offline')
    await expect(saveResumableQuestSource(ref(), partial())).rejects.toThrow('offline')
  })
})

/**
 * The Resume claim: re-read, judge and stamp in ONE transaction, returning the
 * EXACT partial it accepted. Three things used to be able to disagree — the
 * copy the card loaded, the copy the eligibility check read, and the record the
 * detached stamp landed on.
 */
describe('claimQuestSourceForResume', () => {
  const resumable = {
    childId: CHILD,
    sessionType: 'interactive',
    domain: 'reading',
    questMode: 'phonics',
    questRunId: RUN,
    status: 'partial',
    savedQuestState: { currentLevel: 2 },
    savedCurrentQuestion: { id: 'q-saved' },
    summary: 'the stored one',
  }

  it('accepts, stamps `resumed`, and hands back the stored partial', async () => {
    seed(PATH, resumable)
    const claim = await claimQuestSourceForResume(ref(), { childId: CHILD })
    expect(claim.ok).toBe(true)
    expect(claim.ok && claim.source.summary).toBe('the stored one')
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ data: { status: 'resumed' }, merge: true })
  })

  it('accepts an already-resumed record, so a double tap converges', async () => {
    seed(PATH, { ...resumable, status: 'resumed' })
    expect((await claimQuestSourceForResume(ref(), { childId: CHILD })).ok).toBe(true)
  })

  it('accepts a legacy in-progress partial with no run id and no plan', async () => {
    seed(PATH, {
      childId: CHILD,
      sessionType: 'interactive',
      domain: 'reading',
      status: 'in-progress',
      savedQuestState: { currentLevel: 2 },
      savedCurrentQuestion: { id: 'q-saved' },
    })
    expect((await claimQuestSourceForResume(ref(), { childId: CHILD })).ok).toBe(true)
  })

  it('stamps NOTHING when it refuses', async () => {
    const cases: Array<[Record<string, unknown> | null, string]> = [
      [null, 'missing'],
      [{ ...resumable, status: 'complete' }, 'finalized'],
      [{ ...resumable, sourceCommittedAt: NOW }, 'finalized'],
      [{ ...resumable, status: 'abandoned' }, 'abandoned'],
      [{ ...resumable, status: 'something-else' }, 'not-resumable'],
      [{ ...resumable, childId: 'other-child' }, 'wrong-child'],
      [{ ...resumable, savedCurrentQuestion: undefined }, 'no-resume-point'],
      [{ ...resumable, sessionType: 'fluency' }, 'not-interactive'],
    ]
    for (const [record, refusal] of cases) {
      store.clear()
      writes.length = 0
      if (record) seed(PATH, record)
      const claim = await claimQuestSourceForResume(ref(), { childId: CHILD })
      expect(claim.ok, refusal).toBe(false)
      expect(!claim.ok && claim.refusal).toBe(refusal)
      expect(writes).toHaveLength(0)
    }
  })
})

/** *Start fresh instead* — the same guarded transition, never a bare update. */
describe('abandonQuestSource', () => {
  const resumable = {
    childId: CHILD,
    sessionType: 'interactive',
    domain: 'reading',
    status: 'partial',
    savedQuestState: { currentLevel: 2 },
    savedCurrentQuestion: { id: 'q-saved' },
  }

  it('closes out an eligible partial', async () => {
    seed(PATH, resumable)
    expect(await abandonQuestSource(ref(), { childId: CHILD })).toBe('abandoned')
    expect(writes[0]).toMatchObject({ data: { status: 'abandoned' }, merge: true })
  })

  /** A partial whose saved question never landed is not resumable — but it IS
   *  the row the card's secondary action is offered for. */
  it('closes out a partial with no resume point', async () => {
    seed(PATH, { ...resumable, savedCurrentQuestion: undefined })
    expect(await abandonQuestSource(ref(), { childId: CHILD })).toBe('abandoned')
  })

  it('never clobbers a completed source', async () => {
    seed(PATH, stored())
    expect(await abandonQuestSource(ref(), { childId: CHILD })).toBe('refused')
    expect(writes).toHaveLength(0)
  })

  /**
   * A `resumed` row is reoffered on the intro now, so an older card can reach
   * this write for a run that may still be open in another tab — where
   * `abandoned` would land on that run's only saved point. Resume converges on
   * it; discard is refused.
   */
  it('refuses a stored `resumed` record, which may still be live', async () => {
    seed(PATH, { ...resumable, status: 'resumed' })
    expect(await abandonQuestSource(ref(), { childId: CHILD })).toBe('refused')
    expect(writes).toHaveLength(0)
  })

  it('still closes out a legacy in-progress row', async () => {
    seed(PATH, { ...resumable, status: 'in-progress' })
    expect(await abandonQuestSource(ref(), { childId: CHILD })).toBe('abandoned')
  })

  it('never clobbers another child’s source', async () => {
    seed(PATH, { ...resumable, childId: 'other-child' })
    expect(await abandonQuestSource(ref(), { childId: CHILD })).toBe('refused')
    expect(writes).toHaveLength(0)
  })

  it('converges on an already-abandoned record and writes nothing', async () => {
    seed(PATH, { ...resumable, status: 'abandoned' })
    expect(await abandonQuestSource(ref(), { childId: CHILD })).toBe('already-abandoned')
    expect(writes).toHaveLength(0)
  })

  it('reports a missing record rather than creating one', async () => {
    expect(await abandonQuestSource(ref(), { childId: CHILD })).toBe('missing')
    expect(writes).toHaveLength(0)
  })
})
