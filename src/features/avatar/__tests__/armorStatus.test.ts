/**
 * Armor status consistency tests.
 *
 * These tests verify that getDailyArmorStatus — the single source of truth —
 * produces consistent results across all the scenarios that previously caused
 * disagreements between components.
 */
import { describe, it, expect } from 'vitest'
import { getDailyArmorStatus, getAllForgedSlots } from '../armorStatus'
import type { AvatarProfile, ArmorPiece } from '../../../core/types'

const forgedEntry = { forgedAt: new Date().toISOString() }

function makeProfile(overrides: Partial<AvatarProfile> = {}): AvatarProfile {
  return {
    childId: 'child1',
    themeStyle: 'minecraft',
    pieces: [],
    currentTier: 'wood',
    totalXp: 0,
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('getDailyArmorStatus — single source of truth', () => {
  it('no pieces forged → not suited up, no gate requirement', () => {
    const status = getDailyArmorStatus(makeProfile({ totalXp: 500 }))
    expect(status.isSuitedUp).toBe(false)
    expect(status.hasForgedPieces).toBe(false)
    expect(status.gateTotal).toBe(0)
    expect(status.equippedCount).toBe(0)
    expect(status.missing).toEqual([])
  })

  it('1 piece forged + equipped → suited up', () => {
    const profile = makeProfile({
      totalXp: 0,
      equippedPieces: ['belt'],
      forgedPieces: { wood: { belt: forgedEntry } },
    })
    const status = getDailyArmorStatus(profile)
    expect(status.isSuitedUp).toBe(true)
    expect(status.gateTotal).toBe(1)
    expect(status.equippedCount).toBe(1)
  })

  it('1 piece forged + NOT equipped → not suited up', () => {
    const profile = makeProfile({
      totalXp: 0,
      forgedPieces: { wood: { belt: forgedEntry } },
    })
    const status = getDailyArmorStatus(profile)
    expect(status.isSuitedUp).toBe(false)
    expect(status.gateTotal).toBe(1)
    expect(status.equippedCount).toBe(0)
    expect(status.missing).toEqual(['belt'])
  })

  describe('THE BUG: wood complete + stone partial', () => {
    // Lincoln's scenario: 793 XP, wood 6/6, stone 5/6 (sword missing in stone)
    const lincolnProfile = makeProfile({
      totalXp: 793,
      forgedPieces: {
        wood: {
          belt: forgedEntry,
          breastplate: forgedEntry,
          shoes: forgedEntry,
          shield: forgedEntry,
          helmet: forgedEntry,
          sword: forgedEntry,
        },
        stone: {
          belt: forgedEntry,
          breastplate: forgedEntry,
          shoes: forgedEntry,
          shield: forgedEntry,
          helmet: forgedEntry,
          // sword NOT forged in stone
        },
      },
    })

    const fiveApplied: ArmorPiece[] = [
      'belt_of_truth',
      'breastplate_of_righteousness',
      'shoes_of_peace',
      'shield_of_faith',
      'helmet_of_salvation',
    ]

    it('gate requires only stone-tier pieces (5), not cross-tier (6)', () => {
      const status = getDailyArmorStatus(lincolnProfile, fiveApplied)
      // Gate should match gallery: stone has 5 forged pieces
      expect(status.gateTotal).toBe(5)
      expect(status.activeForgeTier).toBe('stone')
    })

    it('5 stone pieces applied → suited up (sword not required)', () => {
      const status = getDailyArmorStatus(lincolnProfile, fiveApplied)
      expect(status.isSuitedUp).toBe(true)
      expect(status.equippedCount).toBe(5)
      expect(status.missing).toEqual([])
    })

    it('all components agree when 5/5 stone pieces equipped', () => {
      const status = getDailyArmorStatus(lincolnProfile, fiveApplied)
      // HeroMissionCard: uses isSuitedUp → should NOT show "Suit up"
      expect(status.isSuitedUp).toBe(true)
      // Next Action: should show "Start your day", not "Suit up"
      expect(status.hasForgedPieces && !status.isSuitedUp).toBe(false)
      // Gallery: 5 equipped / 5 total (matches gate)
      expect(status.equippedCount).toBe(status.gateTotal)
    })

    it('suitUpAll still gets cross-tier pieces for visual equip', () => {
      // getAllForgedSlots returns 6 (includes sword from wood) for 3D model
      const allSlots = getAllForgedSlots(lincolnProfile)
      expect(allSlots).toHaveLength(6)
      expect(allSlots).toContain('sword')
    })

    it('0 pieces applied in morning → not suited up', () => {
      const status = getDailyArmorStatus(lincolnProfile, [])
      expect(status.isSuitedUp).toBe(false)
      expect(status.gateTotal).toBe(5)
      expect(status.equippedCount).toBe(0)
      expect(status.missing).toHaveLength(5)
    })

    it('partial equip (3 of 5) → not suited up', () => {
      const status = getDailyArmorStatus(lincolnProfile, [
        'belt_of_truth',
        'breastplate_of_righteousness',
        'shoes_of_peace',
      ])
      expect(status.isSuitedUp).toBe(false)
      expect(status.equippedCount).toBe(3)
      expect(status.gateTotal).toBe(5)
      expect(status.missing).toEqual(['shield', 'helmet'])
    })
  })

  describe('tier just completed — next tier empty', () => {
    // Kid just finished wood 6/6 and advanced to stone, but hasn't forged anything yet
    const profile = makeProfile({
      totalXp: 1000,
      equippedPieces: ['belt', 'breastplate', 'shoes', 'shield', 'helmet', 'sword'],
      forgedPieces: {
        wood: {
          belt: forgedEntry,
          breastplate: forgedEntry,
          shoes: forgedEntry,
          shield: forgedEntry,
          helmet: forgedEntry,
          sword: forgedEntry,
        },
      },
    })

    it('falls back to completed tier — still suited up', () => {
      const status = getDailyArmorStatus(profile)
      // Active forge tier is stone (empty), but gate falls back to wood (6 pieces)
      expect(status.gateTotal).toBe(6)
      expect(status.isSuitedUp).toBe(true)
    })

    it('no pieces equipped in fallback → not suited up', () => {
      const bareProfile = makeProfile({
        ...profile,
        equippedPieces: [],
      })
      const status = getDailyArmorStatus(bareProfile)
      expect(status.isSuitedUp).toBe(false)
      expect(status.gateTotal).toBe(6)
    })
  })

  describe('single tier scenarios', () => {
    it('wood partial (3/6 forged, all equipped) → suited up', () => {
      const profile = makeProfile({
        totalXp: 300,
        equippedPieces: ['belt', 'breastplate', 'shoes'],
        forgedPieces: {
          wood: {
            belt: forgedEntry,
            breastplate: forgedEntry,
            shoes: forgedEntry,
          },
        },
      })
      const status = getDailyArmorStatus(profile)
      expect(status.isSuitedUp).toBe(true)
      expect(status.gateTotal).toBe(3)
      expect(status.equippedCount).toBe(3)
    })

    it('wood partial (3/6 forged, 2 equipped) → not suited up', () => {
      const profile = makeProfile({
        totalXp: 300,
        equippedPieces: ['belt', 'shoes'],
        forgedPieces: {
          wood: {
            belt: forgedEntry,
            breastplate: forgedEntry,
            shoes: forgedEntry,
          },
        },
      })
      const status = getDailyArmorStatus(profile)
      expect(status.isSuitedUp).toBe(false)
      expect(status.gateTotal).toBe(3)
      expect(status.equippedCount).toBe(2)
      expect(status.missing).toEqual(['breastplate'])
    })
  })

  describe('daily session vs profile.equippedPieces fallback', () => {
    it('uses daily session appliedPieces when provided', () => {
      const profile = makeProfile({
        totalXp: 0,
        equippedPieces: ['belt'], // stale from yesterday
        forgedPieces: { wood: { belt: forgedEntry } },
      })
      // Daily session says nothing applied yet
      const status = getDailyArmorStatus(profile, [])
      expect(status.isSuitedUp).toBe(false)
      expect(status.equippedCount).toBe(0)
    })

    it('falls back to profile.equippedPieces when no session', () => {
      const profile = makeProfile({
        totalXp: 0,
        equippedPieces: ['belt'],
        forgedPieces: { wood: { belt: forgedEntry } },
      })
      // No appliedPiecesToday → fallback
      const status = getDailyArmorStatus(profile)
      expect(status.isSuitedUp).toBe(true)
      expect(status.equippedCount).toBe(1)
    })
  })
})
