import type { ChecklistItem } from '../../core/types'

/**
 * Split a day's checklist into the kid's "must-do" quests, "choose" items, and
 * "watch" rows.
 *
 * Prefers explicit `category` tags; falls back to "first 3 are must-do" when a
 * plan predates categorization.
 *
 * **Watch rows are pulled out first, on `itemType === 'watch'` and never on
 * `category` (FEAT-134).** A planned video is optional: it is not a required
 * quest, it does not feed the Workshop unlock gate, it earns no XP, and it is
 * not one of the craft choices. Keying the bucket off `itemType` alone means a
 * hand-made row that missed `category: 'choose'` still lands in `watch` rather
 * than silently becoming a must-do — including on the uncategorized fallback
 * path, where it would otherwise be swept up by the "first 3" slice.
 */
export function categorizeItems(checklist: ChecklistItem[]): {
  mustDo: ChecklistItem[]
  choose: ChecklistItem[]
  watch: ChecklistItem[]
} {
  const watch = checklist.filter((item) => item.itemType === 'watch')
  const rest = checklist.filter((item) => item.itemType !== 'watch')

  // Probe the FULL checklist, not `rest`. Extracting watch rows must not change
  // which bucketing branch a day takes. A watch row always carries
  // `category: 'choose'`, so on a legacy uncategorized day it is the one thing
  // flipping this true — probing `rest` would drop that day into the "first 3
  // are must-do" fallback and silently reshuffle which items are quests (and
  // with them the Workshop gate). Pinned by the mixed-shape test.
  const hasCategories = checklist.some((item) => item.category)

  if (hasCategories) {
    return {
      mustDo: rest.filter(
        (item) => item.category === 'must-do' || (!item.category && item.mvdEssential),
      ),
      choose: rest.filter((item) => item.category === 'choose'),
      watch,
    }
  }

  // Fallback: first 3 items are must-do, rest are choose
  return {
    mustDo: rest.slice(0, Math.min(3, rest.length)),
    choose: rest.slice(3),
    watch,
  }
}

export interface QuestProgress {
  mustDo: ChecklistItem[]
  choose: ChecklistItem[]
  /**
   * Planned curated videos (FEAT-100/104). Optional and always available — they
   * are deliberately absent from both `mustDo` and `choose`, so they never move
   * the quest count, the Workshop gate, or the craft-selection cap.
   */
  watch: ChecklistItem[]
  /**
   * True when every must-do quest is resolved — completed or parent-skipped
   * (UX-72). A skip is not a completion (it earns nothing and advances no
   * count); it just stops blocking the day the kid can't act on.
   */
  mustDoDone: boolean
  /** Quests still open for the kid — neither completed nor parent-skipped. */
  mustDoRemaining: number
  /** Completed must-do count (drives the unlock gate). */
  mustDoCompleted: number
  /** Parent-skipped must-do count (shrinks the gate bar; never counts as done). */
  mustDoSkipped: number
  /** Quests the kid must complete to unlock Workshop/Books — capped at the *completable* count. */
  gateThreshold: number
  /** True once enough completable quests are *completed* (a skip shrinks the bar, it never fills it). */
  gateUnlocked: boolean
}

/**
 * Derive the kid quest gate + progress from a checklist.
 *
 * Skipping is a parent-only action (FUNC-08). A parent-skipped item is removed
 * from the kid's remaining/to-do set and counts as *resolved* for day
 * completion and the gate bar (UX-72) — but it is NOT a completion: it never
 * advances `mustDoCompleted`, earns no XP, and completes nothing. It only
 * stops blocking.
 */
export function computeQuestProgress(checklist: ChecklistItem[]): QuestProgress {
  const { mustDo, choose, watch } = categorizeItems(checklist)

  // UX-72: completed OR skipped resolves a quest. Requiring `completed` alone
  // made one parent skip strand the day — zero completable quests left, Craft
  // locked, celebration unreachable.
  const mustDoDone =
    mustDo.length > 0 && mustDo.every((item) => item.completed || item.skipped)
  const mustDoRemaining = mustDo.filter((item) => !item.completed && !item.skipped).length

  // Gate: enough must-do items completed unlocks Workshop and Books. The
  // threshold is computed over *completable* items, so a skip shrinks the bar
  // instead of stranding it. Edge, decided: ALL must-dos skipped → threshold 0
  // → gate unlocked. A parent who cleared the whole day chose an empty day;
  // the Workshop is not a second punishment.
  const mustDoCompleted = mustDo.filter((i) => i.completed).length
  const mustDoSkipped = mustDo.filter((i) => i.skipped).length
  const gateThreshold = Math.min(3, Math.max(0, mustDo.length - mustDoSkipped))
  const gateUnlocked = mustDoCompleted >= gateThreshold

  return {
    mustDo,
    choose,
    watch,
    mustDoDone,
    mustDoRemaining,
    mustDoCompleted,
    mustDoSkipped,
    gateThreshold,
    gateUnlocked,
  }
}

/**
 * UX-72 celebration gate: "you finished!" copy and the day-complete XP awards
 * require real work. `doneFlag` is `mustDoDone` (or `allDone`), which a parent
 * can now reach through skips alone — a day resolved by skips is *open* (Craft
 * and Workshop unlock) but never *celebrated*: no "🎉 you did it!" over zero
 * completions (UX-11's cousin; not created here).
 */
export function celebrationEarned(doneFlag: boolean, mustDoCompleted: number): boolean {
  return doneFlag && mustDoCompleted > 0
}

/**
 * The kid's "everything's done" flag — must-dos finished, plus the craft choices
 * they picked (on a Normal Day; MVD has no craft section).
 *
 * Extracted from `KidTodayView` so the one behaviour FEAT-134 changes here is
 * assertable: a planned video is **never** in `choose`, so an unwatched video
 * can no longer hold the day open. That is the intended outcome for an optional
 * item — a kid finishing every quest is not blocked by a video they skipped.
 */
export function isDayAllDone(args: {
  mustDoDone: boolean
  isMvd: boolean
  choose: ChecklistItem[]
  selectedChoiceItems: ChecklistItem[]
}): boolean {
  const { mustDoDone, isMvd, choose, selectedChoiceItems } = args
  return (
    mustDoDone &&
    (isMvd || choose.length === 0 || selectedChoiceItems.every((item) => item.completed))
  )
}
