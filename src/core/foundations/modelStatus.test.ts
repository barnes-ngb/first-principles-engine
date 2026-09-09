import { describe, expect, it } from 'vitest'

import { modelHasConceptEvidence, promotedModelStatus } from './modelStatus'
import type { LearnerModel } from '../types/learnerModel'

const NOW = '2026-09-09T12:00:00.000Z'
const CVC = 'reading.phonics.cvc'

function model(over: Partial<LearnerModel> = {}): LearnerModel {
  return {
    childId: 'c1',
    graphVersion: 'reading@1+math@1',
    status: 'no-data',
    conceptStates: { [CVC]: { state: 'not-yet', evidence: [], seededAt: NOW } },
    modalityCalibration: { reading: { note: '' }, writing: { note: '' }, math: { note: '' } },
    whatMattersNext: [],
    changeFeed: [],
    openQuestions: [],
    seededAt: NOW,
    updatedAt: NOW,
    ...over,
  }
}

const withEvidence = (kind: 'eval' | 'quest' | 'attestation' | 'curriculumPosition') =>
  model({
    conceptStates: {
      [CVC]: {
        state: 'forming',
        evidence: [{ kind, sourceId: 's1', note: 'n', observedAt: NOW }],
        seededAt: NOW,
      },
    },
  })

describe('modelHasConceptEvidence', () => {
  it('is false for a model whose every entry has an empty trail', () => {
    expect(modelHasConceptEvidence(model())).toBe(false)
  })

  it('is true as soon as one concept carries a ref', () => {
    expect(modelHasConceptEvidence(withEvidence('eval'))).toBe(true)
  })

  it('does not throw on a document missing conceptStates entirely', () => {
    const broken = { ...model(), conceptStates: undefined } as unknown as LearnerModel
    expect(modelHasConceptEvidence(broken)).toBe(false)
  })
})

describe('promotedModelStatus (UX-322)', () => {
  it('promotes no-data → seeded once real evidence has landed', () => {
    expect(promotedModelStatus(withEvidence('eval'))).toBe('seeded')
    expect(promotedModelStatus(withEvidence('quest'))).toBe('seeded')
    expect(promotedModelStatus(withEvidence('attestation'))).toBe('seeded')
    expect(promotedModelStatus(withEvidence('curriculumPosition'))).toBe('seeded')
  })

  it('promotes nothing when the write appended no evidence', () => {
    // The Review Chat's `queueTest` shape: an openQuestion was appended and the
    // evidence trails are exactly as they were found.
    expect(promotedModelStatus(model())).toBeUndefined()
  })

  it('never touches a model that is already seeded or synthesized', () => {
    expect(
      promotedModelStatus({ ...withEvidence('eval'), status: 'seeded' }),
    ).toBeUndefined()
    expect(
      promotedModelStatus({ ...withEvidence('eval'), status: 'synthesized' }),
    ).toBeUndefined()
  })

  it('never demotes — there is no path back to no-data', () => {
    // A synthesized model with no evidence at all (nothing in the repo produces
    // one, but the rule must not invent a demotion if one appeared).
    expect(promotedModelStatus({ ...model(), status: 'synthesized' })).toBeUndefined()
  })

  it('repairs a model stamped no-data that already carries evidence', () => {
    // Written before this rule existed: the stored status is the thing that is
    // wrong, so the next write fixes it rather than preserving the lie.
    expect(promotedModelStatus(withEvidence('quest'))).toBe('seeded')
  })
})
