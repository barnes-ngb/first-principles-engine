import { describe, expect, it } from 'vitest'

import { hasAnyEvidenceToShow } from './weekInEvidence.logic'
import type { WeekEvidence } from '../../core/types'

// ── Fixtures ─────────────────────────────────────────────────────────────

function emptyEvidence(): WeekEvidence {
  return {
    books: {
      booksCreated: [],
      booksCompleted: [],
      readingSessions: { count: 0, totalMinutes: 0, booksRead: [] },
    },
    teachBacks: {
      count: 0,
      bySubject: {},
      audioCount: 0,
      textCount: 0,
      examples: [],
    },
  }
}

// ── hasAnyEvidenceToShow ─────────────────────────────────────────────────

describe('hasAnyEvidenceToShow', () => {
  it('returns false when all evidence fields are empty', () => {
    expect(hasAnyEvidenceToShow(emptyEvidence())).toBe(false)
  })

  it('returns true when booksCreated is non-empty', () => {
    const evidence = emptyEvidence()
    evidence.books.booksCreated = [
      { title: 'My Story', pages: 4, isAiGenerated: false },
    ]
    expect(hasAnyEvidenceToShow(evidence)).toBe(true)
  })

  it('returns true when booksCompleted is non-empty', () => {
    const evidence = emptyEvidence()
    evidence.books.booksCompleted = [{ title: "Charlotte's Web" }]
    expect(hasAnyEvidenceToShow(evidence)).toBe(true)
  })

  it('returns true when readingSessions count is positive', () => {
    const evidence = emptyEvidence()
    evidence.books.readingSessions = {
      count: 3,
      totalMinutes: 45,
      booksRead: [],
    }
    expect(hasAnyEvidenceToShow(evidence)).toBe(true)
  })

  it('returns true when teachBacks count is positive', () => {
    const evidence = emptyEvidence()
    evidence.teachBacks = {
      count: 2,
      bySubject: { Math: 1, Reading: 1 },
      audioCount: 1,
      textCount: 1,
      examples: [],
    }
    expect(hasAnyEvidenceToShow(evidence)).toBe(true)
  })

  it('returns true when multiple evidence fields are populated', () => {
    const evidence = emptyEvidence()
    evidence.books.booksCreated = [
      { title: 'Dino Book', pages: 6, isAiGenerated: false },
    ]
    evidence.teachBacks = {
      count: 1,
      bySubject: { Science: 1 },
      audioCount: 1,
      textCount: 0,
      examples: [],
    }
    expect(hasAnyEvidenceToShow(evidence)).toBe(true)
  })

  it('returns false when readingSessions has zero count despite booksRead entries', () => {
    const evidence = emptyEvidence()
    evidence.books.readingSessions = {
      count: 0,
      totalMinutes: 0,
      booksRead: [{ title: 'Phantom Book', totalMinutes: 0 }],
    }
    expect(hasAnyEvidenceToShow(evidence)).toBe(false)
  })

  it('returns false when teachBacks count is 0 even with bySubject data', () => {
    const evidence = emptyEvidence()
    evidence.teachBacks = {
      count: 0,
      bySubject: { Math: 0 },
      audioCount: 0,
      textCount: 0,
      examples: [],
    }
    expect(hasAnyEvidenceToShow(evidence)).toBe(false)
  })
})
