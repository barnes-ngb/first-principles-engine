/**
 * The reads behind the by-subject rollup (UX-388).
 *
 * Thin on purpose: it fetches, and `weekBySubject.ts` decides. Five inputs,
 * none of them written:
 *
 *   • `days` / `hours` / `hoursAdjustments` — through the shared
 *     {@link useWeekHoursInputs}, so this section and the hours line below it
 *     fold the same documents with the same mapping;
 *   • `artifacts` — the week's evidence, range-queried on `createdAt` exactly as
 *     `PortfolioPage` does;
 *   • `activityConfigs` — through the read-only `useChatActivityConfigs`, the
 *     one subscribe in the app that reads configs without seeding or migrating
 *     anything. A third copy of that subscribe is what its own header exists to
 *     prevent.
 *
 * **Nothing here writes.** No day log, no hours entry, no config, no review
 * document, no migration on load.
 *
 * ── A failed read is never a result ─────────────────────────────────────────
 *
 * The page's one rule, and this hook is where the three reads' failures are kept
 * apart:
 *
 *   • the hours documents failed → `hoursFailed`, and the section says it
 *     could not look. Without the day logs there are neither hours nor items,
 *     so there is no partial answer to give;
 *   • the artifacts failed → `artifacts: null` reaches the pure fold, which
 *     propagates it as `artifactCount: null` / `topics: null` — a count the
 *     presenter is unable to render as zero;
 *   • the configs failed → `useChatActivityConfigs` hands back `[]`, and
 *     grouping falls back to the logged label. That splits an activity renamed
 *     mid-week into two lines holding the same total count, which understates a
 *     merge and misstates nothing, so it gets no warning line.
 */

import { useEffect, useMemo, useState } from 'react'
import { getDocs, query, where } from 'firebase/firestore'

import { artifactsCollection } from '../../core/firebase/firestore'
import type { Artifact } from '../../core/types'
import { weekRangeFromDateKey } from '../../core/utils/dateKey'
import { useChatActivityConfigs } from '../shelly-chat/useChatActivityConfigs'
import { groupWeekBySubject } from './weekBySubject'
import type { WeekSubjectSummary } from './weekBySubject'
import { useWeekHoursInputs } from './useWeekHoursInputs'

export interface UseWeekBySubjectResult {
  subjects: WeekSubjectSummary[]
  loading: boolean
  /** The week's day logs / hours / adjustments could not be read. */
  hoursFailed: boolean
  /** The week's artifacts could not be read — evidence is absent, not zero. */
  evidenceFailed: boolean
}

const EMPTY_ARTIFACTS: Artifact[] = []

export function useWeekBySubject(
  familyId: string,
  childId: string,
  weekKey: string,
): UseWeekBySubjectResult {
  const {
    dayLogs,
    hoursEntries,
    adjustments,
    loading: hoursLoading,
    error: hoursError,
  } = useWeekHoursInputs(familyId, childId, weekKey)

  const configs = useChatActivityConfigs(familyId, childId)

  const [artifacts, setArtifacts] = useState<Artifact[]>(EMPTY_ARTIFACTS)
  const [artifactsLoading, setArtifactsLoading] = useState(true)
  const [artifactsFailed, setArtifactsFailed] = useState(false)

  // Reset during render, the same rule `useWeekHoursInputs` follows: a stale
  // week's evidence must never be shown as the new week's.
  const requestKey = `${familyId}|${childId}|${weekKey}`
  const [lastKey, setLastKey] = useState(requestKey)
  if (lastKey !== requestKey) {
    setLastKey(requestKey)
    setArtifacts(EMPTY_ARTIFACTS)
    setArtifactsFailed(false)
    setArtifactsLoading(true)
  }

  useEffect(() => {
    if (!familyId || !childId || !weekKey) return
    let cancelled = false

    const { start, end } = weekRangeFromDateKey(weekKey)

    // `createdAt` is a full ISO timestamp, so the upper bound carries the end of
    // the day — the same range `PortfolioPage` uses for a month of evidence.
    getDocs(
      query(
        artifactsCollection(familyId),
        where('createdAt', '>=', start),
        where('createdAt', '<=', `${end}T23:59:59`),
      ),
    )
      .then((snap) => {
        if (cancelled) return
        setArtifacts(
          snap.docs.map((d) => ({ ...(d.data() as Artifact), id: d.id })),
        )
        setArtifactsFailed(false)
        setArtifactsLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.error('[UX-388] Failed to load this week’s artifacts', err)
        setArtifactsFailed(true)
        setArtifactsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [familyId, childId, weekKey])

  const subjects = useMemo(() => {
    if (hoursError) return []
    return groupWeekBySubject({
      dayLogs,
      hoursEntries,
      adjustments,
      // `null` is "could not be read", and it is what keeps a dropped query from
      // rendering as an affirmative zero.
      artifacts: artifactsFailed ? null : artifacts,
      configs,
      childId,
    })
  }, [
    hoursError,
    dayLogs,
    hoursEntries,
    adjustments,
    artifacts,
    artifactsFailed,
    configs,
    childId,
  ])

  return {
    subjects,
    loading: hoursLoading || artifactsLoading,
    hoursFailed: hoursError !== null,
    evidenceFailed: artifactsFailed,
  }
}
