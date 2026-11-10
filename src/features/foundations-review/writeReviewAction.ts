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
// The scoped decision contract (FEAT-66). One-way: the drawer's basis definition
// is also what the transaction checks the STORED document against, so there is a
// single answer to "is this decision still the one that was made?".
import {
  conceptDecisionBasis,
  ReviewActionBasisError,
  sameConceptDecisionBasis,
  type ConceptDecisionBasis,
} from '../progress/conceptOverride'
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
 *
 * `expectStored` is **opt-in** (the Foundations tab's drawer passes it; the
 * Review Chat does not, and nothing about its write changes). When it is given,
 * the stored model must still be the one the parent decided against — see
 * {@link checkStoredBasis} — and otherwise nothing is written at all.
 */
export async function applyAndWriteReviewAction(
  modelRef: DocumentReference<LearnerModel>,
  fallbackBase: LearnerModel,
  action: FoundationsReviewAction,
  nowIso: string,
  expectStored?: StoredDecisionExpectation,
): Promise<LearnerModel> {
  return updateLearnerModelInTransaction<LearnerModel>(modelRef, (stored) => {
    // Before any merge is computed and before the fallback is considered — and
    // on EVERY attempt, because a transaction retry re-runs this callback
    // against a document that has since moved.
    if (expectStored) checkStoredBasis(stored, action, expectStored)
    const applied = applyReviewActionToModel(stored ?? fallbackBase, action, nowIso)
    return { merge: buildReviewActionMerge(applied), result: applied.model }
  })
}

/**
 * What a surface that staged a decision against a SPECIFIC stored state claims
 * is still true. Carried from the tap, not re-read at commit time — that is the
 * whole point of it.
 */
export interface StoredDecisionExpectation {
  /** The child the drawer captured at open. */
  childId: string
  /** The exact concept the staged intent names. */
  conceptId: string
  /** The evidence the displayed decision described. */
  basis: ConceptDecisionBasis
}

/**
 * Refuse a write whose basis is no longer the stored one. Throws
 * {@link ReviewActionBasisError} — no merge, no fallback, no partial state.
 *
 * There is no "write it anyway" branch, and in particular no falling back to the
 * caller's cached model: a missing document is a missing basis, and a decision
 * made about evidence cannot be applied to a document that does not have it.
 */
function checkStoredBasis(
  stored: LearnerModel | null,
  action: FoundationsReviewAction,
  expectStored: StoredDecisionExpectation,
): void {
  if (!stored) throw new ReviewActionBasisError('model-missing')
  if (stored.childId !== expectStored.childId || action.childId !== expectStored.childId) {
    throw new ReviewActionBasisError('child-mismatch')
  }
  if (action.conceptId !== expectStored.conceptId) {
    throw new ReviewActionBasisError('concept-mismatch')
  }
  const entry = stored.conceptStates?.[expectStored.conceptId]
  // An entry that has gone is not an empty basis that happens to match — the
  // concept the parent was looking at is not in the document any more.
  if (!entry) throw new ReviewActionBasisError('concept-missing')
  if (!sameConceptDecisionBasis(conceptDecisionBasis(entry), expectStored.basis)) {
    throw new ReviewActionBasisError('basis-stale')
  }
}
