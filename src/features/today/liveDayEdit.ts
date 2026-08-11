import { doc, getDoc } from 'firebase/firestore'

import { daysCollection } from '../../core/firebase/firestore'
import type { ChecklistItem, DayBlock, DayLog, WatchVideo } from '../../core/types'
import { itemMatchesBlock } from '../../core/utils/itemBlockMatch'
import { swapWatchVideoOnItem } from '../watch/watchDayItem'
import { dayLogDocId } from './daylog.model'
import { checklistItemKey, setDayLogGuarded } from './dayWriteGuard'

/**
 * The live-week edit lane (FEAT-138) — move, remove and swap on a day that is
 * ALREADY SAVED in Firestore.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The planner's structural edits (`handleMoveItem` / `handleRemoveItem`) mutate
 * the in-memory `currentDraft` and set `planDirty`. Before Apply that is exactly
 * right — Apply flushes the draft into the day docs. **After** Apply there is no
 * reachable re-apply, so a draft-only edit is silently lost: the card would say
 * the row moved while the child's checklist still holds it. That is why those
 * handlers are gated off once the week is live, and why simply ungating them
 * would build a lying UI. This module is the real write they need.
 *
 * `writeWatchItemToDay` (FEAT-132) was the first post-Apply write lane, but it
 * is watch-shaped and purely additive. This generalises the same discipline to
 * ANY checklist row and to the two subtractive operations, through the SAME
 * `setDayLogGuarded` lane — there is no second write path to day docs.
 *
 * ── The completed-row rule (HARD) ───────────────────────────────────────────
 * A completed row has credited `actualMinutes` into the day's hours and may
 * carry an `evidenceArtifactId` pointing at real work a boy did. **Move, remove
 * and swap all refuse on a completed row, of any type.** The refusal lives here,
 * on the write, re-checked against the freshly-read document — not only in the
 * UI, which can be looking at a stale mirror. A parent who genuinely needs to
 * undo a completion has the existing un-check path on Today; this lane never
 * offers an override. Relocating or deleting credited hours out from under a
 * child's school record is not a thing this app does.
 *
 * ── Rows are found by identity, never by a bare index ───────────────────────
 * Every writer re-reads the day and resolves the target row by
 * `checklistItemKey` — the same identity `dayWriteGuard` uses to decide whether
 * a row survived a write. An index captured when the card rendered can shift
 * under a concurrent edit (a rollover, a kid completing something, Today's own
 * add); an identity cannot.
 *
 * ── Blocks ──────────────────────────────────────────────────────────────────
 * See {@link detachBlocksForItem}. One rule, shared by all three operations.
 *
 * ── What this lane never does ───────────────────────────────────────────────
 * No hours math, no XP, no learner-model write, and **no `plannedMinutes` on any
 * block is ever changed** — a block is either left alone or dropped whole (and
 * only ever a block carrying no logged minutes). Editing planned minutes on a
 * live week is deliberately still locked; see `onUpdateTime` in `PlanDayCards`.
 */

// ── Refusals ─────────────────────────────────────────────────────────────────

/** Why a live-day structural edit was refused. */
export type LiveDayEditRefusal = 'completed' | 'not-found' | 'not-permitted'

/**
 * The lock on a row, or `null` when it is freely editable. `'completed'` is the
 * hard rule above; a row the day no longer holds is `'not-found'`.
 */
export function checklistItemEditLock(
  item: ChecklistItem | null | undefined,
): LiveDayEditRefusal | null {
  if (!item) return 'not-found'
  return item.completed ? 'completed' : null
}

/**
 * Plain-language reason shown next to a disabled affordance. The rule is that a
 * dropped affordance always SAYS why (FEAT-135's lesson) — a silently inert
 * button beside prose promising the action is a lie. No shame, no blame: the
 * work is done, which is a good thing, and it is simply not ours to move.
 */
export function liveDayEditLockReason(
  refusal: LiveDayEditRefusal,
  childName?: string,
): string {
  const who = childName?.trim() ? childName.trim() : 'They'
  if (refusal === 'completed') {
    return `${who} already did this one — finished work stays on its day. Un-check it first if you need to change it.`
  }
  if (refusal === 'not-permitted') {
    return 'Changing the week is something a grown-up does — nothing was changed.'
  }
  return "That item isn't on the day any more — reopen the week to see what's there now."
}

// ── Pure day-log transforms ──────────────────────────────────────────────────

/** Index of the row with this identity, or `-1`. */
export function findChecklistIndexByKey(
  checklist: ChecklistItem[] | undefined,
  itemKey: string,
): number {
  return (checklist ?? []).findIndex((item) => checklistItemKey(item) === itemKey)
}

/**
 * The label a draft plan item becomes on a saved day. `handleApplyPlan` writes
 * `` `${title} (${estimatedMinutes}m)` `` and `buildWatchChecklistItem` matches
 * it byte for byte, so this is the deterministic join that lets a post-Apply
 * planner card find its own row in the saved checklist — no fuzzy matching, and
 * no second convention to keep in step.
 */
export function draftItemChecklistLabel(item: {
  title: string
  estimatedMinutes: number
}): string {
  return `${item.title} (${item.estimatedMinutes}m)`
}

/**
 * The saved row a draft plan item became, found by the label the apply mapping
 * gives it. Returns `undefined` when the day no longer holds it — an item the
 * parent never accepted, or one already removed elsewhere.
 *
 * Callers resolve the row this way and then take its `checklistItemKey`, rather
 * than synthesising a key from the draft: the SAVED row is the authority on its
 * own identity (it may carry an `id` the draft never had).
 */
export function findChecklistItemByLabel(
  checklist: ChecklistItem[] | undefined,
  label: string,
): ChecklistItem | undefined {
  return (checklist ?? []).find((item) => item.label === label)
}

/**
 * The ONE rule for what a structural edit does to a row's block — shared by
 * remove, by the source side of a move, and by swap.
 *
 * A planner-sourced row gets a paired block at Apply (`handleApplyPlan` maps
 * every non-app-block item to a `DayBlock` carrying its title and planned
 * minutes). Today's `handleDeleteItem` established the intent — a removed
 * planner row takes its block with it — but hand-rolled half the match
 * (`block.checklist?.some(...)`), which planner-applied blocks never populate,
 * so in practice it left them orphaned. This uses the repo's canonical
 * correspondence rule, `itemMatchesBlock` (the same one the hours math and the
 * completion auto-stamp use), so there is genuinely one definition of "this
 * block is that row".
 *
 * Two guards on top of it, because `itemMatchesBlock`'s title rule is a
 * case-insensitive **substring** match and would otherwise take collateral:
 *  1. a block carrying logged `actualMinutes` is NEVER dropped — those minutes
 *     are a compliance contribution (`records.logic`), and the preservation
 *     guard would refuse the write anyway. Belt and braces, on purpose.
 *  2. a block still claimed by another remaining row is NEVER dropped — a block
 *     titled "Math" matches both "Math Facts (10m)" and "Math Workbook (15m)".
 *
 * Manual rows are left alone: nothing in the app creates a block for one, so
 * there is no pairing to honour (matching Today's own `source === 'planner'`
 * gate).
 *
 * Note what this does NOT do: it never edits a block, and it never creates one.
 * A block's `plannedMinutes` is hours-shaped and not this lane's to adjust.
 */
export function detachBlocksForItem(
  blocks: DayBlock[] | undefined,
  item: ChecklistItem,
  remainingChecklist: ChecklistItem[],
): DayBlock[] {
  const existing = blocks ?? []
  if (item.source !== 'planner') return existing
  return existing.filter((block) => {
    if (!itemMatchesBlock(item, block)) return true
    if ((block.actualMinutes ?? 0) > 0) return true
    if (remainingChecklist.some((other) => itemMatchesBlock(other, block))) return true
    return false
  })
}

/**
 * Remove one row from a day log, taking its paired block per
 * {@link detachBlocksForItem}. Purely subtractive on the named row — every other
 * row, block, and day-level field is returned untouched. Never mutates the input.
 */
export function removeChecklistItemFromDayLog(dayLog: DayLog, index: number): DayLog {
  const checklist = dayLog.checklist ?? []
  const item = checklist[index]
  if (!item) return dayLog
  const remaining = checklist.filter((_, i) => i !== index)
  return {
    ...dayLog,
    checklist: remaining,
    blocks: detachBlocksForItem(dayLog.blocks, item, remaining),
  }
}

/**
 * Append a row to a day log's checklist, verbatim. Purely additive.
 *
 * The row is carried across a move **unchanged** — including `source`,
 * `itemType`, `watchVideoId`, `skillTags`, `category` and `mvdEssential`. Two
 * things depend on that: FEAT-134's kid bucketing keys off `itemType === 'watch'`
 * (a moved video must still land in the kid's watch section on the target day),
 * and the week ribbon's planned/logged totals exclude `source: 'manual'` rows,
 * so re-stamping a moved planner row as manual would quietly drop it out of the
 * week's planned minutes. A move changes the row's DAY, and nothing else.
 */
export function appendChecklistItemToDayLog(
  dayLog: DayLog,
  item: ChecklistItem,
): DayLog {
  return { ...dayLog, checklist: [...(dayLog.checklist ?? []), item] }
}

/**
 * Replace the video on a watch row, in place. The row keeps its position in the
 * checklist, its day, and its incomplete state; `watchVideoId`, the label, the
 * planned minutes and the subject follow the new video (see
 * `swapWatchVideoOnItem`, which owns those fields).
 *
 * The old video's paired block — a planner-applied watch row does get one — is
 * detached rather than rewritten, for the reason in {@link detachBlocksForItem}:
 * rewriting it would mean writing a new `plannedMinutes`, and a block left
 * behind would claim planned time for a video that is no longer on the day.
 */
export function swapWatchVideoInDayLog(
  dayLog: DayLog,
  index: number,
  video: WatchVideo,
): DayLog {
  const checklist = dayLog.checklist ?? []
  const previous = checklist[index]
  if (!previous) return dayLog
  const swapped = swapWatchVideoOnItem(previous, video)
  const next = checklist.map((item, i) => (i === index ? swapped : item))
  return {
    ...dayLog,
    checklist: next,
    blocks: detachBlocksForItem(
      dayLog.blocks,
      previous,
      next.filter((_, i) => i !== index),
    ),
  }
}

// ── Writers ──────────────────────────────────────────────────────────────────

/** Outcome of a single-document live-day edit. */
export type LiveDayEditOutcome =
  | { status: 'done' }
  | { status: 'refused'; refusal: LiveDayEditRefusal }

/**
 * Outcome of a move. `'duplicated'` is the deliberately-survivable half-failure
 * described on {@link moveItemToLiveDay}: the row reached the target day but the
 * source removal failed, so it is on BOTH days.
 */
export type LiveDayMoveOutcome = LiveDayEditOutcome | { status: 'duplicated' }

/**
 * Every writer takes the caller's capability explicitly and refuses without it.
 *
 * Both surfaces also withhold the affordance from a non-parent, but neither
 * write may ASSUME that (FEAT-133's lesson): `/planner/chat` sits outside
 * `RequireParent`, so a kid profile can reach the planner by URL. Making the
 * capability a required argument means a new call site cannot forget the gate
 * the way a page-local `if` can be forgotten — and, unlike that `if`, it is
 * pinned by a test here rather than resting on review there.
 *
 * Capability, never a name: this is `isParent`, not "is Lincoln".
 */
type Capability = { canEdit: boolean }

type DayTarget = { familyId: string; childId: string; dateKey: string }

function dayRef(familyId: string, childId: string, dateKey: string) {
  return doc(daysCollection(familyId), dayLogDocId(dateKey, childId))
}

async function readDay(
  familyId: string,
  childId: string,
  dateKey: string,
): Promise<{ ref: ReturnType<typeof dayRef>; day: DayLog | null }> {
  const ref = dayRef(familyId, childId, dateKey)
  const snap = await getDoc(ref)
  return { ref, day: snap.exists() ? snap.data() : null }
}

function emptyDay(childId: string, dateKey: string, now: string): DayLog {
  return {
    childId,
    date: dateKey,
    blocks: [],
    checklist: [],
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Remove one row from a saved day.
 *
 * Refuses a completed row (see the module header) and a row the day no longer
 * holds. Everything else on the day — other rows, their completions, minutes and
 * evidence — is carried through untouched, and the write goes through the
 * FEAT-114 preservation guard, which verifies that rather than trusting this
 * function's care.
 */
export async function removeItemFromLiveDay(
  params: DayTarget & Capability & { itemKey: string },
): Promise<LiveDayEditOutcome> {
  const { familyId, childId, dateKey, itemKey, canEdit } = params
  if (!canEdit) return { status: 'refused', refusal: 'not-permitted' }
  const { ref, day } = await readDay(familyId, childId, dateKey)
  if (!day) return { status: 'refused', refusal: 'not-found' }

  const index = findChecklistIndexByKey(day.checklist, itemKey)
  const lock = checklistItemEditLock(day.checklist?.[index])
  if (lock) return { status: 'refused', refusal: lock }

  await setDayLogGuarded(
    ref,
    { ...removeChecklistItemFromDayLog(day, index), updatedAt: new Date().toISOString() },
    'remove-item-from-live-day',
  )
  return { status: 'done' }
}

/**
 * Move one row from a saved day onto another saved day.
 *
 * **Two documents, and there is no transaction across them.** The order is
 * deliberate and load-bearing: **append to the target first, then remove from
 * the source.** A failure between the two leaves the row on BOTH days — visible
 * and fixable by hand — rather than on NEITHER, which would be an invisible
 * loss of a planned item. On that half-failure the caller is TOLD
 * (`status: 'duplicated'`) and the duplicate is left standing; no rollback is
 * attempted, because a rollback write can fail exactly the way the write it is
 * undoing just did, and would then be the thing that loses the row.
 *
 * **Blocks: the source block is dropped, and none is created on the target.**
 * The move is therefore a remove on the source plus an add on the target, each
 * behaving exactly like the lane that already exists for it — removal drops the
 * paired block ({@link detachBlocksForItem}), and every post-Apply add in this
 * repo (`writeWatchItemToDay`, Today's `handleAddItem`) writes no block.
 * Creating one on the target day is the only variant that would write a fresh
 * `plannedMinutes` onto a day, which this lane does not do. Hours are unaffected
 * either way: a block's `plannedMinutes` never count (`blockCountedMinutes`
 * reads `actualMinutes` only), and DATA-14 counts a completed checklist item
 * that has no matching block.
 */
export async function moveItemToLiveDay(params: Capability & {
  familyId: string
  childId: string
  fromDateKey: string
  toDateKey: string
  itemKey: string
}): Promise<LiveDayMoveOutcome> {
  const { familyId, childId, fromDateKey, toDateKey, itemKey, canEdit } = params
  if (!canEdit) return { status: 'refused', refusal: 'not-permitted' }
  if (fromDateKey === toDateKey) return { status: 'done' }

  const { ref: sourceRef, day: sourceDay } = await readDay(familyId, childId, fromDateKey)
  if (!sourceDay) return { status: 'refused', refusal: 'not-found' }

  const index = findChecklistIndexByKey(sourceDay.checklist, itemKey)
  const item = sourceDay.checklist?.[index]
  const lock = checklistItemEditLock(item)
  if (lock || !item) return { status: 'refused', refusal: lock ?? 'not-found' }

  const now = new Date().toISOString()

  // (1) Append to the target FIRST. If this throws, nothing has changed
  // anywhere and the error surfaces to the caller — the row is still safely on
  // its original day.
  const { ref: targetRef, day: targetDay } = await readDay(familyId, childId, toDateKey)
  await setDayLogGuarded(
    targetRef,
    {
      ...appendChecklistItemToDayLog(targetDay ?? emptyDay(childId, toDateKey, now), item),
      updatedAt: now,
    },
    'move-item-to-live-day:append',
  )

  // (2) Then remove from the source. A failure here is survivable by design.
  try {
    await setDayLogGuarded(
      sourceRef,
      { ...removeChecklistItemFromDayLog(sourceDay, index), updatedAt: now },
      'move-item-to-live-day:remove',
    )
  } catch (err) {
    console.error('[liveDayEdit] moved the item but could not clear the source day', err)
    return { status: 'duplicated' }
  }

  return { status: 'done' }
}

/**
 * Swap the video on a saved watch row, in place.
 *
 * Watch-only by design — "change my mind about which video" means nothing for a
 * workbook row, and a swap is not a general re-label. Refuses a completed row
 * (a watched video is credited work) and a row that is not a watch row.
 *
 * The caller is responsible for offering only `activeVideos` (FEAT-129): a
 * retired video must never become plannable again. `WatchLibraryPicker` applies
 * that filter itself, so both swap surfaces inherit it.
 */
export async function swapWatchVideoOnLiveDay(
  params: DayTarget & Capability & { itemKey: string; video: WatchVideo },
): Promise<LiveDayEditOutcome> {
  const { familyId, childId, dateKey, itemKey, video, canEdit } = params
  if (!canEdit) return { status: 'refused', refusal: 'not-permitted' }
  const { ref, day } = await readDay(familyId, childId, dateKey)
  if (!day) return { status: 'refused', refusal: 'not-found' }

  const index = findChecklistIndexByKey(day.checklist, itemKey)
  const item = day.checklist?.[index]
  const lock = checklistItemEditLock(item)
  if (lock || !item) return { status: 'refused', refusal: lock ?? 'not-found' }
  if (item.itemType !== 'watch') return { status: 'refused', refusal: 'not-found' }

  await setDayLogGuarded(
    ref,
    { ...swapWatchVideoInDayLog(day, index, video), updatedAt: new Date().toISOString() },
    'swap-watch-video-on-live-day',
  )
  return { status: 'done' }
}
