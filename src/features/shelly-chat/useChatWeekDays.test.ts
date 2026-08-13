import { describe, expect, it } from 'vitest'

import type { DayLog } from '../../core/types'
import { SubjectBucket } from '../../core/types/enums'
import { checklistItemKey } from '../today/dayWriteGuard'
import {
  chatWeekDaysCacheKey,
  currentWeekDayKeys,
  toChatWeekDay,
} from './useChatWeekDays'

describe('currentWeekDayKeys (FEAT-142)', () => {
  it('returns exactly the five weekdays of the week containing the date', () => {
    const week = currentWeekDayKeys(new Date('2026-08-12T12:00:00'))
    expect(week.map((d) => d.label)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
    ])
    expect(week.map((d) => d.dateKey)).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
      '2026-08-14',
    ])
  })

  it('treats Sunday as belonging to the week that is ending', () => {
    const week = currentWeekDayKeys(new Date('2026-08-16T12:00:00'))
    expect(week[0].dateKey).toBe('2026-08-10')
    expect(week[4].dateKey).toBe('2026-08-14')
  })

  it('agrees with the Cloud Function on the same date', () => {
    // The CF builds the THIS WEEK section from its own copy of this rule; a
    // divergence would offer the model rows the client cannot resolve.
    const week = currentWeekDayKeys(new Date('2026-08-10T00:00:00'))
    expect(week[0]).toEqual({ dateKey: '2026-08-10', label: 'Monday' })
  })
})

describe('toChatWeekDay (FEAT-142)', () => {
  const day = (): DayLog => ({
    childId: 'c1',
    date: '2026-08-10',
    blocks: [],
    checklist: [
      {
        label: 'Reading Eggs (30m)',
        subjectBucket: SubjectBucket.Reading,
        completed: true,
        evidenceArtifactId: 'art-1',
      },
      { label: 'Math Facts (10m)', subjectBucket: SubjectBucket.Math, completed: false },
      { id: 'row-9', label: 'Watch: Volcanoes (12m)', completed: false, skipped: true },
    ],
  })

  it('keys each row by the day-write guard’s own notion of identity', () => {
    // Same function on both sides, so "the row I meant" and "the row the guard
    // is watching" cannot drift.
    const projected = toChatWeekDay('2026-08-10', 'Monday', day())
    expect(projected.items.map((i) => i.itemKey)).toEqual([
      checklistItemKey(day().checklist![0]),
      checklistItemKey(day().checklist![1]),
      'row-9',
    ])
  })

  it('carries completion faithfully — it is what the hard rule keys on', () => {
    const projected = toChatWeekDay('2026-08-10', 'Monday', day())
    expect(projected.items.map((i) => i.completed)).toEqual([true, false, false])
  })

  it('marks a skipped row without calling it completed', () => {
    const projected = toChatWeekDay('2026-08-10', 'Monday', day())
    expect(projected.items[2].skipped).toBe(true)
    expect(projected.items[2].completed).toBe(false)
  })

  it('carries nothing else about the day across', () => {
    // The chat has no business with evidence ids, minutes, mastery or engagement.
    const projected = toChatWeekDay('2026-08-10', 'Monday', day())
    expect(Object.keys(projected.items[0]).sort()).toEqual(
      ['completed', 'itemKey', 'label'].sort(),
    )
  })

  it('projects a missing day as a real, empty weekday', () => {
    // A weekday with no saved document is still a day a row can be added to or
    // moved onto — omitting it would read as "that day doesn't exist".
    const projected = toChatWeekDay('2026-08-11', 'Tuesday', undefined)
    expect(projected).toEqual({ dateKey: '2026-08-11', label: 'Tuesday', items: [] })
  })
})

describe('chatWeekDaysCacheKey (FEAT-142)', () => {
  it('keeps ids distinct that naive concatenation would collide', () => {
    expect(chatWeekDaysCacheKey('ab', 'c')).not.toBe(chatWeekDaysCacheKey('a', 'bc'))
  })

  it('separates with the NUL escape, never a raw byte that would binary-ise the file', () => {
    expect(chatWeekDaysCacheKey('fam1', 'lincoln1')).toBe(`fam1\u0000lincoln1`)
  })
})
