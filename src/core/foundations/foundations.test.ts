import { describe, expect, it } from 'vitest'

import {
  allFoundationNodes,
  FOUNDATION_NODE_MAP,
  foundationGraphs,
  mathGraph,
  readingGraph,
} from './index'
import type { Band } from './types'
import { CURRICULUM_NODE_MAP } from '../curriculum/curriculumMap'

/** Numeric bounds of a band string ('K'→0, '1-2'→[1,2]). K counts as 0. */
function bandBounds(band: Band): number[] {
  return band
    .split('-')
    .map((part) => (part === 'K' ? 0 : Number(part)))
}

describe('foundations concept graph — structural validation', () => {
  it('has version 1 on both domain graphs', () => {
    expect(readingGraph.version).toBe(1)
    expect(mathGraph.version).toBe(1)
  })

  it('matches the curated node counts (reading 31, math 29)', () => {
    expect(readingGraph.nodes).toHaveLength(31)
    expect(mathGraph.nodes).toHaveLength(29)
    expect(allFoundationNodes).toHaveLength(60)
  })

  it('has unique node ids across both domains', () => {
    const ids = allFoundationNodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every `underlies` target exists as a node', () => {
    for (const node of allFoundationNodes) {
      for (const target of node.underlies) {
        expect(
          FOUNDATION_NODE_MAP[target],
          `${node.id} → underlies missing target "${target}"`,
        ).toBeDefined()
      }
    }
  })

  it('keeps `underlies` edges within the same domain', () => {
    for (const node of allFoundationNodes) {
      for (const target of node.underlies) {
        expect(FOUNDATION_NODE_MAP[target].domain).toBe(node.domain)
      }
    }
  })

  it('has no cycles in the `underlies` DAG', () => {
    // Colors: 0 = unvisited, 1 = on the current DFS stack, 2 = done.
    const color = new Map<string, number>()
    const stackTrace: string[] = []

    const visit = (id: string): void => {
      color.set(id, 1)
      stackTrace.push(id)
      for (const next of FOUNDATION_NODE_MAP[id].underlies) {
        const c = color.get(next) ?? 0
        if (c === 1) {
          throw new Error(`cycle: ${[...stackTrace, next].join(' → ')}`)
        }
        if (c === 0) visit(next)
      }
      stackTrace.pop()
      color.set(id, 2)
    }

    expect(() => {
      for (const node of allFoundationNodes) {
        if ((color.get(node.id) ?? 0) === 0) visit(node.id)
      }
    }).not.toThrow()
  })

  it('places every band within K–5', () => {
    for (const node of allFoundationNodes) {
      for (const bound of bandBounds(node.band)) {
        expect(bound).toBeGreaterThanOrEqual(0)
        expect(bound).toBeLessThanOrEqual(5)
      }
    }
  })

  it('gives every node a kid-word name and a parent description', () => {
    for (const node of allFoundationNodes) {
      expect(node.kidName.trim().length).toBeGreaterThan(0)
      expect(node.parentDescription.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('foundations concept graph — curation anchors', () => {
  it('keeps the sight-word node on the existing curriculumMap id', () => {
    const SIGHT_WORDS_ID = 'reading.phonics.sightWords'
    expect(FOUNDATION_NODE_MAP[SIGHT_WORDS_ID]).toBeDefined()
    // The seeding bridge depends on this id already existing in curriculumMap so
    // `deriveSightWordMastery` lights the same node.
    expect(CURRICULUM_NODE_MAP[SIGHT_WORDS_ID]).toBeDefined()
    expect(FOUNDATION_NODE_MAP[SIGHT_WORDS_ID].band).toBe('K-1')
  })

  it('includes both owner-added nodes (2026-07-03 curation)', () => {
    const listen = FOUNDATION_NODE_MAP['reading.comprehension.listen']
    const oneStep = FOUNDATION_NODE_MAP['math.problemSolving.oneStep']
    expect(listen).toBeDefined()
    expect(listen.band).toBe('K-1')
    expect(listen.underlies).toContain('reading.comprehension.explicit')
    expect(oneStep).toBeDefined()
    expect(oneStep.band).toBe('1-2')
    expect(oneStep.underlies).toContain('math.problemSolving')
  })

  it('reuses curriculumMap ids for the shared curriculum nodes', () => {
    // Every foundation node whose id also exists in curriculumMap must agree on
    // domain — the tag bridge relies on the ids lining up.
    for (const node of allFoundationNodes) {
      const cm = CURRICULUM_NODE_MAP[node.id]
      if (cm) expect(cm.domain).toBe(node.domain)
    }
  })

  it('exposes exactly the two academic domains', () => {
    expect(foundationGraphs.map((g) => g.domain)).toEqual(['reading', 'math'])
  })
})
