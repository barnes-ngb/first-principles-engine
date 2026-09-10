/**
 * UX-324 — the one decision behind the app-bar child chip.
 *
 * **Currently OFF** — see `CHILD_SWITCHER_ENABLED` below for why (UX-330) and
 * what turns it back on (UX-329). Everything else in this file, and every
 * per-surface fix that shipped alongside it, is unchanged.
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

/**
 * UX-330 — the switcher is OFF, and this constant is the whole switch.
 *
 * **Why it is off.** UX-324 made the child changeable from every screen, and
 * that exposed a defect class this codebase was never built for: a mounted
 * editor holding child-scoped state in local React state and writing it with
 * the **live** `activeChildId`. Five Codex rounds on PR #1817 found six such
 * surfaces and fixed them one per round; round 5 named **three more it did not
 * fix** — `business/SaleEntryForm` (a pending sale appended to the other
 * child's log), `business/KitBuilderForm` (a roster stamped with the other
 * child's id), and Records' **Historical Hours** dialog, whose quick-estimate
 * path can misattribute *many months of compliance hours in a single tap*.
 * Three of the surfaces found so far write the hours/compliance rail, and
 * there is no reason to think round 5's three are the last three. Meanwhile
 * fifteen commits of unrelated, finished work (FIX-219's learner-model
 * bootstrap, DOC-23/DOC-24, every Progress fix from AUDIT-218) were waiting on
 * a deploy behind it. Owner decision, 2026-09-09: *flag the switcher off,
 * deploy everything.*
 *
 * **What turns it on.** `UX-329` — the shell-level rule that BOUNDS the class
 * (a registry of child-scoped in-flight state the switcher consults, or
 * route-level remounting with explicit opt-outs; the choice is an owner
 * decision). When that lands and the three named surfaces have an answer, this
 * becomes `true` in a one-line reviewable PR.
 *
 * **Why a build-time constant and not `core/ai/featureFlags.ts`.** That module
 * is `AIFeatureFlag`-scoped with an `fpe_ai_flag_` prefix and it stores per
 * **device** in `localStorage` — Shelly's phone and Nathan's would each need
 * setting, which is the wrong shape for a safety switch. This is one value,
 * the same on every device, changed by a diff a reviewer can read in full.
 *
 * **The per-surface fixes from PR #1817 stay in.** They are what will make the
 * switcher safe to turn back on, and two of them — `UX-327` (the creative
 * timer's hours) and `UX-328` (Records' quick-add hours) — fix defects that
 * are reachable **without** the switcher, through the in-page `ChildSelector`s
 * that have always existed.
 */
export const CHILD_SWITCHER_ENABLED = false

/**
 * Whether the header chip should be a real switcher rather than a label.
 *
 * `enabled` defaults to the shipped constant above; it is a parameter so the
 * rule stays provably correct with the switch ON — turning it back on must not
 * be a fresh gamble — and so a test can pin the shipped default by omitting it.
 */
export function canSwitchChild(
  { isChildProfile, childCount }: ChildSwitcherAudience,
  enabled: boolean = CHILD_SWITCHER_ENABLED,
): boolean {
  if (!enabled) return false
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
