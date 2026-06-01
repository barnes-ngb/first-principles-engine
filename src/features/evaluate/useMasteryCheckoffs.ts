import { useEffect, useState } from 'react'
import { getDocs, limit, orderBy, query, where } from 'firebase/firestore'

import { daysCollection, evaluationSessionsCollection } from '../../core/firebase/firestore'
import type { DayLog } from '../../core/types/planning'
import type { EvaluationSession } from '../../core/types/evaluation'
import {
  aggregateMastery,
  extractChecklistSignals,
  extractQuestSignals,
  type MasterySkillRollup,
  type QuestSessionLike,
} from './masteryRollup'

/** How far back the rollup looks for mastery evidence. */
export const MASTERY_WINDOW_DAYS = 30

function windowStartISODate(days: number, now: Date = new Date()): string {
  const start = new Date(now)
  start.setDate(start.getDate() - days)
  return start.toISOString().slice(0, 10)
}

/**
 * FEAT-09 read side — load the recent mastery window and aggregate it into a
 * per-skill rollup. Read-only: it never writes (committing a check-off goes
 * through {@link commitMasteryRollup} on confirm). Uses the existing
 * `days (childId, date)` and `evaluationSessions (childId, evaluatedAt)`
 * indexes, so no new index is required.
 */
export function useMasteryCheckoffs(
  familyId: string,
  childId: string | undefined,
): { rollups: MasterySkillRollup[]; loading: boolean; reload: () => void } {
  const [rollups, setRollups] = useState<MasterySkillRollup[]>([])
  const [loading, setLoading] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!childId) {
      setRollups([])
      return
    }
    let cancelled = false
    setLoading(true)
    const since = windowStartISODate(MASTERY_WINDOW_DAYS)

    async function load() {
      try {
        const daysSnap = await getDocs(
          query(
            daysCollection(familyId),
            where('childId', '==', childId),
            where('date', '>=', since),
            orderBy('date', 'asc'),
          ),
        )
        const dayLogs = daysSnap.docs.map((d) => d.data() as DayLog)

        const sessionsSnap = await getDocs(
          query(
            evaluationSessionsCollection(familyId),
            where('childId', '==', childId),
            orderBy('evaluatedAt', 'desc'),
            limit(60),
          ),
        )
        const sessions: QuestSessionLike[] = sessionsSnap.docs
          .map((d) => d.data() as EvaluationSession & { sessionType?: string; questions?: unknown })
          .filter((s) => s.sessionType === 'interactive' && (s.evaluatedAt ?? '') >= since)
          .map((s) => ({
            evaluatedAt: s.evaluatedAt,
            questions: (s as unknown as QuestSessionLike).questions,
          }))

        const signals = [
          ...extractChecklistSignals(dayLogs.map((d) => ({ date: d.date, checklist: d.checklist }))),
          ...extractQuestSignals(sessions),
        ]
        if (!cancelled) setRollups(aggregateMastery(signals))
      } catch (err) {
        console.error('Failed to load mastery rollup', err)
        if (!cancelled) setRollups([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [familyId, childId, nonce])

  return { rollups, loading, reload: () => setNonce((n) => n + 1) }
}
