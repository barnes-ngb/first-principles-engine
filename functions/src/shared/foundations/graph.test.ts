import { describe, it, expect } from 'vitest'

import { readingGraph, READING_GRAPH_VERSION } from './readingGraph.js'
import { mathGraph, MATH_GRAPH_VERSION } from './mathGraph.js'
import type { ConceptGraph, ConceptNode, Band } from './types.js'

// ── Band rank ────────────────────────────────────────────────────────────────
// A band's earliest grade, used to check that prerequisites don't point
// backwards. Straddled bands (K-1, 1-2) use their lower bound.
const BAND_RANK: Record<Band, number> = {
  K: 0,
  'K-1': 0,
  1: 1,
  '1-2': 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
}

function nodeIds(graph: ConceptGraph): Set<string> {
  return new Set(graph.nodes.map((n) => n.id))
}

function allTargets(graph: ConceptGraph): string[] {
  return graph.nodes.flatMap((n) => n.underlies)
}

function nodesUnderlying(graph: ConceptGraph): Set<string> {
  return new Set(allTargets(graph))
}

// ── Version numbers ──────────────────────────────────────────────────────────

describe('graph versions', () => {
  it('reading graph is version 1', () => {
    expect(READING_GRAPH_VERSION).toBe(1)
    expect(readingGraph.version).toBe(1)
  })

  it('math graph is version 1', () => {
    expect(MATH_GRAPH_VERSION).toBe(1)
    expect(mathGraph.version).toBe(1)
  })
})

// ── Documented node counts ───────────────────────────────────────────────────

describe('graph structure — documented counts', () => {
  it('reading graph has 31 nodes', () => {
    expect(readingGraph.nodes).toHaveLength(31)
  })

  it('math graph has 29 nodes', () => {
    expect(mathGraph.nodes).toHaveLength(29)
  })
})

// ── Per-graph structural invariants ──────────────────────────────────────────

function describeGraphIntegrity(name: string, graph: ConceptGraph) {
  describe(`${name} — structural integrity`, () => {
    const ids = nodeIds(graph)
    const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]))

    // 1. Node ID uniqueness
    it('has no duplicate node ids', () => {
      const seen = new Set<string>()
      const dupes: string[] = []
      for (const node of graph.nodes) {
        if (seen.has(node.id)) dupes.push(node.id)
        seen.add(node.id)
      }
      expect(dupes).toEqual([])
    })

    // 2. Domain consistency
    it('every node domain matches the graph domain', () => {
      const wrong = graph.nodes
        .filter((n) => n.domain !== graph.domain)
        .map((n) => n.id)
      expect(wrong).toEqual([])
    })

    it('every node id starts with its domain', () => {
      const wrong = graph.nodes
        .filter((n) => !n.id.startsWith(`${graph.domain}.`))
        .map((n) => n.id)
      expect(wrong).toEqual([])
    })

    // 3. Edge validity — every underlies target exists
    it('every underlies target is a valid node id', () => {
      const missing: Array<{ from: string; to: string }> = []
      for (const node of graph.nodes) {
        for (const target of node.underlies) {
          if (!ids.has(target)) missing.push({ from: node.id, to: target })
        }
      }
      expect(missing).toEqual([])
    })

    // 4. No self-edges
    it('no node lists itself in underlies', () => {
      const selfEdges = graph.nodes
        .filter((n) => n.underlies.includes(n.id))
        .map((n) => n.id)
      expect(selfEdges).toEqual([])
    })

    // 5. Connectivity — every node either has incoming edges OR is a
    //    documented strand entry point. The curated graphs have multiple
    //    strands that begin independently at various bands (measurement,
    //    algebra, evidence-only strands). Instead of enumerating them we
    //    check the weaker property: every node is reachable through the
    //    graph OR has no incoming edges (a strand root).
    it('every node either receives an edge or is a strand entry point with underlies', () => {
      const targeted = nodesUnderlying(graph)
      const broken = graph.nodes
        .filter(
          (n) =>
            !targeted.has(n.id) &&
            n.underlies.length === 0,
        )
        .map((n) => n.id)
      // Strand entry points with no incoming edges AND no outgoing edges
      // would be truly isolated. There should be none.
      expect(broken).toEqual([])
    })

    // 6. Band ordering — prerequisites generally don't point backward.
    // The math graph has one intentional exception: multiTables (band 4)
    // underlies division (band 3) — fast recall feeds into division work.
    const KNOWN_BACKWARD_EDGES = new Set([
      'math.operations.multiTables->math.operations.division',
    ])

    it('no unexpected edge points from a later band to an earlier band', () => {
      const violations: Array<{ from: string; fromBand: string; to: string; toBand: string }> = []
      for (const node of graph.nodes) {
        const fromRank = BAND_RANK[node.band as Band]
        for (const targetId of node.underlies) {
          const target = nodeMap.get(targetId)
          if (!target) continue
          const toRank = BAND_RANK[target.band as Band]
          if (toRank < fromRank) {
            const key = `${node.id}->${target.id}`
            if (!KNOWN_BACKWARD_EDGES.has(key)) {
              violations.push({
                from: node.id,
                fromBand: node.band,
                to: target.id,
                toBand: target.band,
              })
            }
          }
        }
      }
      expect(violations).toEqual([])
    })

    // 7. Required fields
    it('every node has all required fields', () => {
      const incomplete: string[] = []
      for (const node of graph.nodes) {
        if (!node.id || !node.domain || !node.band || !node.kidName || !node.parentDescription) {
          incomplete.push(node.id ?? '(missing id)')
        }
        if (!Array.isArray(node.underlies)) {
          incomplete.push(`${node.id}: underlies is not an array`)
        }
      }
      expect(incomplete).toEqual([])
    })

    // 8. kidName is concise (under 40 chars, a child-facing label)
    it('every kidName is under 40 characters', () => {
      const violations = graph.nodes
        .filter((n) => n.kidName.length >= 40)
        .map((n) => ({ id: n.id, kidName: n.kidName, len: n.kidName.length }))
      expect(violations).toEqual([])
    })

    // 9. At least one leaf node (underlies: [])
    it('has at least one terminal (leaf) node', () => {
      const leaves = graph.nodes.filter((n) => n.underlies.length === 0)
      expect(leaves.length).toBeGreaterThan(0)
    })

    // 10. No duplicate edges on any node
    it('no node has duplicate entries in underlies', () => {
      const dupes: Array<{ node: string; target: string }> = []
      for (const node of graph.nodes) {
        const seen = new Set<string>()
        for (const target of node.underlies) {
          if (seen.has(target)) dupes.push({ node: node.id, target })
          seen.add(target)
        }
      }
      expect(dupes).toEqual([])
    })
  })
}

describeGraphIntegrity('reading graph', readingGraph)
describeGraphIntegrity('math graph', mathGraph)

// ── Cross-graph isolation ────────────────────────────────────────────────────

describe('cross-graph isolation', () => {
  const readingIds = nodeIds(readingGraph)
  const mathIds = nodeIds(mathGraph)

  it('reading nodes never reference math node ids', () => {
    const violations: Array<{ from: string; to: string }> = []
    for (const node of readingGraph.nodes) {
      for (const target of node.underlies) {
        if (mathIds.has(target)) violations.push({ from: node.id, to: target })
      }
    }
    expect(violations).toEqual([])
  })

  it('math nodes never reference reading node ids', () => {
    const violations: Array<{ from: string; to: string }> = []
    for (const node of mathGraph.nodes) {
      for (const target of node.underlies) {
        if (readingIds.has(target)) violations.push({ from: node.id, to: target })
      }
    }
    expect(violations).toEqual([])
  })

  it('no node id appears in both graphs', () => {
    const shared = [...readingIds].filter((id) => mathIds.has(id))
    expect(shared).toEqual([])
  })
})
