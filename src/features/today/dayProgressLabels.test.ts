// TZ is pinned BEFORE anything constructs a Date, so "8 PM" means the family's
// 8 PM and not the CI runner's. Every input below is built with the local-time
// `Date(y, m, d, h, min)` constructor for the same reason — a UTC instant would
// land on a different civil hour depending on where the suite runs, which is
// exactly the class of bug UX-07 is.
process.env.TZ = 'America/Chicago'

import { describe, expect, it } from 'vitest'

import {
  ESTIMATE_CUTOFF_HOUR,
  buildFinishLabel,
  dayPlanTitle,
  formatMinutes,
  plannedMinutesClause,
  weekdayName,
} from './dayProgressLabels'

/** A local-time instant, so assertions hold in the pinned zone. */
const at = (h: number, min = 0) => new Date(2026, 7, 26, h, min).getTime()

describe('buildFinishLabel — UX-07', () => {
  it('gives a clock time for today, in the morning, inside the cutoff', () => {
    expect(
      buildFinishLabel({ isToday: true, nowMs: at(9, 0), remainingMinutes: 130, allComplete: false }),
    ).toBe(' · Est. finish: 11:10 AM')
  })

  // The named indictment: 21:05 on a 350-minute unstarted day.
  it('NEVER promises a middle-of-the-night finish', () => {
    const label = buildFinishLabel({
      isToday: true,
      nowMs: at(21, 5),
      remainingMinutes: 350,
      allComplete: false,
    })
    expect(label).toBe(' · ~5h 50m left')
    expect(label).not.toMatch(/AM/)
    expect(label).not.toMatch(/Est\. finish/)
  })

  it('falls back to the quantity once the estimate crosses the cutoff hour', () => {
    // 19:30 + 45m = 20:15 — past 20:00, so no clock time.
    expect(
      buildFinishLabel({ isToday: true, nowMs: at(19, 30), remainingMinutes: 45, allComplete: false }),
    ).toBe(' · ~45m left')
    // 19:00 + 45m = 19:45 — inside it.
    expect(
      buildFinishLabel({ isToday: true, nowMs: at(19, 0), remainingMinutes: 45, allComplete: false }),
    ).toBe(' · Est. finish: 7:45 PM')
    expect(ESTIMATE_CUTOFF_HOUR).toBe(20)
  })

  it('renders no clock time at all on a past or upcoming day', () => {
    // Same numbers that produce "11:10 AM" above — the ONLY difference is the
    // day being viewed, which the component previously could not see.
    const label = buildFinishLabel({
      isToday: false,
      nowMs: at(9, 0),
      remainingMinutes: 130,
      allComplete: false,
    })
    expect(label).toBe(' · 2h 10m left')
    expect(label).not.toMatch(/Est\. finish/)
  })

  it('resolves on the last checkbox instead of vanishing', () => {
    expect(
      buildFinishLabel({ isToday: true, nowMs: at(9), remainingMinutes: 0, allComplete: true }),
    ).toBe(' · All done')
  })

  it('claims nothing when there is nothing left AND nothing was completed', () => {
    expect(
      buildFinishLabel({ isToday: true, nowMs: at(9), remainingMinutes: 0, allComplete: false }),
    ).toBe('')
  })
})

describe('plannedMinutesClause — UX-25', () => {
  it('omits the clause at zero rather than leading with "0m planned"', () => {
    expect(plannedMinutesClause(0)).toBe('')
    expect(plannedMinutesClause(-5)).toBe('')
  })

  it('renders normally above zero', () => {
    expect(plannedMinutesClause(80)).toBe('1h 20m planned · ')
  })
})

describe('dayPlanTitle / weekdayName — UX-28', () => {
  it('names the day being viewed when it is not today', () => {
    expect(dayPlanTitle('2026-08-26', false)).toBe("Wednesday's Plan")
    expect(dayPlanTitle('2026-08-26', true)).toBe("Today's Plan")
  })

  it('still reads as English on an unparseable date key', () => {
    expect(dayPlanTitle('not-a-date', false)).toBe('Day Plan')
    expect(weekdayName('not-a-date')).toBeNull()
    expect(weekdayName('2026-13-99')).toBeNull()
  })

  it('reads the key as a civil date, not a UTC instant', () => {
    // 2026-08-26 is a Wednesday everywhere; parsed as a UTC midnight instant it
    // would render as Tuesday in the pinned (UTC-5) zone.
    expect(weekdayName('2026-08-26')).toBe('Wednesday')
  })
})

describe('formatMinutes', () => {
  it('keeps the checklist minute grammar', () => {
    expect(formatMinutes(0)).toBe('0m')
    expect(formatMinutes(45)).toBe('45m')
    expect(formatMinutes(60)).toBe('1h')
    expect(formatMinutes(130)).toBe('2h 10m')
  })
})
