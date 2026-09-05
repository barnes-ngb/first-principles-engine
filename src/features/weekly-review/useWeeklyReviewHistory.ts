import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'

import {
  weeklyReviewDocId,
  weeklyReviewsCollection,
} from '../../core/firebase/firestore'
import type { WeeklyReview } from '../../core/types'
import { HISTORY_WEEKS, previousWeekKeys } from './weeklyReviewHistory'

export interface UseWeeklyReviewHistoryResult {
  /** Earlier reviews for this child, newest first. Missing weeks are absent. */
  reviews: WeeklyReview[]
  loading: boolean
  /**
   * True when the read failed. Distinct from an empty list, and the distinction
   * matters: an empty list means there are genuinely no earlier weeks, while a
   * failed read means we do not know — and reporting "First week recorded" on a
   * dropped connection would be a claim made on no evidence.
   */
  failed: boolean
}

/**
 * The child's earlier weekly reviews, fetched by document id (UX-213 / UX-214).
 *
 * Two consumers, one read: the observed-rate line needs the most recent earlier
 * `curriculumPositions` snapshot, and the week's question needs the earlier
 * answers so three *"we can do more"* in a row is visible.
 *
 * By id rather than by query: `weeklyReviews` docs are keyed
 * `{weekKey}_{childId}` and the week keys are derivable, so a bounded set of
 * `getDoc`s reads exactly the weeks that could matter and needs no
 * `where(childId) + orderBy(weekKey)` composite index. A week with no review
 * simply does not come back, which is the honest shape — a missing week is
 * unknown, not zero.
 */
export function useWeeklyReviewHistory(
  familyId: string,
  childId: string,
  weekKey: string,
): UseWeeklyReviewHistoryResult {
  const [reviews, setReviews] = useState<WeeklyReview[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  // Reset during render rather than inside the effect, so one child's earlier
  // answers can never render under another child's name.
  const requestKey = `${familyId}|${childId}|${weekKey}`
  const [lastKey, setLastKey] = useState(requestKey)
  if (lastKey !== requestKey) {
    setLastKey(requestKey)
    setReviews([])
    setFailed(false)
    setLoading(true)
  }

  useEffect(() => {
    if (!familyId || !childId || !weekKey) return
    let cancelled = false

    const keys = previousWeekKeys(weekKey, HISTORY_WEEKS)
    const col = weeklyReviewsCollection(familyId)

    Promise.all(
      keys.map((key) => getDoc(doc(col, weeklyReviewDocId(key, childId)))),
    )
      .then((snaps) => {
        if (cancelled) return
        setReviews(
          snaps
            .filter((snap) => snap.exists())
            .map((snap) => ({
              ...(snap.data() as WeeklyReview),
              id: snap.id,
            })),
        )
        setFailed(false)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.error('[UX-213] Failed to load weekly review history', err)
        setFailed(true)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [familyId, childId, weekKey])

  return { reviews, loading, failed }
}
