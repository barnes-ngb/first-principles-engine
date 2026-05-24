import { describe, expect, it, vi } from 'vitest'

vi.mock('../../features/avatar/voxel/tierMaterials', () => ({
  TIERS: {
    WOOD:      { minXp: 0,    label: 'Wood' },
    STONE:     { minXp: 100,  label: 'Stone' },
    IRON:      { minXp: 750,  label: 'Iron' },
    GOLD:      { minXp: 1500, label: 'Gold' },
    DIAMOND:   { minXp: 2500, label: 'Diamond' },
    NETHERITE: { minXp: 5000, label: 'Netherite' },
  },
}))

import { ARMOR_TIERS, ArmorTier, getArmorTier, getNextTierProgress } from './armorTiers'

describe('ARMOR_TIERS', () => {
  it('has 6 tiers in ascending XP order', () => {
    expect(ARMOR_TIERS).toHaveLength(6)
    for (let i = 1; i < ARMOR_TIERS.length; i++) {
      expect(ARMOR_TIERS[i].minXp).toBeGreaterThan(ARMOR_TIERS[i - 1].minXp)
    }
  })

  it('first tier starts at 0 XP', () => {
    expect(ARMOR_TIERS[0].minXp).toBe(0)
    expect(ARMOR_TIERS[0].tier).toBe(ArmorTier.Wood)
  })

  it('last tier is netherite at 5000 XP', () => {
    const last = ARMOR_TIERS[ARMOR_TIERS.length - 1]
    expect(last.tier).toBe(ArmorTier.Netherite)
    expect(last.minXp).toBe(5000)
  })
})

describe('getArmorTier', () => {
  it('returns wood for 0 XP', () => {
    expect(getArmorTier(0).tier).toBe('wood')
  })

  it('returns wood for 99 XP', () => {
    expect(getArmorTier(99).tier).toBe('wood')
  })

  it('returns stone at exactly 100 XP', () => {
    expect(getArmorTier(100).tier).toBe('stone')
  })

  it('returns iron at exactly 750 XP', () => {
    expect(getArmorTier(750).tier).toBe('iron')
  })

  it('returns gold at exactly 1500 XP', () => {
    expect(getArmorTier(1500).tier).toBe('gold')
  })

  it('returns diamond at exactly 2500 XP', () => {
    expect(getArmorTier(2500).tier).toBe('diamond')
  })

  it('returns netherite at exactly 5000 XP', () => {
    expect(getArmorTier(5000).tier).toBe('netherite')
  })

  it('returns netherite for very high XP', () => {
    expect(getArmorTier(999999).tier).toBe('netherite')
  })

  it('returns wood for negative XP', () => {
    expect(getArmorTier(-10).tier).toBe('wood')
  })

  it('returns correct tier just below each threshold', () => {
    expect(getArmorTier(99).tier).toBe('wood')
    expect(getArmorTier(749).tier).toBe('stone')
    expect(getArmorTier(1499).tier).toBe('iron')
    expect(getArmorTier(2499).tier).toBe('gold')
    expect(getArmorTier(4999).tier).toBe('diamond')
  })
})

describe('getNextTierProgress', () => {
  it('returns 0 progress at start of wood tier', () => {
    const result = getNextTierProgress(0)
    expect(result.current.tier).toBe('wood')
    expect(result.next?.tier).toBe('stone')
    expect(result.progress).toBe(0)
    expect(result.xpToNext).toBe(100)
  })

  it('returns 50% progress halfway through wood tier', () => {
    const result = getNextTierProgress(50)
    expect(result.current.tier).toBe('wood')
    expect(result.progress).toBe(0.5)
    expect(result.xpToNext).toBe(50)
  })

  it('returns 0 progress at start of stone tier', () => {
    const result = getNextTierProgress(100)
    expect(result.current.tier).toBe('stone')
    expect(result.next?.tier).toBe('iron')
    expect(result.progress).toBe(0)
    expect(result.xpToNext).toBe(650)
  })

  it('returns progress within mid-range tier', () => {
    const result = getNextTierProgress(1000)
    expect(result.current.tier).toBe('iron')
    expect(result.next?.tier).toBe('gold')
    expect(result.progress).toBeCloseTo((1000 - 750) / (1500 - 750))
    expect(result.xpToNext).toBe(500)
  })

  it('returns 1 progress at max tier with no next', () => {
    const result = getNextTierProgress(5000)
    expect(result.current.tier).toBe('netherite')
    expect(result.next).toBeNull()
    expect(result.progress).toBe(1)
    expect(result.xpToNext).toBe(0)
  })

  it('returns 1 progress for XP well above max tier', () => {
    const result = getNextTierProgress(10000)
    expect(result.current.tier).toBe('netherite')
    expect(result.next).toBeNull()
    expect(result.progress).toBe(1)
  })

  it('clamps progress to 1 when at tier boundary', () => {
    const result = getNextTierProgress(99)
    expect(result.progress).toBeLessThanOrEqual(1)
    expect(result.current.tier).toBe('wood')
  })
})
