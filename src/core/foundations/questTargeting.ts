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
  /**
   * UX-494 — a question the child skipped because the question itself was broken.
   * It is not evidence about the child any more than a skip is, and the snapshot
   * pipeline has excluded it from `answeredOnly` since the partials work; this
   * module excluded only `skipped`, so a flagged row still counted toward a
   * concept's `total` and could hold an all-correct upgrade back (or, flagged
   * after a correct answer, count toward one).
   */
  flaggedAsError?: boolean
}

// ── The selected request identity (UX-494) ──────────────────────────────────
//
// A session used to carry only the concept IDS it was seeded with, and close
// resolved **any** unresolved `routedTo:'quest'` ask for a probed concept. So a
// request appended while the child was playing — a struggle chip tapped on
// Today, a parent queueing the same concept in the Review Chat — was consumed by
// a run that never saw it, and the thing the parent had just asked for read
// "tested ✓". The session now carries the exact ROW it selected, and close
// re-verifies that row before resolving it.
//
// What is captured is deliberately an identity, never the ask's words:
// `OpenQuestion.question` / `.reason` are parent-facing prose (and `question`
// carries the parent's own vocabulary), which has no business being stored on a
// kid session document. The digest is what travels.

/**
 * One selected request, by identity: which concept, which row of the model's
 * append-ordered `openQuestions`, a digest of that row's immutable fields, and
 * the model document's own `seededAt` — so a replaced model document (a re-seed
 * that rebuilt the queue) fails the check rather than resolving a row that
 * happens to sit at the same index.
 */
export interface QuestAskPlanRow {
  conceptId: string
  /** Index in `model.openQuestions` at selection time. Producers append. */
  rowIndex: number
  /** Digest of the row's immutable fields — never the prose itself. */
  digest: string
  /** The model's `seededAt` when the plan was selected. */
  modelSeededAt: string
}

/** The row fields a digest is taken over. */
type DigestableAsk = Pick<OpenQuestion, 'conceptId' | 'routedTo' | 'question' | 'reason'>

/**
 * A stable, short digest of an ask row's immutable fields (FNV-1a, 32-bit).
 *
 * Not a security primitive and not trying to be: it exists so the stored plan can
 * say *this exact row* without storing the row, and so an edited or replaced row
 * stops matching. Deterministic across reloads and devices, which a hash with a
 * runtime seed would not be.
 */
export function questAskDigest(ask: DigestableAsk): string {
  const material = [ask.conceptId, ask.routedTo, ask.question ?? '', ask.reason ?? ''].join('\u0000')
  let hash = 0x811c9dc5
  for (let i = 0; i < material.length; i += 1) {
    const code = material.charCodeAt(i)
    hash = Math.imul(hash ^ (code & 0xff), 0x01000193) >>> 0
    hash = Math.imul(hash ^ (code >>> 8), 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * Capture the plan for a session that selected `conceptIds` — the first still-
 * waiting quest row per concept, which is exactly the row {@link selectQuestTargets}
 * chose (oldest first, one per concept). A concept with no waiting row contributes
 * nothing: the session may still gather evidence for it, it just has no request to
 * resolve. Returns `[]` for an absent model or an empty selection.
 */
export function captureQuestTargetPlan(
  model: Pick<LearnerModel, 'openQuestions' | 'seededAt'> | null | undefined,
  conceptIds: readonly string[],
): QuestAskPlanRow[] {
  if (!model || conceptIds.length === 0) return []
  const rows = model.openQuestions ?? []
  const modelSeededAt = typeof model.seededAt === 'string' ? model.seededAt : ''
  const taken = new Set<number>()
  const plan: QuestAskPlanRow[] = []
  for (const conceptId of conceptIds) {
    const idx = rows.findIndex(
      (q, i) => !taken.has(i) && q.routedTo === 'quest' && !q.resolvedAt && q.conceptId === conceptId,
    )
    if (idx < 0) continue
    taken.add(idx)
    plan.push({
      conceptId,
      rowIndex: idx,
      digest: questAskDigest(rows[idx]),
      modelSeededAt,
    })
  }
  return plan
}

/**
 * Read a stored plan back off a session document. Both payload generations go
 * through here: a legacy partial saved before the plan existed has no field at
 * all and gets an EMPTY list — which is the whole point, because the alternative
 * (a warm hook keeping the previous run's targets in a ref) is how one run's
 * close attributed another run's concepts. A malformed row is dropped rather
 * than guessed at; dropping one can only narrow attribution.
 */
export function parseQuestTargetPlan(raw: unknown): QuestAskPlanRow[] {
  if (!Array.isArray(raw)) return []
  const plan: QuestAskPlanRow[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const row = entry as Partial<QuestAskPlanRow>
    if (typeof row.conceptId !== 'string' || row.conceptId.trim() === '') continue
    if (typeof row.rowIndex !== 'number' || !Number.isInteger(row.rowIndex) || row.rowIndex < 0) continue
    if (typeof row.digest !== 'string' || row.digest.trim() === '') continue
    if (typeof row.modelSeededAt !== 'string') continue
    plan.push({
      conceptId: row.conceptId,
      rowIndex: row.rowIndex,
      digest: row.digest,
      modelSeededAt: row.modelSeededAt,
    })
  }
  return plan
}

/**
 * Is this still the exact row the session selected, and still waiting?
 *
 * False for: a different model document, an index that no longer exists, a row
 * whose concept or route moved, a row whose prose was rewritten (digest), and a
 * row already resolved by someone else. A later appended request for the same
 * concept sits at a different index and therefore stays open.
 */
export function questAskRowMatches(
  model: Pick<LearnerModel, 'openQuestions' | 'seededAt'>,
  row: QuestAskPlanRow,
): boolean {
  if ((typeof model.seededAt === 'string' ? model.seededAt : '') !== row.modelSeededAt) return false
  const ask = (model.openQuestions ?? [])[row.rowIndex]
  if (!ask) return false
  if (ask.resolvedAt) return false
  if (ask.routedTo !== 'quest') return false
  if (ask.conceptId !== row.conceptId) return false
  return questAskDigest(ask) === row.digest
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
 * per concept. Only questions carrying a real target concept id count; skips and
 * questions flagged as broken are excluded from both correct and total.
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
    if (!id || !FOUNDATION_NODE_MAP[id] || q.skipped || q.flaggedAsError) continue
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
  /**
   * UX-494 — concept ids this call actually wrote this source's evidence onto.
   *
   * Empty on a replay of a source already folded in, which is how the writer
   * tells "nothing to do, converge" from "projected something". Without it a
   * second pass over the same source looked identical to the first.
   */
  projectedConceptIds: string[]
}

/** Options for {@link applyQuestResultsToModel}. */
export interface ApplyQuestResultsOptions {
  /**
   * The session's selected request identities (UX-494). Supplied by the real
   * quest path on every call; when supplied, **only** these exact rows may be
   * resolved, and only once {@link questAskRowMatches} still agrees.
   *
   * Omitted (the pure unit tests) keeps the original behaviour: resolve any
   * unresolved quest ask for a probed concept.
   */
  plan?: readonly QuestAskPlanRow[]
  /**
   * When the child ANSWERED (UX-494) — the saved source's own `evaluatedAt`.
   *
   * Evidence is dated by observation; `nowIso` dates the model's freshness
   * (`updatedAt`, `synthesisStaleAt`, the change line, the resolved ask). A
   * retry a day after the quest must not post-date the evidence or backdate the
   * model. Defaults to `nowIso`, which is what every pre-UX-494 caller did.
   */
  observedAt?: string
}

/**
 * Fold a finished session's per-concept results into a stored model (pure, merge-
 * shaped). For each result it: appends a `quest` EvidenceRef to that concept's
 * entry; applies {@link upgradedQuestState}; appends a deterministic `changeFeed`
 * line **only on an actual state change** (`cause: 'quest: …'`); and marks the
 * session's own `routedTo:'quest'` open question resolved (kept, not removed).
 * Concepts with no queued ask still get evidence + a possible upgrade — a queued
 * ask is not required to record what the child actually did.
 *
 * **Deduplicated per concept AND source (UX-494).** A concept whose entry already
 * carries a `quest` ref with this `sessionId` is skipped entirely — before the
 * evidence append, before the state rule, before the change line and before the
 * ask. Replaying one source used to append a second identical ref, and two
 * all-correct passes over a `forming` concept could promote it twice (to `solid`,
 * then record a second change line saying so).
 */
export function applyQuestResultsToModel(
  model: LearnerModel,
  results: readonly QuestConceptResult[],
  sessionId: string,
  nowIso: string,
  opts: ApplyQuestResultsOptions = {},
): AppliedQuestResults {
  if (results.length === 0) {
    return { model, changedConceptIds: [], projectedConceptIds: [] }
  }

  const observedAt = opts.observedAt ?? nowIso
  const dateSlice = observedAt.slice(0, 10)
  const conceptStates = { ...model.conceptStates }
  const changeFeed = [...model.changeFeed]
  const changedConceptIds: string[] = []
  const projectedConceptIds: string[] = []
  const resolvedConcepts = new Set<string>()

  for (const result of results) {
    if (result.total === 0) continue
    const prev: ConceptStateEntry | undefined = conceptStates[result.conceptId]
    // Per concept and source: this source has already been folded into this
    // concept, so there is nothing left for it to do here.
    if ((prev?.evidence ?? []).some((e) => e.kind === 'quest' && e.sourceId === sessionId)) {
      continue
    }
    const fromState: ConceptStateKind = prev?.state ?? 'not-yet'
    const toState = upgradedQuestState(fromState, result)
    const establishesState = result.total >= MIN_QUESTIONS_TO_UPGRADE && result.correct === result.total

    const evidence: EvidenceRef = {
      kind: 'quest',
      sourceId: sessionId,
      note: questEvidenceNote(result, dateSlice),
      observedAt,
      ...(establishesState ? { readState: toState } : {}),
    }
    conceptStates[result.conceptId] = {
      // Spread first (FEAT-242): `needsReconcile` and any later field survive a
      // write that has no opinion about them.
      ...(prev ?? {}),
      state: toState,
      evidence: [...(prev?.evidence ?? []), evidence],
      seededAt: prev?.seededAt ?? nowIso,
      // A failed/short round leaves state unchanged by design; it cannot settle
      // the unsupported state retained after an ambiguous completion withdrawal.
      ...(establishesState && prev?.completionReviewNeeded ? { completionReviewNeeded: false } : {}),
    }
    projectedConceptIds.push(result.conceptId)

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
  //
  // With a plan (every real close), ONLY the exact rows this session selected are
  // eligible, and each is re-verified against the model as it stands now. A
  // request appended after the session started sits at another index and stays
  // open; an original that someone else already resolved, or whose row moved,
  // stays as found.
  const plan = opts.plan
  const openQuestions = plan
    ? model.openQuestions.map((q, i) => {
        const row = plan.find((r) => r.rowIndex === i)
        if (!row) return q
        if (!resolvedConcepts.has(row.conceptId)) return q
        if (!questAskRowMatches(model, row)) return q
        return { ...q, resolvedAt: nowIso, resolvedBySessionId: sessionId }
      })
    : model.openQuestions.map((q) =>
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
    projectedConceptIds,
  }
}
