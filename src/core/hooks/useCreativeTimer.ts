import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { addDoc } from 'firebase/firestore'

import { hoursCollection } from '../firebase/firestore'
import type { SubjectBucket } from '../types/enums'
import { todayKey } from '../utils/dateKey'

const STORAGE_KEY = 'creative-timer'
const MIN_MINUTES = 5

interface PersistedTimer {
  startTime: number // epoch ms
  subject: SubjectBucket
  description: string
  childId: string
  familyId: string
}

export interface CreativeTimerState {
  isRunning: boolean
  startTime: number | null // epoch ms
  elapsed: number // seconds
  subject: SubjectBucket | null
  description: string
}

export interface UseCreativeTimerResult {
  state: CreativeTimerState
  startTimer: (subject: SubjectBucket, description: string) => void
  stopTimer: () => Promise<{ saved: boolean; minutes: number }>
  cancelTimer: () => void
  /** True if a persisted timer was found from a previous session */
  hasPersistedTimer: boolean
  resumePersistedTimer: () => void
  dismissPersistedTimer: () => void
}

function loadPersisted(): PersistedTimer | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PersistedTimer
  } catch {
    return null
  }
}

function savePersisted(data: PersistedTimer) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function clearPersisted() {
  localStorage.removeItem(STORAGE_KEY)
}

export function useCreativeTimer(
  familyId: string,
  childId: string,
): UseCreativeTimerResult {
  const [state, setState] = useState<CreativeTimerState>({
    isRunning: false,
    startTime: null,
    elapsed: 0,
    subject: null,
    description: '',
  })

  const [dismissed, setDismissed] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Derive whether a persisted timer exists (no effect needed)
  const hasPersistedTimer = useMemo(() => {
    if (dismissed || state.isRunning) return false
    const persisted = loadPersisted()
    return !!persisted && persisted.familyId === familyId
  }, [familyId, dismissed, state.isRunning])

  // Tick interval
  useEffect(() => {
    if (state.isRunning && state.startTime) {
      intervalRef.current = setInterval(() => {
        setState((prev) => ({
          ...prev,
          elapsed: Math.floor((Date.now() - (prev.startTime ?? Date.now())) / 1000),
        }))
      }, 1000)
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [state.isRunning, state.startTime])

  const startTimer = useCallback(
    (subject: SubjectBucket, description: string) => {
      const now = Date.now()
      setState({
        isRunning: true,
        startTime: now,
        elapsed: 0,
        subject,
        description,
      })
      savePersisted({
        startTime: now,
        subject,
        description,
        childId,
        familyId,
      })
      setDismissed(true)
    },
    [childId, familyId],
  )

  const stopTimer = useCallback(async (): Promise<{ saved: boolean; minutes: number }> => {
    if (!state.startTime || !state.subject) {
      setState({ isRunning: false, startTime: null, elapsed: 0, subject: null, description: '' })
      clearPersisted()
      return { saved: false, minutes: 0 }
    }

    const elapsedMs = Date.now() - state.startTime
    const rawMinutes = elapsedMs / 60_000
    // Round up to nearest 5 minutes
    const roundedMinutes = Math.ceil(rawMinutes / 5) * 5

    if (rawMinutes < MIN_MINUTES) {
      // Don't save, but keep the timer state so component can show message
      setState((prev) => ({ ...prev, isRunning: false }))
      clearPersisted()
      return { saved: false, minutes: Math.floor(rawMinutes) }
    }

    await addDoc(hoursCollection(familyId), {
      childId,
      date: todayKey(),
      minutes: roundedMinutes,
      subjectBucket: state.subject,
      quickCapture: true,
      notes: state.description,
      source: 'creative-timer',
    })

    const result = { saved: true, minutes: roundedMinutes }

    setState({ isRunning: false, startTime: null, elapsed: 0, subject: null, description: '' })
    clearPersisted()

    return result
  }, [state.startTime, state.subject, state.description, familyId, childId])

  const cancelTimer = useCallback(() => {
    setState({ isRunning: false, startTime: null, elapsed: 0, subject: null, description: '' })
    clearPersisted()
    setDismissed(true)
  }, [])

  const resumePersistedTimer = useCallback(() => {
    const persisted = loadPersisted()
    if (!persisted) {
      setDismissed(true)
      return
    }
    setState({
      isRunning: true,
      startTime: persisted.startTime,
      elapsed: Math.floor((Date.now() - persisted.startTime) / 1000),
      subject: persisted.subject,
      description: persisted.description,
    })
    setDismissed(true)
  }, [])

  const dismissPersistedTimer = useCallback(() => {
    clearPersisted()
    setDismissed(true)
  }, [])

  return {
    state,
    startTimer,
    stopTimer,
    cancelTimer,
    hasPersistedTimer,
    resumePersistedTimer,
    dismissPersistedTimer,
  }
}
