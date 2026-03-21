import { describe, it, expect } from 'vitest'
import { advanceLessonNumber, clonePlanWithAdvancedLessons } from './repeatWeek.logic'
import type { DraftWeeklyPlan } from '../../core/types'
import { SubjectBucket } from '../../core/types/enums'

describe('advanceLessonNumber', () => {
  it('increments "Lesson XX" pattern', () => {
    expect(advanceLessonNumber('Math Lesson 5', 3)).toBe('Math Lesson 8')
  })

  it('increments "Ch XX" pattern', () => {
    expect(advanceLessonNumber('Reading Ch 12', 2)).toBe('Reading Ch 14')
  })

  it('increments "Chapter XX" pattern', () => {
    expect(advanceLessonNumber('History Chapter 7', 1)).toBe('History Chapter 8')
  })

  it('increments "Unit XX" pattern', () => {
    expect(advanceLessonNumber('Science Unit 3', 4)).toBe('Science Unit 7')
  })

  it('increments "Page XX" pattern', () => {
    expect(advanceLessonNumber('Workbook Page 42', 5)).toBe('Workbook Page 47')
  })

  it('is case-insensitive', () => {
    expect(advanceLessonNumber('math lesson 10', 2)).toBe('math lesson 12')
  })

  it('returns title unchanged when no pattern matches', () => {
    expect(advanceLessonNumber('Free reading time', 5)).toBe('Free reading time')
  })

  it('handles multiple patterns in one title', () => {
    expect(advanceLessonNumber('Ch 3 review (Lesson 5)', 2)).toBe('Ch 5 review (Lesson 7)')
  })
})

describe('clonePlanWithAdvancedLessons', () => {
  const makePlan = (items: Array<{ title: string; day?: string }>): DraftWeeklyPlan => {
    const dayMap = new Map<string, Array<{ title: string }>>()
    for (const item of items) {
      const day = item.day ?? 'Monday'
      if (!dayMap.has(day)) dayMap.set(day, [])
      dayMap.get(day)!.push(item)
    }

    const days = Array.from(dayMap.entries()).map(([day, dayItems]) => ({
      day,
      timeBudgetMinutes: 120,
      items: dayItems.map((di) => ({
        id: 'old-id',
        title: di.title,
        subjectBucket: SubjectBucket.Math,
        estimatedMinutes: 30,
        skillTags: [],
        accepted: true,
      })),
    }))

    return { days, skipSuggestions: [], minimumWin: '' }
  }

  it('advances lesson numbers by the count of items with the same workbook prefix', () => {
    const plan = makePlan([
      { title: 'Singapore Math Lesson 5', day: 'Monday' },
      { title: 'Singapore Math Lesson 6', day: 'Tuesday' },
      { title: 'Singapore Math Lesson 7', day: 'Wednesday' },
    ])

    const result = clonePlanWithAdvancedLessons(plan)
    const titles = result.days.flatMap((d) => d.items.map((i) => i.title))

    // 3 items with prefix "Singapore Math" → increment by 3
    expect(titles).toEqual([
      'Singapore Math Lesson 8',
      'Singapore Math Lesson 9',
      'Singapore Math Lesson 10',
    ])
  })

  it('leaves items without lesson numbers unchanged', () => {
    const plan = makePlan([
      { title: 'Free reading time', day: 'Monday' },
      { title: 'Singapore Math Lesson 5', day: 'Monday' },
    ])

    const result = clonePlanWithAdvancedLessons(plan)
    const titles = result.days.flatMap((d) => d.items.map((i) => i.title))

    expect(titles).toEqual(['Free reading time', 'Singapore Math Lesson 6'])
  })

  it('generates new item IDs for cloned items', () => {
    const plan = makePlan([{ title: 'Math Lesson 1' }])
    const result = clonePlanWithAdvancedLessons(plan)

    expect(result.days[0].items[0].id).not.toBe('old-id')
  })

  it('handles multiple workbooks independently', () => {
    const plan = makePlan([
      { title: 'Singapore Math Lesson 5', day: 'Monday' },
      { title: 'Singapore Math Lesson 6', day: 'Tuesday' },
      { title: 'Reading Ch 3', day: 'Monday' },
    ])

    const result = clonePlanWithAdvancedLessons(plan)
    const titles = result.days.flatMap((d) => d.items.map((i) => i.title))

    // Singapore Math: 2 items → +2; Reading: 1 item → +1
    expect(titles).toContain('Singapore Math Lesson 7')
    expect(titles).toContain('Singapore Math Lesson 8')
    expect(titles).toContain('Reading Ch 4')
  })
})
