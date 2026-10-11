import { describe, expect, it } from 'vitest'

import { readingGraph, READING_GRAPH_VERSION } from './readingGraph.js'
import { mathGraph, MATH_GRAPH_VERSION } from './mathGraph.js'
import {
  allFoundationNodes,
  foundationGraphs,
  FOUNDATION_NODE_MAP,
  foundationGraphVersion,
  foundationNodesForDomain,
} from './graph.js'
import { FoundationDomain } from './types.js'

// ── Data integrity: readingGraph ────────────────────────────────

describe('readingGraph data integrity', () => {
  it('has 31 nodes', () => {
    expect(readingGraph.nodes).toHaveLength(31)
  })

  it('is domain "reading"', () => {
    expect(readingGraph.domain).toBe('reading')
  })

  it('version matches READING_GRAPH_VERSION', () => {
    expect(readingGraph.version).toBe(READING_GRAPH_VERSION)
  })

  it('every node has domain "reading"', () => {
    for (const node of readingGraph.nodes) {
      expect(node.domain).toBe('reading')
    }
  })

  it('every node id starts with "reading."', () => {
    for (const node of readingGraph.nodes) {
      expect(node.id).toMatch(/^reading\./)
    }
  })

  it('has no duplicate node ids', () => {
    const ids = readingGraph.nodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every node has required fields', () => {
    for (const node of readingGraph.nodes) {
      expect(node.id).toBeTruthy()
      expect(node.band).toBeTruthy()
      expect(node.kidName).toBeTruthy()
      expect(node.parentDescription).toBeTruthy()
      expect(Array.isArray(node.underlies)).toBe(true)
    }
  })

  it('every underlies reference points to a valid node in the graph', () => {
    const ids = new Set(readingGraph.nodes.map((n) => n.id))
    for (const node of readingGraph.nodes) {
      for (const ref of node.underlies) {
        expect(ids.has(ref)).toBe(true)
      }
    }
  })

  it('has no self-referencing underlies', () => {
    for (const node of readingGraph.nodes) {
      expect(node.underlies).not.toContain(node.id)
    }
  })
})

// ── Data integrity: mathGraph ───────────────────────────────────

describe('mathGraph data integrity', () => {
  it('has 29 nodes', () => {
    expect(mathGraph.nodes).toHaveLength(29)
  })

  it('is domain "math"', () => {
    expect(mathGraph.domain).toBe('math')
  })

  it('version matches MATH_GRAPH_VERSION', () => {
    expect(mathGraph.version).toBe(MATH_GRAPH_VERSION)
  })

  it('every node has domain "math"', () => {
    for (const node of mathGraph.nodes) {
      expect(node.domain).toBe('math')
    }
  })

  it('every node id starts with "math."', () => {
    for (const node of mathGraph.nodes) {
      expect(node.id).toMatch(/^math\./)
    }
  })

  it('has no duplicate node ids', () => {
    const ids = mathGraph.nodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every node has required fields', () => {
    for (const node of mathGraph.nodes) {
      expect(node.id).toBeTruthy()
      expect(node.band).toBeTruthy()
      expect(node.kidName).toBeTruthy()
      expect(node.parentDescription).toBeTruthy()
      expect(Array.isArray(node.underlies)).toBe(true)
    }
  })

  it('every underlies reference points to a valid node in the graph', () => {
    const ids = new Set(mathGraph.nodes.map((n) => n.id))
    for (const node of mathGraph.nodes) {
      for (const ref of node.underlies) {
        expect(ids.has(ref)).toBe(true)
      }
    }
  })

  it('has no self-referencing underlies', () => {
    for (const node of mathGraph.nodes) {
      expect(node.underlies).not.toContain(node.id)
    }
  })
})

// ── Assembled spine (graph.ts) ──────────────────────────────────

describe('foundationGraphs assembly', () => {
  it('contains exactly two graphs (reading then math)', () => {
    expect(foundationGraphs).toHaveLength(2)
    expect(foundationGraphs[0].domain).toBe('reading')
    expect(foundationGraphs[1].domain).toBe('math')
  })
})

describe('allFoundationNodes', () => {
  it('is the union of both graphs', () => {
    const expected = readingGraph.nodes.length + mathGraph.nodes.length
    expect(allFoundationNodes).toHaveLength(expected)
  })

  it('has no duplicate ids across domains', () => {
    const ids = allFoundationNodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('FOUNDATION_NODE_MAP', () => {
  it('has an entry for every node', () => {
    expect(Object.keys(FOUNDATION_NODE_MAP)).toHaveLength(allFoundationNodes.length)
  })

  it('looks up a reading node by id', () => {
    const node = FOUNDATION_NODE_MAP['reading.phonics.letterSounds']
    expect(node).toBeDefined()
    expect(node.domain).toBe('reading')
    expect(node.kidName).toBe('Know letter sounds')
  })

  it('looks up a math node by id', () => {
    const node = FOUNDATION_NODE_MAP['math.number.counting']
    expect(node).toBeDefined()
    expect(node.domain).toBe('math')
    expect(node.kidName).toBe('Count things')
  })

  it('returns undefined for a non-existent id', () => {
    expect(FOUNDATION_NODE_MAP['reading.nonexistent']).toBeUndefined()
  })
})

describe('foundationGraphVersion', () => {
  it('returns a combined version tag', () => {
    const version = foundationGraphVersion()
    expect(version).toBe(
      `reading@${READING_GRAPH_VERSION}+math@${MATH_GRAPH_VERSION}`,
    )
  })

  it('matches the expected format', () => {
    expect(foundationGraphVersion()).toMatch(/^reading@\d+\+math@\d+$/)
  })
})

describe('foundationNodesForDomain', () => {
  it('returns reading nodes for the reading domain', () => {
    const nodes = foundationNodesForDomain(FoundationDomain.Reading)
    expect(nodes).toHaveLength(readingGraph.nodes.length)
    for (const node of nodes) {
      expect(node.domain).toBe('reading')
    }
  })

  it('returns math nodes for the math domain', () => {
    const nodes = foundationNodesForDomain(FoundationDomain.Math)
    expect(nodes).toHaveLength(mathGraph.nodes.length)
    for (const node of nodes) {
      expect(node.domain).toBe('math')
    }
  })

  it('returns empty array for an unknown domain', () => {
    const nodes = foundationNodesForDomain('science' as FoundationDomain)
    expect(nodes).toEqual([])
  })
})

// ── Cross-domain edge integrity ─────────────────────────────────

describe('cross-domain edge integrity', () => {
  it('no reading node underlies a math node or vice versa', () => {
    const readingIds = new Set(readingGraph.nodes.map((n) => n.id))
    const mathIds = new Set(mathGraph.nodes.map((n) => n.id))

    for (const node of readingGraph.nodes) {
      for (const ref of node.underlies) {
        expect(mathIds.has(ref)).toBe(false)
      }
    }

    for (const node of mathGraph.nodes) {
      for (const ref of node.underlies) {
        expect(readingIds.has(ref)).toBe(false)
      }
    }
  })

  it('every terminal node (empty underlies) exists', () => {
    const terminals = allFoundationNodes.filter((n) => n.underlies.length === 0)
    expect(terminals.length).toBeGreaterThan(0)
    for (const t of terminals) {
      expect(FOUNDATION_NODE_MAP[t.id]).toBeDefined()
    }
  })
})
