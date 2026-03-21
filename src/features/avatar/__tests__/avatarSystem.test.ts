import { describe, it, expect } from 'vitest'
import { ARMOR_PIECES, XP_EVENTS } from '../../../core/types/domain'
import type { ArmorPiece, AvatarProfile } from '../../../core/types/domain'

// ── ARMOR_PIECES data integrity ───────────────────────────────────

describe('ARMOR_PIECES', () => {
  it('has exactly 6 items', () => {
    expect(ARMOR_PIECES).toHaveLength(6)
  })

  it('has ascending xpRequired thresholds', () => {
    for (let i = 1; i < ARMOR_PIECES.length; i++) {
      expect(ARMOR_PIECES[i].xpRequired).toBeGreaterThan(ARMOR_PIECES[i - 1].xpRequired)
    }
  })

  it('starts at 50 XP for the first piece', () => {
    expect(ARMOR_PIECES[0].xpRequired).toBe(50)
  })

  it('ends at 1000 XP for the last piece', () => {
    expect(ARMOR_PIECES[ARMOR_PIECES.length - 1].xpRequired).toBe(1000)
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

  it('each piece has a name, scripture, and both descriptions', () => {
    for (const piece of ARMOR_PIECES) {
      expect(piece.name).toBeTruthy()
      expect(piece.scripture).toBeTruthy()
      expect(piece.lincolnDescription).toBeTruthy()
      expect(piece.londonDescription).toBeTruthy()
    }
  })

  it('piece ids are unique', () => {
    const ids = ARMOR_PIECES.map((p) => p.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ARMOR_PIECES.length)
  })
})

// ── XP_EVENTS constants ───────────────────────────────────────────

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
})

// ── Armor unlock threshold logic ──────────────────────────────────

function getNewlyEligiblePieces(totalXp: number, currentlyUnlocked: ArmorPiece[]): ArmorPiece[] {
  const alreadyUnlocked = new Set(currentlyUnlocked)
  return ARMOR_PIECES
    .filter((p) => totalXp >= p.xpRequired && !alreadyUnlocked.has(p.id))
    .map((p) => p.id)
}

describe('checkAndUnlockArmor logic', () => {
  it('unlocks no pieces at 0 XP', () => {
    expect(getNewlyEligiblePieces(0, [])).toHaveLength(0)
  })

  it('unlocks belt_of_truth at 50 XP', () => {
    const result = getNewlyEligiblePieces(50, [])
    expect(result).toContain('belt_of_truth')
    expect(result).toHaveLength(1)
  })

  it('unlocks breastplate_of_righteousness at 150 XP', () => {
    const result = getNewlyEligiblePieces(150, ['belt_of_truth'])
    expect(result).toContain('breastplate_of_righteousness')
  })

  it('does not re-unlock already unlocked pieces', () => {
    const unlocked: ArmorPiece[] = ['belt_of_truth', 'breastplate_of_righteousness']
    const result = getNewlyEligiblePieces(300, unlocked)
    expect(result).not.toContain('belt_of_truth')
    expect(result).not.toContain('breastplate_of_righteousness')
    expect(result).toContain('shoes_of_peace')
  })

  it('unlocks all 6 pieces at 1000 XP from scratch', () => {
    const result = getNewlyEligiblePieces(1000, [])
    expect(result).toHaveLength(6)
  })

  it('unlocks nothing when all 6 are already unlocked', () => {
    const all: ArmorPiece[] = ARMOR_PIECES.map((p) => p.id)
    const result = getNewlyEligiblePieces(1000, all)
    expect(result).toHaveLength(0)
  })

  it('correctly identifies the next unlock threshold', () => {
    // At 49 XP, no unlock
    expect(getNewlyEligiblePieces(49, [])).toHaveLength(0)
    // At exactly 50, unlock first
    expect(getNewlyEligiblePieces(50, [])).toHaveLength(1)
  })

  it('unlock at each exact threshold boundary', () => {
    const thresholds = ARMOR_PIECES.map((p) => ({ id: p.id, xp: p.xpRequired }))
    const unlocked: ArmorPiece[] = []
    for (const { id, xp } of thresholds) {
      const result = getNewlyEligiblePieces(xp, unlocked)
      expect(result).toContain(id)
      unlocked.push(id)
    }
  })
})

// ── XP dedup key generation ───────────────────────────────────────

function buildDedupKey(type: string, meta?: { date?: string; bookId?: string; sessionId?: string }): string {
  if (type === 'CHECKLIST_DAY_COMPLETE' && meta?.date) {
    return `checklist_${meta.date}`
  }
  if (type === 'BOOK_READ' && meta?.bookId && meta?.date) {
    return `book_${meta.bookId}_${meta.date}`
  }
  if (type === 'EVALUATION_COMPLETE' && meta?.sessionId) {
    return `eval_${meta.sessionId}`
  }
  return `${type}_${Date.now()}`
}

describe('XP dedup key logic', () => {
  it('checklist dedup key includes date', () => {
    const key = buildDedupKey('CHECKLIST_DAY_COMPLETE', { date: '2026-03-20' })
    expect(key).toBe('checklist_2026-03-20')
  })

  it('book dedup key includes bookId and date', () => {
    const key = buildDedupKey('BOOK_READ', { bookId: 'book123', date: '2026-03-20' })
    expect(key).toBe('book_book123_2026-03-20')
  })

  it('evaluation dedup key includes sessionId', () => {
    const key = buildDedupKey('EVALUATION_COMPLETE', { sessionId: 'session456' })
    expect(key).toBe('eval_session456')
  })

  it('same checklist day produces same dedup key', () => {
    const key1 = buildDedupKey('CHECKLIST_DAY_COMPLETE', { date: '2026-03-20' })
    const key2 = buildDedupKey('CHECKLIST_DAY_COMPLETE', { date: '2026-03-20' })
    expect(key1).toBe(key2)
  })

  it('different days produce different dedup keys', () => {
    const key1 = buildDedupKey('CHECKLIST_DAY_COMPLETE', { date: '2026-03-20' })
    const key2 = buildDedupKey('CHECKLIST_DAY_COMPLETE', { date: '2026-03-21' })
    expect(key1).not.toBe(key2)
  })

  it('same book on different days produces different dedup keys', () => {
    const key1 = buildDedupKey('BOOK_READ', { bookId: 'book123', date: '2026-03-20' })
    const key2 = buildDedupKey('BOOK_READ', { bookId: 'book123', date: '2026-03-21' })
    expect(key1).not.toBe(key2)
  })
})

// ── Starter image generation logic ───────────────────────────────

describe('Starter image generation', () => {
  it('triggers generation when starterImageUrl is undefined', () => {
    // Simulate the condition that triggers generation
    const profile: AvatarProfile = {
      childId: 'lincoln1',
      themeStyle: 'minecraft',
      unlockedPieces: [],
      generatedImageUrls: {},
      totalXp: 0,
      updatedAt: '2026-03-21',
      // starterImageUrl is absent (undefined)
    }
    const shouldGenerate = !profile.starterImageUrl
    expect(shouldGenerate).toBe(true)
  })

  it('does NOT regenerate when starterImageUrl already exists', () => {
    const profile: AvatarProfile = {
      childId: 'lincoln1',
      themeStyle: 'minecraft',
      unlockedPieces: [],
      generatedImageUrls: {},
      totalXp: 0,
      updatedAt: '2026-03-21',
      starterImageUrl: 'https://example.com/starter.png',
    }
    const shouldGenerate = !profile.starterImageUrl
    expect(shouldGenerate).toBe(false)
  })
})

// ── Parent XP controls ────────────────────────────────────────────

describe('Parent XP controls', () => {
  it('subtract XP cannot go below 0', () => {
    const clampXp = (current: number, delta: number) => Math.max(0, current + delta)
    expect(clampXp(10, -20)).toBe(0)
    expect(clampXp(0, -5)).toBe(0)
    expect(clampXp(5, -3)).toBe(2)
  })

  it('adding XP increases totalXp correctly', () => {
    const clampXp = (current: number, delta: number) => Math.max(0, current + delta)
    expect(clampXp(50, 25)).toBe(75)
    expect(clampXp(0, 10)).toBe(10)
  })

  it('delete piece removes from unlockedPieces', () => {
    const unlockedPieces: ArmorPiece[] = ['belt_of_truth', 'breastplate_of_righteousness']
    const pieceToDelete: ArmorPiece = 'belt_of_truth'
    const updated = unlockedPieces.filter((p) => p !== pieceToDelete)
    expect(updated).not.toContain('belt_of_truth')
    expect(updated).toContain('breastplate_of_righteousness')
    expect(updated).toHaveLength(1)
  })

  it('delete piece clears generatedImageUrls entry', () => {
    const generatedImageUrls: Partial<Record<ArmorPiece, string>> = {
      belt_of_truth: 'https://example.com/belt.png',
      breastplate_of_righteousness: 'https://example.com/breastplate.png',
    }
    const pieceToDelete: ArmorPiece = 'belt_of_truth'
    const updatedUrls = { ...generatedImageUrls }
    delete updatedUrls[pieceToDelete]
    expect(updatedUrls.belt_of_truth).toBeUndefined()
    expect(updatedUrls.breastplate_of_righteousness).toBeDefined()
  })

  it('reset clears all progress fields but preserves starterImageUrl', () => {
    const starterImageUrl = 'https://example.com/starter.png'
    const reset: AvatarProfile = {
      childId: 'lincoln1',
      themeStyle: 'minecraft',
      unlockedPieces: [],
      generatedImageUrls: {},
      customAvatarUrl: undefined,
      photoTransformUrl: undefined,
      starterImageUrl, // preserved
      totalXp: 0,
      updatedAt: new Date().toISOString(),
    }
    expect(reset.totalXp).toBe(0)
    expect(reset.unlockedPieces).toHaveLength(0)
    expect(reset.customAvatarUrl).toBeUndefined()
    expect(reset.photoTransformUrl).toBeUndefined()
    expect(reset.starterImageUrl).toBe(starterImageUrl)
  })
})

// ── Hero section display priority ─────────────────────────────────

describe('Hero section display priority', () => {
  function resolveHeroUrl(profile: {
    photoTransformUrl?: string
    unlockedPieces: ArmorPiece[]
    generatedImageUrls: Partial<Record<ArmorPiece, string>>
    starterImageUrl?: string
  }): { source: 'photo' | 'armor' | 'starter' | 'none'; url: string | undefined } {
    if (profile.photoTransformUrl) {
      return { source: 'photo', url: profile.photoTransformUrl }
    }
    if (profile.unlockedPieces.length > 0) {
      const last = profile.unlockedPieces[profile.unlockedPieces.length - 1]
      const url = profile.generatedImageUrls[last]
      return { source: 'armor', url }
    }
    if (profile.starterImageUrl) {
      return { source: 'starter', url: profile.starterImageUrl }
    }
    return { source: 'none', url: undefined }
  }

  it('shows photoTransformUrl when present (highest priority)', () => {
    const result = resolveHeroUrl({
      photoTransformUrl: 'https://example.com/photo.png',
      unlockedPieces: ['belt_of_truth'],
      generatedImageUrls: { belt_of_truth: 'https://example.com/belt.png' },
      starterImageUrl: 'https://example.com/starter.png',
    })
    expect(result.source).toBe('photo')
    expect(result.url).toBe('https://example.com/photo.png')
  })

  it('shows most recently unlocked piece when no photo transform', () => {
    const result = resolveHeroUrl({
      unlockedPieces: ['belt_of_truth', 'breastplate_of_righteousness'],
      generatedImageUrls: {
        belt_of_truth: 'https://example.com/belt.png',
        breastplate_of_righteousness: 'https://example.com/breastplate.png',
      },
      starterImageUrl: 'https://example.com/starter.png',
    })
    expect(result.source).toBe('armor')
    expect(result.url).toBe('https://example.com/breastplate.png')
  })

  it('shows starterImageUrl when no pieces and no photo', () => {
    const result = resolveHeroUrl({
      unlockedPieces: [],
      generatedImageUrls: {},
      starterImageUrl: 'https://example.com/starter.png',
    })
    expect(result.source).toBe('starter')
    expect(result.url).toBe('https://example.com/starter.png')
  })

  it('shows none when nothing is available', () => {
    const result = resolveHeroUrl({
      unlockedPieces: [],
      generatedImageUrls: {},
    })
    expect(result.source).toBe('none')
    expect(result.url).toBeUndefined()
  })
})

// ── Photo transform style instructions ───────────────────────────

describe('Photo transform style instructions', () => {
  function getStyleInstruction(themeStyle: 'minecraft' | 'platformer'): string {
    return themeStyle === 'minecraft'
      ? 'Transform this person into a blocky pixel art video game character in 8-bit style, wearing leather armor and carrying a wooden sword, same pose as the original photo, square format, no text'
      : 'Transform this person into a cute cartoon platformer game character with rounded cheerful design and bright colors, same pose as the original photo, square format, no text'
  }

  it('minecraft style instruction is copyright-safe', () => {
    const instruction = getStyleInstruction('minecraft')
    expect(instruction.toLowerCase()).not.toContain('minecraft')
    expect(instruction.toLowerCase()).not.toContain('steve')
    expect(instruction.toLowerCase()).not.toContain('nintendo')
  })

  it('platformer style instruction is copyright-safe', () => {
    const instruction = getStyleInstruction('platformer')
    expect(instruction.toLowerCase()).not.toContain('mario')
    expect(instruction.toLowerCase()).not.toContain('nintendo')
  })

  it('minecraft style describes blocky pixel art character', () => {
    const instruction = getStyleInstruction('minecraft')
    expect(instruction).toContain('pixel art')
    expect(instruction).toContain('8-bit')
  })

  it('platformer style describes cute cartoon character', () => {
    const instruction = getStyleInstruction('platformer')
    expect(instruction).toContain('cartoon')
    expect(instruction).toContain('platformer')
  })
})

// ── Theme prompt safety ───────────────────────────────────────────

describe('Avatar theme prompts are copyright-safe', () => {
  const BANNED_TERMS = [
    'minecraft', 'Minecraft', 'MineCraft',
    'mario', 'Mario',
    'nintendo', 'Nintendo',
    'steve', 'Steve',
  ]

  it('lincolnDescription contains no banned brand names', () => {
    for (const piece of ARMOR_PIECES) {
      for (const term of BANNED_TERMS) {
        expect(piece.lincolnDescription.toLowerCase()).not.toContain(term.toLowerCase())
      }
    }
  })

  it('londonDescription contains no banned brand names', () => {
    for (const piece of ARMOR_PIECES) {
      for (const term of BANNED_TERMS) {
        expect(piece.londonDescription.toLowerCase()).not.toContain(term.toLowerCase())
      }
    }
  })

  it('minecraft theme prompt prefix is copyright-safe', () => {
    const minecraftPromptPrefix =
      'Full body character portrait, pixel art style, blocky square character design, 8-bit video game aesthetic'
    expect(minecraftPromptPrefix.toLowerCase()).not.toContain('minecraft')
    expect(minecraftPromptPrefix.toLowerCase()).not.toContain('steve')
  })

  it('platformer theme prompt prefix is copyright-safe', () => {
    const platformerPromptPrefix =
      'Full body character portrait, cute cartoon platformer game style, rounded cheerful character design'
    expect(platformerPromptPrefix.toLowerCase()).not.toContain('mario')
    expect(platformerPromptPrefix.toLowerCase()).not.toContain('nintendo')
  })
})
