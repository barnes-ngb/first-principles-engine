import { doc } from 'firebase/firestore'

import { daysCollection } from '../../core/firebase/firestore'
import type { ChecklistItem } from '../../core/types'
import { dayLogDocId } from './daylog.model'
import { checklistItemKey, patchDayChecklistGuarded } from './dayWriteGuard'

/**
 * The capture's own write lane — `UX-404`.
 *
 * ── The defect ──────────────────────────────────────────────────────────────
 * `handleUnifiedCapture` closed over the `dayLog` as it stood when the photo was
 * picked, spent ten seconds compressing, scanning and uploading, then handed the
 * WHOLE of that document back to `persistDayLogImmediate`, which `setDoc`s it.
 * Every edit made in between was written back to what it had been: a box the
 * parent ticked while the upload ran came back unticked, and with it the
 * `actualMinutes` that tick had credited to its block and the `xpTotal` it had
 * awarded. The preservation guard could not catch it — the interactive lane runs
 * in observe-only mode by design, and even in enforcing mode a *value* going
 * backwards on a retained entity is deliberately not a violation.
 *
 * ── The rule (owner decision, 2026-09-13) ───────────────────────────────────
 * **The capture writes only its own row.** It patches the fields the photo
 * actually produced — the evidence link, and the workbook registration when
 * there is one — onto the one row it was taken for, and leaves every other field
 * of the day exactly as it stands **at write time**, not as it stood at capture
 * time.
 *
 * This is attribution-shaped on the `hours` rail (`DOC-25`): no math changes, no
 * fold, no rounding, no threshold — only *which version of the document* is
 * written. The arithmetic is pinned by test with a positive control.
 *
 * ── How ─────────────────────────────────────────────────────────────────────
 * Find the row **by identity** (`checklistItemKey`, the same notion
 * `dayWriteGuard` uses and `liveDayEdit` resolves by — an index captured when
 * the camera opened can shift under a rollover or a concurrent add), patch that
 * row, and write `checklist` alone. A Firestore array cannot be patched
 * element-wise, so the checklist is re-sent whole; `blocks`, `xpTotal`, `energy`
 * and every other day-level field are not in the payload at all.
 *
 * **The read, the patch and the write are ONE transaction** (Codex round 1, P1),
 * through `dayWriteGuard.patchDayChecklistGuarded`. A read-then-write leaves a
 * window in which an edit lands and is then overwritten by an array rebuilt from
 * the older snapshot — which is `UX-404`'s own defect with a shorter fuse, and
 * the preservation guard cannot catch it (no entity disappears; only values go
 * backwards on retained rows, which is deliberately allowed). So
 * {@link patchChecklistRow} is **pure and re-runnable**: the transaction hands
 * it whatever the checklist is on that attempt, and may call it more than once.
 *
 * The screen is not advanced from here. `onSnapshot` delivers what actually
 * landed, which is the whole point — advancing it from a stale in-memory
 * document is the defect this lane exists to end.
 */

/** The fields a capture may stamp on the row it was taken for. Nothing else. */
export type CaptureRowPatch = Pick<
  ChecklistItem,
  | 'evidenceArtifactId'
  | 'evidenceCollection'
  | 'workbookConfigId'
  | 'workbookScanRegistration'
  | 'scanned'
  | 'pendingScanId'
>

/**
 * Why a capture's row write did not land.
 *
 * `'no-day'` — the day document is gone (or was never created). `'row-gone'` —
 * the day no longer holds a row with this identity, which is what a rename or a
 * delete during the upload looks like. `'failed'` — the write itself was
 * rejected. All three are **reported**, never swallowed: the photo is already
 * saved by the time this runs, so silence would leave a parent believing the row
 * carries evidence it does not (`UX-351`'s rule, one door over).
 */
export type CaptureRowWriteOutcome =
  | { status: 'done' }
  | { status: 'refused'; reason: 'no-day' | 'row-gone' }
  | { status: 'failed' }

/**
 * What the caller knows about the row it opened the camera on, beyond its
 * identity — used only to tell IDENTICAL rows apart. See
 * {@link resolveCaptureRowIndex}.
 */
export interface CaptureRowHint {
  /** The row's index when the capture started. Trusted only if it still matches. */
  index?: number
  /** Whether that row was ticked when the capture started. */
  completed?: boolean
}

/**
 * Which row this capture meant, when more than one answers to its identity
 * (Codex round 1, P1).
 *
 * `checklistItemKey` falls back to `label::subject` for an id-less row, and a
 * saved day really can hold two rows with the same one — `liveDayEdit`'s own
 * header names the common way: `retainChecklistForApply` KEEPS a completed row
 * and Apply then appends the freshly-planned one with the same title and
 * duration. Taking the first match would attach this photo's evidence and
 * workbook registration to the **older completed** row, overwriting its own
 * evidence link.
 *
 * `liveDayEdit` breaks that tie by preferring the first **editable** row, which
 * is right for an edit and wrong here: a capture is offered on a completed row
 * too (`showPhotoDoor` allows `item.completed`), so "prefer incomplete" would
 * send a post-completion photo to the wrong twin. This resolves it from what the
 * caller actually knows instead:
 *
 *  1. **The index it started from, when that row still has this identity AND the
 *     same completed state** — a validated index, not a bare one. Both halves
 *     are needed: for twins the identity is by definition the same at every
 *     index, so identity alone would let a shifted list land on the wrong one.
 *  2. **A match in the same completed state**, when the index has shifted — the
 *     retained completed twin and the freshly-planned one differ exactly there.
 *  3. **The index it started from, on identity alone** — the case the state test
 *     cannot cover: the row was ticked *during* the upload, so no match carries
 *     the state the capture remembers, and the index is the better evidence.
 *  4. **The first match**, when nothing narrows it; the twins are then alike in
 *     every respect this can see.
 *
 * `-1` when the day no longer holds the row at all.
 */
export function resolveCaptureRowIndex(
  rows: readonly ChecklistItem[],
  itemKey: string,
  hint: CaptureRowHint = {},
): number {
  const matches = (row: ChecklistItem) => checklistItemKey(row) === itemKey
  const { index, completed } = hint
  const atHint =
    index != null && index >= 0 && index < rows.length && matches(rows[index]) ? index : -1
  if (atHint >= 0 && (completed == null || !!rows[atHint].completed === completed)) {
    return atHint
  }
  if (completed != null) {
    const sameState = rows.findIndex((row) => matches(row) && !!row.completed === completed)
    if (sameState >= 0) return sameState
  }
  if (atHint >= 0) return atHint
  return rows.findIndex(matches)
}

/**
 * Patch one row of a checklist by identity. **Pure and re-runnable** — the
 * transaction calls it once per attempt — and `null` when the row is not there,
 * which the caller reports rather than guessing at a neighbour.
 *
 * Every other row is returned **by reference** — untouched, not rebuilt — so a
 * completion, a grade note or an engagement flag written since the capture
 * started survives byte-identically.
 */
export function patchChecklistRow(
  checklist: ChecklistItem[] | undefined,
  itemKey: string,
  patch: CaptureRowPatch,
  hint: CaptureRowHint = {},
): ChecklistItem[] | null {
  const rows = checklist ?? []
  const index = resolveCaptureRowIndex(rows, itemKey, hint)
  if (index < 0) return null
  return rows.map((row, i) => (i === index ? { ...row, ...patch } : row))
}

/**
 * Write a capture's fields onto its own row of a saved day.
 *
 * See the module header. Never throws — the caller is mid-capture with a photo
 * already saved, and an outcome it can report is more use than an exception it
 * would have to translate.
 */
export async function writeCaptureRow(params: {
  familyId: string
  childId: string
  dateKey: string
  /** {@link checklistItemKey} of the row the photo was taken for. */
  itemKey: string
  patch: CaptureRowPatch
  /** Tells identical rows apart. See {@link resolveCaptureRowIndex}. */
  hint?: CaptureRowHint
  /** Names the door in the guard's log line. */
  context: string
}): Promise<CaptureRowWriteOutcome> {
  const { familyId, childId, dateKey, itemKey, patch, hint, context } = params
  try {
    const ref = doc(daysCollection(familyId), dayLogDocId(dateKey, childId))
    const outcome = await patchDayChecklistGuarded(
      ref,
      (checklist) => patchChecklistRow(checklist, itemKey, patch, hint),
      context,
    )
    if (outcome === 'no-day') return { status: 'refused', reason: 'no-day' }
    if (outcome === 'no-row') return { status: 'refused', reason: 'row-gone' }
    return { status: 'done' }
  } catch (err) {
    console.error('[captureRowWrite] could not link the capture to its row', err)
    return { status: 'failed' }
  }
}

/**
 * What to say when the row write did not land.
 *
 * The photo is saved in every one of these cases — the artifact document is
 * written and uploaded before this lane runs — so each sentence says that first.
 * `null` on success, so a caller cannot accidentally announce a failure.
 */
export function captureRowWriteNotice(
  outcome: CaptureRowWriteOutcome,
): string | null {
  if (outcome.status === 'done') return null
  if (outcome.status === 'refused' && outcome.reason === 'row-gone') {
    return "Photo saved, but that row isn't on the day any more, so nothing was attached to it."
  }
  if (outcome.status === 'refused' && outcome.reason === 'no-day') {
    return "Photo saved, but this day's plan isn't there to attach it to."
  }
  return "Photo saved, but it couldn't be attached to the row. Try the photo again."
}
