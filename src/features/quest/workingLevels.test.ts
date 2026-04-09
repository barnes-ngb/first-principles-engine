import { describe, expect, it } from 'vitest'

import type { SkillSnapshot, WorkingLevel, EvaluationFinding } from '../../core/types/evaluation'
import type { SessionQuestion } from './questTypes'
import {
  computeStartLevel,
  computeWorkingLevelFromSession,
  deriveWorkingLevelFromEvaluation,
  deriveMathWorkingLevelFromScan,
  canOverwriteWorkingLevel,
} from './workingLevels'

// ── Helpers ─────────────────────────────────────────────────────

function makeQuestion(overrides: Partial<SessionQuestion> = {}): SessionQuestion {
  return {
    id: `q_${Math.random().toString(36).slice(2)}`,
    type: 'multiple-choice',
    level: 2,
    skill: 'phonics.cvc',
    prompt: 'What sound?',
    options: ['a', 'b', 'c'],
    correctAnswer: 'a',
    childAnswer: 'a',
    correct: true,
    responseTimeMs: 2000,
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

function makeQuestions(specs: Array<{ level: number; correct: boolean; skipped?: boolean; flaggedAsError?: boolean }>): SessionQuestion[] {
  return specs.map((s) =>
    makeQuestion({
      level: s.level,
      correct: s.correct,
      childAnswer: s.correct ? 'a' : 'b',
      skipped: s.skipped,
      flaggedAsError: s.flaggedAsError,
    }),
  )
}

function makeWorkingLevel(overrides: Partial<WorkingLevel> = {}): WorkingLevel {
  return {
    level: 3,
    updatedAt: new Date().toISOString(),
    source: 'quest',
    evidence: 'test',
    ...overrides,
  }
}

// ── canOverwriteWorkingLevel ──────────────────────────────────

describe('canOverwriteWorkingLevel', () => {
  it('allows overwrite when no current level exists', () => {
    expect(canOverwriteWorkingLevel(undefined)).toBe(true)
  })

  it('allows overwrite when source is quest', () => {
    expect(canOverwriteWorkingLevel(makeWorkingLevel({ source: 'quest' }))).toBe(true)
  })

  it('allows overwrite when source is evaluation', () => {
    expect(canOverwriteWorkingLevel(makeWorkingLevel({ source: 'evaluation' }))).toBe(true)
  })

  it('allows overwrite when source is curriculum', () => {
    expect(canOverwriteWorkingLevel(makeWorkingLevel({ source: 'curriculum' }))).toBe(true)
  })

  it('blocks overwrite when source is manual and within 48 hours', () => {
    const recent = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() // 1 hour ago
    expect(canOverwriteWorkingLevel(makeWorkingLevel({ source: 'manual', updatedAt: recent }))).toBe(false)
  })

  it('allows overwrite when source is manual but older than 48 hours', () => {
    const old = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString() // 49 hours ago
    expect(canOverwriteWorkingLevel(makeWorkingLevel({ source: 'manual', updatedAt: old }))).toBe(true)
  })
})

// ── computeStartLevel ─────────────────────────────────────────

describe('computeStartLevel', () => {
  it('uses workingLevel when present', () => {
    const snapshot: Pick<SkillSnapshot, 'workingLevels'> = {
      workingLevels: { phonics: makeWorkingLevel({ level: 5 }) },
    }
    expect(computeStartLevel(snapshot, 'phonics')).toBe(5)
  })

  it('falls back to curriculum data when workingLevel absent', () => {
    const snapshot: Pick<SkillSnapshot, 'workingLevels'> = {
      workingLevels: {},
    }
    expect(computeStartLevel(snapshot, 'phonics', { level: 6 })).toBe(6)
  })

  it('falls back to Level 2 when both absent', () => {
    expect(computeStartLevel(null, 'phonics')).toBe(2)
    expect(computeStartLevel(undefined, 'phonics')).toBe(2)
    expect(computeStartLevel({ workingLevels: {} }, 'phonics')).toBe(2)
  })

  it('caps the result at the mode ceiling even if workingLevel is higher', () => {
    const snapshot: Pick<SkillSnapshot, 'workingLevels'> = {
      workingLevels: { comprehension: makeWorkingLevel({ level: 10 }) },
    }
    // comprehension cap is 6
    expect(computeStartLevel(snapshot, 'comprehension')).toBe(6)
  })

  it('caps math at 6', () => {
    const snapshot: Pick<SkillSnapshot, 'workingLevels'> = {
      workingLevels: { math: makeWorkingLevel({ level: 8 }) },
    }
    expect(computeStartLevel(snapshot, 'math')).toBe(6)
  })

  it('different quest modes use different working levels', () => {
    const snapshot: Pick<SkillSnapshot, 'workingLevels'> = {
      workingLevels: {
        phonics: makeWorkingLevel({ level: 4 }),
        comprehension: makeWorkingLevel({ level: 3 }),
        math: makeWorkingLevel({ level: 5 }),
      },
    }
    expect(computeStartLevel(snapshot, 'phonics')).toBe(4)
    expect(computeStartLevel(snapshot, 'comprehension')).toBe(3)
    expect(computeStartLevel(snapshot, 'math')).toBe(5)
  })

  it('prefers workingLevel over curriculum hint', () => {
    const snapshot: Pick<SkillSnapshot, 'workingLevels'> = {
      workingLevels: { phonics: makeWorkingLevel({ level: 3 }) },
    }
    expect(computeStartLevel(snapshot, 'phonics', { level: 7 })).toBe(3)
  })

  it('handles undefined questMode gracefully', () => {
    expect(computeStartLevel(null, undefined)).toBe(2)
  })
})

// ── computeWorkingLevelFromSession ────────────────────────────

describe('computeWorkingLevelFromSession', () => {
  it('stable ceiling at Level 5 with 3 correct → working level = 5', () => {
    const questions = makeQuestions([
      { level: 3, correct: true },
      { level: 3, correct: true },
      { level: 4, correct: true },
      { level: 4, correct: true },
      { level: 5, correct: true },
      { level: 5, correct: true },
      { level: 5, correct: true },
    ])
    const result = computeWorkingLevelFromSession(questions, 5, 'phonics')
    expect(result).not.toBeNull()
    expect(result!.level).toBe(5)
    expect(result!.source).toBe('quest')
  })

  it('got 4 correct at Level 6 but ended at Level 4 (frustration drop) → working level = 4', () => {
    const questions = makeQuestions([
      { level: 5, correct: true },
      { level: 5, correct: true },
      { level: 6, correct: true },
      { level: 6, correct: true },
      { level: 6, correct: true },
      { level: 6, correct: true },
      // then crashed
      { level: 5, correct: false },
      { level: 4, correct: false },
    ])
    // Session ended at level 4 after frustration
    const result = computeWorkingLevelFromSession(questions, 4, 'phonics')
    expect(result).not.toBeNull()
    expect(result!.level).toBe(4)
  })

  it('no level has 2+ correct, ended at Level 3 → working level = 2 (gentle downstep)', () => {
    const questions = makeQuestions([
      { level: 2, correct: true },
      { level: 2, correct: false },
      { level: 3, correct: true },
      { level: 3, correct: false },
      { level: 3, correct: false },
    ])
    const result = computeWorkingLevelFromSession(questions, 3, 'phonics')
    expect(result).not.toBeNull()
    expect(result!.level).toBe(2) // 3 - 1 = 2
  })

  it('short session (3 questions, no clear pattern) → returns null (don\'t update)', () => {
    const questions = makeQuestions([
      { level: 2, correct: true },
      { level: 2, correct: false },
      { level: 2, correct: true },
    ])
    const result = computeWorkingLevelFromSession(questions, 2, 'phonics')
    expect(result).toBeNull()
  })

  it('Level 6 stable ceiling in comprehension → clamped to 6 (cap)', () => {
    const questions = makeQuestions([
      { level: 4, correct: true },
      { level: 4, correct: true },
      { level: 5, correct: true },
      { level: 5, correct: true },
      { level: 6, correct: true },
      { level: 6, correct: true },
      { level: 6, correct: true },
    ])
    const result = computeWorkingLevelFromSession(questions, 6, 'comprehension')
    expect(result).not.toBeNull()
    expect(result!.level).toBe(6) // capped at 6
  })

  it('never goes below 1', () => {
    const questions = makeQuestions([
      { level: 1, correct: false },
      { level: 1, correct: false },
      { level: 1, correct: false },
      { level: 1, correct: false },
      { level: 1, correct: false },
    ])
    // No stable ceiling, session ended at 1, downstep would be 0 → clamped to 1
    const result = computeWorkingLevelFromSession(questions, 1, 'phonics')
    expect(result).not.toBeNull()
    expect(result!.level).toBe(1)
  })

  it('hit level cap with 3+ correct → working level = cap (mastery)', () => {
    const questions = makeQuestions([
      { level: 7, correct: true },
      { level: 7, correct: true },
      { level: 8, correct: true },
      { level: 8, correct: true },
      { level: 8, correct: true },
    ])
    // phonics cap is 8
    const result = computeWorkingLevelFromSession(questions, 8, 'phonics')
    expect(result).not.toBeNull()
    expect(result!.level).toBe(8)
  })

  it('skipped and flagged questions are excluded from count', () => {
    const questions = makeQuestions([
      { level: 2, correct: true },
      { level: 2, correct: true },
      { level: 2, correct: true, skipped: true }, // excluded
      { level: 3, correct: true, flaggedAsError: true }, // excluded
      { level: 3, correct: true },
      { level: 3, correct: false },
      { level: 3, correct: true },
    ])
    // After exclusions: 5 answered, level 2 has 2 correct, level 3 has 2 correct
    const result = computeWorkingLevelFromSession(questions, 3, 'phonics')
    expect(result).not.toBeNull()
    expect(result!.level).toBe(3) // stable ceiling at 3, session ended at 3
  })

  it('evidence string contains session details', () => {
    const questions = makeQuestions([
      { level: 2, correct: true },
      { level: 2, correct: true },
      { level: 3, correct: true },
      { level: 3, correct: true },
      { level: 3, correct: false },
    ])
    const result = computeWorkingLevelFromSession(questions, 3, 'phonics')
    expect(result).not.toBeNull()
    expect(result!.evidence).toContain('Level 3')
    expect(result!.evidence).toContain('4/5')
  })
})

// ── deriveWorkingLevelFromEvaluation ──────────────────────────

describe('deriveWorkingLevelFromEvaluation', () => {
  function makeFinding(overrides: Partial<EvaluationFinding>): EvaluationFinding {
    return {
      skill: 'phonics.cvc',
      status: 'mastered',
      evidence: 'Test evidence',
      testedAt: new Date().toISOString(),
      ...overrides,
    }
  }

  it('maps mastered phonics skills to levels', () => {
    const findings: EvaluationFinding[] = [
      makeFinding({ skill: 'phonics.cvc.short-a', status: 'mastered' }), // L2
      makeFinding({ skill: 'phonics.cvce', status: 'mastered' }), // L5
      makeFinding({ skill: 'phonics.vowel-team', status: 'emerging' }), // not counted (emerging)
    ]
    const result = deriveWorkingLevelFromEvaluation(findings, 'phonics')
    expect(result).not.toBeNull()
    expect(result!.level).toBe(5)
    expect(result!.source).toBe('evaluation')
  })

  it('returns null when no relevant mastered findings', () => {
    const findings: EvaluationFinding[] = [
      makeFinding({ skill: 'phonics.cvc', status: 'emerging' }),
      makeFinding({ skill: 'phonics.blends', status: 'not-yet' }),
    ]
    const result = deriveWorkingLevelFromEvaluation(findings, 'phonics')
    expect(result).toBeNull()
  })

  it('maps comprehension skills correctly', () => {
    const findings: EvaluationFinding[] = [
      makeFinding({ skill: 'comprehension.inference', status: 'mastered' }), // L4
      makeFinding({ skill: 'comprehension.recall', status: 'mastered' }), // L1
    ]
    const result = deriveWorkingLevelFromEvaluation(findings, 'comprehension')
    expect(result).not.toBeNull()
    expect(result!.level).toBe(4)
  })

  it('caps at mode ceiling', () => {
    const findings: EvaluationFinding[] = [
      makeFinding({ skill: 'comprehension.synthesis', status: 'mastered' }), // L6
      makeFinding({ skill: 'comprehension.evaluation', status: 'mastered' }), // L6
    ]
    const result = deriveWorkingLevelFromEvaluation(findings, 'comprehension')
    expect(result).not.toBeNull()
    expect(result!.level).toBe(6)
  })

  it('evidence includes mastered skill names', () => {
    const findings: EvaluationFinding[] = [
      makeFinding({ skill: 'phonics.digraphs.ch', status: 'mastered' }),
    ]
    const result = deriveWorkingLevelFromEvaluation(findings, 'phonics')
    expect(result).not.toBeNull()
    expect(result!.evidence).toContain('digraph')
  })
})

// ── deriveMathWorkingLevelFromScan ────────────────────────────

describe('deriveMathWorkingLevelFromScan', () => {
  it('returns null for null lesson number', () => {
    expect(deriveMathWorkingLevelFromScan(null, 'GATB Math')).toBeNull()
  })

  it('returns null for zero lesson number', () => {
    expect(deriveMathWorkingLevelFromScan(0, 'GATB Math')).toBeNull()
  })

  it('maps lesson 1-30 to level 1', () => {
    const result = deriveMathWorkingLevelFromScan(15, 'GATB Math Level 1')
    expect(result).not.toBeNull()
    expect(result!.level).toBe(1)
    expect(result!.source).toBe('curriculum')
  })

  it('maps lesson 31-60 to level 2', () => {
    const result = deriveMathWorkingLevelFromScan(45, 'GATB Math Level 2')
    expect(result).not.toBeNull()
    expect(result!.level).toBe(2)
  })

  it('maps lesson 91-120 to level 4', () => {
    const result = deriveMathWorkingLevelFromScan(107, 'GATB Math Level 3')
    expect(result).not.toBeNull()
    expect(result!.level).toBe(4)
  })

  it('maps lesson 151+ to level 6 (capped at math ceiling)', () => {
    const result = deriveMathWorkingLevelFromScan(175, 'GATB Math Level 5')
    expect(result).not.toBeNull()
    expect(result!.level).toBe(6)
  })

  it('evidence includes curriculum name and lesson', () => {
    const result = deriveMathWorkingLevelFromScan(107, 'Good and the Beautiful Math')
    expect(result).not.toBeNull()
    expect(result!.evidence).toContain('Good and the Beautiful Math')
    expect(result!.evidence).toContain('Lesson 107')
  })
})
