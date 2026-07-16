import { describe, expect, it } from 'vitest'

import {
  conceptsForTags,
  TAG_CONCEPT_BRIDGE,
  TAG_CONCEPT_BRIDGE_VERSION,
} from './tagConceptBridge'
import { FOUNDATION_NODE_MAP } from './index'
import {
  MathTags,
  ReadingTags,
  RegulationTags,
  WritingTags,
} from '../types/skillTags'

describe('tagConceptBridge — data integrity', () => {
  it('is versioned', () => {
    expect(TAG_CONCEPT_BRIDGE_VERSION).toBe(1)
  })

  it('every mapped target id is a REAL graph node (no-guess pin)', () => {
    // The core discipline: a seeded target that is not in the graph would be a
    // guess. This pins the whole table against the actual reading+math graphs.
    for (const [tag, ids] of Object.entries(TAG_CONCEPT_BRIDGE)) {
      for (const id of ids) {
        expect(FOUNDATION_NODE_MAP[id], `${tag} → ${id}`).toBeDefined()
      }
    }
  })
})

describe('conceptsForTags — mapped (high-confidence) tags', () => {
  it('resolves reading tags to their 1:1 concept nodes', () => {
    expect(conceptsForTags([ReadingTags.PhonemicAwareness])).toEqual([
      'reading.phonemic.hearSounds',
    ])
    expect(conceptsForTags([ReadingTags.LetterSound])).toEqual([
      'reading.phonics.letterSounds',
    ])
    expect(conceptsForTags([ReadingTags.CvcBlend])).toEqual(['reading.phonics.cvc'])
    expect(conceptsForTags([ReadingTags.SightWords])).toEqual([
      'reading.phonics.sightWords',
    ])
  })

  it('resolves math tags to their 1:1 concept nodes', () => {
    expect(conceptsForTags([MathTags.AdditionFacts])).toEqual([
      'math.operations.addWithin20',
    ])
    expect(conceptsForTags([MathTags.SubtractionNoRegroup])).toEqual([
      'math.operations.twoDigit',
    ])
    expect(conceptsForTags([MathTags.SubtractionRegroup])).toEqual([
      'math.operations.regrouping',
    ])
    expect(conceptsForTags([MathTags.PlaceValue])).toEqual([
      'math.number.placeValue',
    ])
    expect(conceptsForTags([MathTags.WordProblems])).toEqual([
      'math.problemSolving.oneStep',
    ])
  })

  it('dedups when several tags map to the same / overlapping concepts', () => {
    // Same tag twice → one concept, no dupes.
    expect(conceptsForTags([ReadingTags.CvcBlend, ReadingTags.CvcBlend])).toEqual([
      'reading.phonics.cvc',
    ])
    // Two distinct mapped tags → the union, order-independent, no dupes.
    const both = conceptsForTags([ReadingTags.CvcBlend, MathTags.PlaceValue])
    expect(both.sort()).toEqual(
      ['reading.phonics.cvc', 'math.number.placeValue'].sort(),
    )
  })
})

describe('conceptsForTags — unmapped tags resolve to [] (NO GUESS)', () => {
  it('an unknown / synthetic tag maps to nothing', () => {
    expect(conceptsForTags(['reading.general'])).toEqual([])
    expect(conceptsForTags(['totally.made.up'])).toEqual([])
  })

  it('an empty tag list maps to nothing (LLM-generated / untagged items)', () => {
    expect(conceptsForTags([])).toEqual([])
  })

  it('the ambiguous reading.fluency.short tag is unmapped pending curation', () => {
    expect(conceptsForTags([ReadingTags.FluencyShort])).toEqual([])
  })

  it('EVERY writing.* tag maps to [] (scope boundary: reading+math graph only)', () => {
    for (const tag of Object.values(WritingTags)) {
      expect(conceptsForTags([tag]), tag).toEqual([])
    }
  })

  it('EVERY regulation.* tag maps to [] (regulation is not a concept domain)', () => {
    for (const tag of Object.values(RegulationTags)) {
      expect(conceptsForTags([tag]), tag).toEqual([])
    }
  })

  it('a mixed list keeps only the mapped tags', () => {
    const out = conceptsForTags([
      ReadingTags.CvcBlend, // mapped
      WritingTags.LetterFormation, // []
      RegulationTags.Attention, // []
      'made.up.tag', // unknown
    ])
    expect(out).toEqual(['reading.phonics.cvc'])
  })
})

describe('conceptsForTags — defensive node-map filter', () => {
  it('drops a mapped target id that is not a real graph node (no-guess guard)', () => {
    // The table ships only real ids (pinned above), but the resolver still filters:
    // if a future bad curation slipped a non-node id in, it would resolve to [],
    // never a phantom target. (`selectQuestTargets` would ignore it anyway.)
    const FAKE = 'zzz.synthetic.tag.for.test'
    TAG_CONCEPT_BRIDGE[FAKE] = ['not.a.real.node']
    try {
      expect(conceptsForTags([FAKE])).toEqual([])
    } finally {
      delete TAG_CONCEPT_BRIDGE[FAKE]
    }
  })
})
