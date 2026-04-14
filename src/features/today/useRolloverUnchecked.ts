import { useEffect, useRef } from 'react'
import { doc, getDoc } from 'firebase/firestore'

import { daysCollection } from '../../core/firebase/firestore'
import type { DayLog } from '../../core/types'
import { dayLogDocId } from './daylog.model'
import { computeRollover, getPreviousSchoolDay } from './rollover'

interface UseRolloverParams {
  familyId: string
  childId: string
  today: string
  dayLog: DayLog | null
  persistDayLogImmediate: (updated: DayLog) => void
}

/**
 * Auto-rolls unchecked items from the previous school day into today's checklist.
 *
 * Fires once per child+date combination when today's dayLog first loads.
 * Skips if today is a weekend, or if the previous school day has no incomplete items.
 */
export function useRolloverUnchecked({
  familyId,
  childId,
  today,
  dayLog,
  persistDayLogImmediate,
}: UseRolloverParams) {
  // Track which child+date we've already rolled over to prevent re-runs
  const rolledRef = useRef<string>('')

  useEffect(() => {
    if (!familyId || !childId || !dayLog) return

    const key = `${today}_${childId}`
    if (rolledRef.current === key) return

    const previousDate = getPreviousSchoolDay(today)
    if (!previousDate) {
      // Weekend — no rollover
      rolledRef.current = key
      return
    }

    // If today already has rolled-over items, don't re-run
    if (dayLog.checklist?.some((item) => item.rolledOver)) {
      rolledRef.current = key
      return
    }

    rolledRef.current = key

    // Fetch yesterday's day log and attempt rollover
    const prevDocId = dayLogDocId(previousDate, childId)
    const prevRef = doc(daysCollection(familyId), prevDocId)

    getDoc(prevRef)
      .then((snap) => {
        if (!snap.exists()) return

        const prevDayLog = snap.data() as DayLog
        const merged = computeRollover(
          today,
          dayLog.checklist ?? [],
          prevDayLog,
        )

        if (merged) {
          persistDayLogImmediate({
            ...dayLog,
            checklist: merged,
          })
        }
      })
      .catch((err) => {
        console.warn('[rollover] Failed to load previous day log:', err)
      })
  }, [familyId, childId, today, dayLog, persistDayLogImmediate])
}
