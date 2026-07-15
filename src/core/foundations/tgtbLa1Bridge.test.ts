import { describe, expect, it } from 'vitest'

import { tgtbLa1Bridge } from './tgtbLa1Bridge'
import { readingGraph } from './readingGraph'
import {
  bridgeCoveredConcepts,
  resolveNativePosition,
  workbookBridgeForSource,
} from './workbookBridge'
import type { BridgeCoverage } from './workbookBridge'

const READING_NODE_IDS = new Set(readingGraph.nodes.map((n) => n.id))
const idsOf = (c: BridgeCoverage[]) => c.map((x) => x.conceptId).sort()

// ── Validation — every mapped id is a real curated reading-graph node ──────

describe('tgtbLa1Bridge — data integrity', () => {
  it('maps ONLY to node ids that exist in the curated reading graph', () => {
    for (const unit of tgtbLa1Bridge.units) {
      for (const id of unit.covers) {
        expect(READING_NODE_IDS, `unknown node ${id} in ${unit.unitLabel}`).toContain(id)
      }
    }
  })

  it('is deliberately coarse: three cumulative bands (the 120-lesson spine)', () => {
    const ceilings = tgtbLa1Bridge.units.map((u) => u.upToLesson)
    expect(ceilings).toEqual([40, 80, 120])
    for (let i = 1; i < ceilings.length; i++) {
      expect(ceilings[i]!).toBeGreaterThan(ceilings[i - 1]!)
    }
  })
})

// ── Alias normalizer — including "tgtb la" ─────────────────────────────────

describe('tgtbLa1Bridge — tolerant lookup', () => {
  it('resolves by canonical id and free-text (incl. "tgtb la")', () => {
    expect(workbookBridgeForSource('tgtbLanguageArts1')).toBe(tgtbLa1Bridge)
    expect(workbookBridgeForSource('tgtb la')).toBe(tgtbLa1Bridge)
    expect(workbookBridgeForSource('TGTB Language Arts')).toBe(tgtbLa1Bridge)
    expect(workbookBridgeForSource('The Good and the Beautiful Language Arts')).toBe(
      tgtbLa1Bridge,
    )
  })

  it('does NOT match TGTB MATH (a different, unbridged curriculum)', () => {
    expect(workbookBridgeForSource('The Good and the Beautiful Math')).toBeNull()
    expect(workbookBridgeForSource('TGTB Math')).toBeNull()
  })
})

// ── Conversion fixture — the family's child at TGTB LA1 Level 110 ──────────

describe('tgtbLa1Bridge — conversion fixture (Level 110)', () => {
  // L110 sits inside the 81–120 band → band-ceiling round-up to 120.
  const native = resolveNativePosition(tgtbLa1Bridge, 110)

  it('resolves L110 to native band-ceiling 120 (in-band credit)', () => {
    expect(native).toBe(120)
  })

  it('covers ALL THREE bands at L110', () => {
    const ids = new Set(idsOf(bridgeCoveredConcepts(tgtbLa1Bridge, native!)))
    // Band 40:
    expect(ids).toContain('reading.phonics.cvc')
    expect(ids).toContain('reading.comprehension.listen')
    // Band 80:
    expect(ids).toContain('reading.phonics.blends')
    expect(ids).toContain('reading.phonics.digraphs')
    expect(ids).toContain('reading.encoding.spellPatterns')
    // Band 120:
    expect(ids).toContain('reading.phonics.longVowels')
    expect(ids).toContain('reading.phonics.vowelTeams')
    expect(ids).toContain('reading.phonics.diphthongs')
    expect(ids).toContain('reading.fluency.pace')
  })
})
