import { useCallback, useState } from 'react'
import { addDoc } from 'firebase/firestore'

import { artifactsCollection } from '../../core/firebase/firestore'
import type { ChecklistItem, DayLog, WatchVideo } from '../../core/types'
import { applyWatchCompletion, buildWatchArtifact } from './watchItemCompletion'

interface UseWatchItemCompletionParams {
  familyId: string
  childId: string
  dayLog: DayLog | null
  persistDayLogImmediate: (updated: DayLog) => void
  /** In-scope curated videos (from `useWatchLibrary(childId)`, D7 filtered). */
  videos: WatchVideo[]
  /** Date key for the day (stamped on the artifact's `dayLogId`). */
  dayLogId?: string
}

export interface UseWatchItemCompletionResult {
  /** The watch item currently open in the player, if any. */
  watchTarget: { item: ChecklistItem; index: number } | null
  /** The resolved `WatchVideo` for the open target (null if unresolved). */
  watchVideo: WatchVideo | null
  /** Open the player for a planned watch item at `index`. */
  openWatch: (item: ChecklistItem, index: number) => void
  /** Close the player without completing (used for the error/close path). */
  closeWatch: () => void
  /**
   * Complete the open watch item: credit its planned minutes (D3, planned =
   * actual) and leave a portfolio artifact with the optional "what we saw" note.
   * Idempotent — a no-op if the item is already complete, so completing twice
   * never double-credits or double-writes. Writes **no** XP/diamonds (D6) and
   * **no** learner-model concept state (C2).
   */
  completeWatch: (note?: string) => void
}

/**
 * Watch Vehicle completion, shared by the parent (`TodayPage`) and kid
 * (`KidTodayView`) shells (FEAT-104 / design FEAT-86, slice 3). Centralizes the
 * hours-credit + artifact so both surfaces behave identically, and so the two
 * writes live in ONE place that provably touches neither the XP ledger nor the
 * learner model — the artifact `addDoc` is fire-and-forget (a failed capture
 * never blocks the already-credited completion).
 */
export function useWatchItemCompletion({
  familyId,
  childId,
  dayLog,
  persistDayLogImmediate,
  videos,
  dayLogId,
}: UseWatchItemCompletionParams): UseWatchItemCompletionResult {
  const [watchTarget, setWatchTarget] = useState<{ item: ChecklistItem; index: number } | null>(null)

  const watchVideo = watchTarget
    ? videos.find((v) => v.id === watchTarget.item.watchVideoId) ?? null
    : null

  const openWatch = useCallback((item: ChecklistItem, index: number) => {
    setWatchTarget({ item, index })
  }, [])

  const closeWatch = useCallback(() => setWatchTarget(null), [])

  const completeWatch = useCallback((note?: string) => {
    if (!watchTarget || !dayLog || !watchVideo) {
      setWatchTarget(null)
      return
    }
    // Re-read the live item so a stale captured snapshot can't complete twice.
    const current = dayLog.checklist?.[watchTarget.index]
    if (current && !current.completed) {
      // 1. Credit hours (planned = actual) via the shared item→block path.
      persistDayLogImmediate(applyWatchCompletion(dayLog, watchTarget.index, watchVideo.plannedMinutes))
      // 2. Leave the portfolio artifact — fire-and-forget; never blocks completion.
      void addDoc(
        artifactsCollection(familyId),
        buildWatchArtifact({ childId, video: watchVideo, createdAt: new Date().toISOString(), note, dayLogId }),
      ).catch((err) => console.error('[Watch] artifact create failed:', err))
    }
    setWatchTarget(null)
  }, [watchTarget, dayLog, watchVideo, persistDayLogImmediate, familyId, childId, dayLogId])

  return { watchTarget, watchVideo, openWatch, closeWatch, completeWatch }
}
