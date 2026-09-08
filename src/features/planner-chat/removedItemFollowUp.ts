// ── The ✕ edits a copy, and now it says so (UX-232) ─────────────────────────
//
// Owner, 2026-09-06: *"I had cleared and committed the plan but then redo
// brought them back."* He removed duplicate rows from the draft with ✕, applied,
// hit Redo, and they re-mirrored — because the ✕ removes a row from the *draft*,
// and the draft is regenerated from Curriculum. Nothing on screen said so.
//
// A control that edits a copy must say it is editing a copy. So when a removed
// row's name matches a live `ActivityConfig`, the planner offers the second
// step — *"Remove **Sight word games** from Curriculum too?"* — as its own
// confirmed act.
//
// **Exact match only.** The comparison is the shared `nameKey` rule (letters and
// digits, lowercased — UX-205), which is deliberately not fuzzy: *"The Good and
// the Beautiful Math"* and *"Good and the Beautiful Math"* differ by a real word
// and do not match. That is the right direction to fail. This offer ends in a
// **delete** of a curriculum row, so a near-match that offered to delete the
// wrong row is far worse than no offer at all — the parent would have to notice
// the wrong name in a confirmation they are already tapping through.
//
// Pure: no Firestore, no writes. It answers "is there a row this could mean, and
// what would we say about it". `PlannerChatPage` owns the dialog and routes the
// deletion through the existing `deleteConfig`.

import { ActivityFrequencyLabel } from '../../core/types/enums'
import { nameKey } from '../../core/utils/nameKey'
import {
  buildDeleteActivityPrompt,
  DELETE_ACTIVITY_MENU_LABEL,
} from '../progress/removeActivityCopy'

import type { ActivityConfig, DraftPlanItem } from '../../core/types'
import type { RemovableActivity } from '../progress/removeActivityCopy'

/** The live curriculum row a removed draft row named, and the copy for the offer. */
export interface RemovedItemFollowUp {
  /** The `ActivityConfig.id` the offer would delete. */
  configId: string
  /** The config's own name — shown, so the parent reads the row that would go. */
  configName: string
  /** How often the config plans, e.g. `'daily'` — the shared label, not a copy. */
  cadence: string
  /** The config's default length in minutes. */
  minutes: number
  /**
   * Whether the config is the family's (`childId: 'both'`) rather than this
   * child's. Deleting a shared row takes it off the sibling's plans too, and the
   * parent is standing on one child's planner when they answer — so the offer
   * has to say it.
   */
  shared: boolean
  /**
   * The config, as `removeActivityCopy` reads it — so this offer speaks the
   * SAME permanent-deletion warning Curriculum's own delete does.
   */
  activity: RemovableActivity
}

/**
 * The live activity config a removed draft row corresponds to, or `null`.
 *
 * `null` — no offer, and the draft edit stands exactly as it does today — when:
 *
 *  - the row's title matches no config's name exactly (the common case for an
 *    AI-generated row, which names a lesson rather than a program);
 *  - the matching config is already `completed`, since a completed program is
 *    not planning anything and deleting it would destroy the record that it was
 *    finished;
 *  - **more than one** config matches. A duplicate pair is exactly the situation
 *    the owner is in, and this feature cannot pick which of two identical rows
 *    he meant. Offering to delete an arbitrary one of them would be the feature
 *    guessing about his curriculum. Two rows are a Curriculum problem, and
 *    Curriculum is where both are visible.
 */
export function findRemovedItemConfig(
  item: Pick<DraftPlanItem, 'title'> | null | undefined,
  configs: readonly ActivityConfig[],
): RemovedItemFollowUp | null {
  const key = nameKey(item?.title)
  if (!key) return null

  const matches = configs.filter((c) => !c.completed && nameKey(c.name) === key)
  if (matches.length !== 1) return null

  const config = matches[0]
  return {
    configId: config.id,
    configName: config.name,
    // The shared label map, never a second copy of the member list — a new
    // cadence must fail to compile there rather than fall through to a raw
    // enum value in a sentence a parent reads (the `PlanType` rule, one enum over).
    cadence: ActivityFrequencyLabel[config.frequency],
    minutes: config.defaultMinutes,
    shared: config.childId === 'both',
    activity: {
      name: config.name,
      currentPosition: config.currentPosition,
      totalUnits: config.totalUnits,
      unitLabel: config.unitLabel,
      completed: config.completed,
    },
  }
}

/** The dialog's title. Names the row, so the parent reads what would go. */
export function removedItemFollowUpTitle(followUp: RemovedItemFollowUp): string {
  return `Remove ${followUp.configName} from Curriculum too?`
}

/**
 * The dialog's body.
 *
 * Two sentences and no jargon. The first says what the ✕ actually did — which
 * is the whole finding, and the sentence that would have saved the owner a
 * regenerate. The second says what the curriculum row is, in its own numbers, so
 * "is this the one I mean" is answerable without leaving the page.
 *
 * A shared row gets a sentence of its own. The parent is standing on ONE
 * child's planner, and a `childId: 'both'` config plans for the sibling too — so
 * a delete confirmed here silently changes a plan the parent isn't looking at.
 * The scope of a destructive act belongs in the sentence that asks for it.
 *
 * **And then it says the same thing Curriculum's own delete says** (Codex round
 * 1, P1). `deleteConfig` is a `deleteDoc` with no undo, and FEAT-162 / UX-48
 * already wrote the warning for it — *"and the place you're up to — lesson 34
 * of 120. There's no undo"*, what survives, and the gentler "Mark as complete"
 * path. The first cut of this offer described the row's minutes and cadence and
 * stopped, so *"Remove from Curriculum"* read as *stop planning this*, and a
 * parent could lose a workbook's saved position without being told it was at
 * stake. There is one delete and there is one warning for it: this composes
 * `buildDeleteActivityPrompt` rather than writing a second, softer one.
 */
export function removedItemFollowUpParagraphs(followUp: RemovedItemFollowUp): string[] {
  const prompt = buildDeleteActivityPrompt(followUp.activity)
  const lines = [
    `Taking it off this week's plan doesn't change Curriculum, so the next plan will include it again.`,
    `Curriculum has ${followUp.configName} at ${followUp.minutes} minutes, ${followUp.cadence}.`,
  ]
  if (followUp.shared) {
    lines.push(`It's shared with your other child, so removing it takes it off their plans too.`)
  }
  lines.push(prompt.whatGoes, prompt.whatStays)
  if (prompt.gentlerPath) lines.push(prompt.gentlerPath)
  return lines
}

/**
 * The same body as one string — for tests and for any caller that wants it
 * flat. The dialog renders {@link removedItemFollowUpParagraphs} instead, one
 * spaced `DialogContentText` per line, exactly as Curriculum's own delete
 * dialog renders this warning: five sentences in a single block on a phone is
 * a wall, and this is the screen where the words have to actually be read.
 */
export function removedItemFollowUpBody(followUp: RemovedItemFollowUp): string {
  return removedItemFollowUpParagraphs(followUp).join(' ')
}

/** The button that declines. Declining leaves the draft edit exactly as it is. */
export const REMOVED_ITEM_KEEP_LABEL = 'Keep it in Curriculum'

/**
 * The button that confirms the second, separate act.
 *
 * The SAME label Curriculum's overflow menu uses, for the same reason it was
 * renamed there: *"Remove"* undersold a `deleteDoc` with no undo. A gentler word
 * on this door would put the app's two routes to one irreversible write at two
 * different levels of honesty.
 */
export const REMOVED_ITEM_DELETE_LABEL = DELETE_ACTIVITY_MENU_LABEL
