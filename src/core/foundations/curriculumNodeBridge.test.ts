// ── FIX-224 / UX-288 — the foundations-side resolution of a curriculumMap id ──
//
// The module's own unit tests. `evalBridgeCoverage.test.ts` is the record of
// what UX-288 changed end-to-end; this file pins the rule itself.

import { describe, expect, it } from 'vitest'

import {
  derivedFoundationConcepts,
  FoundationBridgeOutcome,
  resolveFoundationConcepts,
} from './curriculumNodeBridge'
import { FOUNDATION_NODE_MAP } from './index'
import { TAG_CONCEPT_BRIDGE } from './tagConceptBridge'
import { mapFindingToNode } from '../curriculum/mapFindingToNode'
import { CURRICULUM_NODE_MAP } from '../curriculum/curriculumMap'

/** Resolve straight from a finding tag, the way both callers do. */
function fromTag(tag: string) {
  return resolveFoundationConcepts(mapFindingToNode(tag), tag)
}

describe('resolveFoundationConcepts — passthrough and boundaries', () => {
  it('passes a real foundations concept through unchanged', () => {
    const r = fromTag('phonics.cvc')
    expect(r.outcome).toBe(FoundationBridgeOutcome.Direct)
    expect(r.conceptIds).toEqual(['reading.phonics.cvc'])
  })

  it('returns nothing when the finding bridge itself found no node', () => {
    const r = resolveFoundationConcepts(null, 'utterly.unknown.tag')
    expect(r.outcome).toBe(FoundationBridgeOutcome.Unmapped)
    expect(r.conceptIds).toEqual([])
  })

  it('returns nothing for a curriculumMap domain the graph has no half for', () => {
    // `FoundationDomain` is reading + math; writing and speech are the declared
    // boundary, NOT a defect. Distinguished from `no-detail` on purpose.
    // `writing.paragraph` is in this list since FIX-226. It used to route to
    // `math.data.graphs` — a MATH concept — because `mapFindingToNode`'s keyword
    // fallback matched "graph" inside "para-graph" (UX-347). It now reaches the
    // writing side of the curriculum map, which the foundations graph has no half
    // for, so a writing finding writes nothing instead of writing a lie.
    for (const tag of [
      'writing.spelling',
      'writing.paragraph',
      'writing.composition.paragraph',
      'speech.connectedSpeech',
    ]) {
      const r = fromTag(tag)
      expect(r.outcome, tag).toBe(FoundationBridgeOutcome.OutsideDomain)
      expect(r.conceptIds, tag).toEqual([])
    }
  })
})

describe('resolveFoundationConcepts — the detail rule', () => {
  // Every pair below is a LITERAL correspondence between a token the tag itself
  // carries and a concept the graph itself names. Named rather than counted:
  // a named list is its own check and cannot go stale against a recount.
  const RESOLVED: ReadonlyArray<readonly [string, string]> = [
    // addition / subtraction — `math.operations.addSub`
    ['math.addition.within-20', 'math.operations.addWithin20'],
    ['math.subtraction.within-20', 'math.operations.subWithin20'],
    ['math.addition.single', 'math.operations.addWithin20'],
    ['math.two-digit.addition', 'math.operations.twoDigit'],
    ['math.two-digit.subtraction', 'math.operations.twoDigit'],
    ['math.subtraction.regrouping', 'math.operations.regrouping'],
    // `math.subtraction.regroup` is a CATALOG tag, so since FIX-226 it comes back
    // `curated` rather than `detail-resolved` — same concept, different authority.
    // It is asserted in the curated block below, where its outcome is the point.
    ['math.multi-digit.subtraction', 'math.operations.multiDigit'],
    ['math.addition.fact-families', 'math.operations.factFamilies'],
    // multiplication / division — `math.operations.multDiv`
    ['math.multiplication.facts', 'math.operations.multFacts'],
    ['math.multiplication.tables', 'math.operations.multiTables'],
    ['math.times-tables', 'math.operations.multiTables'],
    ['math.multi-digit.multiplication', 'math.operations.multiDigit'],
    ['math.division.basic', 'math.operations.division'],
    ['math.multiplication.arrays', 'math.operations.arrays'],
  ]

  it.each(RESOLVED)('%s → %s', (tag, conceptId) => {
    const r = fromTag(tag)
    expect(r.outcome).toBe(FoundationBridgeOutcome.DetailResolved)
    expect(r.conceptIds).toEqual([conceptId])
    // Never assert a concept the graph does not define.
    expect(FOUNDATION_NODE_MAP[conceptId]).toBeDefined()
  })

  it('never returns more than one concept — a finding is not fanned out', () => {
    for (const [tag] of RESOLVED) {
      expect(fromTag(tag).conceptIds.length, tag).toBe(1)
    }
  })

  it('a named technique beats a named size when a tag carries both', () => {
    // Hypothetical rather than live (the real vocabulary never co-locates them),
    // but the ordering is a decision and is pinned rather than left to accident.
    expect(fromTag('math.multi-digit.subtraction.regrouping').conceptIds).toEqual([
      'math.operations.regrouping',
    ])
  })

  it('reads division before any size or fluency word beside it', () => {
    // The graph defines exactly one division concept, so a tag naming division
    // names it whatever else rides along.
    expect(fromTag('math.multi-digit.division.facts').conceptIds).toEqual([
      'math.operations.division',
    ])
  })
})

describe('resolveFoundationConcepts — no detail means no write, never a guess', () => {
  it('declines a bare addition / subtraction / multiplication tag', () => {
    for (const tag of ['math.addition', 'math.subtraction', 'math.multiplication']) {
      const r = fromTag(tag)
      // `no-detail`, NOT `unmapped` or `outside-domain`: the resolver saw the id,
      // recognised the family, and declined — that distinction IS the record.
      expect(r.outcome, tag).toBe(FoundationBridgeOutcome.NoDetail)
      expect(r.conceptIds, tag).toEqual([])
    }
  })

  it('declines a detail it does not recognise rather than picking the nearest', () => {
    const r = fromTag('math.multiplication.2s')
    expect(r.outcome).toBe(FoundationBridgeOutcome.NoDetail)
    expect(r.conceptIds).toEqual([])
  })

  it('resolves a bare math.division, because the graph has exactly one', () => {
    // Not an exception to the rule above: "division" IS the detail. Asserted
    // against the graph so the claim cannot rot if a second division node lands.
    const divisionNodes = Object.keys(FOUNDATION_NODE_MAP).filter((id) =>
      id.toLowerCase().includes('division'),
    )
    expect(divisionNodes).toEqual(['math.operations.division'])
    expect(fromTag('math.division').conceptIds).toEqual(['math.operations.division'])
  })

  it('declines a small-number band whose operation is not named', () => {
    // "within 20" says which band, not whether the child was adding or taking
    // away — and addWithin20/subWithin20 are different concepts.
    const r = fromTag('math.operations.within-20')
    expect(r.conceptIds).toEqual([])
  })
})

describe('resolveFoundationConcepts — the curated tag bridge is the AUTHORITY', () => {
  // `tagConceptBridge.ts` is the owner-curated answer for the `skillTags.ts`
  // catalog, and those tags reach this module too (a `prioritySkill` carries
  // one). FIX-224 required the two answers to AGREE; UX-348 is what that left
  // open — a catalog tag whose derived answer was a real foundations id, so
  // nothing compared it with anything and `math.wordProblems` seeded a band-5
  // concept from band-1-2 evidence. Precedence now lives in the code, and BOTH
  // claims are asserted separately, because only the second catches the next one.

  /** Every catalog tag the owner curated to a real concept. Derived, not typed. */
  const CURATED_TAGS = Object.entries(TAG_CONCEPT_BRIDGE)
    .filter(([, ids]) => ids.length > 0)
    .map(([tag, ids]) => [tag, ids] as const)

  it('takes the curated answer verbatim for every curated catalog tag', () => {
    expect(CURATED_TAGS.length, 'the rail is worthless if it checks nothing').toBeGreaterThan(0)
    for (const [tag, ids] of CURATED_TAGS) {
      const r = resolveFoundationConcepts(mapFindingToNode(tag), tag)
      expect(r.conceptIds, tag).toEqual(ids)
      expect(r.outcome, tag).toBe(FoundationBridgeOutcome.Curated)
    }
  })

  it('and the DERIVED route agrees with it or declines — never a second answer', () => {
    // The claim precedence would otherwise hide. A derived answer that differs
    // from the curated one is UX-348, whatever precedence then does about it.
    const disagreements: string[] = []
    for (const [tag, ids] of CURATED_TAGS) {
      const derived = derivedFoundationConcepts(mapFindingToNode(tag), tag).conceptIds
      if (derived.length === 0) continue // declined — allowed
      if (JSON.stringify(derived) !== JSON.stringify(ids)) {
        disagreements.push(`${tag}: curated ${ids.join('|')} vs derived ${derived.join('|')}`)
      }
    }
    expect(disagreements).toEqual([])
  })

  it('UX-348: math.wordProblems reaches the ONE-STEP concept, not the band-5 one', () => {
    // The defect, inverted. `mapFindingToNode` still answers `math.problemSolving`
    // — its contract is curriculumMap ids and `oneStep` is not one — so this is
    // asserted on both sides: the skill-map answer is unchanged, the learner-model
    // answer is fixed.
    expect(mapFindingToNode('math.wordProblems')).toBe('math.problemSolving')
    expect(fromTag('math.wordProblems').conceptIds).toEqual(['math.problemSolving.oneStep'])
    // …and it is not the curated shortcut alone doing the work: an uncurated
    // single-step tag lands there too.
    expect(fromTag('math.word-problems').conceptIds).toEqual(['math.problemSolving.oneStep'])
    // The prompt's own multi-step tag still means the band-5 concept.
    expect(fromTag('math.word-problems.multi-step').conceptIds).toEqual(['math.problemSolving'])
    expect(fromTag('math.problemSolving').conceptIds).toEqual(['math.problemSolving'])
  })

  it('an EMPTY curated entry does not suppress a working derived route', () => {
    // `writing.*` is curated `[]` as a curation GATE, not as an authoritative
    // "nothing". `writing.spelling.sightWord` derives `reading.phonics.sightWords`
    // through the declared spelling→decoding lane, and reading `[]` as an answer
    // would silently delete that signal.
    expect(TAG_CONCEPT_BRIDGE['writing.spelling.sightWord']).toEqual([])
    expect(fromTag('writing.spelling.sightWord').conceptIds).toEqual([
      'reading.phonics.sightWords',
    ])
  })

  it('reads "no regrouping" as the ABSENCE of regrouping, not as regrouping', () => {
    // The negation contains the word it negates. Marking the harder concept
    // solid for a child who has demonstrated the opposite is worse than silence.
    for (const tag of [
      'math.subtraction.noRegroup',
      'math.subtraction.no-regroup',
      'math.subtraction.without-regrouping',
    ]) {
      expect(fromTag(tag).conceptIds, tag).toEqual(['math.operations.twoDigit'])
    }
    // …and the affirmative tag is untouched.
    expect(fromTag('math.subtraction.regroup').conceptIds).toEqual([
      'math.operations.regrouping',
    ])
  })
})

describe('resolveFoundationConcepts — tag normalisation', () => {
  it('reads a token through dots, hyphens, underscores, spaces and case', () => {
    for (const tag of [
      'math.two-digit.addition',
      'math.two_digit.addition',
      'Math.Two-Digit.Addition',
      'math.two digit.addition',
    ]) {
      expect(fromTag(tag).conceptIds, tag).toEqual(['math.operations.twoDigit'])
    }
  })
})

describe('FIX-226 — narrowing an id the graph DOES define (UX-346 / UX-348)', () => {
  it('declines a bare math.number-sense: it names three concepts at once', () => {
    // The eval prompt's own gloss is "counting, digit recognition, number
    // comparison". Picking one would be the guess this module exists to refuse,
    // and `applyEvalFindingsToModel` may move a concept DOWN.
    const r = fromTag('math.number-sense')
    expect(r.outcome).toBe(FoundationBridgeOutcome.NoDetail)
    expect(r.conceptIds).toEqual([])
    // …but it is a decline, not a miss: the curriculumMap answer now exists.
    expect(mapFindingToNode('math.number-sense')).toBe('math.number.counting')
  })

  it('lands a number-sense tag that says WHICH skill was assessed', () => {
    for (const [tag, conceptId] of [
      ['math.number-sense.counting', 'math.number.counting'],
      ['math.digit-recognition', 'math.number.digitRecognition'],
      ['math.skip-counting', 'math.number.skipCount'],
      ['math.counting', 'math.number.counting'],
    ] as const) {
      const r = fromTag(tag)
      expect(r.conceptIds, tag).toEqual([conceptId])
      expect(FOUNDATION_NODE_MAP[conceptId], conceptId).toBeDefined()
    }
  })

  it('reaches two concepts the curriculum map cannot name at all', () => {
    // `math.number.digitRecognition` and `math.number.skipCount` exist only in
    // the foundations graph — which is why the narrowing lives here and not in
    // `mapFindingToNode`, whose contract is curriculumMap ids.
    for (const id of ['math.number.digitRecognition', 'math.number.skipCount']) {
      expect(FOUNDATION_NODE_MAP[id], id).toBeDefined()
      expect(CURRICULUM_NODE_MAP[id], `${id} is not a curriculumMap id`).toBeUndefined()
    }
    expect(fromTag('math.digit-recognition').outcome).toBe(
      FoundationBridgeOutcome.DetailNarrowed,
    )
  })

  it('narrows BEFORE the direct passthrough — that is the whole repair', () => {
    // `math.problemSolving` and `math.number.counting` are real foundations
    // concepts, so a passthrough checked first would return the coarse (harder)
    // id and nothing downstream would filter it. That was UX-348.
    expect(FOUNDATION_NODE_MAP['math.problemSolving']).toBeDefined()
    expect(FOUNDATION_NODE_MAP['math.number.counting']).toBeDefined()
    expect(fromTag('math.wordProblems').conceptIds).toEqual(['math.problemSolving.oneStep'])
  })

  it('never returns a concept the graph does not define', () => {
    for (const tag of [
      'math.number-sense',
      'math.number-sense.counting',
      'math.digit-recognition',
      'math.wordProblems',
      'math.word-problems.multi-step',
    ]) {
      for (const id of fromTag(tag).conceptIds) {
        expect(FOUNDATION_NODE_MAP[id], `${tag} → ${id}`).toBeDefined()
      }
    }
  })
})
