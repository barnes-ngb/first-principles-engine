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
 *
 * ── A third reader, and a live one (UX-443) ─────────────────────────────────
 *
 * Today's week ribbon folds the same three arrays now — the owner decided the
 * question Today asks is the one Records asks — so it reads them HERE rather
 * than keeping its own `days` subscription beside a fourth loader. Today is a
 * page where a box is ticked and the week should move under the parent's thumb,
 * so it passes `{ live: true }`: the SAME three range queries and the SAME
 * doc→record mapping, delivered through `onSnapshot` instead of `getDocs`. The
 * mapping is three named functions both modes call, so the two modes cannot
 * count differently. The review page keeps the one-shot read it always had.
 */

import { useEffect, useState } from 'react'
import { getDocs, onSnapshot, query, where } from 'firebase/firestore'
import type { QueryDocumentSnapshot } from 'firebase/firestore'

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

export interface WeekHoursInputsOptions {
  /**
   * Subscribe instead of reading once (UX-443). Same queries, same mapping;
   * only the delivery differs.
   */
  live?: boolean
}

const EMPTY_DAYS: DayLog[] = []
const EMPTY_ENTRIES: HoursEntry[] = []
const EMPTY_ADJUSTMENTS: HoursAdjustment[] = []

// Same doc→record mapping the Records page uses, including the composite
// day-log key fallbacks — a different mapping here would be a different count.

function mapHoursDocs(docs: QueryDocumentSnapshot[]): HoursEntry[] {
  return docs.map((d) => {
    const data = d.data() as HoursEntry
    return {
      ...data,
      id: data.id ?? d.id,
      date: data.date ?? d.id,
      childId:
        data.childId ??
        (data.dayLogId ? deriveChildIdFromDocId(data.dayLogId) : undefined),
    }
  })
}

function mapDayDocs(docs: QueryDocumentSnapshot[]): DayLog[] {
  return docs.map((d) => {
    const data = d.data() as DayLog
    return {
      ...data,
      date: data.date ?? parseDateFromDocId(d.id),
      childId: data.childId ?? deriveChildIdFromDocId(d.id) ?? '',
    }
  })
}

function mapAdjustmentDocs(docs: QueryDocumentSnapshot[]): HoursAdjustment[] {
  return docs.map((d) => ({
    ...(d.data() as HoursAdjustment),
    id: d.id,
  }))
}

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
  options: WeekHoursInputsOptions = {},
): WeekHoursInputs {
  const live = options.live === true
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
    const hoursQuery = query(
      hoursCollection(familyId),
      where('date', '>=', start),
      where('date', '<=', end),
    )
    const daysQuery = query(
      daysCollection(familyId),
      where('date', '>=', start),
      where('date', '<=', end),
    )
    const adjustmentsQuery = query(
      hoursAdjustmentsCollection(familyId),
      where('date', '>=', start),
      where('date', '<=', end),
    )

    const fail = (err: unknown) => {
      if (cancelled) return
      console.error('[UX-211] Failed to load week hours', err)
      setError(err instanceof Error ? err : new Error(String(err)))
      setLoading(false)
    }

    if (live) {
      // Loading ends only once all three have delivered: a total folded from
      // two of three sources is a wrong number, not a partial one.
      const arrived = { hours: false, days: false, adjustments: false }
      const settle = () => {
        if (arrived.hours && arrived.days && arrived.adjustments) setLoading(false)
      }
      const unsubs = [
        onSnapshot(
          hoursQuery,
          (snap) => {
            if (cancelled) return
            setHoursEntries(mapHoursDocs(snap.docs))
            arrived.hours = true
            settle()
          },
          fail,
        ),
        onSnapshot(
          daysQuery,
          (snap) => {
            if (cancelled) return
            setDayLogs(mapDayDocs(snap.docs))
            arrived.days = true
            settle()
          },
          fail,
        ),
        onSnapshot(
          adjustmentsQuery,
          (snap) => {
            if (cancelled) return
            setAdjustments(mapAdjustmentDocs(snap.docs))
            arrived.adjustments = true
            settle()
          },
          fail,
        ),
      ]
      return () => {
        cancelled = true
        for (const unsub of unsubs) unsub()
      }
    }

    Promise.all([getDocs(hoursQuery), getDocs(daysQuery), getDocs(adjustmentsQuery)])
      .then(([hoursSnap, daysSnap, adjSnap]) => {
        if (cancelled) return
        setHoursEntries(mapHoursDocs(hoursSnap.docs))
        setDayLogs(mapDayDocs(daysSnap.docs))
        setAdjustments(mapAdjustmentDocs(adjSnap.docs))
        setLoading(false)
      })
      .catch(fail)

    return () => {
      cancelled = true
    }
  }, [familyId, childId, weekKey, live])

  return { dayLogs, hoursEntries, adjustments, loading, error }
}
