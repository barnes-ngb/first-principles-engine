/**
 * UX-324 — the one decision behind the app-bar child chip.
 *
 * `AppShell` renders the active child's name in two places (the mobile header
 * and `NavContent`, which is both the desktop sidebar and the mobile drawer),
 * and until now both were inert `<Chip variant="outlined" color="primary">` —
 * exactly how every *tappable* chip in this app is styled. It sits beside the
 * avatar on every page in the product, so it is the most prominent child-shaped
 * control anywhere, and a parent reading that header reasonably concludes it is
 * how she changes child. It was not; the only real selectors lived inside eight
 * individual page bodies, three of the six Progress tabs having none at all
 * (UX-325).
 *
 * The rule is here rather than in the component so that "who may switch" is one
 * testable sentence, and so the two chip sites cannot answer it differently.
 *
 * **Capability, never a name.** `useActiveChild` already hands a child profile a
 * no-op setter, so switching is impossible by construction — but an inert menu
 * is this same defect wearing a menu, so a child profile is not offered one at
 * all. A single-child family is refused for the same reason: a menu with one
 * entry is a control that cannot do anything.
 */

export interface ChildSwitcherAudience {
  /** True when the acting profile is a child (Lincoln/London). */
  isChildProfile: boolean
  /** How many children the family has. */
  childCount: number
}

/** Whether the header chip should be a real switcher rather than a label. */
export function canSwitchChild({
  isChildProfile,
  childCount,
}: ChildSwitcherAudience): boolean {
  return !isChildProfile && childCount > 1
}

/**
 * Accessible name for the switcher. It says both what the control does and
 * which child is current, because the visible label alone ("Lincoln") reads as
 * a status to a screen reader and gives no hint that it opens anything.
 */
export function childSwitcherLabel(childName: string): string {
  return `Switch child — currently ${childName}`
}

/** Accessible name for the menu the switcher opens. */
export const CHILD_SWITCHER_MENU_LABEL = 'Choose a child'
