// ── The `type` on an addActivity card: naming it, and changing it (UX-193) ───
//
// `describeAddActivityShape` rendered `subjectBucket · defaultMinutes ·
// frequency` plus position, and the write additionally set `type` — straight off
// the model — plus a derived `scannable` and `unitLabel`. **A parent cannot
// confirm a field she cannot see**, and this was the field that decided the most.
//
// The live failure the audit traced: *"add Explode the Code 4 for Lincoln, 15
// minutes a day — he's on lesson 1 of 60"* gives the model every number it
// needs, so the card read *"LanguageArts · 15m · daily · lesson 1 of 60"* and
// **every visible field was correct**. But the model picked `type: "activity"`,
// and `resolveScannableWorkbook` filters `c.type === 'workbook' && c.scannable
// !== false`, so a workbook photo scan could never match the row and the
// planner's own workbook filter skipped it. The one field that broke it was the
// one field the card did not show.
//
// It is the same field UX-204 traced its way back to: `activity` and `app` rows
// created through exactly this path rendered on **no screen** in the app while
// planning every day and raising the day budget. That was fixed by giving those
// types a section; this is fixing the door that keeps producing them.
//
// **So the card gets a control, not just a label.** A label she can only accept
// or reject means a wrong guess costs her the whole card and a re-typed
// sentence — twenty times over, in the season of curriculum she is about to
// add. Correcting the model is one tap, and it is the cheapest possible place
// to catch the error: before the write, on the card that made the claim.
//
// Pure. No React, no Firestore — the card renders these choices and the hook
// applies one, so "the model's guess is correctable" is testable without either.

import { WORKBOOK_OWNER_REASON } from '../../core/firebase/activityConfigWrites'
import type { ChatAction } from '../../core/types'
import { ActivityType } from '../../core/types/enums'
import {
  CURRICULUM_SECTION_TITLE,
  SECTION_FOR_TYPE,
} from '../progress/curriculumGrouping'

/** The `addActivity` kind, narrowed off the union. */
export type AddActivityAction = Extract<ChatAction, { kind: 'addActivity' }>

/**
 * Every `ActivityType`, in the words a parent uses, with what picking it means.
 *
 * A `Record<ActivityType, …>` on purpose, the UX-204 rail: a seventh member
 * **fails to compile** until somebody gives it words, rather than quietly
 * arriving on a card as a blank or as the raw enum string.
 *
 * `phrase` is the article form the shape line reads ("a workbook"); `label` is
 * the chip. `note` says the one thing that actually differs between them — a
 * workbook is the only type the photo scan and the planner's workbook filter can
 * see, and it is the only one that tracks a lesson number.
 */
export const ACTIVITY_TYPE_WORDS: Record<
  ActivityType,
  { label: string; phrase: string; note: string }
> = {
  [ActivityType.Workbook]: {
    label: 'Workbook',
    phrase: 'a workbook',
    note: 'Tracks a lesson number, and a photo of a page can find it.',
  },
  [ActivityType.Routine]: {
    label: 'Routine',
    phrase: 'a routine',
    note: 'Part of the shape of the day, every day it runs.',
  },
  [ActivityType.Formation]: {
    label: 'Formation',
    phrase: 'a formation block',
    note: 'Prayer, scripture and the like — part of the shape of the day.',
  },
  [ActivityType.Activity]: {
    label: 'Activity',
    phrase: 'an activity',
    note: 'A one-off thing in the rotation, not part of the daily shape.',
  },
  [ActivityType.App]: {
    label: 'App',
    phrase: 'an app',
    note: 'Something on a screen, planned like any other activity.',
  },
  [ActivityType.Evaluation]: {
    label: 'Evaluation',
    phrase: 'an evaluation',
    note: 'Auto-managed — the app schedules these itself.',
  },
}

/** "a workbook" — never the raw `'workbook'`. */
export function describeActivityType(type: ActivityType): string {
  return ACTIVITY_TYPE_WORDS[type]?.phrase ?? 'an activity'
}

/**
 * The section of Progress → Curriculum this row will appear under.
 *
 * Read from `SECTION_FOR_TYPE`, the same partition the tab renders from, rather
 * than restated here — so the card can never promise a heading the tab does not
 * have. That is the whole of UX-204's lesson applied to the door that caused it.
 */
export function sectionTitleForType(type: ActivityType): string {
  return CURRICULUM_SECTION_TITLE[SECTION_FOR_TYPE[type] ?? 'other']
}

export interface ActivityTypeChoice {
  type: ActivityType
  label: string
  note: string
  /** Set when this type may not be picked for THIS add. The card says why. */
  disabledReason?: string
}

/**
 * The choices offered on the card, in the order a parent thinks about them —
 * the two that carry a lesson number and the daily shape first, the catch-alls
 * after, and the auto-managed one last.
 *
 * **`workbook` is refused for a shared add**, with the DATA-08 rule's own words
 * quoted from the writer that enforces it. `parseChatActions` already rejects
 * that combination and `resolveCurriculumAction` refuses it again, so offering
 * the chip would produce a card whose Confirm silently does nothing — the exact
 * dead button the portal's refusal notices exist to prevent. Disabled with a
 * reason instead.
 */
export function activityTypeChoices(action: AddActivityAction): ActivityTypeChoice[] {
  const shared = action.shared === true
  const order: ActivityType[] = [
    ActivityType.Workbook,
    ActivityType.Routine,
    ActivityType.Formation,
    ActivityType.Activity,
    ActivityType.App,
    ActivityType.Evaluation,
  ]
  return order.map((type) => ({
    type,
    label: ACTIVITY_TYPE_WORDS[type].label,
    note: ACTIVITY_TYPE_WORDS[type].note,
    ...(shared && type === ActivityType.Workbook
      ? { disabledReason: WORKBOOK_OWNER_REASON }
      : {}),
  }))
}

/**
 * The corrected proposal — a NEW action object, never a mutation.
 *
 * The confirm lane keys its re-entry guard and its per-card status on the action
 * OBJECT (`appliedOrInFlightRef`, `p.action === action`), so a correction has to
 * hand back a fresh object for the card to carry and confirm. Mutating in place
 * would leave the guard pointing at an action whose payload had changed under
 * it. Returns the same object when nothing would change, so a re-render caused
 * by tapping the chip already selected does not churn the pending list.
 */
export function withActivityType(
  action: AddActivityAction,
  type: ActivityType,
): AddActivityAction {
  if (action.type === type) return action
  return { ...action, type }
}
