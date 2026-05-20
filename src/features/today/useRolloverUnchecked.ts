import { useEffect, useRef } from 'react'
import { doc, getDoc } from 'firebase/firestore'

import { daysCollection } from '../../core/firebase/firestore'
import type { ChecklistItem, DailyPlan, DayLog } from '../../core/types'
import { enforceDailyBudget, resolveDailyBudget } from './budgetEnforcement'
import { dayLogDocId } from './daylog.model'
import { computeRollover, getPreviousSchoolDay } from './rollover'

interface UseRolloverParams {
  familyId: string
  childId: string
  today: string
  dayLog: DayLog | null
  dailyPlan?: DailyPlan | null
  persistDayLogImmediate: (updated: DayLog) => void
}

/**
 * Auto-rolls unchecked items from the previous school day into today's checklist,
 * then enforces the daily time budget by deferring lowest-priority overflow items.
 *
 * Fires once per child+date combination when today's dayLog first loads.
 * Skips rollover if today is a weekend or the previous school day has no incomplete items,
 * but still runs budget enforcement if a budget is set and the current checklist exceeds it.
 */
export function useRolloverUnchecked({
  familyId,
  childId,
  today,
  dayLog,
  dailyPlan,
  persistDayLogImmediate,
}: UseRolloverParams) {
  // Track which child+date we've already processed to prevent re-runs
  const rolledRef = useRef<string>('')

  useEffect(() => {
    if (!familyId || !childId || !dayLog) return

    const key = `${today}_${childId}`
    if (rolledRef.current === key) return

    const previousDate = getPreviousSchoolDay(today)
    const alreadyRolled =
      dayLog.checklist?.some((item) => item.rolledOver) ?? false

    const budget = resolveDailyBudget(dayLog.dailyBudgetMinutes, {
      planType: dailyPlan?.planType,
      energy: dailyPlan?.energy,
    })

    const applyBudgetOnly = (checklist: ChecklistItem[]): void => {
      if (budget <= 0) return
      const enforced = enforceDailyBudget(checklist, budget)
      const changed = enforced.checklist.some(
        (item, i) => item.deferredByBudget !== checklist[i]?.deferredByBudget,
      )
      if (changed) {
        persistDayLogImmediate({ ...dayLog, checklist: enforced.checklist })
      }
    }

    if (!previousDate) {
      // Weekend — no rollover, but still enforce budget once
      rolledRef.current = key
      applyBudgetOnly(dayLog.checklist ?? [])
      return
    }

    if (alreadyRolled) {
      rolledRef.current = key
      applyBudgetOnly(dayLog.checklist ?? [])
      return
    }

    rolledRef.current = key

    const prevDocId = dayLogDocId(previousDate, childId)
    const prevRef = doc(daysCollection(familyId), prevDocId)

    getDoc(prevRef)
      .then((snap) => {
        const currentChecklist = dayLog.checklist ?? []
        if (!snap.exists()) {
          applyBudgetOnly(currentChecklist)
          return
        }

        const prevDayLog = snap.data() as DayLog
        const merged = computeRollover(today, currentChecklist, prevDayLog)
        const afterRollover = merged ?? currentChecklist

        const enforced =
          budget > 0 ? enforceDailyBudget(afterRollover, budget) : null
        const finalChecklist = enforced?.checklist ?? afterRollover

        const rolloverChanged = merged !== null
        const budgetChanged =
          enforced !== null &&
          enforced.checklist.some(
            (item, i) => item.deferredByBudget !== afterRollover[i]?.deferredByBudget,
          )

        if (rolloverChanged || budgetChanged) {
          persistDayLogImmediate({ ...dayLog, checklist: finalChecklist })
        }
      })
      .catch((err) => {
        console.warn('[rollover] Failed to load previous day log:', err)
      })
  }, [familyId, childId, today, dayLog, dailyPlan, persistDayLogImmediate])
}
