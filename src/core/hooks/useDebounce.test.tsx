import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDebounce } from './useDebounce'

/**
 * UX-353 — a pending debounced call is never silently dropped.
 *
 * The cleanup used to `clearTimeout` and discard. Two live consumers write to
 * Firestore through this hook after updating the screen optimistically
 * (`books/useBook`, `planner-chat/PlannerChatPage`), so leaving within the delay
 * lost the edit with no error anywhere.
 *
 * POSITIVE CONTROL: restore the old cleanup (`clearTimeout` alone) and the
 * unmount and visibility cases below fail; restore `fnRef.current(...args)` in
 * the timer and the "keeps the function it was made with" case fails.
 */

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useDebounce', () => {
  it('still debounces — one call after the delay, not one per keystroke', () => {
    const fn = vi.fn()
    const { result } = renderHook(() => useDebounce(fn, 500))

    act(() => {
      result.current('a')
      result.current('ab')
      result.current('abc')
    })
    expect(fn).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('abc')
  })

  it('runs a pending call on unmount instead of discarding it', () => {
    const fn = vi.fn()
    const { result, unmount } = renderHook(() => useDebounce(fn, 500))

    act(() => {
      result.current('a page the kid just typed')
    })
    act(() => {
      unmount()
    })

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('a page the kid just typed')
  })

  it('runs a pending call when the page is hidden — how a phone leaves', () => {
    const fn = vi.fn()
    const { result } = renderHook(() => useDebounce(fn, 800))

    act(() => {
      result.current('this week’s theme')
    })
    act(() => {
      setVisibility('hidden')
    })

    expect(fn).toHaveBeenCalledTimes(1)
    setVisibility('visible')
  })

  it('does not run anything when the page merely becomes visible again', () => {
    const fn = vi.fn()
    renderHook(() => useDebounce(fn, 800))

    act(() => {
      setVisibility('visible')
    })

    expect(fn).not.toHaveBeenCalled()
  })

  it('runs a pending call exactly once, however many ways it could be run', () => {
    // Hidden, then the timer, then unmount — the same pending call, one write.
    // Anything else would double a Firestore write on every backgrounded phone.
    const fn = vi.fn()
    const { result, unmount } = renderHook(() => useDebounce(fn, 500))

    act(() => {
      result.current('once')
    })
    act(() => {
      setVisibility('hidden')
    })
    expect(fn).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(1000)
      unmount()
    })
    expect(fn).toHaveBeenCalledTimes(1)
    setVisibility('visible')
  })

  it('unmounting with nothing pending writes nothing', () => {
    const fn = vi.fn()
    const { unmount } = renderHook(() => useDebounce(fn, 500))

    act(() => {
      unmount()
    })

    expect(fn).not.toHaveBeenCalled()
  })

  it('keeps the function the call was MADE with, not a later one', () => {
    // `useBook.persist` is memoized on `[familyId, bookId]`, so the writer
    // changes identity when the target document does. Delivering a pending call
    // through the NEW writer is a cross-target write — UX-345's class.
    const writerForBookA = vi.fn()
    const writerForBookB = vi.fn()

    const { result, rerender } = renderHook(
      ({ fn }: { fn: (v: string) => void }) => useDebounce(fn, 500),
      { initialProps: { fn: writerForBookA } },
    )

    act(() => {
      result.current('page 3 of book A')
    })
    rerender({ fn: writerForBookB })
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(writerForBookA).toHaveBeenCalledWith('page 3 of book A')
    expect(writerForBookB).not.toHaveBeenCalled()
  })

  it('a later call uses the writer current when THAT call was made', () => {
    const writerForBookA = vi.fn()
    const writerForBookB = vi.fn()

    const { result, rerender } = renderHook(
      ({ fn }: { fn: (v: string) => void }) => useDebounce(fn, 500),
      { initialProps: { fn: writerForBookA } },
    )

    act(() => {
      result.current('page 3 of book A')
    })
    rerender({ fn: writerForBookB })
    act(() => {
      result.current('page 1 of book B')
      vi.advanceTimersByTime(500)
    })

    // The superseded call is gone, as debouncing means; the surviving one goes
    // to the writer that was current when it was made.
    expect(writerForBookA).not.toHaveBeenCalled()
    expect(writerForBookB).toHaveBeenCalledWith('page 1 of book B')
  })
})
