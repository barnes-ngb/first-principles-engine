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
 * One request in module memory, scoped and epoch-stamped, consumed once:
 *
 *   • **scoped** — it names the family and child the town page was rendering.
 *     The hub consumes it only for the child IT is rendering, so a request can
 *     never scroll one boy's hub on account of his brother's tap.
 *   • **epoch-stamped** — against `getLibraryIdentityEpoch()`, which is the
 *     app's one monotonic count of observed identity movement (the shared
 *     active-child store, the gates, and an unsettled or failed children read
 *     all bump it). A request made before a switch is refused after it, even
 *     where the scope string has come back to what it was. No new store, no new
 *     flag, no per-child record.
 *   • **consumed once** — the request is taken on the first ask whatever the
 *     verdict, so a refused one cannot sit there waiting for the next arrival.
 *
 * It never selects a child, never writes, and carries no permission: the gallery
 * decides what is forgeable exactly as it does for a child who walked to the hub
 * themselves.
 */
import { getLibraryIdentityEpoch } from './libraryReturnFlow'

/** The real armor, customizer and ceremonies. The one Forge destination. */
export const FORGE_HOST_PATH = '/avatar'

interface ForgeFocusRequest {
  familyId: string
  childId: string
  /** `getLibraryIdentityEpoch()` as read at the tap. */
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

/** Drop any request in hand. Used by the hub on unmount and by tests. */
export function clearForgeFocusRequest(): void {
  request = null
}

/**
 * Is there a request this hub should serve, for the child it is rendering?
 *
 * Taken either way — a request that is refused here is spent, not deferred.
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
