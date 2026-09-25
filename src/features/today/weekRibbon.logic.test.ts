import { describe, expect, it } from 'vitest'

import type {
  ChecklistItem,
  DayLog,
  HoursAdjustment,
  HoursEntry,
} from '../../core/types'
import { SubjectBucket } from '../../core/types/enums'
import { computeHoursSummary } from '../records/records.logic'
import {
  bucketContributionsByDate,
  buildWeekDates,
  computeRibbonWeek,
  computeWeekStats,
  DAY_LABELS,
  formatCountedHours,
  getPlanProgress,
  isWeekEmpty,
  itemMinutes,
  parseMinutesFromLabel,
} from './weekRibbon.logic'
import * as ribbonLogic from './weekRibbon.logic'

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

// ── getPlanProgress — the plan half ────────────────────────────

describe('getPlanProgress', () => {
  it('sums planned and checked minutes and counts rows', () => {
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
    expect(getPlanProgress(log)).toEqual({
      planned: 60,
      checked: 40,
      rowsPlanned: 3,
      rowsDone: 2,
    })
  })

  it('does not treat a manual row as part of the plan', () => {
    const log: DayLog = {
      childId: 'c1',
      date: '2026-07-21',
      blocks: [],
      checklist: [
        { label: 'Reading (30m)', completed: true, source: 'planner' },
        { label: 'Extra Task (15m)', completed: true, source: 'manual' },
      ],
    }
    expect(getPlanProgress(log)).toEqual({
      planned: 30,
      checked: 30,
      rowsPlanned: 1,
      rowsDone: 1,
    })
  })

  it('returns zeros for a missing log or checklist', () => {
    const zero = { planned: 0, checked: 0, rowsPlanned: 0, rowsDone: 0 }
    expect(getPlanProgress(null)).toEqual(zero)
    expect(getPlanProgress(undefined)).toEqual(zero)
    expect(getPlanProgress({ childId: 'c1', date: '2026-07-21', blocks: [] })).toEqual(zero)
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

// ── The counted week (UX-443) ──────────────────────────────────
//
// Every test in this block fails against the retired chip, whose numerator was
// the planned minutes of ticked NON-manual rows and nothing else.

const CHILD = 'lincoln'
const WEEK = buildWeekDates('2026-09-21') // Mon 21 – Fri 25 Sep
const TODAY = '2026-09-25'

function day(date: string, checklist: ChecklistItem[], childId = CHILD): DayLog {
  return { childId, date, blocks: [], checklist }
}

function ribbon(input: {
  dayLogs?: DayLog[]
  hoursEntries?: HoursEntry[]
  adjustments?: HoursAdjustment[]
}) {
  return computeRibbonWeek({
    dayLogs: input.dayLogs ?? [],
    hoursEntries: input.hoursEntries ?? [],
    adjustments: input.adjustments ?? [],
    childId: CHILD,
    weekDates: WEEK,
    today: TODAY,
  })
}

const PLANNED_MONDAY = day('2026-09-21', [
  { label: 'Fast Phonics (20m)', completed: true, estimatedMinutes: 20, source: 'planner' },
  { label: 'Math (30m)', completed: false, estimatedMinutes: 30, source: 'planner' },
])

describe('computeRibbonWeek — the chip counts what happened', () => {
  it('a kid’s manual “I Did More” row moves the chip', () => {
    const before = ribbon({ dayLogs: [PLANNED_MONDAY] }).totalMinutes
    const withExtra = ribbon({
      dayLogs: [
        day('2026-09-21', [
          ...PLANNED_MONDAY.checklist!,
          // KidExtraLogger's shape: a completed manual row carrying its minutes.
          {
            label: 'Lego build (25m)',
            completed: true,
            estimatedMinutes: 25,
            source: 'manual',
            subjectBucket: SubjectBucket.Other,
          },
        ]),
      ],
    }).totalMinutes
    expect(withExtra - before).toBe(25)
  })

  it('an `hours` document from the Capture card moves the chip', () => {
    const r = ribbon({
      dayLogs: [PLANNED_MONDAY],
      hoursEntries: [
        {
          id: 'h1',
          childId: CHILD,
          date: '2026-09-23',
          minutes: 45,
          subjectBucket: SubjectBucket.PracticalArts,
          source: 'unified-capture',
        } as HoursEntry,
      ],
    })
    expect(r.totalMinutes).toBe(20 + 45)
  })

  it('a negative `hoursAdjustments` row moves the chip DOWN', () => {
    const before = ribbon({ dayLogs: [PLANNED_MONDAY] }).totalMinutes
    const after = ribbon({
      dayLogs: [PLANNED_MONDAY],
      adjustments: [
        {
          id: 'a1',
          childId: CHILD,
          date: '2026-09-22',
          minutes: -10,
          reason: 'Correction',
          subjectBucket: SubjectBucket.Reading,
        } as HoursAdjustment,
      ],
    }).totalMinutes
    expect(after).toBe(before - 10)
  })

  it('an artifact with no `hours` row does not move it — artifacts carry no minutes', () => {
    // There is no artifact input at all: evidence and time are separate records
    // (AUDIT-234 / FEAT-238), and the ribbon reads only the three time sources.
    const r = ribbon({ dayLogs: [PLANNED_MONDAY] })
    expect(r.totalMinutes).toBe(20)
    expect(Object.keys(ribbonLogic)).not.toContain('artifactMinutes')
  })

  it('is the shared fold’s total, exactly — no second arithmetic', () => {
    const dayLogs = [PLANNED_MONDAY]
    const hoursEntries = [
      { id: 'h', childId: CHILD, date: '2026-09-26', minutes: 60, subjectBucket: SubjectBucket.Science },
    ] as HoursEntry[]
    const r = ribbon({ dayLogs, hoursEntries })
    expect(r.totalMinutes).toBe(
      computeHoursSummary(dayLogs, hoursEntries, [], CHILD).totalMinutes,
    )
    // Saturday's Dad Lab counts in the chip even though it has no dot.
    expect(r.totalMinutes).toBe(80)
    expect(r.stats.reduce((s, d) => s + d.countedMinutes, 0)).toBe(20)
  })

  it('counts his own week and never his brother’s', () => {
    const r = ribbon({
      dayLogs: [
        PLANNED_MONDAY,
        day('2026-09-21', [{ label: 'His (45m)', completed: true, estimatedMinutes: 45 }], 'london'),
      ],
    })
    expect(r.totalMinutes).toBe(20)
    expect(r.stats[0].plannedMinutes).toBe(50)
  })
})

describe('bucketContributionsByDate', () => {
  it('sums by date, subtracts negatives, and names only subjects that added time', () => {
    const buckets = bucketContributionsByDate([
      { date: '2026-09-21', minutes: 20, subjectBucket: 'Reading' },
      { date: '2026-09-21', minutes: 30, subjectBucket: 'Math' },
      { date: '2026-09-22', minutes: -10, subjectBucket: 'Science' },
    ])
    expect(buckets['2026-09-21']).toEqual({ minutes: 50, subjects: ['Reading', 'Math'] })
    expect(buckets['2026-09-22']).toEqual({ minutes: -10, subjects: [] })
  })
})

describe('computeWeekStats', () => {
  it('produces one entry per weekday, labelled Mon..Fri', () => {
    const stats = computeWeekStats(WEEK, {}, {}, TODAY)
    expect(stats).toHaveLength(5)
    expect(stats.map((s) => s.label)).toEqual([...DAY_LABELS])
  })
})

// ── The chip label (UX-443) ────────────────────────────────────

describe('formatCountedHours', () => {
  it('has no slash, no target, no percentage — for any value', () => {
    for (const minutes of [0, 5, 45, 59, 60, 90, 138, 228, 600, 1500]) {
      const label = formatCountedHours(minutes)
      expect(label).not.toContain('/')
      expect(label).not.toContain('%')
    }
  })

  it('reads minutes under an hour and hours at or above one', () => {
    expect(formatCountedHours(45)).toBe('45 min')
    expect(formatCountedHours(60)).toBe('1 hr')
    expect(formatCountedHours(120)).toBe('2 hrs')
    expect(formatCountedHours(228)).toBe('3.8 hrs')
  })

  it('reads a zero or negative total as none, never as a negative duration', () => {
    expect(formatCountedHours(0)).toBe('0 min')
    expect(formatCountedHours(-20)).toBe('0 min')
    expect(formatCountedHours(Number.NaN)).toBe('0 min')
  })

  it('the retired ratio formatter is gone', () => {
    expect(Object.keys(ribbonLogic)).not.toContain('formatHoursChip')
    expect(Object.keys(ribbonLogic)).not.toContain('getPlannedAndLogged')
  })
})

// ── isWeekEmpty (UX-444) ───────────────────────────────────────

describe('isWeekEmpty', () => {
  it('is true only when nothing was planned AND nothing was counted', () => {
    const r = ribbon({})
    expect(isWeekEmpty(r.stats, r.totalMinutes)).toBe(true)
  })

  it('is false for a week with counted time and no plan', () => {
    const r = ribbon({
      hoursEntries: [
        { id: 'h', childId: CHILD, date: '2026-09-22', minutes: 30, subjectBucket: SubjectBucket.Art },
      ] as HoursEntry[],
    })
    expect(r.stats.every((s) => s.plannedMinutes === 0)).toBe(true)
    expect(isWeekEmpty(r.stats, r.totalMinutes)).toBe(false)
  })

  it('is false for a week whose only time is a weekend, which has no dot', () => {
    const r = ribbon({
      adjustments: [
        { id: 'a', childId: 'both', date: '2026-09-26', minutes: 60, reason: 'Dad Lab' },
      ] as HoursAdjustment[],
    })
    expect(isWeekEmpty(r.stats, r.totalMinutes)).toBe(false)
  })

  it('is false when any day has a plan', () => {
    const r = ribbon({ dayLogs: [PLANNED_MONDAY] })
    expect(isWeekEmpty(r.stats, r.totalMinutes)).toBe(false)
  })
})
