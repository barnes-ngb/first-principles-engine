import { useCallback, useEffect, useRef, useState } from 'react'

// ── Constants ────────────────────────────────────────────────

/** Milliseconds of inactivity before the timer pauses (60 s). */
export const IDLE_THRESHOLD_MS = 60_000

/** Maximum credited seconds per session (60 min). Safety cap. */
export const MAX_SESSION_SECONDS = 3600

/** Events that count as user activity. */
const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
  'click',
  'touchstart',
  'keydown',
  'scroll',
  'mousemove',
]

/** How often (ms) the tick interval fires. */
const TICK_INTERVAL_MS = 1_000

/** Throttle window for mousemove (ms). */
const MOUSEMOVE_THROTTLE_MS = 2_000

// ── Plain class (non-React) ─────────────────────────────────
//
// Tracks active time using completed spans. When idle is detected,
// the current span is ended retroactively at the time of last user
// activity — this ensures we under-count rather than over-count,
// which is critical for trustworthy compliance hours.

export class SessionTimer {
  /** Accumulated seconds from completed active spans. */
  private completedSeconds = 0
  /** Epoch ms when the current active span started, or null if paused. */
  private spanStart: number | null = null
  /** Epoch ms of most recent user interaction. */
  private lastActivityTime = 0
  private intervalId: ReturnType<typeof setInterval> | null = null
  private stopped = false
  private boundOnActivity: () => void
  private boundOnVisibility: () => void
  private lastMouseMoveTime = 0
  private doc: Document

  /** True while the timer has been started (even if paused). */
  isActive = false
  /** True when paused due to idle or hidden tab. */
  isPaused = false

  constructor(doc?: Document) {
    this.doc = doc ?? document
    this.boundOnActivity = this.onActivity.bind(this)
    this.boundOnVisibility = this.onVisibilityChange.bind(this)
  }

  // ── Public API ──────────────────────────────────────────

  startTimer(): void {
    if (this.intervalId) return // already running

    const now = Date.now()
    this.stopped = false
    this.completedSeconds = 0
    this.lastActivityTime = now
    this.spanStart = now
    this.isActive = true
    this.isPaused = false

    this.addListeners()
    this.intervalId = setInterval(() => this.tick(), TICK_INTERVAL_MS)
  }

  getCurrentSeconds(): number {
    let total = this.completedSeconds

    // Add the in-progress span if there is one
    if (this.spanStart !== null) {
      const now = Date.now()
      const idle = now - this.lastActivityTime > IDLE_THRESHOLD_MS

      // If idle, credit only up to last activity; otherwise up to now
      const spanEnd = idle ? this.lastActivityTime : now
      const spanDuration = Math.max(0, (spanEnd - this.spanStart) / 1000)
      total += spanDuration
    }

    return Math.min(total, MAX_SESSION_SECONDS)
  }

  stop(): number {
    if (this.stopped) return this.getCurrentSeconds()

    // Flush the current span
    if (this.spanStart !== null) {
      const now = Date.now()
      const idle = now - this.lastActivityTime > IDLE_THRESHOLD_MS
      const spanEnd = idle ? this.lastActivityTime : now
      this.completedSeconds += Math.max(0, (spanEnd - this.spanStart) / 1000)
      this.spanStart = null
    }

    this.stopped = true
    this.isActive = false
    this.isPaused = false
    this.cleanup()
    return this.getCurrentSeconds()
  }

  // ── Internals ───────────────────────────────────────────

  private tick(): void {
    const now = Date.now()
    const pageHidden = this.doc.hidden
    const idle = now - this.lastActivityTime > IDLE_THRESHOLD_MS

    if ((pageHidden || idle) && this.spanStart !== null) {
      // End the current span. For idle, credit only up to last activity.
      // For visibility, credit up to now (the tab just went hidden).
      const spanEnd = idle ? this.lastActivityTime : now
      this.completedSeconds += Math.max(0, (spanEnd - this.spanStart) / 1000)
      this.spanStart = null
      this.isPaused = true
    } else if (!pageHidden && !idle && this.spanStart === null) {
      // Resume — start a new span
      this.spanStart = now
      this.isPaused = false
    }
  }

  private onActivity(): void {
    const now = Date.now()
    this.lastActivityTime = now

    // If paused and tab is visible, resume immediately
    if (this.spanStart === null && !this.doc.hidden && !this.stopped) {
      this.spanStart = now
      this.isPaused = false
    }
  }

  private onVisibilityChange(): void {
    const now = Date.now()

    if (this.doc.hidden) {
      // Tab hidden — end current span at this moment
      if (this.spanStart !== null) {
        this.completedSeconds += Math.max(0, (now - this.spanStart) / 1000)
        this.spanStart = null
        this.isPaused = true
      }
    } else {
      // Tab visible — mark activity and start a new span
      this.lastActivityTime = now
      if (this.spanStart === null && !this.stopped) {
        this.spanStart = now
        this.isPaused = false
      }
    }
  }

  private addListeners(): void {
    for (const evt of ACTIVITY_EVENTS) {
      if (evt === 'mousemove') {
        this.doc.addEventListener(evt, this.throttledMouseMove as EventListener, {
          passive: true,
        })
      } else {
        this.doc.addEventListener(evt, this.boundOnActivity as EventListener, {
          passive: true,
        })
      }
    }
    this.doc.addEventListener('visibilitychange', this.boundOnVisibility)
  }

  private throttledMouseMove = (): void => {
    const now = Date.now()
    if (now - this.lastMouseMoveTime > MOUSEMOVE_THROTTLE_MS) {
      this.lastMouseMoveTime = now
      this.onActivity()
    }
  }

  private cleanup(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    for (const evt of ACTIVITY_EVENTS) {
      if (evt === 'mousemove') {
        this.doc.removeEventListener(evt, this.throttledMouseMove as EventListener)
      } else {
        this.doc.removeEventListener(evt, this.boundOnActivity as EventListener)
      }
    }
    this.doc.removeEventListener('visibilitychange', this.boundOnVisibility)
  }
}

// ── React hook ───────────────────────────────────────────────

export interface UseSessionTimerResult {
  startTimer: () => void
  getCurrentSeconds: () => number
  stop: () => number
  /** True while timer is running (even if paused). */
  isActive: boolean
  /** True when paused due to idle or hidden tab. */
  isPaused: boolean
}

export function useSessionTimer(): UseSessionTimerResult {
  const timerRef = useRef<SessionTimer | null>(null)
  const [isActive, setIsActive] = useState(false)
  const [isPaused, setIsPaused] = useState(false)

  // Sync reactive state from the timer on an interval
  useEffect(() => {
    const id = setInterval(() => {
      const t = timerRef.current
      if (t) {
        setIsActive(t.isActive)
        setIsPaused(t.isPaused)
      }
    }, TICK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timerRef.current?.stop()
    }
  }, [])

  const startTimer = useCallback(() => {
    const timer = new SessionTimer()
    timerRef.current = timer
    timer.startTimer()
    setIsActive(true)
    setIsPaused(false)
  }, [])

  const getCurrentSeconds = useCallback(() => {
    return timerRef.current?.getCurrentSeconds() ?? 0
  }, [])

  const stop = useCallback(() => {
    const result = timerRef.current?.stop() ?? 0
    setIsActive(false)
    setIsPaused(false)
    return result
  }, [])

  return { startTimer, getCurrentSeconds, stop, isActive, isPaused }
}
