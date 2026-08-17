// ── Next-week draft: which week, who may, and what the cards say (FEAT-150) ──
//
// The pure half of "make next week lighter, math every day but short". It owns
// three questions and nothing else, so all three are testable without Firestore,
// without a network, and — because every function takes its clock as an
// argument — without waiting for a Tuesday:
//
//   1. **Which week is "next week"?** One definition, used by the generator, by
//      the card, and again by the writer.
//   2. **May this be proposed at all?** The capability gate, and the reasons a
//      proposal is dropped, in sentences a parent reads.
//   3. **What do the two cards say?** Including the one thing the apply card
//      must not leave unsaid: what happens to work already on those days.
//
// It is the direct sibling of `dayItemActions` (FEAT-142), `curriculumActions`
// (FEAT-143) and `watchActions` (FEAT-149), and it writes nothing.

import type { ChatAction } from '../../core/types'
import { formatDateYmd } from '../../core/utils/format'
import { currentWeekDayKeys } from './useChatWeekDays'

/** The kind, narrowed off the `ChatAction` union. */
export type DraftNextWeekAction = Extract<ChatAction, { kind: 'draftNextWeek' }>

export const isDraftNextWeekAction = (
  action: ChatAction,
): action is DraftNextWeekAction => action.kind === 'draftNextWeek'

/** One weekday of the drafted week. */
export interface NextWeekDay {
  /** `YYYY-MM-DD`. */
  dateKey: string
  /** How a card says it out loud — "Monday". Never a raw date. */
  label: string
}

/** Shift a `YYYY-MM-DD` key by whole days, as pure calendar arithmetic. */
function shiftDateKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * The five weekdays of the NEXT school week.
 *
 * Built by shifting {@link currentWeekDayKeys} seven days — the same
 * construction `plannableWatchDayKeys` uses, and for the same reason: both
 * windows come from ONE definition of "which week is it right now", including
 * its Sunday-belongs-to-the-week-that-is-ending behaviour. A second Monday
 * calculation here would be a second thing to keep in agreement with the
 * planner, the week ribbon and the Cloud Function.
 *
 * On a Saturday or Sunday the current week is already behind, so "next week" is
 * the Mon–Fri that starts tomorrow-or-Monday — which is exactly what a parent
 * planning on a weekend means, and exactly the week `getPlanningWeekRange`
 * targets. On a weekday it is genuinely the week after the live one.
 *
 * Deliberately **not** widened to a horizon: the week after next is not
 * reachable from here, from the grammar, or from the writer. A longer horizon is
 * an owner decision, not a default (the same line FEAT-149 held).
 */
export function nextWeekDayKeys(now: Date = new Date()): NextWeekDay[] {
  return currentWeekDayKeys(now).map((d) => ({
    dateKey: shiftDateKey(d.dateKey, 7),
    label: d.label,
  }))
}

/**
 * The Sunday-start week key Apply writes against, for the next school week.
 *
 * `dateKeyForDayPlan` treats `weekStart` as the **Sunday** before Monday (the
 * planner's `weekRange.start` convention), so this is next week's Monday minus
 * one day. Deriving it from {@link nextWeekDayKeys} rather than computing a
 * second Sunday keeps the two in lockstep — if the week window ever moves, the
 * write target moves with it instead of silently disagreeing by a day.
 */
export function nextWeekStartKey(now: Date = new Date()): string {
  return shiftDateKey(nextWeekDayKeys(now)[0].dateKey, -1)
}

/**
 * Whether `weekStart` still names the next school week, as of `now`.
 *
 * The rail this whole lane hangs on, and the reason it is a function of the
 * clock rather than a stored value: a chat page left open across a
 * Sunday→Monday rollover holds a draft generated for a week that has since
 * become the CURRENT one. Writing it then would reshape a week the family is
 * already working through — days they may have completed work on — which is
 * precisely what the planner and FEAT-142's live-day edits exist to own.
 *
 * So the answer is recomputed at the moment it matters: at stage, at render, and
 * again inside the writer. A stale card fails closed with a reason rather than
 * writing to the wrong week.
 */
export function isNextWeekStart(weekStart: string, now: Date = new Date()): boolean {
  return weekStart === nextWeekStartKey(now)
}

/**
 * How the week reads on a card: "Aug 24–28". Never a bare `YYYY-MM-DD` — a date
 * key is not something a parent can check a proposal against at a glance.
 */
export function formatNextWeekLabel(days: NextWeekDay[]): string {
  const first = new Date(`${days[0].dateKey}T00:00:00Z`)
  const last = new Date(`${days[days.length - 1].dateKey}T00:00:00Z`)
  const month = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const day = (d: Date) => d.getUTCDate()
  return month(first) === month(last)
    ? `${month(first)} ${day(first)}–${day(last)}`
    : `${month(first)} ${day(first)} – ${month(last)} ${day(last)}`
}

// ── Gates ────────────────────────────────────────────────────────────────────

export type DraftNextWeekResolution =
  | { ok: true; days: NextWeekDay[]; weekStart: string }
  | { ok: false; notice: string }

/**
 * Plain-language refusals, shown in the card's place.
 *
 * FEAT-135's lesson, and this slice is the most exposed to it of any: the
 * model's prose signs off with "confirm with a tap", and the tap it is promising
 * here is the one that reshapes a whole week. A silently dropped proposal leaves
 * the app promising the biggest card it has and rendering nothing.
 */
export const NEXT_WEEK_NOTICES = {
  notPermitted:
    'Planning a week is something a grown-up does — nothing was drafted and nothing was changed.',
  noChild:
    "I need to know which boy this week is for. Open his tab and ask again — nothing was drafted.",
  weekMoved:
    "The week rolled over while that was on screen, so that draft is for a week that has already started — nothing was written. Ask again and I'll draft the new next week.",
} as const

/**
 * Resolve a proposed `draftNextWeek` against the capability and the clock.
 *
 * `canEdit` is a required argument, not an ambient assumption — `/chat` sits
 * outside `RequireParent`, so a kid profile can reach it by URL. The write layer
 * states the gate too; neither layer trusts the other (FEAT-133's lesson).
 */
export function resolveDraftNextWeek(
  action: DraftNextWeekAction,
  canEdit: boolean,
  now: Date = new Date(),
): DraftNextWeekResolution {
  if (!canEdit) return { ok: false, notice: NEXT_WEEK_NOTICES.notPermitted }
  if (!action.childId) return { ok: false, notice: NEXT_WEEK_NOTICES.noChild }
  return { ok: true, days: nextWeekDayKeys(now), weekStart: nextWeekStartKey(now) }
}

// ── Card wording ─────────────────────────────────────────────────────────────

/**
 * The first card's one-line preview. Names the child, the week in words, and —
 * critically — quotes the instructions back, because the parent is about to
 * spend a generation on the model's reading of what they said.
 */
export function describeDraftNextWeek(
  action: DraftNextWeekAction,
  childName: string,
  weekLabel: string,
): string {
  return `Draft next week (${weekLabel}) for ${childName} around: "${action.instructions}"`
}

/**
 * The line under the first card. Says plainly that this tap does NOT write a
 * week — the single most important thing about it, since the parent's mental
 * model of "confirm" everywhere else in this chat is "and it's done".
 */
export const DRAFT_FOOTNOTE =
  'This writes nothing. It drafts a week you can read in full here, and then you decide whether to apply it.'

/**
 * What Apply does to work already on those days, in the parent's own terms.
 *
 * This is the apply card's load-bearing sentence, and it is stated as three
 * separate promises rather than one summary because they are three separate
 * rules in `applyReset.ts` and a parent asked to approve a week deserves to
 * check them individually. They are ordered by what she would worry about
 * first: her boys' finished work, then her own additions, then what actually
 * changes.
 */
export const APPLY_RETAIN_RULES = [
  'Anything already finished on those days stays, along with its minutes and photos.',
  'Anything you added by hand stays.',
  'Unfinished leftovers from an earlier plan are cleared and replaced by this one.',
] as const

/** The apply card's one-line preview. */
export function describeApplyNextWeek(childName: string, weekLabel: string): string {
  return `Apply this plan to ${childName}'s next week (${weekLabel})`
}

/**
 * The honest report for an apply that failed partway through a week.
 *
 * FEAT-138's rule, applied at week scale: state what IS written rather than
 * rolling back blind. A half-applied week is a real state the parent can see on
 * Today, so the message names the days that landed and tells her the rest did
 * not — never "failed", which would imply nothing happened.
 */
export function partialApplyNotice(
  daysWritten: string[],
  weekPlanWritten = false,
): string {
  if (daysWritten.length === 0) {
    // The `WeekPlan` upsert runs BEFORE any day write, so "goals saved, no day
    // written" is a real and reachable state (Codex P2, PR #1679). Saying
    // "nothing was written" there would be false about the one thing that did
    // change — and the week's goal list appends on each apply, so a parent who
    // retried on the strength of that sentence would end up with the list
    // doubled. Named explicitly instead.
    return weekPlanWritten
      ? "That didn't finish. The week's goals were saved but no day was planned — so next week's days are unchanged. Open Plan My Week to finish it there; applying again would list the goals twice."
      : "That didn't go through — nothing was written to next week. Nothing on those days changed."
  }
  const labels = daysWritten.map((k) =>
    new Date(`${k}T00:00:00Z`).toLocaleDateString('en-US', {
      weekday: 'long',
      timeZone: 'UTC',
    }),
  )
  const list =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
  return `Only part of that went through: ${list} ${labels.length === 1 ? 'was' : 'were'} written, the rest of the week was not. What landed is real — check Plan My Week before applying again so you don't double up.`
}

/**
 * Today's key in the same civil terms the week window uses.
 *
 * Exported so the writer and the tests share one notion of "now" with the
 * window above rather than each reaching for `Date` separately.
 */
export function civilTodayKey(now: Date = new Date()): string {
  return formatDateYmd(now)
}
