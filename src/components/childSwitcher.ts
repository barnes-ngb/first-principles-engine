/**
 * UX-324 — the one decision behind the child chip.
 *
 * **Currently ON** — see `CHILD_SWITCHER_ENABLED` below for why it was off
 * (UX-330), what closed that (UX-329), and what is still open. Everything else
 * in this file, and every per-surface fix that shipped alongside it, is
 * unchanged.
 *
 * `AppShell` renders the active child's name in two places (the mobile header
 * and `NavContent`, which is both the desktop sidebar and the mobile drawer),
 * and since `UX-362` the parent Today's `ContextBar` renders a third. All three
 * render THIS rule through `ChildSwitcherChip`, so no two of them can disagree
 * about whether the name is a control.
 *
 * Until UX-324 the shell's two were inert `<Chip variant="outlined" color="primary">` —
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
 * UX-330, reversed by `FIX-231` — the switcher is ON, and this constant is the
 * whole switch. Owner decision, 2026-09-11: *"Turn the switcher ON, and make
 * Today's chip the same one."*
 *
 * **Why it was off.** UX-324 made the child changeable from every screen, and
 * that exposed a defect class this codebase was never built for: a mounted
 * editor holding child-scoped state in local React state and writing it with
 * the **live** `activeChildId`. Five Codex rounds on PR #1817 found six such
 * surfaces and fixed them one per round; round 5 named **three more it did not
 * fix**, one of them Records' **Historical Hours** dialog, whose quick-estimate
 * path can misattribute *many months of compliance hours in a single tap*. With
 * no bound on the class and fifteen commits of unrelated finished work waiting
 * on a deploy behind it, the owner's 2026-09-09 decision was *flag the switcher
 * off, deploy everything.*
 *
 * **What turned it back on.** `UX-329` — which did not patch a seventh surface
 * but **bounded the class**: five verdicts (BIND / HIDE / RESET / GATE / SAFE),
 * a registry derived from the source
 * (`docs/review/CHILD_SWITCH_SURFACE_CENSUS_2026-09.md`) and a test that fails
 * closed when a surface joins the class unclassified
 * (`src/test/childSwitchSurfaces.invariant.test.ts`). `FIX-223` then cleared
 * the P1s. The census now reports **`P1: 0`**, and its script prints that
 * number rather than anyone counting it (`npm run census:child-switch`).
 *
 * **What is still open, stated rather than implied.** Four P2 registry rows and
 * two P3s: `UX-331` (`AvatarPhotoUpload` — a staged photo seeds the other
 * boy's avatar and spends his art quota), `UX-332` (`MyAvatarPage`'s tuner
 * draft and screenshot), `UX-335` (`AddActivityDialog`'s typed activity), and
 * `UX-341` (`AvatarAdminTab`, which writes `xpLedger` and is therefore
 * propose-and-confirm); the P3s are `UX-333` and `UX-338`. Every one is on an
 * avatar, admin or dialog surface with **its own in-page child control**, so
 * each was already reachable with this constant `false` — the switcher widens
 * the reach, it did not create them. `FIX-232` closes them. The reason the flip
 * does not wait is the owner's own report of the week — *"Shelly added content
 * for Lincoln on London's page"* — whose root cause is a shell that names the
 * active child and offers no way to change it there.
 *
 * **The other direction still works.** Setting this back to `false` restores
 * the read-only chip everywhere, including Today's, because the rule has
 * exactly one definition and all three sites read it.
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
export const CHILD_SWITCHER_ENABLED = true

/**
 * Whether the header chip should be a real switcher rather than a label.
 *
 * `enabled` defaults to the shipped constant above; it is a parameter so the
 * rule stays provably correct with the switch forced **either** way — turning
 * it back on must not be a fresh gamble, and turning it off again must not be
 * one either — and so a test can pin the shipped default by omitting it.
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
