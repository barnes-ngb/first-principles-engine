import { describe, expect, it } from 'vitest'

import { applyEvalFindingsToModel, computeEvalRead } from './evalModelSync'
import { FOUNDATION_NODE_MAP } from './index'
import type { EvaluationFinding } from '../types/evaluation'
import type {
  ConceptStateEntry,
  EvidenceRef,
  LearnerModel,
} from '../types/learnerModel'

const NOW = '2026-07-16T12:00:00.000Z'
const SID = 'child-1_reading_2026-07-16'

function finding(
  skill: string,
  status: EvaluationFinding['status'],
  evidence = 'observed',
): EvaluationFinding {
  return { skill, status, evidence, testedAt: NOW }
}

function entry(state: ConceptStateEntry['state'], evidence: EvidenceRef[] = []): ConceptStateEntry {
  return { state, evidence, seededAt: '2026-01-01T00:00:00.000Z' }
}

function model(partial: Partial<LearnerModel> = {}): LearnerModel {
  return {
    childId: 'child-1',
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
    seededAt: NOW,
    updatedAt: NOW,
    ...partial,
  }
}

const CVC = 'reading.phonics.cvc'
const BLENDS = 'reading.phonics.blends'
const ATTEST: EvidenceRef = {
  kind: 'attestation',
  sourceId: 'reviewChat',
  note: 'You confirmed you have seen this.',
  observedAt: '2026-06-01T00:00:00.000Z',
  overriddenBy: 'parent',
}

describe('computeEvalRead', () => {
  it('maps finding statuses to concept states (mastered→solid, emerging→forming, not-yet→frontier)', () => {
    const read = computeEvalRead([
      finding('phonics.cvc.short-o', 'mastered'),
      finding('phonics.blends', 'emerging'),
      finding('phonics.digraphs', 'not-yet'),
    ])
    const byId = Object.fromEntries(read.map((r) => [r.conceptId, r.state]))
    expect(byId[CVC]).toBe('solid')
    expect(byId[BLENDS]).toBe('forming')
    expect(byId['reading.phonics.digraphs']).toBe('frontier')
  })

  it('drops not-tested findings and tags that map to no graph concept', () => {
    const read = computeEvalRead([
      finding('phonics.cvc', 'not-tested'),
      finding('something.totally.unmapped.xyz', 'mastered'),
    ])
    expect(read).toEqual([])
  })

  it('keeps the highest-ranked read when several findings land on one concept (no-shame)', () => {
    // Both map to reading.phonics.cvc; the mastered read must not be erased.
    const read = computeEvalRead([
      finding('phonics.cvc.short-a', 'not-yet'),
      finding('phonics.cvc.short-o', 'mastered'),
    ])
    expect(read).toHaveLength(1)
    expect(read[0].conceptId).toBe(CVC)
    expect(read[0].state).toBe('solid')
  })

  it('produces a kid-word evidence note per concept', () => {
    const [read] = computeEvalRead([finding('phonics.cvc', 'emerging', 'blended c-a-t')])
    expect(read.note).toContain(FOUNDATION_NODE_MAP[CVC].kidName)
    expect(read.note).toContain('blended c-a-t')
  })
})

describe('applyEvalFindingsToModel', () => {
  it('moves a concept UP (frontier → solid) and appends eval evidence + a change line', () => {
    const m = model({ conceptStates: { [CVC]: entry('frontier') } })
    const { model: next, changedConceptIds } = applyEvalFindingsToModel(
      m,
      computeEvalRead([finding('phonics.cvc', 'mastered')]),
      SID,
      NOW,
    )
    expect(next.conceptStates[CVC].state).toBe('solid')
    expect(changedConceptIds).toEqual([CVC])
    expect(next.conceptStates[CVC].evidence.some((e) => e.kind === 'eval')).toBe(true)
    const line = next.changeFeed.find((c) => c.conceptId === CVC)
    expect(line).toMatchObject({ from: 'frontier', to: 'solid' })
  })

  it('moves a concept DOWN (solid → forming) when the eval read is lower — the calibrated divergence', () => {
    const m = model({ conceptStates: { [CVC]: entry('solid') } })
    const { model: next, changedConceptIds } = applyEvalFindingsToModel(
      m,
      computeEvalRead([finding('phonics.cvc', 'emerging')]),
      SID,
      NOW,
    )
    expect(next.conceptStates[CVC].state).toBe('forming')
    expect(changedConceptIds).toEqual([CVC])
    expect(next.conceptStates[CVC].evidence.some((e) => e.kind === 'eval')).toBe(true)
  })

  it('phrases a downward move with no-shame wording — never regress/drop/lost', () => {
    const m = model({ conceptStates: { [CVC]: entry('solid') } })
    const { model: next } = applyEvalFindingsToModel(
      m,
      computeEvalRead([finding('phonics.cvc', 'emerging')]),
      SID,
      NOW,
    )
    const cause = next.changeFeed.find((c) => c.conceptId === CVC)!.cause.toLowerCase()
    expect(cause).not.toMatch(/regress|drop|lost|fail|behind/)
    expect(cause).toContain('revisiting')
    expect(cause).toContain('still forming')
  })

  it('leaves concepts the eval did not assess untouched', () => {
    const m = model({
      conceptStates: { [CVC]: entry('frontier'), [BLENDS]: entry('solid') },
    })
    const { model: next, changedConceptIds } = applyEvalFindingsToModel(
      m,
      computeEvalRead([finding('phonics.cvc', 'mastered')]),
      SID,
      NOW,
    )
    // BLENDS was not in the eval read — identical entry, no eval evidence.
    expect(next.conceptStates[BLENDS]).toBe(m.conceptStates[BLENDS])
    expect(changedConceptIds).toEqual([CVC])
  })

  it('does NOT auto-flip an attested concept — appends eval evidence + flags reconcile', () => {
    const m = model({ conceptStates: { [CVC]: entry('solid', [ATTEST]) } })
    const { model: next, changedConceptIds } = applyEvalFindingsToModel(
      m,
      computeEvalRead([finding('phonics.cvc', 'not-yet')]), // eval disagrees (→ frontier)
      SID,
      NOW,
    )
    // State stays as the parent attested it.
    expect(next.conceptStates[CVC].state).toBe('solid')
    // Eval evidence is appended and the concept is flagged for reconcile.
    expect(next.conceptStates[CVC].evidence.some((e) => e.kind === 'eval')).toBe(true)
    expect(next.conceptStates[CVC].evidence.some((e) => e.kind === 'attestation')).toBe(true)
    expect(next.conceptStates[CVC].needsReconcile).toBe(true)
    // No state change ⇒ not counted, no change-feed state move.
    expect(changedConceptIds).toEqual([])
    expect(next.changeFeed).toHaveLength(0)
  })

  it('appends eval evidence but does not flag reconcile when the eval agrees with an attestation', () => {
    const m = model({ conceptStates: { [CVC]: entry('solid', [ATTEST]) } })
    const { model: next, changedConceptIds } = applyEvalFindingsToModel(
      m,
      computeEvalRead([finding('phonics.cvc', 'mastered')]), // agrees (→ solid)
      SID,
      NOW,
    )
    expect(next.conceptStates[CVC].state).toBe('solid')
    expect(next.conceptStates[CVC].needsReconcile).toBeFalsy()
    expect(next.conceptStates[CVC].evidence.some((e) => e.kind === 'eval')).toBe(true)
    expect(changedConceptIds).toEqual([])
  })

  it('clears a stale reconcile flag once a later eval agrees with the standing state', () => {
    const flagged: ConceptStateEntry = { ...entry('forming'), needsReconcile: true }
    const m = model({ conceptStates: { [CVC]: flagged } })
    const { model: next } = applyEvalFindingsToModel(
      m,
      computeEvalRead([finding('phonics.cvc', 'emerging')]), // agrees (→ forming)
      SID,
      NOW,
    )
    expect(next.conceptStates[CVC].state).toBe('forming')
    expect(next.conceptStates[CVC].needsReconcile).toBe(false)
  })

  it('is a no-op on an empty eval read', () => {
    const m = model({ conceptStates: { [CVC]: entry('solid') } })
    const { model: next, changedConceptIds } = applyEvalFindingsToModel(m, [], SID, NOW)
    expect(next).toBe(m)
    expect(changedConceptIds).toEqual([])
  })

  it('seeds a brand-new concept the model never held (from not-yet)', () => {
    const m = model({ conceptStates: {} })
    const { model: next, changedConceptIds } = applyEvalFindingsToModel(
      m,
      computeEvalRead([finding('phonics.cvc', 'emerging')]),
      SID,
      NOW,
    )
    expect(next.conceptStates[CVC].state).toBe('forming')
    expect(changedConceptIds).toEqual([CVC])
    const line = next.changeFeed.find((c) => c.conceptId === CVC)
    expect(line).toMatchObject({ from: 'not-yet', to: 'forming' })
  })
})
