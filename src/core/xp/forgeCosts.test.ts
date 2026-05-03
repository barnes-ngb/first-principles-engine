import { describe, expect, it } from 'vitest'

import {
  FORGE_COSTS,
  TIER_COMPLETION_BONUSES,
  getForgeCost,
  getTierTotalCost,
} from './forgeCosts'

// ── FORGE_COSTS structure ─────────────────────────────────────

describe('FORGE_COSTS', () => {
  const tiers = ['wood', 'stone', 'iron', 'gold', 'diamond', 'netherite']
  const pieces = ['belt', 'shoes', 'breastplate', 'shield', 'helmet', 'sword']

  it('has costs for all 6 tiers', () => {
    for (const tier of tiers) {
      expect(FORGE_COSTS[tier]).toBeDefined()
    }
  })

  it('has costs for all 6 pieces in each tier', () => {
    for (const tier of tiers) {
      for (const piece of pieces) {
        expect(FORGE_COSTS[tier][piece as keyof (typeof FORGE_COSTS)[string]]).toBeGreaterThan(0)
      }
    }
  })

  it('has increasing total costs per tier', () => {
    let prevTotal = 0
    for (const tier of tiers) {
      const total = Object.values(FORGE_COSTS[tier]).reduce((sum, cost) => sum + cost, 0)
      expect(total).toBeGreaterThan(prevTotal)
      prevTotal = total
    }
  })

  it('sword is the most expensive piece in each tier', () => {
    for (const tier of tiers) {
      const tierCosts = FORGE_COSTS[tier]
      const swordCost = tierCosts.sword
      for (const piece of pieces) {
        expect(swordCost).toBeGreaterThanOrEqual(
          tierCosts[piece as keyof typeof tierCosts],
        )
      }
    }
  })

  it('belt is the cheapest piece in each tier', () => {
    for (const tier of tiers) {
      const tierCosts = FORGE_COSTS[tier]
      const beltCost = tierCosts.belt
      for (const piece of pieces) {
        expect(beltCost).toBeLessThanOrEqual(
          tierCosts[piece as keyof typeof tierCosts],
        )
      }
    }
  })
})

// ── getForgeCost ──────────────────────────────────────────────

describe('getForgeCost', () => {
  it('returns correct cost for wood belt', () => {
    expect(getForgeCost('wood', 'belt')).toBe(10)
  })

  it('returns correct cost for netherite sword', () => {
    expect(getForgeCost('netherite', 'sword')).toBe(170)
  })

  it('returns 0 for unknown tier', () => {
    expect(getForgeCost('obsidian', 'belt')).toBe(0)
  })

  it('returns 0 for unknown piece', () => {
    expect(getForgeCost('wood', 'cape' as never)).toBe(0)
  })

  it('returns 0 for empty tier', () => {
    expect(getForgeCost('', 'belt')).toBe(0)
  })
})

// ── getTierTotalCost ──────────────────────────────────────────

describe('getTierTotalCost', () => {
  it('returns correct total for wood tier', () => {
    // 10 + 10 + 14 + 15 + 16 + 20 = 85
    expect(getTierTotalCost('wood')).toBe(85)
  })

  it('returns correct total for netherite tier', () => {
    // 95 + 95 + 130 + 140 + 140 + 170 = 770
    expect(getTierTotalCost('netherite')).toBe(770)
  })

  it('returns 0 for unknown tier', () => {
    expect(getTierTotalCost('obsidian')).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(getTierTotalCost('')).toBe(0)
  })

  it('matches sum of individual piece costs', () => {
    const pieces = ['belt', 'shoes', 'breastplate', 'shield', 'helmet', 'sword'] as const
    for (const tier of ['wood', 'stone', 'iron', 'gold', 'diamond', 'netherite']) {
      const manualSum = pieces.reduce(
        (sum, piece) => sum + getForgeCost(tier, piece),
        0,
      )
      expect(getTierTotalCost(tier)).toBe(manualSum)
    }
  })
})

// ── TIER_COMPLETION_BONUSES ───────────────────────────────────

describe('TIER_COMPLETION_BONUSES', () => {
  it('has bonuses for all 6 tiers', () => {
    const tiers = ['wood', 'stone', 'iron', 'gold', 'diamond', 'netherite']
    for (const tier of tiers) {
      expect(TIER_COMPLETION_BONUSES[tier]).toBeGreaterThan(0)
    }
  })

  it('has increasing bonuses per tier', () => {
    const tiers = ['wood', 'stone', 'iron', 'gold', 'diamond', 'netherite']
    let prev = 0
    for (const tier of tiers) {
      expect(TIER_COMPLETION_BONUSES[tier]).toBeGreaterThan(prev)
      prev = TIER_COMPLETION_BONUSES[tier]
    }
  })

  it('wood bonus is 20 diamonds', () => {
    expect(TIER_COMPLETION_BONUSES['wood']).toBe(20)
  })

  it('netherite bonus is 200 diamonds', () => {
    expect(TIER_COMPLETION_BONUSES['netherite']).toBe(200)
  })
})
