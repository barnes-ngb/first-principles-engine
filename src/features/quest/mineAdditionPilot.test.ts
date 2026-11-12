import { describe, expect, it } from 'vitest'

/**
 * UX-495 — WHETHER a Start may carry the probe at all.
 *
 * The pure half of the activation. Every refusal here is a case where the
 * ordinary calibrated Math Start must still run and no probe may be attached:
 * an ordinary or direct start (no request), another family or child, another
 * mode, another level, an ended trip, an uncalibrated or stale child, a changed
 * synthesis, an unusable generation, and — the asynchronous one — an eligible
 * queued ask that arrived between the card's commit and this Start's own read.
 */

import { resolveMineAdditionPilot } from './mineAdditionPilot'
import type { MineAdditionPilotRequest } from './mineAdditionPilot'
import {
  MINE_ADDITION_PROBE_CONCEPT,
  MINE_ADDITION_PROBE_TEMPLATE_ID,
} from './mineAdditionProbe'
import { MINE_ADDITION_PROBE_KIND } from './questTypes'
import { EvaluationDomain } from '../../core/types/enums'
import { SynthesisVehicle } from '../../core/types/learnerModel'
import type { LearnerModel, OpenQuestion } from '../../core/types/learnerModel'

const FAM = 'fam-1'
const CHILD = 'lincoln'
const GENERATION = '2026-11-10T08:00:00.000Z'
const CVC = 'reading.phonics.cvc'

type PilotModel = Pick<LearnerModel, 'openQuestions' | 'synthesis' | 'synthesisStaleAt'>

function model(partial: Partial<PilotModel> = {}): PilotModel {
  return {
    openQuestions: [],
    synthesis: {
      whatMattersNext: [
        {
          conceptId: MINE_ADDITION_PROBE_CONCEPT,
          kidName: 'Adding to 20',
          why: 'He is adding within 20 and nearly fluent.',
          suggestedVehicle: SynthesisVehicle.Quest,
        },
      ],
      narrative: '',
      openQuestionsSummary: [],
      generatedAt: GENERATION,
    },
    ...partial,
  }
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

function request(overrides: Partial<MineAdditionPilotRequest> = {}): MineAdditionPilotRequest {
  return {
    familyId: FAM,
    childId: CHILD,
    conceptId: MINE_ADDITION_PROBE_CONCEPT,
    domain: EvaluationDomain.Math,
    questMode: 'math',
    offerSource: 'synthesis',
    synthesisGeneratedAt: GENERATION,
    tripGeneration: 3,
    tripStillLive: () => true,
    ...overrides,
  }
}

function resolve(
  overrides: {
    request?: MineAdditionPilotRequest | null
    model?: PilotModel | null
    startLevel?: number
    domain?: EvaluationDomain
    questMode?: 'math' | 'phonics' | 'comprehension' | 'fluency'
    readingCalibrated?: boolean
    mathCalibrated?: boolean
    familyId?: string
    childId?: string
  } = {},
) {
  return resolveMineAdditionPilot({
    request: 'request' in overrides ? overrides.request : request(),
    familyId: overrides.familyId ?? FAM,
    childId: overrides.childId ?? CHILD,
    domain: overrides.domain ?? EvaluationDomain.Math,
    questMode: 'questMode' in overrides ? overrides.questMode : 'math',
    startLevel: overrides.startLevel ?? 2,
    model: 'model' in overrides ? overrides.model : model(),
    readingCalibrated: overrides.readingCalibrated ?? false,
    mathCalibrated: overrides.mathCalibrated ?? true,
  })
}

describe('resolveMineAdditionPilot — the accepted target', () => {
  it('accepts the child’s own synthesis-sourced suggested Start at the level-2 Math band', () => {
    expect(resolve()).toEqual({
      kind: MINE_ADDITION_PROBE_KIND,
      templateId: MINE_ADDITION_PROBE_TEMPLATE_ID,
      conceptId: MINE_ADDITION_PROBE_CONCEPT,
      offerSource: 'synthesis',
      synthesisGeneratedAt: GENERATION,
      level: 2,
    })
  })

  it('attaches nothing to an ordinary or direct start, which carries no request', () => {
    expect(resolve({ request: null })).toBeNull()
    expect(resolve({ request: undefined })).toBeNull()
  })

  it('refuses a request whose family or child is not the run’s own', () => {
    expect(resolve({ request: request({ familyId: 'fam-2' }) })).toBeNull()
    expect(resolve({ request: request({ childId: 'london' }) })).toBeNull()
    expect(resolve({ childId: '' })).toBeNull()
  })

  it('refuses another mode, another domain and another level', () => {
    expect(resolve({ questMode: 'phonics' })).toBeNull()
    expect(resolve({ domain: EvaluationDomain.Reading })).toBeNull()
    expect(resolve({ questMode: undefined })).toBeNull()
    expect(resolve({ startLevel: 3 })).toBeNull()
    expect(resolve({ startLevel: 1 })).toBeNull()
    // …and a request that disagrees with the run it is being made for.
    expect(resolve({ request: request({ questMode: 'phonics' }) })).toBeNull()
  })

  it('refuses a journey that is no longer the one the card was drawn for', () => {
    expect(resolve({ request: request({ tripStillLive: () => false }) })).toBeNull()
    expect(resolve({ request: request({ tripGeneration: 0 }) })).toBeNull()
    // A caller that cannot answer the question gets ordinary Math.
    expect(
      resolve({
        request: request({ tripStillLive: undefined as unknown as () => boolean }),
      }),
    ).toBeNull()
  })

  it('refuses an offer that is not this concept, or did not come from synthesis', () => {
    expect(resolve({ request: request({ conceptId: CVC }) })).toBeNull()
    expect(resolve({ request: request({ offerSource: 'ask' }) })).toBeNull()
  })

  it('requires a usable synthesis generation, and the SAME one', () => {
    expect(resolve({ request: request({ synthesisGeneratedAt: '' }) })).toBeNull()
    expect(resolve({ request: request({ synthesisGeneratedAt: '   ' }) })).toBeNull()
    // The synthesis was regenerated while the child walked over.
    expect(
      resolve({
        model: model({
          synthesis: { ...model().synthesis!, generatedAt: '2026-11-11T09:00:00.000Z' },
        }),
      }),
    ).toBeNull()
    // The stored synthesis has no usable generation at all.
    expect(
      resolve({ model: model({ synthesis: { ...model().synthesis!, generatedAt: '' } }) }),
    ).toBeNull()
  })

  it('refuses a missing or failed model read, and a stale synthesis', () => {
    expect(resolve({ model: null })).toBeNull()
    expect(resolve({ model: undefined })).toBeNull()
    expect(resolve({ model: model({ synthesisStaleAt: '2026-11-10T10:00:00.000Z' }) })).toBeNull()
    expect(resolve({ model: model({ synthesis: undefined }) })).toBeNull()
  })

  it('refuses an uncalibrated child', () => {
    expect(resolve({ mathCalibrated: false })).toBeNull()
  })

  it('refuses an advice move that is not a quest-vehicle move for this concept', () => {
    expect(
      resolve({
        model: model({
          synthesis: {
            ...model().synthesis!,
            whatMattersNext: [
              {
                conceptId: MINE_ADDITION_PROBE_CONCEPT,
                kidName: 'Adding to 20',
                why: 'w',
                suggestedVehicle: SynthesisVehicle.DadLab,
              },
            ],
          },
        }),
      }),
    ).toBeNull()
  })

  /**
   * The asynchronous case: the card committed a synthesis offer, and by the time
   * this Start's own model read landed an eligible ask was waiting. The queue is
   * the authority, so the probe falls away and the ordinary Math Start runs.
   */
  it('refuses when an eligible queued ask arrived between the card commit and the Start read', () => {
    expect(
      resolve({ model: model({ openQuestions: [ask(MINE_ADDITION_PROBE_CONCEPT)] }) }),
    ).toBeNull()
  })

  it('still refuses when the queued ask is for another calibrated concept entirely', () => {
    expect(
      resolve({
        readingCalibrated: true,
        model: model({ openQuestions: [ask(CVC)] }),
      }),
    ).toBeNull()
  })

  it('accepts again once that ask is resolved — the queue is no longer waiting', () => {
    expect(
      resolve({
        model: model({
          openQuestions: [ask(MINE_ADDITION_PROBE_CONCEPT, { resolvedAt: GENERATION })],
        }),
      }),
    ).toBeTruthy()
  })
})
