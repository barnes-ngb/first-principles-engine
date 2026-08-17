// ── The chat's write lane for a drafted week (FEAT-150) ──────────────────────
//
// **This is a router with one rail, not a writer.** The write itself is
// `planner-chat/applyWeekPlan.ts` — the same Apply the planner calls, extracted
// in this run's first commit. Nothing here rebuilds a checklist row, a block, a
// retain rule or a day document; if it did, this file would be the third copy of
// a day write in this app's history and the first two both shipped compliance
// bugs (FEAT-111, FEAT-114's P0).
//
// What it adds is the one rule the shared Apply cannot hold, because the planner
// legitimately needs the opposite of it: **the chat may only write the NEXT
// school week.** The planner writes the live week — that is its whole job. The
// chat must not, because the live week is a week the family is already working
// through, owned by the planner and by FEAT-142's live-day edits. So the rail
// lives on this lane rather than inside the shared module, where it would have
// had to be an option the planner switches off — and an option a caller can
// switch off is not a rail.
//
// The clock is re-read HERE, at the write, not trusted from the card. A chat
// page left open across a Sunday→Monday rollover holds a draft whose target week
// has since become the current one; the resolution that was correct when the
// card rendered is wrong by the time it is tapped. Checking at stage time and
// again at render time does not cover that gap. Checking here does.

import type { DraftWeeklyPlan } from '../../core/types'
import {
  applyDraftWeek,
  WeekApplyError,
  type ApplyWeekPlanResult,
  type ApplyWorkbookConfig,
} from '../planner-chat/applyWeekPlan'
import { isNextWeekStart, NEXT_WEEK_NOTICES } from './nextWeekActions'

export interface WriteNextWeekDraftInput {
  familyId: string
  childId: string
  /** The Sunday-start key the draft was generated for. Re-checked here. */
  weekStart: string
  draft: DraftWeeklyPlan
  children: { id: string }[]
  activityConfigs: ApplyWorkbookConfig[]
  /** Parent capability, threaded explicitly — never read from the route. */
  canEdit: boolean
  /** Injectable clock, so the rollover rail is testable without waiting a week. */
  now?: Date
}

export type WriteNextWeekDraftOutcome =
  | { status: 'done'; daysWritten: string[] }
  /** Refused before any write. Nothing changed, and `notice` says why. */
  | { status: 'refused'; notice: string }
  /** Failed partway. `daysWritten` is what really landed — never rolled back. */
  | { status: 'partial'; daysWritten: string[] }

/**
 * Apply a generated draft to the next school week.
 *
 * Returns an outcome rather than throwing, because every failure here has a
 * sentence a parent needs to read, and a thrown error at a confirm tap becomes
 * either a swallowed console line or a generic "something went wrong".
 *
 * Note what is NOT passed through to the shared Apply: no `lessonCardMap` (the
 * chat generates no lesson cards — that is a second AI spend the parent was not
 * told about when she tapped "apply this week"), and no `readAloudBookId` (the
 * chat has no book picker, and `undefined` means "leave the week's book alone",
 * so a chat apply can never blank a book chosen in the planner).
 */
export async function writeNextWeekDraft(
  input: WriteNextWeekDraftInput,
): Promise<WriteNextWeekDraftOutcome> {
  const {
    familyId,
    childId,
    weekStart,
    draft,
    children,
    activityConfigs,
    canEdit,
    now = new Date(),
  } = input

  // Both gates restated at the write. The component checks them, the hook checks
  // them, and this checks them again — not from distrust of those layers but
  // because this is the layer that cannot be bypassed by a new call site.
  if (!canEdit) {
    return { status: 'refused', notice: NEXT_WEEK_NOTICES.notPermitted }
  }
  if (!isNextWeekStart(weekStart, now)) {
    console.warn(
      '[shellyChat] refused a next-week apply — target week is no longer next week',
      weekStart,
    )
    return { status: 'refused', notice: NEXT_WEEK_NOTICES.weekMoved }
  }

  try {
    const result: ApplyWeekPlanResult = await applyDraftWeek({
      familyId,
      childId,
      weekStart,
      draft,
      children,
      activityConfigs,
      canEdit,
    })
    return { status: 'done', daysWritten: result.daysWritten }
  } catch (err) {
    if (err instanceof WeekApplyError) {
      console.warn('[shellyChat] next-week apply failed partway', err.daysWritten, err)
      return { status: 'partial', daysWritten: err.daysWritten }
    }
    console.warn('[shellyChat] next-week apply failed', err)
    return { status: 'partial', daysWritten: [] }
  }
}
