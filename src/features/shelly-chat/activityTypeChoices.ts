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
import { withoutStrandPositionFields } from '../progress/strand'

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
  [ActivityType.Strand]: {
    label: 'Strand',
    phrase: 'a strand',
    note: 'A subject you keep returning to. Counts sessions and topics, with no set order and no total.',
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
 * Whether this proposal carries what makes a workbook findable by a photo.
 *
 * `applyCurriculumAction` derives `scannable` from exactly these two fields, and
 * `findWorkbookConfigId` filters `c.type === 'workbook' && c.scannable !== false`
 * — so a workbook added with neither a `totalUnits` nor a `currentPosition` is
 * written `scannable: false` and a page photo can never match it.
 */
export function tracksPosition(action: AddActivityAction): boolean {
  return action.totalUnits != null || action.currentPosition != null
}

/**
 * The workbook note for a proposal that carries no lesson number (Codex P2,
 * round 1).
 *
 * The picker's whole justification is that the card must not claim something the
 * write does not do — so it may not itself promise a photo scan that the derived
 * `scannable: false` rules out. Picking Workbook here is still the right answer
 * (it fixes DATA-08 ownership and the planner's workbook filter); what it cannot
 * do yet is scanning, and saying so beats discovering it with a photo that never
 * matches. Deliberately NOT fixed by making the picker force `scannable: true`:
 * a workbook with no position has nothing for a scan to advance, and widening
 * what the control writes is not this control's job.
 *
 * **The way out is the chat, not a screen (Codex P2, round 2).** The first
 * version of this line sent her to Progress → Curriculum, where no
 * position-edit control exists: the row's ⋮ menu offers complete / quick-log /
 * assign-to-a-child / delete, the scan button is hidden while `scannable` is
 * false, `AddActivityDialog` creates a *separate* config, and the chat's own
 * `setActivityPosition` is refused by `resolveCurriculumAction` for a config
 * with both position fields absent. So it named a fix that could not be
 * performed — the navigation-honesty failure this whole card exists to end,
 * committed by the fix for it. What *does* work is saying the number here, so
 * the next proposal carries it; the wording is `positionPastEndNotice`'s, which
 * already says exactly this for the same reason.
 */
export const WORKBOOK_WITHOUT_POSITION_NOTE =
  "A workbook — but with no lesson number, a photo of a page cannot find it. Tell me the lesson number and I'll propose it again with one."

/**
 * Why Evaluation is never a choice this picker offers (Codex P2, round 2).
 *
 * An evaluation config created by hand is **UX-204's shape, reopened**: Progress
 * → Curriculum renders the Evaluations section as bare `ListItem`s with no ⋮
 * menu at all — no mark-complete, no delete — while
 * `activityConfigsToRoutineText` filters on `completed` only and so plans every
 * incomplete config regardless of type. That is a row that plans every day and
 * that nobody can fix, which is precisely what this run is closing rather than
 * reopening.
 *
 * So the chip is disabled and says why. Note this bounds the CONTROL, not the
 * model: `addActivity` has always been able to carry `type: 'evaluation'`, and
 * refusing that outright would be a new refusal on a path this run was not asked
 * to change. What the card can do is stop endorsing it and, when a proposal
 * arrives as one, show this sentence in the note's place so the row's fate is
 * legible before she taps.
 */
export const EVALUATION_NOT_OFFERED_REASON =
  'Evaluations are managed by the app. One added by hand is planned every day and has no ⋮ menu at Progress → Curriculum, so it cannot be finished or removed.'

/**
 * Where each type sits on the card, lowest first.
 *
 * **A `Record<ActivityType, number>`, and it is the third rail this file and
 * `curriculumGrouping` hold between them (UX-281).** The order used to be a
 * hand-written array, and adding the seventh `ActivityType` walked straight
 * past it: `ACTIVITY_TYPE_WORDS` and `SECTION_FOR_TYPE` both failed to compile
 * and *this* silently dropped the new member off the card — a type a parent
 * could not pick, on the door whose whole purpose (UX-193) is that she can
 * correct the model's guess. Only a test noticed, and a test is the thing the
 * other two rails were written to stop relying on.
 *
 * A rank rather than a list, so a new member fails to compile until somebody
 * decides where it goes.
 */
const ACTIVITY_TYPE_RANK: Record<ActivityType, number> = {
  [ActivityType.Workbook]: 0,
  [ActivityType.Routine]: 1,
  [ActivityType.Formation]: 2,
  // A strand sits with the catch-alls rather than beside the workbook: it is
  // curriculum, but it is the shape a parent reaches for when the thing she is
  // describing has no order to it.
  [ActivityType.Strand]: 3,
  [ActivityType.Activity]: 4,
  [ActivityType.App]: 5,
  // The auto-managed one stays last.
  [ActivityType.Evaluation]: 6,
}

/** Every type, in card order. Derived, so it cannot fall behind the enum. */
export const ACTIVITY_TYPE_ORDER: ActivityType[] = (
  Object.keys(ACTIVITY_TYPE_RANK) as ActivityType[]
).sort((a, b) => ACTIVITY_TYPE_RANK[a] - ACTIVITY_TYPE_RANK[b])

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
  const order = ACTIVITY_TYPE_ORDER
  const positioned = tracksPosition(action)
  return order.map((type) => ({
    type,
    label: ACTIVITY_TYPE_WORDS[type].label,
    // The one note that depends on the proposal rather than only on the type:
    // the workbook line promises a photo scan, and the write cannot keep that
    // promise without a lesson number. See WORKBOOK_WITHOUT_POSITION_NOTE.
    note:
      type === ActivityType.Workbook && !positioned
        ? WORKBOOK_WITHOUT_POSITION_NOTE
        : ACTIVITY_TYPE_WORDS[type].note,
    ...(shared && type === ActivityType.Workbook
      ? { disabledReason: WORKBOOK_OWNER_REASON }
      : type === ActivityType.Evaluation
        ? { disabledReason: EVALUATION_NOT_OFFERED_REASON }
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
  // A strand has no total and no position handed to it from outside (Codex
  // round 1): a workbook-shaped proposal retyped as a strand would otherwise
  // keep `totalUnits`/`currentPosition`, and the write derives `scannable` from
  // their presence — the row would start at an unrelated lesson count and the
  // weekly snapshot would report "session 1 of 60".
  return withoutStrandPositionFields({ ...action, type })
}
