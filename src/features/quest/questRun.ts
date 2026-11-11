// ── One quest run, frozen (UX-494) ─────────────────────────────────────────
//
// A session's identity used to live in six mutable refs — the id, domain, mode,
// targets, owner and the shared idle-aware timer — and `endSession` read them
// AFTER awaiting an AI summary. Hold a Math summary, tap *Try another quest*,
// Start Phonics, and the Math close resumed to find every ref pointing at the
// Phonics run: it wrote Math's answers under the Phonics id and mode, backfilled
// Math's reward keys against that id, and stopped the Phonics timer.
//
// A run is frozen into ONE object before any await; every write a close makes
// resolves through it. The live refs still drive question GENERATION. Pure: no
// React, no Firestore, no clock of its own.

import type { EvaluationDomain } from '../../core/types/enums'
import type { QuestAskPlanRow } from '../../core/foundations/questTargeting'
import type { EvaluationFinding, EvaluationSession } from '../../core/types'
import type {
  InteractiveSessionData,
  QuestMode,
  QuestQuestion,
  QuestState,
  SessionQuestion,
} from './questTypes'

/**
 * Everything a close needs to know, captured once.
 *
 * `runId` IS the `evaluationSessions` document id, so the run and the record
 * cannot drift apart: the reward dedup keys, the completion-bonus key, the
 * word-progress stamp and the evidence `sourceId` all derive from it.
 *
 * `instanceId` is the LIVE identity, and it is not the same question. Resume
 * deliberately reuses a saved `runId`, so two mounts of one saved source share
 * it — and a guard that compared only the id let an old mount's awaited question,
 * skip, summary or retry land on the new one. `instanceId` is unique per
 * established run, including a re-Resume of the same document.
 */
export interface QuestRun {
  runId: string
  instanceId: string
  familyId: string
  childId: string
  childName: string
  domain: EvaluationDomain
  questMode?: QuestMode
  /** The exact queued requests this run selected. Empty when nothing was queued. */
  targetPlan: QuestAskPlanRow[]
  startedAt: string
}

/** The run id for a session started now. One shape, one place — unchanged. */
export function questRunId(childId: string, startedAtMs: number): string {
  return `interactive_${childId}_${startedAtMs}`
}

/**
 * The stamp the next run id is built from — strictly increasing. `Date.now()`
 * alone can repeat (two taps in one millisecond), and two runs sharing an id
 * share a document, a reward key set and an evidence `sourceId`.
 */
export function nextRunStamp(previousStamp: number, nowMs: number): number {
  return nowMs > previousStamp ? nowMs : previousStamp + 1
}

/**
 * What a Start decided — reported rather than swallowed, because three of these
 * mean *nothing happened and nothing was spent*.
 */
export type QuestStartOutcome =
  /** Established and running, with its first question on screen. */
  | 'started'
  /** The identity this card was rendered under is no longer the live one. */
  | 'stale-scope'
  /** Nothing settled to start FOR — no family, no child. */
  | 'unsettled-scope'
  /** A Start is already in flight; this tap is not a second one. */
  | 'busy'
  /** A run is already established; a second tap does not replace it. */
  | 'already-running'
  /** The provider failed or answered unusably. The intro offers a fresh Start. */
  | 'failed'

/** A fresh live identity for an established run. Monotonic per hook. */
export function questRunInstanceId(runId: string, sequence: number): string {
  return `${runId}#${sequence}`
}

/**
 * Is `run` still the hook's live run? Compares the LIVE identity, so a second
 * Resume of one saved source does not inherit the first mount's callbacks.
 */
export function isLiveRun(live: QuestRun | null | undefined, run: QuestRun): boolean {
  return Boolean(live) && live!.instanceId === run.instanceId
}

// ── The scope a recovery control is allowed to act in ───────────────────────

/**
 * The settled identity a recovery read or write belongs to.
 *
 * A string rather than an object so a captured value can be compared after an
 * await by equality, which is what makes an A → B → A switch fail the check:
 * `identityEpoch` moves on every switch even when family and child come back.
 */
export function questRecoveryScopeKey(input: {
  familyId: string | null | undefined
  childId: string | null | undefined
  profile: string | null | undefined
  identityEpoch: number
}): string {
  return `${input.familyId ?? ''}|${input.childId ?? ''}|${input.profile ?? ''}|${input.identityEpoch}`
}

/**
 * May this surface act on a SAVED source right now?
 *
 * The child has to be the ACTIVE one, not merely on the roster: this control
 * writes evidence and resolves a parent's queued request, and a card rendered
 * for the boy on screen must not be able to do that for his brother because a
 * retained callback still held his id.
 */
export function mayRecoverQuestSource(
  scope: { familyId: string | null | undefined; childId: string | null | undefined },
  payload: { familyId: string; childId: string },
): boolean {
  if (!scope.familyId || !scope.childId) return false
  if (!payload.familyId || !payload.childId) return false
  return payload.familyId === scope.familyId && payload.childId === scope.childId
}

/**
 * May this surface retry a payload the RUN still holds in memory?
 *
 * A different question, deliberately: the payload is a particular run's own and
 * carries that run's child, which UX-339 says every write of that session
 * belongs to however the header has since moved. So the active child is NOT the
 * test — refusing on it would throw away answers a child gave because a parent
 * tapped another chip. What must hold is the FAMILY: a payload may never be
 * written into a family nobody is authorised for.
 */
export function mayRetrySavingQuestPayload(
  scope: { familyId: string | null | undefined },
  payload: { familyId: string; childId: string },
): boolean {
  if (!scope.familyId) return false
  if (!payload.familyId || !payload.childId) return false
  return payload.familyId === scope.familyId
}

// ── The final payload ──────────────────────────────────────────────────────

/** Inputs for the one immutable final payload a run writes. */
export interface FinalizedQuestSourceInput {
  run: QuestRun
  questions: SessionQuestion[]
  finalState: QuestState
  timedOut: boolean
  findings: EvaluationFinding[]
  recommendations: EvaluationSession['recommendations']
  summary: string
  streakDays: number
  /** The existing conservative completion gate — `hasSufficientCompletion`. */
  sufficient: boolean
  nowIso: string
}

/**
 * Build a run's one immutable final payload.
 *
 * Every field comes from the frozen run or from arguments the caller captured
 * before its first await, so the payload cannot acquire a newer run's id, mode,
 * domain, child or plan between being composed and being written.
 *
 * It carries NO `savedQuestState` / `savedCurrentQuestion`: a finalized source
 * is not resumable, and a resume point left on one is how a finished session
 * reappeared on the resume card.
 */
export function finalizedQuestSourcePayload(
  input: FinalizedQuestSourceInput,
): EvaluationSession & InteractiveSessionData {
  const { run, questions, finalState, timedOut, sufficient, nowIso } = input
  const skippedCount = questions.filter((q) => q.skipped).length
  const flaggedErrorCount = questions.filter((q) => q.flaggedAsError).length
  // Only a sufficient close with a selected request has anything to project. An
  // ordinary untagged quest is `skipped` from the moment it is written, so the
  // close makes no model attempt and no surface ever offers it a retry.
  const eligible = sufficient && run.targetPlan.length > 0

  return {
    childId: run.childId,
    domain: run.domain,
    status: sufficient ? 'complete' : 'partial',
    messages: [],
    findings: input.findings,
    recommendations: input.recommendations,
    summary: input.summary,
    evaluatedAt: nowIso,
    sessionType: 'interactive',
    questMode: run.questMode,
    questions,
    finalLevel: finalState.currentLevel,
    totalCorrect: finalState.totalCorrect,
    totalQuestions: finalState.totalQuestions,
    diamondsMined: finalState.totalCorrect,
    streakDays: input.streakDays,
    timedOut,
    skippedCount: skippedCount || undefined,
    flaggedErrorCount: flaggedErrorCount || undefined,
    // ── The source record ────────────────────────────────────
    questRunId: run.runId,
    targetPlan: run.targetPlan,
    sourceCommittedAt: nowIso,
    modelProjection: eligible ? 'pending' : 'skipped',
    modelProjectionOutcome: eligible
      ? 'pending'
      : sufficient
        ? 'no-targets'
        : 'insufficient-completion',
  }
}

/** Inputs for the resumable partial a run writes when the child exits early. */
export interface ResumableQuestSourceInput {
  run: QuestRun
  questions: SessionQuestion[]
  questState: QuestState
  currentQuestion: QuestQuestion | null
  findings: EvaluationFinding[]
  bonusRoundUsed: boolean
  streakDays: number
  nowIso: string
}

/**
 * Build the resumable partial — unchanged in shape and wording from what
 * `resetToIntro` already wrote, plus the run id and the selected plan.
 *
 * Saving the PLAN is what makes cold and warm Resume agree: it comes back off
 * the exact partial that was reopened, so a hook still holding the previous
 * run's targets cannot lend them to this one, and a legacy partial with no plan
 * field resumes with an empty target list either way.
 */
export function resumableQuestSourcePayload(
  input: ResumableQuestSourceInput,
): EvaluationSession & InteractiveSessionData {
  const { run, questions, questState, nowIso } = input
  const skippedCount = questions.filter((q) => q.skipped).length
  const flaggedErrorCount = questions.filter((q) => q.flaggedAsError).length

  return {
    childId: run.childId,
    domain: run.domain,
    status: 'partial',
    messages: [],
    findings: input.findings,
    recommendations: [],
    summary: `Partial session: ${questState.totalCorrect}/${questState.totalQuestions} correct at level ${questState.currentLevel} (exited early)`,
    evaluatedAt: nowIso,
    sessionType: 'interactive',
    questMode: run.questMode,
    questions,
    finalLevel: questState.currentLevel,
    totalCorrect: questState.totalCorrect,
    totalQuestions: questState.totalQuestions,
    diamondsMined: questState.totalCorrect,
    streakDays: input.streakDays,
    skippedCount: skippedCount || undefined,
    flaggedErrorCount: flaggedErrorCount || undefined,
    // Resume support: save full state needed to restore session
    savedQuestState: questState,
    savedCurrentQuestion: input.currentQuestion ?? undefined,
    bonusRoundUsed: input.bonusRoundUsed,
    questRunId: run.runId,
    targetPlan: run.targetPlan,
  }
}

// ── Resume eligibility ─────────────────────────────────────────────────────

/** Why a stored document may not be replayed as a resumable session. */
export type QuestResumeRefusal =
  | 'missing'
  | 'not-interactive'
  | 'finalized'
  /** A parent already closed this one out with *Start fresh instead*. */
  | 'abandoned'
  | 'wrong-child'
  /** A status nothing in this feature plays answers into. */
  | 'not-resumable'
  | 'no-resume-point'
  /** The scope the control was rendered under is no longer the live one. */
  | 'stale-scope'

/**
 * The stored `status` values a partial may still be reopened from.
 *
 * `partial` is what this feature writes; `in-progress` is the legacy shape
 * written before partials counted; `resumed` is already-reopened, kept eligible
 * so a double tap converges on the same run rather than refusing the second.
 * Anything else — `complete`, `abandoned`, a guided eval's own statuses — is
 * not a session answers may be played into.
 */
const RESUMABLE_STATUSES = new Set(['partial', 'in-progress', 'resumed'])

/**
 * Is this stored document still safe to reopen and play answers into?
 *
 * Checked against what is STORED NOW, not against the copy the resume card
 * loaded: between that read and the tap the run may have been finalized by a
 * delayed close, abandoned, or reassigned. A refusal is reported so the caller
 * can say so — never silently turned into an unrelated fresh quest, which would
 * start a paid run the child did not ask for.
 */
export function questResumeRefusal(
  stored: Partial<EvaluationSession & InteractiveSessionData> | null | undefined,
  expectedChildId: string,
): QuestResumeRefusal | null {
  if (!stored) return 'missing'
  if (stored.sessionType !== 'interactive') return 'not-interactive'
  if (stored.sourceCommittedAt || stored.status === 'complete') return 'finalized'
  if (stored.status === 'abandoned') return 'abandoned'
  if (!stored.status || !RESUMABLE_STATUSES.has(stored.status)) return 'not-resumable'
  if (!stored.childId || stored.childId !== expectedChildId) return 'wrong-child'
  if (!stored.savedQuestState || !stored.savedCurrentQuestion) return 'no-resume-point'
  return null
}

/**
 * May a parent close this one out with *Start fresh instead*?
 *
 * The same question as {@link questResumeRefusal} minus the resume point: a
 * partial whose saved question never landed is not resumable but is still
 * abandonable, and that is the row the card's secondary action is offered for.
 * A completed or another child's source is refused either way.
 */
export function questAbandonRefusal(
  stored: Partial<EvaluationSession & InteractiveSessionData> | null | undefined,
  expectedChildId: string,
): QuestResumeRefusal | null {
  const refusal = questResumeRefusal(stored, expectedChildId)
  return refusal === 'no-resume-point' ? null : refusal
}
