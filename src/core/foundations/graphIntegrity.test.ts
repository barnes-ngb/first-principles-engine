import { describe, expect, it } from 'vitest'
import { readingGraph, READING_GRAPH_VERSION } from './readingGraph'
import { mathGraph, MATH_GRAPH_VERSION } from './mathGraph'
import type { ConceptGraph } from './types'

function runGraphIntegrityChecks(graph: ConceptGraph) {
  const allIds = new Set(graph.nodes.map((n) => n.id))

  it('has a positive version number', () => {
    expect(graph.version).toBeGreaterThan(0)
  })

  it('has at least one node', () => {
    expect(graph.nodes.length).toBeGreaterThan(0)
  })

  it('has unique node IDs', () => {
    expect(allIds.size).toBe(graph.nodes.length)
  })

  it('every node belongs to the correct domain', () => {
    for (const node of graph.nodes) {
      expect(node.domain).toBe(graph.domain)
    }
  })

  it('every node ID starts with the graph domain prefix', () => {
    for (const node of graph.nodes) {
      expect(node.id.startsWith(`${graph.domain}.`)).toBe(true)
    }
  })

  it('every node has a non-empty kidName', () => {
    for (const node of graph.nodes) {
      expect(node.kidName.trim().length).toBeGreaterThan(0)
    }
  })

  it('every node has a non-empty parentDescription', () => {
    for (const node of graph.nodes) {
      expect(node.parentDescription.trim().length).toBeGreaterThan(0)
    }
  })

  it('every underlies target references an existing node', () => {
    const dangling: string[] = []
    for (const node of graph.nodes) {
      for (const target of node.underlies) {
        if (!allIds.has(target)) {
          dangling.push(`${node.id} → ${target}`)
        }
      }
    }
    expect(dangling).toEqual([])
  })

  it('has no self-referencing underlies edges', () => {
    const selfRefs = graph.nodes.filter((n) => n.underlies.includes(n.id))
    expect(selfRefs.map((n) => n.id)).toEqual([])
  })

  it('has at least one terminal node (underlies is empty)', () => {
    const terminals = graph.nodes.filter((n) => n.underlies.length === 0)
    expect(terminals.length).toBeGreaterThan(0)
  })

  it('has at least one root node (not referenced by any other node)', () => {
    const referenced = new Set(graph.nodes.flatMap((n) => n.underlies))
    const roots = graph.nodes.filter((n) => !referenced.has(n.id))
    expect(roots.length).toBeGreaterThan(0)
  })

  it('has valid band values', () => {
    const validBands = new Set(['K', '1', '2', '3', '4', '5', 'K-1', '1-2'])
    for (const node of graph.nodes) {
      expect(validBands.has(node.band), `${node.id} has invalid band "${node.band}"`).toBe(true)
    }
  })
}

describe('readingGraph integrity', () => {
  runGraphIntegrityChecks(readingGraph)

  it('has version 1', () => {
    expect(READING_GRAPH_VERSION).toBe(1)
  })

  it('contains 31 nodes (8 strands, per the docstring)', () => {
    expect(readingGraph.nodes.length).toBe(31)
  })

  it('covers all expected strands', () => {
    const strandPrefixes = new Set(
      readingGraph.nodes.map((n) => {
        const parts = n.id.split('.')
        return `${parts[0]}.${parts[1]}`
      }),
    )
    expect(strandPrefixes).toContain('reading.print')
    expect(strandPrefixes).toContain('reading.phonemic')
    expect(strandPrefixes).toContain('reading.phonics')
    expect(strandPrefixes).toContain('reading.fluency')
    expect(strandPrefixes).toContain('reading.vocabulary')
    expect(strandPrefixes).toContain('reading.comprehension')
    expect(strandPrefixes).toContain('reading.independent')
    expect(strandPrefixes).toContain('reading.encoding')
  })
})

describe('mathGraph integrity', () => {
  runGraphIntegrityChecks(mathGraph)

  it('has version 1', () => {
    expect(MATH_GRAPH_VERSION).toBe(1)
  })

  it('contains 29 nodes (9 strands, per the docstring)', () => {
    expect(mathGraph.nodes.length).toBe(29)
  })

  it('covers all expected strands', () => {
    const strandPrefixes = new Set(
      mathGraph.nodes.map((n) => {
        const parts = n.id.split('.')
        return `${parts[0]}.${parts[1]}`
      }),
    )
    expect(strandPrefixes).toContain('math.number')
    expect(strandPrefixes).toContain('math.operations')
    expect(strandPrefixes).toContain('math.fractions')
    expect(strandPrefixes).toContain('math.decimals')
    expect(strandPrefixes).toContain('math.measurement')
    expect(strandPrefixes).toContain('math.geometry')
    expect(strandPrefixes).toContain('math.data')
    expect(strandPrefixes).toContain('math.algebra')
    expect(strandPrefixes).toContain('math.problemSolving')
  })
})
