import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX-495 — the pilot's ONE observation, projected from the acknowledged,
 * sufficient, finalized saved source.
 *
 * The same harness as `questModelSync.test.ts` (the fake Firestore keyed by
 * document path; the pure helpers, the completion gate and the model
 * transaction all run for real), extended with what this pilot owns:
 *
 *   • one valid answered probe row counts ONCE under the exact concept, for a
 *     correct answer and for a wrong one alike;
 *   • concept state, the change feed and synthesis freshness are left alone —
 *     one observation is below the existing two-probe upgrade threshold;
 *   • NO queued request identity is passed or resolved, so a same-concept ask
 *     queued while the run was in progress is still waiting afterwards;
 *   • a skip, a flagged row, a duplicate claim, invalid provenance, a provider
 *     echo and a legacy record add no probe evidence;
 *   • a replay of the same source converges and writes nothing twice;
 *   • a failed transaction leaves the source `pending` — the existing
 *     source-only retry path.
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
import {
  MINE_ADDITION_PROBE_CONCEPT,
  MINE_ADDITION_PROBE_LEVEL,
  MINE_ADDITION_PROBE_SKILL,
  MINE_ADDITION_PROBE_TEMPLATE_ID,
  mineAdditionProbeStamp,
} from './mineAdditionProbe'
import { MINE_ADDITION_PROBE_KIND } from './questTypes'
import type { MineAdditionPilotTarget, QuestLocalProbeStamp } from './questTypes'
import type { LearnerModel, OpenQuestion } from '../../core/types/learnerModel'

const FAM = 'fam-1'
const CHILD = 'lincoln'
const SESSION = 'interactive_lincoln_1000'
const ADD = MINE_ADDITION_PROBE_CONCEPT
const GENERATION = '2026-11-10T08:00:00.000Z'
const ANSWERED_AT = '2026-11-10T09:00:00.000Z'
const APPLIED_AT = '2026-11-10T09:00:30.000Z'
const MODEL_SEEDED = '2026-07-01T00:00:00.000Z'

const modelPath = `models-${FAM}/${CHILD}`
const sessionPath = `sessions-${FAM}/${SESSION}`

const PILOT: MineAdditionPilotTarget = {
  kind: MINE_ADDITION_PROBE_KIND,
  templateId: MINE_ADDITION_PROBE_TEMPLATE_ID,
  conceptId: ADD,
  offerSource: 'synthesis',
  synthesisGeneratedAt: GENERATION,
  level: MINE_ADDITION_PROBE_LEVEL,
}

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

/** An ordinary answered math row, carrying no provenance. */
function answer(i: number, extra: Record<string, unknown> = {}) {
  return {
    id: `q${i}`,
    type: 'multiple-choice',
    level: 2,
    skill: MINE_ADDITION_PROBE_SKILL,
    prompt: `What is ${i} + 1?`,
    options: ['1', '2', '3'],
    correctAnswer: '2',
    childAnswer: '2',
    correct: true,
    responseTimeMs: 1000,
    timestamp: ANSWERED_AT,
    ...extra,
  }
}

/** The probe's own answered row, with its checked provenance. */
function probe(extra: Record<string, unknown> = {}) {
  return {
    id: 'q_pilot_1',
    type: 'multiple-choice',
    level: MINE_ADDITION_PROBE_LEVEL,
    skill: MINE_ADDITION_PROBE_SKILL,
    prompt: 'What is 8 + 7?',
    stimulus: '8 + 7',
    options: ['14', '15', '16'],
    correctAnswer: '15',
    childAnswer: '15',
    correct: true,
    responseTimeMs: 5200,
    timestamp: ANSWERED_AT,
    inputMethod: 'multiple-choice',
    targetConceptId: ADD,
    localProbe: mineAdditionProbeStamp(PILOT),
    ...extra,
  }
}

/** Five counted answers — the probe plus four ordinary ones. */
function fiveWithProbe(probeExtra: Record<string, unknown> = {}) {
  return [probe(probeExtra), answer(1), answer(2), answer(3), answer(4)]
}

/** A committed, sufficient pilot source: a Math run with the accepted target. */
function source(partial: Record<string, unknown> = {}) {
  return {
    childId: CHILD,
    sessionType: 'interactive',
    status: 'complete',
    domain: 'math',
    questMode: 'math',
    questRunId: SESSION,
    evaluatedAt: ANSWERED_AT,
    sourceCommittedAt: ANSWERED_AT,
    modelProjection: 'pending',
    // The pilot carries NO queued request identity.
    targetPlan: [],
    pilotProbe: PILOT,
    questions: fiveWithProbe(),
    ...partial,
  }
}

function writtenModel() {
  return writes.find((w) => w.path === modelPath)?.data as Partial<LearnerModel> | undefined
}

function writtenSourceStamp() {
  return writes.find((w) => w.path === sessionPath)?.data as Record<string, unknown> | undefined
}

async function project() {
  return projectQuestSourceToModel({
    familyId: FAM,
    childId: CHILD,
    sessionId: SESSION,
    nowIso: APPLIED_AT,
    expectedDomain: 'math',
    expectedQuestMode: 'math',
  })
}

beforeEach(() => {
  store.clear()
  writes.length = 0
  transactionError = null
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('the pilot observation that reaches the graph', () => {
  it('counts the single valid answered probe once, under the exact concept', async () => {
    seed(modelPath, model({ conceptStates: { [ADD]: { state: 'forming', evidence: [] } } }))
    seed(sessionPath, source())

    expect(await project()).toBe('projected')

    const next = writtenModel()!
    const entry = next.conceptStates![ADD]
    const refs = entry.evidence.filter((e) => e.kind === 'quest' && e.sourceId === SESSION)
    expect(refs).toHaveLength(1)
    expect(refs[0].note).toContain('1/1')
    // Dated by OBSERVATION, as every quest evidence ref is.
    expect(refs[0].observedAt).toBe(ANSWERED_AT)
    // One observation is below the two-probe threshold: state is untouched…
    expect(entry.state).toBe('forming')
    // …so there is no change line and no synthesis staleness from this.
    expect(next.changeFeed).toHaveLength(0)
    expect(next.synthesisStaleAt).toBeUndefined()
    expect(writtenSourceStamp()).toMatchObject({ modelProjection: 'projected' })
  })

  it('counts a WRONG answer once too, and still leaves state alone', async () => {
    seed(modelPath, model({ conceptStates: { [ADD]: { state: 'frontier', evidence: [] } } }))
    seed(sessionPath, source({ questions: fiveWithProbe({ childAnswer: '14', correct: false }) }))

    expect(await project()).toBe('projected')

    const entry = writtenModel()!.conceptStates![ADD]
    expect(entry.evidence.filter((e) => e.sourceId === SESSION)[0].note).toContain('0/1')
    expect(entry.state).toBe('frontier')
    expect(writtenModel()!.changeFeed).toHaveLength(0)
  })

  it('records the observation for a concept with no state entry yet, without upgrading it', async () => {
    seed(modelPath, model())
    seed(sessionPath, source())

    expect(await project()).toBe('projected')
    const entry = writtenModel()!.conceptStates![ADD]
    expect(entry.state).toBe('not-yet')
    expect(entry.evidence).toHaveLength(1)
  })

  it('passes no queued request identity: a same-concept ask queued mid-run stays waiting', async () => {
    // The ask was appended while the child was playing — the source's plan is
    // empty, so there is nothing for this result to resolve.
    seed(modelPath, model({ openQuestions: [ask(ADD)] }))
    seed(sessionPath, source())

    expect(await project()).toBe('projected')

    const next = writtenModel()!
    expect(next.openQuestions![0].resolvedAt).toBeUndefined()
    expect(next.openQuestions![0].resolvedBySessionId).toBeUndefined()
  })

  it('converges on a replay: no second evidence ref and no repeated write', async () => {
    seed(modelPath, model())
    seed(sessionPath, source())
    expect(await project()).toBe('projected')

    // Apply what was written, then project the same source again.
    const applied = { ...model(), ...writtenModel() } as LearnerModel
    seed(modelPath, applied)
    seed(sessionPath, { ...source(), modelProjection: 'pending' })
    writes.length = 0

    expect(await project()).toBe('already-projected')
    expect(writtenModel()).toBeUndefined()
    expect(writtenSourceStamp()).toMatchObject({ modelProjectionOutcome: 'already-projected' })
  })

  it('leaves the source recoverable when the transaction fails', async () => {
    seed(modelPath, model())
    seed(sessionPath, source())
    transactionError = new Error('unavailable')

    await expect(project()).rejects.toThrow('unavailable')
    expect(writes).toHaveLength(0)
    expect((store.get(sessionPath) as { modelProjection: string }).modelProjection).toBe('pending')
  })
})

describe('what adds no probe evidence', () => {
  /** One helper: seed a model and a source variant, project, read the outcome. */
  async function outcomeFor(partial: Record<string, unknown>) {
    store.clear()
    writes.length = 0
    seed(modelPath, model())
    seed(sessionPath, source(partial))
    return project()
  }

  it('a skipped probe — honestly no results, nothing written to the model', async () => {
    expect(await outcomeFor({ questions: [...fiveWithProbe({ skipped: true, correct: false }), answer(5)] })).toBe(
      'no-results',
    )
    expect(writtenModel()).toBeUndefined()
    expect(writtenSourceStamp()).toMatchObject({
      modelProjection: 'skipped',
      modelProjectionOutcome: 'no-results',
    })
  })

  it('a flagged (broken) probe row', async () => {
    expect(
      await outcomeFor({ questions: [...fiveWithProbe({ flaggedAsError: true }), answer(5)] }),
    ).toBe('no-results')
    expect(writtenModel()).toBeUndefined()
  })

  it('invalid provenance — the arithmetic does not check out', async () => {
    const bad = mineAdditionProbeStamp(PILOT)
    expect(
      await outcomeFor({
        questions: fiveWithProbe({ localProbe: { ...bad, expectedAnswer: '16' } }),
      }),
    ).toBe('no-results')
    expect(writtenModel()).toBeUndefined()
  })

  it('a provenance stamp from a DIFFERENT synthesis generation than the source accepted', async () => {
    const other = mineAdditionProbeStamp({ ...PILOT, synthesisGeneratedAt: '2026-01-01T00:00:00.000Z' })
    expect(await outcomeFor({ questions: fiveWithProbe({ localProbe: other }) })).toBe('no-results')
  })

  it('two rows claiming to be the probe', async () => {
    expect(
      await outcomeFor({
        questions: [probe(), probe({ id: 'q_pilot_2' }), answer(1), answer(2), answer(3)],
      }),
    ).toBe('no-results')
    expect(writtenModel()).toBeUndefined()
  })

  it('a provider question that merely echoed the concept, with no probe at all', async () => {
    expect(
      await outcomeFor({
        pilotProbe: undefined,
        questions: [answer(1, { targetConceptId: ADD }), answer(2), answer(3), answer(4), answer(5)],
      }),
    ).toBe('no-targets')
    expect(writtenModel()).toBeUndefined()
  })

  it('an echoed provider row beside the real probe does not become a second observation', async () => {
    expect(
      await outcomeFor({
        questions: [
          probe(),
          answer(1, { targetConceptId: ADD, correct: false }),
          answer(2),
          answer(3),
          answer(4),
        ],
      }),
    ).toBe('projected')
    const refs = writtenModel()!.conceptStates![ADD].evidence
    expect(refs).toHaveLength(1)
    // 1/1 — the probe's own answer only, not 1/2 with the provider row folded in.
    expect(refs[0].note).toContain('1/1')
  })

  it('a malformed stored pilot target, or a legacy record with none', async () => {
    expect(
      await outcomeFor({ pilotProbe: { kind: 'mine-addition-pilot' } as unknown as MineAdditionPilotTarget }),
    ).toBe('no-results')
    expect(await outcomeFor({ pilotProbe: undefined, questions: fiveWithProbe() })).toBe('no-targets')
  })

  it('a malformed probe stamp on the row', async () => {
    expect(
      await outcomeFor({
        questions: fiveWithProbe({ localProbe: { nonsense: true } as unknown as QuestLocalProbeStamp }),
      }),
    ).toBe('no-results')
  })

  it('another mode or another level than the pilot was authorised for', async () => {
    // The source says phonics; the projection's own expectation is math, so the
    // identity check refuses it before anything else.
    expect(await outcomeFor({ questMode: 'phonics' })).toBe('identity-mismatch')
    // A level-5 probe row is not the checked item.
    expect(await outcomeFor({ questions: fiveWithProbe({ level: 5 }) })).toBe('no-results')
  })

  it('an insufficient close — the probe is preserved on a partial and projects nothing', async () => {
    expect(await outcomeFor({ status: 'partial', questions: [probe(), answer(1)] })).toBe(
      'not-finalized',
    )
    expect(writes).toHaveLength(0)
  })

  it('a source whose save was never acknowledged', async () => {
    expect(await outcomeFor({ sourceCommittedAt: undefined })).toBe('not-finalized')
    expect(writes).toHaveLength(0)
  })
})
