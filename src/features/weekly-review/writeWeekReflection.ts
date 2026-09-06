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
 * It writes **nothing else that means anything**. Not the plan, not an hours
 * figure, not the position snapshot, not the review's status — the answer is a
 * record of a judgement, and a judgement that silently moved something would be
 * the quota again.
 *
 * ── Why `childId` and `weekKey` ride along (UX-219) ─────────────────────────
 *
 * Since the page names a school week the moment its Friday is over, a parent can
 * answer on **Saturday**, before the Sunday cron has written anything. This
 * merge then *creates* the document rather than adding to one. A document
 * carrying only `reflection` would have no `childId` and no `weekKey`, and both
 * are queried: the monthly generator reads `where("childId", "==", …)` and
 * filters on `weekKey` (`functions/src/ai/tasks/monthlyReviewData.ts`). They are
 * the document's own identity — already fixed by the id this function derives —
 * so writing them asserts nothing new and cannot contradict the cron, which
 * writes the same two values.
 *
 * The answer still survives the cron: `writeReviewDoc` reads an existing
 * `reflection` and carries it forward inside a transaction (UX-212).
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
  await setDoc(ref, { childId, weekKey, reflection }, { merge: true })
}
