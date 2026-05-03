import { describe, expect, it } from 'vitest'

import { ARMOR_TIERS, ArmorTier, getArmorTier, getNextTierProgress } from './armorTiers'

// ── ARMOR_TIERS structure ─────────────────────────────────────

describe('ARMOR_TIERS', () => {
  it('has 6 tiers in ascending order', () => {
    expect(ARMOR_TIERS).toHaveLength(6)
    expect(ARMOR_TIERS[0].tier).toBe(ArmorTier.Wood)
    expect(ARMOR_TIERS[5].tier).toBe(ArmorTier.Netherite)
  })

  it('has strictly increasing minXp thresholds', () => {
    for (let i = 1; i < ARMOR_TIERS.length; i++) {
      expect(ARMOR_TIERS[i].minXp).toBeGreaterThan(ARMOR_TIERS[i - 1].minXp)
    }
  })

  it('starts at 0 XP for Wood tier', () => {
    expect(ARMOR_TIERS[0].minXp).toBe(0)
  })

  it('has expected minXp thresholds', () => {
    const thresholds = ARMOR_TIERS.map((t) => t.minXp)
    expect(thresholds).toEqual([0, 100, 750, 1500, 2500, 5000])
  })

  it('has increasing piece counts (0-4)', () => {
    expect(ARMOR_TIERS[0].pieces).toBe(0)
    expect(ARMOR_TIERS[ARMOR_TIERS.length - 1].pieces).toBe(4)
    for (const tier of ARMOR_TIERS) {
      expect(tier.pieces).toBeGreaterThanOrEqual(0)
      expect(tier.pieces).toBeLessThanOrEqual(4)
    }
  })
})

// ── getArmorTier ──────────────────────────────────────────────

describe('getArmorTier', () => {
  it('returns Wood for 0 XP', () => {
    expect(getArmorTier(0).tier).toBe(ArmorTier.Wood)
  })

  it('returns Wood for XP just below Stone threshold', () => {
    expect(getArmorTier(99).tier).toBe(ArmorTier.Wood)
  })

  it('returns Stone at exactly 100 XP', () => {
    expect(getArmorTier(100).tier).toBe(ArmorTier.Stone)
  })

  it('returns Iron at exactly 750 XP', () => {
    expect(getArmorTier(750).tier).toBe(ArmorTier.Iron)
  })

  it('returns Gold at exactly 1500 XP', () => {
    expect(getArmorTier(1500).tier).toBe(ArmorTier.Gold)
  })

  it('returns Diamond at exactly 2500 XP', () => {
    expect(getArmorTier(2500).tier).toBe(ArmorTier.Diamond)
  })

  it('returns Netherite at exactly 5000 XP', () => {
    expect(getArmorTier(5000).tier).toBe(ArmorTier.Netherite)
  })

  it('returns Netherite for very high XP', () => {
    expect(getArmorTier(999999).tier).toBe(ArmorTier.Netherite)
  })

  it('returns correct tier for boundary-1 values', () => {
    expect(getArmorTier(749).tier).toBe(ArmorTier.Stone)
    expect(getArmorTier(1499).tier).toBe(ArmorTier.Iron)
    expect(getArmorTier(2499).tier).toBe(ArmorTier.Gold)
    expect(getArmorTier(4999).tier).toBe(ArmorTier.Diamond)
  })

  it('returns full tier info object', () => {
    const tier = getArmorTier(100)
    expect(tier.tier).toBe(ArmorTier.Stone)
    expect(tier.label).toContain('Stone')
    expect(tier.title).toBe('Survivor')
    expect(tier.color).toBeDefined()
    expect(tier.accent).toBeDefined()
    expect(tier.pieces).toBe(1)
  })
})

// ── getNextTierProgress ───────────────────────────────────────

describe('getNextTierProgress', () => {
  it('returns 0 progress at the start of a tier', () => {
    const result = getNextTierProgress(0)
    expect(result.current.tier).toBe(ArmorTier.Wood)
    expect(result.next?.tier).toBe(ArmorTier.Stone)
    expect(result.progress).toBe(0)
    expect(result.xpToNext).toBe(100)
  })

  it('returns partial progress within a tier', () => {
    const result = getNextTierProgress(50)
    expect(result.current.tier).toBe(ArmorTier.Wood)
    expect(result.next?.tier).toBe(ArmorTier.Stone)
    expect(result.progress).toBe(0.5)
    expect(result.xpToNext).toBe(50)
  })

  it('returns progress at exactly the boundary (starts new tier)', () => {
    const result = getNextTierProgress(100)
    expect(result.current.tier).toBe(ArmorTier.Stone)
    expect(result.next?.tier).toBe(ArmorTier.Iron)
    expect(result.progress).toBe(0)
    expect(result.xpToNext).toBe(650)
  })

  it('returns 1 progress and null next at max tier', () => {
    const result = getNextTierProgress(5000)
    expect(result.current.tier).toBe(ArmorTier.Netherite)
    expect(result.next).toBeNull()
    expect(result.progress).toBe(1)
    expect(result.xpToNext).toBe(0)
  })

  it('returns 1 progress and null next for XP well above max', () => {
    const result = getNextTierProgress(100000)
    expect(result.current.tier).toBe(ArmorTier.Netherite)
    expect(result.next).toBeNull()
    expect(result.progress).toBe(1)
    expect(result.xpToNext).toBe(0)
  })

  it('calculates correct progress for mid-tier values', () => {
    // Stone tier: 100-750, range = 650
    const result = getNextTierProgress(425)
    expect(result.current.tier).toBe(ArmorTier.Stone)
    expect(result.next?.tier).toBe(ArmorTier.Iron)
    expect(result.progress).toBe(325 / 650)
    expect(result.xpToNext).toBe(325)
  })

  it('clamps progress to 1 (should not exceed boundary)', () => {
    // At exactly the boundary, progress should be 0 for the new tier
    // Just below boundary: 749/750 of Stone tier (100-750)
    const result = getNextTierProgress(749)
    expect(result.current.tier).toBe(ArmorTier.Stone)
    expect(result.progress).toBeLessThanOrEqual(1)
    expect(result.xpToNext).toBe(1)
  })
})
