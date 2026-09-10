/**
 * Whose XP award is this — UX-336 (RESET).
 *
 * `ArmorTab` renders its own child chips, so this is reachable **today** with
 * the header switcher off (`CHILD_SWITCHER_ENABLED === false`, UX-330). The
 * *Award XP* form holds a typed amount, a reason and an award type in component
 * state; the component is not re-keyed on the child, so all three survive a
 * chip tap while `doAward` reads the live `childId` prop. A parent could type
 * "+20, cleaned the whole kitchen" for one boy, tap the other's chip to check
 * his tier, tap Award — and land the XP on his brother's `xpLedger`, where it
 * also moves armor unlocks and tier through `checkAndUnlockArmor`.
 *
 * The census filed this as a P1 it could not fix, because `xpLedger` is on
 * `CLAUDE.md`'s never-silently-change list. `CLAUDE.md`'s **Attribution-only
 * fixes are pre-authorised** (owner, 2026-09-10) is what unblocks it, and this
 * qualifies on all four terms: no number changes, no stored shape change, the
 * unchanged arithmetic asserted with a positive control, and no existing row
 * touched. It **prevents** a write rather than changing one — the same shape as
 * `CertificateScanSection` in UX-329 — so no new write path exists and
 * `addXpEvent` is called with exactly what it was called with before.
 *
 * **RESET, not BIND.** An untapped award is an intent: no XP has been granted to
 * anybody, and an amount, a reason and a type are three fields to re-enter.
 * Binding would mean granting XP to a child the parent is no longer looking at,
 * which is the surprise this exists to prevent rather than a smaller version of
 * it. (`useCreativeTimer` binds because real minutes had already elapsed;
 * nothing has happened here yet.)
 *
 * **No XP math is touched.** The `MAX_AWARD` cap, the correction sign flip, the
 * tier thresholds and the armor unlock rule are exactly as they were.
 *
 * Pure: no React, no Firestore, never throws.
 */

/** The award form's typed state. Structural, so the rule tests on its own. */
export interface ArmorAwardDraft {
  /** The amount as typed (`''` when unset). */
  amount: string
  /** The required reason (`''` when unset). */
  reason: string
  /** The award type. Has a real default — see below. */
  awardType: string
}

/**
 * The type the form opens on. A real value on an untouched form, which is what
 * makes this field a special case in both functions below — the
 * `estimateDaysPerWeek` shape from UX-329's Codex round 1, one surface over.
 */
export const DEFAULT_AWARD_TYPE = 'Bonus'

/**
 * Is there anything in this draft a person actually typed?
 *
 * `awardType` counts exactly when it DIFFERS from the default, and is restored
 * either way by `clearedArmorAwardDraft`. Reading it like the others would make
 * every untouched form non-empty, so every chip tap would raise a notice about
 * work nobody did; ignoring it entirely would leave **Correction** — the one
 * type that makes the amount NEGATIVE — silently in force for the next child.
 */
export function armorAwardDraftIsEmpty(draft: ArmorAwardDraft): boolean {
  if (draft.amount.trim() !== '') return false
  if (draft.reason.trim() !== '') return false
  if (draft.awardType.trim() !== DEFAULT_AWARD_TYPE) return false
  return true
}

/** The draft as the form opens it. A new object; the caller's is never mutated. */
export function clearedArmorAwardDraft(): ArmorAwardDraft {
  return { amount: '', reason: '', awardType: DEFAULT_AWARD_TYPE }
}

/**
 * What the parent is told when a child change cleared an award they had typed.
 * `null` when there was nothing to lose — a notice on every chip tap is one
 * nobody reads by the time it matters.
 *
 * Names both boys where their names are known: "it wasn't awarded" without
 * saying *to whom* leaves the parent with the question this defect is about.
 * Looked up by the caller from the family's own children — identity, never a
 * literal name gate.
 */
export function armorAwardSwitchNotice(
  hadTypedDraft: boolean,
  previousChildName?: string,
  nextChildName?: string,
): string | null {
  if (!hadTypedDraft) return null
  const forWhom = previousChildName ? ` for ${previousChildName}` : ''
  const nowOn = nextChildName ? ` You're now awarding XP to ${nextChildName}.` : ''
  return `The XP you'd typed${forWhom} wasn't awarded — XP is only granted when you tap the award button.${nowOn}`
}
