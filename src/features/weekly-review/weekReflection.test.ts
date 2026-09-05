import { describe, expect, it } from 'vitest'

import type { WeeklyReview } from '../../core/types'
import {
  WeekReflectionAnswer,
  WeekReflectionAnswerLabel,
} from '../../core/types/enums'
import {
  REFLECTION_CHOICES,
  REFLECTION_NOTE_MAX,
  WEEK_QUESTION,
  buildWeekReflection,
  isWeekReflectionAnswer,
  normalizeWeekReflection,
  pastReflections,
} from './weekReflection'

const NOW = new Date('2026-09-07T14:00:00.000Z')

const review = (
  weekKey: string,
  reflection?: unknown,
): WeeklyReview =>
  ({ weekKey, childId: 'c1', reflection } as unknown as WeeklyReview)

describe('the week question (UX-214)', () => {
  it('asks the question the owner asked for, and asks nothing else', () => {
    expect(WEEK_QUESTION).toBe('Was that enough this week?')
  })

  it('offers exactly three answers, and does not rank them', () => {
    expect(REFLECTION_CHOICES).toHaveLength(3)
    expect(REFLECTION_CHOICES.map((c) => c.label)).toEqual([
      'Yes, good week',
      'About right',
      'We can do more',
    ])
    // No score, no ordering value, no "better" end — just an answer and words.
    for (const choice of REFLECTION_CHOICES) {
      expect(Object.keys(choice).sort()).toEqual(['answer', 'label'])
      expect(choice.label).not.toMatch(
        /\d|best|worst|good enough|failed|behind|great job/i,
      )
    }
  })

  it('has a label for every answer, so a new one cannot ship unworded', () => {
    for (const answer of Object.values(WeekReflectionAnswer)) {
      expect(WeekReflectionAnswerLabel[answer]).toBeTruthy()
    }
  })
})

describe('buildWeekReflection', () => {
  it('stores the answer and the moment it was given', () => {
    expect(
      buildWeekReflection(WeekReflectionAnswer.CanDoMore, undefined, NOW),
    ).toEqual({
      answer: 'can-do-more',
      answeredAt: '2026-09-07T14:00:00.000Z',
    })
  })

  it('omits a blank note rather than storing an empty line', () => {
    const reflection = buildWeekReflection(
      WeekReflectionAnswer.GoodWeek,
      '   \n ',
      NOW,
    )
    expect(reflection).not.toHaveProperty('note')
  })

  it('keeps a real note, trimmed and capped', () => {
    expect(
      buildWeekReflection(WeekReflectionAnswer.AboutRight, '  packing week  ', NOW)
        .note,
    ).toBe('packing week')
    expect(
      buildWeekReflection(
        WeekReflectionAnswer.AboutRight,
        'x'.repeat(REFLECTION_NOTE_MAX + 50),
        NOW,
      ).note,
    ).toHaveLength(REFLECTION_NOTE_MAX)
  })
})

describe('normalizeWeekReflection', () => {
  it('rejects anything that is not one of the three answers', () => {
    expect(normalizeWeekReflection(undefined)).toBeNull()
    expect(normalizeWeekReflection({ answer: 'excellent' })).toBeNull()
    expect(normalizeWeekReflection({ answer: 7 })).toBeNull()
    expect(isWeekReflectionAnswer('about-right')).toBe(true)
    expect(isWeekReflectionAnswer('about right')).toBe(false)
  })

  it('reads a stored answer back, dropping a whitespace-only note', () => {
    expect(
      normalizeWeekReflection({
        answer: 'good-week',
        note: '   ',
        answeredAt: '2026-09-07T14:00:00.000Z',
      }),
    ).toEqual({ answer: 'good-week', answeredAt: '2026-09-07T14:00:00.000Z' })
  })
})

describe('pastReflections', () => {
  it('shows earlier answers newest first, so a run of the same answer is visible', () => {
    const history = [
      review('2026-08-16', { answer: 'can-do-more', answeredAt: 'x' }),
      review('2026-08-30', { answer: 'can-do-more', answeredAt: 'x' }),
      review('2026-08-23', { answer: 'can-do-more', answeredAt: 'x' }),
    ]
    const result = pastReflections(history)
    expect(result.map((r) => r.weekKey)).toEqual([
      '2026-08-30',
      '2026-08-23',
      '2026-08-16',
    ])
    expect(result.every((r) => r.label === 'We can do more')).toBe(true)
    expect(result[0].weekLabel).toBe('Aug 30')
  })

  it('skips a week the parent never answered instead of rendering a gap', () => {
    const history = [
      review('2026-08-30'),
      review('2026-08-23', { answer: 'about-right', answeredAt: 'x' }),
      review('2026-08-16', { answer: 'nonsense' }),
    ]
    expect(pastReflections(history).map((r) => r.weekKey)).toEqual([
      '2026-08-23',
    ])
  })
})
