import { describe, expect, it } from 'vitest'

import {
  CURRICULUM_MAPS,
  CURRICULUM_NODE_MAP,
  CurriculumDomain,
  getDependents,
  getNodesForDomain,
  getNodesForTier,
  SkillTier,
} from './curriculumMap'

describe('CURRICULUM_NODE_MAP', () => {
  it('contains all nodes from all domain maps', () => {
    const totalFromMaps = CURRICULUM_MAPS.reduce((sum, m) => sum + m.nodes.length, 0)
    expect(Object.keys(CURRICULUM_NODE_MAP).length).toBe(totalFromMaps)
  })

  it('looks up a known reading node by ID', () => {
    const node = CURRICULUM_NODE_MAP['reading.phonics.cvc']
    expect(node).toBeDefined()
    expect(node.domain).toBe('reading')
    expect(node.label).toBe('CVC words')
  })

  it('looks up a known math node by ID', () => {
    const node = CURRICULUM_NODE_MAP['math.operations.addSub']
    expect(node).toBeDefined()
    expect(node.domain).toBe('math')
  })

  it('returns undefined for a nonexistent node', () => {
    expect(CURRICULUM_NODE_MAP['nonexistent.node']).toBeUndefined()
  })
})

describe('getNodesForDomain', () => {
  it('returns reading domain nodes', () => {
    const nodes = getNodesForDomain(CurriculumDomain.Reading)
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes.every((n) => n.domain === 'reading')).toBe(true)
  })

  it('returns math domain nodes', () => {
    const nodes = getNodesForDomain(CurriculumDomain.Math)
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes.every((n) => n.domain === 'math')).toBe(true)
  })

  it('returns speech domain nodes', () => {
    const nodes = getNodesForDomain(CurriculumDomain.Speech)
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes.every((n) => n.domain === 'speech')).toBe(true)
  })

  it('returns writing domain nodes', () => {
    const nodes = getNodesForDomain(CurriculumDomain.Writing)
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes.every((n) => n.domain === 'writing')).toBe(true)
  })

  it('returns empty for invalid domain', () => {
    const nodes = getNodesForDomain('invalid' as CurriculumDomain)
    expect(nodes).toEqual([])
  })
})

describe('getNodesForTier', () => {
  it('returns only foundation-tier nodes for reading', () => {
    const nodes = getNodesForTier(CurriculumDomain.Reading, SkillTier.Foundation)
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes.every((n) => n.tier === 'foundation')).toBe(true)
    expect(nodes.every((n) => n.domain === 'reading')).toBe(true)
  })

  it('returns building-tier math nodes', () => {
    const nodes = getNodesForTier(CurriculumDomain.Math, SkillTier.Building)
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes.every((n) => n.tier === 'building' && n.domain === 'math')).toBe(true)
  })

  it('returns empty for a tier with no nodes', () => {
    const nodes = getNodesForTier(CurriculumDomain.Speech, SkillTier.Mastering)
    expect(nodes).toEqual([])
  })

  it('returns empty for invalid domain', () => {
    const nodes = getNodesForTier('fake' as CurriculumDomain, SkillTier.Foundation)
    expect(nodes).toEqual([])
  })
})

describe('getDependents', () => {
  it('returns nodes that depend on letterSounds', () => {
    const dependents = getDependents('reading.phonics.letterSounds')
    expect(dependents.length).toBeGreaterThan(0)
    expect(dependents.some((n) => n.id === 'reading.phonics.cvc')).toBe(true)
  })

  it('returns empty for a leaf node with no dependents', () => {
    const dependents = getDependents('speech.confidence')
    expect(dependents).toEqual([])
  })

  it('returns empty for a nonexistent node', () => {
    const dependents = getDependents('nonexistent.node')
    expect(dependents).toEqual([])
  })

  it('all dependents actually list the node in their dependencies', () => {
    const nodeId = 'math.number.counting'
    const dependents = getDependents(nodeId)
    for (const dep of dependents) {
      expect(dep.dependencies).toContain(nodeId)
    }
  })
})

describe('CURRICULUM_MAPS structure', () => {
  it('has exactly 4 domains', () => {
    expect(CURRICULUM_MAPS).toHaveLength(4)
    const domains = CURRICULUM_MAPS.map((m) => m.domain)
    expect(domains).toContain('reading')
    expect(domains).toContain('math')
    expect(domains).toContain('speech')
    expect(domains).toContain('writing')
  })

  it('all node IDs are unique', () => {
    const allIds = CURRICULUM_MAPS.flatMap((m) => m.nodes.map((n) => n.id))
    const uniqueIds = new Set(allIds)
    expect(uniqueIds.size).toBe(allIds.length)
  })

  it('all dependencies reference existing nodes', () => {
    const allIds = new Set(CURRICULUM_MAPS.flatMap((m) => m.nodes.map((n) => n.id)))
    for (const map of CURRICULUM_MAPS) {
      for (const node of map.nodes) {
        for (const dep of node.dependencies) {
          expect(allIds.has(dep)).toBe(true)
        }
      }
    }
  })

  it('node IDs start with their domain', () => {
    for (const map of CURRICULUM_MAPS) {
      for (const node of map.nodes) {
        expect(node.id.startsWith(map.domain)).toBe(true)
      }
    }
  })
})
