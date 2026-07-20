import { describe, expect, it } from 'vitest'

import { getPlanningWeekRange, getSchoolYearRange, getWeekRange, lastCompletedWeekKey } from './time'

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

describe('getPlanningWeekRange', () => {
  // The week of the FEAT-112 bug report: school week Mon Jul 20 – Fri Jul 24, 2026.
  // Sun–Sat week containing Fri/Sat is Jul 12–18; the one containing Sun/Mon is Jul 19–25.
  const MON = '2026-07-20'
  const FRI = '2026-07-24'
  // Add `offset` days to a YYYY-MM-DD start and format back in LOCAL time
  // (avoids the UTC shift that toISOString() would introduce).
  const dayFrom = (start: string, offset: number) => {
    const d = new Date(start + 'T00:00:00')
    d.setDate(d.getDate() + offset)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  const mondayOf = (r: { start: string }) => dayFrom(r.start, 1)
  const fridayOf = (r: { start: string }) => dayFrom(r.start, 5)

  it('Friday plans the current (in-progress) Mon–Fri week', () => {
    const fri = new Date(2026, 6, 17) // Fri Jul 17, 2026
    const range = getPlanningWeekRange(fri)
    expect(range.start).toBe('2026-07-12') // this week's Sunday
    expect(mondayOf(range)).toBe('2026-07-13')
    expect(fridayOf(range)).toBe('2026-07-17')
  })

  it('Saturday rolls forward to the UPCOMING Mon–Fri week (the bug fix)', () => {
    const sat = new Date(2026, 6, 18) // Sat Jul 18, 2026
    const range = getPlanningWeekRange(sat)
    expect(range.start).toBe('2026-07-19') // NEXT Sunday, not Jul 12
    expect(mondayOf(range)).toBe(MON)
    expect(fridayOf(range)).toBe(FRI)
  })

  it('Sunday plans the upcoming Mon–Fri week', () => {
    const sun = new Date(2026, 6, 19) // Sun Jul 19, 2026
    const range = getPlanningWeekRange(sun)
    expect(range.start).toBe('2026-07-19')
    expect(mondayOf(range)).toBe(MON)
    expect(fridayOf(range)).toBe(FRI)
  })

  it('Monday plans its own (current) Mon–Fri week', () => {
    const mon = new Date(2026, 6, 20) // Mon Jul 20, 2026
    const range = getPlanningWeekRange(mon)
    expect(range.start).toBe('2026-07-19')
    expect(mondayOf(range)).toBe(MON)
    expect(fridayOf(range)).toBe(FRI)
  })

  it('Saturday/Sunday/Monday all agree on the same upcoming week', () => {
    const sat = getPlanningWeekRange(new Date(2026, 6, 18))
    const sun = getPlanningWeekRange(new Date(2026, 6, 19))
    const mon = getPlanningWeekRange(new Date(2026, 6, 20))
    expect(sat.start).toBe(sun.start)
    expect(sun.start).toBe(mon.start)
  })

  it('Saturday roll handles month/year boundary crossings', () => {
    const sat = new Date(2025, 11, 27) // Sat Dec 27, 2025 (week Dec 21–27)
    const range = getPlanningWeekRange(sat)
    expect(range.start).toBe('2025-12-28') // next Sunday
    expect(range.end).toBe('2026-01-03') // Saturday in January
  })

  it('forward-shift invariant: the derived week is NEVER entirely in the past', () => {
    // Sweep a full week of "now" values (each weekday) and confirm the derived
    // planning week's Friday is always today-or-future — this is what the
    // Part 4 forward-shift relies on (the shifted target is always applicable).
    const pad = (n: number) => String(n).padStart(2, '0')
    for (let day = 13; day <= 26; day++) {
      const now = new Date(2026, 6, day, 12, 0, 0) // noon local, Jul 13–26 2026
      const todayKey = `2026-07-${pad(day)}`
      const range = getPlanningWeekRange(now)
      const friday = new Date(range.start + 'T00:00:00')
      friday.setDate(friday.getDate() + 5)
      const fridayKey = `${friday.getFullYear()}-${pad(friday.getMonth() + 1)}-${pad(friday.getDate())}`
      expect(fridayKey >= todayKey).toBe(true)
    }
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
