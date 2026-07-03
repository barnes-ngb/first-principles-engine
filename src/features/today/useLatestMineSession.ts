import { useEffect, useState } from 'react'
import { getDocs, limit, orderBy, query, where } from 'firebase/firestore'

import { evaluationSessionsCollection } from '../../core/firebase/firestore'
import type { EvaluationSession } from '../../core/types/evaluation'

/**
 * Session as stored: the Knowledge Mine tags its interactive quest sessions with
 * a `sessionType` field that isn't part of the base {@link EvaluationSession}
 * shape (see `useMasteryCheckoffs`, which filters on the same field).
 */
export type MineSessionLike = EvaluationSession & { sessionType?: string }

/**
 * Pure selector — the most recent *interactive* Knowledge Mine session dated
 * `today` (YYYY-MM-DD) whose status counts as a real session (`complete` or
 * `partial`). Read-only; mirrors the `useMasteryCheckoffs` interactive filter.
 * Returns null when the child has no mine session today.
 *
 * `evaluatedAt` is stored as a full ISO timestamp, so its date slice compares
 * against `today` and its lexical order picks the latest run.
 */
export function selectLatestMineSessionToday(
  sessions: MineSessionLike[],
  today: string,
): MineSessionLike | null {
  const todays = sessions.filter(
    (s) =>
      s.sessionType === 'interactive' &&
      (s.status === 'complete' || s.status === 'partial') &&
      (s.evaluatedAt ?? '').slice(0, 10) === today,
  )
  if (todays.length === 0) return null
  return todays.reduce((latest, s) =>
    (s.evaluatedAt ?? '') > (latest.evaluatedAt ?? '') ? s : latest,
  )
}

/**
 * Read-only hook for the parent Today recap card: loads the selected child's
 * most recent interactive Knowledge Mine session dated `today`, or null.
 * Reuses the `evaluationSessions (childId, evaluatedAt)` index already used by
 * `useMasteryCheckoffs` — no new index, no writes.
 */
export function useLatestMineSession(
  familyId: string,
  childId: string | undefined,
  today: string,
): { session: MineSessionLike | null; loading: boolean } {
  const [session, setSession] = useState<MineSessionLike | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!childId) {
      setSession(null)
      return
    }
    let cancelled = false
    setLoading(true)

    async function load() {
      try {
        const snap = await getDocs(
          query(
            evaluationSessionsCollection(familyId),
            where('childId', '==', childId),
            orderBy('evaluatedAt', 'desc'),
            limit(20),
          ),
        )
        const sessions = snap.docs.map(
          (d) => ({ ...(d.data() as MineSessionLike), id: d.id }),
        )
        if (!cancelled) setSession(selectLatestMineSessionToday(sessions, today))
      } catch (err) {
        console.error('Failed to load latest mine session', err)
        if (!cancelled) setSession(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [familyId, childId, today])

  return { session, loading }
}
