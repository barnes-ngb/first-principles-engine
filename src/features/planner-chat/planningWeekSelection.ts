// ── Which week am I planning? (FEAT-196) ─────────────────────────────────────
//
// FEAT-112 taught the planner to say which week it was writing to, and gave it a
// rule for guessing: roll forward on Saturday. FEAT-196 is the admission that a
// guess is not enough. The owner hit the hole on a Friday — "I think Shelly tried
// to plan the next week on Friday" — and the honest reading of that report is not
// "the rule needs one more weekday", it is that **no weekday rule can be right for
// everyone**. Re-planning next week on a Wednesday is an ordinary thing a parent
// does, and before this module the app could not express it at all.
//
// So there are two things here, and keeping them separate is the point:
//
//   1. **The default** — still `getPlanningWeekRange`, still one definition, now
//      corrected to roll on Friday as well as Saturday. This module does not
//      restate that rule; it *reads* it (`defaultPlanningWeekChoice` asks the
//      helper which week it picked and reports the matching choice), so the
//      selector's default and the helper can never drift apart.
//   2. **The choice** — an explicit This week / Next week, each labelled with the
//      real Mon–Fri dates it writes to, which overrides the default.
//
// ── Why exactly two options ──────────────────────────────────────────────────
// The horizon stops at next week, deliberately and for the third time in this
// codebase (FEAT-149's `plannableWatchDayKeys`, FEAT-150's `nextWeekDayKeys`).
// Widening it is an owner decision, not a default.
//
// ── Why a past week is shown, disabled, rather than hidden ───────────────────
// On a Saturday the containing week's Mon–Fri is entirely behind us. Dropping the
// option would leave a one-choice "selector" that silently answers a question the
// parent can see is a question. Showing it struck through, with the reason, says
// what the app knows: that week has passed. `resolvePlanningWeek` refuses to
// return a disabled option even if one is passed in, so the UI's disabled state
// and the resolved week cannot disagree.

import { formatDateYmd } from '../../core/utils/format'
import { getPlanningWeekRange, getWeekRange, type WeekRange } from '../../core/utils/time'
import { formatPlanningWeekLabel, isPlanningWeekPast } from './chatPlanner.logic'

/**
 * Which of the two plannable weeks the parent means.
 *
 * `'this'` is the Sun–Sat week containing today; `'next'` is the one after it.
 * Named by their relationship to today rather than by a stored date so a tab left
 * open across midnight re-resolves instead of quietly meaning something else —
 * the same reason `isNextWeekStart` is a function of the clock (FEAT-150).
 */
export type PlanningWeekChoice = 'this' | 'next'

export const PLANNING_WEEK_CHOICES = ['this', 'next'] as const

/** The Sun–Sat week containing `now`, shifted forward by `weeks` whole weeks. */
function shiftWeekRange(base: WeekRange, weeks: number): WeekRange {
  const start = new Date(`${base.start}T00:00:00`)
  start.setDate(start.getDate() + weeks * 7)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start: formatDateYmd(start), end: formatDateYmd(end) }
}

/** The Sunday-start key each choice targets, as of `now`. */
export function planningWeekRangeFor(
  choice: PlanningWeekChoice,
  now: Date = new Date(),
): WeekRange {
  const containing = getWeekRange(now)
  return choice === 'this' ? containing : shiftWeekRange(containing, 1)
}

/**
 * The choice the app makes when the parent has not said.
 *
 * **Derived from `getPlanningWeekRange`, never a second copy of its weekday
 * rule.** That helper owns "which week does an unprompted parent mean"; this
 * function only translates its answer into the selector's vocabulary. Move the
 * roll day there and the selector's default moves with it, with nothing to keep
 * in sync.
 */
export function defaultPlanningWeekChoice(now: Date = new Date()): PlanningWeekChoice {
  return getPlanningWeekRange(now).start === getWeekRange(now).start ? 'this' : 'next'
}

export interface PlanningWeekOption {
  choice: PlanningWeekChoice
  range: WeekRange
  /** The short toggle label — "This week" / "Next week". */
  label: string
  /** The dates it actually writes to — "Week of Sep 7–11". Never a bare key. */
  dateLabel: string
  /** The same dates without the prefix — "Sep 7–11", for a tight toggle. */
  dates: string
  /** True when the Mon–Fri body has fully passed (Saturday's "this week"). */
  disabled: boolean
  /** Plain-language reason, present exactly when `disabled`. */
  disabledReason?: string
}

const CHOICE_LABELS: Record<PlanningWeekChoice, string> = {
  this: 'This week',
  next: 'Next week',
}

/**
 * Both options, in order, as of `now`.
 *
 * The past check reuses the planner's own `isPlanningWeekPast` — the same
 * predicate Apply and Redo already guard on — so the option the selector greys
 * out is precisely the one Apply would refuse.
 */
export function planningWeekOptions(now: Date = new Date()): PlanningWeekOption[] {
  const todayKey = formatDateYmd(now)
  return PLANNING_WEEK_CHOICES.map((choice) => {
    const range = planningWeekRangeFor(choice, now)
    const past = isPlanningWeekPast(range.start, todayKey)
    return {
      choice,
      range,
      label: CHOICE_LABELS[choice],
      dateLabel: formatPlanningWeekLabel(range.start),
      dates: planningWeekDates(range.start),
      disabled: past,
      ...(past ? { disabledReason: 'Already passed' } : {}),
    }
  })
}

export interface ResolvedPlanningWeek {
  /** The choice actually in force — the explicit one, or the default. */
  choice: PlanningWeekChoice
  range: WeekRange
  options: PlanningWeekOption[]
  /** True when an explicit choice was dropped because its week has passed. */
  fellBackFromPast: boolean
}

/**
 * Resolve the week being planned: the parent's explicit choice if they made one
 * and it is still plannable, otherwise the corrected default.
 *
 * `explicit` is `null` while the parent has said nothing, and that is not the
 * same as "they chose the default": an untouched selector should keep tracking
 * the clock, so a tab opened on Thursday and used on Friday moves to next week
 * on its own, exactly as FEAT-112's live `weekRange` memo already did.
 *
 * The fall-back branch is the Saturday case, and it fails *toward* the plannable
 * week rather than handing back a dead one — an explicit `'this'` made on Friday
 * is not honoured after midnight, when its Mon–Fri is gone.
 */
export function resolvePlanningWeek(
  explicit: PlanningWeekChoice | null,
  now: Date = new Date(),
): ResolvedPlanningWeek {
  const options = planningWeekOptions(now)
  const requested = explicit ? options.find((o) => o.choice === explicit) : undefined
  const fellBackFromPast = !!requested?.disabled
  const choice = requested && !requested.disabled ? requested.choice : defaultPlanningWeekChoice(now)
  const resolved = options.find((o) => o.choice === choice)
  return {
    choice,
    range: resolved ? resolved.range : planningWeekRangeFor(choice, now),
    options,
    fellBackFromPast,
  }
}

/**
 * The FEAT-196 stale-week rail, as a pure predicate.
 *
 * A planner tab is rarely closed (it is a phone-first surface), so a draft can sit
 * on screen across a week boundary. When it does, the card still says "Next week —
 * Sep 14–18" while `'next'` has come to mean Sep 21–25, and applying would write
 * a week the parent never read. Returns true when the choice still resolves to
 * the week the card was built for.
 *
 * This is the same shape as `isNextWeekStart` (FEAT-150) and for the same reason:
 * the answer must be recomputed at the moment of the write, never carried along
 * with the draft.
 */
export function planningWeekStillMatches(
  choice: PlanningWeekChoice,
  weekStart: string,
  now: Date = new Date(),
): boolean {
  return planningWeekRangeFor(choice, now).start === weekStart
}

/**
 * What Apply says when the week moved out from under a draft. Names the week the
 * card promised, so the parent can tell which one was refused — and states
 * plainly that nothing was written, the FEAT-135 rule for a refused write.
 */
export function staleWeekNotice(weekStart: string): string {
  const label = formatPlanningWeekLabel(weekStart)
  return `The week rolled over while this plan was on screen, so it no longer targets ${label || 'the week it was drafted for'} — nothing was written. Pick the week you want and apply again.`
}

/**
 * Just the dates of a planning week — "Sep 7–11".
 *
 * `formatPlanningWeekLabel` minus its "Week of " prefix, taken from that one
 * formatter rather than computed again, so a label change lands everywhere at
 * once. Empty for an unparseable start, which both callers below check.
 */
export function planningWeekDates(weekStart: string): string {
  return formatPlanningWeekLabel(weekStart).replace(/^Week of /, '')
}

/**
 * The Apply button's label — "Apply to Sep 7–11".
 *
 * The biggest write in the app used to be labelled "Apply This Week's Plan": a
 * possessive standing in for a date, on the one control whose target a parent
 * most needs to check (the standing complaint `nextWeekActions.ts:199` records).
 * An unparseable start falls back to wording with no range in it rather than an
 * empty one.
 */
export function applyButtonLabel(weekStart: string): string {
  const dates = planningWeekDates(weekStart)
  return dates ? `Apply to ${dates}` : 'Apply this plan'
}

/**
 * The confirmation after the write — "Plan applied to Sep 7–11. It's on Today."
 *
 * The same dates the button carried, said back. A parent who tapped the wrong
 * week finds out here rather than on Monday morning, and UX-63's rule holds:
 * Today is where it lands, because there is no "Week" page to point at.
 */
export function appliedConfirmation(weekStart: string): string {
  const dates = planningWeekDates(weekStart)
  return dates ? `Plan applied to ${dates}. It's on Today.` : "Plan applied! It's on Today."
}
