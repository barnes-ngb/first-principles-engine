import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { doc, onSnapshot, query, setDoc, where } from 'firebase/firestore'

import { stonebridgeProgressCollection, xpLedgerCollection } from '../../../core/firebase/firestore'
import type { StonebridgeProgress } from '../../../core/types/stonebridge'
import {
  advanceMissions,
  countReadingActions,
  initialStonebridgeProgress,
  type MissionComputation,
  type ReadingActivityEvent,
} from './computeStonebridgeProgress'
import { getMission, type StonebridgeMission } from './missions'

export interface StonebridgeProgressData {
  /** The mission currently shown as the live card. */
  mission: StonebridgeMission | null
  /** Derived counters for the active mission. */
  active: MissionComputation | null
  /** Completed mission ids, in order. */
  completedMissions: string[]
  /** Raised banner location ids. */
  raisedBanners: string[]
  /** Lifetime reading actions counted (book reads + quest completions). */
  totalReadingActions: number
  /**
   * Mission id that completed during *this* session (one-shot per completion).
   * Drives the banner-raise celebration. Caller clears it via {@link clearJustCompleted}.
   */
  justCompletedMissionId: string | null
  clearJustCompleted: () => void
  loading: boolean
}

const EMPTY: StonebridgeProgressData = {
  mission: null,
  active: null,
  completedMissions: [],
  raisedBanners: [],
  totalReadingActions: 0,
  justCompletedMissionId: null,
  clearJustCompleted: () => {},
  loading: true,
}

/** Keyed snapshot wrappers so a child switch can't show stale data (see useXpLedger). */
interface ReadingSnapshot {
  key: string
  count: number
}
interface ProgressSnapshot {
  key: string
  /** null = the doc does not exist yet. */
  doc: StonebridgeProgress | null
}

/**
 * Live Banner Rally progress for a child.
 *
 * Reads reading activity **read-only** from xpLedger per-event docs and persists
 * derived mission counters to `stonebridgeProgress/{childId}`. This hook NEVER
 * writes to xpLedger / avatarProfile / forge state — mission progress only.
 */
export function useStonebridgeProgress(familyId: string, childId: string): StonebridgeProgressData {
  const [reading, setReading] = useState<ReadingSnapshot | null>(null)
  const [progress, setProgress] = useState<ProgressSnapshot | null>(null)
  const [justCompletedMissionId, setJustCompletedMissionId] = useState<string | null>(null)

  // Tracks completions already surfaced (per key) so a reload doesn't replay them.
  const celebratedRef = useRef<Set<string>>(new Set())
  const seededKeyRef = useRef<string | null>(null)
  // Guards against duplicate writes while a persist is in flight.
  const writingRef = useRef(false)

  const expectedKey = familyId && childId ? `${familyId}_${childId}` : ''

  // ── Read reading activity (read-only) ────────────────────────────
  useEffect(() => {
    if (!familyId || !childId) return
    const key = `${familyId}_${childId}`
    const q = query(xpLedgerCollection(familyId), where('childId', '==', childId))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const events: ReadingActivityEvent[] = snap.docs.map((d) => {
          const data = d.data() as { type?: string; currencyType?: string }
          return { type: data.type, currencyType: data.currencyType }
        })
        setReading({ key, count: countReadingActions(events) })
      },
      (err) => {
        console.warn('useStonebridgeProgress: reading-activity snapshot error', err)
        setReading({ key, count: 0 })
      },
    )
    return unsub
  }, [familyId, childId])

  // ── Read persisted mission progress ──────────────────────────────
  useEffect(() => {
    if (!familyId || !childId) return
    const key = `${familyId}_${childId}`
    const ref = doc(stonebridgeProgressCollection(familyId), childId)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? (snap.data() as StonebridgeProgress) : null
        // Seed already-completed missions once per child so reloads don't replay.
        if (seededKeyRef.current !== key) {
          celebratedRef.current = new Set(data?.completedMissions ?? [])
          seededKeyRef.current = key
        }
        setProgress({ key, doc: data })
      },
      (err) => {
        console.warn('useStonebridgeProgress: progress snapshot error', err)
        setProgress({ key, doc: null })
      },
    )
    return unsub
  }, [familyId, childId])

  const readingReady = reading?.key === expectedKey
  const progressReady = progress?.key === expectedKey
  const readingActions = readingReady ? reading!.count : null
  const progressDoc = progressReady ? progress!.doc : undefined

  // ── Reconcile + persist (mission-progress doc only) ──────────────
  useEffect(() => {
    if (!expectedKey) return
    if (readingActions === null || progressDoc === undefined) return
    if (writingRef.current) return

    const now = new Date().toISOString()

    // No doc yet → create it with a baseline at the current count so existing
    // lifetime reading doesn't auto-complete the opening mission.
    if (progressDoc === null) {
      writingRef.current = true
      const fresh = initialStonebridgeProgress(childId, readingActions, now)
      void setDoc(doc(stonebridgeProgressCollection(familyId), childId), fresh)
        .catch((err) => console.warn('useStonebridgeProgress: create failed', err))
        .finally(() => { writingRef.current = false })
      return
    }

    const { state, changed, newlyCompleted } = advanceMissions(progressDoc, readingActions, now)

    // Surface a not-yet-celebrated completion for the banner-raise celebration.
    const freshCompletion = newlyCompleted.find((id) => !celebratedRef.current.has(id))
    if (freshCompletion) {
      celebratedRef.current.add(freshCompletion)
      setJustCompletedMissionId(freshCompletion)
    }

    if (changed) {
      writingRef.current = true
      void setDoc(doc(stonebridgeProgressCollection(familyId), childId), state)
        .catch((err) => console.warn('useStonebridgeProgress: persist failed', err))
        .finally(() => { writingRef.current = false })
    }
  }, [expectedKey, familyId, childId, readingActions, progressDoc])

  const clearJustCompleted = useCallback(() => setJustCompletedMissionId(null), [])

  return useMemo<StonebridgeProgressData>(() => {
    if (!expectedKey) return EMPTY
    if (readingActions === null || progressDoc === undefined || progressDoc === null) {
      return { ...EMPTY, clearJustCompleted, totalReadingActions: readingActions ?? 0 }
    }
    const { active } = advanceMissions(progressDoc, readingActions, progressDoc.updatedAt)
    return {
      mission: active ? getMission(active.missionId) ?? null : null,
      active,
      completedMissions: progressDoc.completedMissions,
      raisedBanners: progressDoc.raisedBanners,
      totalReadingActions: readingActions,
      justCompletedMissionId,
      clearJustCompleted,
      loading: false,
    }
  }, [expectedKey, readingActions, progressDoc, justCompletedMissionId, clearJustCompleted])
}
