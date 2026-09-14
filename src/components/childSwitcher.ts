/**
 * UX-324 — the one decision behind the child chip.
 *
 * **Currently ON** — see `CHILD_SWITCHER_ENABLED` below for why it was off
 * (UX-330), what closed that (UX-329), and what is still open. Everything else
 * in this file, and every per-surface fix that shipped alongside it, is
 * unchanged.
 *
 * **Since `FEAT-237` / `UX-425` there is exactly ONE site.** `AppShell` renders
 * this chip in the mobile header, and `NavContent` renders it in the desktop
 * sidebar — one per viewport, never both at once, because the sidebar is hidden
 * below 900px and the header above it. The mobile **drawer** shares
 * `NavContent` and deliberately passes `showChildChip={false}`: the header chip
 * is visible above the open drawer, which is what the owner's screenshot
 * showed. `ContextBar`'s chip (`UX-362`) and the ten in-page `ChildSelector`s
 * are gone. Owner, 2026-09-13: *"There are now as many as four locations to
 * choose a child. I like the chip drop-down in the header as the primary
 * source; remove the others."*
 *
 * Until UX-324 the shell's two were inert `<Chip variant="outlined" color="primary">` —
 * exactly how every *tappable* chip in this app is styled. It sits beside the
 * avatar on every page in the product, so it is the most prominent child-shaped
 * control anywhere, and a parent reading that header reasonably concludes it is
 * how she changes child. It was not; the only real selectors lived inside eight
 * individual page bodies, three of the six Progress tabs having none at all
 * (UX-325). Making the chip real then made the duplication the visible problem,
 * which is `UX-425` above.
 *
 * The rule is here rather than in the component so that "who may switch" is one
 * testable sentence, and so the two chip sites cannot answer it differently.
 *
 * **Capability, never a name.** `useActiveChild` already hands a child profile a
 * no-op setter, so switching is impossible by construction — but an inert menu
 * is this same defect wearing a menu, so a child profile is not offered one at
 * all. A single-child family is refused the child LIST for the same reason: a
 * list with one entry is a control that cannot do anything — but see
 * {@link canOpenChildMenu}, which is a different question and answers a parent
 * yes either way, because the menu now also holds *Add a child…*.
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
 * one P3: `UX-331` (`AvatarPhotoUpload` — a staged photo seeds the other boy's
 * avatar and spends his art quota), `UX-332` (`MyAvatarPage`'s tuner draft and
 * screenshot), `UX-335` (`AddActivityDialog`'s typed activity), `UX-341`
 * (`AvatarAdminTab`, which writes `xpLedger` and is therefore
 * propose-and-confirm), and `UX-338`. Every one is on a surface with **its own
 * in-page child control**, so each was already reachable with this constant
 * `false` — the switcher widens the reach, it did not create them. `FIX-232`
 * closes them. The reason the flip does not wait is the owner's own report of
 * the week — *"Shelly added content for Lincoln on London's page"* — whose root
 * cause is a shell that names the active child and offers no way to change it
 * there.
 *
 * **One row was NOT in that set, and the flip is what opened it.** `UX-333`
 * (`useBackgroundReimagine`) is the one open row the census marks **Shell
 * only**: Books has no in-page `ChildSelector`, so on a legacy book with no
 * `createdFor` a finished reimagine — a paid call landing minutes later — was
 * filed under whoever the header was on when it returned. A run that flips this
 * constant owns the rows the flip creates, so it is fixed in the same PR
 * (BIND, the `useCreativeTimer.ownerChildId` answer). It was a review round
 * that found the first draft of the paragraph above claiming otherwise.
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

/**
 * Whether the chip should open a MENU at all — `FEAT-237` / `UX-425`.
 *
 * Owner decision, 2026-09-13, from the first post-deploy test: *"There are now
 * as many as four locations to choose a child. I like the chip drop-down in the
 * header as the primary source; remove the others. Keep the actual profile
 * change between parent and child."* The ten in-page `ChildSelector`s went with
 * that decision, and **Add a child lived in exactly one of them** — the selector
 * was `AddChildDialog`'s only host in the app. So the door moves into this
 * menu, which is the one place a parent is already looking at the list of
 * children.
 *
 * That makes "who gets a menu" a different question from "who may switch", and
 * the two are kept apart rather than collapsed:
 *
 * - **A kid never gets a menu.** Capability, never a name — unchanged, and the
 *   whole rule below still holds for the child list.
 * - **A parent always gets one**, including in a single-child family, where
 *   `canSwitchChild` refuses the child list because a one-entry menu could not
 *   do anything. It can now: it can add the second child. Refusing the menu
 *   there would leave a one-child family with no way to add a second at all,
 *   which is the in-page selector's job arriving as a hole.
 *
 * **Deliberately NOT gated on `CHILD_SWITCHER_ENABLED`.** That constant is a
 * safety switch over *switching*, and switching is what it must be able to turn
 * off. Adding a child is not switching: with the flag `false` this menu holds
 * *Add a child…* and no child list, so the kill-switch still kills exactly what
 * it names and does not take the only add door with it.
 */
export function canOpenChildMenu({ isChildProfile }: Pick<ChildSwitcherAudience, 'isChildProfile'>): boolean {
  return !isChildProfile
}

/**
 * The menu's add row. The ellipsis is the house signal that a tap opens
 * something rather than doing something — it opens `AddChildDialog`, which is
 * where the write is confirmed.
 */
export const ADD_CHILD_MENU_LABEL = 'Add a child…'

/**
 * The chip a parent sees when the family has NO children yet.
 *
 * `ChildSwitcherChip` returns `null` with no active child, which was harmless
 * while every page carried a selector whose empty state offered *Add Child*.
 * With the selectors gone that would be a family who can never add their first
 * child, so the chip renders this instead — the same door, before there is a
 * name to put on it.
 */
export const ADD_FIRST_CHILD_LABEL = 'Add a child'
