import { describe, expect, it } from 'vitest'

import {
  CURRICULUM_MAPS,
  CURRICULUM_NODE_MAP,
  CurriculumDomain,
  getDependents,
  getNodesForDomain,
  getNodesForTier,
  MATH_MAP,
  READING_MAP,
  SkillTier,
  SPEECH_MAP,
  WRITING_MAP,
} from './curriculumMap'

// ── CURRICULUM_MAPS structure ──────────────────────────────────

describe('CURRICULUM_MAPS', () => {
  it('contains all four domains', () => {
    const domains = CURRICULUM_MAPS.map((m) => m.domain)
    expect(domains).toEqual(['reading', 'math', 'speech', 'writing'])
  })

  it('every node has a unique ID', () => {
    const allIds = CURRICULUM_MAPS.flatMap((m) => m.nodes.map((n) => n.id))
    const unique = new Set(allIds)
    expect(unique.size).toBe(allIds.length)
  })

  it('every node ID is prefixed with its domain', () => {
    for (const map of CURRICULUM_MAPS) {
      for (const node of map.nodes) {
        expect(node.id).toMatch(new RegExp(`^${map.domain}\\.`))
        expect(node.domain).toBe(map.domain)
      }
    }
  })

  it('every dependency reference points to an existing node', () => {
    for (const map of CURRICULUM_MAPS) {
      for (const node of map.nodes) {
        for (const dep of node.dependencies) {
          expect(CURRICULUM_NODE_MAP[dep]).toBeDefined()
        }
      }
    }
  })

  it('no node depends on itself', () => {
    for (const map of CURRICULUM_MAPS) {
      for (const node of map.nodes) {
        expect(node.dependencies).not.toContain(node.id)
      }
    }
  })
})

// ── CURRICULUM_NODE_MAP ──────────────────────────────────────

describe('CURRICULUM_NODE_MAP', () => {
  it('contains all nodes from all domains', () => {
    const totalNodes = CURRICULUM_MAPS.reduce((sum, m) => sum + m.nodes.length, 0)
    expect(Object.keys(CURRICULUM_NODE_MAP).length).toBe(totalNodes)
  })

  it('looks up specific node by ID', () => {
    const node = CURRICULUM_NODE_MAP['reading.phonics.cvc']
    expect(node).toBeDefined()
    expect(node.label).toBe('CVC words')
    expect(node.domain).toBe('reading')
    expect(node.tier).toBe('foundation')
  })

  it('returns undefined for non-existent node', () => {
    expect(CURRICULUM_NODE_MAP['nonexistent.node']).toBeUndefined()
  })
})

// ── getNodesForDomain ──────────────────────────────────────────

describe('getNodesForDomain', () => {
  it('returns all reading nodes', () => {
    const nodes = getNodesForDomain(CurriculumDomain.Reading)
    expect(nodes.length).toBe(READING_MAP.nodes.length)
    expect(nodes.every((n) => n.domain === 'reading')).toBe(true)
  })

  it('returns all math nodes', () => {
    const nodes = getNodesForDomain(CurriculumDomain.Math)
    expect(nodes.length).toBe(MATH_MAP.nodes.length)
    expect(nodes.every((n) => n.domain === 'math')).toBe(true)
  })

  it('returns all speech nodes', () => {
    const nodes = getNodesForDomain(CurriculumDomain.Speech)
    expect(nodes.length).toBe(SPEECH_MAP.nodes.length)
  })

  it('returns all writing nodes', () => {
    const nodes = getNodesForDomain(CurriculumDomain.Writing)
    expect(nodes.length).toBe(WRITING_MAP.nodes.length)
  })

  it('returns empty array for unknown domain', () => {
    expect(getNodesForDomain('unknown' as CurriculumDomain)).toEqual([])
  })
})

// ── getNodesForTier ─────────────────────────────────────────────

describe('getNodesForTier', () => {
  it('returns foundation reading nodes', () => {
    const nodes = getNodesForTier(CurriculumDomain.Reading, SkillTier.Foundation)
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes.every((n) => n.tier === 'foundation')).toBe(true)
    expect(nodes.every((n) => n.domain === 'reading')).toBe(true)
  })

  it('returns building math nodes', () => {
    const nodes = getNodesForTier(CurriculumDomain.Math, SkillTier.Building)
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes.every((n) => n.tier === 'building')).toBe(true)
  })

  it('returns empty array for tier with no nodes in domain', () => {
    const nodes = getNodesForTier(CurriculumDomain.Speech, SkillTier.Mastering)
    expect(nodes).toEqual([])
  })

  it('returns empty array for unknown domain', () => {
    expect(getNodesForTier('unknown' as CurriculumDomain, SkillTier.Foundation)).toEqual([])
  })

  it('covers all tiers across reading domain', () => {
    const tiers = [
      SkillTier.Foundation,
      SkillTier.Building,
      SkillTier.Developing,
      SkillTier.Applying,
      SkillTier.Extending,
      SkillTier.Mastering,
    ]
    let totalByTier = 0
    for (const tier of tiers) {
      totalByTier += getNodesForTier(CurriculumDomain.Reading, tier).length
    }
    expect(totalByTier).toBe(READING_MAP.nodes.length)
  })
})

// ── getDependents ──────────────────────────────────────────────

describe('getDependents', () => {
  it('returns nodes that depend on letterSounds', () => {
    const dependents = getDependents('reading.phonics.letterSounds')
    expect(dependents.length).toBeGreaterThan(0)
    const ids = dependents.map((n) => n.id)
    expect(ids).toContain('reading.phonics.cvc')
  })

  it('returns empty array for leaf node with no dependents', () => {
    const dependents = getDependents('reading.critical.evaluate')
    expect(dependents).toEqual([])
  })

  it('returns empty array for non-existent node', () => {
    expect(getDependents('nonexistent.node')).toEqual([])
  })

  it('returns multiple dependents for a widely-depended-on node', () => {
    const dependents = getDependents('reading.phonics.cvc')
    expect(dependents.length).toBeGreaterThanOrEqual(2)
    const ids = dependents.map((n) => n.id)
    expect(ids).toContain('reading.phonics.blends')
    expect(ids).toContain('reading.phonics.digraphs')
  })

  it('dependents are always downstream (higher or same tier)', () => {
    const node = CURRICULUM_NODE_MAP['reading.phonics.cvc']
    const dependents = getDependents(node.id)
    for (const dep of dependents) {
      const nodeTierIdx = READING_MAP.nodes.findIndex((n) => n.id === node.id)
      const depTierIdx = READING_MAP.nodes.findIndex((n) => n.id === dep.id)
      if (nodeTierIdx >= 0 && depTierIdx >= 0) {
        expect(depTierIdx).toBeGreaterThan(nodeTierIdx)
      }
    }
  })

  it('cross-domain dependents are found (math placeValue → operations)', () => {
    const dependents = getDependents('math.number.placeValue')
    const ids = dependents.map((n) => n.id)
    expect(ids).toContain('math.operations.addSub')
    expect(ids).toContain('math.number.comparison')
  })
})

// ── Dependency graph integrity ────────────────────────────────

describe('dependency graph integrity', () => {
  it('has no circular dependencies', () => {
    const visited = new Set<string>()
    const stack = new Set<string>()

    function hasCycle(nodeId: string): boolean {
      if (stack.has(nodeId)) return true
      if (visited.has(nodeId)) return false
      visited.add(nodeId)
      stack.add(nodeId)
      const node = CURRICULUM_NODE_MAP[nodeId]
      if (node) {
        for (const dep of node.dependencies) {
          if (hasCycle(dep)) return true
        }
      }
      stack.delete(nodeId)
      return false
    }

    for (const id of Object.keys(CURRICULUM_NODE_MAP)) {
      expect(hasCycle(id)).toBe(false)
    }
  })

  it('foundation nodes have no dependencies (they are roots)', () => {
    for (const map of CURRICULUM_MAPS) {
      const foundations = map.nodes.filter((n) => n.tier === 'foundation')
      for (const node of foundations) {
        if (node.dependencies.length > 0) {
          for (const dep of node.dependencies) {
            const depNode = CURRICULUM_NODE_MAP[dep]
            expect(depNode?.tier).toBe('foundation')
          }
        }
      }
    }
  })
})
