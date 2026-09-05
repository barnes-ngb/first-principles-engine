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
 * The **default** Sunday-start week range for *planning the school week*.
 *
 * The school body is Monday–Friday (`WEEK_DAYS` in `chatPlanner.logic.ts`), but
 * `getWeekRange` returns the Sun–Sat week that *contains* `now`. From Friday
 * onward the Mon–Fri body of that week is spent, so planning against the plain
 * `getWeekRange` start targets days that have gone by (the FEAT-112 bug: a
 * weekend plan landed on the previous Mon–Fri).
 *
 * The rule, in one sentence: **plan the Mon–Fri of the Sun–Sat week containing
 * today, except from Friday on — when that block is over or ending — roll
 * forward to the next week, so late-week planning targets the upcoming school
 * week.** (Sunday needs no roll: `getWeekRange(Sunday)` already starts on that
 * Sunday, so its Mon–Fri is tomorrow-onward. Sunday–Thursday resolve to the
 * in-progress week, unchanged.)
 *
 * **Friday was FEAT-112's remaining hole (FEAT-196).** It rolled only on
 * Saturday, and called Friday's in-progress week correct in this very comment.
 * It is not: on Friday afternoon four days of the Mon–Fri body are gone and the
 * fifth is ending, so a parent opening the planner means *next* week — which is
 * exactly what the owner hit ("I think Shelly tried to plan the next week on
 * Friday"). Sunday–Thursday keep the containing week.
 *
 * This is a **default, not a verdict.** Any weekday guess is wrong for someone —
 * re-planning next week on a Wednesday is ordinary and no roll rule can express
 * it — so the planner pairs this with an explicit This week / Next week selector
 * (`planner-chat/planningWeekSelection.ts`), which resolves the default *from
 * this function* rather than restating the rule.
 *
 * This is deliberately planning-specific and does **not** touch `getWeekRange`,
 * which stays the shared Sun–Sat helper for hours / compliance / records week
 * math. Only the planner consumes this.
 */
export const getPlanningWeekRange = (now: Date = new Date()): WeekRange => {
  const base = getWeekRange(now) // Sun–Sat week containing `now`
  // Sun (0) already resolves to the upcoming Mon–Fri; Mon–Thu (1–4) to the
  // in-progress week. Friday (5) and Saturday (6) roll forward a week.
  if (now.getDay() < 5) return base

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
