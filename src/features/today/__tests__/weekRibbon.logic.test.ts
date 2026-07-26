import { describe, expect, it } from 'vitest'

import type { ChecklistItem, DayLog } from '../../../core/types'
import {
  buildWeekDates,
  computeDayState,
  computeWeekStats,
  formatHoursChip,
  getPlannedAndLogged,
  isWeekEmpty,
  itemMinutes,
  parseMinutesFromLabel,
} from '../weekRibbon.logic'

function makeLog(date: string, items: Array<Partial<ChecklistItem>>): DayLog {
  return {
    childId: 'kid-1',
    date,
    blocks: [],
    checklist: items.map((i, idx) => ({
      id: i.id ?? `item-${idx}`,
      label: i.label ?? 'Item',
      completed: i.completed ?? false,
      ...i,
    })),
  }
}

describe('parseMinutesFromLabel', () => {
  it('parses minute hint from a label', () => {
    expect(parseMinutesFromLabel('Reading (20m)')).toBe(20)
  })
  it('returns 0 when no hint', () => {
    expect(parseMinutesFromLabel('Reading')).toBe(0)
  })
  it('parses one- and three-digit hints, not just two', () => {
    expect(parseMinutesFromLabel('Quick Check (5m)')).toBe(5)
    expect(parseMinutesFromLabel('Field Trip (120m)')).toBe(120)
  })
  it('returns 0 for an empty label', () => {
    expect(parseMinutesFromLabel('')).toBe(0)
  })
})

describe('itemMinutes', () => {
  it('prefers plannedMinutes', () => {
    expect(itemMinutes({ label: 'x', completed: false, plannedMinutes: 30, estimatedMinutes: 15 })).toBe(30)
  })
  it('falls back to estimatedMinutes', () => {
    expect(itemMinutes({ label: 'x', completed: false, estimatedMinutes: 15 })).toBe(15)
  })
  it('falls back to label-parsed minutes', () => {
    expect(itemMinutes({ label: 'Math (45m)', completed: false })).toBe(45)
  })
  it('returns 0 when no minutes are available anywhere', () => {
    expect(itemMinutes({ label: 'Art Project', completed: false })).toBe(0)
  })
})

describe('getPlannedAndLogged', () => {
  it('returns zero for null log', () => {
    expect(getPlannedAndLogged(null)).toEqual({ planned: 0, logged: 0, subjects: [] })
  })

  it('returns zero for an undefined log', () => {
    expect(getPlannedAndLogged(undefined)).toEqual({ planned: 0, logged: 0, subjects: [] })
  })

  it('returns zero for a log with no checklist at all', () => {
    const log: DayLog = { childId: 'kid-1', date: '2026-05-11', blocks: [] }
    expect(getPlannedAndLogged(log)).toEqual({ planned: 0, logged: 0, subjects: [] })
  })

  it('sums minutes across mixed source items', () => {
    const log = makeLog('2026-05-11', [
      { label: 'Math', completed: true, plannedMinutes: 30, subjectBucket: 'Math' },
      { label: 'Reading (15m)', completed: false },
      { label: 'LA', completed: true, estimatedMinutes: 20, subjectBucket: 'LanguageArts' },
    ])
    const { planned, logged, subjects } = getPlannedAndLogged(log)
    expect(planned).toBe(65)
    expect(logged).toBe(50)
    expect(subjects.sort()).toEqual(['LanguageArts', 'Math'])
  })

  it('ignores items with source = manual', () => {
    const log = makeLog('2026-05-11', [
      { label: 'Math', completed: true, plannedMinutes: 30 },
      { label: 'Manual entry', completed: true, plannedMinutes: 60, source: 'manual' },
    ])
    expect(getPlannedAndLogged(log)).toEqual({ planned: 30, logged: 30, subjects: [] })
  })
})

describe('computeDayState', () => {
  const today = '2026-05-14'

  it('returns in-progress for today with a plan', () => {
    const log = makeLog(today, [{ label: 'x', completed: false, plannedMinutes: 30 }])
    expect(computeDayState(today, log, today)).toBe('in-progress')
  })

  it('returns empty for today with no plan', () => {
    expect(computeDayState(today, null, today)).toBe('empty')
  })

  it('returns pending for future date with a plan', () => {
    const log = makeLog('2026-05-15', [{ label: 'x', completed: false, plannedMinutes: 30 }])
    expect(computeDayState('2026-05-15', log, today)).toBe('pending')
  })

  it('returns empty for future date with no log', () => {
    expect(computeDayState('2026-05-15', null, today)).toBe('empty')
  })

  it('returns skipped for past date with plan and 0 logged', () => {
    const log = makeLog('2026-05-12', [{ label: 'x', completed: false, plannedMinutes: 30 }])
    expect(computeDayState('2026-05-12', log, today)).toBe('skipped')
  })

  it('returns done for past date with >= 80% logged', () => {
    const log = makeLog('2026-05-12', [
      { label: 'a', completed: true, plannedMinutes: 30 },
      { label: 'b', completed: true, plannedMinutes: 30 },
      { label: 'c', completed: true, plannedMinutes: 20 },
      { label: 'd', completed: false, plannedMinutes: 20 },
    ])
    expect(computeDayState('2026-05-12', log, today)).toBe('done')
  })

  it('returns partial for past date with some but < 80% logged', () => {
    const log = makeLog('2026-05-12', [
      { label: 'a', completed: true, plannedMinutes: 20 },
      { label: 'b', completed: false, plannedMinutes: 80 },
    ])
    expect(computeDayState('2026-05-12', log, today)).toBe('partial')
  })

  it('returns empty for a past date with no log — an unplanned day is not a skipped one', () => {
    expect(computeDayState('2026-05-12', null, today)).toBe('empty')
  })
})

describe('buildWeekDates', () => {
  it('produces Mon-Fri YYYY-MM-DD strings', () => {
    expect(buildWeekDates('2026-05-11')).toEqual([
      '2026-05-11',
      '2026-05-12',
      '2026-05-13',
      '2026-05-14',
      '2026-05-15',
    ])
  })

  it('crosses a month boundary', () => {
    expect(buildWeekDates('2026-03-30')).toEqual([
      '2026-03-30',
      '2026-03-31',
      '2026-04-01',
      '2026-04-02',
      '2026-04-03',
    ])
  })

  it('crosses a year boundary', () => {
    expect(buildWeekDates('2025-12-29')).toEqual([
      '2025-12-29',
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
    ])
  })
})

describe('computeWeekStats', () => {
  it('labels each day Mon..Fri in order', () => {
    const dates = buildWeekDates('2026-05-11')
    const stats = computeWeekStats(dates, {}, '2026-05-14')
    expect(stats.map((s) => s.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])
  })

  it('carries each day’s minutes, state and subjects through from logsByDate', () => {
    const dates = buildWeekDates('2026-05-11')
    const stats = computeWeekStats(
      dates,
      {
        '2026-05-11': makeLog('2026-05-11', [
          { label: 'Reading', completed: true, plannedMinutes: 30, subjectBucket: 'Reading' },
        ]),
      },
      '2026-05-14',
    )
    const mon = stats[0]
    expect(mon.plannedMinutes).toBe(30)
    expect(mon.loggedMinutes).toBe(30)
    expect(mon.state).toBe('done')
    expect(mon.subjects).toContain('Reading')
  })
})

describe('isWeekEmpty', () => {
  it('returns true when no day has a plan', () => {
    const stats = computeWeekStats(buildWeekDates('2026-05-11'), {}, '2026-05-14')
    expect(isWeekEmpty(stats)).toBe(true)
  })

  it('returns false when any day has a plan', () => {
    const dates = buildWeekDates('2026-05-11')
    const stats = computeWeekStats(
      dates,
      {
        '2026-05-12': makeLog('2026-05-12', [
          { label: 'x', completed: false, plannedMinutes: 30 },
        ]),
      },
      '2026-05-14',
    )
    expect(isWeekEmpty(stats)).toBe(false)
  })
})

describe('formatHoursChip', () => {
  it('reports minutes when planned < 60', () => {
    expect(formatHoursChip(20, 45)).toBe('20/45 min')
  })

  it('reports whole hours cleanly', () => {
    expect(formatHoursChip(120, 240)).toBe('2/4 hrs')
  })

  it('reports fractional hours with one decimal', () => {
    expect(formatHoursChip(90, 150)).toBe('1.5/2.5 hrs')
  })

  it('reports an untouched day as minutes, not 0 hrs', () => {
    expect(formatHoursChip(0, 0)).toBe('0/0 min')
  })
})
