// ── Barnes Bros Business (FEAT-30) ────────────────────────────────
//
// Lincoln's operations-and-goal surface. Spec: docs/BUSINESS_TAB_DESIGN.md.
//
// Two load-bearing pedagogy invariants live in these shapes:
//   1. The earnings log is ADDITIVE — a `BusinessLogEntry` is an append-only
//      money-in event. There is no stored, mutable balance anywhere; progress
//      toward the goal is *derived* by summing the log. This structurally
//      enforces the additive-only thermometer (the meter only ever climbs).
//   2. The kid-visible log carries NO customer PII — only operational state
//      (amount, kit type, date, an optional kid-safe note). Customer/order
//      data is parent-gated and lands in a later chunk.

/**
 * Kit / item a sale or earning can be logged against. Additive `as const`
 * list (per the enums.ts convention) — extend as the product line grows.
 * Deliberately loose for chunk 1; price tiers and the product manifest land
 * in later slices.
 */
export const BusinessItemType = {
  StarterKit: 'StarterKit',
  PartyKit: 'PartyKit',
  CustomKit: 'CustomKit',
  StickerSheet: 'StickerSheet',
  Book: 'Book',
  Other: 'Other',
} as const
export type BusinessItemType = (typeof BusinessItemType)[keyof typeof BusinessItemType]

/** Human-readable label for each business item type. */
export const BusinessItemTypeLabel: Record<BusinessItemType, string> = {
  [BusinessItemType.StarterKit]: 'Starter Kit',
  [BusinessItemType.PartyKit]: 'Party Kit',
  [BusinessItemType.CustomKit]: 'Custom Kit',
  [BusinessItemType.StickerSheet]: 'Sticker Sheet',
  [BusinessItemType.Book]: 'Book',
  [BusinessItemType.Other]: 'Other',
}

/**
 * One additive sales/earnings event. Append-only — never edited to model a
 * balance, never negative. Kid-visible: no customer PII.
 *
 * Stored at `families/{familyId}/businessLog/{autoId}`.
 */
export interface BusinessLogEntry {
  id: string
  /** Child operator who logged it (Lincoln for now). */
  childId: string
  /** Dollars earned by this event. Additive — only ever climbs the meter. */
  amount: number
  /** What was sold / earned against. */
  itemType: BusinessItemType
  /** Sale date, `YYYY-MM-DD` per the repo date convention. */
  date: string
  /** Optional kid-safe note. NEVER customer PII. */
  note?: string
  /** ISO timestamp when the entry was logged. */
  createdAt: string
}

/**
 * One rung of the goal stack (e.g. "Xbox Series S", "First game", "Second
 * controller"). The stack is ordered; `threshold` is the cumulative dollars
 * needed to unlock this rung (this rung's price plus every prior rung's).
 */
export interface BusinessGoalMilestone {
  /** Stable id for ordering / reference. */
  id: string
  /** Display label, e.g. "Xbox Series S". */
  label: string
  /** Price of this single milestone in dollars. */
  price: number
  /** Cumulative dollars needed to reach this rung (this price + all prior). */
  threshold: number
}

/**
 * The Xbox + games milestone stack Lincoln (with Nathan) assembles. Progress
 * is NEVER stored here — it is derived by summing the additive `businessLog`.
 * This config holds only the target rungs and their prices.
 *
 * One config per child operator. Stored at
 * `families/{familyId}/businessGoals/{childId}`.
 */
export interface BusinessGoal {
  id: string
  /** Child this goal belongs to (the operator). */
  childId: string
  /** Ordered milestone stack. The climb toward each rung is additive. */
  milestones: BusinessGoalMilestone[]
  /** ISO timestamp of the last config edit. */
  updatedAt: string
}
