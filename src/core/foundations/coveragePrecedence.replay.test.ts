import { describe, expect, it } from 'vitest'

import { applyBridgeCoverageToModel } from './workbookBridge'
import { applyEvalFindingsToModel } from './evalModelSync'
import { applyReviewActionToModel } from '../../features/foundations-review/foundationsReviewActions'
import { applyCompletionCoverage } from './programCompletionProjection'
import type { ConceptStateEntry, LearnerModel } from '../types/learnerModel'

/**
 * The replay rule, pinned for all THREE coverage writers (FEAT-242).
 *
 * The base defect: a guided evaluation reads a concept DOWN to the working edge,
 * and then an old coverage write — a workbook position re-synced, a Review-Chat
 * `covered` action, a program completion — raises it back to `forming`. Coverage
 * is a statement about material; an evaluation is a measurement of the child, and
 * replaying the first must not overwrite the second.
 *
 * **Negative control for a reviewer:** delete the `governingDirectEvidence`
 * branch from `coveragePromotion` (shared module) and every "stays frontier"
 * expectation below must fail with `forming`. That is the exact red state the
 * pre-FEAT-242 tree produced for the workbook and Review-Chat paths.
 */

const CVC = 'reading.phonics.cvc'
const NOW = '2026-10-10T00:00:00.000Z'
const EVAL_AT = '2026-10-15T00:00:00.000Z'
const REPLAY_AT = '2026-10-16T00:00:00.000Z'

function modelWith(entry: ConceptStateEntry): LearnerModel {
  return {
    childId: 'c1',
    graphVersion: 'reading@1+math@1',
    status: 'seeded',
    conceptStates: { [CVC]: entry },
    modalityCalibration: { reading: { note: '' }, writing: { note: '' }, math: { note: '' } },
    whatMattersNext: [],
    changeFeed: [],
    openQuestions: [],
    seededAt: NOW,
    updatedAt: NOW,
  }
}

/** A model whose CVC a guided eval has just read down to `frontier`. */
function afterLowerEval(): LearnerModel {
  const base = modelWith({ state: 'forming', evidence: [], seededAt: NOW })
  return applyEvalFindingsToModel(
    base,
    [{ conceptId: CVC, state: 'frontier', note: 'Guided eval — still at the edge' }],
    'sess-1',
    EVAL_AT,
  ).model
}

describe('an old coverage replay cannot undo a later evaluation', () => {
  it('workbook position sync: state stays frontier, evidence is still recorded', () => {
    const next = applyBridgeCoverageToModel(
      afterLowerEval(),
      [{ conceptId: CVC, unitLabel: 'Peak 7' }],
      'fastPhonics',
      REPLAY_AT,
      'scan',
    ).model
    const entry = next.conceptStates[CVC]
    expect(entry.state).toBe('frontier')
    expect(entry.evidence.some((e) => e.kind === 'eval')).toBe(true)
    const ref = entry.evidence.at(-1)!
    expect(ref.kind).toBe('curriculumPosition')
    expect(ref.withheldReason).toBe('governing-direct-evidence')
  })

  it('Review-Chat covered action: state stays frontier, evidence is still recorded', () => {
    const next = applyReviewActionToModel(
      afterLowerEval(),
      {
        kind: 'covered',
        childId: 'c1',
        conceptId: CVC,
        source: 'Fast Phonics',
        unit: 'Peak 7',
        proposedState: 'solid',
      },
      REPLAY_AT,
    ).model
    const entry = next.conceptStates[CVC]
    expect(entry.state).toBe('frontier')
    expect(entry.evidence.some((e) => e.kind === 'eval')).toBe(true)
    expect(entry.evidence.at(-1)!.withheldReason).toBe('governing-direct-evidence')
  })

  it('program completion: state stays frontier, evidence is still recorded', () => {
    const next = applyCompletionCoverage(
      afterLowerEval(),
      {
        completionId: 'fastPhonics:draft-1',
        program: 'fastPhonics',
        programLabel: 'Fast Phonics',
        mappingVersion: 1,
        observedAtIso: '2026-10-01T00:00:00.000Z',
        detail: 'map note',
        targets: [
          {
            conceptId: CVC,
            qualifier: 'direct',
            attributedPeak: 7,
            attributedPeakLabel: 'Peak 7',
          },
        ],
      },
      REPLAY_AT,
    ).model
    const entry = next.conceptStates[CVC]
    expect(entry.state).toBe('frontier')
    expect(entry.evidence.at(-1)!.ownsPromotion).toBe(false)
    expect(entry.evidence.at(-1)!.withheldReason).toBe('governing-direct-evidence')
  })

  it('still promotes an untouched concept — the guard is not a blanket freeze', () => {
    const fresh = modelWith({ state: 'not-yet', evidence: [], seededAt: NOW })
    const next = applyBridgeCoverageToModel(
      fresh,
      [{ conceptId: CVC, unitLabel: 'Peak 7' }],
      'fastPhonics',
      REPLAY_AT,
      'scan',
    ).model
    expect(next.conceptStates[CVC].state).toBe('forming')
    expect(next.conceptStates[CVC].evidence.at(-1)!.withheldReason).toBeUndefined()
  })

  it('a Review-Chat `frontier` proposal is still honoured below the cap', () => {
    const fresh = modelWith({ state: 'not-yet', evidence: [], seededAt: NOW })
    const next = applyReviewActionToModel(
      fresh,
      {
        kind: 'covered',
        childId: 'c1',
        conceptId: CVC,
        source: 'Fast Phonics',
        proposedState: 'frontier',
      },
      REPLAY_AT,
    ).model
    expect(next.conceptStates[CVC].state).toBe('frontier')
  })
})
