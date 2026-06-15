import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AvatarProfile, VoxelArmorPieceId } from '../types'

// ── Mock Firestore ─────────────────────────────────────────────
const mockGetDoc = vi.fn()
const mockDoc = vi.fn((..._args: unknown[]) => `mock-doc-${_args.join('-')}`)

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
}))

vi.mock('../firebase/firestore', () => ({
  avatarProfilesCollection: (familyId: string) => `avatarProfiles-${familyId}`,
}))

vi.mock('../../features/avatar/normalizeProfile', () => ({
  normalizeAvatarProfile: (data: Record<string, unknown>) => ({
    childId: data.childId ?? 'child-1',
    themeStyle: data.themeStyle ?? 'minecraft',
    pieces: data.pieces ?? [],
    currentTier: data.currentTier ?? 'wood',
    totalXp: data.totalXp ?? 0,
    updatedAt: data.updatedAt ?? '2026-01-01',
    equippedPieces: data.equippedPieces ?? [],
    unlockedPieces: data.unlockedPieces ?? [],
    forgedPieces: data.forgedPieces ?? {},
    unlockedTiers: data.unlockedTiers ?? ['wood'],
    diamondBalance: data.diamondBalance ?? 0,
  }),
}))

vi.mock('../../features/avatar/safeProfileWrite', () => ({
  safeUpdateProfile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../features/avatar/armorTierProgress', () => ({
  ALL_ARMOR_VOXEL_PIECES: ['belt', 'shoes', 'breastplate', 'shield', 'helmet', 'sword'],
  deriveUnlockedTiersFromForged: (profile: { forgedPieces?: Record<string, Record<string, unknown>> }) => {
    const tiers = ['wood']
    if (profile.forgedPieces?.wood && Object.keys(profile.forgedPieces.wood).length >= 6) tiers.push('stone')
    if (profile.forgedPieces?.stone && Object.keys(profile.forgedPieces.stone).length >= 6) tiers.push('iron')
    return tiers
  },
  getActiveForgeTierFromProgress: () => 'wood',
}))

vi.mock('../../features/avatar/voxel/buildArmorPiece', () => ({
  XP_THRESHOLDS: {
    belt: 0,
    breastplate: 150,
    shoes: 300,
    shield: 500,
    helmet: 750,
    sword: 1000,
  },
}))

vi.mock('./getDiamondBalance', () => ({
  spendDiamonds: vi.fn().mockResolvedValue(true),
}))

vi.mock('./forgeCosts', () => ({
  getForgeCost: (tier: string, piece: string) => {
    const costs: Record<string, Record<string, number>> = {
      wood: { belt: 10, shoes: 10, breastplate: 14, shield: 15, helmet: 16, sword: 20 },
    }
    return costs[tier]?.[piece] ?? 0
  },
  TIER_COMPLETION_BONUSES: { wood: 20, stone: 30, iron: 50 },
}))

vi.mock('./addDiamondEvent', () => ({
  addDiamondEvent: vi.fn().mockResolvedValue({ success: true, newBalance: 100 }),
}))

import { forgeArmorPiece, isPieceForged, getForgedPiecesForTier, isTierComplete } from './forgeArmorPiece'
import { spendDiamonds } from './getDiamondBalance'

// ── Pure utility function tests ─────────────────────────────────────

describe('isPieceForged', () => {
  it('returns true when piece exists in forgedPieces at given tier', () => {
    const profile = {
      forgedPieces: { wood: { belt: { forgedAt: '2026-01-01' } } },
    } as unknown as AvatarProfile
    expect(isPieceForged(profile, 'wood', 'belt')).toBe(true)
  })

  it('returns false when piece does not exist at given tier', () => {
    const profile = {
      forgedPieces: { wood: { belt: { forgedAt: '2026-01-01' } } },
    } as unknown as AvatarProfile
    expect(isPieceForged(profile, 'wood', 'helmet')).toBe(false)
  })

  it('returns false when tier does not exist', () => {
    const profile = {
      forgedPieces: { wood: { belt: { forgedAt: '2026-01-01' } } },
    } as unknown as AvatarProfile
    expect(isPieceForged(profile, 'stone', 'belt')).toBe(false)
  })

  it('returns false when forgedPieces is undefined', () => {
    const profile = {} as unknown as AvatarProfile
    expect(isPieceForged(profile, 'wood', 'belt')).toBe(false)
  })
})

describe('getForgedPiecesForTier', () => {
  it('returns all piece IDs forged at a tier', () => {
    const profile = {
      forgedPieces: {
        wood: {
          belt: { forgedAt: '2026-01-01' },
          shoes: { forgedAt: '2026-01-02' },
        },
      },
    } as unknown as AvatarProfile
    const pieces = getForgedPiecesForTier(profile, 'wood')
    expect(pieces.sort()).toEqual(['belt', 'shoes'])
  })

  it('returns empty array when tier has no forged pieces', () => {
    const profile = { forgedPieces: {} } as unknown as AvatarProfile
    expect(getForgedPiecesForTier(profile, 'wood')).toEqual([])
  })

  it('returns empty array when forgedPieces is undefined', () => {
    const profile = {} as unknown as AvatarProfile
    expect(getForgedPiecesForTier(profile, 'wood')).toEqual([])
  })
})

describe('isTierComplete', () => {
  it('returns true when all 6 pieces are forged', () => {
    const profile = {
      forgedPieces: {
        wood: {
          belt: { forgedAt: '2026-01-01' },
          shoes: { forgedAt: '2026-01-01' },
          breastplate: { forgedAt: '2026-01-01' },
          shield: { forgedAt: '2026-01-01' },
          helmet: { forgedAt: '2026-01-01' },
          sword: { forgedAt: '2026-01-01' },
        },
      },
    } as unknown as AvatarProfile
    expect(isTierComplete(profile, 'wood')).toBe(true)
  })

  it('returns false when fewer than 6 pieces are forged', () => {
    const profile = {
      forgedPieces: {
        wood: {
          belt: { forgedAt: '2026-01-01' },
          shoes: { forgedAt: '2026-01-01' },
        },
      },
    } as unknown as AvatarProfile
    expect(isTierComplete(profile, 'wood')).toBe(false)
  })

  it('returns false when tier has no forged pieces', () => {
    const profile = { forgedPieces: {} } as unknown as AvatarProfile
    expect(isTierComplete(profile, 'wood')).toBe(false)
  })
})

// ── forgeArmorPiece (main logic with mocks) ─────────────────────────

describe('forgeArmorPiece', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        childId: 'child-1',
        themeStyle: 'minecraft',
        totalXp: 500,
        forgedPieces: {},
        equippedPieces: [],
        unlockedPieces: [],
        unlockedTiers: ['wood'],
        diamondBalance: 100,
      }),
    })
  })

  it('returns invalid_input when familyId is empty', async () => {
    const result = await forgeArmorPiece('', 'child-1', 'wood', 'belt')
    expect(result).toEqual({ success: false, error: 'invalid_input' })
  })

  it('returns invalid_input when childId is empty', async () => {
    const result = await forgeArmorPiece('fam-1', '', 'wood', 'belt')
    expect(result).toEqual({ success: false, error: 'invalid_input' })
  })

  it('returns invalid_input when tier is empty', async () => {
    const result = await forgeArmorPiece('fam-1', 'child-1', '', 'belt')
    expect(result).toEqual({ success: false, error: 'invalid_input' })
  })

  it('returns invalid_input when piece is empty', async () => {
    const result = await forgeArmorPiece('fam-1', 'child-1', 'wood', '' as VoxelArmorPieceId)
    expect(result).toEqual({ success: false, error: 'invalid_input' })
  })

  it('returns tier_locked when tier is not unlocked', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        childId: 'child-1',
        themeStyle: 'minecraft',
        totalXp: 500,
        forgedPieces: {},
        unlockedTiers: ['wood'],
        diamondBalance: 100,
      }),
    })
    const result = await forgeArmorPiece('fam-1', 'child-1', 'stone', 'belt')
    expect(result.success).toBe(false)
    expect(result.error).toBe('tier_locked')
  })

  it('returns already_forged when piece already exists at tier', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        childId: 'child-1',
        themeStyle: 'minecraft',
        totalXp: 500,
        forgedPieces: { wood: { belt: { forgedAt: '2026-01-01' } } },
        unlockedTiers: ['wood'],
        diamondBalance: 100,
      }),
    })
    const result = await forgeArmorPiece('fam-1', 'child-1', 'wood', 'belt')
    expect(result.success).toBe(false)
    expect(result.error).toBe('already_forged')
  })

  it('returns xp_locked when wood tier piece XP threshold not met', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        childId: 'child-1',
        themeStyle: 'minecraft',
        totalXp: 100,
        forgedPieces: {},
        unlockedTiers: ['wood'],
        diamondBalance: 100,
      }),
    })
    // 'shoes' needs 300 XP, profile has 100
    const result = await forgeArmorPiece('fam-1', 'child-1', 'wood', 'shoes')
    expect(result.success).toBe(false)
    expect(result.error).toBe('xp_locked')
  })

  it('returns insufficient_diamonds when spendDiamonds fails', async () => {
    vi.mocked(spendDiamonds).mockResolvedValueOnce(false)
    const result = await forgeArmorPiece('fam-1', 'child-1', 'wood', 'belt')
    expect(result.success).toBe(false)
    expect(result.error).toBe('insufficient_diamonds')
  })

  it('succeeds and returns newBalance for valid forge', async () => {
    const result = await forgeArmorPiece('fam-1', 'child-1', 'wood', 'belt')
    expect(result.success).toBe(true)
    expect(result.newBalance).toBe(100)
    expect(result.tierCompleted).toBe(false)
  })
})
