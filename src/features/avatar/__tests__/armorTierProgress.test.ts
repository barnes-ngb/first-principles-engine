import { describe, expect, it } from 'vitest'

import type { AvatarProfile } from '../../../core/types'
import { deriveUnlockedTiersFromForged, getActiveForgeTierFromProgress, getDisplayArmorTier } from '../armorTierProgress'

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

  it('unlocks next tier only after all 6 pieces of current tier are forged', () => {
    const profile = makeProfile({
      forgedPieces: {
        wood: {
          belt: forgedEntry,
          shoes: forgedEntry,
          breastplate: forgedEntry,
          shield: forgedEntry,
          helmet: forgedEntry,
          sword: forgedEntry,
        },
      },
    })
    expect(deriveUnlockedTiersFromForged(profile)).toEqual(['wood', 'stone'])
    expect(getActiveForgeTierFromProgress(profile)).toBe('stone')
    expect(getDisplayArmorTier(profile)).toBe('wood')
  })

  it('uses highest completed tier for display once multiple tiers are completed', () => {
    const profile = makeProfile({
      forgedPieces: {
        wood: { belt: forgedEntry, shoes: forgedEntry, breastplate: forgedEntry, shield: forgedEntry, helmet: forgedEntry, sword: forgedEntry },
        stone: { belt: forgedEntry, shoes: forgedEntry, breastplate: forgedEntry, shield: forgedEntry, helmet: forgedEntry, sword: forgedEntry },
      },
    })
    expect(getDisplayArmorTier(profile)).toBe('stone')
    expect(getActiveForgeTierFromProgress(profile)).toBe('iron')
  })
})
