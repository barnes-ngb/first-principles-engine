import { describe, it, expect } from 'vitest'

import { FORGE_COSTS, getForgeCost, getTierTotalCost, TIER_COMPLETION_BONUSES } from './forgeCosts'

describe('FORGE_COSTS', () => {
  it('defines costs for all 6 tiers', () => {
    const tiers = Object.keys(FORGE_COSTS)
    expect(tiers).toEqual(['wood', 'stone', 'iron', 'gold', 'diamond', 'netherite'])
  })

  it('each tier has costs for all 6 armor pieces', () => {
    const expectedPieces = ['belt', 'shoes', 'breastplate', 'shield', 'helmet', 'sword']
    for (const [tier, costs] of Object.entries(FORGE_COSTS)) {
      const pieces = Object.keys(costs)
      expect(pieces).toEqual(expectedPieces)
      for (const cost of Object.values(costs)) {
        expect(cost).toBeGreaterThan(0)
      }
    }
  })

  it('costs increase with each tier', () => {
    const tiers = Object.keys(FORGE_COSTS)
    for (let i = 1; i < tiers.length; i++) {
      const prevTotal = getTierTotalCost(tiers[i - 1])
      const currTotal = getTierTotalCost(tiers[i])
      expect(currTotal).toBeGreaterThan(prevTotal)
    }
  })
})

describe('getForgeCost', () => {
  it('returns correct cost for wood belt', () => {
    expect(getForgeCost('wood', 'belt')).toBe(10)
  })

  it('returns correct cost for netherite sword', () => {
    expect(getForgeCost('netherite', 'sword')).toBe(170)
  })

  it('returns 0 for invalid tier', () => {
    expect(getForgeCost('mythril', 'belt')).toBe(0)
  })

  it('returns 0 for invalid piece', () => {
    expect(getForgeCost('wood', 'cape' as never)).toBe(0)
  })

  it('returns 0 for both invalid', () => {
    expect(getForgeCost('fake', 'fake' as never)).toBe(0)
  })
})

describe('getTierTotalCost', () => {
  it('wood tier totals 85 diamonds', () => {
    expect(getTierTotalCost('wood')).toBe(85)
  })

  it('stone tier totals 135 diamonds', () => {
    expect(getTierTotalCost('stone')).toBe(135)
  })

  it('iron tier totals 210 diamonds', () => {
    expect(getTierTotalCost('iron')).toBe(210)
  })

  it('gold tier totals 330 diamonds', () => {
    expect(getTierTotalCost('gold')).toBe(330)
  })

  it('diamond tier totals 505 diamonds', () => {
    expect(getTierTotalCost('diamond')).toBe(505)
  })

  it('netherite tier totals 770 diamonds', () => {
    expect(getTierTotalCost('netherite')).toBe(770)
  })

  it('returns 0 for invalid tier', () => {
    expect(getTierTotalCost('mythril')).toBe(0)
  })
})

describe('TIER_COMPLETION_BONUSES', () => {
  it('defines bonuses for all 6 tiers', () => {
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

  it('wood bonus is 20', () => {
    expect(TIER_COMPLETION_BONUSES.wood).toBe(20)
  })

  it('netherite bonus is 200', () => {
    expect(TIER_COMPLETION_BONUSES.netherite).toBe(200)
  })
})
