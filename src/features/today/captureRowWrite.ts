import { doc, getDoc } from 'firebase/firestore'

import { daysCollection } from '../../core/firebase/firestore'
import type { ChecklistItem, DayLog } from '../../core/types'
import { dayLogDocId } from './daylog.model'
import { checklistItemKey, updateDayLogGuarded } from './dayWriteGuard'

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
 * Read the live document, find the row **by identity** (`checklistItemKey`, the
 * same notion `dayWriteGuard` uses and `liveDayEdit` resolves by — an index
 * captured when the camera opened can shift under a rollover or a concurrent
 * add), patch that row, and write through {@link updateDayLogGuarded} with
 * `checklist` alone. A Firestore array cannot be patched element-wise, so the
 * checklist is re-sent whole — but it is the checklist that was *just read*, and
 * `blocks`, `xpTotal`, `energy` and every other day-level field are not in the
 * payload at all.
 *
 * The guard runs in **enforcing** mode here, unlike the manual-edit lane: this
 * writer is purely additive on one row and can never legitimately drop a
 * completion, a minute or an evidence link, so a violation is a bug and should
 * throw rather than be logged past.
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
 * Patch one row of a checklist by identity. Pure; returns `null` when the row is
 * not there, which the caller reports rather than guessing at a neighbour.
 *
 * Every other row is returned **by reference** — untouched, not rebuilt — so a
 * completion, a grade note or an engagement flag written since the capture
 * started survives byte-identically.
 */
export function patchChecklistRow(
  checklist: ChecklistItem[] | undefined,
  itemKey: string,
  patch: CaptureRowPatch,
): ChecklistItem[] | null {
  const rows = checklist ?? []
  const index = rows.findIndex((row) => checklistItemKey(row) === itemKey)
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
  /** Names the door in the guard's log line. */
  context: string
}): Promise<CaptureRowWriteOutcome> {
  const { familyId, childId, dateKey, itemKey, patch, context } = params
  try {
    const ref = doc(daysCollection(familyId), dayLogDocId(dateKey, childId))
    const snap = await getDoc(ref)
    if (!snap.exists()) return { status: 'refused', reason: 'no-day' }
    const live = snap.data() as DayLog
    const checklist = patchChecklistRow(live.checklist, itemKey, patch)
    if (!checklist) return { status: 'refused', reason: 'row-gone' }
    await updateDayLogGuarded(
      ref,
      { checklist, updatedAt: new Date().toISOString() },
      context,
    )
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
