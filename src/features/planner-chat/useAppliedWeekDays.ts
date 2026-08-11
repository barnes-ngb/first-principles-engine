import { useEffect, useMemo, useState } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'

import { daysCollection } from '../../core/firebase/firestore'
import type { DayLog } from '../../core/types'
import { WEEK_DAYS, dateKeyForDayPlan } from './chatPlanner.logic'

/**
 * The applied week's saved days, live (FEAT-138).
 *
 * Post-Apply, the planner's day cards are a MIRROR of documents that already
 * exist — and the card alone cannot answer the one question every live-week edit
 * turns on: has this row been done yet? A completed row has credited minutes and
 * may carry evidence, so move / remove / swap must refuse it, and the affordance
 * must be able to say so rather than failing on tap.
 *
 * Read-only, and deliberately narrow:
 *  - subscribes ONLY while the week is applied and the viewer may edit it, so a
 *    kid profile or a pre-Apply draft costs zero Firestore reads;
 *  - one range query over the week (the same `date >= / <=` shape the page's
 *    mastery load already uses), filtered to the active child client-side —
 *    days are keyed `{date}_{childId}`, so the query cannot be narrowed further
 *    without an index this run has no reason to add;
 *  - writes nothing. Every write in this feature goes through `liveDayEdit`.
 */
export function useAppliedWeekDays(params: {
  familyId: string
  childId: string | undefined
  weekStart: string
  /** Subscribe only when the week is live AND the viewer may edit it. */
  enabled: boolean
}): Map<string, DayLog> {
  const { familyId, childId, weekStart, enabled } = params
  const [days, setDays] = useState<Map<string, DayLog>>(new Map())

  const range = useMemo(() => {
    const keys = WEEK_DAYS.map((day) => dateKeyForDayPlan(weekStart, day))
    return { start: keys[0], end: keys[keys.length - 1] }
  }, [weekStart])

  // Clear at RENDER time when the subscription target changes (the pattern
  // `useDayLog` uses for a child switch), so a week's days are never briefly
  // attributed to the wrong child or the wrong week — and so nothing calls
  // setState from inside the effect body.
  const subscriptionKey = enabled && childId && range.start ? `${childId}|${range.start}` : ''
  const [loadedKey, setLoadedKey] = useState(subscriptionKey)
  if (loadedKey !== subscriptionKey) {
    setLoadedKey(subscriptionKey)
    setDays(new Map())
  }

  useEffect(() => {
    if (!subscriptionKey) return
    const daysQuery = query(
      daysCollection(familyId),
      where('date', '>=', range.start),
      where('date', '<=', range.end),
    )
    const unsubscribe = onSnapshot(
      daysQuery,
      (snap) => {
        const next = new Map<string, DayLog>()
        for (const docSnap of snap.docs) {
          const day = docSnap.data()
          if (day.childId !== childId) continue
          next.set(day.date, day)
        }
        setDays(next)
      },
      (err) => {
        // Non-fatal: without the days the cards simply stay conservative — every
        // edit affordance locks rather than guessing a row is safe to move.
        console.error('[Planner] Could not watch the applied week’s days', err)
        setDays(new Map())
      },
    )
    return unsubscribe
  }, [subscriptionKey, familyId, childId, range.start, range.end])

  return days
}
