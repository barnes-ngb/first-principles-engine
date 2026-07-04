// ── Foundations Review Chat: write layer (FEAT-51, slice 2a) ─────────────
//
// This MIRRORS the shellyChat portal's propose → confirm → write staging
// (`useShellyChatActions` / `parseChatActions`) but is a **separate, parallel**
// path so the existing shellyChat feature is left completely untouched (the run's HARD
// STOP): a distinct `FoundationsReviewAction` union, its own parser, and its own
// writer that touches **only** `learnerModels/{childId}`.
//
// The Review Chat AI proposes state changes as `<action>{...}</action>` blocks;
// the parent sees confirm cards; only a confirm tap calls the writer. Three write
// paths (design §11.2), the fourth path (not-yet / skip) emits nothing:
//   1. attest  → an `attestation` EvidenceRef; state per the parent's judgment,
//                may reach `solid` (highest-quality evidence, §3.2).
//   2. covered → a `curriculumPosition` EvidenceRef; state clamped to **at most
//                `forming`** (§13 covered ≠ mastered) + an `openQuestion`.
//   3. queueTest → an `openQuestion { routedTo: 'quest' }` (§11.5), deduped by
//                  concept, for the Knowledge Mine to consume (kid-produced
//                  evidence — quest-side intake is named follow-up slice 2c).
//
// The §13 clamp lives HERE, in code — never in the prompt: a `covered` proposal
// claiming `solid` is written as `forming` regardless of what the LLM emitted.

import { FOUNDATION_NODE_MAP } from '../../core/foundations'
import { sanitizeAndParseJson } from '../../core/utils/sanitizeJson'
import type {
  ConceptStateEntry,
  ConceptStateKind,
  EvidenceRef,
  LearnerModel,
  OpenQuestion,
} from '../../core/types/learnerModel'

/** The states an attestation may set. `not-yet` is unreachable — that is "skip". */
export type ReviewProposedState = 'solid' | 'forming' | 'frontier'

/**
 * The proposals the Review Chat can stage. A discriminated union that is the
 * structural allowlist for the write path — the writer rejects any other shape.
 */
export type FoundationsReviewAction =
  | {
      kind: 'attest'
      childId: string
      conceptId: string
      /** Parent's judgment; may be `solid` (attestation is top-quality evidence). */
      state: ReviewProposedState
      note?: string
    }
  | {
      kind: 'covered'
      childId: string
      conceptId: string
      /** The external program the parent named ("Fast Phonics"). */
      source: string
      unit?: string
      detail?: string
      /**
       * What the LLM *suggested* the state should be. IGNORED past the §13 cap:
       * the writer clamps `solid` → `forming` no matter what lands here.
       */
      proposedState?: ConceptStateKind
    }
  | { kind: 'queueTest'; childId: string; conceptId: string; reason?: string }

export interface ParsedReviewActions {
  actions: FoundationsReviewAction[]
  cleanText: string
}

const PROPOSED_STATES: readonly ConceptStateKind[] = [
  'solid',
  'forming',
  'frontier',
  'not-yet',
]

/**
 * The §13 clamp — the single enforcement point for "covered ≠ mastered."
 * `curriculumPosition` evidence alone can never reach `solid`; a claim of `solid`
 * becomes `forming`. `frontier` (below the cap) and `forming` pass through.
 */
export function clampCoveredState(proposed: ConceptStateKind): ConceptStateKind {
  return proposed === 'solid' ? 'forming' : proposed
}

/** Validate an arbitrary parsed payload against the review-action allowlist. */
function toReviewAction(payload: unknown): FoundationsReviewAction | null {
  if (typeof payload !== 'object' || payload === null) return null
  const obj = payload as Record<string, unknown>
  if (typeof obj.childId !== 'string' || obj.childId.length === 0) return null
  if (typeof obj.conceptId !== 'string' || !FOUNDATION_NODE_MAP[obj.conceptId]) {
    return null // must name a real graph concept
  }

  if (obj.kind === 'attest') {
    const state = obj.state
    if (state !== 'solid' && state !== 'forming' && state !== 'frontier') return null
    const note =
      typeof obj.note === 'string' && obj.note.trim().length > 0
        ? obj.note.trim()
        : undefined
    return { kind: 'attest', childId: obj.childId, conceptId: obj.conceptId, state, ...(note ? { note } : {}) }
  }

  if (obj.kind === 'covered') {
    if (typeof obj.source !== 'string' || obj.source.trim().length === 0) return null
    const unit = typeof obj.unit === 'string' && obj.unit.trim() ? obj.unit.trim() : undefined
    const detail = typeof obj.detail === 'string' && obj.detail.trim() ? obj.detail.trim() : undefined
    // Accept whatever state the LLM suggests (incl. `solid`) — the writer clamps it.
    const proposedState =
      typeof obj.proposedState === 'string' &&
      PROPOSED_STATES.includes(obj.proposedState as ConceptStateKind)
        ? (obj.proposedState as ConceptStateKind)
        : undefined
    return {
      kind: 'covered',
      childId: obj.childId,
      conceptId: obj.conceptId,
      source: obj.source.trim(),
      ...(unit ? { unit } : {}),
      ...(detail ? { detail } : {}),
      ...(proposedState ? { proposedState } : {}),
    }
  }

  if (obj.kind === 'queueTest') {
    const reason =
      typeof obj.reason === 'string' && obj.reason.trim() ? obj.reason.trim() : undefined
    return { kind: 'queueTest', childId: obj.childId, conceptId: obj.conceptId, ...(reason ? { reason } : {}) }
  }

  return null
}

/**
 * Extract all `<action>...</action>` blocks from a Review-Chat assistant message.
 * Mirrors `parseChatActions`: parse each payload (skip on failure), validate
 * against the allowlist, and return the surviving typed actions plus the message
 * text with every `<action>` block stripped for clean rendering.
 */
export function parseFoundationsReviewActions(raw: string): ParsedReviewActions {
  const actions: FoundationsReviewAction[] = []
  const regex = /<action>([\s\S]*?)<\/action>/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(raw)) !== null) {
    let payload: unknown
    try {
      payload = sanitizeAndParseJson(match[1])
    } catch {
      continue
    }
    const action = toReviewAction(payload)
    if (action) actions.push(action)
  }
  const cleanText = raw.replace(/<action>[\s\S]*?<\/action>/g, '').trim()
  return { actions, cleanText }
}

/** Rank for the "never downgrade" guard: solid > forming > frontier > not-yet. */
const STATE_RANK: Record<ConceptStateKind, number> = {
  'not-yet': 0,
  frontier: 1,
  forming: 2,
  solid: 3,
}

/**
 * Append an `openQuestion`, deduped by (conceptId, routedTo). A **resolved** entry
 * (FEAT-54, slice 2c — the kid already played that targeted quest) is treated as
 * non-blocking, so re-covering / re-queueing a concept after it was tested opens a
 * fresh ask rather than being silently swallowed by the historical resolved one.
 */
function withOpenQuestion(existing: OpenQuestion[], q: OpenQuestion): OpenQuestion[] {
  const dup = existing.some(
    (e) => e.conceptId === q.conceptId && e.routedTo === q.routedTo && !e.resolvedAt,
  )
  return dup ? existing : [...existing, q]
}

/**
 * The result of applying one confirmed action: the new model plus the concept id
 * whose entry changed (so the writer can merge just that entry). `changedConceptId`
 * is undefined for `queueTest` (it writes no state, only a queued check).
 */
export interface AppliedReviewAction {
  model: LearnerModel
  changedConceptId?: string
}

/**
 * Apply one confirmed Review-Chat action to a stored model. **Pure** — no
 * Firestore, no clock (the caller passes `nowIso`). This is where the §13 clamp,
 * the openQuestion dedup, and the minimal `changeFeed` append all live, so they
 * are all unit-testable in one place. The writer merges the result into
 * `learnerModels/{childId}`.
 */
export function applyReviewActionToModel(
  model: LearnerModel,
  action: FoundationsReviewAction,
  nowIso: string,
): AppliedReviewAction {
  const kidName = FOUNDATION_NODE_MAP[action.conceptId]?.kidName ?? action.conceptId
  const prev: ConceptStateEntry | undefined = model.conceptStates[action.conceptId]
  const fromState: ConceptStateKind = prev?.state ?? 'not-yet'

  if (action.kind === 'queueTest') {
    // No state change — only a queued kid-facing check + a minimal change line.
    const openQuestions = withOpenQuestion(model.openQuestions, {
      conceptId: action.conceptId,
      question: `Test "${kidName}" with a quick quest?`,
      routedTo: 'quest',
      reason: action.reason ?? 'Parent asked to verify this by testing.',
    })
    return {
      model: {
        ...model,
        openQuestions,
        changeFeed: [
          ...model.changeFeed,
          { conceptId: action.conceptId, from: fromState, to: fromState, cause: 'reviewChat: queued a testing check', at: nowIso },
        ],
        updatedAt: nowIso,
      },
    }
  }

  let toState: ConceptStateKind
  let evidence: EvidenceRef
  let cause: string
  let openQuestions = model.openQuestions

  if (action.kind === 'attest') {
    toState = action.state // may be solid — attestation is top-quality evidence
    evidence = {
      kind: 'attestation',
      sourceId: 'reviewChat',
      note: action.note ?? 'You confirmed you have seen this.',
      observedAt: nowIso,
      overriddenBy: 'parent',
    }
    cause = `reviewChat: you attested "${kidName}" as ${toState}`
  } else {
    // covered — §13 clamp: curriculumPosition alone caps at `forming`.
    const clamped = clampCoveredState(action.proposedState ?? 'forming')
    // Never downgrade a stronger standing state on a mere coverage claim.
    toState = STATE_RANK[fromState] > STATE_RANK[clamped] ? fromState : clamped
    const detailSuffix = action.detail ? ` — ${action.detail}` : ''
    const unitSuffix = action.unit ? ` ${action.unit}` : ''
    evidence = {
      kind: 'curriculumPosition',
      sourceId: action.source,
      note: `Covered in ${action.source}${unitSuffix}${detailSuffix}`,
      observedAt: nowIso,
      source: action.source,
      ...(action.unit ? { unit: action.unit } : {}),
      ...(action.detail ? { detail: action.detail } : {}),
      via: 'manual',
    }
    cause = `reviewChat: covered in ${action.source} (capped at ${toState})`
    // covered attaches a "verify with a quest?" openQuestion (§11.2 path 2).
    openQuestions = withOpenQuestion(model.openQuestions, {
      conceptId: action.conceptId,
      question: `Verify "${kidName}" with a quick quest?`,
      routedTo: 'quest',
      reason: `Covered in ${action.source}; confirm mastery with a kid-facing check.`,
    })
  }

  const newEntry: ConceptStateEntry = {
    state: toState,
    evidence: [...(prev?.evidence ?? []), evidence],
    seededAt: prev?.seededAt ?? nowIso,
  }

  return {
    model: {
      ...model,
      conceptStates: { ...model.conceptStates, [action.conceptId]: newEntry },
      openQuestions,
      changeFeed: [
        ...model.changeFeed,
        { conceptId: action.conceptId, from: fromState, to: toState, cause, at: nowIso },
      ],
      updatedAt: nowIso,
    },
    changedConceptId: action.conceptId,
  }
}
