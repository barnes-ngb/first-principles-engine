// ── One quest run, frozen (UX-494) ─────────────────────────────────────────
//
// A Knowledge Mine session's identity used to live in SIX mutable refs —
// `sessionIdRef`, `activeDomainRef`, `activeQuestModeRef`, `targetConceptsRef`,
// `sessionOwnerRef` and the shared idle-aware timer — and `endSession` read them
// AFTER awaiting an AI summary. So the owner's own reproduction: hold a Math
// summary, tap *Try another quest*, Start Phonics, and the Math close resumes to
// find every one of those refs pointing at the Phonics run. It wrote Math's
// answers under the Phonics document id, stamped `questMode: 'phonics'` on them,
// backfilled Math's per-answer diamond keys against the Phonics id, and stopped
// the Phonics timer to read Math's minutes off it.
//
// A run is therefore frozen into ONE object before any await, and every write a
// close makes resolves through that object. The live refs still drive question
// GENERATION (that is what they are for); nothing that finalizes reads them.
//
// Pure: no React, no Firestore, no clock of its own — the caller passes `nowIso`.

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
 * `runId` IS the `evaluationSessions` document id, so "the run" and "the record"
 * cannot drift apart: there is one id, decided at start (or restored by Resume),
 * and the reward dedup keys, the completion-bonus key, the word-progress session
 * stamp and the evidence `sourceId` are all derived from it.
 */
export interface QuestRun {
  runId: string
  familyId: string
  childId: string
  childName: string
  domain: EvaluationDomain
  questMode?: QuestMode
  /** The exact queued requests this run selected. Empty when nothing was queued. */
  targetPlan: QuestAskPlanRow[]
  /** The capture allowlist — the concepts this run may attribute evidence to. */
  targetConceptIds: string[]
  startedAt: string
}

/** The run id for a session started now. One shape, one place — unchanged. */
export function questRunId(childId: string, startedAtMs: number): string {
  return `interactive_${childId}_${startedAtMs}`
}

/**
 * The stamp the next run id is built from — strictly increasing.
 *
 * `Date.now()` alone can repeat: *Try another quest* then a mode card is two
 * taps that can land in the same millisecond, and two runs sharing an id share
 * a document, a reward key set and an evidence `sourceId`. The shape of the id
 * is untouched; only its uniqueness is guaranteed.
 */
export function nextRunStamp(previousStamp: number, nowMs: number): number {
  return nowMs > previousStamp ? nowMs : previousStamp + 1
}

/** True when `run` is still the hook's live run — the guard on every post-await setState. */
export function isLiveRun(live: QuestRun | null | undefined, run: QuestRun): boolean {
  return live?.runId === run.runId
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
 * before its own first await, so the payload cannot acquire a newer run's id,
 * mode, domain, child or plan between being composed and being written. The
 * shape is the shape `endSession` already wrote, plus the additive source
 * record; nothing is computed differently here.
 *
 * It deliberately carries NO `savedQuestState` / `savedCurrentQuestion`: a
 * finalized source is not resumable, and leaving a resume point on it is how a
 * finished session reappeared on the resume card.
 */
export function finalizedQuestSourcePayload(
  input: FinalizedQuestSourceInput,
): EvaluationSession & InteractiveSessionData {
  const { run, questions, finalState, timedOut, sufficient, nowIso } = input
  const skippedCount = questions.filter((q) => q.skipped).length
  const flaggedErrorCount = questions.filter((q) => q.flaggedAsError).length

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
    // Only a sufficient, complete source is eligible for the graph at all; an
    // insufficient close is honestly `skipped`, which is not a success claim.
    modelProjection: sufficient ? 'pending' : 'skipped',
    modelProjectionOutcome: sufficient ? 'pending' : 'insufficient-completion',
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
 * Saving the PLAN here is what makes cold and warm Resume agree: the plan comes
 * back off the exact partial that was reopened, so a hook that still holds the
 * previous run's targets in a ref cannot lend them to this one, and a legacy
 * partial with no plan field resumes with an empty target list either way.
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

// ── Recovery identity ──────────────────────────────────────────────────────

/**
 * May this surface act on this payload right now?
 *
 * A recovery control is the one place in the Mine where a write is addressed to
 * a child the screen is no longer necessarily on, so it is checked rather than
 * assumed: the payload's family must be the authorised one, and its child must
 * still be a member of that family's roster. The payload carries its own
 * `childId`, so a permitted retry is correctly attributed by construction — this
 * is about whether the retry may happen at all.
 */
export function mayRecoverQuestSource(
  authorizedFamilyId: string | null | undefined,
  familyChildIds: readonly string[],
  payload: { familyId: string; childId: string },
): boolean {
  if (!authorizedFamilyId) return false
  if (payload.familyId !== authorizedFamilyId) return false
  if (!payload.childId) return false
  return familyChildIds.includes(payload.childId)
}
