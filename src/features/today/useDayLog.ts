import { useCallback, useEffect, useMemo, useState } from 'react'
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'

import type { SaveState } from '../../components/SaveIndicator'
import { daysCollection, weeksCollection } from '../../core/firebase/firestore'
import { useDebounce } from '../../core/hooks/useDebounce'
import type { Child, DayLog } from '../../core/types/domain'
import type { RoutineItemKey } from '../../core/types/enums'
import { getWeekRange } from '../../core/utils/time'
import type { DailyPlanTemplate } from './dailyPlanTemplates'
import { createDefaultDayLog, dayLogDocId, legacyDayLogDocId } from './daylog.model'

interface UseDayLogParams {
  familyId: string
  selectedChildId: string
  today: string
  selectedChild: Child | undefined
  activeTemplate: DailyPlanTemplate | undefined
  activeRoutineItems: RoutineItemKey[] | undefined
}

interface UseDayLogResult {
  dayLog: DayLog | null
  setDayLog: React.Dispatch<React.SetStateAction<DayLog | null>>
  saveState: SaveState
  lastSavedAt: string | null
  weekPlanId: string | undefined
  snackMessage: { text: string; severity: 'success' | 'error' } | null
  setSnackMessage: React.Dispatch<
    React.SetStateAction<{ text: string; severity: 'success' | 'error' } | null>
  >
  persistDayLog: (updated: DayLog) => void
  persistDayLogImmediate: (updated: DayLog) => void
}

export function useDayLog({
  familyId,
  selectedChildId,
  today,
  selectedChild,
  activeTemplate,
  activeRoutineItems,
}: UseDayLogParams): UseDayLogResult {
  const [dayLog, setDayLog] = useState<DayLog | null>(null)
  // Track which child the current dayLog belongs to; clear stale data on switch
  const [dayLogChildId, setDayLogChildId] = useState(selectedChildId)
  if (dayLogChildId !== selectedChildId) {
    setDayLogChildId(selectedChildId)
    setDayLog(null)
  }

  const [weekPlanId, setWeekPlanId] = useState<string | undefined>()
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [snackMessage, setSnackMessage] = useState<{
    text: string
    severity: 'success' | 'error'
  } | null>(null)

  const currentDocId = useMemo(
    () => (selectedChildId ? dayLogDocId(today, selectedChildId) : ''),
    [selectedChildId, today],
  )
  const dayLogRef = useMemo(
    () => (currentDocId ? doc(daysCollection(familyId), currentDocId) : null),
    [familyId, currentDocId],
  )

  // --- Persist helpers with save-state tracking ---

  const writeDayLog = useCallback(
    async (updated: DayLog) => {
      if (!dayLogRef || !selectedChildId) return
      // Ensure childId is always correct (defense in depth)
      const safeLog =
        updated.childId === selectedChildId
          ? updated
          : { ...updated, childId: selectedChildId }
      setSaveState('saving')
      try {
        const now = new Date().toISOString()
        await setDoc(dayLogRef, { ...safeLog, updatedAt: now })
        setSaveState('saved')
        setLastSavedAt(now)
      } catch (err) {
        console.error('Failed to save day log', err)
        setSaveState('error')
      }
    },
    [dayLogRef, selectedChildId],
  )

  const debouncedWrite = useDebounce(writeDayLog, 800)

  const persistDayLog = useCallback(
    (updated: DayLog) => {
      setDayLog(updated)
      debouncedWrite(updated)
    },
    [debouncedWrite],
  )

  const persistDayLogImmediate = useCallback(
    (updated: DayLog) => {
      setDayLog(updated)
      void writeDayLog(updated)
    },
    [writeDayLog],
  )

  // Show a brief "Saved" toast when save completes (mobile-friendly feedback)
  useEffect(() => {
    if (saveState === 'saved') {
      setSnackMessage({ text: 'Saved', severity: 'success' })
    }
  }, [saveState])

  // --- Data loading ---

  // Load DayLog for selected child + date (real-time, with legacy migration)
  useEffect(() => {
    if (!selectedChildId || !dayLogRef) {
      setDayLog(null)
      return
    }
    let migratedOrCreated = false

    const unsubscribe = onSnapshot(
      dayLogRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data()
          setDayLog(data)
          if (data.updatedAt) setLastSavedAt(data.updatedAt)
          return
        }

        // Doc doesn't exist — try legacy fallback / create default (once)
        if (migratedOrCreated) return
        migratedOrCreated = true

        try {
          // Backward compat: try legacy format {childId}_{date}
          const legacyId = legacyDayLogDocId(selectedChildId, today)
          const legacyRef = doc(daysCollection(familyId), legacyId)
          const legacySnap = await getDoc(legacyRef)
          if (legacySnap.exists()) {
            const legacyData = legacySnap.data()
            await setDoc(dayLogRef, {
              ...legacyData,
              updatedAt: new Date().toISOString(),
            })
            // onSnapshot will fire again with the migrated doc
            return
          }

          // Also check bare date doc (oldest legacy — no childId in ID)
          const bareDateRef = doc(daysCollection(familyId), today)
          const bareDateSnap = await getDoc(bareDateRef)
          if (bareDateSnap.exists()) {
            const bareData = bareDateSnap.data()
            if (!bareData.childId || bareData.childId === selectedChildId) {
              const migrated = {
                ...bareData,
                childId: selectedChildId,
                updatedAt: new Date().toISOString(),
              }
              await setDoc(dayLogRef, migrated)
              // onSnapshot will fire again
              return
            }
          }

          // No existing doc — create fresh (use template fallback for blocks/items)
          const defaultLog = createDefaultDayLog(
            selectedChildId,
            today,
            selectedChild?.dayBlocks ?? activeTemplate?.dayBlocks,
            activeRoutineItems,
          )
          await setDoc(dayLogRef, defaultLog)
          // onSnapshot will fire again with the new doc
        } catch (err) {
          console.error('Failed to load day log', err)
          migratedOrCreated = false
          setSnackMessage({
            text: 'Could not load today\u2019s log.',
            severity: 'error',
          })
        }
      },
      (err) => {
        console.error('Failed to load day log', err)
        setSnackMessage({
          text: 'Could not load today\u2019s log.',
          severity: 'error',
        })
      },
    )

    return unsubscribe
  }, [
    dayLogRef,
    today,
    selectedChildId,
    selectedChild,
    familyId,
    activeRoutineItems,
    activeTemplate?.dayBlocks,
  ])

  // Load WeekPlan ID for current week (real-time)
  const weekRange = useMemo(() => getWeekRange(new Date()), [])

  useEffect(() => {
    const ref = doc(weeksCollection(familyId), weekRange.start)
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setWeekPlanId(snap.exists() ? snap.id : undefined)
      },
      (err) => {
        console.error('Failed to load week plan', err)
        setSnackMessage({
          text: 'Could not load week plan.',
          severity: 'error',
        })
      },
    )
    return unsubscribe
  }, [familyId, weekRange.start])

  return {
    dayLog,
    setDayLog,
    saveState,
    lastSavedAt,
    weekPlanId,
    snackMessage,
    setSnackMessage,
    persistDayLog,
    persistDayLogImmediate,
  }
}
