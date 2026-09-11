// ── A debounced call that is never silently dropped (UX-353) ────────────────
//
// The cleanup below used to `clearTimeout` a pending call and discard it. Two
// live consumers write to Firestore through this hook after updating the screen
// optimistically — `books/useBook.applyUpdate` (500 ms) and
// `planner-chat/PlannerChatPage.updateWeekField` (800 ms) — so a kid who typed a
// page and tapped *My Books*, or a parent who typed a week's theme and left,
// lost the edit with no error anywhere and a screen still showing it. A third,
// `today/useDayLog`'s `persistDayLog`, was the same lane wired to nothing at all
// and is deleted rather than kept.
//
// **A pending call is work the caller asked for, so leaving is a reason to run
// it, not to drop it.** Three ways it now runs:
//
//  1. the timer, as before;
//  2. **unmount** — the component going away is not permission to lose the edit;
//  3. **the page being hidden**, which is how a parent on a phone leaves:
//     switching apps or locking the screen fires `visibilitychange`, never
//     unmount, and a backgrounded tab may never come back.
//
// **No `flush()` is exported**, deliberately. Nothing in the repo needs to force
// a pending call early — a change of target does not unmount these hooks, and
// the rule below means a call already lands against the target it was made for.
// Adding a public flush with no caller would be the same dead lane this row
// deleted from `useDayLog`; it is four lines away on the day something needs it.
//
// ── The pending call keeps the function it was MADE with ────────────────────
//
// The timer used to invoke the *latest* rendered `fn`. For a hook whose `fn`
// closes over the document it writes — `useBook.persist` is memoized on
// `[familyId, bookId]` — that means a call scheduled against one book could be
// delivered by the writer for another: the same cross-target write UX-345 found
// on `dailyPlans`. So the pending entry records the function **as of the call**
// alongside its arguments, and flushing delivers that pair. The args carry the
// payload in every consumer, so nothing here depends on a fresher closure.

import { useCallback, useEffect, useMemo, useRef } from 'react'

/**
 * Returns a debounced version of `fn`.
 * The returned function resets the timer on each call; `fn` is only
 * invoked once the caller stops calling for `delay` ms — or sooner, if the
 * component unmounts or the page is hidden.
 */
export function useDebounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number,
): (...args: Args) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<{ fn: (...args: Args) => void; args: Args } | null>(null)
  const fnRef = useRef(fn)

  // Keep fnRef up-to-date without triggering the lint rule about
  // assigning .current during render — use an effect instead.
  useEffect(() => {
    fnRef.current = fn
  }, [fn])

  /** Run whatever is pending, exactly once. Shared by the timer and by `flush`. */
  const runPending = useCallback(() => {
    const pending = pendingRef.current
    pendingRef.current = null
    if (pending) pending.fn(...pending.args)
  }, [])

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    runPending()
  }, [runPending])

  const debounced = useCallback(
    (...args: Args) => {
      pendingRef.current = { fn: fnRef.current, args }
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        runPending()
      }, delay)
    },
    [delay, runPending],
  )

  // Leaving runs the pending call; it never drops it. `flush` is stable, so this
  // subscribes once for the life of the component.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      flush()
    }
  }, [flush])

  return useMemo(() => debounced, [debounced])
}
