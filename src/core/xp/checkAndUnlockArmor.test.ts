import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { ArmorPiece, ArmorTier, AvatarProfile } from '../types'

// ── Mock Firestore ─────────────────────────────────────────────
const mockGetDoc = vi.fn()
const mockDoc = vi.fn((..._args: unknown[]) => `mock-doc-${_args.join('-')}`)

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
}))

vi.mock('../firebase/firestore', () => ({
  avatarProfilesCollection: (familyId: string) => `avatarProfiles-${familyId}`,
  xpLedgerCollection: (familyId: string) => `xpLedger-${familyId}`,
}))

vi.mock('../../features/avatar/normalizeProfile', () => ({
  normalizeAvatarProfile: (raw: Record<string, unknown>) => ({
    childId: raw.childId ?? '',
    themeStyle: raw.themeStyle ?? 'minecraft',
    totalXp: raw.totalXp ?? 0,
    currentTier: raw.currentTier ?? 'wood',
    equippedPieces: Array.isArray(raw.equippedPieces) ? raw.equippedPieces : [],
    unlockedPieces: Array.isArray(raw.unlockedPieces) ? raw.unlockedPieces : [],
    pieces: Array.isArray(raw.pieces) ? raw.pieces : [],
    forgedPieces: raw.forgedPieces ?? undefined,
    unlockedTiers: Array.isArray(raw.unlockedTiers) ? raw.unlockedTiers : ['wood'],
    updatedAt: raw.updatedAt ?? '2026-01-01',
  }),
}))

vi.mock('../../features/avatar/armorTierProgress', () => ({
  deriveUnlockedTiersFromForged: () => ['wood'],
  getActiveForgeTierFromProgress: () => 'wood',
}))

const mockSafeSetProfile = vi.fn().mockResolvedValue(undefined)
vi.mock('../../features/avatar/safeProfileWrite', () => ({
  safeSetProfile: (...args: unknown[]) => mockSafeSetProfile(...args),
}))

import { checkAndUnlockArmor, ensureNewProfileStructure } from './checkAndUnlockArmor'

// ── ensureNewProfileStructure (pure logic) ─────────────────────

describe('ensureNewProfileStructure', () => {
  it('preserves a profile that already has pieces as an array', () => {
    const raw = {
      childId: 'child-1',
      themeStyle: 'minecraft',
      pieces: [
        { pieceId: 'belt_of_truth', unlockedTiers: ['stone'], generatedImageUrls: {} },
      ],
      totalXp: 200,
      updatedAt: '2026-01-01',
    }

    const result = ensureNewProfileStructure(raw as Record<string, unknown>)

    expect(result.childId).toBe('child-1')
    expect(result.pieces).toHaveLength(1)
    expect(result.pieces[0].pieceId).toBe('belt_of_truth')
    expect(result.pieces[0].unlockedTiers).toEqual(['stone'])
  })

  it('ensures equippedPieces is always an array', () => {
    const raw = {
      childId: 'child-1',
      pieces: [],
      equippedPieces: null,
      totalXp: 0,
      updatedAt: '2026-01-01',
    }

    const result = ensureNewProfileStructure(raw as unknown as Record<string, unknown>)

    expect(Array.isArray(result.equippedPieces)).toBe(true)
    expect(result.equippedPieces).toEqual([])
  })

  it('guards null unlockedTiers inside piece entries', () => {
    const raw = {
      childId: 'child-1',
      pieces: [
        { pieceId: 'belt_of_truth', unlockedTiers: null, generatedImageUrls: {} },
      ],
      totalXp: 0,
      updatedAt: '2026-01-01',
    }

    const result = ensureNewProfileStructure(raw as unknown as Record<string, unknown>)

    expect(Array.isArray(result.pieces[0].unlockedTiers)).toBe(true)
    expect(result.pieces[0].unlockedTiers).toEqual([])
  })

  it('migrates legacy unlockedPieces + generatedImageUrls to pieces array (minecraft)', () => {
    const raw = {
      childId: 'child-1',
      themeStyle: 'minecraft',
      unlockedPieces: ['belt_of_truth', 'shield_of_faith'] as ArmorPiece[],
      generatedImageUrls: {
        belt_of_truth: 'https://example.com/belt.png',
        shield_of_faith: 'https://example.com/shield.png',
      },
      totalXp: 500,
      updatedAt: '2026-01-01',
    }

    const result = ensureNewProfileStructure(raw as unknown as Record<string, unknown>)

    expect(result.pieces).toHaveLength(2)

    const belt = result.pieces.find((p) => p.pieceId === 'belt_of_truth')
    expect(belt).toBeDefined()
    expect(belt!.unlockedTiers).toEqual(['stone'])
    expect(belt!.generatedImageUrls['stone']).toBe('https://example.com/belt.png')

    const shield = result.pieces.find((p) => p.pieceId === 'shield_of_faith')
    expect(shield).toBeDefined()
    expect(shield!.unlockedTiers).toEqual(['stone'])
  })

  it('migrates legacy unlockedPieces to platformer tiers', () => {
    const raw = {
      childId: 'child-2',
      themeStyle: 'platformer',
      unlockedPieces: ['belt_of_truth'] as ArmorPiece[],
      generatedImageUrls: { belt_of_truth: 'https://example.com/belt-plat.png' },
      totalXp: 100,
      updatedAt: '2026-01-01',
    }

    const result = ensureNewProfileStructure(raw as unknown as Record<string, unknown>)

    expect(result.pieces).toHaveLength(1)
    expect(result.pieces[0].unlockedTiers).toEqual([])
    expect(result.pieces[0].unlockedTiersPlatformer).toEqual(['basic'])
    expect(result.pieces[0].generatedImageUrls['basic']).toBe('https://example.com/belt-plat.png')
  })

  it('handles empty legacy data gracefully', () => {
    const raw = {
      childId: 'child-1',
      themeStyle: 'minecraft',
      totalXp: 0,
      updatedAt: '2026-01-01',
    }

    const result = ensureNewProfileStructure(raw as Record<string, unknown>)

    expect(result.pieces).toEqual([])
    expect(result.childId).toBe('child-1')
    expect(result.totalXp).toBe(0)
  })

  it('preserves baseCharacterUrl from starterImageUrl', () => {
    const raw = {
      childId: 'child-1',
      starterImageUrl: 'https://example.com/starter.png',
      totalXp: 0,
      updatedAt: '2026-01-01',
    }

    const result = ensureNewProfileStructure(raw as Record<string, unknown>)

    expect(result.baseCharacterUrl).toBe('https://example.com/starter.png')
  })

  it('resets pieces to undefined when pieces is a non-array object (Firestore map)', () => {
    const raw = {
      childId: 'child-1',
      pieces: { belt: 'not-an-array' },
      totalXp: 0,
      updatedAt: '2026-01-01',
    }

    const result = ensureNewProfileStructure(raw as unknown as Record<string, unknown>)

    expect(result.pieces).toEqual([])
  })

  it('handles null piece entries in the array', () => {
    const raw = {
      childId: 'child-1',
      pieces: [null, { pieceId: 'belt_of_truth', unlockedTiers: ['stone'], generatedImageUrls: {} }],
      totalXp: 0,
      updatedAt: '2026-01-01',
    }

    const result = ensureNewProfileStructure(raw as unknown as Record<string, unknown>)

    expect(result.pieces).toHaveLength(2)
    expect(result.pieces[0].pieceId).toBe('unknown')
    expect(result.pieces[0].unlockedTiers).toEqual([])
    expect(result.pieces[1].pieceId).toBe('belt_of_truth')
  })
})

// ── checkAndUnlockArmor (mocked Firestore) ─────────────────────

describe('checkAndUnlockArmor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty arrays for empty familyId', async () => {
    const result = await checkAndUnlockArmor('', 'child-1')
    expect(result).toEqual({ newlyUnlockedPieces: [], newlyUnlockedVoxelPieces: [] })
    expect(mockGetDoc).not.toHaveBeenCalled()
  })

  it('returns empty arrays for empty childId', async () => {
    const result = await checkAndUnlockArmor('fam-1', '')
    expect(result).toEqual({ newlyUnlockedPieces: [], newlyUnlockedVoxelPieces: [] })
    expect(mockGetDoc).not.toHaveBeenCalled()
  })

  it('creates default profile when none exists and unlocks belt at XP 0', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => false,
      data: () => null,
    })

    const result = await checkAndUnlockArmor('fam-1', 'child-1', 0)

    expect(mockSafeSetProfile).toHaveBeenCalled()
    // belt_of_truth has xpToUnlockStone: 0, so it always unlocks
    expect(result.newlyUnlockedPieces).toContain('belt_of_truth')
    expect(result.newlyUnlockedVoxelPieces).toContain('belt')
  })

  it('unlocks belt_of_truth at stone tier when XP >= 0 (first piece at stone)', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        childId: 'child-1',
        themeStyle: 'minecraft',
        totalXp: 0,
        pieces: [],
        equippedPieces: [],
        unlockedPieces: [],
        unlockedTiers: ['wood'],
      }),
    })

    const result = await checkAndUnlockArmor('fam-1', 'child-1', 10)

    expect(result.newlyUnlockedPieces).toContain('belt_of_truth')
    expect(result.newlyUnlockedVoxelPieces).toContain('belt')
  })

  it('does not unlock pieces already at stone tier', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        childId: 'child-1',
        themeStyle: 'minecraft',
        totalXp: 50,
        pieces: [
          { pieceId: 'belt_of_truth', unlockedTiers: ['stone'] as ArmorTier[], generatedImageUrls: {} },
        ],
        equippedPieces: [],
        unlockedPieces: [],
        unlockedTiers: ['wood'],
      }),
    })

    const result = await checkAndUnlockArmor('fam-1', 'child-1', 50)

    expect(result.newlyUnlockedPieces).not.toContain('belt_of_truth')
  })

  it('unlocks multiple pieces at once when XP covers several thresholds', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        childId: 'child-1',
        themeStyle: 'minecraft',
        totalXp: 0,
        pieces: [],
        equippedPieces: [],
        unlockedPieces: [],
        unlockedTiers: ['wood'],
      }),
    })

    // XP of 500 covers belt (0), breastplate (150), shoes (300), shield (500)
    const result = await checkAndUnlockArmor('fam-1', 'child-1', 500)

    expect(result.newlyUnlockedPieces).toContain('belt_of_truth')
    expect(result.newlyUnlockedPieces).toContain('breastplate_of_righteousness')
    expect(result.newlyUnlockedPieces).toContain('shoes_of_peace')
    expect(result.newlyUnlockedPieces).toContain('shield_of_faith')
    expect(result.newlyUnlockedPieces).not.toContain('helmet_of_salvation')
    expect(result.newlyUnlockedPieces).not.toContain('sword_of_the_spirit')
  })

  it('reads XP from ledger when totalXp not passed', async () => {
    let callCount = 0
    mockGetDoc.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // Profile doc
        return Promise.resolve({
          exists: () => true,
          data: () => ({
            childId: 'child-1',
            themeStyle: 'minecraft',
            totalXp: 0,
            pieces: [],
            equippedPieces: [],
            unlockedPieces: [],
            unlockedTiers: ['wood'],
          }),
        })
      }
      // Ledger cumulative doc
      return Promise.resolve({
        exists: () => true,
        data: () => ({ totalXp: 200 }),
      })
    })

    const result = await checkAndUnlockArmor('fam-1', 'child-1')

    // XP of 200 covers belt (0), breastplate (150)
    expect(result.newlyUnlockedPieces).toContain('belt_of_truth')
    expect(result.newlyUnlockedPieces).toContain('breastplate_of_righteousness')
    expect(result.newlyUnlockedPieces).not.toContain('shoes_of_peace')
  })

  it('falls back to profile totalXp when ledger doc does not exist', async () => {
    let callCount = 0
    mockGetDoc.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          exists: () => true,
          data: () => ({
            childId: 'child-1',
            themeStyle: 'minecraft',
            totalXp: 350,
            pieces: [],
            equippedPieces: [],
            unlockedPieces: [],
            unlockedTiers: ['wood'],
          }),
        })
      }
      return Promise.resolve({ exists: () => false, data: () => null })
    })

    const result = await checkAndUnlockArmor('fam-1', 'child-1')

    // Profile totalXp is 350, covers belt (0), breastplate (150), shoes (300)
    expect(result.newlyUnlockedPieces).toContain('belt_of_truth')
    expect(result.newlyUnlockedPieces).toContain('breastplate_of_righteousness')
    expect(result.newlyUnlockedPieces).toContain('shoes_of_peace')
  })

  it('saves updated profile with new pieces', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        childId: 'child-1',
        themeStyle: 'minecraft',
        totalXp: 0,
        pieces: [],
        equippedPieces: [],
        unlockedPieces: [],
        unlockedTiers: ['wood'],
      }),
    })

    await checkAndUnlockArmor('fam-1', 'child-1', 100)

    expect(mockSafeSetProfile).toHaveBeenCalledTimes(1)
    const savedData = mockSafeSetProfile.mock.calls[0][1]
    expect(savedData.totalXp).toBe(100)
    expect(savedData.pieces.length).toBeGreaterThan(0)
  })
})
