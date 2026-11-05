/**
 * The Forge door on the canonical town page, and where it actually lands.
 *
 * ── Why there is a hand-off at all ───────────────────────────────────────────
 *
 * Inside the Hero Hub the Forge visit is a jump: the board closes and the page
 * scrolls the one real `ArmorPieceGallery` into view and focuses it
 * (`focusForgeGallery`). From the town page the gallery is not on the page at
 * all — it lives on `/avatar`, with the customizer and the ceremonies — so the
 * door is a navigation first and the same jump second, and the second half has
 * to happen on a page that does not exist yet when the tap is made.
 *
 * There is deliberately **no `/forge` route**, no second gallery, no copy of
 * forge state and no grant: the destination is the real hub, under the hub's own
 * existing rules. A hash would not do it either — scrolling without moving the
 * keyboard focus is the exact defect `FIX-267` was written for.
 *
 * ── What it is ───────────────────────────────────────────────────────────────
 *
 * One request in module memory, scoped, epoch-stamped, route-bounded, and
 * consumed once:
 *
 *   • **scoped** — it names the family and child the town page was rendering.
 *     The hub consumes it only for the child IT is rendering, so a request can
 *     never scroll one boy's hub on account of his brother's tap.
 *   • **epoch-stamped** — against `getLibraryIdentityEpoch()`, which is the
 *     app's one monotonic count of observed identity movement (the shared
 *     active-child store, the gates, and an unsettled or failed children read
 *     all bump it). The epoch carried is the one observed at the TAP, handed
 *     through the village's pending departure, so an `A → B → A` inside the
 *     visit's closing transition is refused even though the scope string has
 *     come back to what it was. No new store, no new flag, no per-child record.
 *   • **route-bounded** — a request only survives while the app is at the host
 *     path. `reconcileForgeFocusPath` retires it on any other route, which is
 *     what makes an UNSERVED request end rather than wait: the gallery does not
 *     exist until the hub's profile read lands, so a child who taps the armor
 *     door, arrives while that read is held and then leaves for Settings used to
 *     leave a live request in memory — and the next ordinary visit to the hub
 *     scrolled and focused the gallery nobody had asked for. It is reported from
 *     the location change (`useForgeFocusRouteWatch` in `AppShell`), not from a
 *     component unmount: an unmount cleanup would also fire on StrictMode's
 *     simulated remount and on any re-parent, retiring a request the real mount
 *     was about to serve.
 *   • **consumed once** — the request is taken on the first ask whatever the
 *     verdict, so a refused one cannot sit there waiting for the next arrival.
 *
 * A delayed but legitimate arrival still works, which is the whole point of the
 * route bound being the route and not a timer: while the child is AT the hub the
 * request waits as long as the read takes, and the hub serves it on the first
 * commit in which the anchor is really in the document.
 *
 * It never selects a child, never writes, and carries no permission: the gallery
 * decides what is forgeable exactly as it does for a child who walked to the hub
 * themselves.
 */
import { useEffect } from 'react'

import { getLibraryIdentityEpoch } from './libraryReturnFlow'

/** The real armor, customizer and ceremonies. The one Forge destination. */
export const FORGE_HOST_PATH = '/avatar'

interface ForgeFocusRequest {
  familyId: string
  childId: string
  /** The identity epoch observed at the TAP — never re-read later. */
  epoch: number
}

let request: ForgeFocusRequest | null = null

/**
 * The town page is sending this child to their armor.
 *
 * Refuses an unsettled scope for the same reason the journey does: a request
 * bound to nothing would match whoever arrived next.
 */
export function requestForgeFocus(next: ForgeFocusRequest): boolean {
  if (!next.familyId || !next.childId) return false
  request = next
  return true
}

/**
 * Drop any request in hand.
 *
 * The one unconditional retirement, used by {@link reconcileForgeFocusPath} and
 * by tests resetting module memory between cases. **Nothing calls it from a
 * component lifecycle** — see the route bound in the header for why an unmount
 * cleanup would be the wrong boundary.
 */
export function clearForgeFocusRequest(): void {
  request = null
}

/** Path only, with the query, the hash and a trailing slash removed. */
function normalise(pathname: string): string {
  const path = pathname.replace(/[?#].*$/, '')
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}

/**
 * A route transition: a request lives only at the host path.
 *
 * Arriving at (or staying on) the hub keeps it, however long the profile read
 * takes. Anywhere else ends it — the child either never reached the armor or
 * reached it and moved on before the gallery was there, and in both cases the
 * next visit to the hub is an ordinary visit.
 *
 * Called on every location change, so Back and Forward are ordinary changes
 * too: stepping out retires the request and stepping back in finds it gone.
 * Safe to call with no request in hand, and idempotent for the same path.
 */
export function reconcileForgeFocusPath(pathname: string): void {
  if (!request) return
  if (normalise(pathname) === FORGE_HOST_PATH) return
  clearForgeFocusRequest()
}

/**
 * The route half, mounted in `AppShell` beside the Library journey's — the
 * layout route is the one thing mounted across every transition the town page,
 * the hub and everywhere else make between them.
 *
 * It reports each location change and nothing else: it holds no state, reads no
 * record and never creates a request.
 */
export function useForgeFocusRouteWatch(pathname: string): void {
  useEffect(() => {
    reconcileForgeFocusPath(pathname)
  }, [pathname])
}

/**
 * Is there a request this hub should serve, for the child it is rendering?
 *
 * Taken either way — a request that is refused here is spent, not deferred.
 * Refusing it moves nothing: the caller does not scroll, does not focus and
 * does not navigate, so the hub is the ordinary hub.
 */
export function consumeForgeFocus(scope: {
  familyId: string
  childId: string
}): boolean {
  const pending = request
  request = null
  if (!pending) return false
  if (!scope.familyId || !scope.childId) return false
  if (pending.familyId !== scope.familyId) return false
  if (pending.childId !== scope.childId) return false
  // The identity moved between the tap and the arrival: this is somebody else's
  // page now, or a page nobody can vouch for.
  return pending.epoch === getLibraryIdentityEpoch()
}
