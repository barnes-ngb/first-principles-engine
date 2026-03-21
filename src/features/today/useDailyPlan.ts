import { useCallback, useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'

import {
  dailyPlanDocId,
  dailyPlansCollection,
} from '../../core/firebase/firestore'
import type { DailyPlan } from '../../core/types'
import type { EnergyLevel, PlanType } from '../../core/types/enums'

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
  /** Persist energy + planType to Firestore (upsert). */
  saveDailyPlan: (energy: EnergyLevel, planType: PlanType) => Promise<void>
}

export function useDailyPlan({
  familyId,
  childId,
  date,
}: UseDailyPlanOptions): UseDailyPlanResult {
  const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load existing dailyPlan on mount / when child or date changes
  useEffect(() => {
    if (!familyId || !childId || !date) {
      setDailyPlan(null)
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
        if (snap.exists()) {
          setDailyPlan(snap.data())
        } else {
          setDailyPlan(null)
        }
      } catch (err) {
        console.error('Failed to load dailyPlan', err)
        if (!cancelled) setDailyPlan(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [familyId, childId, date])

  const saveDailyPlan = useCallback(
    async (energy: EnergyLevel, planType: PlanType) => {
      if (!familyId || !childId || !date) return

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
      } catch (err) {
        console.error('Failed to save dailyPlan', err)
      }
    },
    [familyId, childId, date, dailyPlan?.sessions],
  )

  return { dailyPlan, isLoading, saveDailyPlan }
}
