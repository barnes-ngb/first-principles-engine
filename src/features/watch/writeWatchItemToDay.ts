import { doc, getDoc } from 'firebase/firestore'

import { daysCollection } from '../../core/firebase/firestore'
import type { DayLog, WatchVideo } from '../../core/types'
import { dayLogDocId } from '../today/daylog.model'
import { setDayLogGuarded } from '../today/dayWriteGuard'
import { appendWatchItemToDayLog } from './watchDayItem'

/**
 * Write a curated video onto a day that ALREADY EXISTS in Firestore (FEAT-132).
 *
 * The planner's pre-Apply path edits a draft and lets Apply do the writing. Once
 * the week is applied there is no reachable re-apply to flush a draft edit
 * through, so a post-Apply "Add a video" has to land in the saved day itself or
 * it is silently lost. This is that write.
 *
 * Deliberately narrow:
 *  - **Purely additive** — appends ONE checklist row and touches nothing else,
 *    so a day the family is already working through can't lose a completion, a
 *    logged minute, or an evidence link;
 *  - routed through `setDayLogGuarded`, so the FEAT-114 preservation guard
 *    verifies that for us rather than trusting this function's own care;
 *  - creates the day doc if the day had no accepted items when the week was
 *    applied (a plannable day with no plan is a normal state);
 *  - writes **no** block, matching Today's own manual-add lane. Hours still
 *    count: `checklistItemCountedMinutes` reads the row's `estimatedMinutes`,
 *    and DATA-14 carries a completed item that has no matching block.
 *
 * No hours math, no XP, no learner-model write — adding a row is not watching it.
 */
export async function writeWatchItemToDay(params: {
  familyId: string
  childId: string
  /** `YYYY-MM-DD` for the day the video is being added to. */
  dateKey: string
  video: WatchVideo
}): Promise<void> {
  const { familyId, childId, dateKey, video } = params
  const ref = doc(daysCollection(familyId), dayLogDocId(dateKey, childId))
  const snap = await getDoc(ref)
  const now = new Date().toISOString()
  const existing: DayLog = snap.exists()
    ? snap.data()
    : { childId, date: dateKey, blocks: [], checklist: [], createdAt: now, updatedAt: now }

  await setDayLogGuarded(
    ref,
    { ...appendWatchItemToDayLog(existing, video), updatedAt: now },
    'add-watch-item-to-day',
  )
}
