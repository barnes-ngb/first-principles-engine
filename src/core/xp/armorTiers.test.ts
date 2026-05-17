import { describe, it, expect } from 'vitest'

import { ArmorTier, ARMOR_TIERS, getArmorTier, getNextTierProgress } from './armorTiers'

describe('ARMOR_TIERS', () => {
  it('has 6 tiers in ascending minXp order', () => {
    expect(ARMOR_TIERS).toHaveLength(6)
    for (let i = 1; i < ARMOR_TIERS.length; i++) {
      expect(ARMOR_TIERS[i].minXp).toBeGreaterThan(ARMOR_TIERS[i - 1].minXp)
    }
  })

  it('Wood tier starts at 0 XP', () => {
    expect(ARMOR_TIERS[0].tier).toBe(ArmorTier.Wood)
    expect(ARMOR_TIERS[0].minXp).toBe(0)
  })

  it('Netherite is the highest tier at 5000 XP', () => {
    const last = ARMOR_TIERS[ARMOR_TIERS.length - 1]
    expect(last.tier).toBe(ArmorTier.Netherite)
    expect(last.minXp).toBe(5000)
  })
})

describe('getArmorTier', () => {
  it('returns Wood for 0 XP', () => {
    expect(getArmorTier(0).tier).toBe('wood')
  })

  it('returns Wood for XP just below Stone threshold', () => {
    expect(getArmorTier(99).tier).toBe('wood')
  })

  it('returns Stone at exactly 100 XP', () => {
    expect(getArmorTier(100).tier).toBe('stone')
  })

  it('returns Iron at exactly 750 XP', () => {
    expect(getArmorTier(750).tier).toBe('iron')
  })

  it('returns Gold at exactly 1500 XP', () => {
    expect(getArmorTier(1500).tier).toBe('gold')
  })

  it('returns Diamond at exactly 2500 XP', () => {
    expect(getArmorTier(2500).tier).toBe('diamond')
  })

  it('returns Netherite at exactly 5000 XP', () => {
    expect(getArmorTier(5000).tier).toBe('netherite')
  })

  it('returns Netherite for XP far above max', () => {
    expect(getArmorTier(99999).tier).toBe('netherite')
  })

  it('returns correct tier for mid-range values', () => {
    expect(getArmorTier(400).tier).toBe('stone')
    expect(getArmorTier(1200).tier).toBe('iron')
    expect(getArmorTier(2000).tier).toBe('gold')
    expect(getArmorTier(3500).tier).toBe('diamond')
  })
})

describe('getNextTierProgress', () => {
  it('at 0 XP: current is Wood, next is Stone, progress 0', () => {
    const result = getNextTierProgress(0)
    expect(result.current.tier).toBe('wood')
    expect(result.next?.tier).toBe('stone')
    expect(result.progress).toBe(0)
    expect(result.xpToNext).toBe(100)
  })

  it('at 50 XP: halfway from Wood to Stone', () => {
    const result = getNextTierProgress(50)
    expect(result.current.tier).toBe('wood')
    expect(result.next?.tier).toBe('stone')
    expect(result.progress).toBe(0.5)
    expect(result.xpToNext).toBe(50)
  })

  it('at exactly 100 XP: current is Stone, next is Iron', () => {
    const result = getNextTierProgress(100)
    expect(result.current.tier).toBe('stone')
    expect(result.next?.tier).toBe('iron')
    expect(result.progress).toBe(0)
    expect(result.xpToNext).toBe(650)
  })

  it('at max tier: progress 1, next is null, xpToNext is 0', () => {
    const result = getNextTierProgress(5000)
    expect(result.current.tier).toBe('netherite')
    expect(result.next).toBeNull()
    expect(result.progress).toBe(1)
    expect(result.xpToNext).toBe(0)
  })

  it('at XP well beyond max tier: still returns progress 1', () => {
    const result = getNextTierProgress(10000)
    expect(result.current.tier).toBe('netherite')
    expect(result.progress).toBe(1)
  })

  it('progress never exceeds 1', () => {
    const result = getNextTierProgress(99)
    expect(result.progress).toBeLessThanOrEqual(1)
  })

  it('mid-tier XP gives correct fractional progress', () => {
    // Stone (100) → Iron (750), range = 650
    // At 425 XP: earned 325 of 650 → progress = 0.5
    const result = getNextTierProgress(425)
    expect(result.current.tier).toBe('stone')
    expect(result.next?.tier).toBe('iron')
    expect(result.progress).toBeCloseTo(0.5)
    expect(result.xpToNext).toBe(325)
  })
})
