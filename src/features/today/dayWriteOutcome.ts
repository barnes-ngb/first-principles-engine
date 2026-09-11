// ── "This edit did not land" — the one definition, for every Today write (UX-351)
//
// Shelly, 2026-09-11, on Today, working on Language Arts: *"she added to the
// lessons but some of them seem to have failed or not saved."* **Intermittent**
// is the load-bearing word: most saves worked, some did not, and **nothing on
// screen distinguished them.**
//
// ── The asymmetry ───────────────────────────────────────────────────────────
//
// `persistDayLogImmediate` called `setDayLog(updated)` and then
// `void writeDayLog(updated)`. The screen was updated first and never taken
// back, and the outcome was reported three different ways:
//
//   * **success** set `saveState: 'saved'` **and** raised a *"Saved"* snack;
//   * **failure** set `saveState: 'error'` and raised **nothing**;
//   * a **refused** write — `if (!dayLogRef || !selectedChildId) return` —
//     dropped the write and never touched `saveState` at all, so the indicator
//     kept whatever it last said, which after any earlier success is *"Saved"*.
//
// So a lesson checked off on Today stayed checked on screen, the page said
// nothing or said *Saved*, and the next load showed it had never been written.
// That is the write-side twin of this repo's own rule that **a failed read
// rendered as zero is the worst thing a records surface can do** — and a failed
// write rendered as success is worse, because the parent moves on believing the
// record exists.
//
// **A guard that refuses a write is a failure to report, not a quiet no-op.**
// Both early returns reach the same reporting as a thrown error; the only thing
// that differs is the sentence, because the advice differs.
//
// ── Naming the row, without plumbing a label through fifteen call sites ──────
//
// A failure sentence that names what failed is worth far more than a generic
// one, and the hook is handed whole `DayLog`s rather than edits. So the name is
// **derived from the two documents** rather than passed: every Today call site
// builds its new checklist with `.map()`, which returns the *same object* for
// every untouched row, so a reference comparison finds the one row that moved
// exactly and cheaply. Where it cannot answer with one row — several changed, a
// reordering, no previous document — it says so by returning `null` and the
// caller uses the unnamed sentence. **A wrong name is worse than no name**, so
// this function never guesses.
//
// Pure: no React, no Firestore, never throws.

import type { ChecklistItem, DayLog } from '../../core/types'

/** Why an edit did not land. */
export const DayWriteRefusal = {
  /**
   * The write was refused before it was attempted — there is no document to
   * address yet (no child selected, or the day's ref has not resolved).
   * Nothing was sent, so nothing can have half-landed.
   */
  NoTarget: 'no-target',
  /** The write was attempted and rejected (rules, network, an offline queue that gave up). */
  Rejected: 'rejected',
  /**
   * The document handed to the writer is not the document the page is on
   * (UX-357).
   *
   * A `DayLog` carries its own `childId` and `date`, so it knows which day it
   * is. Every Today handler composes its edit from the `dayLog` it closed over
   * and hands the whole document back — and a handler that started before a
   * child switch or a day page finishes after it, still holding the old one.
   *
   * The writer used to **re-stamp** that document with the live child (*"defense
   * in depth"*) and save it to the live day's id, which turns a mis-addressed
   * write into a confidently wrong one: one boy's entire checklist written onto
   * his brother's day, under his brother's name, with the preservation guard in
   * observe-only mode on this lane so nothing stopped it. Refusing is the only
   * safe answer — the edit belongs to a day that is no longer on screen, and
   * there is nothing here to apply it to.
   */
  WrongTarget: 'wrong-target',
} as const
export type DayWriteRefusal = (typeof DayWriteRefusal)[keyof typeof DayWriteRefusal]

/** What the page shows. Always an error — a lost edit is never a warning. */
export interface DayWriteFailureNotice {
  text: string
  severity: 'error'
}

/**
 * What the page was able to do about the failure, which decides what it may
 * claim (Codex round 2, P1 — the same rule the plan controls needed).
 *
 * The rollback is identity-guarded, so it does NOT always apply: a newer edit on
 * the same day, or a switch to another child, both leave the screen showing
 * something this failure has nothing to say about. Saying *"it's back to how it
 * was"* over either is the same species of lie as *"Saved"* over a write that
 * did not land, so the copy is keyed on what actually happened.
 */
export const DayWriteAftermath = {
  /** The row was put back. */
  RolledBack: 'rolled-back',
  /** A newer edit to the same day is on screen. */
  Superseded: 'superseded',
  /** The page is showing a different child or date now. */
  MovedOn: 'moved-on',
} as const
export type DayWriteAftermath =
  (typeof DayWriteAftermath)[keyof typeof DayWriteAftermath]

function itemLabel(item: ChecklistItem | undefined): string | null {
  const label = item?.label?.trim()
  return label ? label : null
}

/**
 * The label of the ONE checklist row this edit touched, or `null`.
 *
 * Reference comparison on purpose (see the header): the Today call sites rebuild
 * the checklist with `.map()`, so an untouched row is the identical object and a
 * changed row is not. Three answers are `null` and each is deliberate:
 *
 *  * **no previous document** — there is nothing to compare against;
 *  * **more than one row moved** — naming one of them would be a lie about the
 *    other, and "your change" is honest about both;
 *  * **the lengths differ other than by one appended row** — a reorder, a
 *    removal or a multi-row rewrite, none of which one name describes.
 *
 * The one length change it does name is a single row appended at the end, which
 * is how a watch row and a manual row join a day.
 */
export function namedDayEdit(before: DayLog | null, after: DayLog): string | null {
  if (!before) return null
  const a = before.checklist ?? []
  const b = after.checklist ?? []

  if (b.length === a.length + 1 && a.every((item, i) => item === b[i])) {
    return itemLabel(b[b.length - 1])
  }
  if (a.length !== b.length) return null

  let found: string | null = null
  let changed = 0
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === b[i]) continue
    changed += 1
    if (changed > 1) return null
    found = itemLabel(b[i])
  }
  return found
}

/**
 * What the page says when an edit did not land.
 *
 * As loud as *"Saved"* is, through the same snack channel, because the whole
 * defect was that success was announced and failure was not. It says what the
 * app did about it — the row is back to what it was — so the parent is not left
 * wondering whether a half-write happened.
 */
export function dayWriteFailureNotice(
  reason: DayWriteRefusal,
  editedLabel: string | null,
  aftermath: DayWriteAftermath = DayWriteAftermath.RolledBack,
): DayWriteFailureNotice {
  if (reason === DayWriteRefusal.WrongTarget) {
    // Read BEFORE the aftermath branches, because the aftermath cannot describe
    // this one. Nothing local is taken back — the page already moved to another
    // document and the listener replaced what was on screen — so neither
    // "rolled back" nor "superseded" is true, and the row is deliberately NOT
    // named: a row title read over the day now on screen is a claim about that
    // day. Same rule as `MovedOn`, one cause earlier.
    return {
      text: "That change was for a different day and didn't save. Nothing here was changed — switch back to make it there.",
      severity: 'error',
    }
  }
  if (aftermath === DayWriteAftermath.MovedOn) {
    // The write belonged to a day this page is no longer showing (Codex round 1,
    // P1's sibling). The row is not taken back — the listener replaced it when
    // the target changed, so there is nothing here to take back — and it is not
    // NAMED either, because a row title over another child's day reads as a
    // claim about this one. Still reported: a lost edit is never silent,
    // whichever day it was on.
    return {
      text: "An edit made before you switched didn't save. Nothing here was changed — switch back to check it.",
      severity: 'error',
    }
  }
  if (aftermath === DayWriteAftermath.Superseded) {
    // A newer edit to this same day is on screen, so the rollback was skipped
    // and the sentence may not claim one (Codex round 2, P1). The row IS named
    // here — it is a row on the day the parent is looking at.
    const named = editedLabel ? `“${editedLabel}”` : 'An earlier change'
    return {
      text: `${named} didn't save. What you see now is your newer change — check it landed.`,
      severity: 'error',
    }
  }
  if (reason === DayWriteRefusal.NoTarget) {
    return {
      text: "Not saved — today's log isn't open yet. Reload and try that again.",
      severity: 'error',
    }
  }
  const named = editedLabel ? `“${editedLabel}” didn't save` : "That change didn't save"
  return {
    text: `${named}. It's back to how it was — try again.`,
    severity: 'error',
  }
}
