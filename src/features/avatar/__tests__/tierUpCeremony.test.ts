import { describe, expect, it } from 'vitest'
import { calculateTier, TIERS, TIER_MATERIALS, getTierTint } from '../voxel/tierMaterials'

// ── Tier boundary detection (drives ceremony trigger) ───────────────

describe('Tier boundary detection for ceremony', () => {
  it('detects Iron→Gold transition at 999→1000 XP', () => {
    expect(calculateTier(999)).toBe('IRON')
    expect(calculateTier(1000)).toBe('GOLD')
    // Different tiers = ceremony should fire
    expect(calculateTier(999)).not.toBe(calculateTier(1000))
  })

  it('detects Wood→Stone transition at 199→200 XP', () => {
    expect(calculateTier(199)).toBe('WOOD')
    expect(calculateTier(200)).toBe('STONE')
    expect(calculateTier(199)).not.toBe(calculateTier(200))
  })

  it('detects Stone→Iron transition at 499→500 XP', () => {
    expect(calculateTier(499)).toBe('STONE')
    expect(calculateTier(500)).toBe('IRON')
  })

  it('detects Gold→Diamond transition at 1999→2000 XP', () => {
    expect(calculateTier(1999)).toBe('GOLD')
    expect(calculateTier(2000)).toBe('DIAMOND')
  })

  it('detects Diamond→Netherite transition at 4999→5000 XP', () => {
    expect(calculateTier(4999)).toBe('DIAMOND')
    expect(calculateTier(5000)).toBe('NETHERITE')
  })

  it('handles large XP jumps that skip tiers', () => {
    // Wood → Gold (skip Stone and Iron)
    const oldTier = calculateTier(100)
    const newTier = calculateTier(1500)
    expect(oldTier).toBe('WOOD')
    expect(newTier).toBe('GOLD')
    expect(oldTier).not.toBe(newTier)
  })

  it('does not trigger ceremony within same tier', () => {
    expect(calculateTier(500)).toBe(calculateTier(999))
    expect(calculateTier(1000)).toBe(calculateTier(1999))
  })
})

// ── Tier material palette consistency ───────────────────────────────

describe('Tier materials for ceremony phases', () => {
  it('every tier in TIERS has a matching TIER_MATERIALS entry', () => {
    for (const tierName of Object.keys(TIERS)) {
      const tint = getTierTint(tierName)
      expect(TIER_MATERIALS[tint]).toBeDefined()
    }
  })

  it('all tier materials have required color properties', () => {
    for (const [, mat] of Object.entries(TIER_MATERIALS)) {
      expect(typeof mat.primary).toBe('number')
      expect(typeof mat.accent).toBe('number')
      expect(typeof mat.detail).toBe('number')
      expect(typeof mat.emissive).toBe('number')
      expect(typeof mat.emissiveIntensity).toBe('number')
    }
  })

  it('accent color is available for banner flash (non-zero for non-wood tiers)', () => {
    // Gold, Diamond, Netherite should have distinct accent colors for dramatic flash
    expect(TIER_MATERIALS.gold.accent).not.toBe(0)
    expect(TIER_MATERIALS.diamond.accent).not.toBe(0)
    expect(TIER_MATERIALS.netherite.accent).not.toBe(0)
  })

  it('tier labels exist for TTS announcement', () => {
    for (const [, def] of Object.entries(TIERS)) {
      expect(def.label).toBeTruthy()
      expect(typeof def.label).toBe('string')
    }
  })
})

// ── Tier progression order ──────────────────────────────────────────

describe('Tier progression order', () => {
  const tierOrder = ['WOOD', 'STONE', 'IRON', 'GOLD', 'DIAMOND', 'NETHERITE']

  it('tiers have strictly increasing minXp values', () => {
    for (let i = 1; i < tierOrder.length; i++) {
      expect(TIERS[tierOrder[i]].minXp).toBeGreaterThan(TIERS[tierOrder[i - 1]].minXp)
    }
  })

  it('all 6 tiers are defined', () => {
    expect(Object.keys(TIERS)).toHaveLength(6)
    for (const name of tierOrder) {
      expect(TIERS[name]).toBeDefined()
    }
  })
})
