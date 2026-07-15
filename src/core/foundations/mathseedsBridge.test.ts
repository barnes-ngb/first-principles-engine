import { describe, expect, it } from 'vitest'

import { mathseedsBridge } from './mathseedsBridge'
import { mathGraph } from './mathGraph'
import {
  bridgeCoveredConcepts,
  resolveNativePosition,
  workbookBridgeForSource,
} from './workbookBridge'
import type { BridgeCoverage } from './workbookBridge'

const MATH_NODE_IDS = new Set(mathGraph.nodes.map((n) => n.id))
const idsOf = (c: BridgeCoverage[]) => c.map((x) => x.conceptId).sort()

// ── Validation — every mapped id is a real curated math-graph node ─────────

describe('mathseedsBridge — data integrity', () => {
  it('maps ONLY to node ids that exist in the curated math graph', () => {
    for (const unit of mathseedsBridge.units) {
      for (const id of unit.covers) {
        expect(MATH_NODE_IDS, `unknown node ${id} in ${unit.unitLabel}`).toContain(id)
      }
    }
  })

  it('has monotonically increasing band ceilings (the 200-lesson, 50/band spine)', () => {
    const ceilings = mathseedsBridge.units.map((u) => u.upToLesson)
    expect(ceilings).toEqual([20, 50, 100, 150, 200])
    for (let i = 1; i < ceilings.length; i++) {
      expect(ceilings[i]!).toBeGreaterThan(ceilings[i - 1]!)
    }
  })

  it('records "rounding" as a NOTE, never an invented node', () => {
    const g3 = mathseedsBridge.units.find((u) => u.upToLesson === 200)!
    expect(g3.notes?.some((n) => /rounding/i.test(n))).toBe(true)
    // and it did NOT sneak in as a fake node id
    for (const unit of mathseedsBridge.units) {
      expect(unit.covers.some((id) => /round/i.test(id))).toBe(false)
    }
  })
})

// ── Alias normalizer — including "math seeds" (with a space) ───────────────

describe('mathseedsBridge — tolerant lookup', () => {
  it('resolves by canonical id and free-text (incl. "math seeds" with a space)', () => {
    expect(workbookBridgeForSource('mathseeds')).toBe(mathseedsBridge)
    expect(workbookBridgeForSource('Mathseeds')).toBe(mathseedsBridge)
    expect(workbookBridgeForSource('math seeds')).toBe(mathseedsBridge)
    expect(workbookBridgeForSource('Reading Eggs Mathseeds')).toBe(mathseedsBridge)
  })
})

// ── Conversion fixture — the owner's exact child at Mathseeds L122 ──────────

describe('mathseedsBridge — conversion fixture (owner child: Level 122)', () => {
  // L122 sits INSIDE the 101–150 (G2) band. Band-ceiling round-up credits it.
  const native = resolveNativePosition(mathseedsBridge, 122)

  it('resolves L122 to native band-ceiling 150 (in-band credit)', () => {
    expect(native).toBe(150)
  })

  it('covers the G1 band fully AND forms regrouping + tables (band 150)', () => {
    const cov = bridgeCoveredConcepts(mathseedsBridge, native!)
    const ids = new Set(idsOf(cov))

    // G1 band (through Lesson 100) fully covered:
    for (const id of [
      'math.number.counting',
      'math.number.placeValue',
      'math.operations.subWithin20',
      'math.operations.twoDigit',
      'math.number.skipCount',
      'math.measurement.money',
      'math.measurement.time',
      'math.fractions.concepts',
      'math.problemSolving.oneStep',
      'math.data.graphs',
    ]) {
      expect(ids, `G1 concept ${id} covered`).toContain(id)
    }
    // The G2 band the child is IN → regrouping + times-tables (forming):
    expect(ids).toContain('math.operations.regrouping')
    expect(ids).toContain('math.operations.multFacts') // "tables forming"

    // NOT yet the G3 band (Lesson 151–200) — fluent tables / division word problems:
    expect(ids).not.toContain('math.operations.multiTables')
    expect(ids).not.toContain('math.problemSolving')
    expect(ids).not.toContain('math.geometry.area')
  })

  it('a not-started position (0 / negative) resolves to null — never band-20 coverage', () => {
    // `currentPosition: 0` is the not-started sentinel (band-ceiling helper guards it).
    expect(resolveNativePosition(mathseedsBridge, 0)).toBeNull()
    expect(resolveNativePosition(mathseedsBridge, -5)).toBeNull()
  })

  it('is cumulative + monotonic — L200 ⊇ L122', () => {
    const at122 = new Set(idsOf(bridgeCoveredConcepts(mathseedsBridge, native!)))
    const at200 = new Set(idsOf(bridgeCoveredConcepts(mathseedsBridge, 200)))
    for (const id of at122) expect(at200.has(id)).toBe(true)
    expect([...at200]).toContain('math.operations.multiTables')
  })
})
