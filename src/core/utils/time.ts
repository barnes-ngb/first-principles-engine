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
