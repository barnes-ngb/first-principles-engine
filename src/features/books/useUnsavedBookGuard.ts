// ── The in-app exits, held by the router that owns them (UX-473) ────────────
//
// The editor's own doors (Back, *Read*, *Read it to me*, the finish redirect)
// all go through `navigate`, and the shell's bottom nav and the browser's own
// Back go through the same history. Intercepting the page's four `navigate`
// calls would therefore guard four exits and miss the two a kid is most likely
// to use. One blocker on the route covers all of them.
//
// `useBlocker` needs a DATA router, and `src/app/router.tsx` already builds one
// with `createBrowserRouter` — so this is a hook added to the existing router,
// not a router replacement. (It also means a test that renders the editor must
// give it a data router, or mock `useBlocker`; the existing editor suites mock
// `react-router-dom` and now declare it alongside `useNavigate`.)
//
// ── Why the question is asked as a FUNCTION, not a boolean ──────────────────
//
// `useBlocker(true/false)` registers the answer as of the last RENDER. A tap
// that mutates and navigates in the same tick — `updatePage(…)` then
// `navigate('/books')` inside one handler, which is what a chip press does —
// asks the router before React has re-rendered, so the boolean it reads is the
// PREVIOUS answer and the first edit of a session escapes. So the blocker is a
// `BlockerFunction` over `hasOutstandingEdits`, which reads `useBook`'s
// synchronously-updated, document-bound ref at the moment of the navigation.
// `beforeunload` is decided the same way and for the same reason.

import { useCallback, useEffect } from 'react'
import { useBlocker } from 'react-router-dom'

import {
  UNSAVED_BOOK_WARNING,
  departureIsSafe,
  shouldGuardDeparture,
  type BookSaveStatus,
} from './unsavedBookDeparture'

export interface UnsavedBookGuardInput extends BookSaveStatus {
  /**
   * The authoritative, synchronous answer for the document this hook is bound
   * to — `useBook.hasOutstandingEdits`. Stale only in the sense that it is
   * scoped: once the editor moves to another book it answers `false`, so a
   * late callback for the old document can never release the new one's guard.
   */
  hasOutstandingEdits: () => boolean
}

export interface UnsavedBookGuard {
  /** True while an attempted departure is being held for an answer. */
  held: boolean
  /** Let the held departure through. An explicit, confirmed choice. */
  leaveAnyway: () => void
  /** Abandon the departure and stay in the editor. Always available. */
  stay: () => void
}

export function useUnsavedBookGuard({
  saveState,
  hasUnsavedEdits,
  hasOutstandingEdits,
}: UnsavedBookGuardInput): UnsavedBookGuard {
  // Memoized so the router re-registers only when the document or its report
  // changes, not on every render. The ANSWER is still read at navigation time.
  const shouldBlock = useCallback(
    () => shouldGuardDeparture({ saveState, hasUnsavedEdits: hasOutstandingEdits() }),
    [saveState, hasOutstandingEdits],
  )
  const blocker = useBlocker(shouldBlock)
  const held = blocker.state === 'blocked'

  // The acknowledgment releases the departure the kid already asked for, so an
  // ordinary autosave exit is one tap and a retry that lands is too. The
  // RENDERED flag is what makes this effect re-run; the ref is what decides,
  // so a same-tick edit cannot sneak a release through on a stale render.
  useEffect(() => {
    if (
      blocker.state === 'blocked' &&
      departureIsSafe({ saveState, hasUnsavedEdits: hasOutstandingEdits() })
    ) {
      blocker.proceed()
    }
  }, [blocker, saveState, hasUnsavedEdits, hasOutstandingEdits])

  // Closing or reloading the tab cannot be held, only warned about. Registered
  // for the life of the document rather than gated on a render, so the warning
  // is armed for a same-tick edit too.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasOutstandingEdits()) return
      event.preventDefault()
      event.returnValue = UNSAVED_BOOK_WARNING
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasOutstandingEdits])

  return {
    held,
    leaveAnyway: () => {
      if (blocker.state === 'blocked') blocker.proceed()
    },
    stay: () => {
      if (blocker.state === 'blocked') blocker.reset()
    },
  }
}
