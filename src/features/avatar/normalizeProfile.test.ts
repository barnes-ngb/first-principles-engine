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

import { normalizeAvatarProfile } from './normalizeProfile'

describe('normalizeAvatarProfile', () => {
  it('returns default profile for null input', () => {
    const profile = normalizeAvatarProfile(null)
    expect(profile.childId).toBe('')
    expect(profile.themeStyle).toBe('minecraft')
    expect(profile.totalXp).toBe(0)
    expect(profile.equippedPieces).toEqual([])
    expect(profile.pieces).toEqual([])
    expect(profile.unlockedPieces).toEqual([])
  })

  it('returns default profile for undefined input', () => {
    const profile = normalizeAvatarProfile(undefined)
    expect(profile.childId).toBe('')
    expect(profile.totalXp).toBe(0)
  })

  it('returns default profile for non-object input', () => {
    const profile = normalizeAvatarProfile('string-input')
    expect(profile.childId).toBe('')
  })

  it('preserves childId and themeStyle', () => {
    const profile = normalizeAvatarProfile({
      childId: 'lincoln',
      themeStyle: 'minecraft',
    })
    expect(profile.childId).toBe('lincoln')
    expect(profile.themeStyle).toBe('minecraft')
  })

  it('defaults themeStyle to minecraft when missing', () => {
    const profile = normalizeAvatarProfile({ childId: 'test' })
    expect(profile.themeStyle).toBe('minecraft')
  })

  it('defaults totalXp to 0 when missing', () => {
    const profile = normalizeAvatarProfile({ childId: 'test' })
    expect(profile.totalXp).toBe(0)
  })

  it('preserves numeric totalXp', () => {
    const profile = normalizeAvatarProfile({ childId: 'test', totalXp: 500 })
    expect(profile.totalXp).toBe(500)
  })

  it('defaults totalXp to 0 when non-numeric', () => {
    const profile = normalizeAvatarProfile({ childId: 'test', totalXp: 'lots' })
    expect(profile.totalXp).toBe(0)
  })

  it('ensures equippedPieces is always an array', () => {
    const profile = normalizeAvatarProfile({ childId: 'test', equippedPieces: null })
    expect(Array.isArray(profile.equippedPieces)).toBe(true)
    expect(profile.equippedPieces).toEqual([])
  })

  it('preserves equippedPieces array', () => {
    const profile = normalizeAvatarProfile({
      childId: 'test',
      equippedPieces: ['belt', 'helmet'],
    })
    expect(profile.equippedPieces).toEqual(['belt', 'helmet'])
  })

  it('ensures pieces is always an array', () => {
    const profile = normalizeAvatarProfile({ childId: 'test' })
    expect(Array.isArray(profile.pieces)).toBe(true)
  })

  it('normalizes piece entries within pieces array', () => {
    const profile = normalizeAvatarProfile({
      childId: 'test',
      pieces: [
        { pieceId: 'belt_of_truth', unlockedTiers: ['stone'] },
      ],
    })
    expect(profile.pieces).toHaveLength(1)
    expect(profile.pieces[0].pieceId).toBe('belt_of_truth')
    expect(profile.pieces[0].unlockedTiers).toEqual(['stone'])
    expect(profile.pieces[0].generatedImageUrls).toBeDefined()
  })

  it('handles null entries in pieces array', () => {
    const profile = normalizeAvatarProfile({
      childId: 'test',
      pieces: [null, { pieceId: 'belt_of_truth' }],
    })
    expect(profile.pieces).toHaveLength(2)
    expect(profile.pieces[0].pieceId).toBe('unknown')
    expect(profile.pieces[0].unlockedTiers).toEqual([])
  })

  it('ensures unlockedPieces is always an array', () => {
    const profile = normalizeAvatarProfile({ childId: 'test', unlockedPieces: undefined })
    expect(Array.isArray(profile.unlockedPieces)).toBe(true)
    expect(profile.unlockedPieces).toEqual([])
  })

  it('defaults characterFeatures when missing', () => {
    const profile = normalizeAvatarProfile({ childId: 'test' })
    expect(profile.characterFeatures).toBeDefined()
    expect(profile.characterFeatures.skinTone).toBeTruthy()
    expect(profile.characterFeatures.hairColor).toBeTruthy()
    expect(profile.characterFeatures.hairStyle).toBeTruthy()
  })

  it('preserves characterFeatures when provided', () => {
    const features = {
      skinTone: '#AA8866',
      hairColor: '#222222',
      hairStyle: 'short',
      hairLength: 'above_ear',
      eyeColor: '#00FF00',
    }
    const profile = normalizeAvatarProfile({
      childId: 'test',
      characterFeatures: features,
    })
    expect(profile.characterFeatures.skinTone).toBe('#AA8866')
    expect(profile.characterFeatures.hairStyle).toBe('short')
  })

  it('defaults ageGroup to older', () => {
    const profile = normalizeAvatarProfile({ childId: 'test' })
    expect(profile.ageGroup).toBe('older')
  })

  it('preserves ageGroup when set', () => {
    const profile = normalizeAvatarProfile({ childId: 'test', ageGroup: 'younger' })
    expect(profile.ageGroup).toBe('younger')
  })

  it('defaults armorStreak to 0', () => {
    const profile = normalizeAvatarProfile({ childId: 'test' })
    expect(profile.armorStreak).toBe(0)
  })

  it('preserves armorStreak when numeric', () => {
    const profile = normalizeAvatarProfile({ childId: 'test', armorStreak: 7 })
    expect(profile.armorStreak).toBe(7)
  })

  it('preserves legacy fields (baseCharacterUrl, photoTransformUrl)', () => {
    const profile = normalizeAvatarProfile({
      childId: 'test',
      baseCharacterUrl: 'https://example.com/base.png',
      photoTransformUrl: 'https://example.com/photo.png',
    })
    expect(profile.baseCharacterUrl).toBe('https://example.com/base.png')
    expect(profile.photoTransformUrl).toBe('https://example.com/photo.png')
  })

  it('auto-migrates equippedPieces to forgedPieces at wood tier', () => {
    const profile = normalizeAvatarProfile({
      childId: 'test',
      equippedPieces: ['belt', 'helmet'],
    })
    expect(profile.forgedPieces).toBeDefined()
    expect(profile.forgedPieces?.wood?.belt).toBeDefined()
    expect(profile.forgedPieces?.wood?.helmet).toBeDefined()
  })

  it('does not overwrite existing forgedPieces', () => {
    const profile = normalizeAvatarProfile({
      childId: 'test',
      equippedPieces: ['belt'],
      forgedPieces: {
        stone: { belt: { forgedAt: '2026-01-01' } },
      },
    })
    expect(profile.forgedPieces?.stone?.belt).toBeDefined()
  })

  it('derives unlockedTiers from forgedPieces', () => {
    const profile = normalizeAvatarProfile({
      childId: 'test',
      totalXp: 200,
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
    })
    expect(profile.unlockedTiers).toContain('wood')
    expect(profile.unlockedTiers).toContain('stone')
  })

  it('preserves faceGrid when 64 elements', () => {
    const grid = Array.from({ length: 64 }, () => '#000000')
    const profile = normalizeAvatarProfile({
      childId: 'test',
      faceGrid: grid,
    })
    expect(profile.faceGrid).toEqual(grid)
  })

  it('discards faceGrid when wrong length', () => {
    const profile = normalizeAvatarProfile({
      childId: 'test',
      faceGrid: ['#000000', '#111111'],
    })
    expect(profile.faceGrid).toBeUndefined()
  })

  it('preserves customization when valid', () => {
    const profile = normalizeAvatarProfile({
      childId: 'test',
      customization: {
        shirtColor: '#FF0000',
        pantsColor: '#0000FF',
      },
    })
    expect(profile.customization?.shirtColor).toBe('#FF0000')
    expect(profile.customization?.pantsColor).toBe('#0000FF')
  })

  it('handles updatedAt defaulting', () => {
    const profile = normalizeAvatarProfile({ childId: 'test' })
    expect(profile.updatedAt).toBeDefined()
    expect(profile.updatedAt.length).toBeGreaterThan(0)
  })
})
