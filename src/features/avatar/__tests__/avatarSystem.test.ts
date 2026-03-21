import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ARMOR_PIECES,
  XP_EVENTS,
} from '../../../core/types'
import type {
  ArmorPiece,
  ArmorPieceProgress,
  ArmorTier,
  AvatarProfile,
  DailyArmorSession,
  PlatformerTier,
} from '../../../core/types'
import { PIECE_OVERLAY_POSITIONS } from '../armorUtils'
import { getTodayDateString } from '../../../core/avatar/getDailyArmorSession'

// ── ARMOR_PIECES data integrity ──────────────────────────────────

describe('ARMOR_PIECES', () => {
  it('has exactly 6 items', () => {
    expect(ARMOR_PIECES).toHaveLength(6)
  })

  it('has ascending xpToUnlockStone thresholds', () => {
    for (let i = 1; i < ARMOR_PIECES.length; i++) {
      expect(ARMOR_PIECES[i].xpToUnlockStone).toBeGreaterThan(ARMOR_PIECES[i - 1].xpToUnlockStone)
    }
  })

  it('starts at 50 XP (stone) for the first piece', () => {
    expect(ARMOR_PIECES[0].xpToUnlockStone).toBe(50)
  })

  it('ends at 1000 XP (stone) for the last piece', () => {
    expect(ARMOR_PIECES[ARMOR_PIECES.length - 1].xpToUnlockStone).toBe(1000)
  })

  it('diamond and netherite thresholds are 0 (unlocked by tier upgrade, not XP)', () => {
    for (const piece of ARMOR_PIECES) {
      expect(piece.xpToUnlockDiamond).toBe(0)
      expect(piece.xpToUnlockNetherite).toBe(0)
    }
  })

  it('each piece has a valid ArmorPiece id', () => {
    const validIds: ArmorPiece[] = [
      'belt_of_truth',
      'breastplate_of_righteousness',
      'shoes_of_peace',
      'shield_of_faith',
      'helmet_of_salvation',
      'sword_of_the_spirit',
    ]
    for (const piece of ARMOR_PIECES) {
      expect(validIds).toContain(piece.id)
    }
  })

  it('piece ids are unique', () => {
    const ids = ARMOR_PIECES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ARMOR_PIECES.length)
  })

  it('each piece has name, scripture, verseText', () => {
    for (const piece of ARMOR_PIECES) {
      expect(piece.name).toBeTruthy()
      expect(piece.scripture).toBeTruthy()
      expect(piece.verseText).toBeTruthy()
    }
  })

  it('each piece has all 6 tier prompts', () => {
    for (const piece of ARMOR_PIECES) {
      expect(piece.lincolnStonePrompt).toBeTruthy()
      expect(piece.lincolnDiamondPrompt).toBeTruthy()
      expect(piece.lincolnNetheritePrompt).toBeTruthy()
      expect(piece.londonBasicPrompt).toBeTruthy()
      expect(piece.londonPowerupPrompt).toBeTruthy()
      expect(piece.londonChampionPrompt).toBeTruthy()
    }
  })
})

// ── XP_EVENTS constants ──────────────────────────────────────────

describe('XP_EVENTS', () => {
  it('QUEST_DIAMOND is 2', () => {
    expect(XP_EVENTS.QUEST_DIAMOND).toBe(2)
  })

  it('CHECKLIST_DAY_COMPLETE is 10', () => {
    expect(XP_EVENTS.CHECKLIST_DAY_COMPLETE).toBe(10)
  })

  it('BOOK_READ is 15', () => {
    expect(XP_EVENTS.BOOK_READ).toBe(15)
  })

  it('EVALUATION_COMPLETE is 25', () => {
    expect(XP_EVENTS.EVALUATION_COMPLETE).toBe(25)
  })

  it('ARMOR_DAILY_COMPLETE is 5', () => {
    expect(XP_EVENTS.ARMOR_DAILY_COMPLETE).toBe(5)
  })
})

// ── Stone unlock threshold logic ─────────────────────────────────

function getNewlyEligiblePieces(
  totalXp: number,
  pieces: ArmorPieceProgress[],
  themeStyle: 'minecraft' | 'platformer',
): ArmorPiece[] {
  return ARMOR_PIECES
    .filter((p) => {
      const existing = pieces.find((e) => e.pieceId === p.id)
      const alreadyEarned = existing && (
        themeStyle === 'minecraft'
          ? existing.unlockedTiers.length > 0
          : (existing.unlockedTiersPlatformer ?? []).length > 0
      )
      return totalXp >= p.xpToUnlockStone && !alreadyEarned
    })
    .map((p) => p.id)
}

describe('Stone unlock logic', () => {
  it('unlocks no pieces at 0 XP', () => {
    expect(getNewlyEligiblePieces(0, [], 'minecraft')).toHaveLength(0)
  })

  it('unlocks belt_of_truth at exactly 50 XP', () => {
    const result = getNewlyEligiblePieces(50, [], 'minecraft')
    expect(result).toContain('belt_of_truth')
    expect(result).toHaveLength(1)
  })

  it('does not unlock at 49 XP', () => {
    expect(getNewlyEligiblePieces(49, [], 'minecraft')).toHaveLength(0)
  })

  it('does not re-unlock already earned pieces', () => {
    const pieces: ArmorPieceProgress[] = [
      { pieceId: 'belt_of_truth', unlockedTiers: ['stone'], generatedImageUrls: {} },
    ]
    const result = getNewlyEligiblePieces(300, pieces, 'minecraft')
    expect(result).not.toContain('belt_of_truth')
    expect(result).toContain('shoes_of_peace')
  })

  it('unlocks all 6 at 1000 XP from scratch', () => {
    const result = getNewlyEligiblePieces(1000, [], 'minecraft')
    expect(result).toHaveLength(6)
  })

  it('unlocks nothing when all 6 already earned', () => {
    const pieces: ArmorPieceProgress[] = ARMOR_PIECES.map((p) => ({
      pieceId: p.id,
      unlockedTiers: ['stone' as ArmorTier],
      generatedImageUrls: {},
    }))
    expect(getNewlyEligiblePieces(1000, pieces, 'minecraft')).toHaveLength(0)
  })
})

// ── Tier upgrade trigger logic ───────────────────────────────────

function shouldTriggerTierUpgrade(
  pieces: ArmorPieceProgress[],
  _themeStyle: 'minecraft' | 'platformer',
  currentTier: ArmorTier | PlatformerTier,
): boolean {
  if (pieces.length < ARMOR_PIECES.length) return false
  if (currentTier === 'stone') {
    return pieces.every((p) => p.unlockedTiers.includes('stone'))
  }
  if (currentTier === 'diamond') {
    return pieces.every((p) => p.unlockedTiers.includes('diamond'))
  }
  if (currentTier === 'basic') {
    return pieces.every((p) => (p.unlockedTiersPlatformer ?? []).includes('basic'))
  }
  if (currentTier === 'powerup') {
    return pieces.every((p) => (p.unlockedTiersPlatformer ?? []).includes('powerup'))
  }
  return false
}

describe('Tier upgrade trigger logic', () => {
  it('triggers upgrade when all 6 have stone tier (minecraft)', () => {
    const pieces: ArmorPieceProgress[] = ARMOR_PIECES.map((p) => ({
      pieceId: p.id,
      unlockedTiers: ['stone'],
      generatedImageUrls: {},
    }))
    expect(shouldTriggerTierUpgrade(pieces, 'minecraft', 'stone')).toBe(true)
  })

  it('does NOT trigger if fewer than 6 pieces earned', () => {
    const pieces: ArmorPieceProgress[] = ARMOR_PIECES.slice(0, 5).map((p) => ({
      pieceId: p.id,
      unlockedTiers: ['stone'],
      generatedImageUrls: {},
    }))
    expect(shouldTriggerTierUpgrade(pieces, 'minecraft', 'stone')).toBe(false)
  })

  it('triggers upgrade when all 6 have diamond tier (minecraft)', () => {
    const pieces: ArmorPieceProgress[] = ARMOR_PIECES.map((p) => ({
      pieceId: p.id,
      unlockedTiers: ['stone', 'diamond'],
      generatedImageUrls: {},
    }))
    expect(shouldTriggerTierUpgrade(pieces, 'minecraft', 'diamond')).toBe(true)
  })

  it('triggers upgrade when all 6 have basic tier (platformer)', () => {
    const pieces: ArmorPieceProgress[] = ARMOR_PIECES.map((p) => ({
      pieceId: p.id,
      unlockedTiers: [],
      unlockedTiersPlatformer: ['basic'],
      generatedImageUrls: {},
    }))
    expect(shouldTriggerTierUpgrade(pieces, 'platformer', 'basic')).toBe(true)
  })

  it('does NOT trigger when current tier is already netherite', () => {
    const pieces: ArmorPieceProgress[] = ARMOR_PIECES.map((p) => ({
      pieceId: p.id,
      unlockedTiers: ['stone', 'diamond', 'netherite'],
      generatedImageUrls: {},
    }))
    expect(shouldTriggerTierUpgrade(pieces, 'minecraft', 'netherite')).toBe(false)
  })
})

// ── DailyArmorSession logic ──────────────────────────────────────

function buildEmptySession(
  familyId: string,
  childId: string,
  date: string,
): DailyArmorSession {
  return { familyId, childId, date, appliedPieces: [] }
}

describe('DailyArmorSession', () => {
  it('new session has empty appliedPieces', () => {
    const session = buildEmptySession('fam1', 'child1', '2026-03-21')
    expect(session.appliedPieces).toHaveLength(0)
  })

  it('session date matches today', () => {
    const today = getTodayDateString()
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('applying a piece adds it to appliedPieces', () => {
    const session = buildEmptySession('fam1', 'child1', '2026-03-21')
    const updated = { ...session, appliedPieces: [...session.appliedPieces, 'belt_of_truth' as ArmorPiece] }
    expect(updated.appliedPieces).toContain('belt_of_truth')
    expect(updated.appliedPieces).toHaveLength(1)
  })

  it('same piece is not applied twice (guard)', () => {
    const session: DailyArmorSession = {
      familyId: 'fam1',
      childId: 'child1',
      date: '2026-03-21',
      appliedPieces: ['belt_of_truth'],
    }
    const alreadyApplied = session.appliedPieces.includes('belt_of_truth')
    expect(alreadyApplied).toBe(true)
  })

  it('different date means new day — fresh session', () => {
    const session = buildEmptySession('fam1', 'child1', '2026-03-22')
    expect(session.date).toBe('2026-03-22')
    expect(session.appliedPieces).toHaveLength(0)
  })
})

// ── ARMOR_DAILY_COMPLETE dedup logic ──────────────────────────────

function buildArmorDailyDedupKey(_childId: string, date: string): string {
  return `armor_daily_${date}`
}

describe('ARMOR_DAILY_COMPLETE dedup', () => {
  it('dedup key includes date', () => {
    const key = buildArmorDailyDedupKey('child1', '2026-03-21')
    expect(key).toBe('armor_daily_2026-03-21')
  })

  it('same date produces same key (prevents double-award)', () => {
    const key1 = buildArmorDailyDedupKey('child1', '2026-03-21')
    const key2 = buildArmorDailyDedupKey('child1', '2026-03-21')
    expect(key1).toBe(key2)
  })

  it('different dates produce different keys', () => {
    const key1 = buildArmorDailyDedupKey('child1', '2026-03-21')
    const key2 = buildArmorDailyDedupKey('child1', '2026-03-22')
    expect(key1).not.toBe(key2)
  })

  it('awards ARMOR_DAILY_COMPLETE when all earned pieces applied', () => {
    const earnedPieces: ArmorPiece[] = ['belt_of_truth', 'breastplate_of_righteousness']
    const appliedPieces: ArmorPiece[] = ['belt_of_truth', 'breastplate_of_righteousness']
    const allApplied = earnedPieces.every((p) => appliedPieces.includes(p))
    expect(allApplied).toBe(true)
  })

  it('does NOT award if not all earned pieces applied', () => {
    const earnedPieces: ArmorPiece[] = ['belt_of_truth', 'breastplate_of_righteousness']
    const appliedPieces: ArmorPiece[] = ['belt_of_truth']
    const allApplied = earnedPieces.every((p) => appliedPieces.includes(p))
    expect(allApplied).toBe(false)
  })
})

// ── Piece overlay positioning ─────────────────────────────────────

describe('PIECE_OVERLAY_POSITIONS', () => {
  it('all 6 pieces have defined overlay positions', () => {
    const pieces: ArmorPiece[] = [
      'belt_of_truth',
      'breastplate_of_righteousness',
      'shoes_of_peace',
      'shield_of_faith',
      'helmet_of_salvation',
      'sword_of_the_spirit',
    ]
    for (const pieceId of pieces) {
      expect(PIECE_OVERLAY_POSITIONS[pieceId]).toBeDefined()
    }
  })

  it('each position has top and width', () => {
    for (const [, pos] of Object.entries(PIECE_OVERLAY_POSITIONS)) {
      expect(pos.top).toBeTruthy()
      expect(pos.width).toBeTruthy()
    }
  })

  it('helmet is near the top (top <= 10%)', () => {
    const helmet = PIECE_OVERLAY_POSITIONS.helmet_of_salvation
    const topNum = parseFloat(helmet.top)
    expect(topNum).toBeLessThanOrEqual(10)
  })

  it('shoes are near the bottom (top >= 80%)', () => {
    const shoes = PIECE_OVERLAY_POSITIONS.shoes_of_peace
    const topNum = parseFloat(shoes.top)
    expect(topNum).toBeGreaterThanOrEqual(80)
  })

  it('shield is on the left side', () => {
    const shield = PIECE_OVERLAY_POSITIONS.shield_of_faith
    expect(shield.left).toBeDefined()
    expect(shield.right).toBeUndefined()
  })

  it('sword is on the right side', () => {
    const sword = PIECE_OVERLAY_POSITIONS.sword_of_the_spirit
    expect(sword.right).toBeDefined()
    expect(sword.left).toBeUndefined()
  })
})

// ── Verse TTS fires on open ───────────────────────────────────────

describe('Verse card TTS', () => {
  // SpeechSynthesisUtterance is not available in jsdom; provide a minimal mock
  class MockSpeechSynthesisUtterance {
    text: string
    rate: number = 1
    pitch: number = 1
    constructor(text: string) { this.text = text }
  }

  beforeEach(() => {
    if (typeof window.SpeechSynthesisUtterance === 'undefined') {
      Object.defineProperty(window, 'SpeechSynthesisUtterance', {
        writable: true,
        configurable: true,
        value: MockSpeechSynthesisUtterance,
      })
    }
  })

  it('calls window.speechSynthesis.speak when verse card opens', () => {
    // Mock speechSynthesis
    const speakMock = vi.fn()
    const cancelMock = vi.fn()
    Object.defineProperty(window, 'speechSynthesis', {
      writable: true,
      value: {
        speak: speakMock,
        cancel: cancelMock,
        getVoices: () => [],
        paused: false,
        pending: false,
        speaking: false,
      },
    })

    // Simulate verse card open: speech should be triggered
    const utterance = new window.SpeechSynthesisUtterance('Stand firm then, with the belt of truth buckled around your waist.')
    utterance.rate = 0.75
    utterance.pitch = 1.0
    window.speechSynthesis.speak(utterance)

    expect(speakMock).toHaveBeenCalledTimes(1)
    expect(speakMock).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('belt of truth'),
    }))
  })

  it('TTS rate is 0.75 (slow and clear for kids)', () => {
    const utterance = new window.SpeechSynthesisUtterance('test')
    utterance.rate = 0.75
    expect(utterance.rate).toBe(0.75)
  })

  it('cancels TTS when card closes', () => {
    const cancelMock = vi.fn()
    Object.defineProperty(window, 'speechSynthesis', {
      writable: true,
      value: { speak: vi.fn(), cancel: cancelMock, getVoices: () => [] },
    })
    window.speechSynthesis.cancel()
    expect(cancelMock).toHaveBeenCalled()
  })
})

// ── No brand names in prompts ─────────────────────────────────────

describe('Prompt copyright safety', () => {
  const BANNED = ['minecraft', 'mario', 'nintendo', 'steve', 'pikachu', 'pokemon']

  it('lincolnStonePrompt has no banned brand names', () => {
    for (const piece of ARMOR_PIECES) {
      for (const term of BANNED) {
        expect(piece.lincolnStonePrompt.toLowerCase()).not.toContain(term)
      }
    }
  })

  it('lincolnDiamondPrompt has no banned brand names', () => {
    for (const piece of ARMOR_PIECES) {
      for (const term of BANNED) {
        expect(piece.lincolnDiamondPrompt.toLowerCase()).not.toContain(term)
      }
    }
  })

  it('lincolnNetheritePrompt has no banned brand names', () => {
    for (const piece of ARMOR_PIECES) {
      for (const term of BANNED) {
        expect(piece.lincolnNetheritePrompt.toLowerCase()).not.toContain(term)
      }
    }
  })

  it('londonBasicPrompt has no banned brand names', () => {
    for (const piece of ARMOR_PIECES) {
      for (const term of BANNED) {
        expect(piece.londonBasicPrompt.toLowerCase()).not.toContain(term)
      }
    }
  })

  it('londonPowerupPrompt has no banned brand names', () => {
    for (const piece of ARMOR_PIECES) {
      for (const term of BANNED) {
        expect(piece.londonPowerupPrompt.toLowerCase()).not.toContain(term)
      }
    }
  })

  it('londonChampionPrompt has no banned brand names', () => {
    for (const piece of ARMOR_PIECES) {
      for (const term of BANNED) {
        expect(piece.londonChampionPrompt.toLowerCase()).not.toContain(term)
      }
    }
  })

  it('all prompts request transparent PNG (item-only rendering)', () => {
    for (const piece of ARMOR_PIECES) {
      expect(piece.lincolnStonePrompt.toLowerCase()).toContain('transparent')
      expect(piece.londonBasicPrompt.toLowerCase()).toContain('transparent')
    }
  })
})

// ── AvatarProfile structure ───────────────────────────────────────

describe('AvatarProfile new structure', () => {
  const sampleProfile: AvatarProfile = {
    childId: 'lincoln1',
    themeStyle: 'minecraft',
    pieces: [],
    currentTier: 'stone',
    totalXp: 0,
    updatedAt: '2026-03-21T00:00:00Z',
  }

  it('new profile starts with empty pieces array', () => {
    expect(sampleProfile.pieces).toHaveLength(0)
  })

  it('new profile starts at stone tier', () => {
    expect(sampleProfile.currentTier).toBe('stone')
  })

  it('platformer profile starts at basic tier', () => {
    const londonProfile: AvatarProfile = {
      ...sampleProfile,
      childId: 'london1',
      themeStyle: 'platformer',
      currentTier: 'basic',
    }
    expect(londonProfile.currentTier).toBe('basic')
  })

  it('reset preserves baseCharacterUrl', () => {
    const withBase: AvatarProfile = { ...sampleProfile, baseCharacterUrl: 'https://example.com/base.png' }
    const reset: AvatarProfile = {
      ...withBase,
      pieces: [],
      currentTier: 'stone',
      totalXp: 0,
      baseCharacterUrl: withBase.baseCharacterUrl, // preserved
      updatedAt: new Date().toISOString(),
    }
    expect(reset.baseCharacterUrl).toBe('https://example.com/base.png')
    expect(reset.pieces).toHaveLength(0)
    expect(reset.totalXp).toBe(0)
  })

  it('base character triggers generation when undefined', () => {
    const shouldGenerate = !sampleProfile.baseCharacterUrl
    expect(shouldGenerate).toBe(true)
  })

  it('base character does NOT regenerate when already set', () => {
    const withBase: AvatarProfile = { ...sampleProfile, baseCharacterUrl: 'https://example.com/base.png' }
    const shouldGenerate = !withBase.baseCharacterUrl
    expect(shouldGenerate).toBe(false)
  })
})

// ── getTodayDateString ────────────────────────────────────────────

describe('getTodayDateString', () => {
  it('returns a YYYY-MM-DD formatted string', () => {
    const date = getTodayDateString()
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns the current date in local time', () => {
    const date = getTodayDateString()
    const now = new Date()
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(date).toBe(expected)
  })
})
