import type { ChecklistItem } from '../../core/types'
import type { SubjectBucket } from '../../core/types/enums'

/**
 * The shape of a checklist row added to a day that is ALREADY LIVE (FEAT-142).
 *
 * `watchDayItem.ts` owns this for watch rows; this is the generic sibling, for a
 * plain "add a row to Wednesday" arriving from Ask AI. It is built to be
 * indistinguishable from what `buildWatchChecklistItem` produces minus the
 * watch-specific fields — same `(Nm)` label convention, same `estimatedMinutes`,
 * same `source: 'manual'` — because both land in the same saved day through the
 * same lane (`liveDayEdit`), and a row's provenance should not be legible from
 * its shape.
 *
 * Pure and side-effect-free: no Firestore, no hours math, no XP, no
 * learner-model write. Adding a row is not doing the work.
 *
 * ── Why `source: 'manual'`, always ──────────────────────────────────────────
 * A row a person added to a live day is not planner output, and the distinction
 * is load-bearing rather than cosmetic: `retainChecklistForApply` keeps manual
 * rows across a re-apply but drops incomplete **planner** residue, so stamping a
 * hand-added row `'planner'` would let a later apply silently delete the thing
 * the parent just asked for — the same reasoning `buildWatchChecklistItem`
 * records. (The week ribbon also excludes manual rows from the week's PLANNED
 * total, which is right: a row added mid-week was never part of the plan the
 * week was measured against. Hours are unaffected — those read
 * `estimatedMinutes ?? plannedMinutes` off a COMPLETED row and never look at
 * `source`.)
 *
 * ── Why no block ────────────────────────────────────────────────────────────
 * Every post-Apply add in this repo writes a checklist row and no `DayBlock`
 * (`writeWatchItemToDay`, Today's own add). A block is where `plannedMinutes`
 * lives, and minutes on a live week are deliberately still locked — see
 * `liveDayEdit`'s module header. Hours still count the row: DATA-14 carries a
 * completed checklist item that has no matching block.
 *
 * ── What this deliberately does NOT change ──────────────────────────────────
 * Today's in-component "Add Item" (`TodayChecklist.handleAddItem`) still builds
 * its own row, with a bare label and `plannedMinutes`. Routing it through here
 * would rewrite the label convention of every row a parent adds by hand on a
 * surface this change was not asked to touch — a visible change to Today riding
 * in on a chat feature. Consolidating the two is a real follow-up; quietly doing
 * it here is not. Both shapes are already handled everywhere that reads a row
 * (`itemMinutes` and the hours math each accept either minutes field).
 */
export function buildManualChecklistItem(params: {
  /** Kid-facing title, WITHOUT a minutes suffix. */
  title: string
  /** Planned duration. The caller validates the band; this just records it. */
  estimatedMinutes: number
  subjectBucket?: SubjectBucket
}): ChecklistItem {
  const title = params.title.trim()
  return {
    // The `(Nm)` suffix is the repo's saved-checklist label convention — what
    // `handleApplyPlan` writes and what `buildWatchChecklistItem` matches byte
    // for byte, so `parseMinutesFromLabel` reads the row correctly too.
    label: `${title} (${params.estimatedMinutes}m)`,
    completed: false,
    source: 'manual',
    estimatedMinutes: params.estimatedMinutes,
    ...(params.subjectBucket ? { subjectBucket: params.subjectBucket } : {}),
  }
}
