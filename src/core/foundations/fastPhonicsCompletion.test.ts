import { describe, expect, it } from 'vitest'

import {
  FAST_PHONICS_COMPLETION_CONCEPT_IDS,
  FAST_PHONICS_COMPLETION_MAPPING_VERSION,
  FAST_PHONICS_COMPLETION_TARGETS,
  FAST_PHONICS_FINAL_PEAK,
  PARTIAL_COVERAGE_REASON,
  completionMappingFor,
  completionTargetFor,
} from './fastPhonicsCompletion'
import { fastPhonicsUnits, READING_GRAPH_NODE_IDS } from './fastPhonicsBridge'

/**
 * The curated mapping, pinned EXACTLY — ids, qualifiers and attributions.
 *
 * Written out rather than derived in the test: the point is that a change to the
 * bridge or to the derivation shows up here as a diff a human reads, not as a
 * test that agrees with whatever the code now says.
 *
 * The order is the mapping's documented one — attributed peak, then concept id —
 * so the two rows the bridge attributes to Peak 14 are listed alphabetically
 * (`reading.decoding.multisyllable` before `reading.phonics.blends`), which is
 * the order a parent's summary walks.
 */
const EXPECTED: Array<[string, 'direct' | 'partial', number]> = [
  ['reading.phonemic.hearSounds', 'partial', 1],
  ['reading.encoding.spellCvc', 'direct', 5],
  ['reading.phonics.sightWords', 'partial', 5],
  ['reading.phonics.cvc', 'direct', 7],
  ['reading.phonics.letterSounds', 'direct', 7],
  ['reading.phonics.digraphs', 'direct', 8],
  ['reading.phonics.rControlled', 'direct', 12],
  ['reading.decoding.multisyllable', 'partial', 14],
  ['reading.phonics.blends', 'direct', 14],
  ['reading.phonics.diphthongs', 'direct', 17],
  ['reading.phonics.vowelTeams', 'direct', 17],
  ['reading.phonics.longVowels', 'direct', 18],
]

describe('Fast Phonics completion mapping', () => {
  it('claims exactly the twelve curated concepts, with their qualifiers and peaks', () => {
    expect(
      FAST_PHONICS_COMPLETION_TARGETS.map((t) => [
        t.conceptId,
        t.qualifier,
        t.attributedPeak,
      ]),
    ).toEqual(EXPECTED)
  })

  it('attributes vowel teams and multisyllable to the peaks that TEACH them, not the depth rows', () => {
    // The defect this mapping exists to avoid: `bridgeEvidenceForPosition(20)`
    // labels both with "Peak 20", which is alternative CONSONANT spellings.
    expect(completionTargetFor('reading.phonics.vowelTeams')?.attributedPeak).toBe(17)
    expect(completionTargetFor('reading.decoding.multisyllable')?.attributedPeak).toBe(14)
    const depthPeaks = fastPhonicsUnits.filter((u) => u.depthOnly).map((u) => u.peak)
    expect(depthPeaks).toEqual([19, 20])
    for (const target of FAST_PHONICS_COMPLETION_TARGETS) {
      expect(depthPeaks).not.toContain(target.attributedPeak)
    }
  })

  it('adds no concept beyond what the bridge covers, and no unknown node', () => {
    const bridged = new Set(
      fastPhonicsUnits.flatMap((u) => u.covers),
    )
    for (const id of FAST_PHONICS_COMPLETION_CONCEPT_IDS) {
      expect(bridged.has(id)).toBe(true)
      expect(READING_GRAPH_NODE_IDS.has(id)).toBe(true)
    }
    // Nothing the bridge covers is silently dropped: every covered concept is
    // either claimed here or named only by a depth row (none today).
    for (const id of bridged) {
      expect(FAST_PHONICS_COMPLETION_CONCEPT_IDS).toContain(id)
    }
  })

  it('qualifies exactly the three broad concepts, each with a stated reason', () => {
    const partials = FAST_PHONICS_COMPLETION_TARGETS.filter((t) => t.qualifier === 'partial')
    expect(partials.map((t) => t.conceptId).sort()).toEqual([
      'reading.decoding.multisyllable',
      'reading.phonemic.hearSounds',
      'reading.phonics.sightWords',
    ])
    for (const target of partials) {
      expect(target.partialReason).toBe(PARTIAL_COVERAGE_REASON[target.conceptId])
      expect(target.partialReason?.length ?? 0).toBeGreaterThan(20)
    }
  })

  it('exposes one program, versioned, citable only at its final peak', () => {
    const mapping = completionMappingFor('fastPhonics')
    expect(mapping?.mappingVersion).toBe(FAST_PHONICS_COMPLETION_MAPPING_VERSION)
    expect(mapping?.citableFinalPosition).toBe(FAST_PHONICS_FINAL_PEAK)
    expect(mapping?.citableFinalPosition).toBe(20)
    expect(completionMappingFor('mathseeds')).toBeNull()
    expect(completionMappingFor(undefined)).toBeNull()
  })

  it('discloses what the map is, and claims no version or score', () => {
    const note = completionMappingFor('fastPhonics')!.scopeNote
    expect(note).toMatch(/published Fast Phonics scope & sequence/)
    expect(note).toMatch(/version the child used is not known/)
    expect(note).toMatch(/no activity or quiz results/)
    expect(note).not.toMatch(/\d+%/)
  })
})
