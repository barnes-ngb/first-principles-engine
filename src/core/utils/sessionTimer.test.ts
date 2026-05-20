import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  SessionTimer,
  useSessionTimer,
  IDLE_THRESHOLD_MS,
  MAX_SESSION_SECONDS,
} from './sessionTimer'

// ── Helpers ──────────────────────────────────────────────────

interface MockDocument {
  hidden: boolean
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  _fire: (event: string) => void
}

/** Create a minimal mock document for SessionTimer. */
function createMockDocument(): MockDocument {
  const listeners = new Map<string, Set<EventListener>>()

  return {
    hidden: false,
    addEventListener: vi.fn((event: string, handler: EventListener) => {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(handler)
    }),
    removeEventListener: vi.fn((event: string, handler: EventListener) => {
      listeners.get(event)?.delete(handler)
    }),
    _fire(event: string) {
      listeners.get(event)?.forEach((fn) => fn(new Event(event)))
    },
  }
}

// ── SessionTimer (class) tests ───────────────────────────────

describe('SessionTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('accumulates time when visible and active', () => {
    const doc = createMockDocument()
    const timer = new SessionTimer(doc as unknown as Document)

    timer.startTimer()

    // Simulate user activity every few seconds
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(1000)
      doc._fire('click') // keep active
    }

    const seconds = timer.stop()
    // Should have ~10 seconds accumulated (with some tolerance for tick alignment)
    expect(seconds).toBeGreaterThanOrEqual(9)
    expect(seconds).toBeLessThanOrEqual(11)
  })

  it('pauses when tab is hidden', () => {
    const doc = createMockDocument()
    const timer = new SessionTimer(doc as unknown as Document)

    timer.startTimer()

    // 5 seconds active
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(1000)
      doc._fire('click')
    }

    // Tab goes hidden for 10 seconds
    doc.hidden = true
    doc._fire('visibilitychange')
    vi.advanceTimersByTime(10_000)

    // Tab returns visible
    doc.hidden = false
    doc._fire('visibilitychange')

    // 5 more seconds active
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(1000)
      doc._fire('click')
    }

    const seconds = timer.stop()
    // Should be ~10 seconds (5 + 5), not 20
    expect(seconds).toBeGreaterThanOrEqual(9)
    expect(seconds).toBeLessThanOrEqual(12)
  })

  it('pauses after idle threshold', () => {
    const doc = createMockDocument()
    const timer = new SessionTimer(doc as unknown as Document)

    timer.startTimer()

    // 5 seconds of activity
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(1000)
      doc._fire('click')
    }

    // Stop interacting — advance past idle threshold
    vi.advanceTimersByTime(IDLE_THRESHOLD_MS + 5000)

    const seconds = timer.getCurrentSeconds()
    // Should be ~5 seconds (only the active portion before idle)
    expect(seconds).toBeGreaterThanOrEqual(4)
    expect(seconds).toBeLessThanOrEqual(7)
    expect(timer.isPaused).toBe(true)

    timer.stop()
  })

  it('resumes on interaction after idle', () => {
    const doc = createMockDocument()
    const timer = new SessionTimer(doc as unknown as Document)

    timer.startTimer()

    // 5 seconds active
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(1000)
      doc._fire('click')
    }

    // Go idle
    vi.advanceTimersByTime(IDLE_THRESHOLD_MS + 5000)
    expect(timer.isPaused).toBe(true)

    // Resume with user interaction
    doc._fire('click')
    vi.advanceTimersByTime(1000) // tick to process resume

    // 5 more seconds active
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(1000)
      doc._fire('click')
    }

    const seconds = timer.stop()
    // Should be ~10 seconds total (5 before idle + 5 after resume)
    expect(seconds).toBeGreaterThanOrEqual(9)
    expect(seconds).toBeLessThanOrEqual(13)
  })

  it('clamps final duration to MAX_SESSION_SECONDS', () => {
    const doc = createMockDocument()
    const timer = new SessionTimer(doc as unknown as Document)

    timer.startTimer()

    // Simulate lots of active time beyond max cap
    for (let i = 0; i < MAX_SESSION_SECONDS + 600; i++) {
      vi.advanceTimersByTime(1000)
      if (i % 5 === 0) doc._fire('click') // keep alive
    }

    const seconds = timer.stop()
    expect(seconds).toBeLessThanOrEqual(MAX_SESSION_SECONDS)
  })

  it('stop returns final duration', () => {
    const doc = createMockDocument()
    const timer = new SessionTimer(doc as unknown as Document)

    timer.startTimer()

    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(1000)
      doc._fire('click')
    }

    const finalSeconds = timer.stop()
    expect(typeof finalSeconds).toBe('number')
    expect(finalSeconds).toBeGreaterThan(0)

    // Calling stop again should return same value
    const secondCall = timer.stop()
    expect(secondCall).toBe(finalSeconds)
  })

  it('returns 0 when stopped immediately', () => {
    const doc = createMockDocument()
    const timer = new SessionTimer(doc as unknown as Document)

    timer.startTimer()
    const seconds = timer.stop()
    // Should be 0 or very close
    expect(seconds).toBeLessThanOrEqual(1)
  })

  it('cleans up event listeners on stop', () => {
    const doc = createMockDocument()
    const timer = new SessionTimer(doc as unknown as Document)

    timer.startTimer()
    const addCount = doc.addEventListener.mock.calls.length

    timer.stop()
    const removeCount = doc.removeEventListener.mock.calls.length

    // Should remove at least as many listeners as it added
    expect(removeCount).toBeGreaterThanOrEqual(addCount)
  })

  it('does not start twice if startTimer called again', () => {
    const doc = createMockDocument()
    const timer = new SessionTimer(doc as unknown as Document)

    timer.startTimer()
    const addCalls1 = doc.addEventListener.mock.calls.length

    timer.startTimer() // should be no-op
    const addCalls2 = doc.addEventListener.mock.calls.length

    expect(addCalls2).toBe(addCalls1)

    timer.stop()
  })

  it('handles visibility change during idle state', () => {
    const doc = createMockDocument()
    const timer = new SessionTimer(doc as unknown as Document)

    timer.startTimer()

    // Some active time
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(1000)
      doc._fire('click')
    }

    // Go idle
    vi.advanceTimersByTime(IDLE_THRESHOLD_MS + 1000)
    expect(timer.isPaused).toBe(true)

    // While idle, tab also goes hidden
    doc.hidden = true
    doc._fire('visibilitychange')
    vi.advanceTimersByTime(5000)

    // Tab comes back — should reset idle tracking
    doc.hidden = false
    doc._fire('visibilitychange')

    // Active again
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(1000)
      doc._fire('click')
    }

    const seconds = timer.stop()
    expect(seconds).toBeGreaterThanOrEqual(5)
    expect(seconds).toBeLessThanOrEqual(8)
  })
})

// ── useSessionTimer (hook) tests ─────────────────────────────

describe('useSessionTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts inactive', () => {
    const { result } = renderHook(() => useSessionTimer())
    expect(result.current.isActive).toBe(false)
    expect(result.current.isPaused).toBe(false)
    expect(result.current.getCurrentSeconds()).toBe(0)
  })

  it('starts and stops timer', () => {
    const { result } = renderHook(() => useSessionTimer())

    act(() => {
      result.current.startTimer()
    })
    expect(result.current.isActive).toBe(true)

    // Simulate some ticks
    act(() => {
      vi.advanceTimersByTime(3000)
      document.dispatchEvent(new Event('click'))
    })

    act(() => {
      const seconds = result.current.stop()
      expect(seconds).toBeGreaterThanOrEqual(0)
    })

    expect(result.current.isActive).toBe(false)
  })

  it('cleans up on unmount', () => {
    const { result, unmount } = renderHook(() => useSessionTimer())

    act(() => {
      result.current.startTimer()
    })

    // Should not throw
    unmount()
  })
})
