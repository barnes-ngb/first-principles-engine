import { useEffect, useMemo, useState } from 'react'
import { getDocs, orderBy, query, where } from 'firebase/firestore'

import { useFamilyId } from '../../core/auth/useAuth'
import { labSessionsCollection } from '../../core/firebase/firestore'
import type { LabSession } from '../../core/types/domain'

export interface UseWeekSessionsResult {
  /** All lab sessions for this child + week (across all projects). */
  sessions: LabSession[]
  isLoading: boolean
  /** Re-fetch sessions (call after creating a new session). */
  refresh: () => void
}

/**
 * Load all lab sessions for a child in a given week, across all projects.
 */
export function useWeekSessions(childId: string, weekKey: string): UseWeekSessionsResult {
  const familyId = useFamilyId()
  const [data, setData] = useState<{ sessions: LabSession[]; loaded: boolean }>({
    sessions: [],
    loaded: false,
  })
  const [tick, setTick] = useState(0)

  const canFetch = Boolean(familyId && childId && weekKey)

  useEffect(() => {
    if (!canFetch) return

    let cancelled = false

    const load = async () => {
      try {
        const q = query(
          labSessionsCollection(familyId),
          where('childId', '==', childId),
          where('weekKey', '==', weekKey),
          orderBy('createdAt', 'desc'),
        )
        const snap = await getDocs(q)
        if (cancelled) return
        setData({
          sessions: snap.docs.map((d) => ({ ...d.data(), id: d.id })),
          loaded: true,
        })
      } catch (err) {
        console.error('Failed to load week sessions', err)
        if (!cancelled) setData({ sessions: [], loaded: true })
      }
    }
    load()

    return () => { cancelled = true }
  }, [familyId, childId, weekKey, tick, canFetch])

  const refresh = useMemo(() => () => setTick((t) => t + 1), [])

  const sessions = canFetch ? data.sessions : []
  const isLoading = canFetch ? !data.loaded : false

  return { sessions, isLoading, refresh }
}
