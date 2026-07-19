import { describe, expect, it } from 'vitest'

import { getCurrentTierLabel, getNextTier } from './xpTier'

describe('getCurrentTierLabel', () => {
  it('returns Wood below the Stone threshold', () => {
    expect(getCurrentTierLabel(0)).toBe('Wood')
    expect(getCurrentTierLabel(99)).toBe('Wood')
  })

  it('returns the tier reached at each boundary', () => {
    expect(getCurrentTierLabel(100)).toBe('Stone')
    expect(getCurrentTierLabel(750)).toBe('Iron')
    expect(getCurrentTierLabel(1500)).toBe('Gold')
    expect(getCurrentTierLabel(2500)).toBe('Diamond')
  })

  it('returns Netherite at and above the max threshold', () => {
    expect(getCurrentTierLabel(5000)).toBe('Netherite')
    expect(getCurrentTierLabel(99999)).toBe('Netherite')
  })
})

describe('getNextTier', () => {
  it('points at the next tier below max', () => {
    expect(getNextTier(0)?.label).toBe('Stone')
    expect(getNextTier(100)?.label).toBe('Iron')
  })

  it('returns null once Netherite is reached', () => {
    expect(getNextTier(5000)).toBeNull()
  })
})
