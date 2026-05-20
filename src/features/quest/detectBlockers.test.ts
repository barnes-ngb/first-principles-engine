import { describe, it, expect } from 'vitest'
import type { SessionQuestion } from './questTypes'
import { detectBlockersFromSession } from './detectBlockers'

// ── Helpers ─────────────────────────────────────────────────────

function mkQuestion(partial: Partial<SessionQuestion> & {
  skill: string
  correct: boolean
}): SessionQuestion {
  return {
    id: partial.id ?? `q-${Math.random().toString(36).slice(2, 8)}`,
    type: 'multiple-choice',
    level: partial.level ?? 3,
    skill: partial.skill,
    prompt: partial.prompt ?? 'What is this?',
    stimulus: partial.stimulus,
    options: partial.options ?? ['a', 'b', 'c'],
    correctAnswer: partial.correctAnswer ?? 'a',
    childAnswer: partial.childAnswer ?? (partial.correct ? 'a' : 'b'),
    correct: partial.correct,
    skipped: partial.skipped,
    flaggedAsError: partial.flaggedAsError,
    responseTimeMs: partial.responseTimeMs ?? 1000,
    timestamp: partial.timestamp ?? '2026-04-21T12:00:00Z',
    inputMethod: partial.inputMethod,
  }
}

function padTo5Correct(skill: string, from: number): SessionQuestion[] {
  const needed = Math.max(0, 5 - from)
  return Array.from({ length: needed }, (_, i) =>
    mkQuestion({ skill: `${skill}.filler${i}`, correct: true }),
  )
}

// ── Tests ───────────────────────────────────────────────────────

describe('detectBlockersFromSession — threshold', () => {
  it('emits a blocker when 2 wrong at the same skill', () => {
    const questions = [
      mkQuestion({ skill: 'phonics.short-i-vs-e', correct: false, stimulus: 'bid' }),
      mkQuestion({ skill: 'phonics.short-i-vs-e', correct: false, stimulus: 'tin' }),
      ...padTo5Correct('phonics.cvc.short-a', 2),
    ]
    const blocks = detectBlockersFromSession(questions, 'phonics')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].id).toBe('phonics-short-i-vs-e')
    expect(blocks[0].source).toBe('quest')
    expect(blocks[0].status).toBe('ADDRESS_NOW')
    expect(blocks[0].specificWords).toEqual(['bid', 'tin'])
    expect(blocks[0].evidence).toContain('2 wrong')
  })

  it('does NOT emit a blocker for 1 wrong', () => {
    const questions = [
      mkQuestion({ skill: 'phonics.short-i-vs-e', correct: false, stimulus: 'bid' }),
      ...padTo5Correct('phonics.cvc.short-a', 1),
    ]
    const blocks = detectBlockersFromSession(questions, 'phonics')
    expect(blocks).toHaveLength(0)
  })

  it('does NOT emit a blocker when 2 wrong are on DIFFERENT skills', () => {
    const questions = [
      mkQuestion({ skill: 'phonics.short-i-vs-e', correct: false, stimulus: 'bid' }),
      mkQuestion({ skill: 'phonics.digraph-oo', correct: false, stimulus: 'book' }),
      ...padTo5Correct('filler', 2),
    ]
    const blocks = detectBlockersFromSession(questions, 'phonics')
    expect(blocks).toHaveLength(0)
  })

  it('emits ADDRESS_NOW when 3 wrong at the same skill', () => {
    const questions = [
      mkQuestion({ skill: 'phonics.short-i-vs-e', correct: false, stimulus: 'bid' }),
      mkQuestion({ skill: 'phonics.short-i-vs-e', correct: false, stimulus: 'tin' }),
      mkQuestion({ skill: 'phonics.short-i-vs-e', correct: false, stimulus: 'pin' }),
      ...padTo5Correct('phonics.cvc.short-a', 3),
    ]
    const blocks = detectBlockersFromSession(questions, 'phonics')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].status).toBe('ADDRESS_NOW')
    expect(blocks[0].specificWords).toEqual(['bid', 'tin', 'pin'])
  })

  it('emits DEFER when 2 wrong + 1 skipped at the same skill (noisy signal)', () => {
    const questions = [
      mkQuestion({ skill: 'phonics.short-i-vs-e', correct: false, stimulus: 'bid' }),
      mkQuestion({ skill: 'phonics.short-i-vs-e', correct: false, stimulus: 'tin' }),
      mkQuestion({
        skill: 'phonics.short-i-vs-e',
        correct: false,
        skipped: true,
        stimulus: 'pin',
      }),
      ...padTo5Correct('phonics.cvc.short-a', 3),
    ]
    const blocks = detectBlockersFromSession(questions, 'phonics')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].status).toBe('DEFER')
  })
})

describe('detectBlockersFromSession — session length gating', () => {
  it('returns no blockers when session has fewer than 5 questions', () => {
    const questions = [
      mkQuestion({ skill: 'phonics.short-i-vs-e', correct: false, stimulus: 'bid' }),
      mkQuestion({ skill: 'phonics.short-i-vs-e', correct: false, stimulus: 'tin' }),
    ]
    const blocks = detectBlockersFromSession(questions, 'phonics')
    expect(blocks).toHaveLength(0)
  })

  it('all-correct sessions produce no new blockers', () => {
    const questions = Array.from({ length: 8 }, (_, i) =>
      mkQuestion({ skill: 'phonics.cvc.short-a', correct: true, id: `q${i}` }),
    )
    const blocks = detectBlockersFromSession(questions, 'phonics')
    expect(blocks).toHaveLength(0)
  })

  it('fluency mode skips detection entirely', () => {
    const questions = Array.from({ length: 6 }, () =>
      mkQuestion({ skill: 'phonics.short-i-vs-e', correct: false, stimulus: 'bid' }),
    )
    const blocks = detectBlockersFromSession(questions, 'fluency')
    expect(blocks).toHaveLength(0)
  })

  it('handles undefined questMode gracefully', () => {
    const questions = [
      mkQuestion({ skill: 'phonics.short-i-vs-e', correct: false, stimulus: 'bid' }),
      mkQuestion({ skill: 'phonics.short-i-vs-e', correct: false, stimulus: 'tin' }),
      ...padTo5Correct('phonics.cvc.short-a', 2),
    ]
    const blocks = detectBlockersFromSession(questions, undefined)
    expect(blocks).toHaveLength(1)
  })
})

describe('detectBlockersFromSession — block shape', () => {
  it('attaches session id to evaluationSessionId', () => {
    const questions = [
      mkQuestion({ skill: 'phonics.short-i-vs-e', correct: false, stimulus: 'bid' }),
      mkQuestion({ skill: 'phonics.short-i-vs-e', correct: false, stimulus: 'tin' }),
      ...padTo5Correct('phonics.cvc.short-a', 2),
    ]
    const blocks = detectBlockersFromSession(questions, 'phonics', {
      sessionId: 'interactive_lincoln_123',
    })
    expect(blocks[0].evaluationSessionId).toBe('interactive_lincoln_123')
  })

  it('de-duplicates specificWords', () => {
    const questions = [
      mkQuestion({ skill: 'phonics.short-i-vs-e', correct: false, stimulus: 'bid' }),
      mkQuestion({ skill: 'phonics.short-i-vs-e', correct: false, stimulus: 'bid' }),
      mkQuestion({ skill: 'phonics.short-i-vs-e', correct: false, stimulus: 'tin' }),
      ...padTo5Correct('phonics.cvc.short-a', 3),
    ]
    const blocks = detectBlockersFromSession(questions, 'phonics')
    expect(blocks[0].specificWords).toEqual(['bid', 'tin'])
  })

  it('attaches specificQuestions (IDs)', () => {
    const questions = [
      mkQuestion({ id: 'q-abc', skill: 'phonics.short-i-vs-e', correct: false }),
      mkQuestion({ id: 'q-xyz', skill: 'phonics.short-i-vs-e', correct: false }),
      ...padTo5Correct('phonics.cvc.short-a', 2),
    ]
    const blocks = detectBlockersFromSession(questions, 'phonics')
    expect(blocks[0].specificQuestions).toEqual(['q-abc', 'q-xyz'])
  })

  it('ignores flaggedAsError questions', () => {
    const questions = [
      mkQuestion({
        skill: 'phonics.short-i-vs-e',
        correct: false,
        flaggedAsError: true,
        stimulus: 'bid',
      }),
      mkQuestion({
        skill: 'phonics.short-i-vs-e',
        correct: false,
        flaggedAsError: true,
        stimulus: 'tin',
      }),
      ...padTo5Correct('phonics.cvc.short-a', 2),
    ]
    const blocks = detectBlockersFromSession(questions, 'phonics')
    // Both wrong were flagged as AI errors → below threshold
    expect(blocks).toHaveLength(0)
  })

  it('emits one block per skill when multiple skills trip the threshold', () => {
    const questions = [
      mkQuestion({ skill: 'phonics.short-i-vs-e', correct: false, stimulus: 'bid' }),
      mkQuestion({ skill: 'phonics.short-i-vs-e', correct: false, stimulus: 'tin' }),
      mkQuestion({ skill: 'phonics.digraph-oo', correct: false, stimulus: 'book' }),
      mkQuestion({ skill: 'phonics.digraph-oo', correct: false, stimulus: 'look' }),
      ...padTo5Correct('phonics.cvc.short-a', 4),
    ]
    const blocks = detectBlockersFromSession(questions, 'phonics')
    expect(blocks).toHaveLength(2)
    const ids = blocks.map((b) => b.id).sort()
    expect(ids).toEqual(['phonics-digraph-oo', 'phonics-short-i-vs-e'])
  })
})
