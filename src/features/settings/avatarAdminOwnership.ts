/**
 * Whose admin award is this — UX-341 (RESET).
 *
 * `AvatarAdminTab` is `ArmorTab`'s shape (`UX-336`, closed by `FIX-223`) on the
 * admin-only surface, and it holds **more**: a typed XP amount, a typed diamond
 * amount, a shared reason, and two open confirm dialogs — *Deduct diamonds* and
 * *Regenerate base character* — each of whose own buttons calls a handler that
 * reads the live `activeChildId`. The tab renders its own child chips, so this
 * was reachable with the header switcher off; `FIX-231` widened the reach.
 *
 * The writes it re-points are `xpLedger` (through `addXpEvent`, which also
 * moves armor unlocks and tier), `avatarProfiles.diamonds`, and — on the
 * deduct path — a child's diamond balance going DOWN for a reason typed about
 * his brother.
 *
 * The census filed this as a P2 it would not fix because `xpLedger` is on
 * `CLAUDE.md`'s never-silently-change list. `CLAUDE.md`'s **Attribution-only
 * fixes are pre-authorised** (owner, 2026-09-10) is what unblocks it, and this
 * qualifies on all four terms, exactly as `UX-336` did: no number changes, no
 * stored shape change, the unchanged arithmetic asserted with a positive
 * control, and no existing row touched. It **prevents** a write rather than
 * changing one — `addXpEvent` is called with exactly what it was called with
 * before, and the 200-diamond cap, the `amount <= 0` guard and the deduct sign
 * are untouched.
 *
 * **RESET, not BIND.** An untapped award is an intent: no XP and no diamonds
 * have been granted to anybody, and an amount plus a reason are two fields.
 * Binding would mean granting to a child the parent is no longer looking at,
 * which is the surprise this exists to prevent rather than a smaller version of
 * it.
 *
 * Pure: no React, no Firestore, never throws.
 */

/**
 * The admin award forms' typed state, as strings and numbers the way the tab
 * holds them. Structural, so the rule tests on its own.
 */
export interface AvatarAdminDraft {
  /** The XP stepper's value. Has a real default — see below. */
  xpAmount: number
  /** The diamond stepper's value. Has a real default — see below. */
  diamondAmount: number
  /** The reason both award paths share (`''` when unset). */
  diamondReason: string
}

/** The amounts both steppers open on. Real values, so they are special-cased below. */
export const DEFAULT_ADMIN_XP_AMOUNT = 10
export const DEFAULT_ADMIN_DIAMOND_AMOUNT = 10

/**
 * Is there anything in this draft a person actually typed?
 *
 * The two amounts count exactly when they DIFFER from the opening value, and
 * are restored either way by `clearedAvatarAdminDraft`. Reading them like the
 * reason would make every untouched tab non-empty, so every chip tap would
 * raise a notice about work nobody did — the `DEFAULT_AWARD_TYPE` rule from
 * UX-336, which is this defect's own sibling.
 */
export function avatarAdminDraftIsEmpty(draft: AvatarAdminDraft): boolean {
  if (draft.diamondReason.trim() !== '') return false
  if (draft.xpAmount !== DEFAULT_ADMIN_XP_AMOUNT) return false
  if (draft.diamondAmount !== DEFAULT_ADMIN_DIAMOND_AMOUNT) return false
  return true
}

/** The draft as the tab opens it. A new object; the caller's is never mutated. */
export function clearedAvatarAdminDraft(): AvatarAdminDraft {
  return {
    xpAmount: DEFAULT_ADMIN_XP_AMOUNT,
    diamondAmount: DEFAULT_ADMIN_DIAMOND_AMOUNT,
    diamondReason: '',
  }
}

/**
 * What the parent is told when a child change cleared an award they had typed.
 * `null` when there was nothing to lose — a notice on every chip tap is one
 * nobody reads by the time it matters.
 *
 * Says **nothing was granted**, because that is the one fact a person cannot
 * check from this screen: the recent-events list beside the form belongs to the
 * child now selected, so an absent row there proves nothing about the boy who
 * just left. Names both where their names are known — "it wasn't awarded"
 * without saying to whom leaves the parent with the question this defect is
 * about.
 */
export function avatarAdminSwitchNotice(
  hadTypedDraft: boolean,
  previousChildName?: string,
  nextChildName?: string,
): string | null {
  if (!hadTypedDraft) return null
  const whose = previousChildName ? ` for ${previousChildName}` : ''
  const nowOn = nextChildName ? ` You're now awarding to ${nextChildName}.` : ''
  return `The award you'd typed${whose} was cleared — nothing was granted, XP or diamonds.${nowOn}`
}
