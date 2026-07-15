import { describe, it, expect } from 'vitest'
import { getBiomeName, getNextTierKey, TIER_BIOMES, TIER_ORDER } from './tierBiomes'

describe('TIER_BIOMES', () => {
  it('has an entry for every tier in TIER_ORDER', () => {
    for (const tier of TIER_ORDER) {
      expect(TIER_BIOMES[tier]).toBeDefined()
      expect(TIER_BIOMES[tier].name).toBeTruthy()
      expect(TIER_BIOMES[tier].description).toBeTruthy()
      expect(TIER_BIOMES[tier].bgTint).toBeTruthy()
    }
  })

  it('has exactly 6 tiers', () => {
    expect(Object.keys(TIER_BIOMES)).toHaveLength(6)
    expect(TIER_ORDER).toHaveLength(6)
  })
})

describe('getBiomeName', () => {
  it('returns the biome name for a known tier', () => {
    expect(getBiomeName('wood')).toBe('Stonebridge Village')
    expect(getBiomeName('stone')).toBe('The Caves')
    expect(getBiomeName('iron')).toBe('The Mountains')
    expect(getBiomeName('gold')).toBe('The Desert Temple')
    expect(getBiomeName('diamond')).toBe('The End')
    expect(getBiomeName('netherite')).toBe('The Nether')
  })

  it('falls back to the tier string for an unknown tier', () => {
    expect(getBiomeName('mythril')).toBe('mythril')
    expect(getBiomeName('')).toBe('')
  })
})

describe('getNextTierKey', () => {
  it('returns the next tier in progression', () => {
    expect(getNextTierKey('wood')).toBe('stone')
    expect(getNextTierKey('stone')).toBe('iron')
    expect(getNextTierKey('iron')).toBe('gold')
    expect(getNextTierKey('gold')).toBe('diamond')
    expect(getNextTierKey('diamond')).toBe('netherite')
  })

  it('returns null at max tier', () => {
    expect(getNextTierKey('netherite')).toBeNull()
  })

  it('returns null for unknown tier', () => {
    expect(getNextTierKey('mythril')).toBeNull()
    expect(getNextTierKey('')).toBeNull()
  })
})

describe('TIER_ORDER', () => {
  it('starts with wood and ends with netherite', () => {
    expect(TIER_ORDER[0]).toBe('wood')
    expect(TIER_ORDER[TIER_ORDER.length - 1]).toBe('netherite')
  })

  it('follows Minecraft progression order', () => {
    expect([...TIER_ORDER]).toEqual(['wood', 'stone', 'iron', 'gold', 'diamond', 'netherite'])
  })
})
