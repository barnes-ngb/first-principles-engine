import { describe, expect, it } from 'vitest'

import { FORGE_COSTS, getForgeCost, getTierTotalCost, TIER_COMPLETION_BONUSES } from './forgeCosts'

describe('getForgeCost', () => {
  it('returns correct cost for wood belt', () => {
    expect(getForgeCost('wood', 'belt')).toBe(10)
  })

  it('returns correct cost for netherite sword', () => {
    expect(getForgeCost('netherite', 'sword')).toBe(170)
  })

  it('returns 0 for unknown tier', () => {
    expect(getForgeCost('mythril', 'belt')).toBe(0)
  })

  it('returns 0 for unknown piece', () => {
    expect(getForgeCost('wood', 'cape' as never)).toBe(0)
  })

  it('returns 0 for empty tier', () => {
    expect(getForgeCost('', 'belt')).toBe(0)
  })

  it('costs increase with tier for same piece', () => {
    const beltCosts = ['wood', 'stone', 'iron', 'gold', 'diamond', 'netherite'].map(
      (tier) => getForgeCost(tier, 'belt'),
    )
    for (let i = 1; i < beltCosts.length; i++) {
      expect(beltCosts[i]).toBeGreaterThan(beltCosts[i - 1])
    }
  })
})

describe('getTierTotalCost', () => {
  it('returns sum of all piece costs for wood tier', () => {
    const woodCosts = Object.values(FORGE_COSTS['wood'])
    const expected = woodCosts.reduce((sum, cost) => sum + cost, 0)
    expect(getTierTotalCost('wood')).toBe(expected)
    expect(getTierTotalCost('wood')).toBe(85)
  })

  it('returns 0 for unknown tier', () => {
    expect(getTierTotalCost('mythril')).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(getTierTotalCost('')).toBe(0)
  })

  it('tier totals increase with tier level', () => {
    const tiers = ['wood', 'stone', 'iron', 'gold', 'diamond', 'netherite']
    const totals = tiers.map(getTierTotalCost)
    for (let i = 1; i < totals.length; i++) {
      expect(totals[i]).toBeGreaterThan(totals[i - 1])
    }
  })
})

describe('TIER_COMPLETION_BONUSES', () => {
  it('has bonuses for all 6 tiers', () => {
    const tiers = ['wood', 'stone', 'iron', 'gold', 'diamond', 'netherite']
    for (const tier of tiers) {
      expect(TIER_COMPLETION_BONUSES[tier]).toBeGreaterThan(0)
    }
  })

  it('bonuses increase with tier level', () => {
    const tiers = ['wood', 'stone', 'iron', 'gold', 'diamond', 'netherite']
    const bonuses = tiers.map((t) => TIER_COMPLETION_BONUSES[t])
    for (let i = 1; i < bonuses.length; i++) {
      expect(bonuses[i]).toBeGreaterThan(bonuses[i - 1])
    }
  })

  it('wood bonus is 20', () => {
    expect(TIER_COMPLETION_BONUSES['wood']).toBe(20)
  })

  it('netherite bonus is 200', () => {
    expect(TIER_COMPLETION_BONUSES['netherite']).toBe(200)
  })
})

describe('FORGE_COSTS structure', () => {
  it('has all 6 tiers', () => {
    expect(Object.keys(FORGE_COSTS)).toEqual([
      'wood', 'stone', 'iron', 'gold', 'diamond', 'netherite',
    ])
  })

  it('each tier has all 6 pieces', () => {
    const expectedPieces = ['belt', 'shoes', 'breastplate', 'shield', 'helmet', 'sword']
    for (const tier of Object.keys(FORGE_COSTS)) {
      expect(Object.keys(FORGE_COSTS[tier]).sort()).toEqual(expectedPieces.sort())
    }
  })

  it('all costs are positive integers', () => {
    for (const tier of Object.values(FORGE_COSTS)) {
      for (const cost of Object.values(tier)) {
        expect(cost).toBeGreaterThan(0)
        expect(Number.isInteger(cost)).toBe(true)
      }
    }
  })
})
