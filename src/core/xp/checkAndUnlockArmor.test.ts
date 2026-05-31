import { describe, expect, it, vi } from 'vitest'

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
}))

vi.mock('../firebase/firestore', () => ({
  avatarProfilesCollection: vi.fn(),
  xpLedgerCollection: vi.fn(),
}))

vi.mock('../../features/avatar/normalizeProfile', () => ({
  normalizeAvatarProfile: (data: unknown) => data,
}))

vi.mock('../../features/avatar/armorTierProgress', () => ({
  deriveUnlockedTiersFromForged: () => ['wood'],
  getActiveForgeTierFromProgress: () => 'wood',
}))

vi.mock('../../features/avatar/safeProfileWrite', () => ({
  safeSetProfile: vi.fn(),
}))

vi.mock('../../features/avatar/voxel/buildArmorPiece', () => ({
  XP_THRESHOLDS: {
    belt: 50,
    helmet: 100,
    boots: 150,
    shield: 200,
    breastplate: 300,
    sword: 400,
  },
}))

import { ensureNewProfileStructure } from './checkAndUnlockArmor'

describe('ensureNewProfileStructure', () => {
  it('passes through a modern profile with pieces array', () => {
    const input = {
      childId: 'lincoln',
      themeStyle: 'minecraft',
      pieces: [
        { pieceId: 'belt_of_truth', unlockedTiers: ['stone'], generatedImageUrls: {} },
      ],
      equippedPieces: ['belt'],
      totalXp: 200,
      updatedAt: '2026-01-01',
    }

    const result = ensureNewProfileStructure(input as Record<string, unknown>)
    expect(result.childId).toBe('lincoln')
    expect(result.pieces).toHaveLength(1)
    expect(result.pieces[0].pieceId).toBe('belt_of_truth')
    expect(result.pieces[0].unlockedTiers).toEqual(['stone'])
    expect(result.equippedPieces).toEqual(['belt'])
  })

  it('ensures equippedPieces defaults to empty array if not an array', () => {
    const input = {
      childId: 'lincoln',
      themeStyle: 'minecraft',
      pieces: [{ pieceId: 'belt_of_truth', unlockedTiers: ['stone'], generatedImageUrls: {} }],
      totalXp: 100,
      updatedAt: '2026-01-01',
    }

    const result = ensureNewProfileStructure(input as Record<string, unknown>)
    expect(Array.isArray(result.equippedPieces)).toBe(true)
    expect(result.equippedPieces).toEqual([])
  })

  it('handles null entries in pieces array', () => {
    const input = {
      childId: 'lincoln',
      themeStyle: 'minecraft',
      pieces: [null, { pieceId: 'belt_of_truth', unlockedTiers: ['stone'] }],
      equippedPieces: [],
      totalXp: 100,
      updatedAt: '2026-01-01',
    }

    const result = ensureNewProfileStructure(input as Record<string, unknown>)
    expect(result.pieces).toHaveLength(2)
    expect(result.pieces[0].pieceId).toBe('unknown')
    expect(result.pieces[0].unlockedTiers).toEqual([])
    expect(result.pieces[1].pieceId).toBe('belt_of_truth')
  })

  it('ensures unlockedTiers defaults to empty array when not array', () => {
    const input = {
      childId: 'test',
      themeStyle: 'minecraft',
      pieces: [
        { pieceId: 'helmet_of_salvation', unlockedTiers: undefined, generatedImageUrls: {} },
      ],
      equippedPieces: [],
      totalXp: 50,
      updatedAt: '2026-01-01',
    }

    const result = ensureNewProfileStructure(input as Record<string, unknown>)
    expect(result.pieces[0].unlockedTiers).toEqual([])
  })

  it('migrates legacy profile (unlockedPieces + generatedImageUrls → pieces)', () => {
    const input = {
      childId: 'lincoln',
      themeStyle: 'minecraft',
      unlockedPieces: ['belt_of_truth', 'helmet_of_salvation'],
      generatedImageUrls: {
        belt_of_truth: 'https://example.com/belt.png',
        helmet_of_salvation: 'https://example.com/helmet.png',
      },
      totalXp: 300,
      updatedAt: '2026-01-01',
    }

    const result = ensureNewProfileStructure(input as Record<string, unknown>)
    expect(result.pieces).toHaveLength(2)
    expect(result.pieces[0].pieceId).toBe('belt_of_truth')
    expect(result.pieces[0].unlockedTiers).toEqual(['stone'])
    expect(result.pieces[0].generatedImageUrls).toEqual({
      stone: 'https://example.com/belt.png',
    })
    expect(result.pieces[1].pieceId).toBe('helmet_of_salvation')
  })

  it('migrates legacy platformer profile with basic tier', () => {
    const input = {
      childId: 'london',
      themeStyle: 'platformer',
      unlockedPieces: ['shield_of_faith'],
      generatedImageUrls: { shield_of_faith: 'https://example.com/shield.png' },
      totalXp: 100,
      updatedAt: '2026-01-01',
    }

    const result = ensureNewProfileStructure(input as Record<string, unknown>)
    expect(result.pieces).toHaveLength(1)
    expect(result.pieces[0].unlockedTiers).toEqual([])
    expect(result.pieces[0].unlockedTiersPlatformer).toEqual(['basic'])
    expect(result.pieces[0].generatedImageUrls).toEqual({
      basic: 'https://example.com/shield.png',
    })
    expect(result.currentTier).toBe('basic')
  })

  it('handles missing unlockedPieces in legacy path (empty pieces)', () => {
    const input = {
      childId: 'test',
      themeStyle: 'minecraft',
      totalXp: 50,
      updatedAt: '2026-01-01',
    }

    const result = ensureNewProfileStructure(input as Record<string, unknown>)
    expect(result.pieces).toEqual([])
    expect(result.childId).toBe('test')
    expect(result.totalXp).toBe(50)
  })

  it('preserves starterImageUrl as baseCharacterUrl during migration', () => {
    const input = {
      childId: 'test',
      themeStyle: 'minecraft',
      starterImageUrl: 'https://example.com/starter.png',
      totalXp: 0,
      updatedAt: '2026-01-01',
    }

    const result = ensureNewProfileStructure(input as Record<string, unknown>)
    expect(result.baseCharacterUrl).toBe('https://example.com/starter.png')
  })

  it('preserves photoTransformUrl during migration', () => {
    const input = {
      childId: 'test',
      themeStyle: 'minecraft',
      photoTransformUrl: 'https://example.com/photo.png',
      totalXp: 0,
      updatedAt: '2026-01-01',
    }

    const result = ensureNewProfileStructure(input as Record<string, unknown>)
    expect(result.photoTransformUrl).toBe('https://example.com/photo.png')
  })

  it('resets pieces when the field is a non-array (e.g. Firestore map)', () => {
    const input = {
      childId: 'test',
      themeStyle: 'minecraft',
      pieces: { belt: { unlockedTiers: ['stone'] } },
      unlockedPieces: ['belt_of_truth'],
      generatedImageUrls: { belt_of_truth: 'url' },
      totalXp: 100,
      updatedAt: '2026-01-01',
    }

    const result = ensureNewProfileStructure(input as Record<string, unknown>)
    // Should fall through to the legacy migration path
    expect(Array.isArray(result.pieces)).toBe(true)
    expect(result.pieces[0].pieceId).toBe('belt_of_truth')
  })

  it('defaults totalXp to 0 when missing', () => {
    const input = {
      childId: 'test',
      themeStyle: 'minecraft',
    }

    const result = ensureNewProfileStructure(input as Record<string, unknown>)
    expect(result.totalXp).toBe(0)
  })

  it('defaults currentTier to wood for minecraft', () => {
    const input = {
      childId: 'test',
      themeStyle: 'minecraft',
      totalXp: 0,
      updatedAt: '2026-01-01',
    }

    const result = ensureNewProfileStructure(input as Record<string, unknown>)
    expect(result.currentTier).toBe('wood')
  })
})
