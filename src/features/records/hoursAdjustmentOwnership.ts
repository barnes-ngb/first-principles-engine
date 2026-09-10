/**
 * Whose manual hours adjustment is this — UX-340 (RESET).
 *
 * `RecordsPage` carries TWO independent editors on the hours rail. UX-329 fixed
 * the *Add Historical Hours* dialog (`historicalHoursOwnership.ts`) and filed
 * this one — the always-visible **Manual Hours Adjustment** form — as a P1 it
 * could not touch, because the owner's authorisation named the dialog
 * specifically. `CLAUDE.md`'s **Attribution-only fixes are pre-authorised**
 * (owner, 2026-09-10) is what unblocks it, and this fix qualifies on all four of
 * its terms: no number changes, no stored shape change, the unchanged
 * arithmetic asserted with a positive control, and no existing row rewritten.
 *
 * The defect: the form holds typed minutes, a reason and a subject in page
 * state, and a `useEffect` re-syncs its *Attribute to* selector to the newly
 * active child. So a switch left the typed adjustment standing and silently
 * re-pointed it — a parent could type "+45, missed co-op session" while looking
 * at one boy's records, change child to check something, tap **Add Adjustment**,
 * and file those minutes against his brother in `hoursAdjustments`, the
 * collection the compliance pack and `collectHoursContributions` read. Records
 * has its own `ChildSelector`, so this is reachable today with the header
 * switcher off (`CHILD_SWITCHER_ENABLED === false`).
 *
 * **RESET, not BIND** — the same answer, the same rail and the same reasoning as
 * the dialog beside it and as `QuickAddHours` (UX-328). Nothing has been
 * recorded for anybody yet; the draft is three fields to re-enter; and writing
 * a compliance row to a child the parent has navigated away from would be the
 * surprise this exists to prevent rather than a smaller version of it.
 * `useCreativeTimer` (UX-327) binds because real minutes had already elapsed
 * for a named child. Nothing has elapsed here.
 *
 * **No hours math is touched.** `Number(adjMinutes)` is written exactly as it
 * was, the subject split is untouched, no fold, rounding, bucket or threshold
 * moves, and the written document's shape is byte-identical. Only *whose* a row
 * is can change, and only by the draft being cleared before it can be written
 * to the wrong child.
 *
 * Pure: no React, no Firestore, never throws.
 */

/**
 * The typed state of the Manual Hours Adjustment form.
 *
 * Structural (plain strings) rather than the page's state tuple, for the same
 * reason as `historicalHoursOwnership`: a rule that has to be handed React
 * state is a rule that cannot be tested on its own.
 */
export interface HoursAdjustmentDraft {
  /** Minutes as typed, `+` or `-` (`''` when unset). */
  minutes: string
  /** The audit reason (`''` when unset). */
  reason: string
  /** Optional subject bucket (`''` for None — the value the form opens on). */
  subject: string
  /** The adjustment's date, as `YYYY-MM-DD`. Has a real default — see below. */
  date: string
}

/**
 * Is there anything in this draft that could have become a wrong row?
 *
 * `date` is deliberately excluded, and getting THAT wrong is the regression this
 * run was warned about. UX-329's own round 4 found `estimateDaysPerWeek` left
 * edited after a successful save, so the next child change announced
 * already-recorded hours "weren't saved" — a false warning on the compliance
 * rail, which invites entering them a second time. `handleAddAdjustment` clears
 * minutes, reason and subject on success and leaves the date standing, so
 * counting the date would reproduce exactly that.
 *
 * The principled line is the same one that makes it safe: **a draft counts as
 * typed when it could have been written**. `handleAddAdjustment` returns early
 * without minutes AND a reason, so a lone date can never produce a row. It is
 * still cleared by `clearedHoursAdjustmentDraft` below — a field carried
 * silently from one child to the next is the `estimateDaysPerWeek` lesson — it
 * simply is not something that was *lost*.
 */
export function hoursAdjustmentDraftIsEmpty(draft: HoursAdjustmentDraft): boolean {
  if (draft.minutes.trim() !== '') return false
  if (draft.reason.trim() !== '') return false
  if (draft.subject.trim() !== '') return false
  return true
}

/**
 * The same draft with every field back to the value the form opens on.
 *
 * Returns a NEW object; the caller's is never mutated, so a stale render cannot
 * see a half-cleared form. `date` is restored unconditionally (to the caller's
 * "today", which is the form's own default) whether or not it counted as typed:
 * a date a parent picked while looking at one child is not a date they chose
 * for the next.
 */
export function clearedHoursAdjustmentDraft(today: string): HoursAdjustmentDraft {
  return { minutes: '', reason: '', subject: '', date: today }
}

/**
 * What the parent is told when a child change cleared an adjustment they had
 * typed. `null` when there was nothing to lose — a notice that fires on every
 * switch is one nobody reads by the time it matters.
 *
 * The sentence names BOTH children where their names are known, because the
 * failure being fixed is one child's minutes landing on the other's record:
 * "it wasn't saved" without saying *for whom* leaves the parent with the same
 * question they had before. Names are looked up by the caller from the family's
 * own children — capability and identity, never a literal.
 */
export function hoursAdjustmentSwitchNotice(
  hadTypedDraft: boolean,
  previousChildName?: string,
  nextChildName?: string,
): string | null {
  if (!hadTypedDraft) return null
  const forWhom = previousChildName ? ` for ${previousChildName}` : ''
  const nowOn = nextChildName ? ` You're now adjusting hours for ${nextChildName}.` : ''
  return `The adjustment you'd typed${forWhom} wasn't saved — hours are only recorded when you tap Add Adjustment.${nowOn}`
}
