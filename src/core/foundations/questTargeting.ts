// ── Knowledge Mine ↔ Learner Model quest queue (FEAT-54, slice 2c) ────────
//
// The consuming side of the §11.5 hand-off. Slice 2a/2b's Review Chat writes
// `openQuestion { routedTo: 'quest', conceptId }` entries onto `learnerModels`
// as a durable "queued for testing" to-do list. This module lets the Knowledge
// Mine (a) pull those queued concepts into a session as **preferred concepts**
// (`selectQuestTargets`) and (b) fold the session's per-concept results back
// into the model at close (`computeQuestConceptResults` + `applyQuestResultsToModel`).
//
// All logic here is **pure** — no Firestore, no clock (callers pass `nowIso`).
// The thin async writer lives in `src/features/quest/questModelSync.ts`.
//
// Invariants this run holds (design §11.5, run boundaries):
//   • Upgrade-only, no-shame: a strong result may upgrade a concept; a struggle
//     appends evidence and leaves the state untouched. Quest evidence NEVER
//     downgrades a concept (FEAT-35/36 precedent).
//   • The `conceptualBlocks[]` steering path (invariant-protected `skillSnapshots`)
//     is untouched. This is a parallel, learner-model-only mechanism; the two are
//     deliberately not unified in this slice.
//   • Targets are a *seasoning* (default max 3 of a 10-question session), never
//     forced — they ride the adaptive engine as preferred topics only.

import { FOUNDATION_NODE_MAP } from './index'
import type {
  ConceptStateEntry,
  ConceptStateKind,
  EvidenceRef,
  LearnerModel,
  OpenQuestion,
} from '../types/learnerModel'

/**
 * A preferred concept handed to the quest generator: the graph node's kid-word
 * name + one-line description, so the prompt can weave it in at the child's level
 * without the parent-side vocabulary ever reaching the child.
 */
export interface QuestTargetConcept {
  conceptId: string
  name: string
  description: string
}

/**
 * The per-concept tally read back out of a finished session: how the child did on
 * the questions the AI stamped with this `targetConceptId` (skipped questions
 * excluded — a skip is not a wrong answer).
 */
export interface QuestConceptResult {
  conceptId: string
  correct: number
  total: number
}

/** The minimal answered-question shape this module reads (a `SessionQuestion` subset). */
export interface AnsweredConceptQuestion {
  targetConceptId?: string
  correct: boolean
  skipped?: boolean
}

/** Default cap: targets season a session, they are not the meal (a session is 10 questions). */
export const DEFAULT_MAX_QUEST_TARGETS = 3

/** True when a routed-to-quest ask is still waiting (unresolved) for a real graph concept. */
function isWaitingQuestAsk(q: OpenQuestion): boolean {
  return (
    q.routedTo === 'quest' &&
    !q.resolvedAt &&
    Boolean(FOUNDATION_NODE_MAP[q.conceptId])
  )
}

/**
 * Select the concepts a new quest session should prefer. Pulls the model's
 * **unresolved** `routedTo:'quest'` open questions (optionally domain-scoped so a
 * reading quest never pulls a math ask), **oldest first** (array order is
 * append-chronological), capped at `max`. Enriches each with its kid-word name +
 * description from the graph. Returns `[]` when nothing is queued — in which case
 * the session generates exactly as it does today (characterized in the tests).
 */
export function selectQuestTargets(
  model: Pick<LearnerModel, 'openQuestions'> | null | undefined,
  opts: { domain?: string; max?: number } = {},
): QuestTargetConcept[] {
  if (!model?.openQuestions?.length) return []
  const max = opts.max ?? DEFAULT_MAX_QUEST_TARGETS
  const seen = new Set<string>()
  const targets: QuestTargetConcept[] = []
  for (const q of model.openQuestions) {
    if (targets.length >= max) break
    if (!isWaitingQuestAsk(q)) continue
    const node = FOUNDATION_NODE_MAP[q.conceptId]
    if (opts.domain && node.domain !== opts.domain) continue
    if (seen.has(q.conceptId)) continue
    seen.add(q.conceptId)
    targets.push({
      conceptId: q.conceptId,
      name: node.kidName,
      description: node.parentDescription,
    })
  }
  return targets
}

/**
 * Group a finished session's answered questions by the `targetConceptId` the AI
 * stamped on them (the `targetedBlockerId` echo precedent), tallying correct/total
 * per concept. Only questions carrying a real target concept id count; skips are
 * excluded from both correct and total.
 *
 * `allowedConceptIds`, when supplied, restricts attribution to **this session's
 * selected targets** — a stamped id outside that set (the model asked for A, the
 * AI wandered to B) is dropped, so it never writes evidence, upgrades a state, or
 * resolves an ask for a concept the session was not actually testing. Omit it to
 * tally every stamped concept (used by the pure unit tests).
 */
export function computeQuestConceptResults(
  questions: readonly AnsweredConceptQuestion[],
  allowedConceptIds?: Iterable<string>,
): QuestConceptResult[] {
  const allow = allowedConceptIds ? new Set(allowedConceptIds) : null
  const byConcept = new Map<string, { correct: number; total: number }>()
  for (const q of questions) {
    const id = q.targetConceptId
    if (!id || !FOUNDATION_NODE_MAP[id] || q.skipped) continue
    if (allow && !allow.has(id)) continue // outside this session's selected targets — drop
    const tally = byConcept.get(id) ?? { correct: 0, total: 0 }
    tally.total += 1
    if (q.correct) tally.correct += 1
    byConcept.set(id, tally)
  }
  return [...byConcept.entries()].map(([conceptId, t]) => ({
    conceptId,
    correct: t.correct,
    total: t.total,
  }))
}

/** Rank for the upgrade-only guard: solid > forming > frontier > not-yet. */
const STATE_RANK: Record<ConceptStateKind, number> = {
  'not-yet': 0,
  frontier: 1,
  forming: 2,
  solid: 3,
}

/** The minimum targeted questions a concept needs before a result can move its state. */
export const MIN_QUESTIONS_TO_UPGRADE = 2

/**
 * The conservative upgrade rule (design §11.5, run Step 2):
 * - `forming` / `frontier` with **all** targeted questions correct (min 2) → `solid`.
 * - `not-yet` with all targeted questions correct (min 2) → **at most `forming`**.
 * - anything less (a wrong answer, or fewer than 2 questions) → state unchanged.
 *
 * Never downgrades: every branch is an upgrade, and a would-be lower target is
 * clamped up to the current state (no-shame — a struggle is evidence, not a loss).
 */
export function upgradedQuestState(
  from: ConceptStateKind,
  result: QuestConceptResult,
): ConceptStateKind {
  const allCorrect =
    result.total >= MIN_QUESTIONS_TO_UPGRADE && result.correct === result.total
  if (!allCorrect) return from

  let candidate: ConceptStateKind = from
  if (from === 'forming' || from === 'frontier') candidate = 'solid'
  else if (from === 'not-yet') candidate = 'forming'
  // Guard: never move below the current state.
  return STATE_RANK[candidate] > STATE_RANK[from] ? candidate : from
}

/** A one-line human note for a quest evidence ref. */
function questEvidenceNote(result: QuestConceptResult, dateSlice: string): string {
  const kidName = FOUNDATION_NODE_MAP[result.conceptId]?.kidName ?? result.conceptId
  return `Explored "${kidName}" in the Mine — ${result.correct}/${result.total}, ${dateSlice}`
}

export interface AppliedQuestResults {
  model: LearnerModel
  /** Concept ids whose state actually changed (for the change feed / recap). */
  changedConceptIds: string[]
}

/**
 * Fold a finished session's per-concept results into a stored model (pure, merge-
 * shaped). For each result it: appends a `quest` EvidenceRef to that concept's
 * entry; applies {@link upgradedQuestState}; appends a deterministic `changeFeed`
 * line **only on an actual state change** (`cause: 'quest: …'`); and marks any
 * matching `routedTo:'quest'` open question resolved (kept, not removed). Concepts
 * with no queued ask still get evidence + a possible upgrade — a queued ask is not
 * required to record what the child actually did.
 */
export function applyQuestResultsToModel(
  model: LearnerModel,
  results: readonly QuestConceptResult[],
  sessionId: string,
  nowIso: string,
): AppliedQuestResults {
  if (results.length === 0) return { model, changedConceptIds: [] }

  const dateSlice = nowIso.slice(0, 10)
  const conceptStates = { ...model.conceptStates }
  const changeFeed = [...model.changeFeed]
  const changedConceptIds: string[] = []
  const resolvedConcepts = new Set<string>()

  for (const result of results) {
    if (result.total === 0) continue
    const prev: ConceptStateEntry | undefined = conceptStates[result.conceptId]
    const fromState: ConceptStateKind = prev?.state ?? 'not-yet'
    const toState = upgradedQuestState(fromState, result)

    const evidence: EvidenceRef = {
      kind: 'quest',
      sourceId: sessionId,
      note: questEvidenceNote(result, dateSlice),
      observedAt: nowIso,
    }
    conceptStates[result.conceptId] = {
      state: toState,
      evidence: [...(prev?.evidence ?? []), evidence],
      seededAt: prev?.seededAt ?? nowIso,
    }

    if (toState !== fromState) {
      changedConceptIds.push(result.conceptId)
      changeFeed.push({
        conceptId: result.conceptId,
        from: fromState,
        to: toState,
        cause: `quest: ${result.correct}/${result.total} correct in the Mine → ${toState}`,
        at: nowIso,
      })
    }
    resolvedConcepts.add(result.conceptId)
  }

  // Resolve consumed asks — kept as additive history, no longer waiting.
  const openQuestions = model.openQuestions.map((q) =>
    q.routedTo === 'quest' && !q.resolvedAt && resolvedConcepts.has(q.conceptId)
      ? { ...q, resolvedAt: nowIso, resolvedBySessionId: sessionId }
      : q,
  )

  return {
    model: {
      ...model,
      conceptStates,
      openQuestions,
      changeFeed,
      updatedAt: nowIso,
    },
    changedConceptIds,
  }
}
