/**
 * Which week am I reviewing? — Last week / This week (UX-406).
 *
 * Owner, Friday 2026-09-11, 8:30pm, looking at Review → Week for Lincoln: *"the
 * days here isn't updated — I added time in artefacts and it didn't change it
 * for packing and independent play."* The time he added was real and the fold
 * counted it. The page was showing **the week before the one he had just
 * logged**, and there was no control to move.
 *
 * `lastCompletedSchoolWeekKey` (UX-218) names the most recent school week whose
 * **Mon–Fri body has ended** — the containing week on a Saturday, the previous
 * one on every other day. That is a good default and a correct one: on a Sunday
 * morning, which is when this page is opened to plan, the week you mean is the
 * one that just finished. What it cannot express is a parent standing in the
 * middle of a week wanting to see the week she is in.
 *
 * **This is FEAT-196's lesson, one surface over**, and it is now the third time
 * the same conclusion has been reached in this codebase: the planner rolled its
 * default forward on Friday, the owner hit the hole anyway, and the fix was not
 * one more weekday in the rule but **an explicit selector next to the default**
 * (owner decision 2026-09-05: *"week selector, not a better guess"*). The
 * weekly review kept only the guess.
 *
 * So there are two things here, kept apart exactly as `planningWeekSelection.ts`
 * keeps them:
 *
 *   1. **The default** — still `lastCompletedSchoolWeekKey`, still one
 *      definition, and this module does not restate its weekday rule. It *reads*
 *      it: {@link defaultReviewWeekChoice} asks the helper which week it picked
 *      and reports the matching choice, so the selector's default and the helper
 *      cannot drift, and the page still reads the document the cron writes on a
 *      Sunday morning without anybody tapping anything.
 *   2. **The choice** — an explicit Last week / This week, each labelled with the
 *      real Mon–Fri dates it reads, which overrides the default.
 *
 * ── Why exactly two options, and why no third ────────────────────────────────
 *
 * The horizon stops at the containing week in one direction and one week back in
 * the other, for the same reason the planner's stops at next week: widening it is
 * an owner decision, not a default. A week further back is a different feature —
 * a history — and `useWeeklyReviewHistory` already reads the earlier documents
 * for the coverage rate, so the shape exists if it is ever wanted.
 *
 * ── Why a week in progress is offered rather than greyed out ─────────────────
 *
 * The planner greys out a week whose Mon–Fri has entirely passed, because
 * planning it would write to days that are gone. The review's asymmetry is the
 * opposite: **there is nothing wrong with reading a week that has not finished**
 * — the hours, the completed items and the evidence are all folded live from the
 * records as they stand, which is precisely what the owner wanted to see. What
 * is *not* there yet is the cron's overnight snapshot, and the page already has
 * a sentence for that (`POSITIONS_PENDING_LINE`). So the in-progress week is
 * offered, marked **in progress**, and nothing on it claims to be final.
 *
 * The "is this week finished" question is answered by the planner's own
 * `isPlanningWeekPast` — the same predicate the planner greys an option out with
 * — rather than by a fourth copy of the weekday arithmetic. A week is *in
 * progress* exactly when its Friday is today or still ahead.
 *
 * Pure: no React, no Firestore, no module-level clock. Every function takes
 * `now`, so the page can resolve it once at mount and the selector, the default
 * and the resolved key cannot disagree about what day it is.
 */

import { formatDateYmd } from '../../core/utils/format'
import { getWeekRange, lastCompletedSchoolWeekKey } from '../../core/utils/time'
import { formatPlanningWeekLabel, isPlanningWeekPast } from '../planner-chat/chatPlanner.logic'
import { planningWeekDates } from '../planner-chat/planningWeekSelection'

/**
 * Which of the two readable weeks the parent means.
 *
 * `'this'` is the Sun–Sat week containing today; `'last'` is the one before it.
 * Named by their relationship to today rather than by a stored date, so a tab
 * left open across midnight re-resolves instead of quietly meaning something
 * else — `PlanningWeekChoice`'s rule, for its reason.
 */
export type ReviewWeekChoice = 'this' | 'last'

/** Chronological, so the toggle reads left-to-right as earlier-to-later. */
export const REVIEW_WEEK_CHOICES = ['last', 'this'] as const

/** The Sun–Sat week containing `now`, shifted back by `weeks` whole weeks. */
function shiftWeekStart(start: string, weeks: number): string {
  const d = new Date(`${start}T00:00:00`)
  d.setDate(d.getDate() + weeks * 7)
  return formatDateYmd(d)
}

/** The Sunday-start key each choice reads, as of `now`. */
export function reviewWeekKeyFor(
  choice: ReviewWeekChoice,
  now: Date = new Date(),
): string {
  const containing = getWeekRange(now).start
  return choice === 'this' ? containing : shiftWeekStart(containing, -1)
}

/**
 * The choice the page makes when the parent has not said.
 *
 * **Derived from `lastCompletedSchoolWeekKey`, never a second copy of its
 * weekday rule.** That helper owns "which week does an unprompted parent mean";
 * this function only translates its answer into the selector's vocabulary. Move
 * the roll day there and the default moves with it, with nothing to keep in
 * sync — `defaultPlanningWeekChoice`'s construction, for its reason.
 *
 * **Saturday is the only day the default is `'this'`**, and that is the helper's
 * rule rather than a choice made here: Saturday is the one day on which the
 * containing Sun–Sat week's whole Mon–Fri body is behind us. On a Sunday the
 * containing week is the one about to start, so the just-finished school week is
 * the previous Sun–Sat week and the default is `'last'` — which is exactly what
 * a parent opening this page on a Sunday morning to plan means, and is why the
 * page still reads the document the cron wrote overnight without anybody tapping
 * anything. Monday–Friday is the same answer for the same reason.
 *
 * (The consequence for the *other* option is worth stating rather than
 * discovering: on a Sunday, `'this'` names a week whose Monday has not happened,
 * so it reads as empty. That is true rather than broken, it carries the
 * in-progress note, and every sentence on the page for an empty week is already
 * honest — {@link WEEK_BY_SUBJECT_EMPTY_LINE}, *"No hours logged this week."*)
 *
 * The fallback is defensive only: the helper returns one of the two keys by
 * construction, and a future change to it that returned a third would land on
 * `'last'` rather than crashing the page.
 */
export function defaultReviewWeekChoice(now: Date = new Date()): ReviewWeekChoice {
  return lastCompletedSchoolWeekKey(now) === reviewWeekKeyFor('this', now) ? 'this' : 'last'
}

export interface ReviewWeekOption {
  choice: ReviewWeekChoice
  /** The Sunday-start key this option reads — the `weeklyReviews` doc id half. */
  weekKey: string
  /** The short toggle label — "Last week" / "This week". */
  label: string
  /** The days it actually reads — "Week of Sep 7–11". Never a bare key. */
  dateLabel: string
  /** The same days without the prefix — "Sep 7–11", for a tight toggle. */
  dates: string
  /** True while the week's Friday is today or still ahead. */
  inProgress: boolean
  /** Plain-language note, present exactly when `inProgress`. */
  note?: string
}

const CHOICE_LABELS: Record<ReviewWeekChoice, string> = {
  last: 'Last week',
  this: 'This week',
}

/** What an unfinished week says on its own chip. Never a warning, never a gate. */
export const IN_PROGRESS_NOTE = 'in progress'

/**
 * Both options, in order, as of `now`.
 *
 * The in-progress check reuses the planner's own `isPlanningWeekPast` — the
 * predicate that decides whether a week's Mon–Fri body is entirely behind us —
 * so the two neighbouring surfaces answer "is this week over" the same way. It
 * is the negation here because the review's interest is the opposite of the
 * planner's: the planner refuses a week that is over, and the review flags a
 * week that is not.
 */
export function reviewWeekOptions(now: Date = new Date()): ReviewWeekOption[] {
  const todayKey = formatDateYmd(now)
  return REVIEW_WEEK_CHOICES.map((choice) => {
    const weekKey = reviewWeekKeyFor(choice, now)
    const inProgress = !isPlanningWeekPast(weekKey, todayKey)
    return {
      choice,
      weekKey,
      label: CHOICE_LABELS[choice],
      dateLabel: formatPlanningWeekLabel(weekKey),
      dates: planningWeekDates(weekKey),
      inProgress,
      ...(inProgress ? { note: IN_PROGRESS_NOTE } : {}),
    }
  })
}

export interface ResolvedReviewWeek {
  /** The choice actually in force — the explicit one, or the default. */
  choice: ReviewWeekChoice
  weekKey: string
  options: ReviewWeekOption[]
}

/**
 * Resolve the week being read: the parent's explicit choice if she made one,
 * otherwise the default.
 *
 * `explicit` is `null` while she has said nothing, and that is not the same as
 * "she chose the default": an untouched selector should keep tracking the clock,
 * so a tab opened on Friday and revisited on Saturday resolves to the
 * just-finished week on its own. (What it does *not* do is re-render itself to
 * say so — `WeeklyReviewPage` resolves `now` once at mount, deliberately and for
 * the reason its own comment records. The residual is the same one UX-218 left
 * and stated: a tab left open across the Fri→Sat boundary still names the older
 * week until it is reloaded. The difference this module makes is that there is
 * now a control to move.)
 *
 * Unlike the planner's resolver there is nothing to refuse: neither week can be
 * un-readable, because reading a week writes nothing and an absent document is a
 * state the page already renders honestly.
 */
export function resolveReviewWeek(
  explicit: ReviewWeekChoice | null,
  now: Date = new Date(),
): ResolvedReviewWeek {
  const options = reviewWeekOptions(now)
  const choice = explicit ?? defaultReviewWeekChoice(now)
  const resolved = options.find((o) => o.choice === choice)
  return {
    choice,
    weekKey: resolved ? resolved.weekKey : reviewWeekKeyFor(choice, now),
    options,
  }
}
