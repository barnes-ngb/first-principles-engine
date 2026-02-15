import { formatDateYmd, parseDateYmd } from '../../lib/format'
import { getWeekRange } from '../../features/engine/engine.logic'
import type { WeekRange } from '../../features/engine/engine.logic'

/**
 * Return today's date as YYYY-MM-DD using local time.
 */
export const todayKey = (): string => formatDateYmd(new Date())

/**
 * Return the ISO week key (YYYY-WNN) for a given date.
 * Uses Monday-based weeks consistent with getWeekRange.
 */
export const weekKeyFromDate = (date: Date): string => {
  const range = getWeekRange(date)
  return range.start
}

/**
 * Get the WeekRange for a YYYY-MM-DD date string.
 * Falls back to current week if the string is invalid.
 */
export const weekRangeFromDateKey = (dateKey: string): WeekRange => {
  const parsed = parseDateYmd(dateKey)
  return getWeekRange(parsed ?? new Date())
}

/**
 * Format a YYYY-MM-DD string for display (e.g. "Feb 15").
 */
export const formatDateShort = (dateKey: string): string => {
  const parsed = parseDateYmd(dateKey)
  if (!parsed) return dateKey
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Format a week range for display (e.g. "Feb 10 - Feb 16").
 */
export const formatWeekShort = (weekStart: string): string => {
  const range = weekRangeFromDateKey(weekStart)
  return `${formatDateShort(range.start)} - ${formatDateShort(range.end)}`
}

/**
 * Build a nav path with query params preserved.
 */
export const navTo = {
  today: (dateKey?: string): string => {
    if (dateKey) return `/today?date=${dateKey}`
    return '/today'
  },
  week: (weekStart?: string): string => {
    if (weekStart) return `/week?week=${weekStart}`
    return '/week'
  },
  dadLab: (weekStart?: string): string => {
    if (weekStart) return `/week/lab?week=${weekStart}`
    return '/week/lab'
  },
  artifacts: (): string => '/records',
}
