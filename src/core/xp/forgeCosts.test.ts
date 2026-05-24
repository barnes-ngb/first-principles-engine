import { describe, expect, it } from 'vitest'
import { FORGE_COSTS, TIER_COMPLETION_BONUSES, getForgeCost, getTierTotalCost } from './forgeCosts'

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

  it('costs increase monotonically by tier for each piece', () => {
    const tiers = ['wood', 'stone', 'iron', 'gold', 'diamond', 'netherite'] as const
    const pieces = ['belt', 'shoes', 'breastplate', 'shield', 'helmet', 'sword'] as const

    for (const piece of pieces) {
      for (let i = 1; i < tiers.length; i++) {
        expect(getForgeCost(tiers[i], piece)).toBeGreaterThan(
          getForgeCost(tiers[i - 1], piece),
        )
      }
    }
  })
})

describe('getTierTotalCost', () => {
  it('returns total for wood tier', () => {
    expect(getTierTotalCost('wood')).toBe(85)
  })

  it('returns total for netherite tier', () => {
    expect(getTierTotalCost('netherite')).toBe(770)
  })

  it('returns 0 for unknown tier', () => {
    expect(getTierTotalCost('mythril')).toBe(0)
  })

  it('matches sum of all piece costs in each tier', () => {
    for (const [tier, costs] of Object.entries(FORGE_COSTS)) {
      const expected = Object.values(costs).reduce((s, c) => s + c, 0)
      expect(getTierTotalCost(tier)).toBe(expected)
    }
  })

  it('total costs increase with tier progression', () => {
    const tiers = ['wood', 'stone', 'iron', 'gold', 'diamond', 'netherite']
    for (let i = 1; i < tiers.length; i++) {
      expect(getTierTotalCost(tiers[i])).toBeGreaterThan(
        getTierTotalCost(tiers[i - 1]),
      )
    }
  })
})

describe('FORGE_COSTS structure', () => {
  it('has all 6 tiers', () => {
    expect(Object.keys(FORGE_COSTS)).toEqual([
      'wood', 'stone', 'iron', 'gold', 'diamond', 'netherite',
    ])
  })

  it('has all 6 pieces in every tier', () => {
    const expectedPieces = ['belt', 'shoes', 'breastplate', 'shield', 'helmet', 'sword']
    for (const tier of Object.keys(FORGE_COSTS)) {
      expect(Object.keys(FORGE_COSTS[tier]).sort()).toEqual(expectedPieces.sort())
    }
  })
})

describe('TIER_COMPLETION_BONUSES', () => {
  it('has all 6 tiers', () => {
    expect(Object.keys(TIER_COMPLETION_BONUSES)).toEqual([
      'wood', 'stone', 'iron', 'gold', 'diamond', 'netherite',
    ])
  })

  it('bonuses increase with tier', () => {
    const tiers = ['wood', 'stone', 'iron', 'gold', 'diamond', 'netherite']
    for (let i = 1; i < tiers.length; i++) {
      expect(TIER_COMPLETION_BONUSES[tiers[i]]).toBeGreaterThan(
        TIER_COMPLETION_BONUSES[tiers[i - 1]],
      )
    }
  })
})
