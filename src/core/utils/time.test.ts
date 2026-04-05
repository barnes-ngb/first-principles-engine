import { describe, expect, it } from 'vitest'

import { getSchoolYearRange, getWeekRange } from './time'

// ─── getWeekRange ─────────────────────────────────────────────────────────────

describe('getWeekRange', () => {
  it('returns Sunday-to-Saturday range by default (weekStartsOn=0)', () => {
    // Wednesday 2026-01-14
    const result = getWeekRange(new Date(2026, 0, 14))

    expect(result.start).toBe('2026-01-11') // Sunday
    expect(result.end).toBe('2026-01-17')   // Saturday
  })

  it('returns Monday-to-Sunday range when weekStartsOn=1', () => {
    // Wednesday 2026-01-14
    const result = getWeekRange(new Date(2026, 0, 14), 1)

    expect(result.start).toBe('2026-01-12') // Monday
    expect(result.end).toBe('2026-01-18')   // Sunday
  })

  it('handles Sunday input with default weekStartsOn=0', () => {
    // Sunday 2026-01-18
    const result = getWeekRange(new Date(2026, 0, 18))

    // Sunday is the start of the week when weekStartsOn=0
    expect(result.start).toBe('2026-01-18') // This Sunday
    expect(result.end).toBe('2026-01-24')   // Saturday
  })

  it('handles Sunday input with weekStartsOn=1 (Monday)', () => {
    // Sunday 2026-01-18
    const result = getWeekRange(new Date(2026, 0, 18), 1)

    // Sunday is the last day when week starts on Monday
    expect(result.start).toBe('2026-01-12') // Previous Monday
    expect(result.end).toBe('2026-01-18')   // This Sunday
  })

  it('handles Monday input with weekStartsOn=1', () => {
    // Monday 2026-01-12
    const result = getWeekRange(new Date(2026, 0, 12), 1)

    expect(result.start).toBe('2026-01-12') // This Monday
    expect(result.end).toBe('2026-01-18')   // Sunday
  })

  it('handles week spanning month boundary', () => {
    // Thursday 2026-01-29
    const result = getWeekRange(new Date(2026, 0, 29))

    expect(result.start).toBe('2026-01-25') // Sunday
    expect(result.end).toBe('2026-01-31')   // Saturday
  })

  it('handles week spanning year boundary', () => {
    // Wednesday 2025-12-31
    const result = getWeekRange(new Date(2025, 11, 31))

    expect(result.start).toBe('2025-12-28') // Sunday
    expect(result.end).toBe('2026-01-03')   // Saturday
  })

  it('handles Saturday input (last day of default week)', () => {
    // Saturday 2026-01-17
    const result = getWeekRange(new Date(2026, 0, 17))

    expect(result.start).toBe('2026-01-11') // Sunday
    expect(result.end).toBe('2026-01-17')   // This Saturday
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
