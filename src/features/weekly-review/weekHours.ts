/**
 * The week's hours, stated — with no target (UX-211).
 *
 * A number and what it counts. **No goal, no bar, no percentage, no colour that
 * means behind, no streak and no quota**, because the owner's decision is
 * explicit: *"When we move to Texas hours aren't the goal."* Urgency comes from
 * the work having an end (the observed-rate line beside this one), never from a
 * clock having a quota — a quota can be filled without anything being learned,
 * which is the failure mode it pretends to prevent.
 *
 * ── Which hours figure this is, and why ─────────────────────────────────────
 *
 * The Today ribbon's `4.8/11.8 hrs` chip (`today/weekRibbon.logic.ts`
 * `formatHoursChip`) answers a DIFFERENT question: how far through the week's
 * *planned checklist* the family is. It sums non-manual checklist items at their
 * planned minutes and reports them against a planned denominator — so it cannot
 * be the source here (the denominator is exactly the target this section may not
 * have), and it excludes manual hours entries, Dad Lab sessions, block actuals
 * and adjustments.
 *
 * This line reports the COUNTED hours: the same `collectHoursContributions`
 * (`functions/src/shared/hoursContributions.ts`, ARCH-47 slice 4) the Records
 * page, the MO compliance dashboard, the compliance pack and the monthly review
 * book all fold. Reading the ribbon's rule instead would have created a THIRD
 * definition of "hours this week" in a records-keeping app, which is precisely
 * the drift the shared module exists to prevent. The two numbers will differ,
 * and the caption says which one this is so the difference is explainable rather
 * than mysterious.
 *
 * Nothing here writes, and no hours or compliance math was touched — the figure
 * is folded live at read time from the canonical path, so a backfill logged
 * after the review was generated shows up immediately instead of going stale.
 */

/** Says which count this is, so it can be reconciled with the Records page. */
export const HOURS_SOURCE_CAPTION =
  'Counted the same way as the Records page and the compliance pack.'

/**
 * What is said when the read failed, instead of a number.
 *
 * A failed read is **not** an empty week. Rendering "No hours logged this week."
 * after a dropped connection or a permission error would present a failure as an
 * affirmative records result — the one thing a compliance-adjacent surface must
 * never do.
 */
export const HOURS_UNAVAILABLE_LINE =
  'Couldn’t read this week’s hours. Try again in a moment.'

/**
 * What is said when the earlier weeks could not be read.
 *
 * Same rule one level up: with no history we cannot tell "there is no earlier
 * week" from "we failed to look", and *"First week recorded"* is a claim. So the
 * line reports the rate as unavailable rather than asserting a first week.
 */
export const HISTORY_UNAVAILABLE_LINE =
  'Couldn’t read the earlier weeks, so there’s no rate to show yet.'

/** One decimal, with a trailing `.0` dropped: 4.8, 5, 0.5. */
function formatHours(minutes: number): string {
  const hours = minutes / 60
  return hours % 1 === 0 ? `${hours}` : hours.toFixed(1)
}

/**
 * The week's counted time, in words. Never a ratio, never a target.
 *
 * Under an hour it stays in minutes — "0.3 hours" reads as a rounding artifact
 * where "20 minutes" reads as what happened. A negative total (adjustments
 * subtract, and a correction must subtract everywhere) is reported as none
 * rather than as a negative duration.
 */
export function hoursLoggedLine(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
    return 'No hours logged this week.'
  }
  if (totalMinutes < 60) {
    const mins = Math.round(totalMinutes)
    return `${mins} minute${mins === 1 ? '' : 's'} logged this week.`
  }
  return `${formatHours(totalMinutes)} hours logged this week.`
}
