import { describe, expect, it } from 'vitest'

import { getSchoolYearRange, getWeekRange, lastCompletedWeekKey } from './time'

describe('getWeekRange', () => {
  it('returns Sun–Sat range for a Wednesday (default weekStartsOn=0)', () => {
    const wed = new Date(2026, 3, 15) // Wed Apr 15, 2026
    const range = getWeekRange(wed)

    expect(range.start).toBe('2026-04-12') // Sunday
    expect(range.end).toBe('2026-04-18') // Saturday
  })

  it('returns correct range when date is Sunday (start of week)', () => {
    const sun = new Date(2026, 3, 12) // Sun Apr 12, 2026
    const range = getWeekRange(sun)

    expect(range.start).toBe('2026-04-12') // same Sunday
    expect(range.end).toBe('2026-04-18')
  })

  it('returns correct range when date is Saturday (end of week)', () => {
    const sat = new Date(2026, 3, 18) // Sat Apr 18, 2026
    const range = getWeekRange(sat)

    expect(range.start).toBe('2026-04-12')
    expect(range.end).toBe('2026-04-18') // same Saturday
  })

  it('uses Monday start when weekStartsOn=1', () => {
    const wed = new Date(2026, 3, 15) // Wed Apr 15, 2026
    const range = getWeekRange(wed, 1)

    expect(range.start).toBe('2026-04-13') // Monday
    expect(range.end).toBe('2026-04-19') // Sunday
  })

  it('handles Sunday with weekStartsOn=1 (returns current week, not next)', () => {
    const sun = new Date(2026, 3, 19) // Sun Apr 19, 2026
    const range = getWeekRange(sun, 1)

    expect(range.start).toBe('2026-04-13') // previous Monday
    expect(range.end).toBe('2026-04-19') // same Sunday
  })

  it('handles month boundary crossings', () => {
    const tue = new Date(2026, 2, 31) // Tue Mar 31, 2026
    const range = getWeekRange(tue)

    expect(range.start).toBe('2026-03-29') // Sunday in March
    expect(range.end).toBe('2026-04-04') // Saturday in April
  })

  it('handles year boundary crossings', () => {
    const wed = new Date(2025, 11, 31) // Wed Dec 31, 2025
    const range = getWeekRange(wed)

    expect(range.start).toBe('2025-12-28') // Sunday in December
    expect(range.end).toBe('2026-01-03') // Saturday in January
  })
})

describe('lastCompletedWeekKey', () => {
  it('returns the previous Sunday when called on a Sunday', () => {
    // Sunday Apr 19, 2026 — just-completed week started Apr 12
    const sun = new Date(2026, 3, 19)
    expect(lastCompletedWeekKey(sun)).toBe('2026-04-12')
  })

  it('returns the same Sunday when called on Monday the next week', () => {
    // Monday Apr 20, 2026 — last-completed week started Apr 12
    const mon = new Date(2026, 3, 20)
    expect(lastCompletedWeekKey(mon)).toBe('2026-04-12')
  })

  it('returns the same Sunday when called mid-week', () => {
    // Wed Apr 22, 2026 — last-completed week still started Apr 12
    const wed = new Date(2026, 3, 22)
    expect(lastCompletedWeekKey(wed)).toBe('2026-04-12')
  })

  it('returns the prior Sunday on Saturday of the current week', () => {
    // Sat Apr 18, 2026 — the current week (Apr 12–18) is not yet complete,
    // so the most recently completed week is Apr 5–11
    const sat = new Date(2026, 3, 18)
    expect(lastCompletedWeekKey(sat)).toBe('2026-04-05')
  })
})

describe('getSchoolYearRange', () => {
  it('returns the current school year for dates on or after July 1', () => {
    const result = getSchoolYearRange(new Date(2024, 6, 1))

    expect(result).toEqual({
      start: '2024-07-01',
      end: '2025-06-30',
    })
  })

  it('returns the prior school year for dates before July 1', () => {
    const result = getSchoolYearRange(new Date(2024, 5, 30))

    expect(result).toEqual({
      start: '2023-07-01',
      end: '2024-06-30',
    })
  })
})
