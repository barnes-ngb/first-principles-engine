import { useCallback, useEffect, useState } from 'react'
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
) {
  const scope = JSON.stringify([familyId, childId, todayDateKey])
  const [state, setState] = useState<{
    scope: string; visit: number; attempt: number
    status: 'loading' | 'ready' | 'unavailable'; minutes: number | null
  }>({ scope, visit: 0, attempt: 0, status: 'loading', minutes: null })
  // Reset during render: the new child/day never borrows the previous total.
  if (state.scope !== scope) {
    setState({ scope, visit: state.visit + 1, attempt: 0, status: 'loading', minutes: null })
  }
  const { visit, attempt } = state

  useEffect(() => {
    if (!familyId || !childId || !todayDateKey) return
    let active = true
    const q = query(
      hoursCollection(familyId),
      where('childId', '==', childId),
      where('date', '==', todayDateKey),
      where('source', '==', 'knowledge-mine'),
    )
    getDocs(q)
      .then((snap) => {
        if (!active) return
        const total = snap.docs.reduce(
          (sum, d) => sum + (d.data().minutes ?? 0),
          0,
        )
        setState((prev) => prev.visit === visit && prev.attempt === attempt ? {
          ...prev, status: 'ready', minutes: total > 0 ? roundToFiveMinutes(total) : 0,
        } : prev)
      })
      .catch((err) => {
        if (!active) return
        console.error('[MiningCard] Load hours failed:', err)
        setState((prev) => prev.visit === visit && prev.attempt === attempt ? { ...prev, status: 'unavailable', minutes: null } : prev)
      })
    return () => { active = false }
  }, [familyId, childId, todayDateKey, visit, attempt])

  const retry = useCallback(() => {
    setState((prev) => prev.scope === scope && prev.visit === visit && prev.status === 'unavailable'
      ? { ...prev, attempt: prev.attempt + 1, status: 'loading', minutes: null } : prev)
  }, [scope, visit])

  return { status: state.status, minutes: state.minutes, retry }
}
