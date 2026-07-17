// ── Guided evaluation → Learner Model projection (FEAT-76) ────────────────
//
// The pure projector for the **highest-confidence** signal in the system: a
// deliberate, parent-led diagnostic. It is the calibrated sibling of
// `questTargeting.applyQuestResultsToModel` — same concept graph, same
// `STATE_RANK` vocabulary, same merge-shaped purity — with one deliberate
// divergence, owner-confirmed (FEAT-76):
//
//   **Source confidence gates downgrade.** Derived/automated signals (quest
//   results, workbook curriculum-position) stay upgrade-only (FEAT-35/36). A
//   guided evaluation is **calibrated**: it may move a concept UP *or DOWN*
//   toward the working edge, because a parent-led diagnostic is the strongest
//   evidence we have. Where the quest/workbook writers clamp to never-downgrade,
//   this one permits movement in *either* direction — scoped to `eval` evidence.
//
// Three guardrails make that safe and on-ethos (all enforced here, all tested):
//   1. **Targeted, not a re-seed.** Only the concepts the eval actually assessed
//      are touched; every other concept (incl. quest-earned states) is left
//      exactly as-is. Nothing unrelated can regress.
//   2. **Attestation-frozen.** A parent `attestation` EvidenceRef is never
//      silently overwritten: a disagreeing eval appends its `eval` evidence and
//      flags the concept `needsReconcile` for the Foundations tab to surface
//      (the FEAT-49 §6.3 / DispositionProfile "view & reconcile" precedent).
//      Non-attested states move freely.
//   3. **No-shame (ETHOS-02).** A downward move updates state + evidence, but the
//      `changeFeed` entry reads as "back to the working edge" / "still forming",
//      never "regressed", "dropped", or "lost". Upgrades keep their one-
//      directional celebratory framing.
//
// The read state per assessed concept comes from the finding's own `status` —
// the eval's direct per-concept assessment — expressed in the concept-state
// vocabulary. This is NOT a second copy of the working-level→band map: it is the
// eval's assessment itself. The node id it lands on routes through the SAME
// shared `mapFindingToNode` bridge the seeder and Learning Map use, so the eval
// read can never silently disagree with the deterministic layer on *which*
// concept a finding is about.

import { FOUNDATION_NODE_MAP } from './index'
import { mapFindingToNode } from '../curriculum/mapFindingToNode'
import type { EvaluationFinding } from '../types/evaluation'
import type {
  ConceptStateEntry,
  ConceptStateKind,
  EvidenceRef,
  LearnerModel,
} from '../types/learnerModel'

/** Rank for the calibration guard: solid > forming > frontier > not-yet. */
const STATE_RANK: Record<ConceptStateKind, number> = {
  'not-yet': 0,
  frontier: 1,
  forming: 2,
  solid: 3,
}

/**
 * Finding status → concept-state read.
 *
 * Note the deliberate `'not-yet' → 'frontier'` bridge: an EvaluationFinding
 * `'not-yet'` means "tested, not there yet" — the child was assessed and sits at
 * the working edge. The concept-state `'not-yet'` means the opposite ("we
 * haven't seen it"), which a just-tested skill never is. So a tested-but-not-yet
 * finding reads as `frontier` (the positive framing of "the edge we're working
 * at"), never concept-`not-yet`. `'not-tested'` yields no read at all.
 */
const FINDING_STATUS_TO_STATE: Partial<Record<EvaluationFinding['status'], ConceptStateKind>> = {
  mastered: 'solid',
  emerging: 'forming',
  'not-yet': 'frontier',
}

/** The neutral, no-shame word for a concept-state in change-feed / evidence prose. */
const STATE_EDGE_WORD: Record<ConceptStateKind, string> = {
  solid: 'solid',
  forming: 'still forming',
  frontier: 'at the working edge',
  'not-yet': 'just getting started',
}

/** One assessed concept's eval read: the target state + a human evidence note. */
export interface EvalConceptRead {
  conceptId: string
  state: ConceptStateKind
  /** Human one-liner for the `eval` EvidenceRef shown on tap (no-shame). */
  note: string
}

/** A short, factual evidence note for one finding on a concept. */
function evalEvidenceNote(conceptId: string, finding: EvaluationFinding): string {
  const kidName = FOUNDATION_NODE_MAP[conceptId]?.kidName ?? conceptId
  const detail = finding.evidence?.trim() || STATE_EDGE_WORD[FINDING_STATUS_TO_STATE[finding.status] ?? 'not-yet']
  return `Guided eval — "${kidName}": ${detail}`
}

/**
 * Project a finished guided evaluation's findings onto per-concept target
 * states. **Pure** — the eval's read of each concept it assessed.
 *
 * Targeting: a finding contributes only when its skill tag maps (via the shared
 * `mapFindingToNode` bridge) to a real foundation graph concept; `not-tested`
 * findings and unmapped tags are dropped. When several findings land on the same
 * concept, the **highest-ranked** (most generous) read wins — demonstrated
 * partial mastery is never erased by a co-located struggle (no-shame). The
 * returned list is exactly the set of concepts the eval will touch.
 */
export function computeEvalRead(
  findings: readonly EvaluationFinding[],
): EvalConceptRead[] {
  const byConcept = new Map<string, { state: ConceptStateKind; note: string }>()
  for (const finding of findings) {
    const state = FINDING_STATUS_TO_STATE[finding.status]
    if (!state) continue // 'not-tested' — the eval read nothing here
    const conceptId = mapFindingToNode(finding.skill)
    if (!conceptId || !FOUNDATION_NODE_MAP[conceptId]) continue // not a graph concept
    const prev = byConcept.get(conceptId)
    if (!prev || STATE_RANK[state] > STATE_RANK[prev.state]) {
      byConcept.set(conceptId, { state, note: evalEvidenceNote(conceptId, finding) })
    }
  }
  return [...byConcept.entries()].map(([conceptId, v]) => ({
    conceptId,
    state: v.state,
    note: v.note,
  }))
}

/** True when a concept's evidence carries a durable parent `attestation`. */
function hasAttestation(entry: ConceptStateEntry | undefined): boolean {
  return Boolean(entry?.evidence?.some((e) => e.kind === 'attestation'))
}

/**
 * Build the deterministic `changeFeed` cause line for an eval-driven move.
 * Upward moves keep the celebratory one-directional framing; downward moves use
 * neutral, no-shame wording — never "regress", "drop", or "lost" (ETHOS-02).
 */
function evalChangeCause(
  conceptId: string,
  from: ConceptStateKind,
  to: ConceptStateKind,
): string {
  const kidName = FOUNDATION_NODE_MAP[conceptId]?.kidName ?? conceptId
  if (STATE_RANK[to] < STATE_RANK[from]) {
    return `revisiting — guided eval showed "${kidName}" is ${STATE_EDGE_WORD[to]}`
  }
  return `guided eval: "${kidName}" → ${to}`
}

export interface AppliedEvalFindings {
  model: LearnerModel
  /** Concept ids whose state actually moved (for the change feed / staleness). */
  changedConceptIds: string[]
}

/**
 * Fold a guided eval's per-concept reads into a stored model (pure, merge-
 * shaped). For each assessed concept it:
 *   - appends an `eval` EvidenceRef;
 *   - sets the concept to the eval's read — **calibrated**, up OR down (the
 *     deliberate divergence from the upgrade-only quest/workbook writers);
 *   - EXCEPT when the concept carries a parent `attestation` and the eval
 *     disagrees: then the state is left as attested, the `eval` evidence is
 *     appended, and `needsReconcile` is flagged (guardrail 2);
 *   - appends a `changeFeed` line on an actual state change, with no-shame
 *     wording for downward moves (guardrail 3).
 *
 * Concepts not present in `evalRead` are left exactly as-is (guardrail 1).
 */
export function applyEvalFindingsToModel(
  model: LearnerModel,
  evalRead: readonly EvalConceptRead[],
  sessionId: string,
  nowIso: string,
): AppliedEvalFindings {
  if (evalRead.length === 0) return { model, changedConceptIds: [] }

  const conceptStates = { ...model.conceptStates }
  const changeFeed = [...model.changeFeed]
  const changedConceptIds: string[] = []

  for (const read of evalRead) {
    const prev: ConceptStateEntry | undefined = conceptStates[read.conceptId]
    const fromState: ConceptStateKind = prev?.state ?? 'not-yet'
    const evidence: EvidenceRef = {
      kind: 'eval',
      sourceId: sessionId,
      note: read.note,
      observedAt: nowIso,
    }
    const nextEvidence = [...(prev?.evidence ?? []), evidence]

    // Guardrail 2 — attestation-frozen. A parent's deliberate word is never
    // auto-flipped: append the eval evidence, flag for reconcile, keep the state.
    if (hasAttestation(prev) && read.state !== fromState) {
      conceptStates[read.conceptId] = {
        ...(prev as ConceptStateEntry),
        evidence: nextEvidence,
        needsReconcile: true,
        seededAt: prev?.seededAt ?? nowIso,
      }
      continue
    }

    // Calibrated — the eval read wins outright (up OR down). Clear any prior
    // reconcile flag now that the eval and the stored state agree.
    conceptStates[read.conceptId] = {
      state: read.state,
      evidence: nextEvidence,
      seededAt: prev?.seededAt ?? nowIso,
      ...(prev?.needsReconcile ? { needsReconcile: false } : {}),
    }

    if (read.state !== fromState) {
      changedConceptIds.push(read.conceptId)
      changeFeed.push({
        conceptId: read.conceptId,
        from: fromState,
        to: read.state,
        cause: evalChangeCause(read.conceptId, fromState, read.state),
        at: nowIso,
      })
    }
  }

  return {
    model: { ...model, conceptStates, changeFeed, updatedAt: nowIso },
    changedConceptIds,
  }
}
