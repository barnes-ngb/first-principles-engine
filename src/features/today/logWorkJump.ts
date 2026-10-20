/**
 * The Today jump to *Log work* (FIX-267).
 *
 * The bar's button used to scroll a bare `<div>` marker into view with
 * `behavior: 'smooth'` and leave the keyboard focus where it was — so the
 * control said *"Log extra work"* and then, for anyone using a keyboard or a
 * screen reader, nothing happened at all. Two corrections, both small:
 *
 *   • the destination is a real element with an id that TAKES FOCUS, so the
 *     next Tab lands inside the form rather than back at the top of the page;
 *   • a parent who has asked their phone to reduce motion gets `'auto'`.
 *     `prefers-reduced-motion` is an accessibility preference, not a style, and
 *     a long smooth scroll is exactly the motion it is about.
 *
 * Kept out of the card and out of `TodayPage` because the jump has two halves
 * that must agree — the id the form renders and the id the bar looks for — and
 * one definition is how they cannot drift.
 */

/** The id the *Log work* form renders, and the jump looks for. */
export const LOG_WORK_ANCHOR_ID = 'log-work'

/** Has this person asked for less motion? A missing `matchMedia` means no. */
export function prefersReducedMotion(view: Window = window): boolean {
  if (typeof view.matchMedia !== 'function') return false
  try {
    return view.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    // An old or stubbed `matchMedia` that rejects the query is not a reason to
    // lose the jump.
    return false
  }
}

/** The scroll behaviour that preference implies. */
export function scrollBehaviourFor(reduceMotion: boolean): ScrollBehavior {
  return reduceMotion ? 'auto' : 'smooth'
}

/**
 * Move to the form and put the focus in it.
 *
 * Returns `false` where the form is not on the page (a day with no log yet
 * renders no card), so a caller can tell the difference between *"jumped"* and
 * *"there was nothing to jump to"* rather than reporting a no-op as success.
 */
export function focusLogWork(
  doc: Document = document,
  view: Window = window,
): boolean {
  const target = doc.getElementById(LOG_WORK_ANCHOR_ID)
  if (!target) return false
  target.scrollIntoView({
    behavior: scrollBehaviourFor(prefersReducedMotion(view)),
    block: 'start',
  })
  // After the scroll and without a second one: `focus()` scrolls on its own by
  // default, which would undo the reduced-motion choice above.
  target.focus({ preventScroll: true })
  return true
}
