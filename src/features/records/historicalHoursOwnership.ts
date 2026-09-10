/**
 * Whose historical hours are these — UX-329 (owner-authorised 2026-09-09).
 *
 * `RecordsPage`'s *Add Historical Hours* dialog is the most serious instance of
 * the UX-324 class and the reason this run exists. The dialog holds a typed
 * draft — a month and five subject figures, or a start month, an end month and
 * a daily rate — entirely in page state, and both save handlers
 * (`handleSaveBackfill`, `handleSaveQuickEstimate`) read the LIVE
 * `activeChildId` at the moment Save is tapped. The dialog stays mounted across
 * a child change, so a form filled while looking at one child's records was
 * written as the other child's `hoursAdjustments` — and the quick-estimate path
 * writes one adjustment per subject per month, so a single tap can misattribute
 * a whole school year in one go. This is the collection the Records page, the
 * compliance pack and `collectHoursContributions` all read: the rail the state
 * filing is built on.
 *
 * **The answer is RESET, not BIND** — the same answer `QuickAddHours` (UX-328)
 * gives on this same rail, and for the same reason. A typed backfill is an
 * INTENT: no minutes have been recorded for anybody, nothing exists yet to
 * belong to a child, and every figure in it is four taps to re-enter. Binding
 * would mean writing months of compliance history to a child the parent is no
 * longer looking at, which is the surprise this exists to prevent rather than a
 * smaller version of it. `useCreativeTimer` (UX-327) binds because real minutes
 * had already elapsed for a named child; nothing has elapsed here.
 *
 * **No hours math is touched.** This module decides only whether a draft is
 * empty and what the parent is told; the fold, the rounding, the subject split,
 * the `4.33` weeks-per-month constant and the shape of every written adjustment
 * are exactly as they were. Only *whose* a row is can change, and only by the
 * draft being cleared before it can be written to the wrong child.
 *
 * Pure: no React, no Firestore, never throws.
 */

/**
 * The typed state of the Historical Hours dialog — both of its modes, because
 * the dialog keeps one set of fields and a toggle between them, and a switch
 * has to clear whichever the parent had been filling in.
 *
 * Deliberately structural (plain strings and numbers) rather than importing the
 * page's own state tuple: this module is the *rule*, and a rule that has to be
 * handed React state is a rule that cannot be tested on its own.
 */
export interface HistoricalHoursDraft {
  /** Per-month mode: the month being backfilled (`''` when unset). */
  backfillMonth: string
  /** Per-month mode: hours per subject. A row at `0` is not a typed figure. */
  backfillEntries: ReadonlyArray<{ subject: string; hours: number }>
  /** Quick-estimate mode: first month of the range (`''` when unset). */
  estimateStartMonth: string
  /** Quick-estimate mode: last month of the range (`''` when unset). */
  estimateEndMonth: string
  /** Quick-estimate mode: hours per school day, as typed (`''` when unset). */
  estimateDailyHours: string
  /**
   * Quick-estimate mode: school days per week. Unlike every other field this
   * one has a NON-EMPTY default, which is why it is handled separately below.
   */
  estimateDaysPerWeek: string
}

/**
 * The days-per-week the dialog opens on. A real value on an untouched form,
 * which is what makes this field a special case in both functions below.
 */
export const DEFAULT_ESTIMATE_DAYS_PER_WEEK = '4'

/**
 * Is there anything in this draft a person actually typed?
 *
 * `estimateDaysPerWeek` is the awkward one, and getting it wrong costs in both
 * directions (Codex round 1, P1). Reading it like the others would make EVERY
 * draft non-empty — it is `'4'` on a form nobody has touched — so every switch
 * would raise a notice about work that was never done. Ignoring it entirely,
 * which the first version of this module did, leaves a **compliance** field
 * that a parent set for one child silently in force for the next: set five
 * days for one child, switch, type a fresh range and a daily rate, and the
 * second child's adjustments are computed on the first child's schedule.
 *
 * So it counts as typed exactly when it DIFFERS from the default, and it is
 * always restored by `clearedHistoricalHoursDraft` whether it counted or not.
 */
export function historicalHoursDraftIsEmpty(draft: HistoricalHoursDraft): boolean {
  if (draft.backfillMonth.trim() !== '') return false
  if (draft.estimateStartMonth.trim() !== '') return false
  if (draft.estimateEndMonth.trim() !== '') return false
  if (draft.estimateDailyHours.trim() !== '') return false
  if (draft.estimateDaysPerWeek.trim() !== DEFAULT_ESTIMATE_DAYS_PER_WEEK) return false
  return draft.backfillEntries.every((e) => !(e.hours > 0))
}

/**
 * The same draft with every typed figure cleared and the subject rows kept in
 * their original order at zero — the shape the dialog opens in.
 *
 * Returns a NEW object and a new entries array; the caller's arrays are never
 * mutated, so a stale render cannot see a half-cleared form.
 */
export function clearedHistoricalHoursDraft(
  draft: HistoricalHoursDraft,
): HistoricalHoursDraft {
  return {
    backfillMonth: '',
    backfillEntries: draft.backfillEntries.map((e) => ({ ...e, hours: 0 })),
    estimateStartMonth: '',
    estimateEndMonth: '',
    estimateDailyHours: '',
    // Restored unconditionally: it drives `handleSaveQuickEstimate`'s minutes,
    // so leaving one child's schedule in place is a wrong compliance figure
    // for the next, whether or not it was what triggered the notice.
    estimateDaysPerWeek: DEFAULT_ESTIMATE_DAYS_PER_WEEK,
  }
}

/**
 * What the parent is told when a child change cleared a draft they had typed.
 *
 * `null` when there was nothing to lose — an untouched dialog needs no
 * announcement, and a notice that fires on every switch is a notice nobody
 * reads by the time it matters.
 *
 * The sentence names BOTH children where their names are known, because the
 * whole failure being fixed is one child's figures landing on the other's
 * record: "it wasn't saved" without saying *for whom* leaves the parent with
 * the same question they had before. Names are looked up by the caller from the
 * family's own children — capability and identity, never a literal.
 */
export function historicalHoursSwitchNotice(
  hadTypedDraft: boolean,
  previousChildName?: string,
  nextChildName?: string,
): string | null {
  if (!hadTypedDraft) return null
  const forWhom = previousChildName ? ` for ${previousChildName}` : ''
  const nowOn = nextChildName ? ` You're now adding hours for ${nextChildName}.` : ''
  return `The historical hours you'd typed${forWhom} weren't saved — hours are only recorded when you tap Save.${nowOn}`
}
