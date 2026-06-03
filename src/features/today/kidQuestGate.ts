import type { ChecklistItem } from '../../core/types'

/**
 * Split a day's checklist into the kid's "must-do" quests and "choose" items.
 *
 * Prefers explicit `category` tags; falls back to "first 3 are must-do" when a
 * plan predates categorization.
 */
export function categorizeItems(checklist: ChecklistItem[]): {
  mustDo: ChecklistItem[]
  choose: ChecklistItem[]
} {
  const hasCategories = checklist.some((item) => item.category)

  if (hasCategories) {
    return {
      mustDo: checklist.filter(
        (item) => item.category === 'must-do' || (!item.category && item.mvdEssential),
      ),
      choose: checklist.filter((item) => item.category === 'choose'),
    }
  }

  // Fallback: first 3 items are must-do, rest are choose
  return {
    mustDo: checklist.slice(0, Math.min(3, checklist.length)),
    choose: checklist.slice(3),
  }
}

export interface QuestProgress {
  mustDo: ChecklistItem[]
  choose: ChecklistItem[]
  /** True when every must-do quest is completed (skips do NOT count). */
  mustDoDone: boolean
  /** Quests still open for the kid — neither completed nor parent-skipped. */
  mustDoRemaining: number
  /** Completed must-do count (drives the unlock gate). */
  mustDoCompleted: number
  /** Parent-skipped must-do count (shown, but never counts toward the gate). */
  mustDoSkipped: number
  /** Quests the kid must complete to unlock Workshop/Books. */
  gateThreshold: number
  /** True once enough quests are *completed* (skips never unlock the gate). */
  gateUnlocked: boolean
}

/**
 * Derive the kid quest gate + progress from a checklist.
 *
 * Skipping is a parent-only action (FUNC-08). A parent-skipped item is removed
 * from the kid's remaining/to-do set but is NOT treated as completed: it never
 * advances the unlock gate, the "X of N done" count, or day completion.
 */
export function computeQuestProgress(checklist: ChecklistItem[]): QuestProgress {
  const { mustDo, choose } = categorizeItems(checklist)

  const mustDoDone = mustDo.length > 0 && mustDo.every((item) => item.completed)
  const mustDoRemaining = mustDo.filter((item) => !item.completed && !item.skipped).length

  // Gate: 3+ must-do items completed unlocks Workshop and Books
  const mustDoCompleted = mustDo.filter((i) => i.completed).length
  const mustDoSkipped = mustDo.filter((i) => i.skipped).length
  const gateThreshold = Math.min(3, mustDo.length)
  const gateUnlocked = mustDoCompleted >= gateThreshold

  return {
    mustDo,
    choose,
    mustDoDone,
    mustDoRemaining,
    mustDoCompleted,
    mustDoSkipped,
    gateThreshold,
    gateUnlocked,
  }
}
