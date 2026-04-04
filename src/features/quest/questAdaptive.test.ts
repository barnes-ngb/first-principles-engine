import { describe, expect, it } from 'vitest'

import type { QuestState } from './questTypes'
import { calculateStreak, computeNextState, formatSkillLabel, shouldEndSession } from './questAdaptive'

function makeState(overrides: Partial<QuestState> = {}): QuestState {
  return {
    currentLevel: 2,
    consecutiveCorrect: 0,
    consecutiveWrong: 0,
    levelDownsInARow: 0,
    totalQuestions: 0,
    totalCorrect: 0,
    questionsThisLevel: 0,
    startedAt: '2026-03-15T10:00:00.000Z',
    elapsedSeconds: 0,
    ...overrides,
  }
}

// ── computeNextState ───────────────────────────────────────────

describe('computeNextState', () => {
  describe('level up', () => {
    it('levels up after 3 consecutive correct answers', () => {
      let state = makeState()
      state = computeNextState(state, true)
      expect(state.consecutiveCorrect).toBe(1)
      expect(state.currentLevel).toBe(2)

      state = computeNextState(state, true)
      expect(state.consecutiveCorrect).toBe(2)
      expect(state.currentLevel).toBe(2)

      state = computeNextState(state, true)
      expect(state.currentLevel).toBe(3)
      expect(state.consecutiveCorrect).toBe(0) // resets after level up
      expect(state.questionsThisLevel).toBe(0) // resets after level up
    })

    it('resets levelDownsInARow on any correct answer', () => {
      const state = makeState({ levelDownsInARow: 1 })
      const next = computeNextState(state, true)
      expect(next.levelDownsInARow).toBe(0)
    })

    it('does not level up past 6', () => {
      const state = makeState({ currentLevel: 6, consecutiveCorrect: 2 })
      const next = computeNextState(state, true)
      expect(next.currentLevel).toBe(6)
      expect(next.consecutiveCorrect).toBe(3) // streak not reset since no level-up
    })
  })

  describe('level down', () => {
    it('levels down after 2 consecutive wrong answers', () => {
      let state = makeState({ currentLevel: 3 })
      state = computeNextState(state, false)
      expect(state.consecutiveWrong).toBe(1)
      expect(state.currentLevel).toBe(3)

      state = computeNextState(state, false)
      expect(state.currentLevel).toBe(2)
      expect(state.consecutiveWrong).toBe(0)
      expect(state.questionsThisLevel).toBe(0)
    })

    it('does not level down past 1', () => {
      const state = makeState({ currentLevel: 1, consecutiveWrong: 1 })
      const next = computeNextState(state, false)
      expect(next.currentLevel).toBe(1)
      expect(next.consecutiveWrong).toBe(2)
    })

    it('increments levelDownsInARow on level down', () => {
      const state = makeState({ currentLevel: 3, consecutiveWrong: 1, levelDownsInARow: 0 })
      const next = computeNextState(state, false)
      expect(next.levelDownsInARow).toBe(1)
    })

    it('resets consecutiveCorrect on wrong answer', () => {
      const state = makeState({ consecutiveCorrect: 2 })
      const next = computeNextState(state, false)
      expect(next.consecutiveCorrect).toBe(0)
      expect(next.consecutiveWrong).toBe(1)
    })
  })

  describe('totals', () => {
    it('increments totalQuestions on every answer', () => {
      const state = makeState()
      expect(computeNextState(state, true).totalQuestions).toBe(1)
      expect(computeNextState(state, false).totalQuestions).toBe(1)
    })

    it('increments totalCorrect only on correct answer', () => {
      const state = makeState()
      expect(computeNextState(state, true).totalCorrect).toBe(1)
      expect(computeNextState(state, false).totalCorrect).toBe(0)
    })

    it('increments questionsThisLevel when no level change', () => {
      const state = makeState({ questionsThisLevel: 2 })
      expect(computeNextState(state, true).questionsThisLevel).toBe(3)
    })
  })
})

// ── shouldEndSession ───────────────────────────────────────────

describe('shouldEndSession', () => {
  it('ends when totalQuestions >= 10', () => {
    const state = makeState({ totalQuestions: 10 })
    expect(shouldEndSession(state)).toEqual({ end: true, timedOut: false })
  })

  it('ends when elapsedSeconds >= 480', () => {
    const state = makeState({ elapsedSeconds: 480 })
    expect(shouldEndSession(state)).toEqual({ end: true, timedOut: true })
  })

  it('ends when levelDownsInARow >= 2 after MIN_QUESTIONS reached', () => {
    const state = makeState({ levelDownsInARow: 2, totalQuestions: 5 })
    expect(shouldEndSession(state)).toEqual({ end: true, timedOut: false })
  })

  it('does not end on frustration before MIN_QUESTIONS', () => {
    const state = makeState({ levelDownsInARow: 2, totalQuestions: 3 })
    expect(shouldEndSession(state)).toEqual({ end: false, timedOut: false })
  })

  it('still ends on timeout before MIN_QUESTIONS', () => {
    const state = makeState({ totalQuestions: 2, elapsedSeconds: 480 })
    expect(shouldEndSession(state)).toEqual({ end: true, timedOut: true })
  })

  it('does not end when no conditions met', () => {
    const state = makeState({ totalQuestions: 5, elapsedSeconds: 200, levelDownsInARow: 1 })
    expect(shouldEndSession(state)).toEqual({ end: false, timedOut: false })
  })
})

// ── calculateStreak ────────────────────────────────────────────

describe('calculateStreak', () => {
  const today = '2026-03-15'

  it('returns streak 0 with no sessions', () => {
    expect(calculateStreak([], today)).toEqual({ currentStreak: 0, lastQuestDate: null })
  })

  it('returns streak 1 for a session today', () => {
    const sessions = [{ evaluatedAt: '2026-03-15T10:00:00Z' }]
    expect(calculateStreak(sessions, today)).toEqual({ currentStreak: 1, lastQuestDate: '2026-03-15' })
  })

  it('returns streak 1 for a session yesterday', () => {
    const sessions = [{ evaluatedAt: '2026-03-14T10:00:00Z' }]
    expect(calculateStreak(sessions, today)).toEqual({ currentStreak: 1, lastQuestDate: '2026-03-14' })
  })

  it('returns streak 3 for 3 consecutive days', () => {
    const sessions = [
      { evaluatedAt: '2026-03-15T10:00:00Z' },
      { evaluatedAt: '2026-03-14T10:00:00Z' },
      { evaluatedAt: '2026-03-13T10:00:00Z' },
    ]
    expect(calculateStreak(sessions, today)).toEqual({ currentStreak: 3, lastQuestDate: '2026-03-15' })
  })

  it('resets streak on a gap', () => {
    const sessions = [
      { evaluatedAt: '2026-03-15T10:00:00Z' },
      { evaluatedAt: '2026-03-14T10:00:00Z' },
      { evaluatedAt: '2026-03-12T10:00:00Z' }, // gap — skipped Mar 13
    ]
    expect(calculateStreak(sessions, today)).toEqual({ currentStreak: 2, lastQuestDate: '2026-03-15' })
  })

  it('returns streak 0 when last session was 2+ days ago', () => {
    const sessions = [{ evaluatedAt: '2026-03-12T10:00:00Z' }]
    expect(calculateStreak(sessions, today)).toEqual({ currentStreak: 0, lastQuestDate: '2026-03-12' })
  })

  it('deduplicates multiple sessions on the same day', () => {
    const sessions = [
      { evaluatedAt: '2026-03-15T08:00:00Z' },
      { evaluatedAt: '2026-03-15T14:00:00Z' },
      { evaluatedAt: '2026-03-14T10:00:00Z' },
    ]
    expect(calculateStreak(sessions, today)).toEqual({ currentStreak: 2, lastQuestDate: '2026-03-15' })
  })
})

// ── formatSkillLabel ───────────────────────────────────────────

describe('formatSkillLabel', () => {
  it('splits on dots and capitalizes', () => {
    expect(formatSkillLabel('phonics.cvc.short-o')).toBe('Phonics \u2192 CVC \u2192 Short o')
  })

  it('handles single segment', () => {
    expect(formatSkillLabel('reading')).toBe('Reading')
  })

  it('handles CVCe pattern', () => {
    expect(formatSkillLabel('phonics.cvce')).toBe('Phonics \u2192 CVCe')
  })
})
