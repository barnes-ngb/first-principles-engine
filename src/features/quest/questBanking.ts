// ── Quest reward banking (per-answer) — pure helpers ──────────────────────────
//
// Knowledge Mine sessions used to bank diamonds/XP and persist to history only
// at the very end of a session (full question count / time-out). When a child
// stopped early — exactly Lincoln's reading/phonics pattern — the whole session
// evaporated: no diamonds, no hours, and nothing in Records → Evaluations.
//
// The fix banks each correct answer's reward *as it happens*, deduped through the
// xpLedger, so mid-session progress is durable and partials count by construction.
// These pure helpers own the two load-bearing rules so they can be unit-tested
// away from the hook:
//   1. Stable, per-answer dedup keys — the live (submitAnswer) path and the
//      end-of-session backfill use the *same* key per question index, so a
//      diamond is never awarded twice.
//   2. The conservative "sufficient completion" gate — a short bail banks
//      diamonds/history/hours but must NOT move working levels or the snapshot.

import type { SessionQuestion } from './questTypes'
import { MIN_QUESTIONS } from './questTypes'

/** XP awarded per diamond mined (one correct answer). */
export const XP_PER_DIAMOND = 2

/**
 * Sufficient-completion threshold for moving working levels / the snapshot.
 *
 * Mirrors the quest's own `MIN_QUESTIONS` floor (`shouldEndSession` never ends a
 * session before this many questions unless the child manually exits) and the
 * `MIN_QUESTIONS_FOR_UPDATE` guard already baked into
 * `computeWorkingLevelFromSession`. A shorter bail still banks diamonds, persists
 * to history, and counts toward hours — it just never derives a level or applies
 * findings to the foundation map. Protecting the mastery loop is the whole point:
 * a 2-question bail must never move his level.
 */
export const MIN_QUESTIONS_FOR_MASTERY = MIN_QUESTIONS

/** Answered (non-skipped, non-flagged) questions — the signal that counts. */
export function answeredOnly(questions: SessionQuestion[]): SessionQuestion[] {
  return questions.filter((q) => !q.skipped && !q.flaggedAsError)
}

/**
 * True when a session carries enough signal to derive working levels and apply
 * findings to the snapshot (the mastery loop). Partials below this still bank
 * diamonds, persist to history, and count toward hours — they just never move
 * his levels or the foundation map.
 */
export function hasSufficientCompletion(questions: SessionQuestion[]): boolean {
  return answeredOnly(questions).length >= MIN_QUESTIONS_FOR_MASTERY
}

/**
 * Dedup key for the diamond banked for the correct answer at full-array `index`.
 * The index is the question's position in the session's `questions` array (the
 * same array submitAnswer appends to and endSession backfills over), so the live
 * and backfill paths land on identical keys.
 */
export function perAnswerDiamondKey(sessionId: string, index: number): string {
  return `quest_${sessionId}_q${index}-diamond`
}

/** Dedup key for the XP banked for the correct answer at full-array `index`. */
export function perAnswerXpKey(sessionId: string, index: number): string {
  return `quest_${sessionId}_q${index}-xp`
}

/**
 * Full-array indices of the correct answers in a session. Used by the
 * end-of-session backfill to re-bank (idempotently) any correct answer whose
 * live per-answer write didn't land — never double-awarding, because the keys
 * match the live path exactly.
 */
export function correctAnswerIndices(questions: SessionQuestion[]): number[] {
  const out: number[] = []
  questions.forEach((q, i) => {
    if (q.correct) out.push(i)
  })
  return out
}
