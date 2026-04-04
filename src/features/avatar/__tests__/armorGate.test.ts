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

const forgedEntry = { forgedAt: new Date().toISOString() }

describe('isArmorComplete', () => {
  it('returns true when all forged pieces are equipped', () => {
    const profile = makeProfile({
      totalXp: 0,
      equippedPieces: ['belt'],
      unlockedTiers: ['wood'],
      forgedPieces: { wood: { belt: forgedEntry } },
    })
    expect(isArmorComplete(profile)).toBe(true)
  })

  it('returns false when forged pieces are not equipped', () => {
    const profile = makeProfile({
      totalXp: 0,
      equippedPieces: [],
      unlockedTiers: ['wood'],
      forgedPieces: { wood: { belt: forgedEntry } },
    })
    expect(isArmorComplete(profile)).toBe(false)
  })

  it('returns false when no pieces are forged (even with high XP)', () => {
    const profile = makeProfile({ totalXp: 1000, equippedPieces: [] })
    expect(isArmorComplete(profile)).toBe(false)
  })

  it('returns false when some forged pieces are missing', () => {
    const profile = makeProfile({
      totalXp: 300,
      equippedPieces: ['belt', 'breastplate'],
      unlockedTiers: ['wood'],
      forgedPieces: { wood: { belt: forgedEntry, breastplate: forgedEntry, shoes: forgedEntry } },
    })
    expect(isArmorComplete(profile)).toBe(false)
  })

  it('returns true when all 3 forged pieces are equipped', () => {
    const profile = makeProfile({
      totalXp: 300,
      equippedPieces: ['belt', 'breastplate', 'shoes'],
      unlockedTiers: ['wood'],
      forgedPieces: { wood: { belt: forgedEntry, breastplate: forgedEntry, shoes: forgedEntry } },
    })
    expect(isArmorComplete(profile)).toBe(true)
  })

  it('returns true when all 6 forged pieces are equipped', () => {
    const profile = makeProfile({
      totalXp: 1000,
      equippedPieces: ['belt', 'breastplate', 'shoes', 'shield', 'helmet', 'sword'],
      unlockedTiers: ['wood'],
      forgedPieces: { wood: { belt: forgedEntry, breastplate: forgedEntry, shoes: forgedEntry, shield: forgedEntry, helmet: forgedEntry, sword: forgedEntry } },
    })
    expect(isArmorComplete(profile)).toBe(true)
  })
})

describe('getArmorGateStatus', () => {
  it('returns zero total when no pieces forged', () => {
    const profile = makeProfile({ totalXp: 0, equippedPieces: [] })
    const status = getArmorGateStatus(profile)
    expect(status.complete).toBe(false)
    expect(status.equipped).toBe(0)
    expect(status.total).toBe(0)
    expect(status.missing).toEqual([])
  })

  it('returns complete when only forged piece is equipped', () => {
    const profile = makeProfile({
      totalXp: 0,
      equippedPieces: ['belt'],
      unlockedTiers: ['wood'],
      forgedPieces: { wood: { belt: forgedEntry } },
    })
    const status = getArmorGateStatus(profile)
    expect(status.complete).toBe(true)
    expect(status.equipped).toBe(1)
    expect(status.total).toBe(1)
    expect(status.missing).toEqual([])
  })

  it('shows missing forged pieces correctly', () => {
    const profile = makeProfile({
      totalXp: 500,
      equippedPieces: ['belt', 'shoes'],
      unlockedTiers: ['wood'],
      forgedPieces: { wood: { belt: forgedEntry, breastplate: forgedEntry, shoes: forgedEntry, shield: forgedEntry } },
    })
    const status = getArmorGateStatus(profile)
    expect(status.complete).toBe(false)
    expect(status.equipped).toBe(2)
    expect(status.total).toBe(4)
    expect(status.missing).toEqual(['breastplate', 'shield'])
  })

  it('handles undefined equippedPieces with forged pieces', () => {
    const profile = makeProfile({
      totalXp: 150,
      unlockedTiers: ['wood'],
      forgedPieces: { wood: { belt: forgedEntry, breastplate: forgedEntry } },
    })
    const status = getArmorGateStatus(profile)
    expect(status.complete).toBe(false)
    expect(status.equipped).toBe(0)
    expect(status.total).toBe(2)
    expect(status.missing).toEqual(['belt', 'breastplate'])
  })
})
