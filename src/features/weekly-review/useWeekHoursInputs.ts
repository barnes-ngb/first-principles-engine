/**
 * The three documents a week's hours are counted from, read once (UX-388).
 *
 * Extracted verbatim out of {@link useWeekHours}, which had these queries and
 * their doc→record mapping inline. It is now read by two sections of this page
 * — the hours line (`WeekPaceSection`) and the by-subject rollup above it
 * (`WeekBySubject`) — and its own header already said why a second copy would be
 * wrong: *"a different mapping here would be a different count"*. So the
 * mapping has ONE definition and the two sections fold the same arrays; the
 * rollup's subject minutes sum to the total stated below it by construction
 * rather than by coincidence.
 *
 * Deliberately a READ, and deliberately not a subscribe: the same three range
 * queries the Records page performs, mapped the same way, including the
 * composite day-log key fallbacks.
 *
 * It does **not** run `migrateUnattributedAdjustments`. That DATA-09 stamp is
 * the Records page's job and is idempotent there; a read-only review surface has
 * no business writing to the hours record on load.
 *
 * **It does not fold.** No hours or compliance math is defined here — this file
 * only fetches the three inputs the shared counting path already takes
 * (`functions/src/shared/hoursContributions.ts`, ARCH-47 slice 4).
 *
 * ── Two instances, two reads ─────────────────────────────────────────────────
 *
 * Both sections mount, so both call this hook, so the three queries run twice
 * per page view. Stated rather than hidden: the values cannot disagree (same
 * week range, same mapping, same fold), so the cost is three extra small
 * single-week reads on a parent-only surface and not a correctness risk.
 * Collapsing it means lifting the read to `WeeklyReviewPage` and passing it to
 * both sections, which changes `WeekPaceSection`'s props; filed as `UX-389`
 * rather than bundled into a feature run.
 */

import { useEffect, useState } from 'react'
import { getDocs, query, where } from 'firebase/firestore'

import {
  daysCollection,
  hoursAdjustmentsCollection,
  hoursCollection,
} from '../../core/firebase/firestore'
import type { DayLog, HoursAdjustment, HoursEntry } from '../../core/types'
import { deriveChildIdFromDocId, parseDateFromDocId } from '../../core/utils/docId'
import { weekRangeFromDateKey } from '../../core/utils/dateKey'

export interface WeekHoursInputs {
  dayLogs: DayLog[]
  hoursEntries: HoursEntry[]
  adjustments: HoursAdjustment[]
  loading: boolean
  error: Error | null
}

const EMPTY_DAYS: DayLog[] = []
const EMPTY_ENTRIES: HoursEntry[] = []
const EMPTY_ADJUSTMENTS: HoursAdjustment[] = []

/**
 * The week's `hours`, `days` and `hoursAdjustments` documents for one child's
 * week — unfolded, as they are stored.
 *
 * The child filter is NOT applied here: `collectHoursContributions` applies it
 * once, along with the DATA-09 `'both'` attribution rule for adjustments, and a
 * pre-filter here would quietly drop the family-wide adjustments that rule
 * admits.
 */
export function useWeekHoursInputs(
  familyId: string,
  childId: string,
  weekKey: string,
): WeekHoursInputs {
  const [dayLogs, setDayLogs] = useState<DayLog[]>(EMPTY_DAYS)
  const [hoursEntries, setHoursEntries] = useState<HoursEntry[]>(EMPTY_ENTRIES)
  const [adjustments, setAdjustments] = useState<HoursAdjustment[]>(EMPTY_ADJUSTMENTS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Reset during render rather than inside the effect: the week or the child can
  // change under us, and a stale total must never be shown as the new one's.
  const requestKey = `${familyId}|${childId}|${weekKey}`
  const [lastKey, setLastKey] = useState(requestKey)
  if (lastKey !== requestKey) {
    setLastKey(requestKey)
    setDayLogs(EMPTY_DAYS)
    setHoursEntries(EMPTY_ENTRIES)
    setAdjustments(EMPTY_ADJUSTMENTS)
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

  return { dayLogs, hoursEntries, adjustments, loading, error }
}
