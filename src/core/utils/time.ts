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
 * The Sunday key of the most recent school week whose **Mon–Fri body has
 * ended** (UX-218).
 *
 * This used to answer a different question — the most recent Sun–Sat week whose
 * *Saturday* had passed — and on a Saturday that is two school weeks back. The
 * owner opened the review on **Saturday Sep 5, 2026** and read *"Week of Aug
 * 23–29"*, while the week he had just finished, Aug 31–Sep 4, had ended the day
 * before and was nowhere on the page.
 *
 * **It is FEAT-196's Friday hole, one surface over.** The planner learned that
 * the school body is Mon–Fri and rolled its default forward accordingly
 * (`getPlanningWeekRange` above); the review kept counting whole Sun–Sat weeks.
 * The two rules are neighbours and disagreed, which is why this one is built on
 * `getWeekRange` — the same helper the planner's roll resolves from — rather
 * than on a second copy of the date arithmetic. Writing that second copy is what
 * produced the bug.
 *
 * The rule, in one sentence: **the Mon–Fri of the Sun–Sat week containing today,
 * except that on any day but Saturday that body is still ahead or in progress,
 * so step back one week.** Saturday is the only day on which the containing
 * week's school days are all behind us.
 *
 * | Called on          | Returns   | School week it names |
 * |--------------------|-----------|----------------------|
 * | Sat Sep 5          | Aug 30    | Aug 31 – Sep 4       |
 * | Sun Sep 6          | Aug 30    | Aug 31 – Sep 4       |
 * | Mon Sep 7 – Fri 11 | Aug 30    | Aug 31 – Sep 4       |
 * | Sat Sep 12         | Sep 6     | Sep 7 – Sep 11       |
 *
 * **It now agrees with the Cloud Function on every day, not just one (UX-263).**
 * `lastWeekKey` in `functions/src/ai/evaluate.ts` was a table of offsets that
 * matched this rule on Sunday–Friday and diverged on Saturday, which was
 * harmless only while the cron could not run on a Saturday. Moving the review to
 * **Saturday 21:00 CT** — so it is ready all day Sunday, which is when a parent
 * looks — made that Saturday branch load-bearing, and it was rewritten as this
 * same one-sentence rule. Two definitions still, one on each side of the project
 * boundary, pinned to each other by an agreement test in *both* suites: this
 * file's walks the CF's rule, `evaluate.test.ts`'s walks this one, and both cover
 * all seven weekdays.
 *
 * So the page reads the document the cron writes on every day of the week, and
 * on Saturday **before 21:00** it names a week whose document has not been
 * written yet — which the page says (`POSITIONS_PENDING_LINE`), rather than
 * showing an older week instead.
 *
 * Renamed from `lastCompletedWeekKey` deliberately: the semantics changed from
 * "the last whole Sun–Sat week" to "the last completed school week", and a name
 * that still promised the old rule would invite the next caller to reuse it for
 * records or compliance math. `getWeekRange` remains the shared Sun–Sat helper
 * for those; nothing here touches it.
 */
export const lastCompletedSchoolWeekKey = (today: Date = new Date()): string => {
  const base = getWeekRange(today) // Sun–Sat week containing `today`
  if (today.getDay() === 6) return base.start

  const start = new Date(base.start + 'T00:00:00')
  start.setDate(start.getDate() - 7)
  return formatDateYmd(start)
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
