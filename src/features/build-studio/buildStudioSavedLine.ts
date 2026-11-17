/**
 * The day and time a version was saved, in ONE clock — the family's.
 *
 * Plain TS rather than an export beside the shelf component, which is the
 * `react-refresh/only-export-components` rule: a module that exports a
 * component and a helper loses its fast-refresh state.
 *
 * `createdAt.slice(0, 10)` was the bug this replaces: it is the UTC date,
 * printed beside a `formatClockTime` reading in `America/Chicago`, so a 7 p.m.
 * Central save showed tomorrow's date next to this evening's time. Both halves
 * come out of the same zone now, so they cannot disagree.
 */

import { FAMILY_TIME_ZONE, formatClockTime } from '../../core/utils/clockTime'

export function savedLine(createdAt: string | undefined): string {
  if (!createdAt) return 'Saved — time unknown'
  const instant = new Date(createdAt)
  if (Number.isNaN(instant.getTime())) return 'Saved — time unknown'
  const time = formatClockTime(createdAt)
  let day: string
  try {
    day = new Intl.DateTimeFormat('en-US', {
      timeZone: FAMILY_TIME_ZONE,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(instant)
  } catch {
    return 'Saved — time unknown'
  }
  return time ? `Saved ${day} at ${time}` : `Saved ${day}`
}
