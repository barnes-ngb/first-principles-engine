import { describe, expect, it } from 'vitest'

import type { ChapterQuestionPoolItem } from '../../core/types'
import {
  combinedRemaining,
  countRitualsToGo,
  isChapterDoneToday,
} from './kidRitualRows'
import type { KidRitualFlags } from './kidRitualRows'

// ── isChapterDoneToday ─────────────────────────────────────────

describe('isChapterDoneToday', () => {
  const today = '2026-07-26'

  it('returns true when a question was answered today', () => {
    const pool: ChapterQuestionPoolItem[] = [
      { chapter: 1, questionType: 'comprehension', question: 'Why?', answered: true, answeredDate: today },
      { chapter: 2, questionType: 'comprehension', question: 'What?', answered: false },
    ]
    expect(isChapterDoneToday(pool, today)).toBe(true)
  })

  it('returns false when no question was answered today', () => {
    const pool: ChapterQuestionPoolItem[] = [
      { chapter: 1, questionType: 'comprehension', question: 'Why?', answered: true, answeredDate: '2026-07-25' },
      { chapter: 2, questionType: 'comprehension', question: 'What?', answered: false },
    ]
    expect(isChapterDoneToday(pool, today)).toBe(false)
  })

  it('returns false when pool is empty', () => {
    expect(isChapterDoneToday([], today)).toBe(false)
  })

  it('returns false when pool is undefined', () => {
    expect(isChapterDoneToday(undefined, today)).toBe(false)
  })

  it('returns false when question is answered but on a different date', () => {
    const pool: ChapterQuestionPoolItem[] = [
      { chapter: 3, questionType: 'reflection', question: 'How?', answered: true, answeredDate: '2026-07-20' },
    ]
    expect(isChapterDoneToday(pool, today)).toBe(false)
  })

  it('returns false when answered is false even if answeredDate is today', () => {
    const pool: ChapterQuestionPoolItem[] = [
      { chapter: 1, questionType: 'comprehension', question: 'Why?', answered: false, answeredDate: today },
    ]
    expect(isChapterDoneToday(pool, today)).toBe(false)
  })
})

// ── countRitualsToGo ───────────────────────────────────────────

describe('countRitualsToGo', () => {
  it('counts all visible unfinished rituals', () => {
    const flags: KidRitualFlags = {
      chapterVisible: true,
      chapterDone: false,
      conundrumVisible: true,
      conundrumDone: false,
      teachBackVisible: true,
    }
    expect(countRitualsToGo(flags)).toBe(3)
  })

  it('excludes done rituals', () => {
    const flags: KidRitualFlags = {
      chapterVisible: true,
      chapterDone: true,
      conundrumVisible: true,
      conundrumDone: false,
      teachBackVisible: false,
    }
    expect(countRitualsToGo(flags)).toBe(1)
  })

  it('excludes invisible rituals', () => {
    const flags: KidRitualFlags = {
      chapterVisible: false,
      chapterDone: false,
      conundrumVisible: false,
      conundrumDone: false,
      teachBackVisible: false,
    }
    expect(countRitualsToGo(flags)).toBe(0)
  })

  it('counts teachBack as to-go when visible (no done companion)', () => {
    const flags: KidRitualFlags = {
      chapterVisible: false,
      chapterDone: false,
      conundrumVisible: false,
      conundrumDone: false,
      teachBackVisible: true,
    }
    expect(countRitualsToGo(flags)).toBe(1)
  })

  it('returns 0 when all visible rituals are done', () => {
    const flags: KidRitualFlags = {
      chapterVisible: true,
      chapterDone: true,
      conundrumVisible: true,
      conundrumDone: true,
      teachBackVisible: false,
    }
    expect(countRitualsToGo(flags)).toBe(0)
  })
})

// ── combinedRemaining ──────────────────────────────────────────

describe('combinedRemaining', () => {
  it('sums must-do and ritual counts', () => {
    expect(combinedRemaining(3, 2)).toBe(5)
  })

  it('clamps negative must-do to 0', () => {
    expect(combinedRemaining(-1, 2)).toBe(2)
  })

  it('clamps negative ritualsToGo to 0', () => {
    expect(combinedRemaining(3, -1)).toBe(3)
  })

  it('returns 0 when both are 0', () => {
    expect(combinedRemaining(0, 0)).toBe(0)
  })

  it('returns 0 when both are negative', () => {
    expect(combinedRemaining(-5, -3)).toBe(0)
  })
})
