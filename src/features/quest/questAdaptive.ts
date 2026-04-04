import type { QuestState } from './questTypes'
import {
  FRUSTRATION_LIMIT,
  LEVEL_DOWN_STREAK,
  LEVEL_UP_STREAK,
  MAX_QUESTIONS,
  MAX_SECONDS,
  MIN_QUESTIONS,
} from './questTypes'

/**
 * Compute the next adaptive state after an answer.
 * Pure function — no side effects.
 */
export function computeNextState(prev: QuestState, correct: boolean): QuestState {
  let currentLevel = prev.currentLevel
  let consecutiveCorrect = prev.consecutiveCorrect
  let consecutiveWrong = prev.consecutiveWrong
  let levelDownsInARow = prev.levelDownsInARow
  let questionsThisLevel = prev.questionsThisLevel + 1
  const totalCorrect = prev.totalCorrect + (correct ? 1 : 0)
  const totalQuestions = prev.totalQuestions + 1

  if (correct) {
    consecutiveCorrect = prev.consecutiveCorrect + 1
    consecutiveWrong = 0
    levelDownsInARow = 0
    if (consecutiveCorrect >= LEVEL_UP_STREAK && currentLevel < 10) {
      currentLevel = prev.currentLevel + 1
      consecutiveCorrect = 0
      questionsThisLevel = 0
    }
  } else {
    consecutiveWrong = prev.consecutiveWrong + 1
    consecutiveCorrect = 0
    if (consecutiveWrong >= LEVEL_DOWN_STREAK && currentLevel > 1) {
      currentLevel = prev.currentLevel - 1
      consecutiveWrong = 0
      questionsThisLevel = 0
      levelDownsInARow = prev.levelDownsInARow + 1
    }
  }

  return {
    ...prev,
    currentLevel,
    consecutiveCorrect,
    consecutiveWrong,
    levelDownsInARow,
    totalQuestions,
    totalCorrect,
    questionsThisLevel,
  }
}

/**
 * Determine whether the session should end based on current state.
 */
export function shouldEndSession(state: QuestState): { end: boolean; timedOut: boolean } {
  const timedOut = state.elapsedSeconds >= MAX_SECONDS
  // Hard minimum: never end before MIN_QUESTIONS unless timed out
  const pastMinimum = state.totalQuestions >= MIN_QUESTIONS
  const end =
    state.totalQuestions >= MAX_QUESTIONS ||
    timedOut ||
    (pastMinimum && state.levelDownsInARow >= FRUSTRATION_LIMIT)
  return { end, timedOut }
}

/**
 * Calculate the quest streak from a list of session dates.
 */
export function calculateStreak(
  sessions: Array<{ evaluatedAt: string }>,
  today?: string,
): { currentStreak: number; lastQuestDate: string | null } {
  if (sessions.length === 0) {
    return { currentStreak: 0, lastQuestDate: null }
  }

  const dates = sessions
    .map((s) => s.evaluatedAt.slice(0, 10))
    .filter((v, i, a) => a.indexOf(v) === i) // unique dates
    .sort()
    .reverse()

  const lastQuestDate = dates[0]
  const todayStr = today ?? new Date().toISOString().slice(0, 10)
  const yesterday = new Date(new Date(todayStr + 'T00:00:00').getTime() - 86400000)
    .toISOString()
    .slice(0, 10)

  // Streak only counts if last quest was today or yesterday
  if (lastQuestDate !== todayStr && lastQuestDate !== yesterday) {
    return { currentStreak: 0, lastQuestDate }
  }

  let streak = 1
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + 'T00:00:00')
    const curr = new Date(dates[i] + 'T00:00:00')
    const diff = (prev.getTime() - curr.getTime()) / 86400000
    if (diff === 1) {
      streak++
    } else {
      break
    }
  }

  return { currentStreak: streak, lastQuestDate }
}

/**
 * Format a dot-delimited skill tag into a readable label.
 * e.g. "phonics.cvc.short-o" → "Phonics → CVC → Short o"
 */
export function formatSkillLabel(tag: string): string {
  return tag
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' \u2192 ')
    .replace(/-/g, ' ')
    .replace(/cvc/i, 'CVC')
    .replace(/cvce/i, 'CVCe')
}
