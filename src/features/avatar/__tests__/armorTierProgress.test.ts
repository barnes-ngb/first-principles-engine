import { describe, expect, it } from 'vitest'

import type { AvatarProfile } from '../../../core/types'
import {
  deriveUnlockedTiersFromForged,
  getActiveForgeTierFromProgress,
  getDisplayArmorTier,
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

  it('unlocks stone when wood complete AND XP >= 200', () => {
    const profile = makeProfile({
      totalXp: 200,
      forgedPieces: { wood: allForged },
    })
    expect(deriveUnlockedTiersFromForged(profile)).toEqual(['wood', 'stone'])
    expect(getActiveForgeTierFromProgress(profile)).toBe('stone')
    expect(getDisplayArmorTier(profile)).toBe('wood')
  })

  it('does NOT unlock stone when wood complete but XP < 200', () => {
    const profile = makeProfile({
      totalXp: 150,
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
      totalXp: 1000,
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
      totalXp: 500,
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
      totalXp: 400,
      forgedPieces: {
        wood: allForged,
        stone: allForged,
      },
    })
    // Iron needs 500 XP, only have 400
    expect(deriveUnlockedTiersFromForged(profile)).toEqual(['wood', 'stone'])
    // Active forge tier should preview iron (locked)
    expect(getActiveForgeTierFromProgress(profile)).toBe('iron')
  })

  it('shows next tier when all unlocked tiers are complete', () => {
    const profile = makeProfile({
      totalXp: 1000,
      forgedPieces: { wood: allForged },
    })
    // Only wood unlocked (stone needs 200 XP — met, so stone unlocks too)
    // Stone is unlocked, iron needs stone complete + 500 XP
    expect(deriveUnlockedTiersFromForged(profile)).toEqual(['wood', 'stone'])
    expect(getActiveForgeTierFromProgress(profile)).toBe('stone')
  })
})

describe('getTierLockReason', () => {
  it('returns empty for unlocked tier', () => {
    const profile = makeProfile({ totalXp: 200, forgedPieces: { wood: allForged } })
    expect(getTierLockReason(profile, 'stone')).toBe('')
  })

  it('returns XP reason when prior tier complete but XP insufficient', () => {
    const profile = makeProfile({ totalXp: 150, forgedPieces: { wood: allForged } })
    expect(getTierLockReason(profile, 'stone')).toBe('Need 200 XP (have 150)')
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
      totalXp: 100,
      forgedPieces: { wood: { belt: forgedEntry } },
    })
    expect(getTierLockReason(profile, 'stone')).toBe('Complete Wood (1/6) & earn 200 XP')
  })

  it('returns empty for wood tier (always unlocked)', () => {
    const profile = makeProfile()
    expect(getTierLockReason(profile, 'wood')).toBe('')
  })
})
