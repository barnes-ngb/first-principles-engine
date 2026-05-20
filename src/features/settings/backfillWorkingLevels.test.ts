import { describe, expect, it } from 'vitest'

import type { EvaluationFinding, WorkingLevel } from '../../core/types/evaluation'
import type { SessionQuestion } from '../quest/questTypes'
import { computeBackfillForMode } from './backfillWorkingLevels'
import type { EvalSessionWithExtras } from './backfillWorkingLevels'

// ── Helpers ─────────────────────────────────────────────────────

const RECENT = new Date().toISOString()
const OLD_60_DAYS = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

function makeEvalSession(
  overrides: Partial<EvalSessionWithExtras> = {},
): EvalSessionWithExtras {
  return {
    childId: 'child1',
    domain: 'reading',
    status: 'complete',
    messages: [],
    findings: [],
    recommendations: [],
    evaluatedAt: RECENT,
    ...overrides,
  }
}

function makeFinding(
  skill: string,
  status: 'mastered' | 'emerging' | 'not-yet',
): EvaluationFinding {
  return { skill, status, evidence: 'test evidence', testedAt: RECENT }
}

function makeQuestion(
  overrides: Partial<SessionQuestion> = {},
): SessionQuestion {
  return {
    id: `q_${Math.random().toString(36).slice(2)}`,
    type: 'multiple-choice',
    level: 3,
    skill: 'phonics.cvc',
    prompt: 'What sound?',
    options: ['a', 'b', 'c'],
    correctAnswer: 'a',
    childAnswer: 'a',
    correct: true,
    responseTimeMs: 2000,
    timestamp: RECENT,
    ...overrides,
  }
}

/** Build N questions at a given level with correct/wrong mix */
function makeQuestQuestions(
  specs: Array<{ level: number; correct: boolean }>,
): SessionQuestion[] {
  return specs.map((s) =>
    makeQuestion({
      level: s.level,
      correct: s.correct,
      childAnswer: s.correct ? 'a' : 'b',
    }),
  )
}

// ── Tests ───────────────────────────────────────────────────────

describe('computeBackfillForMode', () => {
  it('skips when workingLevel already exists', () => {
    const existing: WorkingLevel = {
      level: 3,
      updatedAt: RECENT,
      source: 'quest',
      evidence: 'test',
    }
    const result = computeBackfillForMode('phonics', existing, [], THIRTY_DAYS_AGO)
    expect(result).toEqual({ action: 'skip', reason: 'already set' })
  })

  it('writes from evaluation when no workingLevel and mastered findings exist', () => {
    const session = makeEvalSession({
      findings: [
        makeFinding('phonics.cvc', 'mastered'),
        makeFinding('phonics.blends', 'mastered'),
      ],
    })
    const result = computeBackfillForMode(
      'phonics',
      undefined,
      [session],
      THIRTY_DAYS_AGO,
    )
    expect(result.action).toBe('write')
    if (result.action === 'write') {
      expect(result.workingLevel.source).toBe('evaluation')
      expect(result.workingLevel.level).toBe(3) // blends = level 3
    }
  })

  it('falls back to quest history when evaluation has no mastered findings', () => {
    // Eval session with only emerging findings → no derivation
    const evalSession = makeEvalSession({
      findings: [makeFinding('phonics.cvc', 'emerging')],
    })

    // Quest session with 6 answered questions (> MIN_QUESTIONS_FOR_UPDATE = 5)
    const questions = makeQuestQuestions([
      { level: 4, correct: true },
      { level: 4, correct: true },
      { level: 4, correct: false },
      { level: 5, correct: false },
      { level: 4, correct: true },
      { level: 3, correct: true },
    ])

    const questSession = makeEvalSession({
      sessionType: 'interactive',
      questMode: 'phonics',
      questions,
      finalLevel: 4,
    })

    const result = computeBackfillForMode(
      'phonics',
      undefined,
      [evalSession, questSession],
      THIRTY_DAYS_AGO,
    )
    expect(result.action).toBe('write')
    if (result.action === 'write') {
      expect(result.workingLevel.source).toBe('quest')
      expect(result.workingLevel.level).toBe(4)
    }
  })

  it('skips entirely when neither evaluation nor quest data exists', () => {
    const result = computeBackfillForMode(
      'phonics',
      undefined,
      [],
      THIRTY_DAYS_AGO,
    )
    expect(result).toEqual({ action: 'skip', reason: 'no evidence available' })
  })

  it('skips sessions older than 30 days', () => {
    const session = makeEvalSession({
      evaluatedAt: OLD_60_DAYS,
      findings: [makeFinding('phonics.cvc', 'mastered')],
    })
    const result = computeBackfillForMode(
      'phonics',
      undefined,
      [session],
      THIRTY_DAYS_AGO,
    )
    expect(result).toEqual({ action: 'skip', reason: 'no evidence available' })
  })

  it('is idempotent: returns skip for already-set mode even when sessions exist', () => {
    const existing: WorkingLevel = {
      level: 5,
      updatedAt: RECENT,
      source: 'evaluation',
      evidence: 'backfilled',
    }
    const session = makeEvalSession({
      findings: [makeFinding('phonics.multisyllable', 'mastered')],
    })
    const result = computeBackfillForMode(
      'phonics',
      existing,
      [session],
      THIRTY_DAYS_AGO,
    )
    expect(result).toEqual({ action: 'skip', reason: 'already set' })
  })

  it('handles comprehension mode with appropriate skill mapping', () => {
    const session = makeEvalSession({
      findings: [
        makeFinding('comprehension.inference', 'mastered'),
        makeFinding('comprehension.main-idea', 'mastered'),
      ],
    })
    const result = computeBackfillForMode(
      'comprehension',
      undefined,
      [session],
      THIRTY_DAYS_AGO,
    )
    expect(result.action).toBe('write')
    if (result.action === 'write') {
      expect(result.workingLevel.source).toBe('evaluation')
      expect(result.workingLevel.level).toBe(4) // inference = level 4
    }
  })

  it('math mode skips evaluation derivation and uses quest history', () => {
    // Math evaluation session (deriveWorkingLevelFromEvaluation doesn't support math)
    const evalSession = makeEvalSession({
      domain: 'math',
      findings: [makeFinding('multiplication', 'mastered')],
    })

    // Math quest session with 6 answered questions
    const questions = makeQuestQuestions([
      { level: 3, correct: true },
      { level: 3, correct: true },
      { level: 3, correct: true },
      { level: 4, correct: false },
      { level: 3, correct: true },
      { level: 3, correct: true },
    ])

    const questSession = makeEvalSession({
      domain: 'math',
      sessionType: 'interactive',
      questMode: 'math',
      questions,
      finalLevel: 3,
    })

    const result = computeBackfillForMode(
      'math',
      undefined,
      [evalSession, questSession],
      THIRTY_DAYS_AGO,
    )
    expect(result.action).toBe('write')
    if (result.action === 'write') {
      expect(result.workingLevel.source).toBe('quest')
      expect(result.workingLevel.level).toBe(3)
    }
  })

  it('ignores interactive sessions for evaluation derivation path', () => {
    // Interactive session that has findings — should NOT be used for evaluation derivation
    const interactiveSession = makeEvalSession({
      sessionType: 'interactive',
      questMode: 'phonics',
      findings: [makeFinding('phonics.r-controlled', 'mastered')],
      // Too few questions for quest derivation
      questions: [makeQuestion()],
      finalLevel: 3,
    })

    const result = computeBackfillForMode(
      'phonics',
      undefined,
      [interactiveSession],
      THIRTY_DAYS_AGO,
    )
    // Evaluation path skips interactive sessions;
    // Quest path: only 1 question < MIN_QUESTIONS_FOR_UPDATE(5) → null
    expect(result).toEqual({ action: 'skip', reason: 'no evidence available' })
  })

  it('skips quest sessions with too few questions', () => {
    const questSession = makeEvalSession({
      sessionType: 'interactive',
      questMode: 'phonics',
      questions: makeQuestQuestions([
        { level: 3, correct: true },
        { level: 3, correct: true },
        { level: 3, correct: true },
      ]), // Only 3 questions, MIN is 5
      finalLevel: 3,
    })

    const result = computeBackfillForMode(
      'phonics',
      undefined,
      [questSession],
      THIRTY_DAYS_AGO,
    )
    expect(result).toEqual({ action: 'skip', reason: 'no evidence available' })
  })

  it('uses most recent qualifying session, not older ones', () => {
    const recentDate = new Date().toISOString()
    const olderDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()

    // More recent session: lower skill
    const recentSession = makeEvalSession({
      evaluatedAt: recentDate,
      findings: [makeFinding('phonics.cvc', 'mastered')],
    })
    // Older session: higher skill
    const olderSession = makeEvalSession({
      evaluatedAt: olderDate,
      findings: [makeFinding('phonics.r-controlled', 'mastered')],
    })

    // Sessions are sorted desc — recent first
    const result = computeBackfillForMode(
      'phonics',
      undefined,
      [recentSession, olderSession],
      THIRTY_DAYS_AGO,
    )
    expect(result.action).toBe('write')
    if (result.action === 'write') {
      expect(result.workingLevel.level).toBe(2) // cvc = level 2 (recent wins)
    }
  })
})
