import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { DayLog } from '../../core/types'
import { SubjectBucket } from '../../core/types/enums'
import { checklistItemKey } from '../today/dayWriteGuard'
import {
  chatWeekDaysCacheKey,
  currentWeekDayKeys,
  plannableWatchDayKeys,
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

describe('plannableWatchDayKeys (FEAT-149)', () => {
  // The window a video may be planned onto: this school week and the next. This
  // is the run's ONE widening past FEAT-142's current-week gate, so what is in
  // it — and what is deliberately not — is pinned here.
  //
  // TZ is pinned for the whole block. On a UTC runner these assertions would
  // pass vacuously: the boundary bug this guards against (a Sunday-evening
  // civil date that has already rolled to Monday in UTC) is invisible unless the
  // process is running in a zone behind UTC. Node re-reads `process.env.TZ` for
  // Dates constructed after the assignment.
  const originalTz = process.env.TZ
  beforeAll(() => {
    process.env.TZ = 'America/Chicago'
  })
  afterAll(() => {
    process.env.TZ = originalTz
  })

  it('returns this week then next week, ten weekdays, correctly labelled', () => {
    const days = plannableWatchDayKeys(new Date('2026-08-12T12:00:00'))
    expect(days).toHaveLength(10)
    expect(days.map((d) => d.dateKey)).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
      '2026-08-14',
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
    ])
    expect(days[1].label).toBe('Tuesday')
    expect(days[6].label).toBe('next Tuesday')
  })

  it('opens with exactly the current week — the two windows cannot drift apart', () => {
    const now = new Date('2026-08-13T09:00:00')
    expect(plannableWatchDayKeys(now).slice(0, 5)).toEqual(currentWeekDayKeys(now))
  })

  it('excludes weekends, the week after next, and last week', () => {
    const keys = plannableWatchDayKeys(new Date('2026-08-12T12:00:00')).map((d) => d.dateKey)
    expect(keys).not.toContain('2026-08-15') // Saturday
    expect(keys).not.toContain('2026-08-16') // Sunday
    expect(keys).not.toContain('2026-08-24') // next-plus-one Monday
    expect(keys).not.toContain('2026-08-07') // last Friday
  })

  it('rolls over with the week: on a Sunday the window is the week just ending, plus one', () => {
    // Sunday belongs to the week that is ENDING (the client + CF rule), so a
    // Sunday-evening ask about "next week" lands on the days that are actually
    // next — never on the week that has already gone by.
    const days = plannableWatchDayKeys(new Date('2026-08-16T19:30:00'))
    expect(days[0].dateKey).toBe('2026-08-10')
    expect(days[5].dateKey).toBe('2026-08-17')
    expect(days[5].label).toBe('next Monday')
  })

  it('crosses a month boundary as calendar arithmetic, not +7 on the day number', () => {
    const days = plannableWatchDayKeys(new Date('2026-08-26T12:00:00'))
    expect(days.map((d) => d.dateKey)).toEqual([
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
    ])
  })

  it('agrees with the Cloud Function on the same date (both sides pinned)', () => {
    // `plannableWatchDays` in `functions/src/ai/tasks/shellyChat.ts` builds the
    // list the model is told about; this builds the list the confirm gate
    // accepts. A divergence would offer the model days the client refuses, so
    // the same date/label pairs are asserted on each side.
    const days = plannableWatchDayKeys(new Date('2026-08-12T12:00:00'))
    expect(days[5]).toEqual({ dateKey: '2026-08-17', label: 'next Monday' })
    expect(days[9]).toEqual({ dateKey: '2026-08-21', label: 'next Friday' })
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
