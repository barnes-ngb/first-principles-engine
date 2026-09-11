import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'

import type { SaveState } from '../../components/SaveIndicator'
import { daysCollection, weeksCollection } from '../../core/firebase/firestore'
import type { Child, DayLog } from '../../core/types'
import type { RoutineItemKey } from '../../core/types/enums'
import { getWeekRange } from '../../core/utils/time'
import type { DailyPlanTemplate } from './dailyPlanTemplates'
import { createDefaultDayLog, dayLogDocId, legacyDayLogDocId } from './daylog.model'
import {
  DayWriteRefusal,
  dayWriteFailureNotice,
  namedDayEdit,
} from './dayWriteOutcome'
import { setDayLogGuarded } from './dayWriteGuard'

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
  weekFocus: {
    theme?: string
    virtue?: string
    scriptureRef?: string
    scriptureText?: string
    heartQuestion?: string
    formationPrompt?: string
    conundrum?: {
      title: string
      scenario: string
      question: string
      quickPicks?: string[]
      lincolnPrompt: string
      londonPrompt: string
      virtueConnection: string
      readingTieIn?: string
      mathContext?: string
      londonDrawingPrompt?: string
      dadLabSuggestion?: string
      discussed?: boolean
      discussedAt?: string
    }
  } | null
  readAloudBookId: string | undefined
  snackMessage: { text: string; severity: 'success' | 'error' | 'warning' } | null
  setSnackMessage: React.Dispatch<
    React.SetStateAction<{ text: string; severity: 'success' | 'error' | 'warning' } | null>
  >
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
  const [readAloudBookId, setReadAloudBookId] = useState<string | undefined>()
  const [weekFocus, setWeekFocus] = useState<{
    theme?: string
    virtue?: string
    scriptureRef?: string
    scriptureText?: string
    heartQuestion?: string
    formationPrompt?: string
    conundrum?: {
      title: string
      scenario: string
      question: string
      quickPicks?: string[]
      lincolnPrompt: string
      londonPrompt: string
      virtueConnection: string
      readingTieIn?: string
      mathContext?: string
      londonDrawingPrompt?: string
      dadLabSuggestion?: string
      discussed?: boolean
      discussedAt?: string
    }
  } | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  // FEAT-136: 'warning' — a workbook read that failed while the photo saved
  // safely is not an error.
  const [snackMessage, setSnackMessage] = useState<{
    text: string
    severity: 'success' | 'error' | 'warning'
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

  /**
   * The day as it stood BEFORE the edit now being written — the value the screen
   * goes back to when the write does not land (UX-351).
   *
   * A ref rather than a dependency so `persistDayLogImmediate` keeps a stable
   * identity across every checklist change (it is a dependency of most of
   * `TodayPage`'s handlers). Synced in an effect, never during render, which is
   * the form this repo's lint permits — and an event handler reads it after that
   * effect has committed for the rendered state, so it holds exactly the
   * pre-edit document.
   */
  const previousDayLogRef = useRef<DayLog | null>(null)
  useEffect(() => {
    previousDayLogRef.current = dayLog
  }, [dayLog])

  /**
   * An edit did not land — say so, and take the optimistic row back.
   *
   * **One definition for every refusal**, reached by a thrown write and by the
   * guard that declines to attempt one: the defect this closes was precisely
   * that the three outcomes reported three different ways (see
   * `dayWriteOutcome.ts`).
   *
   * The rollback is **identity-guarded**: it restores the previous document only
   * while the screen is still showing the exact object this write attempted, so
   * it can never undo an edit made since, nor a snapshot that has already
   * landed. It is a belt rather than the mechanism — when a write is rejected
   * after reaching the SDK, Firestore drops the local mutation and the listener
   * re-fires with the stored document, doing the same job. This covers the case
   * the listener cannot: a write that never reached it at all.
   */
  const reportFailedWrite = useCallback(
    (reason: DayWriteRefusal, attempted: DayLog, previous: DayLog | null) => {
      setDayLog((current) => (current === attempted ? previous : current))
      setSaveState('error')
      setSnackMessage(dayWriteFailureNotice(reason, namedDayEdit(previous, attempted)))
    },
    [],
  )

  const writeDayLog = useCallback(
    async (updated: DayLog, previous: DayLog | null) => {
      if (!dayLogRef || !selectedChildId) {
        // Not a quiet no-op. Nothing was sent, so nothing half-landed — but the
        // screen is already showing the edit, and only this says otherwise.
        reportFailedWrite(DayWriteRefusal.NoTarget, updated, previous)
        return
      }
      // Ensure childId is always correct (defense in depth)
      const safeLog =
        updated.childId === selectedChildId
          ? updated
          : { ...updated, childId: selectedChildId }
      setSaveState('saving')
      try {
        const now = new Date().toISOString()
        // Route through the preservation guard (FEAT-114). This is the
        // interactive manual-edit lane, so it runs in observe-only mode
        // (`enforce: false`): rename / un-check / delete are the parent's
        // authoritative edits and must never be blocked, but a genuine anomaly
        // (e.g. a last-write-wins clobber of an out-of-band completion) is still
        // logged at warn+ for observability.
        await setDayLogGuarded(dayLogRef, { ...safeLog, updatedAt: now }, 'today-save', {
          enforce: false,
        })
        setSaveState('saved')
        setLastSavedAt(now)
        setSnackMessage({ text: 'Saved', severity: 'success' })
      } catch (err) {
        console.error('Failed to save day log', err)
        reportFailedWrite(DayWriteRefusal.Rejected, updated, previous)
      }
    },
    [dayLogRef, selectedChildId, reportFailedWrite],
  )

  /**
   * The one Today write lane (UX-353).
   *
   * There used to be a second: a `useDebounce`d `persistDayLog`, exposed on this
   * hook's result and called by **nothing** in the repo. `useDebounce` discarded
   * a pending call on unmount, so the day a surface had wired that lane, every
   * edit followed within 800 ms by a navigation, a child switch or a
   * backgrounded phone would have vanished with no error anywhere — a loaded gun
   * on the compliance rail. It is deleted rather than fixed here, because a
   * write lane with no caller is not a feature: the flush that the hook's two
   * genuine consumers needed went into `useDebounce` itself.
   */
  const persistDayLogImmediate = useCallback(
    (updated: DayLog) => {
      const previous = previousDayLogRef.current
      setDayLog(updated)
      // Keep the ref in step for a second edit in the same tick, before the
      // effect above re-syncs it.
      previousDayLogRef.current = updated
      void writeDayLog(updated, previous)
    },
    [writeDayLog],
  )

  // --- Data loading ---

  // Load DayLog for selected child + date (real-time, with legacy migration)
  useEffect(() => {
    if (!selectedChildId || !dayLogRef) return
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
            await setDayLogGuarded(
              dayLogRef,
              { ...legacyData, updatedAt: new Date().toISOString() },
              'legacy-migration',
            )
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
              await setDayLogGuarded(dayLogRef, migrated, 'baredate-migration')
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
          await setDayLogGuarded(dayLogRef, defaultLog, 'default-create')
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
        if (snap.exists()) {
          setWeekPlanId(snap.id)
          const data = snap.data()
          setWeekFocus({
            theme: data.theme || undefined,
            virtue: data.virtue || undefined,
            scriptureRef: data.scriptureRef || undefined,
            scriptureText: data.scriptureText || undefined,
            heartQuestion: data.heartQuestion || undefined,
            formationPrompt: data.formationPrompt || undefined,
            conundrum: data.conundrum || undefined,
          })
          setReadAloudBookId(data.readAloudBookId || undefined)
        } else {
          setWeekPlanId(undefined)
          setWeekFocus(null)
          setReadAloudBookId(undefined)
        }
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
    weekFocus,
    readAloudBookId,
    snackMessage,
    setSnackMessage,
    persistDayLogImmediate,
  }
}
