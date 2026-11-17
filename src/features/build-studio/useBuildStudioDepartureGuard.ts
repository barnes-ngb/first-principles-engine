// ── The in-app exits, held by the router that owns them ─────────────────────
//
// `beforeunload` is not a departure guard in this app. It fires for closing or
// reloading the tab and for nothing else — the AppShell's *Today* link, the
// drawer, the bottom nav and the browser's own Back all go through the data
// router, which unmounts the editor without any such event. Verification
// reproduced exactly that: two failed explicit commits, a visible *Try again*,
// and a tap on Today that left with no warning and no retry waiting on return.
//
// So the guard is `useBlocker` on the route, the same shape `useUnsavedBookGuard`
// (UX-473) already uses in this repo, for the same reason stated there: one
// blocker covers every exit, including the two a kid is most likely to use.
// `beforeunload` is kept BESIDE it for the tab-close case it really does cover.
//
// ── The question is a FUNCTION, not a boolean ───────────────────────────────
//
// `useBlocker(true/false)` registers the answer as of the last RENDER, so a tap
// that edits and navigates in one tick asks the router before React re-renders
// and reads the previous answer. Both predicates below are therefore functions
// over refs the editor updates synchronously.

import { useCallback, useEffect } from 'react'
import { useBlocker } from 'react-router-dom'

export const BUILD_STUDIO_LEAVE_WARNING =
  'Your game has changes that are not saved yet.'

export interface BuildStudioDepartureInput {
  /**
   * Is there work that leaving would lose — unsaved editor changes, or a Save
   * that failed and still has its exact payload waiting to be retried?
   *
   * Read at navigation time, not at render time.
   */
  hasWorkAtRisk: () => boolean
  /** Is a durable write in flight right now? Leaving mid-write is held too. */
  writeInFlight: () => boolean
}

export interface BuildStudioDepartureGuard {
  /** True while an attempted departure is being held for an answer. */
  held: boolean
  /** Why it is being held, so the dialog can say the true thing. */
  reason: 'in-flight' | 'at-risk' | null
  /** Let the held departure through. An explicit, confirmed choice. */
  leaveAnyway: () => void
  /** Abandon the departure and stay. Always available. */
  stay: () => void
}

export function useBuildStudioDepartureGuard({
  hasWorkAtRisk,
  writeInFlight,
}: BuildStudioDepartureInput): BuildStudioDepartureGuard {
  const shouldBlock = useCallback(
    () => writeInFlight() || hasWorkAtRisk(),
    [writeInFlight, hasWorkAtRisk],
  )
  const blocker = useBlocker(shouldBlock)
  const held = blocker.state === 'blocked'

  // A departure held while a write was in flight is RELEASED when the write
  // lands and nothing is left at risk — so an ordinary "tap Save, tap Today"
  // is one tap, not two. The effect re-runs on render; the refs decide, so a
  // same-tick edit cannot sneak a release through on a stale render.
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (!writeInFlight() && !hasWorkAtRisk()) blocker.proceed()
  }, [blocker, writeInFlight, hasWorkAtRisk])

  // Closing or reloading the tab cannot be held, only warned about.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!writeInFlight() && !hasWorkAtRisk()) return
      event.preventDefault()
      event.returnValue = BUILD_STUDIO_LEAVE_WARNING
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [writeInFlight, hasWorkAtRisk])

  return {
    held,
    reason: held ? (writeInFlight() ? 'in-flight' : 'at-risk') : null,
    leaveAnyway: () => {
      if (blocker.state === 'blocked') blocker.proceed()
    },
    stay: () => {
      if (blocker.state === 'blocked') blocker.reset()
    },
  }
}
