import { formatDateYmd } from './format'

export type WeekRange = {
  start: string
  end: string
}

export const getWeekRange = (date: Date = new Date(), weekStartsOn = 0): WeekRange => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayOfWeek = start.getDay()
  const offset = (dayOfWeek - weekStartsOn + 7) % 7
  start.setDate(start.getDate() - offset)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  return {
    start: formatDateYmd(start),
    end: formatDateYmd(end),
  }
}

/**
 * Sunday-start week range for *planning the school week*.
 *
 * The school body is Monday–Friday (`WEEK_DAYS` in `chatPlanner.logic.ts`), but
 * `getWeekRange` returns the Sun–Sat week that *contains* `now`. From Saturday
 * onward the Mon–Fri body of that week is already in the past, so planning on a
 * Saturday against the plain `getWeekRange` start targets days that have gone by
 * (the FEAT-112 bug: a weekend plan landed on the previous Mon–Fri).
 *
 * The rule, in one sentence: **plan the Mon–Fri of the Sun–Sat week containing
 * today, except on Saturday — when that block has fully passed — roll forward
 * to the next week, so weekend planning always targets the upcoming school
 * week.** (Sunday needs no roll: `getWeekRange(Sunday)` already starts on that
 * Sunday, so its Mon–Fri is tomorrow-onward. Monday–Friday resolve to the
 * in-progress week, unchanged.)
 *
 * This is deliberately planning-specific and does **not** touch `getWeekRange`,
 * which stays the shared Sun–Sat helper for hours / compliance / records week
 * math. Only the planner consumes this.
 */
export const getPlanningWeekRange = (now: Date = new Date()): WeekRange => {
  const base = getWeekRange(now) // Sun–Sat week containing `now`
  // Sun (0) already resolves to the upcoming Mon–Fri; Mon–Fri (1–5) to the
  // in-progress week. Only Saturday (6) needs rolling forward a week.
  if (now.getDay() !== 6) return base

  const start = new Date(base.start + 'T00:00:00')
  start.setDate(start.getDate() + 7)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return {
    start: formatDateYmd(start),
    end: formatDateYmd(end),
  }
}

/**
 * Return the Sunday-start key of the most recently completed Sun–Sat week.
 * Mirrors `lastWeekKey` in `functions/src/ai/evaluate.ts` so the weekly
 * review page and the scheduled Cloud Function agree on which week's doc
 * to read/write. The school week runs Sunday–Saturday; this returns the
 * Sunday that started the week ending on the most recent Saturday.
 */
export const lastCompletedWeekKey = (today: Date = new Date()): string => {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const dayOfWeek = d.getDay()
  const offset = dayOfWeek === 0 ? 7 : dayOfWeek + 7
  d.setDate(d.getDate() - offset)
  return formatDateYmd(d)
}

type SchoolYearRange = {
  start: string
  end: string
}

export const getSchoolYearRange = (today: Date = new Date()): SchoolYearRange => {
  const year = today.getFullYear()
  const monthIndex = today.getMonth()
  const isAfterJune = monthIndex >= 6
  const startYear = isAfterJune ? year : year - 1
  const endYear = isAfterJune ? year + 1 : year

  const startDate = new Date(startYear, 6, 1)
  const endDate = new Date(endYear, 5, 30)

  return {
    start: formatDateYmd(startDate),
    end: formatDateYmd(endDate),
  }
}
