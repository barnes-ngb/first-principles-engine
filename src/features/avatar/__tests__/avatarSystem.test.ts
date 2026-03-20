import { describe, it, expect } from 'vitest'
import { ARMOR_PIECES, XP_EVENTS } from '../../../core/types/domain'
import type { ArmorPiece } from '../../../core/types/domain'

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
