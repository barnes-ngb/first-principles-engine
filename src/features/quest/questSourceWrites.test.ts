import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX-494 — a quest source document is written conditionally, or not at all.
 *
 * Four hazards, one per case below:
 *   • a RETRY whose first attempt actually committed and lost its
 *     acknowledgement must be recognised, not written twice;
 *   • a payload from a DIFFERENT run must never overwrite a finalized record;
 *   • a late `resetToIntro` partial must never turn a completed session back
 *     into a resumable one;
 *   • a stale Resume must never stamp `status: 'resumed'` onto a finalized one.
 */

type Stored = Record<string, unknown> | undefined
const store = new Map<string, Stored>()
const writes: Array<{ path: string; data: Record<string, unknown>; merge: boolean }> = []
let transactionError: Error | null = null

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => path,
  doc: (col: string, id: string) => ({ path: `${col}/${id}` }),
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
  markQuestProjectionFailed,
  markQuestSourceResumed,
  questSourceRef,
  saveFinalQuestSource,
  saveResumableQuestSource,
  type QuestSourcePayload,
} from './questSourceWrites'

const FAM = 'fam-1'
const RUN = 'interactive_child-1_1000'
const PATH = `sessions-${FAM}/${RUN}`
const NOW = '2026-11-10T12:00:00.000Z'

function payload(partial: Partial<QuestSourcePayload> = {}): QuestSourcePayload {
  return {
    childId: 'child-1',
    domain: 'reading',
    status: 'complete',
    messages: [],
    findings: [],
    recommendations: [],
    summary: 'five of five',
    evaluatedAt: NOW,
    sessionType: 'interactive',
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

const ref = () => questSourceRef(FAM, RUN)

beforeEach(() => {
  store.clear()
  writes.length = 0
  transactionError = null
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('saveFinalQuestSource', () => {
  it('writes the payload when no record exists', async () => {
    expect(await saveFinalQuestSource(ref(), payload())).toBe('saved')
    expect(writes).toHaveLength(1)
    expect(writes[0].merge).toBe(false)
    expect(writes[0].data).toMatchObject({ questRunId: RUN, status: 'complete' })
  })

  it('finalizes over this run’s own resumable partial', async () => {
    store.set(PATH, { questRunId: RUN, status: 'partial', savedQuestState: {} })
    expect(await saveFinalQuestSource(ref(), payload())).toBe('saved')
    expect(writes).toHaveLength(1)
  })

  /** A committed acknowledgement lost before the retry. */
  it('recognises its own already-committed payload and writes nothing', async () => {
    store.set(PATH, { questRunId: RUN, status: 'complete', sourceCommittedAt: NOW })
    expect(await saveFinalQuestSource(ref(), payload())).toBe('already-committed')
    expect(writes).toHaveLength(0)
  })

  it('preserves a conflicting already-finalized source from another run', async () => {
    store.set(PATH, { questRunId: 'interactive_child-1_9999', status: 'complete', sourceCommittedAt: NOW })
    expect(await saveFinalQuestSource(ref(), payload())).toBe('conflict')
    expect(writes).toHaveLength(0)
  })

  it('preserves a LEGACY complete record, which carries no commit stamp', async () => {
    store.set(PATH, { status: 'complete', questions: [{ id: 'old' }] })
    expect(await saveFinalQuestSource(ref(), payload())).toBe('conflict')
    expect(writes).toHaveLength(0)
  })

  it('refuses a partial record stamped with a different run', async () => {
    store.set(PATH, { questRunId: 'interactive_child-1_9999', status: 'partial' })
    expect(await saveFinalQuestSource(ref(), payload())).toBe('conflict')
    expect(writes).toHaveLength(0)
  })

  it('throws on a transport failure, so the caller keeps its payload', async () => {
    transactionError = new Error('offline')
    await expect(saveFinalQuestSource(ref(), payload())).rejects.toThrow('offline')
  })
})

describe('saveResumableQuestSource', () => {
  it('writes the resumable partial when nothing is finalized', async () => {
    expect(await saveResumableQuestSource(ref(), payload({ status: 'partial', sourceCommittedAt: undefined }))).toBe('saved')
    expect(writes).toHaveLength(1)
  })

  it('REFUSES to overwrite a finalized record', async () => {
    store.set(PATH, { questRunId: RUN, status: 'complete', sourceCommittedAt: NOW })
    expect(await saveResumableQuestSource(ref(), payload({ status: 'partial', sourceCommittedAt: undefined }))).toBe('refused-finalized')
    expect(writes).toHaveLength(0)
  })

  it('refuses over an insufficient close, which is committed even though it reads partial', async () => {
    store.set(PATH, { questRunId: RUN, status: 'partial', sourceCommittedAt: NOW })
    expect(await saveResumableQuestSource(ref(), payload({ status: 'partial', sourceCommittedAt: undefined }))).toBe('refused-finalized')
    expect(writes).toHaveLength(0)
  })
})

describe('markQuestSourceResumed', () => {
  it('stamps a reopened partial', async () => {
    store.set(PATH, { questRunId: RUN, status: 'partial' })
    expect(await markQuestSourceResumed(ref())).toBe('marked')
    expect(writes[0]).toMatchObject({ data: { status: 'resumed' }, merge: true })
  })

  it('refuses a record that has since been finalized', async () => {
    store.set(PATH, { questRunId: RUN, status: 'complete', sourceCommittedAt: NOW })
    expect(await markQuestSourceResumed(ref())).toBe('refused-finalized')
    expect(writes).toHaveLength(0)
  })

  it('reports a missing record rather than creating one', async () => {
    expect(await markQuestSourceResumed(ref())).toBe('missing')
    expect(writes).toHaveLength(0)
  })
})

describe('markQuestProjectionFailed', () => {
  it('records the failure against the source so a reload can offer the retry', async () => {
    store.set(PATH, { questRunId: RUN, status: 'complete', sourceCommittedAt: NOW, modelProjection: 'pending' })
    expect(await markQuestProjectionFailed(ref(), RUN, 'offline', NOW)).toBe('marked')
    expect(writes[0].data).toMatchObject({
      modelProjection: 'failed',
      modelProjectionOutcome: 'offline',
      modelProjectionFailedAt: NOW,
    })
  })

  /** Overlapping retries: a late failure must not undo a retry that succeeded. */
  it('skips a source a concurrent retry has already projected', async () => {
    store.set(PATH, { questRunId: RUN, modelProjection: 'projected' })
    expect(await markQuestProjectionFailed(ref(), RUN, 'offline', NOW)).toBe('skipped')
    expect(writes).toHaveLength(0)
  })

  it('skips a source owned by another run', async () => {
    store.set(PATH, { questRunId: 'interactive_child-1_9999' })
    expect(await markQuestProjectionFailed(ref(), RUN, 'offline', NOW)).toBe('skipped')
    expect(writes).toHaveLength(0)
  })
})
