import { describe, it, expect } from 'vitest'

import type { AvatarProfile } from '../../core/types'
import {
  MINECRAFT_TIER_ORDER,
  ALL_ARMOR_VOXEL_PIECES,
  getPieceForgedTier,
  getPreviewTierForPiece,
  getTierForgedCount,
  isTierComplete,
  deriveUnlockedTiersFromForged,
  getActiveForgeTierFromProgress,
  getDisplayArmorTier,
  getTierLockReason,
  getTierMinXp,
} from './armorTierProgress'

function makeProfile(overrides: Partial<AvatarProfile> = {}): AvatarProfile {
  return {
    childId: 'test-child',
    themeStyle: 'minecraft',
    totalXp: 0,
    currentTier: 'wood',
    equippedPieces: [],
    pieces: [],
    unlockedPieces: [],
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  } as AvatarProfile
}

function allPiecesForged(tier: string): Record<string, Record<string, { forgedAt: string }>> {
  const pieces: Record<string, { forgedAt: string }> = {}
  for (const p of ALL_ARMOR_VOXEL_PIECES) {
    pieces[p] = { forgedAt: '2025-01-01T00:00:00Z' }
  }
  return { [tier]: pieces }
}

function multiTierForged(tiers: string[]): Record<string, Record<string, { forgedAt: string }>> {
  const result: Record<string, Record<string, { forgedAt: string }>> = {}
  for (const tier of tiers) {
    result[tier] = {}
    for (const p of ALL_ARMOR_VOXEL_PIECES) {
      result[tier][p] = { forgedAt: '2025-01-01T00:00:00Z' }
    }
  }
  return result
}

describe('MINECRAFT_TIER_ORDER', () => {
  it('has 6 tiers in correct order', () => {
    expect(MINECRAFT_TIER_ORDER).toEqual(['wood', 'stone', 'iron', 'gold', 'diamond', 'netherite'])
  })
})

describe('ALL_ARMOR_VOXEL_PIECES', () => {
  it('has 6 pieces', () => {
    expect(ALL_ARMOR_VOXEL_PIECES).toHaveLength(6)
    expect(ALL_ARMOR_VOXEL_PIECES).toContain('belt')
    expect(ALL_ARMOR_VOXEL_PIECES).toContain('sword')
  })
})

describe('getPieceForgedTier', () => {
  it('returns fallback when no forgedPieces', () => {
    expect(getPieceForgedTier(undefined, 'belt')).toBe('wood')
  })

  it('returns custom fallback when specified', () => {
    expect(getPieceForgedTier(undefined, 'belt', 'stone')).toBe('stone')
  })

  it('returns the highest tier a piece is forged at', () => {
    const forged = {
      wood: { belt: { forgedAt: '2025-01-01' } },
      stone: { belt: { forgedAt: '2025-02-01' } },
      iron: {},
    }
    expect(getPieceForgedTier(forged, 'belt')).toBe('stone')
  })

  it('returns wood for an unforged piece even when other pieces are forged', () => {
    const forged = {
      wood: { belt: { forgedAt: '2025-01-01' } },
    }
    expect(getPieceForgedTier(forged, 'sword')).toBe('wood')
  })

  it('scans from highest tier down', () => {
    const forged = {
      wood: { helmet: { forgedAt: '2025-01-01' } },
      gold: { helmet: { forgedAt: '2025-03-01' } },
    }
    expect(getPieceForgedTier(forged, 'helmet')).toBe('gold')
  })
})

describe('getPreviewTierForPiece', () => {
  it('returns wood when no forged pieces', () => {
    expect(getPreviewTierForPiece(undefined, 'belt', 'iron')).toBe('wood')
  })

  it('returns the highest forged tier at or below the selected tab', () => {
    const forged = {
      wood: { belt: { forgedAt: '2025-01-01' } },
      stone: { belt: { forgedAt: '2025-02-01' } },
      gold: { belt: { forgedAt: '2025-04-01' } },
    }
    expect(getPreviewTierForPiece(forged, 'belt', 'iron')).toBe('stone')
    expect(getPreviewTierForPiece(forged, 'belt', 'gold')).toBe('gold')
    expect(getPreviewTierForPiece(forged, 'belt', 'wood')).toBe('wood')
  })

  it('returns wood for piece not forged at any tier at or below tab', () => {
    const forged = {
      gold: { shield: { forgedAt: '2025-04-01' } },
    }
    expect(getPreviewTierForPiece(forged, 'shield', 'iron')).toBe('wood')
  })
})

describe('getTierForgedCount', () => {
  it('returns 0 for empty profile', () => {
    const profile = makeProfile()
    expect(getTierForgedCount(profile, 'wood')).toBe(0)
  })

  it('counts forged pieces in a tier', () => {
    const profile = makeProfile({
      forgedPieces: {
        wood: {
          belt: { forgedAt: '2025-01-01' },
          sword: { forgedAt: '2025-01-02' },
        },
      },
    })
    expect(getTierForgedCount(profile, 'wood')).toBe(2)
  })

  it('returns 6 for complete tier', () => {
    const profile = makeProfile({ forgedPieces: allPiecesForged('wood') })
    expect(getTierForgedCount(profile, 'wood')).toBe(6)
  })

  it('returns 0 for tier with no forged pieces', () => {
    const profile = makeProfile({ forgedPieces: allPiecesForged('wood') })
    expect(getTierForgedCount(profile, 'stone')).toBe(0)
  })
})

describe('isTierComplete', () => {
  it('returns false for empty profile', () => {
    expect(isTierComplete(makeProfile(), 'wood')).toBe(false)
  })

  it('returns true when all 6 pieces are forged', () => {
    const profile = makeProfile({ forgedPieces: allPiecesForged('wood') })
    expect(isTierComplete(profile, 'wood')).toBe(true)
  })

  it('returns false when only 5 pieces are forged', () => {
    const forged = { ...allPiecesForged('wood') }
    delete forged.wood.sword
    const profile = makeProfile({ forgedPieces: forged })
    expect(isTierComplete(profile, 'wood')).toBe(false)
  })
})

describe('deriveUnlockedTiersFromForged', () => {
  it('always includes wood', () => {
    const profile = makeProfile()
    expect(deriveUnlockedTiersFromForged(profile)).toEqual(['wood'])
  })

  it('unlocks stone when wood is complete and XP >= 100', () => {
    const profile = makeProfile({
      totalXp: 100,
      forgedPieces: allPiecesForged('wood'),
    })
    expect(deriveUnlockedTiersFromForged(profile)).toEqual(['wood', 'stone'])
  })

  it('does NOT unlock stone when wood is complete but XP < 100', () => {
    const profile = makeProfile({
      totalXp: 50,
      forgedPieces: allPiecesForged('wood'),
    })
    expect(deriveUnlockedTiersFromForged(profile)).toEqual(['wood'])
  })

  it('does NOT unlock stone when XP >= 100 but wood is incomplete', () => {
    const profile = makeProfile({ totalXp: 200 })
    expect(deriveUnlockedTiersFromForged(profile)).toEqual(['wood'])
  })

  it('unlocks multiple sequential tiers', () => {
    const profile = makeProfile({
      totalXp: 800,
      forgedPieces: multiTierForged(['wood', 'stone']),
    })
    const unlocked = deriveUnlockedTiersFromForged(profile)
    expect(unlocked).toEqual(['wood', 'stone', 'iron'])
  })

  it('preserves access when legacy forged pieces exist at higher tier', () => {
    const profile = makeProfile({
      totalXp: 0,
      forgedPieces: {
        stone: { belt: { forgedAt: '2025-01-01' } },
      },
    })
    const unlocked = deriveUnlockedTiersFromForged(profile)
    expect(unlocked).toContain('stone')
  })

  it('can unlock all tiers with sufficient XP and forge completion', () => {
    const profile = makeProfile({
      totalXp: 5000,
      forgedPieces: multiTierForged(['wood', 'stone', 'iron', 'gold', 'diamond']),
    })
    const unlocked = deriveUnlockedTiersFromForged(profile)
    expect(unlocked).toEqual(['wood', 'stone', 'iron', 'gold', 'diamond', 'netherite'])
  })
})

describe('getActiveForgeTierFromProgress', () => {
  it('returns wood for brand new profile', () => {
    expect(getActiveForgeTierFromProgress(makeProfile())).toBe('wood')
  })

  it('returns wood when wood has unforged pieces', () => {
    const profile = makeProfile({
      forgedPieces: { wood: { belt: { forgedAt: '2025-01-01' } } },
    })
    expect(getActiveForgeTierFromProgress(profile)).toBe('wood')
  })

  it('returns stone when wood is complete and stone is unlocked', () => {
    const profile = makeProfile({
      totalXp: 100,
      forgedPieces: allPiecesForged('wood'),
    })
    expect(getActiveForgeTierFromProgress(profile)).toBe('stone')
  })

  it('shows next locked tier when all unlocked tiers are complete', () => {
    const profile = makeProfile({
      totalXp: 100,
      forgedPieces: {
        ...allPiecesForged('wood'),
        ...allPiecesForged('stone'),
      },
    })
    const result = getActiveForgeTierFromProgress(profile)
    expect(result).toBe('iron')
  })

  it('returns netherite when all tiers complete', () => {
    const profile = makeProfile({
      totalXp: 5000,
      forgedPieces: multiTierForged(MINECRAFT_TIER_ORDER as unknown as string[]),
    })
    expect(getActiveForgeTierFromProgress(profile)).toBe('netherite')
  })
})

describe('getDisplayArmorTier', () => {
  it('returns active forge tier when no tier is complete', () => {
    const profile = makeProfile()
    expect(getDisplayArmorTier(profile)).toBe('wood')
  })

  it('returns highest completed tier', () => {
    const profile = makeProfile({
      totalXp: 800,
      forgedPieces: multiTierForged(['wood', 'stone']),
    })
    expect(getDisplayArmorTier(profile)).toBe('stone')
  })

  it('returns wood when wood is complete but stone is not', () => {
    const profile = makeProfile({
      totalXp: 100,
      forgedPieces: allPiecesForged('wood'),
    })
    expect(getDisplayArmorTier(profile)).toBe('wood')
  })
})

describe('getTierMinXp', () => {
  it('returns 0 for wood', () => {
    expect(getTierMinXp('wood')).toBe(0)
  })

  it('returns 100 for stone', () => {
    expect(getTierMinXp('stone')).toBe(100)
  })

  it('returns 5000 for netherite', () => {
    expect(getTierMinXp('netherite')).toBe(5000)
  })

  it('returns 0 for unknown tier', () => {
    expect(getTierMinXp('mythril')).toBe(0)
  })
})

describe('getTierLockReason', () => {
  it('returns empty string for wood (always unlocked)', () => {
    expect(getTierLockReason(makeProfile(), 'wood')).toBe('')
  })

  it('returns empty string for an unlocked tier', () => {
    const profile = makeProfile({
      totalXp: 100,
      forgedPieces: allPiecesForged('wood'),
    })
    expect(getTierLockReason(profile, 'stone')).toBe('')
  })

  it('mentions both forge and XP when both are missing', () => {
    const profile = makeProfile({ totalXp: 50 })
    const reason = getTierLockReason(profile, 'stone')
    expect(reason).toContain('Wood')
    expect(reason).toContain('0/6')
    expect(reason).toContain('100 XP')
  })

  it('mentions only forge when XP is sufficient but tier incomplete', () => {
    const profile = makeProfile({ totalXp: 200 })
    const reason = getTierLockReason(profile, 'stone')
    expect(reason).toContain('Wood')
    expect(reason).toContain('0/6')
    expect(reason).not.toContain('XP')
  })

  it('mentions only XP when prior tier is complete but XP insufficient', () => {
    const profile = makeProfile({
      totalXp: 50,
      forgedPieces: allPiecesForged('wood'),
    })
    const reason = getTierLockReason(profile, 'stone')
    expect(reason).toContain('Need 100 XP')
    expect(reason).toContain('have 50')
  })

  it('shows partial forged count', () => {
    const forged = allPiecesForged('wood')
    delete forged.wood.sword
    delete forged.wood.helmet
    const profile = makeProfile({ totalXp: 50, forgedPieces: forged })
    const reason = getTierLockReason(profile, 'stone')
    expect(reason).toContain('4/6')
  })
})
