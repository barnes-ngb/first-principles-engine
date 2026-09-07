/**
 * UX-267 — one shared duration-option list for the two curriculum dialogs
 * that set an activity's `defaultMinutes` (`AddActivityDialog`,
 * `EditRoutinesDialog`). Before this they each hand-kept an identical
 * `[10, 15, 20, 30, 45]` array — two copies of one list is the defect under
 * Shelly's request for "15 min interval[s]", not a coincidence to preserve.
 *
 * The steps are 15-minute from 15 up to 90 (home-base's proposal), plus 10
 * and 20 kept reachable because real configs already use them (Prayer is
 * 10m, TGTB LA is 20m) — a control that cannot express a value the data
 * already holds is a trap.
 */
export const CURRICULUM_DURATION_OPTIONS = [10, 15, 20, 30, 45, 60, 90] as const

/**
 * The canonical options plus `currentValue` when it isn't already one of
 * them, sorted ascending — so a dropdown can always show the value a config
 * actually holds (e.g. a hand-entered 37m) rather than silently rewriting it
 * the moment the dialog opens.
 */
export function durationOptionsWithValue(currentValue: number): number[] {
  return Array.from(new Set<number>([...CURRICULUM_DURATION_OPTIONS, currentValue])).sort(
    (a, b) => a - b,
  )
}
