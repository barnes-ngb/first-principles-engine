import { describe, expect, it } from 'vitest'

import { frontierConcepts, resolveStuckConcepts } from './dailySignalTargeting'
import type { StuckSignalConfig, StuckSignalItem } from './dailySignalTargeting'
import { FOUNDATION_NODE_MAP } from './index'
import { bridgeCoveredConcepts, resolveNativePosition } from './workbookBridge'
import { fastPhonicsWorkbookBridge, LESSONS_PER_PEAK } from './fastPhonicsBridge'

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
