// ── Saved quest source → Learner Model projection (FEAT-54 / UX-494) ──────
//
// The consuming side of the §11.5 hand-off: a finished session's per-concept
// results folded back into the learner model — `quest` evidence appended, the
// conservative upgrade applied, the consumed `openQuestions` resolved. All the
// judgment is in the pure `questTargeting` helpers; this module reads, applies
// them, and writes.
//
// It used to be handed the live run's in-memory answers and run unconditionally
// at close. Three things followed: a session whose own save was DENIED still
// wrote evidence and closed a parent's request; an insufficient close (two
// tagged answers, then a null provider response) changed the graph past the
// completion gate; and nothing was recoverable after a reload, because the
// inputs lived in a ref.
//
// So the projection reads its inputs from the SAVED SOURCE, inside the same
// transaction as the model (FEAT-242 — the read, the computation and the write
// in one unit, because `{ merge: true }` replaces an array wholesale and these
// payloads are arrays).

import { doc } from 'firebase/firestore'

import { learnerModelsCollection } from '../../core/firebase/firestore'
import { questSourceRef } from './questSourceWrites'
import { updateLearnerModelInTransaction } from '../../core/firebase/modelTransaction'
import { FOUNDATION_NODE_MAP } from '../../core/foundations'
import { promotedModelStatus } from '../../core/foundations/modelStatus'
import {
  applyQuestResultsToModel,
  computeQuestConceptResults,
  parseQuestTargetPlan,
} from '../../core/foundations/questTargeting'
import { hasSufficientCompletion } from './questBanking'
import { mineAdditionProbeResult } from './mineAdditionProbe'
import type { EvaluationSession } from '../../core/types'
import type { InteractiveSessionData, SessionQuestion } from './questTypes'

/**
 * What one projection attempt decided. The values that write no evidence are
 * separate facts and are deliberately not collapsed into one "ok" — a surface
 * that cannot tell them apart is how a saved source got reported as a projected
 * one.
 */
export type QuestProjectionOutcome =
  /** Evidence, state, change history and the selected requests were written. */
  | 'projected'
  /** This source was already folded in. Converged; nothing repeated. */
  | 'already-projected'
  /** The source carries no selected request in its own domain — nothing to attribute. */
  | 'no-targets'
  /** No selected concept was probed by a counted answer — honestly empty. */
  | 'no-results'
  /** There is no learner model document for this child yet. */
  | 'no-model'
  /** The source is not an acknowledged, sufficient, complete source. */
  | 'not-finalized'
  /** Missing, corrupt, or not the run/child/domain this call is for. */
  | 'identity-mismatch'

/**
 * Outcomes that wrote evidence, or found it already written.
 *
 * The complement is NOT "failed": every outcome is a settled attempt, because a
 * failure throws. A surface reads this to decide whether it may say the map
 * moved, and says nothing of the sort for the four honest no-ops.
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
  /** The application clock. Model freshness; never the evidence's own time. */
  nowIso: string
  /** When known, the source's domain must be exactly this. */
  expectedDomain?: string
  /** When known, the source's mode must be exactly this. */
  expectedQuestMode?: string
}

type StoredSource = Partial<EvaluationSession & InteractiveSessionData>

/** A stored `questions` array we are willing to count. Corrupt input refuses. */
function readStoredQuestions(source: StoredSource): SessionQuestion[] | null {
  if (!Array.isArray(source.questions)) return null
  for (const q of source.questions) {
    if (!q || typeof q !== 'object') return null
    if (typeof (q as SessionQuestion).correct !== 'boolean') return null
  }
  return source.questions as SessionQuestion[]
}

/**
 * Project an acknowledged, sufficient, completed quest source onto the child's
 * learner model — once.
 *
 * **Throws** on a transport or contention failure, and the transaction rolls
 * back, so the source stays `pending` and nothing half-lands. There is no
 * separate failure stamp: `pending` already means "not applied", which is what
 * the recovery query reads, so a lost response and a rejected attempt leave the
 * same recoverable state.
 *
 * Concurrent and ambiguous retries converge: the source stamp, the per-concept
 * and per-source evidence dedup, and the exact-row request check are all inside
 * the one transaction, so a second retry finds the work done and repeats no
 * completion side effect.
 */
export async function projectQuestSourceToModel(
  args: ProjectQuestSourceArgs,
): Promise<QuestProjectionOutcome> {
  const { familyId, childId, sessionId, nowIso, expectedDomain, expectedQuestMode } = args
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
    // The run id must BE the document id: a source whose `questRunId` names
    // another document is a mis-stamped record, and the evidence `sourceId` this
    // projection writes is the document id.
    if (source.sessionType !== 'interactive') return { result: 'identity-mismatch' }
    if (source.childId !== childId) return { result: 'identity-mismatch' }
    if (source.questRunId !== sessionId) return { result: 'identity-mismatch' }
    if (expectedDomain && source.domain !== expectedDomain) return { result: 'identity-mismatch' }
    if (expectedQuestMode && source.questMode !== expectedQuestMode) {
      return { result: 'identity-mismatch' }
    }
    // A model belonging to another child cannot receive this child's evidence.
    if (model && model.childId && model.childId !== childId) {
      return { result: 'identity-mismatch' }
    }

    // ── The gates ───────────────────────────────────────────
    if (!source.sourceCommittedAt) return { result: 'not-finalized' }
    if (source.status !== 'complete') return { result: 'not-finalized' }
    if (source.modelProjection === 'projected') return { result: 'already-projected' }

    const questions = readStoredQuestions(source)
    if (!questions) return { result: 'identity-mismatch' } // corrupt — refuse, don't guess
    // The existing completion gate, re-applied to what was actually STORED
    // rather than trusting the `complete` label a writer put on it.
    if (!hasSufficientCompletion(questions)) return { result: 'not-finalized' }

    // ── The plan and the results, both from the SOURCE ──────
    // Domain-scoped: a reading session may not resolve a math request, which is
    // the same rule `selectQuestTargets` applies when it hands targets out.
    const plan = parseQuestTargetPlan(source.targetPlan).filter(
      (row) => FOUNDATION_NODE_MAP[row.conceptId]?.domain === source.domain,
    )
    /**
     * UX-495 — the Mine addition pilot's ONE observation, read and validated
     * from this same saved source.
     *
     * Kept separate from the plan on both sides. It is not a queued request, so
     * it resolves none (the `plan` below is still the only thing
     * `applyQuestResultsToModel` may resolve, and for this pilot it is empty —
     * a same-concept ask queued while the run was in progress stays waiting).
     * And it is not counted by concept id across the stored answers: only the
     * single validated probe row counts, so a provider question that echoed the
     * same concept can never add a second observation.
     */
    const probe = mineAdditionProbeResult(source, questions)
    if (plan.length === 0 && !source.pilotProbe) {
      tx.set(sessionRef, projectionStamp('skipped', 'no-targets', nowIso), { merge: true })
      return { result: 'no-targets' }
    }
    const planResults =
      plan.length > 0
        ? computeQuestConceptResults(
            questions,
            plan.map((row) => row.conceptId),
          )
        : []
    const results =
      probe && !planResults.some((r) => r.conceptId === probe.conceptId)
        ? [...planResults, probe]
        : planResults
    if (results.length === 0) {
      tx.set(sessionRef, projectionStamp('skipped', 'no-results', nowIso), { merge: true })
      return { result: 'no-results' }
    }

    // An absent model is neither a failure nor a success. The Review Chat and
    // the Foundations tab own creating one, so this leaves the source PENDING:
    // the work is still real and still waiting, and a model created tomorrow can
    // still receive it.
    if (!model) return { result: 'no-model' }

    // Evidence is dated when the child ANSWERED (the source's own
    // `evaluatedAt`); the model's freshness is dated when this write applied. A
    // retry hours or days later must not backdate the model or post-date the
    // evidence.
    const observedAt = typeof source.evaluatedAt === 'string' ? source.evaluatedAt : nowIso

    const { model: next, changedConceptIds, projectedConceptIds } = applyQuestResultsToModel(
      model,
      results,
      sessionId,
      nowIso,
      { plan, observedAt },
    )

    if (projectedConceptIds.length === 0) {
      // Every eligible concept already carries this source's evidence — a replay.
      // Stamp it so the next reader stops asking, and write no model change.
      tx.set(sessionRef, projectionStamp('projected', 'already-projected', nowIso), { merge: true })
      return { result: 'already-projected' }
    }

    // A write-back that moved concept state marks the LLM synthesis stale
    // (FEAT-57, D4). Only when something actually changed.
    if (changedConceptIds.length > 0) next.synthesisStaleAt = nowIso

    // UX-322 — a quest result is real evidence even when it moved no state
    // (upgrade-only), so promote a model still stamped `no-data`.
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
