import { useEffect, useMemo, useState } from 'react'
import { getDocs, query, where } from 'firebase/firestore'

import {
  daysCollection,
  hoursAdjustmentsCollection,
  hoursCollection,
} from '../../core/firebase/firestore'
import type { DayLog, HoursAdjustment, HoursEntry } from '../../core/types'
import { deriveChildIdFromDocId, parseDateFromDocId } from '../../core/utils/docId'
import { weekRangeFromDateKey } from '../../core/utils/dateKey'
import { computeHoursSummary } from '../records/records.logic'

export interface UseWeekHoursResult {
  /** Counted minutes for the week, folded by the canonical hours path. */
  totalMinutes: number
  loading: boolean
  error: Error | null
}

/**
 * The week's counted minutes for one child, read live (UX-211).
 *
 * Deliberately a READ. It performs the same three range queries the Records page
 * performs (`hours`, `days`, `hoursAdjustments` over the Sun–Sat week) and folds
 * them through `computeHoursSummary`, which is the one shared counting path —
 * so the weekly review cannot report a different number than the compliance
 * record it sits beside. No hours or compliance math is defined here; this file
 * only fetches the three inputs that path already takes.
 *
 * It does **not** run `migrateUnattributedAdjustments`. That DATA-09 stamp is
 * the Records page's job and is idempotent there; a read-only review surface has
 * no business writing to the hours record on load.
 */
export function useWeekHours(
  familyId: string,
  childId: string,
  weekKey: string,
): UseWeekHoursResult {
  const [dayLogs, setDayLogs] = useState<DayLog[]>([])
  const [hoursEntries, setHoursEntries] = useState<HoursEntry[]>([])
  const [adjustments, setAdjustments] = useState<HoursAdjustment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Reset during render rather than inside the effect: the week or the child can
  // change under us, and a stale total must never be shown as the new one's.
  const requestKey = `${familyId}|${childId}|${weekKey}`
  const [lastKey, setLastKey] = useState(requestKey)
  if (lastKey !== requestKey) {
    setLastKey(requestKey)
    setDayLogs([])
    setHoursEntries([])
    setAdjustments([])
    setError(null)
    setLoading(true)
  }

  useEffect(() => {
    if (!familyId || !childId || !weekKey) return
    let cancelled = false

    const { start, end } = weekRangeFromDateKey(weekKey)

    Promise.all([
      getDocs(
        query(
          hoursCollection(familyId),
          where('date', '>=', start),
          where('date', '<=', end),
        ),
      ),
      getDocs(
        query(
          daysCollection(familyId),
          where('date', '>=', start),
          where('date', '<=', end),
        ),
      ),
      getDocs(
        query(
          hoursAdjustmentsCollection(familyId),
          where('date', '>=', start),
          where('date', '<=', end),
        ),
      ),
    ])
      .then(([hoursSnap, daysSnap, adjSnap]) => {
        if (cancelled) return
        // Same doc→record mapping the Records page uses, including the
        // composite day-log key fallbacks — a different mapping here would be a
        // different count.
        setHoursEntries(
          hoursSnap.docs.map((d) => {
            const data = d.data() as HoursEntry
            return {
              ...data,
              id: data.id ?? d.id,
              date: data.date ?? d.id,
              childId:
                data.childId ??
                (data.dayLogId
                  ? deriveChildIdFromDocId(data.dayLogId)
                  : undefined),
            }
          }),
        )
        setDayLogs(
          daysSnap.docs.map((d) => {
            const data = d.data() as DayLog
            return {
              ...data,
              date: data.date ?? parseDateFromDocId(d.id),
              childId: data.childId ?? deriveChildIdFromDocId(d.id) ?? '',
            }
          }),
        )
        setAdjustments(
          adjSnap.docs.map((d) => ({
            ...(d.data() as HoursAdjustment),
            id: d.id,
          })),
        )
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.error('[UX-211] Failed to load week hours', err)
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [familyId, childId, weekKey])

  const totalMinutes = useMemo(
    () =>
      computeHoursSummary(dayLogs, hoursEntries, adjustments, childId)
        .totalMinutes,
    [dayLogs, hoursEntries, adjustments, childId],
  )

  return { totalMinutes, loading, error }
}
