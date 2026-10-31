// ── Leaving the book editor with an edit that has not landed (UX-473) ───────
//
// UX-353 made `useDebounce` flush a pending write on unmount and on the page
// being hidden, so an edit is no longer *dropped* on the way out. What it
// cannot do is make the write SUCCEED: the flush dispatches a `setDoc` and the
// component is gone before the promise settles.
//
// ── The contract, after Chrome said otherwise (owner decision, 2026-10-31) ──
//
// An earlier draft of this module held a departure only for a save that had
// already come back FAILED, on the reasoning that a pending or in-flight write
// has the flush and Firestore's own queue behind it. **Sol's Chrome run
// disproved that**, twice over, against the real editor and the real hook:
//
//   * typing, then an app-nav exit before the debounce fired, then a late
//     rejection — the editor was already unmounted and the draft was gone; and
//   * a failed save, *Try again*, then an app-nav exit while that retry was in
//     flight, then a late rejection — same loss.
//
// In both the write was dispatched and the page that could have reported the
// rejection no longer existed. So the guard now covers **every outstanding
// edit** — pre-debounce, in flight, and failed — and the owner approved that
// contract explicitly. The cost is a held departure during ordinary autosave;
// it is paid honestly, with a QUIET "saving" message and no failure or retry
// wording, and it releases ITSELF the moment the latest edit is acknowledged.
// Nothing asks the kid to confirm a save that is simply about to finish.

import type { SaveState } from '../../components/SaveIndicator'

export interface BookSaveStatus {
  saveState: SaveState
  hasUnsavedEdits: boolean
}

/**
 * Hold a departure for ANY outstanding edit.
 *
 * `saveState` deliberately plays no part: it is the *report* on the last write
 * and a report can be stale, late, or about an older edit. What is outstanding
 * is the question, and `hasUnsavedEdits` is the only answer to it.
 */
export function shouldGuardDeparture({ hasUnsavedEdits }: BookSaveStatus): boolean {
  return hasUnsavedEdits
}

/**
 * Whether a held departure may now be released on its own.
 *
 * The test is ACKNOWLEDGMENT of the latest edit, never the absence of an error.
 * Releasing on "no longer an error" would unmount the editor in the middle of
 * the very write the kid asked for, and a second failure would have no page
 * left to report it — which is exactly the loss Chrome found.
 */
export function departureIsSafe({ hasUnsavedEdits }: BookSaveStatus): boolean {
  return !hasUnsavedEdits
}

/**
 * What the browser is told when the TAB is closed or reloaded with an edit
 * outstanding. A browser exit can be neither held nor awaited, so this is a
 * warning and is worded as one — it promises nothing about durability.
 */
export const UNSAVED_BOOK_WARNING = "This book hasn't finished saving yet."

/** Which of the two dialogs the held departure is showing. */
export type DepartureStage = 'saving' | 'failed'

/**
 * A departure held over a write that has not failed is a *wait*, not a problem,
 * and must not borrow the vocabulary of one.
 */
export function departureStage({ saveState }: BookSaveStatus): DepartureStage {
  return saveState === 'error' ? 'failed' : 'saving'
}

export interface DepartureNotice {
  stage: DepartureStage
  title: string
  /** The honest reason, including the actual error where there is one. */
  detail: string
  /** What is still on the page, and what leaving does and does not promise. */
  reassurance: string
  /** A write is in flight right now, so there is nothing to re-ask for. */
  busy: boolean
  /** Whether a Retry door belongs on this dialog at all. */
  retryable: boolean
}

/**
 * The dialog's copy for the state it is actually in.
 *
 * Note what the leaving sentence does NOT say. It used to read "if you leave
 * without saving, they are gone", and that was a promise this code cannot keep
 * in either direction: a dispatched write may still land after the editor is
 * gone, and leaving cancels or erases nothing. So it says only the true thing —
 * that these edits MAY not be saved.
 */
export function departureNotice(
  status: BookSaveStatus,
  saveErrorMessage?: string | null,
): DepartureNotice {
  const stage = departureStage(status)
  const leaving = 'If you leave now, these edits may not be saved — and a save already on its way may still finish. We cannot promise either way.'

  if (stage === 'saving') {
    return {
      stage,
      title: 'Saving your book…',
      detail: 'Just a moment — we are finishing the save before you go.',
      reassurance: `Your newest words and pictures are still here, and you will go on to where you were heading as soon as the save is confirmed. ${leaving}`,
      busy: status.saveState === 'saving',
      retryable: false,
    }
  }

  return {
    stage,
    title: "Your book didn't save",
    detail: saveErrorMessage ?? 'Save failed',
    reassurance: `Your newest words and pictures are still here on this page. Try saving again. ${leaving}`,
    busy: false,
    retryable: true,
  }
}

export const DEPARTURE_RETRY_LABEL = 'Try again'
export const DEPARTURE_STAY_LABEL = 'Stay here'
export const DEPARTURE_LEAVE_LABEL = 'Leave anyway'
