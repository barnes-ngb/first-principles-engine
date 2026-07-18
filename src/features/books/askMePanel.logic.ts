import type { ComprehensionQuestion } from './useComprehensionQuestions'

/**
 * Pure helpers for the {@link AskMePanel} Story Call back-cover surface (kept out of
 * the component file so Fast Refresh stays component-only, and so they're unit-testable).
 */

/** Ask-Me order: opinion first (warmest), then inference, then recall. */
const TYPE_ORDER: Record<ComprehensionQuestion['type'], number> = {
  opinion: 0,
  inference: 1,
  recall: 2,
}

/** Order questions opinion → inference → recall (opens the call warm). */
export function orderAskMe(questions: ComprehensionQuestion[]): ComprehensionQuestion[] {
  return [...questions].sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type])
}

/**
 * Static prompts shown when generation fails or hasn't produced questions yet —
 * the panel must never be blank on a live call.
 */
export function fallbackQuestions(childName: string): string[] {
  const name = childName.trim() || 'them'
  return [
    `Ask ${name}: what was your favorite page?`,
    `Ask ${name}: what happens next?`,
    `Ask ${name}: what was the hardest word?`,
  ]
}
