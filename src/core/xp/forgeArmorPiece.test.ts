import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { AvatarProfile, VoxelArmorPieceId } from '../types'

// ── Mock Firestore ─────────────────────────────────────────────
const mockGetDoc = vi.fn()
const mockDoc = vi.fn((..._args: unknown[]) => `mock-doc-${_args.join('-')}`)

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  runTransaction: vi.fn(),
}))

vi.mock('../firebase/firestore', () => ({
  db: 'mock-db',
  avatarProfilesCollection: (familyId: string) => `avatarProfiles-${familyId}`,
  xpLedgerCollection: () => 'mock-xp-collection',
  xpLedgerDocId: (childId: string, dedupKey: string) => `${childId}_${dedupKey}`,
  stripUndefined: (obj: unknown) => obj,
}))

vi.mock('../../features/avatar/normalizeProfile', () => ({
  normalizeAvatarProfile: (raw: Record<string, unknown>) => ({
    childId: raw.childId ?? '',
    themeStyle: raw.themeStyle ?? 'minecraft',
    totalXp: raw.totalXp ?? 0,
    currentTier: raw.currentTier ?? 'wood',
    equippedPieces: raw.equippedPieces ?? [],
    unlockedPieces: raw.unlockedPieces ?? [],
    pieces: raw.pieces ?? [],
    forgedPieces: raw.forgedPieces ?? undefined,
    diamondBalance: raw.diamondBalance ?? 0,
    updatedAt: raw.updatedAt ?? '2026-01-01',
  }),
}))

const mockSafeUpdateProfile = vi.fn().mockResolvedValue(undefined)
vi.mock('../../features/avatar/safeProfileWrite', () => ({
  safeUpdateProfile: (...args: unknown[]) => mockSafeUpdateProfile(...args),
}))

const mockSpendDiamonds = vi.fn()
vi.mock('./getDiamondBalance', () => ({
  spendDiamonds: (...args: unknown[]) => mockSpendDiamonds(...args),
}))

const mockAddDiamondEvent = vi.fn().mockResolvedValue(0)
vi.mock('./addDiamondEvent', () => ({
  addDiamondEvent: (...args: unknown[]) => mockAddDiamondEvent(...args),
}))

import {
  forgeArmorPiece,
  isPieceForged,
  getForgedPiecesForTier,
  isTierComplete,
} from './forgeArmorPiece'

// ── Pure utility tests ─────────────────────────────────────────

describe('isPieceForged', () => {
  it('returns true when piece is forged at the given tier', () => {
    const profile = {
      forgedPieces: { wood: { belt: { forgedAt: '2026-01-01' } } },
    } as unknown as AvatarProfile

    expect(isPieceForged(profile, 'wood', 'belt')).toBe(true)
  })

  it('returns false when piece is not forged at the given tier', () => {
    const profile = {
      forgedPieces: { wood: { belt: { forgedAt: '2026-01-01' } } },
    } as unknown as AvatarProfile

    expect(isPieceForged(profile, 'wood', 'sword')).toBe(false)
  })

  it('returns false when tier has no forged pieces', () => {
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
  it('returns all forged pieces for a tier', () => {
    const profile = {
      forgedPieces: {
        wood: {
          belt: { forgedAt: '2026-01-01' },
          sword: { forgedAt: '2026-01-02' },
        },
      },
    } as unknown as AvatarProfile

    const pieces = getForgedPiecesForTier(profile, 'wood')
    expect(pieces).toEqual(expect.arrayContaining(['belt', 'sword']))
    expect(pieces).toHaveLength(2)
  })

  it('returns empty array for tier with no forged pieces', () => {
    const profile = {
      forgedPieces: { wood: { belt: { forgedAt: '2026-01-01' } } },
    } as unknown as AvatarProfile

    expect(getForgedPiecesForTier(profile, 'stone')).toEqual([])
  })

  it('returns empty array when forgedPieces is undefined', () => {
    const profile = {} as unknown as AvatarProfile

    expect(getForgedPiecesForTier(profile, 'wood')).toEqual([])
  })
})

describe('isTierComplete', () => {
  it('returns true when all 6 pieces are forged', () => {
    const allPieces: VoxelArmorPieceId[] = ['belt', 'breastplate', 'shoes', 'shield', 'helmet', 'sword']
    const tierPieces: Record<string, { forgedAt: string }> = {}
    for (const p of allPieces) {
      tierPieces[p] = { forgedAt: '2026-01-01' }
    }
    const profile = { forgedPieces: { wood: tierPieces } } as unknown as AvatarProfile

    expect(isTierComplete(profile, 'wood')).toBe(true)
  })

  it('returns false when only 5 pieces are forged', () => {
    const tierPieces: Record<string, { forgedAt: string }> = {}
    for (const p of ['belt', 'breastplate', 'shoes', 'shield', 'helmet'] as const) {
      tierPieces[p] = { forgedAt: '2026-01-01' }
    }
    const profile = { forgedPieces: { wood: tierPieces } } as unknown as AvatarProfile

    expect(isTierComplete(profile, 'wood')).toBe(false)
  })

  it('returns false when no pieces are forged', () => {
    const profile = { forgedPieces: {} } as unknown as AvatarProfile

    expect(isTierComplete(profile, 'wood')).toBe(false)
  })
})

// ── Main forgeArmorPiece tests ─────────────────────────────────

describe('forgeArmorPiece', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSpendDiamonds.mockResolvedValue(true)
  })

  it('returns invalid_input for empty familyId', async () => {
    const result = await forgeArmorPiece('', 'child-1', 'wood', 'belt')
    expect(result).toEqual({ success: false, error: 'invalid_input' })
  })

  it('returns invalid_input for empty childId', async () => {
    const result = await forgeArmorPiece('fam-1', '', 'wood', 'belt')
    expect(result).toEqual({ success: false, error: 'invalid_input' })
  })

  it('returns invalid_input for empty tier', async () => {
    const result = await forgeArmorPiece('fam-1', 'child-1', '', 'belt')
    expect(result).toEqual({ success: false, error: 'invalid_input' })
  })

  it('returns invalid_input for empty piece', async () => {
    const result = await forgeArmorPiece('fam-1', 'child-1', 'wood', '' as VoxelArmorPieceId)
    expect(result).toEqual({ success: false, error: 'invalid_input' })
  })

  it('returns tier_locked when tier is not unlocked', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        childId: 'child-1',
        themeStyle: 'minecraft',
        totalXp: 50,
        forgedPieces: undefined,
        equippedPieces: [],
        unlockedPieces: [],
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
        totalXp: 100,
        forgedPieces: { wood: { belt: { forgedAt: '2026-01-01' } } },
        equippedPieces: ['belt'],
        unlockedPieces: ['belt'],
      }),
    })

    const result = await forgeArmorPiece('fam-1', 'child-1', 'wood', 'belt')
    expect(result.success).toBe(false)
    expect(result.error).toBe('already_forged')
  })

  it('returns xp_locked when wood piece XP threshold not met', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        childId: 'child-1',
        themeStyle: 'minecraft',
        totalXp: 50,
        forgedPieces: undefined,
        equippedPieces: [],
        unlockedPieces: [],
      }),
    })

    // sword requires 1000 XP in wood tier
    const result = await forgeArmorPiece('fam-1', 'child-1', 'wood', 'sword')
    expect(result.success).toBe(false)
    expect(result.error).toBe('xp_locked')
  })

  it('returns insufficient_diamonds when spendDiamonds fails', async () => {
    mockSpendDiamonds.mockResolvedValue(false)
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        childId: 'child-1',
        themeStyle: 'minecraft',
        totalXp: 100,
        forgedPieces: undefined,
        equippedPieces: [],
        unlockedPieces: [],
      }),
    })

    // belt has 0 XP threshold in wood tier
    const result = await forgeArmorPiece('fam-1', 'child-1', 'wood', 'belt')
    expect(result.success).toBe(false)
    expect(result.error).toBe('insufficient_diamonds')
  })

  it('succeeds and updates profile for valid forge', async () => {
    let callCount = 0
    mockGetDoc.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          exists: () => true,
          data: () => ({
            childId: 'child-1',
            themeStyle: 'minecraft',
            totalXp: 100,
            forgedPieces: undefined,
            equippedPieces: [],
            unlockedPieces: [],
          }),
        })
      }
      // Refreshed profile after forge
      return Promise.resolve({
        exists: () => true,
        data: () => ({ diamondBalance: 90 }),
      })
    })

    const result = await forgeArmorPiece('fam-1', 'child-1', 'wood', 'belt')

    expect(result.success).toBe(true)
    expect(result.newBalance).toBe(90)
    expect(mockSpendDiamonds).toHaveBeenCalledWith(
      'fam-1', 'child-1', 10, 'forge_wood_belt_child-1', 'forge', 'wood_belt',
    )
    expect(mockSafeUpdateProfile).toHaveBeenCalled()
  })

  it('stores verseResponse when provided', async () => {
    let callCount = 0
    mockGetDoc.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          exists: () => true,
          data: () => ({
            childId: 'child-1',
            themeStyle: 'minecraft',
            totalXp: 100,
            forgedPieces: undefined,
            equippedPieces: [],
            unlockedPieces: [],
          }),
        })
      }
      return Promise.resolve({
        exists: () => true,
        data: () => ({ diamondBalance: 80 }),
      })
    })

    await forgeArmorPiece('fam-1', 'child-1', 'wood', 'belt', 'I will speak truth')

    const updateCall = mockSafeUpdateProfile.mock.calls[0][1]
    expect(updateCall.forgedPieces.wood.belt.verseResponse).toBe('I will speak truth')
  })

  it('auto-equips the forged piece', async () => {
    let callCount = 0
    mockGetDoc.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          exists: () => true,
          data: () => ({
            childId: 'child-1',
            themeStyle: 'minecraft',
            totalXp: 100,
            forgedPieces: undefined,
            equippedPieces: [],
            unlockedPieces: [],
          }),
        })
      }
      return Promise.resolve({
        exists: () => true,
        data: () => ({ diamondBalance: 80 }),
      })
    })

    await forgeArmorPiece('fam-1', 'child-1', 'wood', 'belt')

    const updateCall = mockSafeUpdateProfile.mock.calls[0][1]
    expect(updateCall.equippedPieces).toContain('belt')
    expect(updateCall.unlockedPieces).toContain('belt')
  })
})
