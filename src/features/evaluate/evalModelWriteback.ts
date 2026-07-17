// ── Guided evaluation → Learner Model write-back (FEAT-76) ────────────────
//
// The thin async writer that runs alongside the eval's snapshot apply. At apply
// time, `handleSaveAndApply` writes the invariant-protected `skillSnapshots` doc
// as it always has; this module additionally projects the eval's findings onto
// the child's `learnerModels/{childId}` concept states — the calibrated (up OR
// down) frontier write (FEAT-76). All the judgment is in the pure
// `evalModelSync` projector; this only reads the model, applies it, and
// merge-writes (the same merge-only convention the diag seeder, Review-Chat
// writer, and quest write-back use).
//
// Fire-and-forget by design: it NEVER blocks or fails the snapshot apply. The
// `skillSnapshots` write path is untouched and runs first, in `handleSaveAndApply`.

import { doc, getDoc, setDoc } from 'firebase/firestore'

import { learnerModelsCollection } from '../../core/firebase/firestore'
import {
  applyEvalFindingsToModel,
  computeEvalRead,
} from '../../core/foundations/evalModelSync'
import type { EvaluationFinding } from '../../core/types/evaluation'
import type { LearnerModel } from '../../core/types/learnerModel'

/**
 * Project a completed guided evaluation onto the child's learner model. No-ops
 * (no read, no write) when no finding maps to a real graph concept, or when the
 * child has no seeded model yet (the Review Chat / seeder feeds it first). A
 * guided eval is the strongest signal in the system, so this is the one writer
 * permitted to move a concept state DOWN toward the working edge — scoped to
 * `eval` evidence and frozen on parent attestations (see `evalModelSync`).
 *
 * @param sessionId the evaluation session doc id (stamped on the `eval` evidence)
 * @param findings  the session's findings (the eval's per-concept assessments)
 * @param nowIso    the apply timestamp (caller supplies the clock)
 */
export async function syncEvalFindingsToModel(
  familyId: string,
  childId: string,
  sessionId: string,
  findings: readonly EvaluationFinding[],
  nowIso: string,
): Promise<void> {
  try {
    const evalRead = computeEvalRead(findings)
    if (evalRead.length === 0) return // nothing the graph recognizes — no write

    const modelRef = doc(learnerModelsCollection(familyId), childId)
    const modelSnap = await getDoc(modelRef)
    if (!modelSnap.exists()) return // no seeded model yet — Review Chat feeds it first

    const model = modelSnap.data() as LearnerModel
    const { model: next } = applyEvalFindingsToModel(model, evalRead, sessionId, nowIso)

    // A guided eval always writes evidence and may move state; mark the LLM
    // synthesis stale (FEAT-57, D4) so the next beat regenerates whatMattersNext.
    next.synthesisStaleAt = nowIso

    // Merge-only, JSON-scrubbed to drop any `undefined` (Firestore rejects them),
    // exactly like the diag seeder and the other model writers.
    await setDoc(modelRef, JSON.parse(JSON.stringify(next)), { merge: true })
  } catch (err) {
    // Never let a model write-back break the snapshot apply — it is additive.
    console.warn('[eval] Failed to write eval findings back to learner model', err)
  }
}
