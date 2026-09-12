/**
 * Whose new activity is this — UX-335 (RESET).
 *
 * `AddActivityDialog` holds the whole form — name, type, subject, minutes,
 * cadence, total, position, quick-log flag — in component state, and does not
 * reset when its `childId` prop changes. `handleAdd` stamps the **live** prop.
 * Curriculum renders its own `ChildSelector`, so this was reachable with the
 * header switcher off; `FIX-231` turned the switcher back on, so the change can
 * now also arrive from the app bar while the dialog stands open over it.
 *
 * The result was a workbook typed out for one boy — *The Good and the Beautiful
 * Math K*, 30 minutes, daily, currently on lesson 14 — created on the other
 * boy's curriculum, where it then plans every day and counts toward his day
 * budget. `UX-354` exists because there was no way to move such a row; the
 * honest fix is to stop writing it in the first place.
 *
 * **RESET, not BIND.** Nothing has been created for anybody: the form is an
 * intent, and re-entering it is the same typing the parent has just done with
 * the right boy on screen. Binding would mean creating curriculum for a child
 * the parent is no longer looking at, which is the surprise this exists to
 * prevent rather than a smaller version of it. (`KitBuilderForm` binds because
 * a roster is a cast a kid wrote out in his own words; a name, a subject and a
 * cadence are four taps and a word.)
 *
 * **`FEAT-209`'s duplicate notice is unaffected**: it is computed on the offer
 * path from the live list and never from this draft.
 *
 * Pure: no React, no Firestore, never throws.
 */

import type { ActivityFrequency, ActivityType } from '../../core/types/enums'
import type { SubjectBucket } from '../../core/types/enums'

/** The add-activity form's typed state. Structural, so the rule tests on its own. */
export interface AddActivityDraft {
  name: string
  type: ActivityType
  subject: SubjectBucket
  minutes: number
  frequency: ActivityFrequency
  scannable: boolean
  totalUnits: string
  currentPosition: string
  quickLog: boolean
}

/**
 * The draft as the dialog opens it.
 *
 * One definition, so the child-change reset and the existing close/submit reset
 * cannot drift — two lists of nine fields is how the tenth gets forgotten.
 * `scannable` opens `true` because `type` opens `workbook`, and the two move
 * together in the type chips.
 */
export const EMPTY_ADD_ACTIVITY_DRAFT: AddActivityDraft = {
  name: '',
  type: 'workbook',
  subject: 'Reading',
  minutes: 20,
  frequency: 'daily',
  scannable: true,
  totalUnits: '',
  currentPosition: '',
  quickLog: false,
}

/**
 * Is there anything in this draft a person actually typed?
 *
 * The three fields with real defaults — `type`, `subject`, `minutes`,
 * `frequency`, `scannable` — count only when they DIFFER from the opening
 * state, which is the `DEFAULT_AWARD_TYPE` rule from UX-336 one surface over:
 * reading them like the free-text fields would make every untouched dialog
 * non-empty, so every switch would raise a notice about work nobody did.
 */
export function addActivityDraftIsEmpty(draft: AddActivityDraft): boolean {
  if (draft.name.trim() !== '') return false
  if (draft.totalUnits.trim() !== '') return false
  if (draft.currentPosition.trim() !== '') return false
  if (draft.type !== EMPTY_ADD_ACTIVITY_DRAFT.type) return false
  if (draft.subject !== EMPTY_ADD_ACTIVITY_DRAFT.subject) return false
  if (draft.minutes !== EMPTY_ADD_ACTIVITY_DRAFT.minutes) return false
  if (draft.frequency !== EMPTY_ADD_ACTIVITY_DRAFT.frequency) return false
  if (draft.scannable !== EMPTY_ADD_ACTIVITY_DRAFT.scannable) return false
  if (draft.quickLog !== EMPTY_ADD_ACTIVITY_DRAFT.quickLog) return false
  return true
}

/**
 * What the parent is told when a child change cleared an activity they had
 * started typing. `null` when there was nothing to lose.
 *
 * Names both boys where their names are known: "it wasn't added" without saying
 * *to whom* leaves the parent with the question this defect is about. Looked up
 * by the caller from the family's own children — identity, never a literal name
 * gate.
 */
export function addActivitySwitchNotice(
  hadTypedDraft: boolean,
  previousChildName?: string,
  nextChildName?: string,
): string | null {
  if (!hadTypedDraft) return null
  const whose = previousChildName ? ` for ${previousChildName}` : ''
  const nowOn = nextChildName ? ` This form now adds to ${nextChildName}'s curriculum.` : ''
  return `The activity you'd started${whose} was cleared — it was never added.${nowOn}`
}
