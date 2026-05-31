import { describe, expect, it } from 'vitest'

import { formatDateShort, formatWeekShort, navTo, weekKeyFromDate, weekRangeFromDateKey } from './dateKey'

describe('weekKeyFromDate', () => {
  it('returns the week start date for a Wednesday', () => {
    const wed = new Date(2026, 3, 15) // Wed Apr 15
    const key = weekKeyFromDate(wed)
    expect(key).toBe('2026-04-12') // Sunday start
  })

  it('returns the same date when given a Sunday', () => {
    const sun = new Date(2026, 3, 12)
    expect(weekKeyFromDate(sun)).toBe('2026-04-12')
  })

  it('returns the prior Sunday for a Saturday', () => {
    const sat = new Date(2026, 3, 18)
    expect(weekKeyFromDate(sat)).toBe('2026-04-12')
  })
})

describe('weekRangeFromDateKey', () => {
  it('returns the correct week range for a valid date', () => {
    const range = weekRangeFromDateKey('2026-04-15')
    expect(range.start).toBe('2026-04-12')
    expect(range.end).toBe('2026-04-18')
  })

  it('falls back to current week for an invalid date string', () => {
    const range = weekRangeFromDateKey('not-a-date')
    expect(range.start).toBeDefined()
    expect(range.end).toBeDefined()
    expect(range.start < range.end).toBe(true)
  })
})

describe('formatDateShort', () => {
  it('formats a valid YYYY-MM-DD as short date', () => {
    const result = formatDateShort('2026-04-15')
    expect(result).toContain('Apr')
    expect(result).toContain('15')
  })

  it('returns the raw string for an invalid date', () => {
    expect(formatDateShort('bad-date')).toBe('bad-date')
  })
})

describe('formatWeekShort', () => {
  it('formats a week range as "start - end"', () => {
    const result = formatWeekShort('2026-04-12')
    expect(result).toContain('Apr')
    expect(result).toContain(' - ')
    expect(result).toContain('12')
    expect(result).toContain('18')
  })
})

describe('navTo', () => {
  it('today() returns /today without param', () => {
    expect(navTo.today()).toBe('/today')
  })

  it('today(dateKey) includes the date query param', () => {
    expect(navTo.today('2026-04-15')).toBe('/today?date=2026-04-15')
  })

  it('week() returns /week without param', () => {
    expect(navTo.week()).toBe('/week')
  })

  it('week(weekStart) includes the week query param', () => {
    expect(navTo.week('2026-04-12')).toBe('/week?week=2026-04-12')
  })

  it('dadLab returns the correct path', () => {
    expect(navTo.dadLab()).toBe('/dad-lab')
  })

  it('artifacts returns /records', () => {
    expect(navTo.artifacts()).toBe('/records')
  })
})
