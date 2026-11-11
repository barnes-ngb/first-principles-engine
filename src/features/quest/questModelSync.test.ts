import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX-494 — the graph projection reads the SAVED SOURCE, inside the model's own
 * transaction.
 *
 * The three baseline defects this file pins, from the authorised design's
 * synthetic reproductions at the base tree:
 *
 *   1. a DENIED five-answer save still wrote evidence and closed a parent's
 *      request — so the model recorded a source that does not exist;
 *   2. two tagged answers then a null provider response saved `partial` and
 *      changed the graph anyway, past the completion gate;
 *   3. replaying one source duplicated its evidence and could promote a concept
 *      twice.
 *
 * …plus the two this run owns: a new same-concept request appended while the
 * child was playing must stay OPEN, and an absent model / empty eligible result
 * must produce an honest outcome rather than a fake evidence success.
 *
 * The pure `questTargeting` helpers and `modelTransaction` run for real here —
 * only Firestore itself is faked — so the assertions are about the behaviour and
 * not about the mock.
 */

// ── A fake Firestore keyed by document path ────────────────────
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
  learnerModelsCollection: (familyId: string) => `models-${familyId}`,
  evaluationSessionsCollection: (familyId: string) => `sessions-${familyId}`,
}))

import { projectQuestSourceToModel } from './questModelSync'
import { questAskDigest } from '../../core/foundations/questTargeting'
import type { LearnerModel, OpenQuestion } from '../../core/types/learnerModel'

const FAM = 'fam-1'
const CHILD = 'child-1'
const SESSION = 'interactive_child-1_1000'
const CVC = 'reading.phonics.cvc'
const BLENDS = 'reading.phonics.blends'
const NOW = '2026-11-10T12:00:00.000Z'
const MODEL_SEEDED = '2026-07-01T00:00:00.000Z'

const modelPath = `models-${FAM}/${CHILD}`
const sessionPath = `sessions-${FAM}/${SESSION}`

function ask(conceptId: string, overrides: Partial<OpenQuestion> = {}): OpenQuestion {
  return {
    conceptId,
    question: `Test "${conceptId}" with a quick quest?`,
    routedTo: 'quest',
    reason: 'Parent asked to verify this by testing.',
    ...overrides,
  }
}

function model(partial: Partial<LearnerModel> = {}): LearnerModel {
  return {
    childId: CHILD,
    graphVersion: 'reading@1+math@1',
    status: 'seeded',
    conceptStates: {},
    modalityCalibration: {
      reading: { note: '' },
      writing: { note: '' },
      math: { note: '' },
    },
    whatMattersNext: [],
    changeFeed: [],
    openQuestions: [],
    seededAt: MODEL_SEEDED,
    updatedAt: MODEL_SEEDED,
    ...partial,
  }
}

/** A committed, sufficient source carrying one selected request for `CVC`. */
function source(partial: Record<string, unknown> = {}) {
  const row = ask(CVC)
  return {
    childId: CHILD,
    sessionType: 'interactive',
    status: 'complete',
    domain: 'reading',
    questRunId: SESSION,
    sourceCommittedAt: NOW,
    modelProjection: 'pending',
    targetPlan: [
      { conceptId: CVC, rowIndex: 0, digest: questAskDigest(row), modelSeededAt: MODEL_SEEDED },
    ],
    questions: [
      { targetConceptId: CVC, correct: true },
      { targetConceptId: CVC, correct: true },
    ],
    ...partial,
  }
}

function writtenModel() {
  return writes.find((w) => w.path === modelPath)?.data as Partial<LearnerModel> | undefined
}

function writtenSourceStamp() {
  return writes.find((w) => w.path === sessionPath)?.data as Record<string, unknown> | undefined
}

async function project(expectedRunId: string | undefined = SESSION) {
  return projectQuestSourceToModel({
    familyId: FAM,
    childId: CHILD,
    sessionId: SESSION,
    expectedRunId,
    nowIso: NOW,
  })
}

beforeEach(() => {
  store.clear()
  writes.length = 0
  transactionError = null
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('projectQuestSourceToModel — what reaches the graph at all', () => {
  it('projects evidence, the upgrade and the selected request for a committed complete source', async () => {
    store.set(modelPath, model({ conceptStates: { [CVC]: { state: 'forming', evidence: [] } }, openQuestions: [ask(CVC)] }))
    store.set(sessionPath, source())

    expect(await project()).toBe('projected')

    const next = writtenModel()!
    const entry = next.conceptStates![CVC]
    expect(entry.evidence.filter((e) => e.kind === 'quest' && e.sourceId === SESSION)).toHaveLength(1)
    expect(entry.state).toBe('solid') // forming + all-correct, min 2 — the existing rule
    expect(next.openQuestions![0].resolvedAt).toBe(NOW)
    expect(next.openQuestions![0].resolvedBySessionId).toBe(SESSION)
    expect(next.synthesisStaleAt).toBe(NOW)
    expect(writtenSourceStamp()).toMatchObject({ modelProjection: 'projected' })
  })

  /** Baseline 1 — a denied save wrote evidence and closed a request. */
  it('writes NOTHING when the source document does not exist (a denied save)', async () => {
    store.set(modelPath, model({ openQuestions: [ask(CVC)] }))

    expect(await project()).toBe('identity-mismatch')
    expect(writes).toHaveLength(0)
  })

  it('writes nothing for a source with no commit stamp (never acknowledged)', async () => {
    store.set(modelPath, model({ openQuestions: [ask(CVC)] }))
    store.set(sessionPath, source({ sourceCommittedAt: undefined }))

    expect(await project()).toBe('not-finalized')
    expect(writtenModel()).toBeUndefined()
  })

  /** Baseline 2 — an insufficient close saved partial yet changed the graph. */
  it('leaves the graph and the request alone for an insufficient (partial) source', async () => {
    store.set(modelPath, model({ openQuestions: [ask(CVC)] }))
    store.set(sessionPath, source({ status: 'partial', modelProjection: 'skipped' }))

    expect(await project()).toBe('not-finalized')
    expect(writtenModel()).toBeUndefined()
    // The request is still waiting — nothing was written to resolve it.
    expect(writes).toHaveLength(0)
  })

  it('refuses a source belonging to another child', async () => {
    store.set(modelPath, model())
    store.set(sessionPath, source({ childId: 'other-child' }))

    expect(await project()).toBe('identity-mismatch')
    expect(writes).toHaveLength(0)
  })

  it('refuses a source stamped with another run', async () => {
    store.set(modelPath, model())
    store.set(sessionPath, source({ questRunId: 'interactive_child-1_9999' }))

    expect(await project()).toBe('identity-mismatch')
    expect(writes).toHaveLength(0)
  })
})

describe('projectQuestSourceToModel — honest empty outcomes', () => {
  it('reports no-targets, and claims no evidence, for a source with no plan', async () => {
    store.set(modelPath, model({ openQuestions: [ask(CVC)] }))
    store.set(sessionPath, source({ targetPlan: [] }))

    expect(await project()).toBe('no-targets')
    expect(writtenModel()).toBeUndefined()
    expect(writtenSourceStamp()).toMatchObject({
      modelProjection: 'skipped',
      modelProjectionOutcome: 'no-targets',
    })
  })

  it('reports no-results when every answer for the plan was skipped or flagged', async () => {
    store.set(modelPath, model({ openQuestions: [ask(CVC)] }))
    store.set(
      sessionPath,
      source({
        questions: [
          { targetConceptId: CVC, correct: false, skipped: true },
          { targetConceptId: CVC, correct: true, flaggedAsError: true },
        ],
      }),
    )

    expect(await project()).toBe('no-results')
    expect(writtenModel()).toBeUndefined()
    expect(writtenSourceStamp()).toMatchObject({ modelProjectionOutcome: 'no-results' })
  })

  it('reports no-model, and writes no evidence claim, when the child has no model', async () => {
    store.set(sessionPath, source())

    expect(await project()).toBe('no-model')
    expect(writtenModel()).toBeUndefined()
    expect(writtenSourceStamp()).toMatchObject({
      modelProjection: 'skipped',
      modelProjectionOutcome: 'no-model',
    })
  })
})

describe('projectQuestSourceToModel — replay, concurrency and the late requeue', () => {
  /** Baseline 4 — one source replayed duplicated evidence and promoted twice. */
  it('a replay of one source adds no second evidence ref and no second promotion', async () => {
    store.set(modelPath, model({ conceptStates: { [CVC]: { state: 'forming', evidence: [] } }, openQuestions: [ask(CVC)] }))
    store.set(sessionPath, source())

    expect(await project()).toBe('projected')
    const firstPass = writtenModel()!
    expect(firstPass.changeFeed).toHaveLength(1)

    // Commit the first pass, as Firestore would, and replay the same source.
    store.set(modelPath, { ...model(), ...firstPass } as Record<string, unknown>)
    store.set(sessionPath, { ...source(), modelProjection: 'pending' })
    writes.length = 0

    expect(await project()).toBe('already-projected')
    expect(writtenModel()).toBeUndefined() // no model write at all
    expect(writtenSourceStamp()).toMatchObject({ modelProjection: 'projected' })
  })

  it('a source already stamped projected converges without reading the plan again', async () => {
    store.set(modelPath, model({ openQuestions: [ask(CVC)] }))
    store.set(sessionPath, source({ modelProjection: 'projected' }))

    expect(await project()).toBe('already-projected')
    expect(writes).toHaveLength(0)
  })

  /** Baseline 3 — a new same-concept request was consumed by an old run. */
  it('resolves the selected row only, leaving a later same-concept request open', async () => {
    const original = ask(CVC)
    const appendedLater = ask(CVC, { reason: "Struggled during today's work" })
    store.set(
      modelPath,
      model({
        conceptStates: { [CVC]: { state: 'frontier', evidence: [] } },
        openQuestions: [original, appendedLater],
      }),
    )
    store.set(sessionPath, source())

    expect(await project()).toBe('projected')

    const next = writtenModel()!
    expect(next.openQuestions![0].resolvedAt).toBe(NOW) // the one it selected
    expect(next.openQuestions![1].resolvedAt).toBeUndefined() // the one appended after
  })

  it('leaves the original as found when its row moved under the plan', async () => {
    // Someone prepended a row, so index 0 is no longer the selected ask.
    store.set(
      modelPath,
      model({
        conceptStates: { [CVC]: { state: 'frontier', evidence: [] } },
        openQuestions: [ask(BLENDS), ask(CVC)],
      }),
    )
    store.set(sessionPath, source())

    expect(await project()).toBe('projected') // evidence is still real
    const next = writtenModel()!
    expect(next.openQuestions!.every((q) => !q.resolvedAt)).toBe(true)
  })

  it('leaves every request alone when the model document was replaced (seededAt moved)', async () => {
    store.set(
      modelPath,
      model({
        seededAt: '2026-10-01T00:00:00.000Z',
        conceptStates: { [CVC]: { state: 'frontier', evidence: [] } },
        openQuestions: [ask(CVC)],
      }),
    )
    store.set(sessionPath, source())

    expect(await project()).toBe('projected')
    expect(writtenModel()!.openQuestions![0].resolvedAt).toBeUndefined()
  })

  it('leaves an original somebody else already resolved exactly as found', async () => {
    store.set(
      modelPath,
      model({
        conceptStates: { [CVC]: { state: 'frontier', evidence: [] } },
        openQuestions: [ask(CVC, { resolvedAt: '2026-11-09T00:00:00.000Z', resolvedBySessionId: 'other' })],
      }),
    )
    store.set(sessionPath, source())

    expect(await project()).toBe('projected')
    const resolved = writtenModel()!.openQuestions![0]
    expect(resolved.resolvedAt).toBe('2026-11-09T00:00:00.000Z')
    expect(resolved.resolvedBySessionId).toBe('other')
  })
})

describe('projectQuestSourceToModel — preserved behaviour', () => {
  it('promotes a no-data model once quest evidence lands (UX-322)', async () => {
    store.set(modelPath, model({ status: 'no-data', openQuestions: [ask(CVC)] }))
    store.set(sessionPath, source({ questions: [{ targetConceptId: CVC, correct: false }] }))

    expect(await project()).toBe('projected')
    expect(writtenModel()!.status).toBe('seeded')
  })

  it('does not mark the synthesis stale on an evidence-only append', async () => {
    store.set(modelPath, model({ conceptStates: { [CVC]: { state: 'solid', evidence: [] } }, openQuestions: [ask(CVC)] }))
    store.set(sessionPath, source({ questions: [{ targetConceptId: CVC, correct: false }] }))

    expect(await project()).toBe('projected')
    expect(writtenModel()!.synthesisStaleAt).toBeUndefined()
  })

  it('never downgrades a concept on a wrong answer (upgrade-only, no-shame)', async () => {
    store.set(modelPath, model({ conceptStates: { [CVC]: { state: 'solid', evidence: [] } }, openQuestions: [ask(CVC)] }))
    store.set(
      sessionPath,
      source({ questions: [{ targetConceptId: CVC, correct: false }, { targetConceptId: CVC, correct: false }] }),
    )

    expect(await project()).toBe('projected')
    expect(writtenModel()!.conceptStates![CVC].state).toBe('solid')
  })

  it('merge-writes the model and scrubs undefined leaves', async () => {
    store.set(modelPath, model({ openQuestions: [ask(CVC)] }))
    store.set(sessionPath, source())

    await project()
    const modelWrite = writes.find((w) => w.path === modelPath)!
    expect(modelWrite.merge).toBe(true)
    expect('synthesis' in modelWrite.data).toBe(false)
  })

  it('THROWS on a transport failure, so the caller can record it and keep the work pending', async () => {
    store.set(modelPath, model({ openQuestions: [ask(CVC)] }))
    store.set(sessionPath, source())
    transactionError = new Error('Firestore down')

    await expect(project()).rejects.toThrow('Firestore down')
    expect(writes).toHaveLength(0)
  })
})
