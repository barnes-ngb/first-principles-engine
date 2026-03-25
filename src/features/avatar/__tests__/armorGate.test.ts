import { describe, it, expect } from 'vitest'
import { isArmorComplete, getArmorGateStatus } from '../armorGate'
import type { AvatarProfile } from '../../../core/types'

function makeProfile(overrides: Partial<AvatarProfile> = {}): AvatarProfile {
  return {
    childId: 'child1',
    themeStyle: 'minecraft',
    pieces: [],
    currentTier: 'stone',
    totalXp: 0,
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('isArmorComplete', () => {
  it('returns true when all unlocked pieces are equipped', () => {
    // At 0 XP, only belt is unlocked (XP threshold: 0)
    const profile = makeProfile({ totalXp: 0, equippedPieces: ['belt'] })
    expect(isArmorComplete(profile)).toBe(true)
  })

  it('returns false when unlocked pieces are not equipped', () => {
    const profile = makeProfile({ totalXp: 0, equippedPieces: [] })
    expect(isArmorComplete(profile)).toBe(false)
  })

  it('returns false when some unlocked pieces are missing', () => {
    // At 300 XP: belt (0), breastplate (150), shoes (300) are unlocked
    const profile = makeProfile({ totalXp: 300, equippedPieces: ['belt', 'breastplate'] })
    expect(isArmorComplete(profile)).toBe(false)
  })

  it('returns true when all 3 unlocked pieces are equipped', () => {
    const profile = makeProfile({ totalXp: 300, equippedPieces: ['belt', 'breastplate', 'shoes'] })
    expect(isArmorComplete(profile)).toBe(true)
  })

  it('returns true when all 6 pieces are equipped', () => {
    const profile = makeProfile({
      totalXp: 1000,
      equippedPieces: ['belt', 'breastplate', 'shoes', 'shield', 'helmet', 'sword'],
    })
    expect(isArmorComplete(profile)).toBe(true)
  })
})

describe('getArmorGateStatus', () => {
  it('returns correct status when no pieces equipped', () => {
    const profile = makeProfile({ totalXp: 0, equippedPieces: [] })
    const status = getArmorGateStatus(profile)
    expect(status.complete).toBe(false)
    expect(status.equipped).toBe(0)
    expect(status.total).toBe(1) // only belt at 0 XP
    expect(status.missing).toEqual(['belt'])
  })

  it('returns complete when belt is equipped at 0 XP', () => {
    const profile = makeProfile({ totalXp: 0, equippedPieces: ['belt'] })
    const status = getArmorGateStatus(profile)
    expect(status.complete).toBe(true)
    expect(status.equipped).toBe(1)
    expect(status.total).toBe(1)
    expect(status.missing).toEqual([])
  })

  it('shows missing pieces correctly', () => {
    const profile = makeProfile({ totalXp: 500, equippedPieces: ['belt', 'shoes'] })
    const status = getArmorGateStatus(profile)
    expect(status.complete).toBe(false)
    expect(status.equipped).toBe(2)
    expect(status.total).toBe(4) // belt, breastplate, shoes, shield
    expect(status.missing).toEqual(['breastplate', 'shield'])
  })

  it('handles undefined equippedPieces', () => {
    const profile = makeProfile({ totalXp: 150 })
    const status = getArmorGateStatus(profile)
    expect(status.complete).toBe(false)
    expect(status.equipped).toBe(0)
    expect(status.total).toBe(2) // belt + breastplate
    expect(status.missing).toEqual(['belt', 'breastplate'])
  })
})
