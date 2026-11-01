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
 *     exactly as it is from the Hero Hub's My Books tile.
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

/** The shelf route. Pinned to the app's route table by this module's test. */
export const STONEBRIDGE_BOOKS_PATH = '/books'

/** The id `MyAvatarPage` puts on the real ArmorPieceGallery wrapper. */
export const FORGE_GALLERY_ANCHOR_ID = 'armor-piece-gallery'

/** A location visit's real destinations, scoped to the child on screen. */
export interface StonebridgeDestinations {
  /** Navigate to the existing bookshelf. No active-child write. */
  onOpenBooks?: () => void
  /** Move to the existing armor gallery on this page. */
  onVisitForge?: () => void
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
