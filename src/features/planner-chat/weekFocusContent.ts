import type { WeekPlan } from '../../core/types'

/**
 * Does this week actually have a Stonebridge focus to show? (UX-234)
 *
 * `WeekFocusPanel` gates every block it renders on `theme` or `conundrum`, so
 * those two ARE its content. When neither is set the card used to render its
 * heading — a bordered box announcing *"This Week in Stonebridge"* — over white
 * space, which is the FEAT-204 / UX-219 defect ("a heading over nothing is worse
 * than nothing") on a third surface. The panel's own `weekPlan &&` gate at the
 * call site could not catch it: a `WeekPlan` document exists for every applied
 * week whether or not the generator gave it a theme.
 *
 * Pure and separate from the component so the rule is testable and has one
 * definition. `theme` is trimmed because the manual-edit accordion writes
 * whatever is typed, and a field cleared to spaces is a field cleared.
 */
export function weekFocusPanelHasContent(weekPlan: WeekPlan): boolean {
  return !!weekPlan.theme?.trim() || !!weekPlan.conundrum
}
