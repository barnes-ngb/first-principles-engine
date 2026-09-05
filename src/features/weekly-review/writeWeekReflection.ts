import { doc, setDoc } from 'firebase/firestore'

import {
  weeklyReviewDocId,
  weeklyReviewsCollection,
} from '../../core/firebase/firestore'
import type { WeekReflection } from '../../core/types'

/**
 * The ONE write behind the week's question (UX-214).
 *
 * A single-key **merge** into the existing `weeklyReviews` doc, never a
 * whole-document `setDoc`: the page's own "Mark as Reviewed" / "Apply
 * adjustments" handlers rewrite the whole review from local state, and the
 * Cloud Function rewrites it on regenerate, so a full write from here could
 * clobber either side. Merging one key means the parent's answer can only ever
 * add itself.
 *
 * It writes **nothing else**. Not the plan, not an hours figure, not the
 * position snapshot, not the review's status — the answer is a record of a
 * judgement, and a judgement that silently moved something would be the quota
 * again.
 */
export async function writeWeekReflection(
  familyId: string,
  childId: string,
  weekKey: string,
  reflection: WeekReflection,
): Promise<void> {
  const ref = doc(
    weeklyReviewsCollection(familyId),
    weeklyReviewDocId(weekKey, childId),
  )
  await setDoc(ref, { reflection }, { merge: true })
}
