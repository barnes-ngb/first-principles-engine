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

/**
 * What is said when the week's review has not been written yet (UX-219).
 *
 * The page names the school week the moment its Friday is over (UX-218), so on
 * Saturday — until the cron fires that evening — it names a week no document has
 * been written for. The positions for that week genuinely do not exist yet:
 * `currentPosition` is a single mutable field with no history (UX-212), so
 * nothing can be reconstructed after the fact and nothing may be estimated.
 *
 * **The date in this sentence follows the cron, and it moved twice (UX-263).**
 * It read *"Sunday evening"* while the review fired Sunday 19:00 CT. The first
 * cut of UX-263 moved the cron to Saturday 21:00 and this line to *"Saturday
 * evening"*; that schedule was withdrawn on review because it would have read
 * the week three hours before Saturday ended, permanently dropping late-Saturday
 * evidence. The cron now fires **00:15 Sunday**, so the week is ready before
 * anyone is awake on Sunday and no evidence is lost.
 *
 * Which leaves this line true for the whole of Saturday, and needing to promise
 * *overnight* rather than an evening — it is read on a Saturday afternoon, when
 * "tonight" is the honest answer and a clock time would be noise. The guard
 * below is unchanged; only the promise moved.
 *
 * Same rule as the two lines above: say what is not known and when it will be,
 * rather than falling through to *"First week recorded"* — which is a claim, and
 * on a Saturday a false one.
 *
 * **It promises a date, so it is shown only where that promise is true**, and
 * getting that guard right took two rounds:
 *
 *   • **Round 1 (P2)** — it keyed on the missing *snapshot*. A review can exist
 *     with no `curriculumPositions`: the server omits the field when the child
 *     has no positioned workbook config, and when the config read throws. In
 *     both, the cron has run and nothing more is coming, so the promise would
 *     have repeated every week and never come true.
 *   • **Round 2/3 (P2)** — it then keyed on the missing *document*, which this
 *     same PR had just made unreliable in both directions: `writeWeekReflection`
 *     now CREATES the document when a parent answers on Saturday (so a non-null
 *     review no longer implies the cron ran), and a failed listener read leaves
 *     the review null with loading finished (so a null review no longer implies
 *     it did not).
 *
 * So the guard reads an explicit generation marker instead — see
 * `reviewWasGenerated` below — and a failed read gets its own line.
 */
export const POSITIONS_PENDING_LINE =
  'This week’s workbook positions haven’t been recorded yet — they’re saved overnight, once Saturday is over.'

/**
 * What is said when the week's review document could not be read at all.
 *
 * The third instance of this page's one rule (Codex round 3, P2): a failed read
 * is not a result. Without this line, a dropped or permission-denied listener
 * left the review `null` with loading finished, which
 * {@link POSITIONS_PENDING_LINE} would have reported as *"the cron hasn't run
 * yet"* — a claim about the server made on no information from it.
 */
export const REVIEW_UNAVAILABLE_LINE =
  'Couldn’t read this week’s review, so there’s nothing to say about coverage yet.'

/**
 * Did the weekly cron actually generate this week's review?
 *
 * **Not the same question as "does the document exist"** (Codex round 3, P2),
 * and this PR is what made them come apart: `writeWeekReflection` creates the
 * document when a parent answers on Saturday, before any review has been
 * generated.
 *
 * `status` is the marker because only generation writes it — `evaluate.ts`
 * stamps `'draft'` on the AI path and `'no-data'` on the empty-week path, while
 * the reflection merge writes `{childId, weekKey, reflection}` and nothing else.
 * (The page's *Apply adjustments* also writes a status, but it is reachable only
 * on a document that already carries `paceAdjustments`, which only generation
 * puts there.) Structural, because this reads an unvalidated Firestore document.
 */
export function reviewWasGenerated(review: { status?: unknown } | null): boolean {
  return typeof review?.status === 'string' && review.status !== ''
}

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
