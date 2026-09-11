import { useCallback, useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'

import {
  dailyPlanDocId,
  dailyPlansCollection,
} from '../../core/firebase/firestore'
import type { DailyPlan } from '../../core/types'
import type { EnergyLevel, PlanType } from '../../core/types/enums'
import {
  DailyPlanSaveRefusal,
  dailyPlanIsEditable,
  type DailyPlanSaveOutcome,
} from './dailyPlanGate'

interface UseDailyPlanOptions {
  familyId: string
  childId: string
  date: string
}

interface UseDailyPlanResult {
  /** The loaded dailyPlan, or null while loading / if none exists yet. */
  dailyPlan: DailyPlan | null
  /** Whether the initial load is still in progress. */
  isLoading: boolean
  /**
   * UX-345 — did the read REJECT (as opposed to resolve to nothing)? A failed
   * read is not an affirmative empty result, and the difference matters here
   * because the write replaces `sessions` under `merge: true`.
   */
  loadFailed: boolean
  /**
   * UX-345 — may the plan be written right now? False until the read for THIS
   * child has resolved, and false forever after one that failed.
   */
  isEditable: boolean
  /**
   * Persist energy + planType to Firestore (upsert).
   *
   * UX-352 — answers whether the tap landed. Every way it can decline is named,
   * so the caller reports rather than assuming; a `void` return is what let the
   * gate below swallow a tap in silence.
   */
  saveDailyPlan: (energy: EnergyLevel, planType: PlanType) => Promise<DailyPlanSaveOutcome>
}

export function useDailyPlan({
  familyId,
  childId,
  date,
}: UseDailyPlanOptions): UseDailyPlanResult {
  const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)

  /**
   * UX-345 — the loaded plan is dropped the moment the target changes, DURING
   * RENDER, so no frame exists in which this hook holds one child's `sessions`
   * while `saveDailyPlan` addresses another child's document. Doing it in the
   * effect below would leave exactly that frame open, which is the window the
   * defect lived in. (`RecordsPage`'s UX-329 fix is the precedent; this repo's
   * lint forbids the set-state-in-effect form.)
   */
  const target = `${familyId}|${childId}|${date}`
  const [loadedTarget, setLoadedTarget] = useState(target)
  if (loadedTarget !== target) {
    setLoadedTarget(target)
    setDailyPlan(null)
    setLoadFailed(false)
    setIsLoading(true)
  }

  // Load existing dailyPlan on mount / when child or date changes
  useEffect(() => {
    if (!familyId || !childId || !date) {
      setDailyPlan(null)
      setLoadFailed(false)
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)

    const load = async () => {
      try {
        const docId = dailyPlanDocId(date, childId)
        const ref = doc(dailyPlansCollection(familyId), docId)
        const snap = await getDoc(ref)
        if (cancelled) return
        setLoadFailed(false)
        if (snap.exists()) {
          setDailyPlan(snap.data())
        } else {
          setDailyPlan(null)
        }
      } catch (err) {
        console.error('Failed to load dailyPlan', err)
        // UX-345: null AND flagged. Null alone reads as "no plan yet", and the
        // write below replaces `sessions` under `merge: true` — so a dropped
        // read would empty a day rather than report itself.
        if (!cancelled) {
          setDailyPlan(null)
          setLoadFailed(true)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [familyId, childId, date])

  const hasTarget = Boolean(familyId && childId && date)
  const isEditable = dailyPlanIsEditable({ isLoading, loadFailed, hasTarget })

  const saveDailyPlan = useCallback(
    async (energy: EnergyLevel, planType: PlanType): Promise<DailyPlanSaveOutcome> => {
      if (!familyId || !childId || !date) {
        return { ok: false, reason: DailyPlanSaveRefusal.NoTarget }
      }
      // UX-345 — GATE. Un-editable until this child's read has settled, and
      // after one that failed: the payload below carries `sessions`, and both
      // states would carry the wrong ones (the previous child's, or none over
      // a day that has some).
      //
      // UX-352 — the gate is unchanged; only its SILENCE was the defect. A
      // refusal now names which of the two states it is in, because one of them
      // resolves on its own and the other does not.
      if (!isEditable) {
        return {
          ok: false,
          reason: loadFailed
            ? DailyPlanSaveRefusal.ReadFailed
            : DailyPlanSaveRefusal.NotReady,
        }
      }

      const docId = dailyPlanDocId(date, childId)
      const ref = doc(dailyPlansCollection(familyId), docId)

      const data: Omit<DailyPlan, 'id'> & { updatedAt: string } = {
        childId,
        date,
        energy,
        planType,
        sessions: dailyPlan?.sessions ?? [],
        updatedAt: new Date().toISOString(),
      }

      try {
        await setDoc(ref, data, { merge: true })
        setDailyPlan({ ...data, id: docId })
        return { ok: true }
      } catch (err) {
        console.error('Failed to save dailyPlan', err)
        // The stored plan is untouched and `dailyPlan` is left as it was, so the
        // caller's optimistic energy / day type is the only thing out of step —
        // which is what it takes back on this answer.
        return { ok: false, reason: DailyPlanSaveRefusal.Rejected }
      }
    },
    [familyId, childId, date, dailyPlan?.sessions, isEditable, loadFailed],
  )

  return { dailyPlan, isLoading, loadFailed, isEditable, saveDailyPlan }
}
