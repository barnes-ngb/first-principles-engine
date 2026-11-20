/**
 * The live state of ONE challenge attempt, as pure transitions
 * (LOCAL-VISION-007, slice 2).
 *
 * Nothing here touches React, the bridge, the clock or Firestore. The editor
 * holds the state, calls these with `now` and an id, and freezes a copy into the
 * exact Save payload. That keeps every rule about an attempt in one file a test
 * can exhaust.
 *
 * ── The rules ──────────────────────────────────────────────────────────────
 *
 *   • A prediction can be chosen (and changed) only BEFORE the first Play
 *     request and before a Save has frozen it. After either it is fixed for the
 *     attempt — later edits, retries and further Play taps do not move it.
 *   • A Play request records that the child pressed Play. It is a tap, not an
 *     observation: it never says which source ran. Only the first one counts.
 *   • An outcome (Matched / Different / Unsure) is the child's own report. It
 *     needs a prediction AND a Play request, because "matched" is relative to a
 *     guess. It can be changed until a landed Save has recorded it.
 *   • An outcome given after a Save is NOT written back. It waits for the next
 *     explicit Save, which freezes it under that Save's own version id.
 */

import type {
  BuildStudioChallengeAttempt,
  BuildStudioChallengeOutcome,
  BuildStudioChallengeSubject,
} from '../../core/types/buildStudio'
import type { BuildChallenge } from './buildStudioChallenges'

export interface ChallengeAttemptState {
  attemptId: string
  challengeId: string
  challengeRevision: number
  /** The authored subject, copied from the challenge when the attempt began. */
  subjectBucket: BuildStudioChallengeSubject
  /**
   * What the last LANDED Save recorded for this attempt (see
   * {@link responseKey}), or `null` when none has. Anything the child has
   * recorded that differs from this — or from a pending frozen payload — exists
   * only on this page.
   */
  acknowledgedKey: string | null
  prediction: { optionId: string; at: string } | null
  playRequest: { at: string } | null
  reportedOutcome: { result: BuildStudioChallengeOutcome; at: string } | null
  /** A Save has frozen the prediction: it can no longer be changed. */
  sealed: boolean
  /** A landed Save recorded the outcome: this attempt is finished. */
  closed: boolean
}

export function startAttempt(challenge: BuildChallenge, attemptId: string): ChallengeAttemptState {
  return {
    attemptId,
    challengeId: challenge.id,
    challengeRevision: challenge.revision,
    subjectBucket: challenge.subjectBucket,
    acknowledgedKey: null,
    prediction: null,
    playRequest: null,
    reportedOutcome: null,
    sealed: false,
    closed: false,
  }
}

/** May the prediction still be chosen or changed? */
export function canPredict(state: ChallengeAttemptState): boolean {
  return !state.closed && !state.sealed && state.playRequest === null
}

export function withPrediction(
  state: ChallengeAttemptState,
  challenge: BuildChallenge,
  optionId: string,
  at: string,
): ChallengeAttemptState {
  if (!canPredict(state)) return state
  if (state.challengeId !== challenge.id) return state
  if (!challenge.prediction.options.some((o) => o.id === optionId)) return state
  return { ...state, prediction: { optionId, at } }
}

/** The first Play request after the attempt began. Later taps change nothing. */
export function withPlayRequest(state: ChallengeAttemptState, at: string): ChallengeAttemptState {
  if (state.closed || state.playRequest) return state
  return { ...state, playRequest: { at } }
}

/** Is it time to ask "did it match your guess?" */
export function canReportOutcome(state: ChallengeAttemptState): boolean {
  return !state.closed && state.prediction !== null && state.playRequest !== null
}

export function withOutcome(
  state: ChallengeAttemptState,
  result: BuildStudioChallengeOutcome,
  at: string,
): ChallengeAttemptState {
  if (!canReportOutcome(state)) return state
  // Never earlier than the Play request it is about.
  const playAt = state.playRequest!.at
  return { ...state, reportedOutcome: { result, at: at < playAt ? playAt : at } }
}

/** Has anything been recorded that a Save should carry? */
export function hasRecordedActivity(state: ChallengeAttemptState): boolean {
  return !state.closed && (state.prediction !== null || state.playRequest !== null)
}

/**
 * Freeze what a Save will carry, scoped to that Save's own child, project and
 * version. `null` when there is nothing to record or the attempt is finished.
 *
 * Returns the new state too: freezing seals the prediction, so a retry and a
 * later change cannot disagree about what was chosen.
 */
export function freezeAttempt(
  state: ChallengeAttemptState | null,
  scope: { childId: string; projectId: string; versionId: string },
): { attempt: BuildStudioChallengeAttempt | null; state: ChallengeAttemptState | null } {
  if (!state || !hasRecordedActivity(state)) return { attempt: null, state }
  const attempt: BuildStudioChallengeAttempt = {
    childId: scope.childId,
    projectId: scope.projectId,
    versionId: scope.versionId,
    attemptId: state.attemptId,
    challengeId: state.challengeId,
    challengeRevision: state.challengeRevision,
    subjectBucket: state.subjectBucket,
    ...(state.prediction ? { prediction: { ...state.prediction } } : {}),
    ...(state.playRequest ? { playRequest: { ...state.playRequest } } : {}),
    ...(state.reportedOutcome ? { reportedOutcome: { ...state.reportedOutcome } } : {}),
  }
  return { attempt, state: state.sealed ? state : { ...state, sealed: true } }
}

/**
 * A Save landed. Close the attempt only if THAT Save recorded this attempt's
 * outcome exactly as it stands now: an outcome given or changed while the write
 * was out is still waiting for the next Save.
 */
export function afterSaveLanded(
  state: ChallengeAttemptState | null,
  saved: BuildStudioChallengeAttempt | undefined,
): ChallengeAttemptState | null {
  if (!state || !saved || state.attemptId !== saved.attemptId) return state
  // Whatever landed is now acknowledged, finished or not.
  const acknowledged = { ...state, acknowledgedKey: responseKey(saved) }
  const recorded = saved.reportedOutcome
  const current = state.reportedOutcome
  if (
    recorded &&
    current &&
    recorded.result === current.result &&
    recorded.at === current.at
  ) {
    return { ...acknowledged, closed: true }
  }
  return acknowledged
}

/** The recorded response of an attempt or a frozen payload, in one comparable form. */
export function responseKey(r: {
  prediction?: { optionId: string; at: string } | null
  playRequest?: { at: string } | null
  reportedOutcome?: { result: string; at: string } | null
}): string {
  return JSON.stringify([
    r.prediction ? [r.prediction.optionId, r.prediction.at] : null,
    r.playRequest ? r.playRequest.at : null,
    r.reportedOutcome ? [r.reportedOutcome.result, r.reportedOutcome.at] : null,
  ])
}

/**
 * Does the child hold a recorded challenge response that nothing has captured?
 *
 * True when the live attempt has a prediction, a Play request or an outcome that
 * differs from the exact frozen payload of an unfinished Save for this attempt
 * (when there is one) or otherwise from what a landed Save acknowledged. False
 * for an empty invitation, a finished attempt and an attempt whose response a
 * save already holds exactly — in which case the pending Save is itself the
 * thing that is guarded.
 */
export function challengeResponseAtRisk(
  state: ChallengeAttemptState | null,
  pending: BuildStudioChallengeAttempt | null | undefined,
): boolean {
  if (!state || !hasRecordedActivity(state)) return false
  const current = responseKey(state)
  if (pending && pending.attemptId === state.attemptId) return current !== responseKey(pending)
  return current !== state.acknowledgedKey
}

/** An outcome the child gave that no landed Save has recorded yet. */
export function outcomeWaitingForSave(state: ChallengeAttemptState | null): boolean {
  return state !== null && !state.closed && state.reportedOutcome !== null
}
