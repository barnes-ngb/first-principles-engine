// ── Live-day chat actions: resolution + plain-language previews (FEAT-142) ──
//
// The pure half of "Ask AI can edit today and this week". `parseChatActions`
// validates the SHAPE of a `removeItemFromDay` / `moveItemToDay` /
// `addItemToDay` proposal; this module decides whether that shape names anything
// real, and — when it doesn't — says why in a sentence a parent can read.
//
// It is the exact counterpart of `resolveActivityConfig` (FEAT-135): a model can
// emit any `itemKey` and any date it likes, so a proposal is resolved against
// the live week BEFORE a confirm card is offered. Nothing here writes; the write
// is `today/liveDayEdit.ts`, which re-checks everything against the freshly-read
// document (two layers, per the house pattern — this is the gate, that is the
// backstop).
//
// Pure by design, so "a hallucinated key never reaches a write" is testable
// without Firestore.

import type { ChatAction } from '../../core/types'
import { liveDayEditLockReason } from '../today/liveDayEdit'

/** One checklist row of the live week, as the chat needs to see it. */
export interface ChatWeekItem {
  /** `checklistItemKey` — the day-write guard's own notion of row identity. */
  itemKey: string
  /** The saved label, verbatim (usually carrying a `(Nm)` suffix). */
  label: string
  completed: boolean
  skipped?: boolean
}

/** One weekday of the current week. */
export interface ChatWeekDay {
  /** `YYYY-MM-DD`. */
  dateKey: string
  /** Weekday name as the app labels it — "Monday". Never an id, never a date. */
  label: string
  items: ChatWeekItem[]
}

/** The live-day kinds, narrowed off the `ChatAction` union. */
export type DayItemAction = Extract<
  ChatAction,
  { kind: 'removeItemFromDay' | 'moveItemToDay' | 'addItemToDay' }
>

export const isDayItemAction = (action: ChatAction): action is DayItemAction =>
  action.kind === 'removeItemFromDay' ||
  action.kind === 'moveItemToDay' ||
  action.kind === 'addItemToDay'

/**
 * A resolved proposal — everything the confirm card needs, with no ids in it.
 * `item` is absent for `addItemToDay`, which names no existing row.
 */
export interface ResolvedDayItemAction {
  action: DayItemAction
  /** The day the action reads FROM (the source day for a move). */
  day: ChatWeekDay
  /** The destination day. Only set for a move. */
  targetDay?: ChatWeekDay
  /** The row being removed or moved. Absent for an add. */
  item?: ChatWeekItem
}

export type DayItemResolution =
  | { ok: true; resolved: ResolvedDayItemAction }
  | { ok: false; notice: string }

/**
 * Plain-language refusals. Every one of these is shown to the parent in the
 * card's place — FEAT-135's lesson: the model's prose signs off with "confirm
 * with a tap", so a SILENTLY dropped proposal leaves the app promising a card
 * that never appears. That is the same "tells you something untrue" failure the
 * navigation-honesty rule exists to stop.
 *
 * The completed-row and not-permitted sentences are borrowed from
 * `liveDayEditLockReason` rather than rewritten, so the chat says exactly what
 * the disabled affordance on Today and in the planner says. One rule, one
 * wording — no shame, no blame: the work being done is a good thing.
 */
export const DAY_ITEM_NOTICES = {
  notThisWeek:
    "That day isn't in this week's plan, so nothing was changed. I can only change days in the current week (Monday–Friday).",
  notPermitted: liveDayEditLockReason('not-permitted'),
} as const

/** "I couldn't find that on Wednesday" — never quoting the key back. */
export function itemNotFoundNotice(dayLabel: string): string {
  return `I couldn't find that item on ${dayLabel}, so nothing was changed. Open Today to see what's on the day now.`
}

/**
 * Resolve a proposed live-day edit against the current week.
 *
 * Returns the resolved action (day, target day, row) or a single plain-language
 * reason it was dropped. The order of the checks is the order a parent would
 * ask them in: is that day even this week, is that row on it, and is it finished.
 *
 * `canEdit` is a required argument, not an ambient assumption — `/chat` sits
 * outside `RequireParent`, so a kid profile can reach it by URL. The write layer
 * states the gate too; neither layer trusts the other (FEAT-133's lesson).
 */
export function resolveDayItemAction(
  action: DayItemAction,
  weekDays: ChatWeekDay[],
  canEdit: boolean,
  childName?: string,
): DayItemResolution {
  if (!canEdit) return { ok: false, notice: DAY_ITEM_NOTICES.notPermitted }

  const dayFor = (dateKey: string): ChatWeekDay | undefined =>
    weekDays.find((d) => d.dateKey === dateKey)

  if (action.kind === 'addItemToDay') {
    const day = dayFor(action.dateKey)
    if (!day) return { ok: false, notice: DAY_ITEM_NOTICES.notThisWeek }
    return { ok: true, resolved: { action, day } }
  }

  const sourceKey = action.kind === 'moveItemToDay' ? action.fromDateKey : action.dateKey
  const day = dayFor(sourceKey)
  if (!day) return { ok: false, notice: DAY_ITEM_NOTICES.notThisWeek }

  // A move's destination must be a weekday of the SAME week — the five-weekday
  // rule `MoveToDayDialog` established. "The video changes the day it will be
  // watched" is always a within-the-week move; a free date would write school
  // days into weeks that were never planned.
  let targetDay: ChatWeekDay | undefined
  if (action.kind === 'moveItemToDay') {
    targetDay = dayFor(action.toDateKey)
    if (!targetDay) return { ok: false, notice: DAY_ITEM_NOTICES.notThisWeek }
  }

  const item = day.items.find((i) => i.itemKey === action.itemKey)
  if (!item) return { ok: false, notice: itemNotFoundNotice(day.label) }
  if (item.completed) {
    return { ok: false, notice: liveDayEditLockReason('completed', childName) }
  }

  return { ok: true, resolved: { action, day, targetDay, item } }
}

// ── Card wording ─────────────────────────────────────────────────────────────

/**
 * The row's title without the `(Nm)` suffix the saved label carries, so a card
 * reads "Reading Eggs" rather than "Reading Eggs (30m) (30m)" once the preview
 * adds the minutes back in its own words. Falls back to the label untouched when
 * there is no suffix to strip.
 */
export function checklistItemTitle(label: string): string {
  return label.replace(/\s*\(\d+m\)\s*$/, '').trim() || label
}

/**
 * The one-line preview a parent reads before tapping Confirm. Names the child
 * and the weekday in words, quotes the row by its title, and **never** shows an
 * `itemKey`, a doc id, or a raw date — an id on a confirm card is not something
 * a parent can check the proposal against.
 */
export function describeDayItemAction(
  resolved: ResolvedDayItemAction,
  childName: string,
): string {
  const { action, day, targetDay, item } = resolved
  const title = item ? checklistItemTitle(item.label) : ''
  switch (action.kind) {
    case 'removeItemFromDay':
      return `Remove "${title}" from ${childName}'s ${day.label}`
    case 'moveItemToDay':
      return `Move "${title}" from ${childName}'s ${day.label} to ${targetDay?.label ?? 'another day'}`
    case 'addItemToDay':
      return `Add "${action.label}" (${action.estimatedMinutes}m) to ${childName}'s ${day.label}`
  }
}

/**
 * The line under the preview. Says what the write does NOT touch, because the
 * thing a parent most needs to know before changing a live week is that finished
 * work and recorded hours are not in play.
 */
export function dayItemActionFootnote(action: DayItemAction): string {
  if (action.kind === 'addItemToDay') {
    return 'Adds one row to that day. Nothing already on it changes.'
  }
  return 'Finished work stays put — only what has not been done yet can move.'
}
