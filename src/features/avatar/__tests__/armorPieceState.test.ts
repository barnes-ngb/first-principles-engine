import { describe, expect, it } from 'vitest'

import type { AvatarProfile } from '../../../core/types'
import { getActiveForgeTier, getArmorPieceState, getEquippablePieces, getVisiblePieces } from '../armorPieceState'

function makeProfile(overrides: Partial<AvatarProfile> = {}): AvatarProfile {
  return {
    childId: 'child-1',
    themeStyle: 'minecraft',
    pieces: [],
    currentTier: 'wood',
    totalXp: 0,
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

const forgedEntry = { forgedAt: new Date().toISOString() }

const allForged = {
  belt: forgedEntry,
  shoes: forgedEntry,
  breastplate: forgedEntry,
  shield: forgedEntry,
  helmet: forgedEntry,
  sword: forgedEntry,
}

describe('getArmorPieceState', () => {
  it('returns locked_by_xp when below threshold', () => {
    const profile = makeProfile({ totalXp: 10 })
    expect(getArmorPieceState({ profile, pieceId: 'shield', appliedTodayVoxel: [] })).toBe('locked_by_xp')
  })

  it('returns forgeable when xp reached but piece is not forged', () => {
    const profile = makeProfile({ totalXp: 500, unlockedTiers: ['wood'] })
    expect(getArmorPieceState({ profile, pieceId: 'shield', appliedTodayVoxel: [] })).toBe('forgeable')
  })

  it('returns forged_not_equipped_today when forged but not applied in today session', () => {
    const profile = makeProfile({
      totalXp: 500,
      unlockedTiers: ['wood'],
      forgedPieces: { wood: { shield: forgedEntry } },
    })
    expect(getArmorPieceState({ profile, pieceId: 'shield', appliedTodayVoxel: [] })).toBe('forged_not_equipped_today')
  })

  it('returns equipped_today when forged and applied in today session', () => {
    const profile = makeProfile({
      totalXp: 500,
      unlockedTiers: ['wood'],
      forgedPieces: { wood: { shield: forgedEntry } },
    })
    expect(getArmorPieceState({ profile, pieceId: 'shield', appliedTodayVoxel: ['shield'] })).toBe('equipped_today')
  })

  it('supports legacy unlockedPieces when forgedPieces are absent', () => {
    const profile = makeProfile({
      totalXp: 500,
      unlockedTiers: ['wood'],
      unlockedPieces: ['shield'],
    })

    expect(getActiveForgeTier(profile)).toBe('wood')
    expect(getEquippablePieces(profile)).toContain('shield')
    expect(getArmorPieceState({ profile, pieceId: 'shield', appliedTodayVoxel: [] })).toBe('forged_not_equipped_today')
  })

  it('returns locked_by_tier when tier is not accessible', () => {
    // Wood complete but XP not enough for stone (needs 200)
    const profile = makeProfile({
      totalXp: 150,
      forgedPieces: { wood: allForged },
    })
    // Active forge tier should be stone (preview)
    const activeTier = getActiveForgeTier(profile)
    expect(activeTier).toBe('stone')

    // All stone pieces should be locked_by_tier
    expect(getArmorPieceState({
      profile,
      pieceId: 'belt',
      activeForgeTier: 'stone',
      appliedTodayVoxel: [],
    })).toBe('locked_by_tier')
  })

  it('returns forgeable when tier IS accessible', () => {
    const profile = makeProfile({
      totalXp: 200,
      forgedPieces: { wood: allForged },
    })
    // Stone should be unlocked now
    expect(getArmorPieceState({
      profile,
      pieceId: 'belt',
      activeForgeTier: 'stone',
      appliedTodayVoxel: [],
    })).toBe('forgeable')
  })

  it('returns locked_by_xp for sword in WOOD tier when XP < 1000', () => {
    // Per-piece XP thresholds apply within Wood tier
    const profile = makeProfile({ totalXp: 750 })
    expect(getArmorPieceState({
      profile,
      pieceId: 'sword',
      activeForgeTier: 'wood',
      appliedTodayVoxel: [],
    })).toBe('locked_by_xp')
  })

  it('returns forgeable for sword in STONE tier even when XP < 1000', () => {
    // Per-piece XP thresholds do NOT apply to non-Wood tiers.
    // Lincoln scenario: 793 XP, Stone tier, 5/6 forged — sword should be forgeable.
    const profile = makeProfile({
      totalXp: 793,
      forgedPieces: {
        wood: allForged,
        stone: {
          belt: forgedEntry,
          shoes: forgedEntry,
          breastplate: forgedEntry,
          shield: forgedEntry,
          helmet: forgedEntry,
        },
      },
    })
    expect(getArmorPieceState({
      profile,
      pieceId: 'sword',
      activeForgeTier: 'stone',
      appliedTodayVoxel: [],
    })).toBe('forgeable')
  })

  it('iron pieces are locked_by_tier when stone is incomplete (5/6)', () => {
    // Tier gate: iron requires stone complete (6/6) + 500 XP.
    // Lincoln has 793 XP (>500) but only 5/6 stone. Iron must be locked.
    const profile = makeProfile({
      totalXp: 793,
      forgedPieces: {
        wood: allForged,
        stone: {
          belt: forgedEntry,
          shoes: forgedEntry,
          breastplate: forgedEntry,
          shield: forgedEntry,
          helmet: forgedEntry,
          // sword NOT forged — stone is 5/6
        },
      },
    })
    expect(getArmorPieceState({
      profile,
      pieceId: 'belt',
      activeForgeTier: 'iron',
      appliedTodayVoxel: [],
    })).toBe('locked_by_tier')
  })

  it('iron pieces become forgeable once stone is complete AND xp >= 500', () => {
    const profile = makeProfile({
      totalXp: 500,
      forgedPieces: {
        wood: allForged,
        stone: allForged,
      },
    })
    expect(getArmorPieceState({
      profile,
      pieceId: 'belt',
      activeForgeTier: 'iron',
      appliedTodayVoxel: [],
    })).toBe('forgeable')
  })
})

describe('getVisiblePieces', () => {
  it('filters by XP thresholds in Wood tier', () => {
    const profile = makeProfile({ totalXp: 400 })
    const visible = getVisiblePieces(profile)
    // belt(0), breastplate(150), shoes(300) = 3 pieces visible at 400 XP
    expect(visible).toHaveLength(3)
    expect(visible).toContain('belt')
    expect(visible).toContain('breastplate')
    expect(visible).toContain('shoes')
    expect(visible).not.toContain('shield')    // needs 500
    expect(visible).not.toContain('sword')     // needs 1000
  })

  it('returns all 6 pieces when past Wood tier', () => {
    // Lincoln scenario: stone tier, 793 XP (< sword threshold of 1000)
    // All 6 should still be visible because XP thresholds don't apply past Wood
    const profile = makeProfile({
      totalXp: 793,
      forgedPieces: {
        wood: allForged,
        stone: {
          belt: forgedEntry,
          shoes: forgedEntry,
          breastplate: forgedEntry,
          shield: forgedEntry,
          helmet: forgedEntry,
        },
      },
    })
    const visible = getVisiblePieces(profile)
    expect(visible).toHaveLength(6)
    expect(visible).toContain('sword')
  })
})
