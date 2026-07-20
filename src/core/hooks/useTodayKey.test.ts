import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useTodayKey } from './useTodayKey'

describe('useTodayKey', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns today at mount', () => {
    vi.setSystemTime(new Date(2026, 6, 18, 9, 0, 0)) // Sat Jul 18, 2026
    const { result } = renderHook(() => useTodayKey())
    expect(result.current[0]).toBe('2026-07-18')
  })

  it('recomputes across a day boundary on window focus (the stale-tab case)', () => {
    // Mount on Saturday…
    vi.setSystemTime(new Date(2026, 6, 18, 23, 0, 0)) // Sat Jul 18
    const { result } = renderHook(() => useTodayKey())
    expect(result.current[0]).toBe('2026-07-18')

    // …tab left open into Sunday, then refocused.
    vi.setSystemTime(new Date(2026, 6, 19, 8, 0, 0)) // Sun Jul 19
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(result.current[0]).toBe('2026-07-19')
  })

  it('recomputes across a day boundary on visibilitychange', () => {
    vi.setSystemTime(new Date(2026, 6, 18, 23, 30, 0))
    const { result } = renderHook(() => useTodayKey())
    expect(result.current[0]).toBe('2026-07-18')

    vi.setSystemTime(new Date(2026, 6, 20, 6, 0, 0)) // Mon Jul 20
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current[0]).toBe('2026-07-20')
  })

  it('rolls over via the minute tick without any focus/visibility event', () => {
    vi.setSystemTime(new Date(2026, 6, 18, 23, 59, 30))
    const { result } = renderHook(() => useTodayKey())
    expect(result.current[0]).toBe('2026-07-18')

    vi.setSystemTime(new Date(2026, 6, 19, 0, 0, 30)) // just past midnight
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current[0]).toBe('2026-07-19')
  })

  it('keeps a stable identity while the day is unchanged', () => {
    vi.setSystemTime(new Date(2026, 6, 18, 9, 0, 0))
    const { result, rerender } = renderHook(() => useTodayKey())
    const first = result.current[0]
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    rerender()
    expect(result.current[0]).toBe(first) // same string, no needless churn
  })

  it('advances immediately when refresh() is called after a day change (forward-shift path)', () => {
    // Stale tab: mounted Saturday, no focus/tick fired, so the key is still Sat…
    vi.setSystemTime(new Date(2026, 6, 18, 23, 0, 0)) // Sat Jul 18
    const { result } = renderHook(() => useTodayKey())
    expect(result.current[0]).toBe('2026-07-18')

    // …the day has actually rolled to Sunday; a manual refresh catches it up now.
    vi.setSystemTime(new Date(2026, 6, 19, 9, 0, 0)) // Sun Jul 19
    act(() => {
      result.current[1]() // refresh()
    })
    expect(result.current[0]).toBe('2026-07-19')
  })

  it('refresh() is a stable identity across renders', () => {
    vi.setSystemTime(new Date(2026, 6, 18, 9, 0, 0))
    const { result, rerender } = renderHook(() => useTodayKey())
    const firstRefresh = result.current[1]
    rerender()
    expect(result.current[1]).toBe(firstRefresh)
  })
})
