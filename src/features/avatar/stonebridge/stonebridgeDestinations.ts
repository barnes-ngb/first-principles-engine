/**
 * Where a Stonebridge location visit can actually send a child — and nowhere
 * else.
 *
 * Two destinations, both of which already exist. This module is the contract
 * between the village (which offers them) and `MyAvatarPage` (which performs
 * them), kept in one place so the two halves cannot drift and so the route the
 * village points at is **assertable against the app's own route table** rather
 * than against a hand-written string in a component.
 *
 *   • **Open My Books** → `/books`, the real `BookshelfPage`. It navigates and
 *     does nothing else: it does not set the active child, does not touch
 *     completion logic, and does not promise a particular book is ready to
 *     read. Which book — or whether to read at all — is the shelf's own choice,
 *     exactly as it is from the Hero Hub's My Books tile. It is handed the
 *     location it was tapped in, which is the only thing the temporary return
 *     flow needs to bring the child back to the right tile — see
 *     `libraryReturnFlow`.
 *
 *   • **See your armor** → the ArmorPieceGallery already mounted further down
 *     `MyAvatarPage`. There is **no `/forge` route**; inventing one, or drawing
 *     a second copy of forge state in the village, would be two sources of
 *     truth for the same armor. So the village closes and the page moves to the
 *     real gallery, under the gallery's own existing rules: nothing is
 *     purchased, no piece is auto-selected, no diamonds are spent, and the
 *     narrative Forge mission stays independent of armor eligibility.
 */

import { prefersReducedMotion, scrollBehaviourFor } from '../../today/logWorkJump'
import { VillageLocationState } from './computeStonebridgeProgress'

/** The shelf route. Pinned to the app's route table by this module's test. */
export const STONEBRIDGE_BOOKS_PATH = '/books'

/**
 * The canonical town page — the route the nav's Stonebridge entry opens.
 *
 * It is the SAME village as the Hero Hub's board: one controller, one progress
 * owner, one set of location visits, presented as a page instead of a modal
 * (`StonebridgeVillage`'s `presentation` prop). The legacy `/avatar` board is
 * untouched and keeps the armor, the customizer and the tier ceremonies around
 * it; this is a second door to the village, not a second village.
 *
 * Pinned to the app's route table by this module's test, and it is one of the
 * two paths a `libraryReturnFlow` journey may carry.
 */
export const STONEBRIDGE_TOWN_PATH = '/stonebridge'

/**
 * Today, as the town page offers it.
 *
 * The page needs an ordinary way out that is not the village — the same
 * destination the hub's own mission card already sends a finished hero to. It is
 * a plain navigation: nothing about the default Today view, its gates or its
 * contents changes, and nothing is logged by arriving there.
 */
export const STONEBRIDGE_TODAY_PATH = '/today'

/** The id `MyAvatarPage` puts on the real ArmorPieceGallery wrapper. */
export const FORGE_GALLERY_ANCHOR_ID = 'armor-piece-gallery'

/** The one location that IS the books place: Old Tomas's Library Hut. */
export const LIBRARY_MISSION_ID = 'library_hut'

/** A location visit's real destinations, scoped to the child on screen. */
export interface StonebridgeDestinations {
  /**
   * Navigate to the existing bookshelf. No active-child write.
   *
   * Handed the id of the location the tap came from — so the shelf's temporary
   * way back knows which tile to return to — and the identity epoch observed at
   * that tap, which the journey refuses to be created against if it has moved
   * since. Both are facts about the journey, not permissions: the destination
   * and everything the child can reach there are identical either way.
   */
  onOpenBooks?: (fromMissionId: string, observedEpoch: number) => void
  /** Move to the existing armor gallery on this page. */
  onVisitForge?: () => void
}

/**
 * Does this location, in this state, offer the real bookshelf?
 *
 * Two cases, and the difference between them is what the place IS rather than
 * how far along it is:
 *
 *   • **the location being repaired now** — reading is what repairs it, so the
 *     shelf is the thing to do next. Unchanged, for every location.
 *   • **the repaired Library Hut** — the Library is the village's books place.
 *     Old Tomas's shelves being dry again is not a reason to take the shelf
 *     away: a child who fixed the library and then cannot open a book from it
 *     has watched the one door they earned close. So the Library keeps its door
 *     once repaired, and keeps it through the capstone — the rally parks on
 *     Banner Hall with every location repaired, and the Library is still the
 *     Library.
 *
 * Every other repaired location keeps exactly what it had: its saved look and
 * its thank-you, and no destination. The Forge is unaffected either way — the
 * armor gallery is offered at the Forge in any state, by its own rule, and this
 * predicate has nothing to do with it.
 *
 * One predicate for one button: the visit renders the Books control from this
 * and nothing else, so a repaired Library cannot end up with two of them.
 */
export function offersBooksDoor(
  missionId: string,
  state: VillageLocationState,
): boolean {
  if (state === VillageLocationState.Active) return true
  return state === VillageLocationState.Repaired && missionId === LIBRARY_MISSION_ID
}

/**
 * Move to the armor gallery and put the keyboard focus on it.
 *
 * The same shape as `focusLogWork` (FIX-267) and for the same reason: a control
 * that scrolls without moving focus does nothing at all for anyone using a
 * keyboard or a screen reader, and `focus()` scrolls on its own, which would
 * undo a reduced-motion choice if it ran second.
 *
 * Returns `false` when the gallery is not on the page — a parent profile, or an
 * error boundary that has replaced it — so a caller can tell "moved" from
 * "there was nothing to move to" instead of reporting a no-op as success.
 *
 * **Call this only once the village dialogs have closed.** While a dialog is
 * open its focus trap owns the focus and MUI marks the rest of the page
 * `aria-hidden`; focusing into that is both undone and invisible.
 */
export function focusForgeGallery(doc: Document = document, view: Window = window): boolean {
  const target = doc.getElementById(FORGE_GALLERY_ANCHOR_ID)
  if (!target) return false
  target.scrollIntoView({
    behavior: scrollBehaviourFor(prefersReducedMotion(view)),
    block: 'start',
  })
  target.focus({ preventScroll: true })
  return true
}
