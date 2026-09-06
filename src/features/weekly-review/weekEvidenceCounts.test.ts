import { describe, expect, it } from 'vitest'

import type { WeekEvidence } from '../../core/types'
import { NO_EVIDENCE_LINE, weekEvidenceCountsLine } from './weekEvidenceCounts'

const evidence = (over: Partial<WeekEvidence> = {}): WeekEvidence =>
  ({
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
    ...over,
  }) as WeekEvidence

const books = (
  created: number,
  completed: number,
  sessions: number,
): WeekEvidence['books'] => ({
  booksCreated: Array.from({ length: created }, (_, i) => ({
    id: `b${i}`,
    title: `Book ${i}`,
    pages: 6,
    isAiGenerated: false,
  })),
  booksCompleted: Array.from({ length: completed }, (_, i) => ({
    title: `Done ${i}`,
  })),
  readingSessions: { count: sessions, totalMinutes: 30, booksRead: [] },
})

const teachBacks = (count: number): WeekEvidence['teachBacks'] => ({
  count,
  bySubject: {},
  audioCount: count,
  textCount: 0,
  examples: [],
})

describe('the evidence line reads as a log, not a report', () => {
  it('lists only what actually happened', () => {
    expect(
      weekEvidenceCountsLine(
        evidence({ books: books(2, 1, 3), teachBacks: teachBacks(2) }),
      ),
    ).toBe('2 books made · 1 book finished · 3 reading sessions · 2 teach-backs.')
  })

  it('drops the segments that are zero rather than printing a row of zeros', () => {
    expect(
      weekEvidenceCountsLine(
        evidence({ books: books(0, 0, 0), teachBacks: teachBacks(1) }),
      ),
    ).toBe('1 teach-back.')
  })

  it('singularises', () => {
    expect(
      weekEvidenceCountsLine(
        evidence({ books: books(1, 0, 1), teachBacks: teachBacks(0) }),
      ),
    ).toBe('1 book made · 1 reading session.')
  })
})

describe('zero is stated plainly, and absence is not zero', () => {
  it('says so when a present summary holds nothing', () => {
    expect(weekEvidenceCountsLine(evidence())).toBe(NO_EVIDENCE_LINE)
  })

  it('says NOTHING when there is no summary to read', () => {
    // The Saturday case: the Sunday cron has not assembled the week yet, so a
    // zero here would be a records claim made on no records — the same rule
    // `weekHours.ts` holds for a failed hours read.
    expect(weekEvidenceCountsLine(undefined)).toBeNull()
  })

  it('is never a target, a ranking or a colour', () => {
    const line = weekEvidenceCountsLine(
      evidence({ books: books(2, 1, 3), teachBacks: teachBacks(2) }),
    )
    expect(line).not.toMatch(/%|goal|target|behind|short|streak|of \d/i)
  })
})

describe('an off-shape stored value degrades instead of printing', () => {
  it('never renders NaN or a negative count', () => {
    const broken = {
      books: {
        booksCreated: 'nope',
        booksCompleted: null,
        readingSessions: { count: Number.NaN, totalMinutes: 0, booksRead: [] },
      },
      teachBacks: { count: -4 },
    } as unknown as WeekEvidence

    expect(weekEvidenceCountsLine(broken)).toBe(NO_EVIDENCE_LINE)
  })

  it('tolerates a summary missing its halves entirely', () => {
    expect(weekEvidenceCountsLine({} as WeekEvidence)).toBe(NO_EVIDENCE_LINE)
  })

  it('floors a fractional count rather than printing it', () => {
    const odd = evidence({ teachBacks: { ...teachBacks(0), count: 2.7 } })
    expect(weekEvidenceCountsLine(odd)).toBe('2 teach-backs.')
  })
})
