import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import {
  todayKey,
  weekKeyFromDate,
  weekRangeFromDateKey,
  formatDateShort,
  formatWeekShort,
  navTo,
} from './dateKey'

// ─── todayKey ───────────────────────────────────────────────────────────────

describe('todayKey', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns YYYY-MM-DD for the current date', () => {
    vi.setSystemTime(new Date(2026, 5, 7)) // June 7, 2026
    expect(todayKey()).toBe('2026-06-07')
  })

  it('zero-pads single-digit months and days', () => {
    vi.setSystemTime(new Date(2026, 0, 5)) // Jan 5, 2026
    expect(todayKey()).toBe('2026-01-05')
  })

  it('handles year boundary (Dec 31)', () => {
    vi.setSystemTime(new Date(2025, 11, 31))
    expect(todayKey()).toBe('2025-12-31')
  })

  it('handles year boundary (Jan 1)', () => {
    vi.setSystemTime(new Date(2026, 0, 1))
    expect(todayKey()).toBe('2026-01-01')
  })
})

// ─── weekKeyFromDate ────────────────────────────────────────────────────────

describe('weekKeyFromDate', () => {
  it('returns the Sunday start of the week for a mid-week date', () => {
    const wed = new Date(2026, 3, 15) // Wed Apr 15, 2026
    expect(weekKeyFromDate(wed)).toBe('2026-04-12') // Sunday
  })

  it('returns the same day for a Sunday', () => {
    const sun = new Date(2026, 3, 12) // Sun Apr 12, 2026
    expect(weekKeyFromDate(sun)).toBe('2026-04-12')
  })

  it('returns the previous Sunday for a Saturday', () => {
    const sat = new Date(2026, 3, 18) // Sat Apr 18, 2026
    expect(weekKeyFromDate(sat)).toBe('2026-04-12')
  })

  it('handles month boundary crossings', () => {
    const tue = new Date(2026, 3, 1) // Wed Apr 1, 2026
    const key = weekKeyFromDate(tue)
    expect(key).toBe('2026-03-29') // Sunday is in March
  })
})

// ─── weekRangeFromDateKey ───────────────────────────────────────────────────

describe('weekRangeFromDateKey', () => {
  it('returns a Sun–Sat range for a valid date string', () => {
    const range = weekRangeFromDateKey('2026-04-15')
    expect(range.start).toBe('2026-04-12')
    expect(range.end).toBe('2026-04-18')
  })

  it('handles a Sunday date key', () => {
    const range = weekRangeFromDateKey('2026-04-12')
    expect(range.start).toBe('2026-04-12')
    expect(range.end).toBe('2026-04-18')
  })

  it('falls back to current week for invalid date string', () => {
    const range = weekRangeFromDateKey('not-a-date')
    expect(range.start).toBeDefined()
    expect(range.end).toBeDefined()
    expect(range.start.length).toBe(10) // YYYY-MM-DD
  })

  it('falls back to current week for empty string', () => {
    const range = weekRangeFromDateKey('')
    expect(range.start).toBeDefined()
    expect(range.end).toBeDefined()
  })
})

// ─── formatDateShort ────────────────────────────────────────────────────────

describe('formatDateShort', () => {
  it('formats a valid date as "Mon DD"', () => {
    const result = formatDateShort('2026-02-15')
    expect(result).toBe('Feb 15')
  })

  it('formats January 1 correctly', () => {
    const result = formatDateShort('2026-01-01')
    expect(result).toBe('Jan 1')
  })

  it('formats December 31 correctly', () => {
    const result = formatDateShort('2025-12-31')
    expect(result).toBe('Dec 31')
  })

  it('returns original string for invalid date', () => {
    expect(formatDateShort('invalid')).toBe('invalid')
  })

  it('returns original string for empty string', () => {
    expect(formatDateShort('')).toBe('')
  })
})

// ─── formatWeekShort ────────────────────────────────────────────────────────

describe('formatWeekShort', () => {
  it('formats a week range as "Mon DD - Mon DD"', () => {
    const result = formatWeekShort('2026-04-12')
    expect(result).toBe('Apr 12 - Apr 18')
  })

  it('handles month boundary crossing in range', () => {
    const result = formatWeekShort('2026-03-29')
    expect(result).toBe('Mar 29 - Apr 4')
  })
})

// ─── navTo ──────────────────────────────────────────────────────────────────

describe('navTo', () => {
  it('today() returns /today without a date', () => {
    expect(navTo.today()).toBe('/today')
  })

  it('today() appends date query param when provided', () => {
    expect(navTo.today('2026-01-10')).toBe('/today?date=2026-01-10')
  })

  it('week() returns /week without a weekStart', () => {
    expect(navTo.week()).toBe('/week')
  })

  it('week() appends week query param when provided', () => {
    expect(navTo.week('2026-04-12')).toBe('/week?week=2026-04-12')
  })

  it('dadLab() returns /dad-lab', () => {
    expect(navTo.dadLab()).toBe('/dad-lab')
  })

  it('artifacts() returns /records', () => {
    expect(navTo.artifacts()).toBe('/records')
  })
})
