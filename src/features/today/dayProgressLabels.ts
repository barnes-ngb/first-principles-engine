/**
 * Pure copy helpers for Today's checklist summary line and card title (FEAT-161,
 * UX-07 / UX-25 / UX-28).
 *
 * These exist as their own module because every one of them is a *guard* on a
 * computed number, and a guard is only trustworthy if it is testable without a
 * render. The rule they all share: a number the surface cannot honestly claim
 * must not be dressed up as one it can.
 */

/**
 * Latest civil hour (family zone) at which a clock-time finish estimate still
 * says something useful. Past this, "Est. finish: 10:40 PM" is arithmetic, not
 * a plan — the honest answer is how much work is left, not what time a
 * hypothetical unbroken run would end.
 */
export const ESTIMATE_CUTOFF_HOUR = 20

/** "1h 20m" / "45m" / "2h" — the checklist's minute grammar, one definition. */
export function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatTime12h(date: Date): string {
  const h = date.getHours()
  const m = date.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

export interface FinishLabelInput {
  /** Is the day being VIEWED the real today? A past or upcoming day has no "now". */
  isToday: boolean
  /** Wall clock, ms. Only read when `isToday`. */
  nowMs: number
  /** Minutes of unfinished work on the day. */
  remainingMinutes: number
  /** True when every item the day counts is complete — the resolved state. */
  allComplete: boolean
}

/**
 * The tail of the checklist summary line — "· Est. finish: 11:15 AM",
 * "· ~2h 10m left", "· All done", or nothing.
 *
 * UX-07 ("Est. finish: 2:55 AM"): the old version read the raw wall clock and
 * rendered a clock time on **any** day at **any** hour, so an evening glance at
 * an unstarted Wednesday promised a middle-of-the-night finish, and a past day
 * promised one at all. Three rules now hold:
 *
 *  1. A clock time is only rendered for the day that actually has a "now"
 *     (`isToday`) — never a past or upcoming day.
 *  2. It is only rendered when the estimate lands on the same civil day and
 *     before {@link ESTIMATE_CUTOFF_HOUR}. Otherwise the honest quantity that
 *     was already computed is shown instead: "~2h 10m left".
 *  3. A finished day **resolves** ("All done") rather than silently dropping
 *     the clause, which is what the old `remainingMinutes > 0` guard did — the
 *     last checkbox made the line vanish with no acknowledgement.
 */
export function buildFinishLabel({
  isToday,
  nowMs,
  remainingMinutes,
  allComplete,
}: FinishLabelInput): string {
  if (allComplete) return ' · All done'
  if (remainingMinutes <= 0) return ''
  if (!isToday) return ` · ${formatMinutes(remainingMinutes)} left`

  const now = new Date(nowMs)
  const est = new Date(nowMs + remainingMinutes * 60_000)
  const sameCivilDay =
    est.getFullYear() === now.getFullYear() &&
    est.getMonth() === now.getMonth() &&
    est.getDate() === now.getDate()

  if (sameCivilDay && est.getHours() < ESTIMATE_CUTOFF_HOUR) {
    return ` · Est. finish: ${formatTime12h(est)}`
  }
  return ` · ~${formatMinutes(remainingMinutes)} left`
}

/**
 * "1h 20m planned · " — or nothing at all when the day has no planned minutes.
 *
 * UX-25: hand-added rows default to zero minutes, so a real day of work could
 * lead with "0m planned". Zero here means *nothing has been given a time yet*,
 * which reads as *there is nothing to do* — the summary line's first clause
 * saying the day is empty while four rows sit under it.
 */
export function plannedMinutesClause(totalPlannedMinutes: number): string {
  if (totalPlannedMinutes <= 0) return ''
  return `${formatMinutes(totalPlannedMinutes)} planned · `
}

/**
 * The checklist card title. UX-28: a past or upcoming day was still titled
 * "Today's Plan" while the banner directly above it said "Viewing Monday,
 * Aug 10 (past)".
 */
export function dayPlanTitle(dateKey: string, isToday: boolean): string {
  if (isToday) return "Today's Plan"
  const dayName = weekdayName(dateKey)
  return dayName ? `${dayName}'s Plan` : 'Day Plan'
}

/**
 * Weekday name for a `YYYY-MM-DD` key, read as a **civil** date — parsed at
 * local midnight rather than as a UTC instant, so the name never slips a day
 * for a family west of Greenwich. `null` for an unparseable key, so callers
 * fall back to a sentence that still reads as English.
 */
export function weekdayName(dateKey: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null
  const parsed = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleDateString('en-US', { weekday: 'long' })
}
