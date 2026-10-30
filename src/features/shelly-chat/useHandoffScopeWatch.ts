import { useEffect, useRef, useSyncExternalStore } from 'react'

import { getActiveChildId, subscribeActiveChildId } from '../../core/hooks/activeChildStore'
import { clearPlannerAskHandoff } from '../planner-chat/plannerAskHandoff'
import { clearComposerCustody } from './composerCustody'

/**
 * Drop UX-273's two page-session slots when the scope they belong to changes —
 * even while Ask AI is unmounted (its own guards cannot run then).
 *
 * ## Where this is mounted, and why it moved
 *
 * **Above `AuthGate`**, in `App.tsx`, not in `AppShell`. The shell was the
 * obvious home — account, role and child all change there — but the shell is
 * INSIDE the gate: a logout unmounts it, this hook's `seen` ref goes with it,
 * and the slots it exists to drop survive in module scope. The independent
 * browser run found exactly that: Ask AI draft → planner → logout → sign back
 * into the SAME account → her private composer draft handed back to whoever is
 * now holding the phone. An observer that cannot see the logout cannot answer
 * for it, so it sits where nothing unmounts it.
 *
 * ## The rule
 *
 * It is an OBSERVER: it reads the scope and never sets it, holds no state
 * beyond one ref, and touches nothing but the hand-off slot and the
 * composer-custody slot (so it is not a child-switch census candidate — no
 * React state, no write; see the census §4 note).
 *
 * Unresolved means two different things and they must not be collapsed:
 *
 *  - **before** any identity has resolved it is a page still loading, and a
 *    value settling from `''` must not count as a switch — clearing there would
 *    discard the payload of a legitimate brand-new arrival;
 *  - **after** one has resolved it is a logout, a profile exit or a revoked
 *    session. That ENDS the scope: both slots go, and `seen` is forgotten so the
 *    next identity — the same account signing straight back in included — starts
 *    a new epoch holding nothing from the session before it.
 *
 * The child is read from the shared store rather than through `useActiveChild`
 * because that hook reads `children` from Firestore: an observer must not cost a
 * read, least of all on the login screen it now outlives. For a parent the store
 * IS what `useActiveChild` resolves a selection from, and for a kid profile the
 * `profile` term of the key moves whenever the locked child would.
 */
export function useHandoffScopeWatch(familyId: string, profile: string | null): void {
  const activeChildId = useSyncExternalStore(subscribeActiveChildId, getActiveChildId)
  const resolved = Boolean(familyId) && profile !== null && Boolean(activeChildId)
  const key = resolved ? `${familyId}|${profile}|${activeChildId}` : ''
  const seen = useRef<string | null>(null)
  /** Has a resolved scope ENDED since the last one started? */
  const closed = useRef(false)

  // A PASSIVE effect, deliberately, and not a layout one. The composer hands its
  // unsent work to custody in its own unmount CLEANUP, which is passive: React
  // runs every destroy in the commit before any create, so this clear lands
  // after the save it has to beat. A layout effect would run in the mutation
  // phase — before that save — and the draft would come back.
  useEffect(() => {
    if (key === '') {
      // Initial load: nothing has been resolved yet, so there is nothing to
      // invalidate and a new arrival must survive.
      if (seen.current === null) return
      seen.current = null
      closed.current = true
      clearPlannerAskHandoff()
      clearComposerCustody()
      return
    }
    if (seen.current === null) {
      seen.current = key
      // Belt for the one ordering this hook cannot see: anything that reached a
      // slot during the closed window belongs to a session that is over, and
      // nothing legitimate can have staged there (the planner is behind the same
      // gate, so a tap is impossible while it is shut).
      if (closed.current) {
        closed.current = false
        clearPlannerAskHandoff()
        clearComposerCustody()
      }
      return
    }
    if (seen.current === key) return
    seen.current = key
    clearPlannerAskHandoff()
    clearComposerCustody()
  }, [key])
}
