import { useMemo } from 'react'

import { computeHoursSummary } from '../records/records.logic'
import { useWeekHoursInputs } from './useWeekHoursInputs'

export interface UseWeekHoursResult {
  /** Counted minutes for the week, folded by the canonical hours path. */
  totalMinutes: number
  loading: boolean
  error: Error | null
}

/**
 * The week's counted minutes for one child, read live (UX-211).
 *
 * Deliberately a READ. The three range queries and their doc→record mapping
 * moved to `useWeekHoursInputs` when a second section of this page needed the
 * same documents (UX-388) — its header says why they have one definition. This
 * hook's own job is the fold, and it is `computeHoursSummary`, which is the one
 * shared counting path, so the weekly review cannot report a different number
 * than the compliance record it sits beside. No hours or compliance math is
 * defined here either.
 *
 * Signature and result are unchanged by that extraction: `WeekPaceSection` and
 * its tests call exactly what they called before.
 */
export function useWeekHours(
  familyId: string,
  childId: string,
  weekKey: string,
): UseWeekHoursResult {
  const { dayLogs, hoursEntries, adjustments, loading, error } = useWeekHoursInputs(
    familyId,
    childId,
    weekKey,
  )

  const totalMinutes = useMemo(
    () =>
      computeHoursSummary(dayLogs, hoursEntries, adjustments, childId)
        .totalMinutes,
    [dayLogs, hoursEntries, adjustments, childId],
  )

  return { totalMinutes, loading, error }
}
