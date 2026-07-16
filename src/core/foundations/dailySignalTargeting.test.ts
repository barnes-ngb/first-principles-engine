import { describe, expect, it } from 'vitest'

import {
  frontierConcepts,
  resolveStuckConcepts,
  resolveTagConcepts,
} from './dailySignalTargeting'
import type { StuckSignalConfig, StuckSignalItem } from './dailySignalTargeting'
import { MathTags, ReadingTags, WritingTags } from '../types/skillTags'
import { FOUNDATION_NODE_MAP } from './index'
import { bridgeCoveredConcepts, resolveNativePosition } from './workbookBridge'
import { fastPhonicsWorkbookBridge, LESSONS_PER_PEAK } from './fastPhonicsBridge'
import type { EvidenceRef, LearnerModel } from '../types/learnerModel'

const NOW = '2026-07-16T12:00:00.000Z'

/** A learner model that DIRECTLY witnessed a given Fast Phonics peak (a review-chat
 *  upload — NOT a positionSync self-write), for the conflict-cap tests. */
function modelWitnessingPeak(peak: number): LearnerModel {
  const witness: EvidenceRef = {
    kind: 'curriculumPosition',
    sourceId: 'fastPhonics',
    note: `Covered in Fast Phonics Peak ${peak}`,
    observedAt: NOW,
    source: 'fastPhonics',
    unit: `Peak ${peak}`,
    via: 'manual',
  }
  return {
    childId: 'child-1',
    graphVersion: 'reading@1+math@1',
    status: 'seeded',
    conceptStates: {
      'reading.phonics.blends': { state: 'forming', evidence: [witness], seededAt: NOW },
    },
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
  }
}

// A Fast Phonics config: the ONE bridge whose `lessonToUnit` is curated, so it is
// the positive branch. Lesson 65 ÷ 5 = Peak 13, whose frontier is blends +
// multisyllable (the Phase-4 blend peak — see fastPhonicsBridge.ts).
function fpConfig(overrides: Partial<StuckSignalConfig> = {}): StuckSignalConfig {
  return {
    id: 'cfg-fp',
    name: 'Fast Phonics',
    currentPosition: 65,
    ...overrides,
  }
}

const fpItem: StuckSignalItem = { workbookConfigId: 'cfg-fp' }

describe('frontierConcepts', () => {
  it('returns only the highest-unit concept(s), not the whole cumulative spine', () => {
    const native = resolveNativePosition(fastPhonicsWorkbookBridge, 65)!
    expect(native).toBe(Math.ceil(65 / LESSONS_PER_PEAK)) // Peak 13
    const coverage = bridgeCoveredConcepts(fastPhonicsWorkbookBridge, native)
    // Cumulative coverage is broad (letter sounds, cvc, digraphs, …), but the
    // frontier is just the Peak-13 concepts.
    expect(coverage.length).toBeGreaterThan(2)
    expect(frontierConcepts(coverage).sort()).toEqual(
      ['reading.decoding.multisyllable', 'reading.phonics.blends'].sort(),
    )
  })

  it('is [] for empty coverage', () => {
    expect(frontierConcepts([])).toEqual([])
  })

  it('drops ids the graph does not define', () => {
    expect(
      frontierConcepts([{ conceptId: 'not.a.real.node', unitLabel: 'Peak 3' }]),
    ).toEqual([])
  })
})

describe('resolveStuckConcepts — positive (bridged, curated) branch', () => {
  it('resolves a stuck Fast Phonics item to the frontier concept(s)', () => {
    const concepts = resolveStuckConcepts(fpItem, fpConfig())
    expect(concepts.sort()).toEqual(
      ['reading.decoding.multisyllable', 'reading.phonics.blends'].sort(),
    )
    // Every returned id is a real graph node.
    concepts.forEach((id) => expect(FOUNDATION_NODE_MAP[id]).toBeDefined())
  })

  it('tracks the position: a later lesson advances the frontier', () => {
    // Lesson 90 ÷ 5 = Peak 18 (split digraphs → long vowels).
    const concepts = resolveStuckConcepts(fpItem, fpConfig({ currentPosition: 90 }))
    expect(concepts).toEqual(['reading.phonics.longVowels'])
  })
})

describe('resolveStuckConcepts — no-guess / curation-gated [] branch', () => {
  it('returns [] for an unmapped workbook source (coverage grows with curation)', () => {
    const concepts = resolveStuckConcepts(fpItem, fpConfig({ name: 'Some Unbridged Workbook' }))
    expect(concepts).toEqual([])
  })

  it('returns [] when the item carries no workbookConfigId', () => {
    expect(resolveStuckConcepts({ workbookConfigId: undefined }, fpConfig())).toEqual([])
  })

  it('returns [] when no config is supplied', () => {
    expect(resolveStuckConcepts(fpItem, null)).toEqual([])
    expect(resolveStuckConcepts(fpItem, undefined)).toEqual([])
  })

  it('returns [] when the supplied config is not the item\'s linked one', () => {
    expect(resolveStuckConcepts(fpItem, fpConfig({ id: 'a-different-config' }))).toEqual([])
  })

  it('returns [] when the config has no tracked position', () => {
    expect(resolveStuckConcepts(fpItem, fpConfig({ currentPosition: undefined }))).toEqual([])
  })

  it('returns [] at the not-started sentinel position (0 ⇒ no coverage, no guess)', () => {
    expect(resolveStuckConcepts(fpItem, fpConfig({ currentPosition: 0 }))).toEqual([])
  })
})

describe('resolveStuckConcepts — provisional-position conflict cap (guesses defer to witnesses)', () => {
  it('caps a Fast Phonics divisor guess at the witnessed peak, never queuing ahead of it', () => {
    // Lesson 90 ÷ 5 = Peak 18 (long vowels) as a GUESS. With a witnessed Peak 13,
    // the cap defers to the witness → the frontier is Peak 13 (blends), NOT Peak 18.
    const uncapped = resolveStuckConcepts(fpItem, fpConfig({ currentPosition: 90 }))
    expect(uncapped).toEqual(['reading.phonics.longVowels'])

    const capped = resolveStuckConcepts(
      fpItem,
      fpConfig({ currentPosition: 90 }),
      modelWitnessingPeak(13),
    )
    expect(capped).not.toContain('reading.phonics.longVowels')
    expect(capped.sort()).toEqual(
      ['reading.decoding.multisyllable', 'reading.phonics.blends'].sort(),
    )
  })

  it('a witness at or above the guess leaves the frontier unchanged', () => {
    // Guess Peak 13; witness Peak 15 → min(13,15) = 13 (still the config frontier).
    const capped = resolveStuckConcepts(
      fpItem,
      fpConfig({ currentPosition: 65 }),
      modelWitnessingPeak(15),
    )
    expect(capped.sort()).toEqual(
      ['reading.decoding.multisyllable', 'reading.phonics.blends'].sort(),
    )
  })
})

describe('resolveTagConcepts — FEAT-69 tag path', () => {
  it('resolves an item\'s mapped skillTags to concept(s)', () => {
    expect(resolveTagConcepts({ skillTags: [ReadingTags.CvcBlend] })).toEqual([
      'reading.phonics.cvc',
    ])
  })

  it('is [] for an item with no tags or only unmapped tags', () => {
    expect(resolveTagConcepts({})).toEqual([])
    expect(resolveTagConcepts({ skillTags: [] })).toEqual([])
    expect(resolveTagConcepts({ skillTags: [WritingTags.LetterFormation] })).toEqual([])
  })
})

describe('resolveStuckConcepts — FEAT-69 union of the workbook + tag paths', () => {
  // Fast Phonics lesson 35 ÷ 5 = Peak 7, whose frontier is letterSounds + cvc.
  const wbFrontier = ['reading.phonics.cvc', 'reading.phonics.letterSounds']

  it('unions a bridged workbook position with a mapped skillTag, no dupes', () => {
    // The workbook frontier already contains `reading.phonics.cvc`; tagging CvcBlend
    // (→ the same concept) must NOT duplicate it, and PlaceValue adds a math concept.
    const item: StuckSignalItem = {
      workbookConfigId: 'cfg-fp',
      skillTags: [ReadingTags.CvcBlend, MathTags.PlaceValue],
    }
    const concepts = resolveStuckConcepts(item, fpConfig({ currentPosition: 35 }))
    expect(concepts.sort()).toEqual(
      [...wbFrontier, 'math.number.placeValue'].sort(),
    )
    // No duplicate cvc despite both paths supplying it.
    expect(concepts.filter((c) => c === 'reading.phonics.cvc')).toHaveLength(1)
  })

  it('resolves a NON-workbook item purely by its mapped tags', () => {
    const item: StuckSignalItem = { skillTags: [MathTags.SubtractionRegroup] }
    expect(resolveStuckConcepts(item, undefined)).toEqual([
      'math.operations.regrouping',
    ])
  })

  it('is [] for a non-workbook item whose tags are all unmapped (no guess)', () => {
    const item: StuckSignalItem = {
      skillTags: [WritingTags.SpellingPhonetic, ReadingTags.FluencyShort],
    }
    expect(resolveStuckConcepts(item, undefined)).toEqual([])
  })

  it('is [] for a non-workbook item with no tags at all', () => {
    expect(resolveStuckConcepts({}, undefined)).toEqual([])
  })
})
