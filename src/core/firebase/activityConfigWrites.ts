// ── The `activityConfigs` write core (FEAT-143) ──────────────────────────
//
// One implementation of each curriculum write, so Progress → Curriculum and a
// Shelly-chat confirm card perform the **same** write rather than two that
// merely look alike. `useActivityConfigs` is the component-shaped wrapper — it
// owns the subscription, the migration, and the default-seeding side effects —
// and these are the writes it wraps, lifted out so a non-component caller can
// reach them without mounting a hook. That is the move
// `updateActivityConfigMinutes` made for FEAT-135, generalized to the three
// writes this slice needs; the hook now delegates, so there is exactly one
// definition of each and no second write lane to `activityConfigs`.
//
// **No delete here, on purpose.** The chat's only removal is *completion* —
// retire, don't delete, the same stance the watch library takes. `deleteConfig`
// stays on the hook, reachable only from the Curriculum surface.
//
// **Nothing retroactive.** Every write here changes what FUTURE plans read. No
// `dayLog` is touched — not today's, not this week's, not a past one — no
// applied week is re-planned, and no already-recorded minute moves. Hours
// already logged are a child's school record; a forward-looking curriculum
// change must never restate history.

import { doc, updateDoc, writeBatch } from 'firebase/firestore'

import { syncWorkbookPositionToModel } from '../foundations/workbookPositionSync'
import type { ActivityFrequency, ActivityType, SubjectBucket } from '../types/enums'
import { activityConfigsCollection, db } from './firestore'

/** The fields a new `activityConfigs` doc is created from. */
export interface NewActivityConfig {
  name: string
  type: ActivityType
  subjectBucket: SubjectBucket
  defaultMinutes: number
  frequency: ActivityFrequency
  childId: string | 'both'
  sortOrder: number
  scannable: boolean
  curriculum?: string
  totalUnits?: number
  currentPosition?: number
  unitLabel?: string
  notes?: string
  /** FEAT-199: offer this on Kid Today's quick-log row. Omitted = not offered. */
  quickLog?: boolean
}

/**
 * DATA-08: workbooks are per-child (same curriculum, different lessons → a
 * separate config per child), so a workbook-type config may never be owned by
 * `'both'`. `'both'` stays legitimate for shared *routines*. A `'both'` workbook
 * surfaces to every child through the `in [childId,'both']` reader, which is how
 * London ended up seeing Lincoln's GATB workbooks.
 */
export function isWorkbookOwnerInvalid(
  type: ActivityType | undefined,
  childId: string | undefined,
): boolean {
  return type === 'workbook' && childId === 'both'
}

/**
 * The owner rule's message, in the one place it is written.
 *
 * The chat quotes this verbatim when it drops a proposal that violates the rule,
 * so a parent reads the same sentence the Curriculum surface would have thrown —
 * one rule, one wording (the `DAY_ITEM_NOTICES` pattern, FEAT-142).
 */
export const WORKBOOK_OWNER_REASON =
  'Workbook activities must belong to a specific child, not "both". Assign it to a child.'

/** Throws if a workbook-type config would be saved as `childId: 'both'`. */
export function assertWorkbookOwner(
  type: ActivityType | undefined,
  childId: string | undefined,
): void {
  if (isWorkbookOwnerInvalid(type, childId)) {
    throw new Error(WORKBOOK_OWNER_REASON)
  }
}

/**
 * Create one `activityConfigs` doc. Returns the new doc id.
 *
 * Lands `completed: false` and the created/updated stamps, and refuses a
 * `'both'` workbook via {@link assertWorkbookOwner} — the backstop behind the
 * chat's own validation and resolution gates, and the reason a bad proposal can
 * never be written even if both of those were bypassed.
 *
 * The caller supplies `sortOrder`; this module never picks one, because "end of
 * the list" is a fact about a list the caller is holding, not about a doc.
 */
export async function addActivityConfig(
  familyId: string,
  data: NewActivityConfig,
): Promise<string> {
  assertWorkbookOwner(data.type, data.childId)
  const now = new Date().toISOString()
  const ref = doc(activityConfigsCollection(familyId))
  const batch = writeBatch(db)
  batch.set(ref, {
    ...data,
    id: ref.id,
    completed: false,
    createdAt: now,
    updatedAt: now,
  })
  await batch.commit()
  return ref.id
}

/**
 * Mark one activity finished — the app's *retire* verb.
 *
 * A completed config stops appearing in future plans and moves to Curriculum's
 * read-only "Completed" list. Everything already logged against it stays exactly
 * where it is: this writes three fields on one doc and touches no day, no hour,
 * and no artifact.
 *
 * **There is no un-complete affordance anywhere in the app.** The Completed
 * section renders; it does not edit, and nothing writes `completed: false` onto
 * an existing doc (only creation paths set it). Any surface offering this must
 * say so before the tap.
 */
export async function completeActivityConfig(
  familyId: string,
  activityConfigId: string,
): Promise<void> {
  const now = new Date().toISOString()
  const ref = doc(activityConfigsCollection(familyId), activityConfigId)
  await updateDoc(ref, {
    completed: true,
    completedDate: now,
    updatedAt: now,
  })
}

/**
 * The workbook identity a position write folds into the learner model (FEAT-63).
 * Structurally satisfied by a full `ActivityConfig`.
 */
export interface PositionSyncTarget {
  name?: string
  curriculum?: string
  childId?: string
}

/**
 * Fire the FEAT-63 learner-model position sync for a manual config edit.
 *
 * No-ops for a shared (`'both'`) config and for a config with no resolvable
 * workbook name — workbooks are per-child (DATA-08), and the bridge matches on
 * the name. Fire-and-forget, `learnerModels`-only.
 */
export function syncActivityPositionToModel(
  familyId: string,
  target: PositionSyncTarget | undefined,
  position: number,
): void {
  if (!familyId || !target) return
  const { childId } = target
  if (!childId || childId === 'both') return
  const workbookName = target.name ?? target.curriculum
  if (!workbookName) return
  void syncWorkbookPositionToModel(
    familyId,
    childId,
    { workbookName, position, via: 'manual' },
    new Date().toISOString(),
  )
}

/**
 * Set one activity's `currentPosition` — "he's on lesson 107 now".
 *
 * **This field has two writers and they can race.** The scan pipeline
 * (`updateActivityConfigPosition`, workbook photo analysis) sets the same field
 * by curriculum-name match after a page scan, and a parent can set it from
 * Curriculum or from a chat confirm card at any moment. There is no lock and
 * none is wanted: **last writer wins.** The field is a bookmark a human corrects
 * whenever it is wrong, both writers are idempotent single-field updates, and a
 * lost update costs one re-statement of a number the parent can see on screen —
 * far less than the cost of a lock a phone-first app would have to explain.
 *
 * Fires the FEAT-63 learner-model sync when `syncTarget` names a per-child
 * workbook, so a position set from chat folds into the model exactly as one set
 * from Curriculum does.
 */
export async function setActivityConfigPosition(
  familyId: string,
  activityConfigId: string,
  position: number,
  syncTarget?: PositionSyncTarget,
): Promise<void> {
  const ref = doc(activityConfigsCollection(familyId), activityConfigId)
  await updateDoc(ref, {
    currentPosition: position,
    updatedAt: new Date().toISOString(),
  })
  syncActivityPositionToModel(familyId, syncTarget, position)
}
