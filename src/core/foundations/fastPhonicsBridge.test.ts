import { describe, expect, it } from 'vitest'

import {
  bridgeEvidenceForPosition,
  bridgeForSource,
  fastPhonicsBridge,
  fastPhonicsUnits,
  FAST_PHONICS_BRIDGE_VERSION,
  READING_GRAPH_NODE_IDS,
} from './fastPhonicsBridge'

describe('fastPhonicsBridge — versioned data integrity', () => {
  it('carries all 20 peaks exactly once, in order', () => {
    const peaks = fastPhonicsUnits.map((u) => u.peak)
    expect(peaks).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
    expect(new Set(peaks).size).toBe(20)
  })

  it('is a source-tagged, versioned bridge', () => {
    expect(fastPhonicsBridge.source).toBe('fastPhonics')
    expect(fastPhonicsBridge.version).toBe(FAST_PHONICS_BRIDGE_VERSION)
    expect(fastPhonicsBridge.version).toBe(1)
    expect(fastPhonicsBridge.units).toBe(fastPhonicsUnits)
  })

  it('every covers[] id is a real curated reading-graph node', () => {
    for (const unit of fastPhonicsUnits) {
      expect(unit.covers.length).toBeGreaterThan(0)
      for (const id of unit.covers) {
        expect(
          READING_GRAPH_NODE_IDS.has(id),
          `Peak ${unit.peak} covers unknown node "${id}"`,
        ).toBe(true)
      }
    }
  })

  it('phases 2–5 partition the peaks per the official scope & sequence', () => {
    const phaseOf = (peak: number) => fastPhonicsUnits.find((u) => u.peak === peak)!.phase
    // Phase 2: Peaks 1–5
    for (let p = 1; p <= 5; p++) expect(phaseOf(p)).toBe(2)
    // Phase 3: Peaks 6–12
    for (let p = 6; p <= 12; p++) expect(phaseOf(p)).toBe(3)
    // Phase 4: Peaks 13–14
    for (let p = 13; p <= 14; p++) expect(phaseOf(p)).toBe(4)
    // Phase 5: Peaks 15–20
    for (let p = 15; p <= 20; p++) expect(phaseOf(p)).toBe(5)
    // Every phase value is one of 2..5 (no strays)
    for (const u of fastPhonicsUnits) expect([2, 3, 4, 5]).toContain(u.phase)
  })

  it('depth-only rows (19–20) add NO new node id beyond earlier peaks', () => {
    const earlier = new Set(
      fastPhonicsUnits.filter((u) => u.peak <= 18).flatMap((u) => u.covers),
    )
    for (const unit of fastPhonicsUnits.filter((u) => u.depthOnly)) {
      expect(unit.peak).toBeGreaterThanOrEqual(19)
      for (const id of unit.covers) {
        expect(
          earlier.has(id),
          `Depth-only Peak ${unit.peak} introduces new node "${id}"`,
        ).toBe(true)
      }
    }
    // Exactly Peaks 19 and 20 are depth-only.
    expect(fastPhonicsUnits.filter((u) => u.depthOnly).map((u) => u.peak)).toEqual([19, 20])
  })

  it('Peaks 13–14 introduce no new grapheme (blend/word-shape peaks)', () => {
    for (const peak of [13, 14]) {
      const unit = fastPhonicsUnits.find((u) => u.peak === peak)!
      expect(unit.graphemes).toBeUndefined()
    }
  })
})

describe('bridgeForSource — tolerant lookup', () => {
  it('resolves the canonical + free-text spellings', () => {
    expect(bridgeForSource('fastPhonics')).toBe(fastPhonicsBridge)
    expect(bridgeForSource('Fast Phonics')).toBe(fastPhonicsBridge)
    expect(bridgeForSource('fast-phonics')).toBe(fastPhonicsBridge)
    expect(bridgeForSource('Reading Eggs Fast Phonics')).toBe(fastPhonicsBridge)
  })

  it('returns null for an unbridged / empty source', () => {
    expect(bridgeForSource('Teach Your Monster')).toBeNull()
    expect(bridgeForSource('')).toBeNull()
    expect(bridgeForSource(undefined)).toBeNull()
    expect(bridgeForSource(null)).toBeNull()
  })
})

describe('bridgeEvidenceForPosition — the deterministic mapping authority', () => {
  const idsFor = (peak: number) => bridgeEvidenceForPosition(peak).map((e) => e.conceptId)

  it('Peak 13 covers the Phase 2–4 spine but NOT ahead-of-frontier long vowels', () => {
    const ids = idsFor(13)
    // Must include (bridge doc worked example — corrected v1):
    expect(ids).toContain('reading.phonics.digraphs') // Peak 8
    expect(ids).toContain('reading.phonics.vowelTeams') // early set, Peaks 9–10
    expect(ids).toContain('reading.phonics.rControlled') // Peaks 10, 12
    expect(ids).toContain('reading.phonics.diphthongs') // Peak 11
    expect(ids).toContain('reading.phonics.blends') // Peak 13 — the frontier
    // Phase 2 spine also present:
    expect(ids).toContain('reading.phonemic.hearSounds')
    expect(ids).toContain('reading.phonics.letterSounds')
    expect(ids).toContain('reading.phonics.cvc')
    expect(ids).toContain('reading.encoding.spellCvc')
    expect(ids).toContain('reading.phonics.sightWords')
    expect(ids).toContain('reading.decoding.multisyllable') // begins Peak 13
    // Must NOT include — silent-e is Peak 18, ahead of a Peak-13 child (§ahead-of-frontier):
    expect(ids).not.toContain('reading.phonics.longVowels')
  })

  it('dedupes per concept, keeping the highest peak that covers it as the label', () => {
    const evidence = bridgeEvidenceForPosition(13)
    // No concept appears twice.
    const ids = evidence.map((e) => e.conceptId)
    expect(new Set(ids).size).toBe(ids.length)
    // rControlled is covered at Peaks 10 and 12 → label is Peak 12 (the highest ≤ 13).
    const rControlled = evidence.find((e) => e.conceptId === 'reading.phonics.rControlled')!
    expect(rControlled.unit.peak).toBe(12)
    // cvc is covered at Peaks 1–7 → label is Peak 7.
    const cvc = evidence.find((e) => e.conceptId === 'reading.phonics.cvc')!
    expect(cvc.unit.peak).toBe(7)
  })

  it('is cumulative and monotonic — a higher peak covers a superset', () => {
    const at5 = new Set(idsFor(5))
    const at13 = new Set(idsFor(13))
    const at20 = new Set(idsFor(20))
    for (const id of at5) expect(at13.has(id)).toBe(true)
    for (const id of at13) expect(at20.has(id)).toBe(true)
    // Long vowels only appear once the child reaches Peak 18.
    expect(idsFor(17)).not.toContain('reading.phonics.longVowels')
    expect(idsFor(18)).toContain('reading.phonics.longVowels')
  })

  it('a below-Phase-2 position (0) grounds nothing', () => {
    expect(bridgeEvidenceForPosition(0)).toEqual([])
  })
})
