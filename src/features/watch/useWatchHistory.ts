import { useEffect, useState } from 'react'
import { getDocs, orderBy, query, where } from 'firebase/firestore'

import { useFamilyId } from '../../core/auth/useAuth'
import { daysCollection } from '../../core/firebase/firestore'
import { formatDateYmd } from '../../core/utils/format'
import type { DayLog } from '../../core/types/planning'
import { buildWatchHistory, type WatchHistoryIndex } from './watchHistory'

/**
 * How far back the library looks for completed watches (FEAT-139).
 *
 * **This is a real bound, and the UI says so.** A watch history that silently
 * covered only part of the year would read as "never watched" for a video the
 * boys finished last term — worse than an honest window — so every surface that
 * renders this data labels it "in the last {@link WATCH_HISTORY_WINDOW_DAYS}
 * days" rather than "never".
 *
 * **Why 90 and not the whole year.** Day logs are one document per child per
 * date, so the read is roughly `children × school days in the window`: ~130
 * documents for this family at 90 days, fetched once when a parent opens
 * `/watch`. A full school year would be ~4× that on every visit, on a screen
 * whose job is "find me a video" — not worth it. Ninety days covers a term,
 * which is the horizon that answers the question a parent is actually asking
 * ("did we already do this one?").
 *
 * **What it hides:** a video last watched more than 90 days ago reports as not
 * watched in the window. The completion record itself is untouched and still
 * lives in the day log and the portfolio artifact; only this convenience read is
 * bounded.
 */
export const WATCH_HISTORY_WINDOW_DAYS = 90

/**
 * First date (inclusive) in the window, as a **local** `YYYY-MM-DD`.
 *
 * Formatted with the shared `formatDateYmd`, never `toISOString()`. Day-log doc
 * keys are local date strings (`todayKey`), and `setDate` subtracts in local
 * time — so serialising the result in UTC would mix the two calendars and shift
 * the boundary by a day for any evening west of Greenwich (8 PM on Aug 11 in Los
 * Angeles would yield May 14 instead of May 13), silently dropping the real
 * boundary day's watches out of the window.
 */
export function watchHistoryWindowStart(days = WATCH_HISTORY_WINDOW_DAYS, now: Date = new Date()): string {
  const start = new Date(now)
  start.setDate(start.getDate() - days)
  return formatDateYmd(start)
}

export interface UseWatchHistoryResult {
  history: WatchHistoryIndex
  loading: boolean
  error: string | null
  /** The window actually read, so a caller never has to re-state the constant. */
  windowDays: number
  /** Inclusive `YYYY-MM-DD` start of the window that was read. */
  since: string
}

/**
 * Load the recent day logs once and fold them into a per-video watch history.
 *
 * A **one-shot `getDocs`, not an `onSnapshot`** — this is a look-back, and a
 * library screen has no reason to hold a live subscription over a term of day
 * documents. Family-wide (no `childId` filter) because the library itself is
 * family-scoped: a row for `'both'` needs to report which boy watched it.
 *
 * Uses only the automatic single-field index on `days.date` (already declared in
 * `firestore.indexes.json`) — **no new composite index, nothing to deploy.**
 *
 * Read-only by construction: it returns a derived index and never writes.
 */
export function useWatchHistory(enabled = true): UseWatchHistoryResult {
  const familyId = useFamilyId()
  const [history, setHistory] = useState<WatchHistoryIndex>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [since] = useState(() => watchHistoryWindowStart())

  useEffect(() => {
    if (!familyId || !enabled) return
    let cancelled = false
    setLoading(true)

    async function load() {
      try {
        const snap = await getDocs(
          query(daysCollection(familyId as string), where('date', '>=', since), orderBy('date', 'asc')),
        )
        const dayLogs = snap.docs.map((d) => d.data() as DayLog)
        if (!cancelled) {
          setHistory(buildWatchHistory(dayLogs))
          setError(null)
        }
      } catch (err) {
        console.error('[WatchHistory] load failed:', err)
        // A failed history read must never take the library down with it — the
        // shelf is still usable without the "watched" line.
        if (!cancelled) {
          setHistory({})
          setError(err instanceof Error ? err.message : 'Could not load watch history')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [familyId, enabled, since])

  return { history, loading, error, windowDays: WATCH_HISTORY_WINDOW_DAYS, since }
}
