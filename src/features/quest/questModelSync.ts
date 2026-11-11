// ── Saved quest source → Learner Model projection (FEAT-54 / UX-494) ──────
//
// The thin async writer for the §11.5 hand-off's consuming side. At session
// close, the Knowledge Mine folds the child's per-concept results back into the
// learner model: `quest` evidence appended, a conservative upgrade applied, the
// consumed `openQuestions` resolved. All the judgment is in the pure
// `questTargeting` helpers; this module reads, applies them, and writes.
//
// ── What UX-494 changed, and why ──────────────────────────────────────────
//
// It used to be handed the live run's in-memory answers and target ids, and it
// ran unconditionally at close. Three things followed:
//
//   • a session whose own `setDoc` was DENIED still wrote evidence and closed a
//     parent's request — the graph recorded a source that does not exist;
//   • an insufficient close (two tagged answers, then a null provider response)
//     saved `partial` and changed the graph anyway, past the completion gate
//     every other close side effect respects;
//   • nothing could be recovered after a reload, because the inputs lived in a
//     ref that a reload destroys.
//
// So the projection now reads its inputs from the SAVED SOURCE, inside the same
// transaction as the model. That one change answers all three: there is no
// projection without an acknowledged committed source; the source's own `status`
// carries the completion gate; and a failure is recoverable from the document
// alone, by anybody, after any reload.
//
// One transaction, results folded INSIDE it (FEAT-242). This writer sent the
// WHOLE model as its merge payload, so a read-then-write gap could revert every
// concept at once. The payload shape is unchanged; its atomicity is not.

import { doc } from 'firebase/firestore'

import { learnerModelsCollection } from '../../core/firebase/firestore'
import { questSourceRef } from './questSourceWrites'
import { updateLearnerModelInTransaction } from '../../core/firebase/modelTransaction'
import { promotedModelStatus } from '../../core/foundations/modelStatus'
import {
  applyQuestResultsToModel,
  computeQuestConceptResults,
  parseQuestTargetPlan,
} from '../../core/foundations/questTargeting'
import type { EvaluationSession } from '../../core/types'
import type { InteractiveSessionData } from './questTypes'

/**
 * What one projection attempt decided. Every value is honest about what did or
 * did not reach the model — in particular, the three that write nothing are three
 * different facts and are deliberately not collapsed into one "ok".
 */
export type QuestProjectionOutcome =
  /** Evidence, state, change history and the selected requests were written. */
  | 'projected'
  /** This source was already folded in. Converged; nothing repeated. */
  | 'already-projected'
  /** The source carries no selected request — nothing to attribute. */
  | 'no-targets'
  /** No selected concept was probed by a usable answer — honestly empty. */
  | 'no-results'
  /** There is no learner model document for this child yet. */
  | 'no-model'
  /** The source is not an acknowledged, sufficient, complete source. */
  | 'not-finalized'
  /** The source is missing, or is not the run/child/family this call is for. */
  | 'identity-mismatch'

/**
 * Outcomes that wrote evidence, or found it already written.
 *
 * The complement is NOT "failed": every value of {@link QuestProjectionOutcome}
 * is a settled attempt, because a failure throws. So a surface reads this to
 * decide whether it may say the map moved, and says nothing of the sort for the
 * five honest no-ops.
 */
export function projectionReachedGraph(outcome: QuestProjectionOutcome): boolean {
  return outcome === 'projected' || outcome === 'already-projected'
}

export interface ProjectQuestSourceArgs {
  familyId: string
  /** The child the caller believes owns this source. Checked, not trusted. */
  childId: string
  /** The `evaluationSessions` document id — also the run id and the evidence `sourceId`. */
  sessionId: string
  /** When supplied, the source must be stamped with exactly this run. */
  expectedRunId?: string
  nowIso: string
}

type StoredSource = Partial<EvaluationSession & InteractiveSessionData>

/**
 * Project an acknowledged, sufficient, completed quest source onto the child's
 * learner model — once.
 *
 * **Throws** on a transport or contention failure, and the transaction rolls
 * back, so pending work stays pending and nothing half-lands. Callers catch and
 * record the failure against the source (see `markQuestProjectionFailed`); this
 * function's job is to be correct, not to be silent.
 *
 * Concurrent and ambiguous retries converge: the source stamp, the per-concept
 * and per-source evidence dedup, and the exact-row request check are all inside
 * the one transaction, so a second retry finds the work done and repeats no
 * completion side effect.
 */
export async function projectQuestSourceToModel(
  args: ProjectQuestSourceArgs,
): Promise<QuestProjectionOutcome> {
  const { familyId, childId, sessionId, expectedRunId, nowIso } = args
  if (!familyId || !childId || !sessionId) return 'identity-mismatch'

  const modelRef = doc(learnerModelsCollection(familyId), childId)
  const sessionRef = questSourceRef(familyId, sessionId)

  return updateLearnerModelInTransaction<QuestProjectionOutcome>(modelRef, async (model, tx) => {
    // Every read first — Firestore's rule, and the reason the helper writes only
    // after `compute` resolves.
    const snap = await tx.get(sessionRef)
    if (!snap.exists()) return { result: 'identity-mismatch' }
    const source = snap.data() as StoredSource

    // ── Identity ────────────────────────────────────────────
    if (source.childId !== childId) return { result: 'identity-mismatch' }
    if (source.sessionType !== 'interactive') return { result: 'identity-mismatch' }
    if (expectedRunId && source.questRunId !== expectedRunId) return { result: 'identity-mismatch' }

    // ── The gates ───────────────────────────────────────────
    // Acknowledged (a commit stamp), and sufficient (the existing completion
    // gate, carried on the record as `complete`). A legacy source with no stamp
    // is not projected by this path — it was written before the repair and
    // nothing records what it selected.
    if (!source.sourceCommittedAt) return { result: 'not-finalized' }
    if (source.status !== 'complete') return { result: 'not-finalized' }
    if (source.modelProjection === 'projected') return { result: 'already-projected' }

    // ── The plan and the results, both from the SOURCE ──────
    const plan = parseQuestTargetPlan(source.targetPlan)
    if (plan.length === 0) {
      tx.set(sessionRef, projectionStamp('skipped', 'no-targets', nowIso), { merge: true })
      return { result: 'no-targets' }
    }
    const results = computeQuestConceptResults(
      source.questions ?? [],
      plan.map((row) => row.conceptId),
    )
    if (results.length === 0) {
      tx.set(sessionRef, projectionStamp('skipped', 'no-results', nowIso), { merge: true })
      return { result: 'no-results' }
    }

    // An absent model is not a failure and not a success. The Review Chat and
    // the Foundations tab own creating one; this records what it found and makes
    // no claim about evidence.
    if (!model) {
      tx.set(sessionRef, projectionStamp('skipped', 'no-model', nowIso), { merge: true })
      return { result: 'no-model' }
    }

    const { model: next, changedConceptIds, projectedConceptIds } = applyQuestResultsToModel(
      model,
      results,
      sessionId,
      nowIso,
      { plan },
    )

    if (projectedConceptIds.length === 0) {
      // Every eligible concept already carries this source's evidence — a replay.
      // Stamp it so the next reader stops asking, and write no model change.
      tx.set(sessionRef, projectionStamp('projected', 'already-projected', nowIso), { merge: true })
      return { result: 'already-projected' }
    }

    // A quest write-back that moved concept state marks the LLM synthesis stale
    // (FEAT-57, D4) so the next beat regenerates whatMattersNext/narrative. Only
    // when something actually changed — evidence-only appends don't invalidate it.
    if (changedConceptIds.length > 0) next.synthesisStaleAt = nowIso

    // UX-322 — a quest result is real evidence even when it moved no state
    // (upgrade-only), so promote a model still stamped `no-data`. Shared rule.
    const promoted = promotedModelStatus(next)
    if (promoted) next.status = promoted

    tx.set(sessionRef, projectionStamp('projected', 'projected', nowIso), { merge: true })
    return { merge: next, result: 'projected' }
  })
}

/** The source-side record of a projection attempt that settled. */
function projectionStamp(
  state: NonNullable<InteractiveSessionData['modelProjection']>,
  outcome: QuestProjectionOutcome,
  nowIso: string,
) {
  return {
    modelProjection: state,
    modelProjectionOutcome: outcome,
    modelProjectedAt: nowIso,
  }
}
