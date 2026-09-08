// ── Characterization test for UX-288 (AUDIT-217 census) ──────────────────
//
// `computeEvalRead` is the guided evaluation's route into the learner model —
// the ONE calibrated writer, the only path permitted to move a concept toward
// the working edge. It routes each finding through the shared `mapFindingToNode`
// bridge and then DROPS anything whose target is not a node in the foundations
// graph (`!FOUNDATION_NODE_MAP[conceptId]`).
//
// That filter is correct. What is wrong is what falls through it: the finding
// bridge answers `math.addition` / `math.subtraction` with
// `math.operations.addSub`, and `math.multiplication` / `math.division` with
// `math.operations.multDiv` — **`curriculumMap` node ids, which the math graph
// does not define.** So an eval's four most likely math findings for a child
// working at ~3rd grade produce no evidence, no state and no changeFeed line,
// with nothing logged that a parent can see.
//
// The concepts themselves exist, under different ids:
//   addition/subtraction → math.operations.{addWithin20, subWithin20, twoDigit}
//   multiplication/division → math.operations.{arrays, multFacts, division}
//
// **This test documents the CURRENT behaviour, deliberately.** It is not an
// endorsement. When UX-288 is fixed, the two `expect(...).toHaveLength(0)`
// assertions below should be INVERTED to assert the concepts that are now
// reached — a failure here after such a fix means the fix worked.
//
// Read-only: this file adds no behaviour and touches no other test.

import { describe, expect, it } from 'vitest'

import { FOUNDATION_NODE_MAP } from './index'
import { computeEvalRead } from './evalModelSync'
import { mapFindingToNode } from '../curriculum/mapFindingToNode'
import type { EvaluationFinding } from '../types/evaluation'

function finding(skill: string): EvaluationFinding {
  return {
    skill,
    status: 'not-yet',
    evidence: 'characterization fixture',
  } as EvaluationFinding
}

describe('UX-288 — the eval → learner-model bridge drops the four core math operations', () => {
  it('maps addition and subtraction to a node the foundations graph does not define', () => {
    for (const tag of ['math.addition', 'math.subtraction']) {
      const node = mapFindingToNode(tag)
      expect(node, `${tag} should still resolve through the finding bridge`).toBe(
        'math.operations.addSub',
      )
      expect(
        FOUNDATION_NODE_MAP['math.operations.addSub'],
        'math.operations.addSub is a curriculumMap id, not a foundations concept',
      ).toBeUndefined()
    }
  })

  it('maps multiplication and division to a node the foundations graph does not define', () => {
    for (const tag of ['math.multiplication', 'math.division']) {
      const node = mapFindingToNode(tag)
      expect(node, `${tag} should still resolve through the finding bridge`).toBe(
        'math.operations.multDiv',
      )
      expect(
        FOUNDATION_NODE_MAP['math.operations.multDiv'],
        'math.operations.multDiv is a curriculumMap id, not a foundations concept',
      ).toBeUndefined()
    }
  })

  it('therefore produces NO eval read for any of the four — the evidence is lost', () => {
    const reads = computeEvalRead([
      finding('math.addition'),
      finding('math.subtraction'),
      finding('math.multiplication'),
      finding('math.division'),
    ])
    // INVERT THIS when UX-288 is fixed.
    expect(reads).toHaveLength(0)
  })

  it('but the concepts these findings are ABOUT do exist in the graph', () => {
    for (const id of [
      'math.operations.addWithin20',
      'math.operations.subWithin20',
      'math.operations.twoDigit',
      'math.operations.arrays',
      'math.operations.multFacts',
      'math.operations.division',
    ]) {
      expect(FOUNDATION_NODE_MAP[id], `${id} should be a real graph node`).toBeDefined()
    }
  })

  it('a reading finding on the same shape DOES land — the drop is math-specific', () => {
    const reads = computeEvalRead([finding('phonics.cvc')])
    expect(reads).toHaveLength(1)
    expect(reads[0].conceptId).toBe('reading.phonics.cvc')
    // A tested `not-yet` finding reads as `frontier` (the positive framing) —
    // pinned here so the positive control cannot pass vacuously.
    expect(reads[0].state).toBe('frontier')
  })
})
