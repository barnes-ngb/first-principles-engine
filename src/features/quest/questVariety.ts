/**
 * Question variety / anti-repetition avoid-set (FEAT — Knowledge Mine question
 * variety).
 *
 * The mine felt repetitive because the AI was never shown what it had already
 * asked, so it reproduced near-identical questions. This module derives a small,
 * session-scoped avoid-set from the questions answered so far:
 *
 *  - {@link collectAskedTargets} / {@link askedTargetSet} — the distinct target
 *    words/sentences already tested (so neither the AI nor the client-side
 *    template injections reuse one).
 *  - {@link recentQuestionFormats} — the last few question formats used (so the
 *    AI rotates format and never repeats the same one twice in a row).
 *
 * Pure (no I/O), so it is unit-testable in isolation. The set resets per session
 * (it is computed from the in-memory answered-questions list).
 */

import type { SessionQuestion } from './questTypes'

/** Max distinct asked target words to carry in the avoid-list (keeps the prompt compact). */
export const ASKED_TARGETS_LIMIT = 24

/** Normalize a target word/sentence for avoid-set comparison (trim + lowercase). */
export function normalizeTarget(raw: string | undefined | null): string {
  return (raw ?? '').trim().toLowerCase()
}

type TargetFields = Pick<SessionQuestion, 'correctAnswer' | 'stimulus'>
type FormatFields = Pick<SessionQuestion, 'type' | 'prompt'>

/**
 * Session-scoped list of target words/sentences already asked this session,
 * normalized + de-duped, oldest-first, capped at `limit` (most-recent kept).
 *
 * Pulls each question's `correctAnswer` (the target word for build/spell, the
 * sentence for build-sentence, the right option for multiple-choice) and its
 * `stimulus` (the displayed word, when present). Fed to the AI as the avoid-list
 * it must not reuse.
 */
export function collectAskedTargets(
  questions: TargetFields[],
  limit = ASKED_TARGETS_LIMIT,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const q of questions) {
    for (const raw of [q.correctAnswer, q.stimulus]) {
      const w = normalizeTarget(raw)
      if (!w || seen.has(w)) continue
      seen.add(w)
      out.push(w)
    }
  }
  return out.length > limit ? out.slice(out.length - limit) : out
}

/**
 * The avoid-set as a `Set` for O(1) membership checks in the client-side template
 * injections (spell-the-word / build-the-sentence). Uncapped — the client wants
 * every already-asked target, not just the recent window.
 */
export function askedTargetSet(questions: TargetFields[]): Set<string> {
  return new Set(collectAskedTargets(questions, Number.POSITIVE_INFINITY))
}

/**
 * The last `n` question formats used this session, oldest-first. Combines the
 * question `type` with a short prompt snippet so the AI can distinguish e.g. a
 * rhyming multiple-choice from a sound-matching one. Feeds the
 * `recentQuestionTypes` avoid hint the quest prompt already reads.
 */
export function recentQuestionFormats(questions: FormatFields[], n = 3): string[] {
  return questions.slice(-n).map((q) => `${q.type}: ${q.prompt.slice(0, 40)}`)
}
