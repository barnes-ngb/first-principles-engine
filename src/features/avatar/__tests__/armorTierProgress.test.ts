import { describe, expect, it } from 'vitest'

import type { AvatarProfile } from '../../../core/types'
import {
  deriveUnlockedTiersFromForged,
  getActiveForgeTierFromProgress,
  getDisplayArmorTier,
  getPieceForgedTier,
  getPreviewTierForPiece,
  getTierLockReason,
} from '../armorTierProgress'

const forgedEntry = { forgedAt: new Date().toISOString() }

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

const allForged = {
  belt: forgedEntry,
  shoes: forgedEntry,
  breastplate: forgedEntry,
  shield: forgedEntry,
  helmet: forgedEntry,
  sword: forgedEntry,
}

describe('armorTierProgress', () => {
  it('keeps only wood unlocked when wood is incomplete', () => {
    const profile = makeProfile({
      forgedPieces: {
        wood: { belt: forgedEntry, shoes: forgedEntry },
      },
      unlockedTiers: ['wood', 'stone', 'iron'],
    })
    expect(deriveUnlockedTiersFromForged(profile)).toEqual(['wood'])
    expect(getActiveForgeTierFromProgress(profile)).toBe('wood')
  })

  it('unlocks stone when wood complete AND XP >= 100', () => {
    const profile = makeProfile({
      totalXp: 100,
      forgedPieces: { wood: allForged },
    })
    expect(deriveUnlockedTiersFromForged(profile)).toEqual(['wood', 'stone'])
    expect(getActiveForgeTierFromProgress(profile)).toBe('stone')
    expect(getDisplayArmorTier(profile)).toBe('wood')
  })

  it('does NOT unlock stone when wood complete but XP < 100', () => {
    const profile = makeProfile({
      totalXp: 50,
      forgedPieces: { wood: allForged },
    })
    expect(deriveUnlockedTiersFromForged(profile)).toEqual(['wood'])
    // Active tier should be stone (next tier preview) even though locked
    expect(getActiveForgeTierFromProgress(profile)).toBe('stone')
  })

  it('preserves legacy access when pieces exist in higher tier', () => {
    const profile = makeProfile({
      totalXp: 100,
      forgedPieces: {
        wood: { belt: forgedEntry, shoes: forgedEntry },
        stone: { belt: forgedEntry },
      },
    })
    // Stone unlocked via legacy (hasForgedInNext)
    expect(deriveUnlockedTiersFromForged(profile)).toEqual(['wood', 'stone'])
  })

  it('uses highest completed tier for display once multiple tiers are completed', () => {
    const profile = makeProfile({
      totalXp: 750,
      forgedPieces: {
        wood: allForged,
        stone: allForged,
      },
    })
    expect(getDisplayArmorTier(profile)).toBe('stone')
    expect(getActiveForgeTierFromProgress(profile)).toBe('iron')
  })

  it('chains unlock: wood→stone→iron when all prior complete + XP met', () => {
    const profile = makeProfile({
      totalXp: 750,
      forgedPieces: {
        wood: allForged,
        stone: allForged,
      },
    })
    expect(deriveUnlockedTiersFromForged(profile)).toEqual(['wood', 'stone', 'iron'])
    expect(getActiveForgeTierFromProgress(profile)).toBe('iron')
  })

  it('stops chain when XP threshold not met for next tier', () => {
    const profile = makeProfile({
      totalXp: 600,
      forgedPieces: {
        wood: allForged,
        stone: allForged,
      },
    })
    // Iron needs 750 XP, only have 600
    expect(deriveUnlockedTiersFromForged(profile)).toEqual(['wood', 'stone'])
    // Active forge tier should preview iron (locked)
    expect(getActiveForgeTierFromProgress(profile)).toBe('iron')
  })

  it('shows next tier when all unlocked tiers are complete', () => {
    const profile = makeProfile({
      totalXp: 750,
      forgedPieces: { wood: allForged },
    })
    // Wood complete + XP >= 100 → stone unlocks. Iron needs stone complete + 750 XP.
    expect(deriveUnlockedTiersFromForged(profile)).toEqual(['wood', 'stone'])
    expect(getActiveForgeTierFromProgress(profile)).toBe('stone')
  })
})

describe('getTierLockReason', () => {
  it('returns empty for unlocked tier', () => {
    const profile = makeProfile({ totalXp: 100, forgedPieces: { wood: allForged } })
    expect(getTierLockReason(profile, 'stone')).toBe('')
  })

  it('returns XP reason when prior tier complete but XP insufficient', () => {
    const profile = makeProfile({ totalXp: 50, forgedPieces: { wood: allForged } })
    expect(getTierLockReason(profile, 'stone')).toBe('Need 100 XP (have 50)')
  })

  it('returns prior tier completion reason when XP sufficient but prior incomplete', () => {
    const profile = makeProfile({
      totalXp: 500,
      forgedPieces: { wood: { belt: forgedEntry, shoes: forgedEntry } },
    })
    expect(getTierLockReason(profile, 'stone')).toBe('Complete Wood first (2/6)')
  })

  it('returns combined reason when both conditions unmet', () => {
    const profile = makeProfile({
      totalXp: 50,
      forgedPieces: { wood: { belt: forgedEntry } },
    })
    expect(getTierLockReason(profile, 'stone')).toBe('Complete Wood (1/6) & earn 100 XP')
  })

  it('returns empty for wood tier (always unlocked)', () => {
    const profile = makeProfile()
    expect(getTierLockReason(profile, 'wood')).toBe('')
  })
})

describe('getPieceForgedTier', () => {
  it('returns the highest tier at which a piece was forged', () => {
    const forgedPieces = {
      wood: { belt: forgedEntry, helmet: forgedEntry },
      stone: { belt: forgedEntry },
      iron: { belt: forgedEntry },
    }
    expect(getPieceForgedTier(forgedPieces, 'belt')).toBe('iron')
  })

  it('returns the tier for a piece only forged in one tier', () => {
    const forgedPieces = {
      stone: { breastplate: forgedEntry },
    }
    expect(getPieceForgedTier(forgedPieces, 'breastplate')).toBe('stone')
  })

  it('returns the fallback when the piece has no forge record', () => {
    const forgedPieces = {
      wood: { belt: forgedEntry },
    }
    expect(getPieceForgedTier(forgedPieces, 'helmet', 'iron')).toBe('iron')
  })

  it('returns the fallback when forgedPieces is undefined', () => {
    expect(getPieceForgedTier(undefined, 'belt', 'iron')).toBe('iron')
  })

  it('defaults to wood when no forge record and no fallback', () => {
    expect(getPieceForgedTier(undefined, 'belt')).toBe('wood')
  })

  it('supports mixed loadouts: each piece resolves independently', () => {
    const forgedPieces = {
      wood: { helmet: forgedEntry },
      stone: { breastplate: forgedEntry },
      iron: { belt: forgedEntry },
    }
    expect(getPieceForgedTier(forgedPieces, 'belt')).toBe('iron')
    expect(getPieceForgedTier(forgedPieces, 'breastplate')).toBe('stone')
    expect(getPieceForgedTier(forgedPieces, 'helmet')).toBe('wood')
  })
})

describe('getPreviewTierForPiece', () => {
  // Lincoln's forge state from the fix: belt forged through Iron, every other
  // piece only through Stone. Iron tab should show the Iron belt alongside
  // Stone everything else — that's the "forge more Iron to match the belt"
  // motivation.
  const lincolnForged = {
    wood: {
      belt: forgedEntry,
      breastplate: forgedEntry,
      helmet: forgedEntry,
      shield: forgedEntry,
      sword: forgedEntry,
      shoes: forgedEntry,
    },
    stone: {
      belt: forgedEntry,
      breastplate: forgedEntry,
      helmet: forgedEntry,
      shield: forgedEntry,
      sword: forgedEntry,
      shoes: forgedEntry,
    },
    iron: {
      belt: forgedEntry,
    },
  }

  it('returns the selected tier when a piece is forged there', () => {
    expect(getPreviewTierForPiece(lincolnForged, 'belt', 'iron')).toBe('iron')
  })

  it('falls back to the highest forged tier below the selection', () => {
    expect(getPreviewTierForPiece(lincolnForged, 'breastplate', 'iron')).toBe('stone')
    expect(getPreviewTierForPiece(lincolnForged, 'helmet', 'iron')).toBe('stone')
    expect(getPreviewTierForPiece(lincolnForged, 'shield', 'iron')).toBe('stone')
    expect(getPreviewTierForPiece(lincolnForged, 'sword', 'iron')).toBe('stone')
    expect(getPreviewTierForPiece(lincolnForged, 'shoes', 'iron')).toBe('stone')
  })

  it('caps preview at the selected tab: stone tab shows stone for all', () => {
    for (const piece of ['belt', 'breastplate', 'helmet', 'shield', 'sword', 'shoes']) {
      expect(getPreviewTierForPiece(lincolnForged, piece, 'stone')).toBe('stone')
    }
  })

  it('wood tab shows wood for all pieces', () => {
    for (const piece of ['belt', 'breastplate', 'helmet', 'shield', 'sword', 'shoes']) {
      expect(getPreviewTierForPiece(lincolnForged, piece, 'wood')).toBe('wood')
    }
  })

  it('accepts uppercase tab labels', () => {
    expect(getPreviewTierForPiece(lincolnForged, 'belt', 'IRON')).toBe('iron')
    expect(getPreviewTierForPiece(lincolnForged, 'helmet', 'IRON')).toBe('stone')
  })

  it('falls back to wood when nothing has been forged', () => {
    expect(getPreviewTierForPiece({}, 'belt', 'iron')).toBe('wood')
    expect(getPreviewTierForPiece(undefined, 'belt', 'iron')).toBe('wood')
  })

  it('falls back to wood when the piece has no forge record at or below the tab', () => {
    const forged = { iron: { belt: forgedEntry } }
    // Helmet has no forge record at all -> wood (the safe default).
    expect(getPreviewTierForPiece(forged, 'helmet', 'iron')).toBe('wood')
  })
})
