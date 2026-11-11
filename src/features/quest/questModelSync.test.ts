import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX-494 — the graph projection reads the SAVED SOURCE, inside the model's own
 * transaction.
 *
 * The baseline defects this file pins, from the authorised design's synthetic
 * reproductions at the base tree:
 *
 *   1. a DENIED five-answer save still wrote evidence and closed a parent's
 *      request — the model recorded a source that does not exist;
 *   2. two tagged answers then a null provider response saved `partial` and
 *      changed the graph anyway, past the completion gate;
 *   3. a new same-concept request appended while the child was playing was
 *      consumed by the old run;
 *   4. replaying one source duplicated its evidence and could promote twice.
 *
 * …plus what this run owns: identity is validated against the stored document
 * (owner, run id, domain, mode, and the completion gate re-applied to the
 * answers that were actually stored), evidence is dated by OBSERVATION while
 * model freshness is dated by APPLICATION, and an absent model or empty
 * eligible result is an honest outcome rather than a fake evidence success.
 *
 * The pure `questTargeting` helpers, `questBanking`'s completion gate and
 * `modelTransaction` all run for real — only Firestore is faked.
 */

// ── A fake Firestore keyed by document path ────────────────────
//
// The store holds `unknown`, not `Record<string, unknown>`: a typed fixture
// (`LearnerModel`, the stored-source shape) has no index signature, so a
// `Record` boundary would reject exactly the fixtures these tests want to seed.
// The seam is here, in the mock, rather than loosened on the app's own types.
const store = new Map<string, unknown>()
const writes: Array<{ path: string; data: Record<string, unknown>; merge: boolean }> = []
let transactionError: Error | null = null

/** Seed one document at a path. Typed fixtures in, opaque storage out. */
function seed(path: string, value: object): void {
  store.set(path, value)
}

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
const MATH_ADD = 'math.operations.addWithin20'
/** When the child answered — the evidence's own date. */
const ANSWERED_AT = '2026-11-09T09:00:00.000Z'
/** When a (possibly much later) retry applied it — the model's freshness. */
const APPLIED_AT = '2026-11-10T12:00:00.000Z'
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

/** One answered question, in the stored shape the projection counts. */
function answer(i: number, extra: Record<string, unknown> = {}) {
  return {
    id: `q${i}`,
    type: 'multiple-choice',
    level: 2,
    skill: 'phonics.cvc',
    prompt: `q${i}`,
    options: ['a', 'b', 'c'],
    correctAnswer: 'a',
    childAnswer: 'a',
    correct: true,
    responseTimeMs: 1000,
    timestamp: ANSWERED_AT,
    ...extra,
  }
}

/**
 * FIVE real counted answers — the existing `hasSufficientCompletion` floor, now
 * re-applied to what was actually STORED rather than trusting the `complete`
 * label. Two of them probe the plan's concept.
 */
function fiveAnswers(tagged: Record<string, unknown>[] = [{ targetConceptId: CVC }, { targetConceptId: CVC }]) {
  const rows = tagged.map((extra, i) => answer(i, extra))
  while (rows.length < 5) rows.push(answer(rows.length))
  return rows
}

function planFor(conceptId: string, rowIndex = 0, row: OpenQuestion = ask(conceptId)) {
  return [{ conceptId, rowIndex, digest: questAskDigest(row), modelSeededAt: MODEL_SEEDED }]
}

/** A committed, sufficient source carrying one selected request for `CVC`. */
function source(partial: Record<string, unknown> = {}) {
  return {
    childId: CHILD,
    sessionType: 'interactive',
    status: 'complete',
    domain: 'reading',
    questMode: 'phonics',
    questRunId: SESSION,
    evaluatedAt: ANSWERED_AT,
    sourceCommittedAt: ANSWERED_AT,
    modelProjection: 'pending',
    targetPlan: planFor(CVC),
    questions: fiveAnswers(),
    ...partial,
  }
}

function writtenModel() {
  return writes.find((w) => w.path === modelPath)?.data as Partial<LearnerModel> | undefined
}

function writtenSourceStamp() {
  return writes.find((w) => w.path === sessionPath)?.data as Record<string, unknown> | undefined
}

async function project(expect: { domain?: string; questMode?: string } = {}) {
  return projectQuestSourceToModel({
    familyId: FAM,
    childId: CHILD,
    sessionId: SESSION,
    nowIso: APPLIED_AT,
    expectedDomain: expect.domain,
    expectedQuestMode: expect.questMode,
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
    seed(modelPath, model({
      conceptStates: { [CVC]: { state: 'forming', evidence: [] } },
      openQuestions: [ask(CVC)],
    }))
    seed(sessionPath, source())

    expect(await project({ domain: 'reading', questMode: 'phonics' })).toBe('projected')

    const next = writtenModel()!
    const entry = next.conceptStates![CVC]
    expect(entry.evidence.filter((e) => e.kind === 'quest' && e.sourceId === SESSION)).toHaveLength(1)
    expect(entry.state).toBe('solid') // forming + all-correct, min 2 — the existing rule
    expect(next.openQuestions![0].resolvedAt).toBe(APPLIED_AT)
    expect(next.openQuestions![0].resolvedBySessionId).toBe(SESSION)
    expect(next.synthesisStaleAt).toBe(APPLIED_AT)
    expect(writtenSourceStamp()).toMatchObject({ modelProjection: 'projected' })
  })

  /** Baseline 1 — a denied save wrote evidence and closed a request. */
  it('writes NOTHING when the source document does not exist (a denied save)', async () => {
    seed(modelPath, model({ openQuestions: [ask(CVC)] }))

    expect(await project()).toBe('identity-mismatch')
    expect(writes).toHaveLength(0)
  })

  it('writes nothing for a source with no commit stamp (never acknowledged)', async () => {
    seed(modelPath, model({ openQuestions: [ask(CVC)] }))
    seed(sessionPath, source({ sourceCommittedAt: undefined }))

    expect(await project()).toBe('not-finalized')
    expect(writes).toHaveLength(0)
  })

  /** Baseline 2 — an insufficient close saved partial yet changed the graph. */
  it('leaves the graph and the request alone for an insufficient (partial) source', async () => {
    seed(modelPath, model({ openQuestions: [ask(CVC)] }))
    seed(sessionPath, source({ status: 'partial', questions: fiveAnswers().slice(0, 2) }))

    expect(await project()).toBe('not-finalized')
    expect(writes).toHaveLength(0) // the request is still waiting
  })

  /** The gate is re-applied to the STORED answers, not to the stored label. */
  it('refuses a source LABELLED complete whose stored answers are not sufficient', async () => {
    seed(modelPath, model({ openQuestions: [ask(CVC)] }))
    seed(sessionPath, source({ questions: fiveAnswers().slice(0, 3) }))

    expect(await project()).toBe('not-finalized')
    expect(writes).toHaveLength(0)
  })

  it('counts neither skipped nor flagged answers toward the completion gate', async () => {
    seed(modelPath, model({ openQuestions: [ask(CVC)] }))
    seed(
      sessionPath,
      source({
        questions: [
          answer(0, { targetConceptId: CVC }),
          answer(1, { targetConceptId: CVC }),
          answer(2, { skipped: true, correct: false }),
          answer(3, { flaggedAsError: true }),
          answer(4),
        ],
      }),
    )

    expect(await project()).toBe('not-finalized') // three counted, floor is five
    expect(writes).toHaveLength(0)
  })

  it('refuses a source belonging to another child', async () => {
    seed(modelPath, model())
    seed(sessionPath, source({ childId: 'other-child' }))

    expect(await project()).toBe('identity-mismatch')
    expect(writes).toHaveLength(0)
  })

  it('refuses a source whose committed run id is not its own document id', async () => {
    seed(modelPath, model())
    seed(sessionPath, source({ questRunId: 'interactive_child-1_9999' }))

    expect(await project()).toBe('identity-mismatch')
    expect(writes).toHaveLength(0)
  })

  it('refuses a source whose domain or mode is not the one asked for', async () => {
    seed(modelPath, model({ openQuestions: [ask(CVC)] }))
    seed(sessionPath, source())

    expect(await project({ domain: 'math' })).toBe('identity-mismatch')
    expect(await project({ questMode: 'comprehension' })).toBe('identity-mismatch')
    expect(writes).toHaveLength(0)
  })

  it('refuses a model document that belongs to another child', async () => {
    seed(modelPath, model({ childId: 'other-child', openQuestions: [ask(CVC)] }))
    seed(sessionPath, source())

    expect(await project()).toBe('identity-mismatch')
    expect(writes).toHaveLength(0)
  })

  it('refuses a corrupt questions array rather than guessing at it', async () => {
    seed(modelPath, model({ openQuestions: [ask(CVC)] }))
    seed(sessionPath, source({ questions: 'five of five' }))
    expect(await project()).toBe('identity-mismatch')

    writes.length = 0
    seed(sessionPath, source({ questions: [answer(0), null, answer(2)] }))
    expect(await project()).toBe('identity-mismatch')

    writes.length = 0
    seed(sessionPath, source({ questions: [...fiveAnswers(), { id: 'q9' }] }))
    expect(await project()).toBe('identity-mismatch')
    expect(writes).toHaveLength(0)
  })

  it('refuses a source that is not an interactive quest', async () => {
    seed(modelPath, model())
    seed(sessionPath, source({ sessionType: 'guided' }))

    expect(await project()).toBe('identity-mismatch')
    expect(writes).toHaveLength(0)
  })
})

describe('projectQuestSourceToModel — honest empty outcomes', () => {
  it('reports no-targets, and claims no evidence, for a source with no plan', async () => {
    seed(modelPath, model({ openQuestions: [ask(CVC)] }))
    seed(sessionPath, source({ targetPlan: [] }))

    expect(await project()).toBe('no-targets')
    expect(writtenModel()).toBeUndefined()
    expect(writtenSourceStamp()).toMatchObject({
      modelProjection: 'skipped',
      modelProjectionOutcome: 'no-targets',
    })
  })

  it('reports no-targets for a plan whose concept is outside the source domain', async () => {
    // A reading session may not resolve a math request, which is the same rule
    // `selectQuestTargets` applies when it hands targets out.
    seed(modelPath, model({ openQuestions: [ask(MATH_ADD)] }))
    seed(
      sessionPath,
      source({
        targetPlan: planFor(MATH_ADD),
        questions: fiveAnswers([{ targetConceptId: MATH_ADD }, { targetConceptId: MATH_ADD }]),
      }),
    )

    expect(await project()).toBe('no-targets')
    expect(writtenModel()).toBeUndefined()
  })

  it('reports a malformed plan as no-targets, writing no evidence', async () => {
    seed(modelPath, model({ openQuestions: [ask(CVC)] }))
    seed(sessionPath, source({ targetPlan: [{ conceptId: '', rowIndex: -1 }, 'nope'] }))

    expect(await project()).toBe('no-targets')
    expect(writtenModel()).toBeUndefined()
  })

  it('reports no-results when no counted answer probed the plan', async () => {
    seed(modelPath, model({ openQuestions: [ask(CVC)] }))
    seed(sessionPath, source({ questions: fiveAnswers([{}, {}]) }))

    expect(await project()).toBe('no-results')
    expect(writtenModel()).toBeUndefined()
    expect(writtenSourceStamp()).toMatchObject({ modelProjectionOutcome: 'no-results' })
  })

  it('leaves a source PENDING when the child has no model yet, claiming nothing', async () => {
    seed(sessionPath, source())

    expect(await project()).toBe('no-model')
    // No stamp at all: the work is real and still waiting, and a model created
    // tomorrow can still receive it.
    expect(writes).toHaveLength(0)
  })
})

describe('projectQuestSourceToModel — replay, concurrency and the late requeue', () => {
  /** Baseline 4 — one source replayed duplicated evidence and promoted twice. */
  it('a replay of one source adds no second evidence ref and no second promotion', async () => {
    seed(modelPath, model({
      conceptStates: { [CVC]: { state: 'forming', evidence: [] } },
      openQuestions: [ask(CVC)],
    }))
    seed(sessionPath, source())

    expect(await project()).toBe('projected')
    const firstPass = writtenModel()!
    expect(firstPass.changeFeed).toHaveLength(1)

    // Commit the first pass, as Firestore would, and replay the same source.
    seed(modelPath, { ...model(), ...firstPass })
    seed(sessionPath, source({ modelProjection: 'pending' }))
    writes.length = 0

    expect(await project()).toBe('already-projected')
    expect(writtenModel()).toBeUndefined() // no model write at all
    expect(writtenSourceStamp()).toMatchObject({ modelProjection: 'projected' })
  })

  it('a source already stamped projected converges without reading the plan again', async () => {
    seed(modelPath, model({ openQuestions: [ask(CVC)] }))
    seed(sessionPath, source({ modelProjection: 'projected' }))

    expect(await project()).toBe('already-projected')
    expect(writes).toHaveLength(0)
  })

  /** Baseline 3 — a new same-concept request was consumed by an old run. */
  it('resolves the selected row only, leaving a later same-concept request open', async () => {
    const original = ask(CVC)
    const appendedLater = ask(CVC, { reason: "Struggled during today's work" })
    seed(modelPath, model({
      conceptStates: { [CVC]: { state: 'frontier', evidence: [] } },
      openQuestions: [original, appendedLater],
    }))
    seed(sessionPath, source())

    expect(await project()).toBe('projected')

    const next = writtenModel()!
    expect(next.openQuestions![0].resolvedAt).toBe(APPLIED_AT) // the one it selected
    expect(next.openQuestions![1].resolvedAt).toBeUndefined() // appended after
  })

  it('leaves the original as found when its row moved under the plan', async () => {
    seed(modelPath, model({
      conceptStates: { [CVC]: { state: 'frontier', evidence: [] } },
      openQuestions: [ask(BLENDS), ask(CVC)],
    }))
    seed(sessionPath, source())

    expect(await project()).toBe('projected') // the evidence is still real
    expect(writtenModel()!.openQuestions!.every((q) => !q.resolvedAt)).toBe(true)
  })

  it('leaves every request alone when the model document was replaced (seededAt moved)', async () => {
    seed(modelPath, model({
      seededAt: '2026-10-01T00:00:00.000Z',
      conceptStates: { [CVC]: { state: 'frontier', evidence: [] } },
      openQuestions: [ask(CVC)],
    }))
    seed(sessionPath, source())

    expect(await project()).toBe('projected')
    expect(writtenModel()!.openQuestions![0].resolvedAt).toBeUndefined()
  })

  it('leaves an original somebody else already resolved exactly as found', async () => {
    seed(modelPath, model({
      conceptStates: { [CVC]: { state: 'frontier', evidence: [] } },
      openQuestions: [
        ask(CVC, { resolvedAt: '2026-11-09T00:00:00.000Z', resolvedBySessionId: 'other' }),
      ],
    }))
    seed(sessionPath, source())

    expect(await project()).toBe('projected')
    const resolved = writtenModel()!.openQuestions![0]
    expect(resolved.resolvedAt).toBe('2026-11-09T00:00:00.000Z')
    expect(resolved.resolvedBySessionId).toBe('other')
  })
})

describe('projectQuestSourceToModel — observation time vs application time', () => {
  it('dates the evidence when he ANSWERED and the model when it APPLIED', async () => {
    seed(modelPath, model({
      conceptStates: { [CVC]: { state: 'forming', evidence: [] } },
      openQuestions: [ask(CVC)],
    }))
    seed(sessionPath, source())

    await project()
    const next = writtenModel()!
    const ref = next.conceptStates![CVC].evidence.at(-1)!
    // A retry a day later must not post-date his answers…
    expect(ref.observedAt).toBe(ANSWERED_AT)
    expect(ref.note).toContain(ANSWERED_AT.slice(0, 10))
    // …nor backdate the model it just changed.
    expect(next.updatedAt).toBe(APPLIED_AT)
    expect(next.synthesisStaleAt).toBe(APPLIED_AT)
    expect(next.changeFeed!.at(-1)!.at).toBe(APPLIED_AT)
  })
})

describe('projectQuestSourceToModel — preserved behaviour', () => {
  it('promotes a no-data model once quest evidence lands (UX-322)', async () => {
    seed(modelPath, model({ status: 'no-data', openQuestions: [ask(CVC)] }))
    seed(sessionPath, source({ questions: fiveAnswers([{ targetConceptId: CVC, correct: false }]) }))

    expect(await project()).toBe('projected')
    expect(writtenModel()!.status).toBe('seeded')
  })

  it('does not mark the synthesis stale on an evidence-only append', async () => {
    seed(modelPath, model({
      conceptStates: { [CVC]: { state: 'solid', evidence: [] } },
      openQuestions: [ask(CVC)],
    }))
    seed(sessionPath, source({ questions: fiveAnswers([{ targetConceptId: CVC, correct: false }]) }))

    expect(await project()).toBe('projected')
    expect(writtenModel()!.synthesisStaleAt).toBeUndefined()
  })

  it('never downgrades a concept on a wrong answer (upgrade-only, no-shame)', async () => {
    seed(modelPath, model({
      conceptStates: { [CVC]: { state: 'solid', evidence: [] } },
      openQuestions: [ask(CVC)],
    }))
    seed(sessionPath, source({
      questions: fiveAnswers([
        { targetConceptId: CVC, correct: false },
        { targetConceptId: CVC, correct: false },
      ]),
    }))

    expect(await project()).toBe('projected')
    expect(writtenModel()!.conceptStates![CVC].state).toBe('solid')
  })

  it('merge-writes the model and scrubs undefined leaves', async () => {
    seed(modelPath, model({ openQuestions: [ask(CVC)] }))
    seed(sessionPath, source())

    await project()
    const modelWrite = writes.find((w) => w.path === modelPath)!
    expect(modelWrite.merge).toBe(true)
    expect('synthesis' in modelWrite.data).toBe(false)
  })

  it('THROWS on a transport failure, leaving the source pending for the retry', async () => {
    seed(modelPath, model({ openQuestions: [ask(CVC)] }))
    seed(sessionPath, source())
    transactionError = new Error('Firestore down')

    await expect(project()).rejects.toThrow('Firestore down')
    expect(writes).toHaveLength(0)
  })
})
