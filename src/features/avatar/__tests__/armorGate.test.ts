import { describe, it, expect } from 'vitest'
import { isArmorComplete, getArmorGateStatus, getForgedVoxelPieces } from '../armorGate'
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

  it('ignores phantom pieces in non-active tiers (cross-tier bug)', () => {
    // Lincoln scenario: 5 pieces forged in wood (active tier), phantom sword in stone
    const profile = makeProfile({
      totalXp: 500,
      equippedPieces: ['belt', 'shoes', 'breastplate', 'shield', 'helmet'],
      unlockedTiers: ['wood'],
      forgedPieces: {
        wood: {
          belt: forgedEntry,
          shoes: forgedEntry,
          breastplate: forgedEntry,
          shield: forgedEntry,
          helmet: forgedEntry,
        },
        stone: { sword: forgedEntry }, // phantom — should NOT inflate total
      },
    })
    const status = getArmorGateStatus(profile)
    // Gate should report 5 total (active tier only), not 6
    expect(status.total).toBe(5)
    expect(status.equipped).toBe(5)
    expect(status.complete).toBe(true)
    expect(status.missing).toEqual([])
  })

  it('counts cross-tier pieces when wood complete and stone partially forged', () => {
    // Lincoln's actual bug: wood 6/6 complete, stone 5/6 forged.
    // Active tier = stone (lowest incomplete). Gate iterates wood+stone.
    // All 6 voxel IDs are covered by wood, so total = 6.
    // With 5 pieces applied, should report 5/6 NOT complete.
    const profile = makeProfile({
      totalXp: 1000,
      forgedPieces: {
        wood: {
          belt: forgedEntry,
          shoes: forgedEntry,
          breastplate: forgedEntry,
          shield: forgedEntry,
          helmet: forgedEntry,
          sword: forgedEntry,
        },
        stone: {
          belt: forgedEntry,
          shoes: forgedEntry,
          breastplate: forgedEntry,
          shield: forgedEntry,
          helmet: forgedEntry,
          // sword NOT forged in stone
        },
      },
    })
    // Active forge tier should be stone (wood is complete, stone is not)
    const forged = getForgedVoxelPieces(profile)
    expect(forged).toHaveLength(6) // All 6 IDs covered from wood+stone union
    expect(forged).toContain('sword') // sword comes from wood tier

    // With only 5 applied pieces, gate should show 5/6
    const status = getArmorGateStatus(profile, [
      'belt_of_truth',
      'breastplate_of_righteousness',
      'shoes_of_peace',
      'shield_of_faith',
      'helmet_of_salvation',
    ])
    expect(status.total).toBe(6)
    expect(status.equipped).toBe(5)
    expect(status.complete).toBe(false)
    expect(status.missing).toEqual(['sword'])
  })

  it('getForgedVoxelPieces returns all equippable IDs for suitUpAll', () => {
    // Verify that getForgedVoxelPieces (used by suitUpAll after fix)
    // includes pieces from completed lower tiers, not just the active tier.
    const profile = makeProfile({
      totalXp: 1000,
      forgedPieces: {
        wood: {
          belt: forgedEntry,
          shoes: forgedEntry,
          breastplate: forgedEntry,
          shield: forgedEntry,
          helmet: forgedEntry,
          sword: forgedEntry,
        },
        stone: {
          belt: forgedEntry,
          shoes: forgedEntry,
          breastplate: forgedEntry,
          shield: forgedEntry,
          helmet: forgedEntry,
          // sword missing in stone
        },
      },
    })
    const forged = getForgedVoxelPieces(profile)
    // suitUpAll should be able to equip ALL 6 — including sword from wood
    expect(forged).toHaveLength(6)
    expect(new Set(forged)).toEqual(new Set(['belt', 'shoes', 'breastplate', 'shield', 'helmet', 'sword']))
  })
})
