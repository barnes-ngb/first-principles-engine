// ── The single learner-model write for a confirmed review action (FEAT-66) ──
//
// Extracted verbatim from `useFoundationsReview.applyAction` so there is exactly
// ONE place that knows the merge shape for a confirmed `FoundationsReviewAction`.
// Two surfaces now write attestations — the Foundations Review Chat and the
// Foundations tab's concept override — and both go through here. There is no
// second writer, and no second definition of the payload.
//
// Shape rules (all load-bearing, all preserved from the original):
//   - **merge-only** (`setDoc(..., { merge: true })`) — a model write never
//     replaces the document.
//   - **single-key `conceptStates`** — only the one entry that changed is written,
//     never the whole map, so concurrent writers can't clobber each other.
//   - `synthesisStaleAt` is stamped with the same `updatedAt`: a confirmed action
//     changed concept state, so the stored synthesis is now behind (FEAT-57, D4).
//   - `openQuestions` / `changeFeed` ride along as whole arrays (the projector
//     returns them already-appended).
//   - `status` rides along ONLY when this write promotes the model off `no-data`
//     (UX-322), through the shared `promotedModelStatus` rule. A `queueTest`
//     appends no evidence and so promotes nothing.
//
// `learnerModels` only. No `skillSnapshots`, no XP, no compliance/hours.

import { setDoc } from 'firebase/firestore'
import type { DocumentReference } from 'firebase/firestore'

import { updateLearnerModelInTransaction } from '../../core/firebase/modelTransaction'
import { promotedModelStatus } from '../../core/foundations/modelStatus'
import {
  applyReviewActionToModel,
  type AppliedReviewAction,
  type FoundationsReviewAction,
} from './foundationsReviewActions'
import type { LearnerModel } from '../../core/types/learnerModel'

/**
 * The exact merge payload for one applied action. Pure — unit-tested directly,
 * which is what makes "the merge shape lives in one place" checkable.
 */
export function buildReviewActionMerge(
  applied: AppliedReviewAction,
): Partial<LearnerModel> {
  const { model, changedConceptId } = applied
  const merge: Record<string, unknown> = {
    openQuestions: model.openQuestions,
    changeFeed: model.changeFeed,
    updatedAt: model.updatedAt,
    // Mark the LLM synthesis stale — a confirmed action changed concept state, so
    // `whatMattersNext`/`narrative` are now behind (FEAT-57, D4).
    synthesisStaleAt: model.updatedAt,
  }
  if (changedConceptId) {
    merge.conceptStates = { [changedConceptId]: model.conceptStates[changedConceptId] }
  }
  // UX-322 — an attestation or a named curriculum position is real evidence; a
  // model still stamped `no-data` is promoted so the five status-keyed consumers
  // stop reading it as nothing.
  const status = promotedModelStatus(model)
  if (status) merge.status = status
  return merge as Partial<LearnerModel>
}

/** Merge-write one applied action. Throws on failure — callers decide how to surface it. */
export async function writeReviewAction(
  modelRef: DocumentReference<LearnerModel>,
  applied: AppliedReviewAction,
): Promise<void> {
  await setDoc(modelRef, buildReviewActionMerge(applied), { merge: true })
}

/**
 * Apply one confirmed action and persist it — **transactionally** (FEAT-242),
 * returning the model the document now holds.
 *
 * Both callers hold the model as plain client state: the Foundations tab from
 * the `useLearnerModel` snapshot, the Review-Chat hook from a copy it loaded
 * when the session opened. Applying against that copy and writing the result was
 * a lost update with a long window — the Review-Chat copy can be minutes old,
 * and `conceptStates.<id>.evidence` is an array, which `{ merge: true }`
 * replaces wholesale. A confirmed program completion, a quest close or an eval
 * landing in that window was dropped from the one concept the parent happened to
 * be attesting.
 *
 * So the action is **recomputed inside the transaction**, against the stored
 * model, and `fallbackBase` is used only when the document genuinely does not
 * exist. The caller must update its own cache from the RESOLVED value, never
 * before the commit: the callback can run more than once.
 */
export async function applyAndWriteReviewAction(
  modelRef: DocumentReference<LearnerModel>,
  fallbackBase: LearnerModel,
  action: FoundationsReviewAction,
  nowIso: string,
): Promise<LearnerModel> {
  return updateLearnerModelInTransaction<LearnerModel>(modelRef, (stored) => {
    const applied = applyReviewActionToModel(stored ?? fallbackBase, action, nowIso)
    return { merge: buildReviewActionMerge(applied), result: applied.model }
  })
}
