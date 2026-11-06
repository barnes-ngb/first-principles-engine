import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'

import {
  getActiveChildId,
  subscribeActiveChildId,
} from '../../../core/hooks/activeChildStore'
import {
  expireLibraryReturnForUnsettledIdentity,
  observeLibraryReturnIdentity,
  reconcileLibraryReturnFlowPath,
} from './libraryReturnFlow'

/**
 * The route half, mounted in `AppShell` — the layout route, which stays mounted
 * across every transition the shelf, the reader and the editor make between
 * them. It reports each location change and nothing else; whose journey it is
 * belongs to the identity half below, so there is one definition of each.
 *
 * ── Why this one is a LAYOUT effect, and the other two are not ───────────────
 *
 * What this reports is not a value — it is that a route **has become current**,
 * and the reconciliation it feeds reads the flow as it stands when the report
 * arrives. So the report has to be made at the commit that made that route
 * current: an observation of the route the child was on, applied to a flow that
 * has moved on since, is a statement about a screen that is no longer there.
 *
 * As a passive effect it was not made there. A passive effect is flushed after
 * React yields to the browser, so a tap on a control that the just-committed
 * screen is already showing can be processed BEFORE the observation of that
 * screen's own arrival. That is one real sequence, captured on a bounded local
 * reproduction of the shelf's *Come back to Stonebridge* case — 17 clean runs,
 * then run 18, on generation 1:
 *
 *   1. `/books` commits with the journey in `away`; the shelf renders the way
 *      back; the last route this watch has observed is still `/stonebridge`.
 *   2. The child takes it. `requestLibraryReturn` moves the journey to
 *      `returning` and the router is sent to the town page.
 *   3. The `/books` observation from step 1 finally runs. The `returning` clause
 *      of `reconcileLibraryReturnFlowPath` asks whether `/books` is this
 *      journey's own entry, which it is not — so the return reads as ABANDONED
 *      and the journey is ended.
 *   4. The town page arrives with no request to serve: no focus hand-off is
 *      attempted at all, and the child is left on a board with the keyboard
 *      nowhere near the place they asked to come back to.
 *
 * A layout effect is flushed inside the commit, before the browser can dispatch
 * anything, so the observation can never be older than the flow it is applied
 * to. Nothing else about it changes: same reconciliation, same dependency, same
 * two clauses, same expiry for a genuine departure — a real later arrival
 * outside the journey's own entry still ends it, because that arrival is itself
 * a commit this now reports from.
 *
 * What is NOT claimed: the focus failures seen before this were not instrumented,
 * so this is the mechanism a local recurrence actually showed and the boundary
 * this holds from now on — not a trace of those earlier runs.
 *
 * It is deliberately the ONLY layout effect here. The identity and readiness
 * halves below report a VALUE a surface has already read — an identity string,
 * a read's own `isLoading` / `loadFailed` — which is as true a frame later as it
 * is during the commit, and the readiness latch depends on seeing its own read
 * settle rather than on when it is told. And this does not make anything rely on
 * effect order: `libraryReturnForOrigin` is still what answers "whose return is
 * this", so a host never serves a journey because two effects happened to run in
 * a convenient sequence.
 */
export function useLibraryReturnRouteWatch(pathname: string): void {
  useLayoutEffect(() => {
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

/**
 * The readiness half: the scoped children read the surface ALREADY makes.
 *
 * Takes `isLoading` / `loadFailed` straight from a `useActiveChild()` call the
 * caller already has — no second read, no new permission, no child switch, no
 * stored flag — because the identity key the watch above builds is made of the
 * SELECTED child id, which survives both of those states. A failed read leaves
 * the previous answer's `activeChild` object in place with the matching id, so
 * that key never moves and the journey outlived the identity it was bound to.
 *
 * Two unresolved states, split exactly as the identity watch splits them, and
 * for the same reason — which is why the latch is a ref and NOT module state:
 *
 *   • **failed** (`loadFailed`) is an affirmative answer. The identity is
 *     unknown and will not become known on its own, so it ends the journey the
 *     moment it is seen — including on a surface that has just mounted into a
 *     failure, which is the shelf a child reaches back to from the reader.
 *   • **not answered yet** is a page still settling. `useChildren` keeps
 *     `isLoading` per hook instance, so EVERY fresh mount starts there; ending
 *     the journey on it would end it on the first render of the shelf the
 *     journey was created for. It counts only once THIS observer has seen its
 *     own read settle — a re-read or a retry under an open shelf — so the latch
 *     has to be scoped to one mount's lifetime and nothing wider.
 *
 * The latch is dropped when it fires, so a retry that stays in flight bumps the
 * epoch once rather than once per report. The caller keeps whatever gate it
 * already had: hiding the control is still right, it was simply never enough.
 */
export function useLibraryReturnReadinessWatch(
  isLoading: boolean | undefined,
  loadFailed: boolean | undefined,
): void {
  const settledOnce = useRef(false)
  useEffect(() => {
    if (!isLoading && !loadFailed) {
      settledOnce.current = true
      return
    }
    if (!loadFailed && !settledOnce.current) return
    settledOnce.current = false
    expireLibraryReturnForUnsettledIdentity()
  }, [isLoading, loadFailed])
}
