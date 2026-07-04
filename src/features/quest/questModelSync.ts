// ── Quest → Learner Model write-back (FEAT-54, slice 2c) ─────────────────
//
// The thin async writer for the §11.5 hand-off's consuming side. At session
// close, the Knowledge Mine folds the child's per-concept results back into the
// learner model: `quest` evidence appended, a conservative upgrade applied, the
// consumed `openQuestions` resolved. All the judgment is in the pure
// `questTargeting` helpers; this module only reads the model, applies them, and
// merge-writes `learnerModels/{childId}` (the same merge-only convention the diag
// seeder and the Review-Chat write layer use).
//
// Fire-and-forget by design: it NEVER blocks or fails the quest close. The
// existing quest → snapshot / findings pipeline is untouched and runs in parallel.
// The invariant-protected `skillSnapshots.conceptualBlocks[]` steering path is not
// read or written here — this is a separate, learner-model-only mechanism.

import { doc, getDoc, setDoc } from 'firebase/firestore'

import { learnerModelsCollection } from '../../core/firebase/firestore'
import {
  applyQuestResultsToModel,
  computeQuestConceptResults,
} from '../../core/foundations/questTargeting'
import type { AnsweredConceptQuestion } from '../../core/foundations/questTargeting'
import type { LearnerModel } from '../../core/types/learnerModel'

/**
 * Fold a finished session's targeted-concept results into the child's learner
 * model. No-ops (no read, no write) when the session tagged no concepts — the
 * overwhelming common case, so an untargeted quest never touches the model.
 *
 * Attribution is restricted to `allowedConceptIds` — the concepts this session was
 * actually seeded to test (`targetConceptsRef`). A `targetConceptId` the AI stamped
 * outside that set is dropped before any evidence write, upgrade, or ask-resolution,
 * so a wandering stamp can never move a concept the parent did not queue.
 *
 * @param questions         the session's answered questions (each may carry `targetConceptId`)
 * @param allowedConceptIds this session's selected target concept ids
 * @param nowIso            the session-close timestamp (caller supplies the clock)
 */
export async function syncQuestResultsToModel(
  familyId: string,
  childId: string,
  sessionId: string,
  questions: readonly AnsweredConceptQuestion[],
  allowedConceptIds: readonly string[],
  nowIso: string,
): Promise<void> {
  try {
    if (allowedConceptIds.length === 0) return // no selected targets — nothing to attribute
    const results = computeQuestConceptResults(questions, allowedConceptIds)
    if (results.length === 0) return // no selected concept was probed — nothing to write

    const modelRef = doc(learnerModelsCollection(familyId), childId)
    const modelSnap = await getDoc(modelRef)
    if (!modelSnap.exists()) return // no seeded model yet — the Review Chat feeds it first

    const model = modelSnap.data() as LearnerModel
    const { model: next } = applyQuestResultsToModel(model, results, sessionId, nowIso)

    // Merge-only, JSON-scrubbed to drop any `undefined` (Firestore rejects them),
    // exactly like the diag seeder and the other model writers.
    await setDoc(modelRef, JSON.parse(JSON.stringify(next)), { merge: true })
  } catch (err) {
    // Never let a model write-back break the quest close — it is additive.
    console.warn('[quest] Failed to write quest results back to learner model', err)
  }
}
