import { describe, expect, it } from 'vitest'

import type { ChecklistItem, DayLog } from '../../core/types'
import { SubjectBucket } from '../../core/types/enums'
import {
  buildWeekDates,
  computeDayState,
  computeWeekStats,
  DAY_LABELS,
  formatHoursChip,
  getPlannedAndLogged,
  isWeekEmpty,
  itemMinutes,
  parseMinutesFromLabel,
} from './weekRibbon.logic'

// ── parseMinutesFromLabel ──────────────────────────────────────

describe('parseMinutesFromLabel', () => {
  it('extracts minutes from a standard "(Nm)" suffix', () => {
    expect(parseMinutesFromLabel('Reading Eggs (45m)')).toBe(45)
  })

  it('extracts single-digit minutes', () => {
    expect(parseMinutesFromLabel('Quick Check (5m)')).toBe(5)
  })

  it('extracts three-digit minutes', () => {
    expect(parseMinutesFromLabel('Field Trip (120m)')).toBe(120)
  })

  it('returns 0 when no "(Nm)" pattern is present', () => {
    expect(parseMinutesFromLabel('Free Reading')).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(parseMinutesFromLabel('')).toBe(0)
  })
})

// ── itemMinutes ────────────────────────────────────────────────

describe('itemMinutes', () => {
  it('prefers plannedMinutes over estimatedMinutes and label', () => {
    const item: ChecklistItem = {
      label: 'Task (30m)',
      completed: false,
      plannedMinutes: 20,
      estimatedMinutes: 15,
    }
    expect(itemMinutes(item)).toBe(20)
  })

  it('falls back to estimatedMinutes when no plannedMinutes', () => {
    const item: ChecklistItem = {
      label: 'Task (30m)',
      completed: false,
      estimatedMinutes: 15,
    }
    expect(itemMinutes(item)).toBe(15)
  })

  it('falls back to label parsing when no explicit minutes', () => {
    const item: ChecklistItem = {
      label: 'Math Practice (20m)',
      completed: false,
    }
    expect(itemMinutes(item)).toBe(20)
  })

  it('returns 0 when no minutes available anywhere', () => {
    const item: ChecklistItem = {
      label: 'Art Project',
      completed: false,
    }
    expect(itemMinutes(item)).toBe(0)
  })
})

// ── getPlannedAndLogged ────────────────────────────────────────

describe('getPlannedAndLogged', () => {
  it('sums planned and logged minutes from checklist', () => {
    const log: DayLog = {
      childId: 'c1',
      date: '2026-07-21',
      blocks: [],
      checklist: [
        { label: 'Reading (30m)', completed: true, subjectBucket: SubjectBucket.Reading },
        { label: 'Math (20m)', completed: false, subjectBucket: SubjectBucket.Math },
        { label: 'Speech (10m)', completed: true, subjectBucket: SubjectBucket.LanguageArts },
      ],
    }
    const result = getPlannedAndLogged(log)
    expect(result.planned).toBe(60)
    expect(result.logged).toBe(40) // 30 + 10 completed
    expect(result.subjects).toContain(SubjectBucket.Reading)
    expect(result.subjects).toContain(SubjectBucket.LanguageArts)
    expect(result.subjects).not.toContain(SubjectBucket.Math)
  })

  it('excludes manual-source items', () => {
    const log: DayLog = {
      childId: 'c1',
      date: '2026-07-21',
      blocks: [],
      checklist: [
        { label: 'Reading (30m)', completed: true, source: 'planner' },
        { label: 'Extra Task (15m)', completed: true, source: 'manual' },
      ],
    }
    const result = getPlannedAndLogged(log)
    expect(result.planned).toBe(30)
    expect(result.logged).toBe(30)
  })

  it('returns zeros for null/undefined log', () => {
    expect(getPlannedAndLogged(null)).toEqual({ planned: 0, logged: 0, subjects: [] })
    expect(getPlannedAndLogged(undefined)).toEqual({ planned: 0, logged: 0, subjects: [] })
  })

  it('returns zeros for log without checklist', () => {
    const log: DayLog = { childId: 'c1', date: '2026-07-21', blocks: [] }
    expect(getPlannedAndLogged(log)).toEqual({ planned: 0, logged: 0, subjects: [] })
  })
})

// ── buildWeekDates ─────────────────────────────────────────────

describe('buildWeekDates', () => {
  it('builds Mon-Fri dates from a Monday start', () => {
    const dates = buildWeekDates('2026-07-20')
    expect(dates).toEqual([
      '2026-07-20',
      '2026-07-21',
      '2026-07-22',
      '2026-07-23',
      '2026-07-24',
    ])
  })

  it('handles month boundary', () => {
    const dates = buildWeekDates('2026-03-30')
    expect(dates).toEqual([
      '2026-03-30',
      '2026-03-31',
      '2026-04-01',
      '2026-04-02',
      '2026-04-03',
    ])
  })

  it('handles year boundary', () => {
    const dates = buildWeekDates('2025-12-29')
    expect(dates).toEqual([
      '2025-12-29',
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
    ])
  })

  it('always returns exactly 5 dates', () => {
    expect(buildWeekDates('2026-01-05')).toHaveLength(5)
  })
})

// ── computeDayState ────────────────────────────────────────────

describe('computeDayState', () => {
  const today = '2026-07-23'

  const makeLog = (checklist: ChecklistItem[]): DayLog => ({
    childId: 'c1',
    date: today,
    blocks: [],
    checklist,
  })

  it('returns "in-progress" for today with a plan', () => {
    const log = makeLog([{ label: 'Task (20m)', completed: false }])
    expect(computeDayState(today, log, today)).toBe('in-progress')
  })

  it('returns "empty" for today with no plan', () => {
    expect(computeDayState(today, null, today)).toBe('empty')
  })

  it('returns "done" for past day with >= 80% logged', () => {
    const log = makeLog([
      { label: 'Task A (25m)', completed: true },
      { label: 'Task B (25m)', completed: true },
      { label: 'Task C (25m)', completed: true },
      { label: 'Task D (25m)', completed: true },
      { label: 'Task E (25m)', completed: false },
    ])
    // 100 logged out of 125 planned = 80%
    expect(computeDayState('2026-07-21', log, today)).toBe('done')
  })

  it('returns "partial" for past day with < 80% logged', () => {
    const log = makeLog([
      { label: 'Task A (50m)', completed: true },
      { label: 'Task B (50m)', completed: false },
      { label: 'Task C (50m)', completed: false },
    ])
    // 50 logged out of 150 planned = 33%
    expect(computeDayState('2026-07-21', log, today)).toBe('partial')
  })

  it('returns "skipped" for past day with plan but 0 logged', () => {
    const log = makeLog([
      { label: 'Task A (20m)', completed: false },
      { label: 'Task B (20m)', completed: false },
    ])
    expect(computeDayState('2026-07-21', log, today)).toBe('skipped')
  })

  it('returns "empty" for past day with no plan', () => {
    expect(computeDayState('2026-07-21', null, today)).toBe('empty')
  })

  it('returns "pending" for future day with a plan', () => {
    const log = makeLog([{ label: 'Task (20m)', completed: false }])
    expect(computeDayState('2026-07-25', log, today)).toBe('pending')
  })

  it('returns "empty" for future day with no plan', () => {
    expect(computeDayState('2026-07-25', null, today)).toBe('empty')
  })
})

// ── computeWeekStats ───────────────────────────────────────────

describe('computeWeekStats', () => {
  it('produces a DayStats entry per weekday', () => {
    const dates = buildWeekDates('2026-07-20')
    const stats = computeWeekStats(dates, {}, '2026-07-23')
    expect(stats).toHaveLength(5)
    expect(stats.map((s) => s.label)).toEqual([...DAY_LABELS])
    expect(stats.every((s) => s.state === 'empty')).toBe(true)
  })

  it('reflects logged data from logsByDate', () => {
    const dates = buildWeekDates('2026-07-20')
    const log: DayLog = {
      childId: 'c1',
      date: '2026-07-20',
      blocks: [],
      checklist: [
        { label: 'Reading (30m)', completed: true, subjectBucket: SubjectBucket.Reading },
      ],
    }
    const stats = computeWeekStats(dates, { '2026-07-20': log }, '2026-07-23')
    const mon = stats[0]
    expect(mon.plannedMinutes).toBe(30)
    expect(mon.loggedMinutes).toBe(30)
    expect(mon.state).toBe('done')
    expect(mon.subjects).toContain(SubjectBucket.Reading)
  })
})

// ── formatHoursChip ────────────────────────────────────────────

describe('formatHoursChip', () => {
  it('shows hours when planned >= 60', () => {
    expect(formatHoursChip(90, 120)).toBe('1.5/2 hrs')
  })

  it('shows whole hours without decimal', () => {
    expect(formatHoursChip(60, 120)).toBe('1/2 hrs')
  })

  it('shows minutes when planned < 60', () => {
    expect(formatHoursChip(15, 30)).toBe('15/30 min')
  })

  it('shows 0/0 min for zero values', () => {
    expect(formatHoursChip(0, 0)).toBe('0/0 min')
  })
})

// ── isWeekEmpty ────────────────────────────────────────────────

describe('isWeekEmpty', () => {
  it('returns true when all days have zero planned minutes', () => {
    const stats = buildWeekDates('2026-07-20').map((date, i) => ({
      date,
      label: DAY_LABELS[i] ?? '',
      state: 'empty' as const,
      plannedMinutes: 0,
      loggedMinutes: 0,
      subjects: [],
    }))
    expect(isWeekEmpty(stats)).toBe(true)
  })

  it('returns false when any day has planned minutes', () => {
    const stats = buildWeekDates('2026-07-20').map((date, i) => ({
      date,
      label: DAY_LABELS[i] ?? '',
      state: 'empty' as const,
      plannedMinutes: i === 2 ? 30 : 0,
      loggedMinutes: 0,
      subjects: [],
    }))
    expect(isWeekEmpty(stats)).toBe(false)
  })
})
