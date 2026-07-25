import { describe, expect, it } from 'vitest'

import {
  combinedRemaining,
  countRitualsToGo,
  isChapterDoneToday,
} from '../kidRitualRows'
import type { KidRitualFlags } from '../kidRitualRows'
import type { ChapterQuestionPoolItem } from '../../../core/types'

function poolItem(over: Partial<ChapterQuestionPoolItem> = {}): ChapterQuestionPoolItem {
  return {
    chapter: 1,
    questionType: 'comprehension',
    question: 'What happened?',
    answered: false,
    ...over,
  }
}

const NONE: KidRitualFlags = {
  chapterVisible: false,
  chapterDone: false,
  conundrumVisible: false,
  conundrumDone: false,
  teachBackVisible: false,
}

describe('isChapterDoneToday', () => {
  const TODAY = '2026-07-25'

  it('is true when a chapter was answered today', () => {
    const pool = [
      poolItem({ chapter: 1, answered: true, answeredDate: '2026-07-20' }),
      poolItem({ chapter: 2, answered: true, answeredDate: TODAY }),
      poolItem({ chapter: 3 }),
    ]
    expect(isChapterDoneToday(pool, TODAY)).toBe(true)
  })

  it('is false when the only answers are from earlier days', () => {
    const pool = [
      poolItem({ chapter: 1, answered: true, answeredDate: '2026-07-20' }),
      poolItem({ chapter: 2, answered: true, answeredDate: '2026-07-24' }),
    ]
    expect(isChapterDoneToday(pool, TODAY)).toBe(false)
  })

  it('is false for an empty or undefined pool', () => {
    expect(isChapterDoneToday([], TODAY)).toBe(false)
    expect(isChapterDoneToday(undefined, TODAY)).toBe(false)
  })

  it('is false when answeredDate is today but answered is not true', () => {
    const pool = [poolItem({ chapter: 1, answered: false, answeredDate: TODAY })]
    expect(isChapterDoneToday(pool, TODAY)).toBe(false)
  })

  it('is false for a parent-skipped chapter stamped today', () => {
    const pool = [poolItem({ chapter: 1, skipped: true, answeredDate: TODAY })]
    expect(isChapterDoneToday(pool, TODAY)).toBe(false)
  })

  it('does NOT use pool emptiness — a book with chapters still to go can be done today', () => {
    // The regression this guards: using `isChapterPoolVisible` (any chapter
    // to-go) as the done signal would never clear during a multi-week book.
    const pool = [
      poolItem({ chapter: 1, answered: true, answeredDate: TODAY }),
      poolItem({ chapter: 2 }),
      poolItem({ chapter: 3 }),
    ]
    expect(isChapterDoneToday(pool, TODAY)).toBe(true)
  })
})

describe('countRitualsToGo', () => {
  it('counts nothing when no ritual is visible', () => {
    expect(countRitualsToGo(NONE)).toBe(0)
  })

  it('counts a visible, unfinished chapter', () => {
    expect(countRitualsToGo({ ...NONE, chapterVisible: true })).toBe(1)
  })

  it('does not count a visible chapter that is done', () => {
    expect(
      countRitualsToGo({ ...NONE, chapterVisible: true, chapterDone: true }),
    ).toBe(0)
  })

  it('does not count a done-but-not-visible ritual either way', () => {
    expect(countRitualsToGo({ ...NONE, chapterDone: true })).toBe(0)
    expect(countRitualsToGo({ ...NONE, conundrumDone: true })).toBe(0)
  })

  it('counts a visible, unanswered conundrum and skips an answered one', () => {
    expect(countRitualsToGo({ ...NONE, conundrumVisible: true })).toBe(1)
    expect(
      countRitualsToGo({ ...NONE, conundrumVisible: true, conundrumDone: true }),
    ).toBe(0)
  })

  it('counts teach-back on visibility alone (the section unmounts once done)', () => {
    expect(countRitualsToGo({ ...NONE, teachBackVisible: true })).toBe(1)
  })

  it('sums every visible, unfinished ritual', () => {
    expect(
      countRitualsToGo({
        chapterVisible: true,
        chapterDone: false,
        conundrumVisible: true,
        conundrumDone: false,
        teachBackVisible: true,
      }),
    ).toBe(3)
  })

  it('has no mining key on KidRitualFlags — mining is never counted', () => {
    // Mining accrues minutes and has no "done", so counting it would keep the
    // finish-line from ever reaching zero.
    const keys = Object.keys(NONE)
    expect(keys.some((k) => /min(e|ing)/i.test(k))).toBe(false)
    expect(keys).toEqual([
      'chapterVisible',
      'chapterDone',
      'conundrumVisible',
      'conundrumDone',
      'teachBackVisible',
    ])
  })
})

describe('combinedRemaining', () => {
  it('sums must-do remaining and rituals to go', () => {
    expect(combinedRemaining(3, 2)).toBe(5)
  })

  it('is zero when both sides are zero', () => {
    expect(combinedRemaining(0, 0)).toBe(0)
  })

  it('clamps each side at zero rather than subtracting', () => {
    expect(combinedRemaining(-4, 2)).toBe(2)
    expect(combinedRemaining(3, -1)).toBe(3)
    expect(combinedRemaining(-2, -5)).toBe(0)
  })
})
