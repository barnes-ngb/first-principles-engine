import { describe, expect, it } from 'vitest'
import { ensureNewProfileStructure } from './checkAndUnlockArmor'

// ── ensureNewProfileStructure (pure migration logic) ──────────────────

describe('ensureNewProfileStructure', () => {
  it('passes through a profile with existing pieces array', () => {
    const raw = {
      childId: 'child-1',
      themeStyle: 'minecraft',
      pieces: [
        {
          pieceId: 'belt_of_truth',
          unlockedTiers: ['stone'],
          generatedImageUrls: { stone: 'url-1' },
        },
      ],
      equippedPieces: ['belt'],
      totalXp: 100,
      updatedAt: '2026-01-01',
    }
    const result = ensureNewProfileStructure(raw)
    expect(result.childId).toBe('child-1')
    expect(result.pieces).toHaveLength(1)
    expect(result.pieces[0].pieceId).toBe('belt_of_truth')
    expect(result.pieces[0].unlockedTiers).toEqual(['stone'])
  })

  it('initializes equippedPieces to empty array when missing', () => {
    const raw = {
      childId: 'child-1',
      themeStyle: 'minecraft',
      pieces: [],
      totalXp: 0,
      updatedAt: '2026-01-01',
    }
    const result = ensureNewProfileStructure(raw)
    expect(result.equippedPieces).toEqual([])
  })

  it('guards null unlockedTiers within pieces', () => {
    const raw = {
      childId: 'child-1',
      themeStyle: 'minecraft',
      pieces: [
        {
          pieceId: 'belt_of_truth',
          unlockedTiers: null,
          generatedImageUrls: {},
        },
      ],
      totalXp: 0,
      updatedAt: '2026-01-01',
    }
    const result = ensureNewProfileStructure(raw)
    expect(result.pieces[0].unlockedTiers).toEqual([])
  })

  it('guards null piece entries in the pieces array', () => {
    const raw = {
      childId: 'child-1',
      themeStyle: 'minecraft',
      pieces: [null, { pieceId: 'helmet_of_salvation', unlockedTiers: ['stone'], generatedImageUrls: {} }],
      totalXp: 0,
      updatedAt: '2026-01-01',
    }
    const result = ensureNewProfileStructure(raw)
    expect(result.pieces).toHaveLength(2)
    expect(result.pieces[0].unlockedTiers).toEqual([])
    expect(result.pieces[1].pieceId).toBe('helmet_of_salvation')
  })

  it('migrates legacy unlockedPieces format to pieces array for minecraft theme', () => {
    const raw = {
      childId: 'child-1',
      themeStyle: 'minecraft',
      unlockedPieces: ['belt_of_truth', 'helmet_of_salvation'],
      generatedImageUrls: {
        belt_of_truth: 'belt-url',
        helmet_of_salvation: 'helmet-url',
      },
      totalXp: 200,
      updatedAt: '2026-01-01',
    }
    const result = ensureNewProfileStructure(raw)
    expect(result.pieces).toHaveLength(2)
    expect(result.pieces[0].pieceId).toBe('belt_of_truth')
    expect(result.pieces[0].unlockedTiers).toEqual(['stone'])
    expect(result.pieces[0].generatedImageUrls.stone).toBe('belt-url')
    expect(result.pieces[1].pieceId).toBe('helmet_of_salvation')
    expect(result.pieces[1].unlockedTiers).toEqual(['stone'])
  })

  it('migrates legacy unlockedPieces format for platformer theme', () => {
    const raw = {
      childId: 'child-2',
      themeStyle: 'platformer',
      unlockedPieces: ['shield_of_faith'],
      generatedImageUrls: {
        shield_of_faith: 'shield-url',
      },
      totalXp: 50,
      updatedAt: '2026-01-01',
    }
    const result = ensureNewProfileStructure(raw)
    expect(result.pieces).toHaveLength(1)
    expect(result.pieces[0].pieceId).toBe('shield_of_faith')
    expect(result.pieces[0].unlockedTiers).toEqual([])
    expect(result.pieces[0].unlockedTiersPlatformer).toEqual(['basic'])
    expect(result.pieces[0].generatedImageUrls.basic).toBe('shield-url')
    expect(result.currentTier).toBe('basic')
  })

  it('handles raw data with no unlockedPieces and no pieces (brand new profile)', () => {
    const raw = {
      childId: 'child-1',
      totalXp: 0,
      updatedAt: '2026-01-01',
    }
    const result = ensureNewProfileStructure(raw)
    expect(result.childId).toBe('child-1')
    expect(result.themeStyle).toBe('minecraft')
    expect(result.pieces).toEqual([])
    expect(result.totalXp).toBe(0)
    expect(result.currentTier).toBe('wood')
  })

  it('preserves starterImageUrl as baseCharacterUrl', () => {
    const raw = {
      childId: 'child-1',
      starterImageUrl: 'starter-url',
      totalXp: 0,
      updatedAt: '2026-01-01',
    }
    const result = ensureNewProfileStructure(raw)
    expect(result.baseCharacterUrl).toBe('starter-url')
  })

  it('preserves photoTransformUrl', () => {
    const raw = {
      childId: 'child-1',
      photoTransformUrl: 'photo-url',
      totalXp: 0,
      updatedAt: '2026-01-01',
    }
    const result = ensureNewProfileStructure(raw)
    expect(result.photoTransformUrl).toBe('photo-url')
  })

  it('defaults totalXp to 0 when missing', () => {
    const raw = { childId: 'child-1' }
    const result = ensureNewProfileStructure(raw)
    expect(result.totalXp).toBe(0)
  })

  it('treats non-array pieces field as missing (Firestore map edge case)', () => {
    const raw = {
      childId: 'child-1',
      themeStyle: 'minecraft',
      pieces: { 0: { pieceId: 'belt_of_truth' } },
      totalXp: 0,
      updatedAt: '2026-01-01',
    }
    const result = ensureNewProfileStructure(raw)
    expect(result.pieces).toEqual([])
  })

  it('preserves unlockedTiersPlatformer when present in pieces', () => {
    const raw = {
      childId: 'child-1',
      themeStyle: 'platformer',
      pieces: [
        {
          pieceId: 'belt_of_truth',
          unlockedTiers: [],
          unlockedTiersPlatformer: ['basic', 'power'],
          generatedImageUrls: {},
        },
      ],
      totalXp: 100,
      updatedAt: '2026-01-01',
    }
    const result = ensureNewProfileStructure(raw)
    expect(result.pieces[0].unlockedTiersPlatformer).toEqual(['basic', 'power'])
  })

  it('omits unlockedTiersPlatformer when it was undefined (minecraft profiles)', () => {
    const raw = {
      childId: 'child-1',
      themeStyle: 'minecraft',
      pieces: [
        {
          pieceId: 'belt_of_truth',
          unlockedTiers: ['stone'],
          generatedImageUrls: {},
        },
      ],
      totalXp: 100,
      updatedAt: '2026-01-01',
    }
    const result = ensureNewProfileStructure(raw)
    expect(result.pieces[0].unlockedTiersPlatformer).toBeUndefined()
  })
})
