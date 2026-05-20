import { useEffect, useState } from 'react'
import { getDocs, query, where } from 'firebase/firestore'

import { hoursCollection } from '../../core/firebase/firestore'

/**
 * Knowledge Mine hours entries are auto-logged by useQuestSession when a
 * quest session ends (source='knowledge-mine'). Each entry is already
 * rounded up to the nearest 5 minutes. We sum them for today's display
 * and normalize the total with roundToFiveMinutes in case of edge cases.
 */
export function roundToFiveMinutes(totalMinutes: number): number {
  if (totalMinutes <= 0) return 0
  return Math.max(5, Math.round(totalMinutes / 5) * 5)
}

/** Query today's auto-tracked Knowledge Mine minutes for a child. */
export function useTodayMiningMinutes(
  familyId: string,
  childId: string,
  todayDateKey: string,
): number {
  const [minutes, setMinutes] = useState(0)

  useEffect(() => {
    if (!familyId || !childId || !todayDateKey) return
    const q = query(
      hoursCollection(familyId),
      where('childId', '==', childId),
      where('date', '==', todayDateKey),
      where('source', '==', 'knowledge-mine'),
    )
    getDocs(q)
      .then((snap) => {
        const total = snap.docs.reduce(
          (sum, d) => sum + (d.data().minutes ?? 0),
          0,
        )
        setMinutes(total > 0 ? roundToFiveMinutes(total) : 0)
      })
      .catch((err) => console.error('[MiningCard] Load hours failed:', err))
  }, [familyId, childId, todayDateKey])

  return minutes
}
