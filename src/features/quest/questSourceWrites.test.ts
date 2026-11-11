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
  canonicalQuestSourceContent,
  markQuestSourceResumed,
  questSourceRef,
  readQuestSource,
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

describe('markQuestSourceResumed', () => {
  const expectation = { childId: CHILD, questRunId: RUN, domain: 'reading', questMode: 'phonics' }

  it('stamps a reopened partial', async () => {
    seed(PATH, {
      childId: CHILD,
      sessionType: 'interactive',
      domain: 'reading',
      questMode: 'phonics',
      questRunId: RUN,
      status: 'partial',
    })
    expect(await markQuestSourceResumed(ref(), expectation)).toBe('marked')
    expect(writes[0]).toMatchObject({ data: { status: 'resumed' }, merge: true })
  })

  it('refuses a record that has since been finalized', async () => {
    seed(PATH, stored())
    expect(await markQuestSourceResumed(ref(), expectation)).toBe('refused-finalized')
    expect(writes).toHaveLength(0)
  })

  it('refuses a record this run does not own', async () => {
    seed(PATH, {
      childId: 'other-child',
      sessionType: 'interactive',
      status: 'partial',
    })
    expect(await markQuestSourceResumed(ref(), expectation)).toBe('refused-mismatch')
    expect(writes).toHaveLength(0)
  })

  it('reports a missing record rather than creating one', async () => {
    expect(await markQuestSourceResumed(ref(), expectation)).toBe('missing')
    expect(writes).toHaveLength(0)
  })
})

describe('readQuestSource', () => {
  it('returns what is stored now, or null', async () => {
    expect(await readQuestSource(ref())).toBeNull()
    seed(PATH, stored({ status: 'partial' }))
    expect(await readQuestSource(ref())).toMatchObject({ status: 'partial', questRunId: RUN })
  })
})
