// ── When the Foundations tab creates a learner model, and what it says ────
//
// Pure. The tab holds the state; this file holds the decision and the words, so
// both are testable without rendering Firestore.
//
// **The rule is create-only** (UX-286). The seeder is destructive to
// non-derivable evidence — UX-290 narrowed that a great deal, but a re-seed still
// recomputes every band-derived state and appends no `changeFeed` line for the
// moves it makes — so bootstrapping must never become something that runs on a
// page view. It fires exactly when the snapshot has resolved and the document is
// absent, for a profile that may write.

import type { LearnerModel } from '../../core/types/learnerModel'

export interface BootstrapDecisionInput {
  /** Parent capability — never a name. A kid may read a terrain, never create one. */
  canEdit: boolean
  /** `useLearnerModel().loading` — true until the first snapshot resolves. */
  loading: boolean
  /** `useLearnerModel().model` — null means "resolved, and the document is absent". */
  model: LearnerModel | null
  familyId: string | undefined
  childId: string | undefined
  /** True once this (family, child) pair has been attempted on this mount. */
  alreadyAttempted: boolean
}

/**
 * Whether to create this child's learner model now.
 *
 * `loading === false && model === null` is the load-bearing distinction
 * `useLearnerModel` documents: the snapshot resolved *and* the document does not
 * exist. Acting mid-load would seed over a model that is simply still in flight.
 */
export function shouldBootstrapLearnerModel(input: BootstrapDecisionInput): boolean {
  if (!input.canEdit) return false
  if (!input.familyId || !input.childId) return false
  if (input.loading) return false
  if (input.model !== null) return false
  return !input.alreadyAttempted
}

/** Said while the create-only write is in flight. */
export function bootstrapRunningLine(childName: string): string {
  return `Setting up ${childName}'s map…`
}

/**
 * Said when it failed. A real sentence and a retry — the failure used to be a
 * `console.warn` in a panel nobody opens.
 */
export const BOOTSTRAP_FAILED_LINE =
  'Could not set up this map. Nothing was changed — try again.'
export const BOOTSTRAP_RETRY_LABEL = 'Try again'

/**
 * The empty state (UX-287). It used to read *"Do a Knowledge Mine round or a
 * Foundations review to start filling this in"* — and **neither could work**: a
 * Mine round returns at `!modelSnap.exists()`, and a Review Chat confirm hit a
 * `console.warn` and returned with the card still reading *pending*.
 *
 * With the bootstrap in place, "no model" is no longer the common empty case. The
 * common case is a map that **exists and holds nothing yet**, so the copy is
 * written for that: what it is, and the routes that actually reach it from here.
 *
 * **Knowledge Mine is deliberately not named.** A Mine session can only answer
 * concepts already queued as open questions, so on an empty map it moves nothing —
 * naming it would be the same defect in a new sentence.
 *
 * **It asserts nothing about the child.** An empty map is an empty map, not a
 * claim about what anyone can do. The routes are parent work, so they are gated on
 * **capability**; a kid reading this tab gets the first line only.
 */
export function emptyFoundationsLines(childName: string, canEdit: boolean): string[] {
  const first = `Nothing has been recorded on ${childName}'s map yet — it fills in as evidence comes in.`
  if (!canEdit) return [first]
  return [
    first,
    'The quickest way to start is the Foundations Review card above: a short chat about what you have already seen. A guided evaluation, or a scanned or typed workbook position, lands here too.',
  ]
}
