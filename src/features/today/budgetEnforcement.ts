import type { ChecklistItem } from '../../core/types'

/** Allow ~10% overrun above the stated budget before trimming kicks in. */
const BUDGET_GRACE_RATIO = 0.1

/** Priority tiers for budget trimming. Lower number = more protected. */
const Priority = {
  MustDo: 1,
  Rolled: 2,
  Choose: 3,
  Focus: 4,
} as const
type Priority = (typeof Priority)[keyof typeof Priority]

export interface BudgetEnforcementResult {
  /** The checklist with `deferredByBudget: true` applied to overflow items. */
  checklist: ChecklistItem[]
  /** Minutes of all items (including deferred) after enforcement. */
  totalMinutes: number
  /** Minutes of items that remain active (not deferred). */
  activeMinutes: number
  /** Number of items marked deferredByBudget by this pass. */
  deferredCount: number
  /** Resolved budget (minutes) used for enforcement. */
  budgetMinutes: number
}

function itemMinutes(item: ChecklistItem): number {
  return item.plannedMinutes ?? item.estimatedMinutes ?? 0
}

function priorityOf(item: ChecklistItem): Priority {
  if (item.category === 'must-do' || item.mvdEssential) return Priority.MustDo
  if (item.rolledOver) return Priority.Rolled
  if (item.aspirational) return Priority.Focus
  return Priority.Choose
}

/**
 * Trim a checklist to fit within the daily time budget.
 *
 * Protection order (most → least protected):
 *   1. Must-Do items (category='must-do' or mvdEssential) — never deferred
 *   2. Rolled items (represent actual unfinished work)
 *   3. Choose items (new discretionary work for today)
 *   4. Focus / aspirational items (lowest priority, deferred first)
 *
 * Items whose `deferredByBudget` was set by a previous pass are cleared first
 * so enforcement is idempotent across re-runs.
 *
 * Budget grace: allows ~10% above the stated budget to avoid thrashing on
 * items that just barely overshoot (186m budget → 205m effective ceiling).
 */
export function enforceDailyBudget(
  checklist: ChecklistItem[],
  budgetMinutes: number,
): BudgetEnforcementResult {
  // Clear prior deferredByBudget flags so we start from a known state.
  const fresh = checklist.map((item) =>
    item.deferredByBudget ? { ...item, deferredByBudget: undefined } : item,
  )

  const totalMinutes = fresh.reduce((sum, item) => sum + itemMinutes(item), 0)
  const effectiveBudget = Math.ceil(budgetMinutes * (1 + BUDGET_GRACE_RATIO))

  if (budgetMinutes <= 0 || totalMinutes <= effectiveBudget) {
    return {
      checklist: fresh,
      totalMinutes,
      activeMinutes: totalMinutes,
      deferredCount: 0,
      budgetMinutes,
    }
  }

  // Select items to defer, preferring lowest-priority and longest within a tier.
  const indexed = fresh.map((item, index) => ({
    item,
    index,
    priority: priorityOf(item),
    minutes: itemMinutes(item),
  }))
  const removalOrder = [...indexed].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority
    return b.minutes - a.minutes
  })

  const deferredIndices = new Set<number>()
  let runningTotal = totalMinutes

  for (const entry of removalOrder) {
    if (runningTotal <= effectiveBudget) break
    if (entry.priority === Priority.MustDo) break
    if (entry.minutes <= 0) continue
    deferredIndices.add(entry.index)
    runningTotal -= entry.minutes
  }

  const result: ChecklistItem[] = fresh.map((item, i) =>
    deferredIndices.has(i) ? { ...item, deferredByBudget: true } : item,
  )

  const activeMinutes = result
    .filter((item) => !item.deferredByBudget)
    .reduce((sum, item) => sum + itemMinutes(item), 0)

  return {
    checklist: result,
    totalMinutes,
    activeMinutes,
    deferredCount: deferredIndices.size,
    budgetMinutes,
  }
}

/**
 * Resolve the effective budget for a given day, honoring MVD/overwhelmed energy.
 * Returns 0 when the day has no budget configured (callers should skip enforcement).
 */
export function resolveDailyBudget(
  dailyBudgetMinutes: number | undefined,
  options: { planType?: 'normal' | 'mvd'; energy?: string } = {},
): number {
  if (!dailyBudgetMinutes || dailyBudgetMinutes <= 0) return 0
  const { planType, energy } = options
  const shouldHalve = planType === 'mvd' || energy === 'low' || energy === 'overwhelmed'
  return shouldHalve ? Math.ceil(dailyBudgetMinutes / 2) : dailyBudgetMinutes
}
