// ── FIX-224 / UX-288 — the foundations-side resolution of a curriculumMap id ──
//
// The module's own unit tests. `evalBridgeCoverage.test.ts` is the record of
// what UX-288 changed end-to-end; this file pins the rule itself.

import { describe, expect, it } from 'vitest'

import {
  FoundationBridgeOutcome,
  resolveFoundationConcepts,
} from './curriculumNodeBridge'
import { FOUNDATION_NODE_MAP } from './index'
import { mapFindingToNode } from '../curriculum/mapFindingToNode'

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
    // NB `writing.paragraph` is deliberately NOT in this list: it routes to
    // `math.data.graphs`, because `mapFindingToNode`'s keyword fallback matches
    // "graph" inside "paragraph" before it reaches its writing section. That is a
    // pre-existing defect in a file this run may not change — filed as UX-347 and
    // characterized in `evalBridgeCoverage.test.ts`, not papered over here.
    for (const tag of [
      'writing.spelling',
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
    ['math.subtraction.regroup', 'math.operations.regrouping'],
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
