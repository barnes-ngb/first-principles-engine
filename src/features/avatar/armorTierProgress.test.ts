import { describe, expect, it, vi } from 'vitest'

vi.mock('../../features/avatar/voxel/tierMaterials', () => ({
  TIERS: {
    WOOD:      { minXp: 0,    label: 'Wood' },
    STONE:     { minXp: 100,  label: 'Stone' },
    IRON:      { minXp: 750,  label: 'Iron' },
    GOLD:      { minXp: 1500, label: 'Gold' },
    DIAMOND:   { minXp: 2500, label: 'Diamond' },
    NETHERITE: { minXp: 5000, label: 'Netherite' },
  },
}))

import type { AvatarProfile } from '../../core/types'
import {
  ALL_ARMOR_VOXEL_PIECES,
  MINECRAFT_TIER_ORDER,
  deriveUnlockedTiersFromForged,
  getActiveForgeTierFromProgress,
  getDisplayArmorTier,
  getPieceForgedTier,
  getPreviewTierForPiece,
  getTierForgedCount,
  getTierLockReason,
  getTierMinXp,
  isTierComplete,
} from './armorTierProgress'

function makeProfile(overrides: Partial<AvatarProfile> = {}): AvatarProfile {
  return {
    childId: 'child-1',
    themeStyle: 'minecraft',
    totalXp: 0,
    currentTier: 'wood',
    equippedPieces: [],
    pieces: [],
    unlockedPieces: [],
    updatedAt: '2026-01-01',
    ...overrides,
  } as AvatarProfile
}

function allPiecesForged(tier: string): Record<string, Record<string, { forgedAt: string }>> {
  const pieces: Record<string, { forgedAt: string }> = {}
  for (const piece of ALL_ARMOR_VOXEL_PIECES) {
    pieces[piece] = { forgedAt: '2026-01-01' }
  }
  return { [tier]: pieces }
}

// ── getPieceForgedTier ──────────────────────────────────────────

describe('getPieceForgedTier', () => {
  it('returns fallback when no forgedPieces', () => {
    expect(getPieceForgedTier(undefined, 'belt')).toBe('wood')
  })

  it('returns custom fallback when specified', () => {
    expect(getPieceForgedTier(undefined, 'belt', 'stone')).toBe('stone')
  })

  it('returns highest forged tier for a piece', () => {
    const forgedPieces = {
      wood: { belt: { forgedAt: '2026-01-01' } },
      stone: { belt: { forgedAt: '2026-01-02' } },
      iron: { belt: { forgedAt: '2026-01-03' } },
    }
    expect(getPieceForgedTier(forgedPieces, 'belt')).toBe('iron')
  })

  it('returns wood when piece only forged at wood', () => {
    const forgedPieces = {
      wood: { belt: { forgedAt: '2026-01-01' } },
    }
    expect(getPieceForgedTier(forgedPieces, 'belt')).toBe('wood')
  })

  it('returns fallback for unforged piece', () => {
    const forgedPieces = {
      wood: { helmet: { forgedAt: '2026-01-01' } },
    }
    expect(getPieceForgedTier(forgedPieces, 'belt')).toBe('wood')
  })
})

// ── getPreviewTierForPiece ──────────────────────────────────────

describe('getPreviewTierForPiece', () => {
  it('returns wood when no forge data and tab is iron', () => {
    expect(getPreviewTierForPiece(undefined, 'belt', 'iron')).toBe('wood')
  })

  it('returns highest forged tier at or below selected tab', () => {
    const forgedPieces = {
      wood: { belt: { forgedAt: '2026-01-01' } },
      stone: { belt: { forgedAt: '2026-01-02' } },
    }
    expect(getPreviewTierForPiece(forgedPieces, 'belt', 'iron')).toBe('stone')
    expect(getPreviewTierForPiece(forgedPieces, 'belt', 'stone')).toBe('stone')
    expect(getPreviewTierForPiece(forgedPieces, 'belt', 'wood')).toBe('wood')
  })

  it('returns exact tier when forged at selected tab', () => {
    const forgedPieces = {
      iron: { belt: { forgedAt: '2026-01-01' } },
    }
    expect(getPreviewTierForPiece(forgedPieces, 'belt', 'iron')).toBe('iron')
  })
})

// ── getTierForgedCount ──────────────────────────────────────────

describe('getTierForgedCount', () => {
  it('returns 0 for empty profile', () => {
    expect(getTierForgedCount(makeProfile(), 'wood')).toBe(0)
  })

  it('counts forged pieces at a tier', () => {
    const profile = makeProfile({
      forgedPieces: {
        wood: {
          belt: { forgedAt: '2026-01-01' },
          helmet: { forgedAt: '2026-01-01' },
          sword: { forgedAt: '2026-01-01' },
        },
      },
    })
    expect(getTierForgedCount(profile, 'wood')).toBe(3)
  })

  it('returns 0 for tier with no forged pieces', () => {
    const profile = makeProfile({
      forgedPieces: {
        wood: { belt: { forgedAt: '2026-01-01' } },
      },
    })
    expect(getTierForgedCount(profile, 'stone')).toBe(0)
  })
})

// ── isTierComplete ──────────────────────────────────────────────

describe('isTierComplete', () => {
  it('returns false for empty profile', () => {
    expect(isTierComplete(makeProfile(), 'wood')).toBe(false)
  })

  it('returns true when all 6 pieces forged', () => {
    const profile = makeProfile({ forgedPieces: allPiecesForged('wood') })
    expect(isTierComplete(profile, 'wood')).toBe(true)
  })

  it('returns false with 5 of 6 pieces', () => {
    const pieces: Record<string, { forgedAt: string }> = {}
    for (const piece of ALL_ARMOR_VOXEL_PIECES.slice(0, 5)) {
      pieces[piece] = { forgedAt: '2026-01-01' }
    }
    const profile = makeProfile({ forgedPieces: { wood: pieces } })
    expect(isTierComplete(profile, 'wood')).toBe(false)
  })
})

// ── getTierMinXp ────────────────────────────────────────────────

describe('getTierMinXp', () => {
  it('returns 0 for wood', () => {
    expect(getTierMinXp('wood')).toBe(0)
  })

  it('returns 100 for stone', () => {
    expect(getTierMinXp('stone')).toBe(100)
  })

  it('returns 0 for unknown tier', () => {
    expect(getTierMinXp('mythril')).toBe(0)
  })
})

// ── deriveUnlockedTiersFromForged ───────────────────────────────

describe('deriveUnlockedTiersFromForged', () => {
  it('always includes wood', () => {
    const result = deriveUnlockedTiersFromForged(makeProfile())
    expect(result).toEqual(['wood'])
  })

  it('unlocks stone when wood is complete and XP >= 100', () => {
    const profile = makeProfile({
      forgedPieces: allPiecesForged('wood'),
      totalXp: 100,
    })
    expect(deriveUnlockedTiersFromForged(profile)).toContain('stone')
  })

  it('does not unlock stone when wood is complete but XP < 100', () => {
    const profile = makeProfile({
      forgedPieces: allPiecesForged('wood'),
      totalXp: 50,
    })
    expect(deriveUnlockedTiersFromForged(profile)).toEqual(['wood'])
  })

  it('does not unlock stone when XP >= 100 but wood not complete', () => {
    const profile = makeProfile({ totalXp: 200 })
    expect(deriveUnlockedTiersFromForged(profile)).toEqual(['wood'])
  })

  it('unlocks next tier if pieces forged in it (legacy data)', () => {
    const profile = makeProfile({
      forgedPieces: {
        stone: { belt: { forgedAt: '2026-01-01' } },
      },
      totalXp: 0,
    })
    const result = deriveUnlockedTiersFromForged(profile)
    expect(result).toContain('stone')
  })

  it('unlocks multiple consecutive tiers', () => {
    const forgedPieces = {
      ...allPiecesForged('wood'),
      ...allPiecesForged('stone'),
    }
    const profile = makeProfile({ forgedPieces, totalXp: 800 })
    const result = deriveUnlockedTiersFromForged(profile)
    expect(result).toContain('wood')
    expect(result).toContain('stone')
    expect(result).toContain('iron')
  })
})

// ── getActiveForgeTierFromProgress ──────────────────────────────

describe('getActiveForgeTierFromProgress', () => {
  it('returns wood for empty profile', () => {
    expect(getActiveForgeTierFromProgress(makeProfile())).toBe('wood')
  })

  it('returns stone when wood is complete and stone is unlocked', () => {
    const profile = makeProfile({
      forgedPieces: allPiecesForged('wood'),
      totalXp: 200,
    })
    expect(getActiveForgeTierFromProgress(profile)).toBe('stone')
  })

  it('returns next locked tier when all unlocked tiers are complete', () => {
    const profile = makeProfile({
      forgedPieces: allPiecesForged('wood'),
      totalXp: 100,
    })
    const result = getActiveForgeTierFromProgress(profile)
    expect(MINECRAFT_TIER_ORDER.indexOf(result)).toBeGreaterThanOrEqual(
      MINECRAFT_TIER_ORDER.indexOf('stone'),
    )
  })
})

// ── getDisplayArmorTier ─────────────────────────────────────────

describe('getDisplayArmorTier', () => {
  it('returns wood when no tiers complete', () => {
    expect(getDisplayArmorTier(makeProfile())).toBe('wood')
  })

  it('returns highest completed tier', () => {
    const forgedPieces = {
      ...allPiecesForged('wood'),
      ...allPiecesForged('stone'),
    }
    const profile = makeProfile({ forgedPieces, totalXp: 800 })
    expect(getDisplayArmorTier(profile)).toBe('stone')
  })
})

// ── getTierLockReason ───────────────────────────────────────────

describe('getTierLockReason', () => {
  it('returns empty string for wood (always unlocked)', () => {
    expect(getTierLockReason(makeProfile(), 'wood')).toBe('')
  })

  it('returns empty string for unlocked tier', () => {
    const profile = makeProfile({
      forgedPieces: allPiecesForged('wood'),
      totalXp: 200,
    })
    expect(getTierLockReason(profile, 'stone')).toBe('')
  })

  it('returns XP reason when forge complete but XP insufficient', () => {
    const profile = makeProfile({
      forgedPieces: allPiecesForged('wood'),
      totalXp: 50,
    })
    const reason = getTierLockReason(profile, 'stone')
    expect(reason).toContain('100 XP')
    expect(reason).toContain('have 50')
  })

  it('returns forge reason when XP met but forge incomplete', () => {
    const profile = makeProfile({ totalXp: 200 })
    const reason = getTierLockReason(profile, 'stone')
    expect(reason).toContain('Wood')
    expect(reason).toContain('0/6')
  })

  it('returns combined reason when both missing', () => {
    const profile = makeProfile({ totalXp: 50 })
    const reason = getTierLockReason(profile, 'stone')
    expect(reason).toContain('Wood')
    expect(reason).toContain('0/6')
    expect(reason).toContain('100 XP')
  })
})
