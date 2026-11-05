import { useEffect, useSyncExternalStore } from 'react'

import {
  getActiveChildId,
  subscribeActiveChildId,
} from '../../../core/hooks/activeChildStore'
import {
  observeLibraryReturnIdentity,
  reconcileLibraryReturnFlowPath,
} from './libraryReturnFlow'

/**
 * The route half, mounted in `AppShell` — the layout route, which stays mounted
 * across every transition the shelf, the reader and the editor make between
 * them. It reports each location change and nothing else; whose journey it is
 * belongs to the identity half below, so there is one definition of each.
 */
export function useLibraryReturnRouteWatch(pathname: string): void {
  useEffect(() => {
    reconcileLibraryReturnFlowPath(pathname)
  }, [pathname])
}

/**
 * The identity half, mounted ABOVE the auth and profile gates in `App.tsx` —
 * the `useHandoffScopeWatch` precedent, for the same reason it moved there.
 * `AuthGate`/`ProfileGate` unmount the routed shell on loading, logout and
 * profile exit, so a watcher inside the shell cannot observe the closure that
 * ends the scope, while the flow it should have ended survives in module memory.
 * Sign back into the same account and the old return would be offered.
 *
 * The key is `family | profile | selected child`, read from the shared store
 * rather than through `useActiveChild`: an observer that outlives the login
 * screen must not cost a Firestore read. The `profile` term is what makes a
 * resolved-child change visible — `useActiveChild` locks a kid profile to its
 * own child without touching the raw selection, so a parent→kid→parent round
 * trip moves this key even though the raw store never changed.
 *
 * It is an observer: it reads, never sets, holds no state, and writes no record.
 * There is deliberately no unmount cleanup — nothing above the gates unmounts in
 * ordinary use, and a cleanup that ended the flow would end it on StrictMode's
 * simulated remount and on any ordinary re-parent. Closure is observed as an
 * empty identity instead.
 */
export function useLibraryReturnIdentityWatch(
  familyId: string,
  profile: string | null,
): void {
  const activeChildId = useSyncExternalStore(subscribeActiveChildId, getActiveChildId)
  const resolved = Boolean(familyId) && profile !== null && Boolean(activeChildId)
  const identity = resolved ? `${familyId}|${profile}|${activeChildId}` : ''
  useEffect(() => {
    observeLibraryReturnIdentity(identity)
  }, [identity])
}
