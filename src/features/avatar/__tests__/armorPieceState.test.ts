import { describe, expect, it } from 'vitest'

import type { AvatarProfile } from '../../../core/types'
import { getActiveForgeTier, getArmorPieceState, getEquippablePieces } from '../armorPieceState'

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
})
