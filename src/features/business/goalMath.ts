import type { BusinessGoalMilestone } from '../../core/types/business'

/**
 * Goal-stack math for the Barnes Bros additive thermometer (FEAT-30 chunk 3).
 *
 * Two pure jobs, both load-bearing for the pedagogy:
 *   1. `withCumulativeThresholds` — turn an ordered stack of priced milestones
 *      into cumulative unlock thresholds (rung N unlocks at the sum of every
 *      price through N). This is the budgeting math made visible in the builder.
 *   2. `computeGoalProgress` — given the derived money-in total, decide which
 *      rungs are COLLECTED (passed and staying lit) and which is NEXT, plus the
 *      dollars to that next unlock.
 *
 * The mechanics carry the message: progress is framed as what's collected + the
 * next unlock, never as a percentage or a deficit. The total only ever climbs,
 * so a collected rung can never un-collect.
 */

/** A single priced rung the math operates on (label optional for the math). */
export interface PricedMilestone {
  price: number
}

/** Floor a price defensively: non-finite or negative reads as $0, never below. */
function safePrice(price: number): number {
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return 0
  return price
}

/**
 * Stamp each milestone with the cumulative dollars needed to unlock it (its own
 * price plus every prior rung's). Input order is the climb order.
 */
export function withCumulativeThresholds<T extends PricedMilestone>(
  milestones: readonly T[],
): Array<T & { threshold: number }> {
  let running = 0
  return milestones.map((m) => {
    running += safePrice(m.price)
    return { ...m, threshold: running }
  })
}

/** Total dollars to collect the whole stack (the final cumulative threshold). */
export function goalStackTotal(milestones: readonly PricedMilestone[]): number {
  return milestones.reduce((sum, m) => sum + safePrice(m.price), 0)
}

/** One rung as the thermometer sees it: its threshold + whether it's collected. */
export interface MilestoneProgress extends BusinessGoalMilestone {
  /** Cumulative dollars to unlock this rung (recomputed — never trusts stored). */
  threshold: number
  /** True once the money-in total has reached this rung. Stays true (additive). */
  collected: boolean
  /** True for the single next-up rung the meter is climbing toward. */
  isNext: boolean
}

export interface GoalProgress {
  /** Every rung, in climb order, with recomputed threshold + collected/next. */
  milestones: MilestoneProgress[]
  /** How many rungs the total has collected. */
  collectedCount: number
  /** Index of the next rung to unlock, or `null` when all are collected. */
  nextIndex: number | null
  /** Dollars remaining to the next unlock, or `null` when all are collected. */
  amountToNext: number | null
  /** Full-stack cost (sum of all prices). */
  stackTotal: number
  /** True once every rung is collected. */
  allUnlocked: boolean
}

/**
 * Resolve the additive thermometer's state for a money-in `total`.
 *
 * A rung is collected when `total >= its cumulative threshold`. The next rung is
 * the first uncollected one; `amountToNext` is the (non-negative) gap to it.
 * When the stack is empty, nothing is next and nothing is unlocked.
 */
export function computeGoalProgress(
  milestones: readonly BusinessGoalMilestone[],
  total: number,
): GoalProgress {
  const safeTotal = safePrice(total)
  const stamped = withCumulativeThresholds(milestones)

  const nextIndex = stamped.findIndex((m) => safeTotal < m.threshold)
  const hasNext = nextIndex !== -1

  const progress: MilestoneProgress[] = stamped.map((m, i) => ({
    ...m,
    collected: safeTotal >= m.threshold,
    isNext: hasNext && i === nextIndex,
  }))

  const collectedCount = progress.filter((m) => m.collected).length
  const allUnlocked = stamped.length > 0 && !hasNext
  const amountToNext = hasNext
    ? Math.max(0, stamped[nextIndex].threshold - safeTotal)
    : null

  return {
    milestones: progress,
    collectedCount,
    nextIndex: hasNext ? nextIndex : null,
    amountToNext,
    stackTotal: goalStackTotal(milestones),
    allUnlocked,
  }
}
