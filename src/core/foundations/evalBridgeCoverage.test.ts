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
// endorsement. When UX-288 is fixed, the `expect(reads).toHaveLength(0)` case and
// the two math entries in the dropped-set assertion should be INVERTED to assert
// the concepts that are now reached — a failure here after such a fix means the
// fix worked. The 23 writing/speech drops are NOT a defect and should stay.
//
// Read-only: this file adds no behaviour and touches no other test.

import { describe, expect, it } from 'vitest'

import { FOUNDATION_NODE_MAP } from './index'
import { computeEvalRead } from './evalModelSync'
import { mapFindingToNode } from '../curriculum/mapFindingToNode'
import { CURRICULUM_NODE_MAP } from '../curriculum/curriculumMap'
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

  // The census's first probe list was hand-built and missed targets; Codex round 1
  // found `speech.connected`, and round 2 found the deeper problem — a hand-copied
  // list is not a closed set at all. `mapFindingToNode` step 1 returns its INPUT
  // verbatim whenever that input is already a `CURRICULUM_NODE_MAP` id, so the
  // emittable set is the whole curriculum map (59 ids), which strictly contains the
  // prefix-table and keyword-fallback targets. This derives it from the map itself,
  // so the test cannot stay green while the list drifts — which is exactly how the
  // census got it wrong twice.
  it('emits only curriculumMap ids, and 25 of the 59 are not foundations concepts', () => {
    const emittable = Object.keys(CURRICULUM_NODE_MAP)
    expect(emittable.length).toBe(59)

    // Step 1 really is a verbatim passthrough for every one of them.
    for (const id of emittable) expect(mapFindingToNode(id)).toBe(id)

    const dropped = emittable.filter((id) => !FOUNDATION_NODE_MAP[id])
    expect(dropped).toHaveLength(25)

    // Only the two math ones are the defect. The other 23 are the declared domain
    // boundary: `FoundationDomain` is reading + math, so curriculumMap's whole
    // writing and speech halves have nowhere to land by design.
    expect(dropped.filter((id) => id.startsWith('math.')).sort()).toEqual([
      'math.operations.addSub',
      'math.operations.multDiv',
    ])
    expect(dropped.filter((id) => id.startsWith('writing.'))).toHaveLength(13)
    expect(dropped.filter((id) => id.startsWith('speech.'))).toHaveLength(10)
    // Nothing else — no reading node is dropped.
    expect(dropped.filter((id) => id.startsWith('reading.'))).toEqual([])
  })

  it('the prefix table and keyword fallbacks stay within that set', () => {
    // A sample across both halves of the function: the prefix map (step 2/3) and
    // the keyword fallback (step 4). Every answer must be a curriculumMap id, or
    // the closed-set claim above is false.
    for (const tag of [
      'phonics.cvc', 'reading.fluency', 'math.addition', 'math.multiplication',
      'math.wordproblems', 'speech.connectedSpeech', 'writing.spelling',
      'writing.paragraph', 'some.unknown.tag.about.longvowels', 'a.tag.about.fractions',
    ]) {
      const node = mapFindingToNode(tag)
      if (node === null) continue
      expect(CURRICULUM_NODE_MAP[node], `${tag} → ${node} should be a curriculumMap id`).toBeDefined()
    }
  })

  it('speech.connectedSpeech is one of them — an input the eval prompt asks for', () => {
    expect(mapFindingToNode('speech.connectedSpeech')).toBe('speech.connected')
    expect(FOUNDATION_NODE_MAP['speech.connected']).toBeUndefined()
    expect(computeEvalRead([finding('speech.connectedSpeech')])).toHaveLength(0)
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
