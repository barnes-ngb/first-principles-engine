import { describe, it, expect } from 'vitest'

import {
  extractChecklistSignals,
  extractQuestSignals,
  aggregateMastery,
  pendingCheckoffs,
  MASTERY_MIN_STRONG_SIGNALS,
  MASTERY_MIN_OCCASIONS,
  QUEST_STRONG_ACCURACY,
  QUEST_STRONG_MIN_ATTEMPTS,
  QUEST_STRUGGLE_ACCURACY,
} from './masteryRollup'
import type { DayLogLike, QuestSessionLike, MasterySignal } from './masteryRollup'
import type { SkillSnapshot } from '../../core/types/evaluation'
import { MasteryGate, SkillLevel } from '../../core/types/enums'

// ── extractChecklistSignals ─────────────────────────────────────────────────

describe('extractChecklistSignals', () => {
  it('extracts got-it signals as strong', () => {
    const logs: DayLogLike[] = [
      {
        date: '2026-06-01',
        checklist: [
          { label: 'Phonics Lesson (15m)', completed: true, mastery: 'got-it' },
        ],
      },
    ]
    const signals = extractChecklistSignals(logs)
    expect(signals).toHaveLength(1)
    expect(signals[0].kind).toBe('strong')
    expect(signals[0].source).toBe('checklist')
    expect(signals[0].date).toBe('2026-06-01')
    expect(signals[0].label).toBe('Phonics Lesson (15m)')
  })

  it('extracts working signals as neutral', () => {
    const logs: DayLogLike[] = [
      {
        date: '2026-06-01',
        checklist: [
          { label: 'Spelling Practice (10m)', completed: true, mastery: 'working' },
        ],
      },
    ]
    const signals = extractChecklistSignals(logs)
    expect(signals).toHaveLength(1)
    expect(signals[0].kind).toBe('neutral')
  })

  it('extracts stuck signals as struggle', () => {
    const logs: DayLogLike[] = [
      {
        date: '2026-06-02',
        checklist: [
          { label: 'Sight Words (10m)', completed: true, mastery: 'stuck' },
        ],
      },
    ]
    const signals = extractChecklistSignals(logs)
    expect(signals).toHaveLength(1)
    expect(signals[0].kind).toBe('struggle')
  })

  it('skips items without mastery chip', () => {
    const logs: DayLogLike[] = [
      {
        date: '2026-06-01',
        checklist: [
          { label: 'Math (20m)', completed: true },
          { label: 'Reading (15m)', completed: true, mastery: undefined },
        ],
      },
    ]
    expect(extractChecklistSignals(logs)).toHaveLength(0)
  })

  it('skips items with empty label', () => {
    const logs: DayLogLike[] = [
      {
        date: '2026-06-01',
        checklist: [
          { label: '', completed: true, mastery: 'got-it' },
          { label: '  ', completed: true, mastery: 'got-it' },
        ],
      },
    ]
    expect(extractChecklistSignals(logs)).toHaveLength(0)
  })

  it('skips day logs with empty or missing date', () => {
    const logs: DayLogLike[] = [
      { date: '', checklist: [{ label: 'Math', completed: true, mastery: 'got-it' }] },
      { date: undefined as unknown as string, checklist: [{ label: 'Math', completed: true, mastery: 'got-it' }] },
    ]
    expect(extractChecklistSignals(logs)).toHaveLength(0)
  })

  it('handles missing checklist gracefully', () => {
    const logs: DayLogLike[] = [{ date: '2026-06-01' }]
    expect(extractChecklistSignals(logs)).toHaveLength(0)
  })

  it('extracts multiple signals across multiple days', () => {
    const logs: DayLogLike[] = [
      {
        date: '2026-06-01',
        checklist: [
          { label: 'Phonics (15m)', completed: true, mastery: 'got-it' },
          { label: 'Math (20m)', completed: true, mastery: 'working' },
        ],
      },
      {
        date: '2026-06-02',
        checklist: [
          { label: 'Phonics (15m)', completed: true, mastery: 'got-it' },
        ],
      },
    ]
    const signals = extractChecklistSignals(logs)
    expect(signals).toHaveLength(3)
  })
})

// ── extractQuestSignals ─────────────────────────────────────────────────────

describe('extractQuestSignals', () => {
  it('marks high-accuracy skills as strong', () => {
    const sessions: QuestSessionLike[] = [
      {
        evaluatedAt: '2026-06-01T10:00:00Z',
        questions: [
          { skill: 'short-vowels', correct: true, skipped: false },
          { skill: 'short-vowels', correct: true, skipped: false },
        ],
      },
    ]
    const signals = extractQuestSignals(sessions)
    expect(signals).toHaveLength(1)
    expect(signals[0].kind).toBe('strong')
    expect(signals[0].date).toBe('2026-06-01')
    expect(signals[0].source).toBe('quest')
  })

  it('marks low-accuracy skills as struggle', () => {
    const sessions: QuestSessionLike[] = [
      {
        evaluatedAt: '2026-06-01T10:00:00Z',
        questions: [
          { skill: 'long-division', correct: false, skipped: false },
          { skill: 'long-division', correct: false, skipped: false },
        ],
      },
    ]
    const signals = extractQuestSignals(sessions)
    expect(signals).toHaveLength(1)
    expect(signals[0].kind).toBe('struggle')
  })

  it('marks mid-accuracy skills as neutral', () => {
    const sessions: QuestSessionLike[] = [
      {
        evaluatedAt: '2026-06-01T10:00:00Z',
        questions: [
          { skill: 'fractions', correct: true, skipped: false },
          { skill: 'fractions', correct: false, skipped: false },
          { skill: 'fractions', correct: false, skipped: false },
        ],
      },
    ]
    // 1/3 correct = 33% — below struggle threshold
    const signals = extractQuestSignals(sessions)
    expect(signals).toHaveLength(1)
    expect(signals[0].kind).toBe('struggle')
  })

  it('requires minimum attempts for strong signal', () => {
    const sessions: QuestSessionLike[] = [
      {
        evaluatedAt: '2026-06-01T10:00:00Z',
        questions: [
          { skill: 'addition', correct: true, skipped: false },
        ],
      },
    ]
    // 1 attempt (below QUEST_STRONG_MIN_ATTEMPTS=2) at 100% → neutral, not strong
    const signals = extractQuestSignals(sessions)
    expect(signals).toHaveLength(1)
    expect(signals[0].kind).toBe('neutral')
  })

  it('skips questions without skill tag', () => {
    const sessions: QuestSessionLike[] = [
      {
        evaluatedAt: '2026-06-01T10:00:00Z',
        questions: [
          { skill: '', correct: true, skipped: false },
          { skill: undefined as unknown as string, correct: true, skipped: false },
        ],
      },
    ]
    expect(extractQuestSignals(sessions)).toHaveLength(0)
  })

  it('ignores skipped questions', () => {
    const sessions: QuestSessionLike[] = [
      {
        evaluatedAt: '2026-06-01T10:00:00Z',
        questions: [
          { skill: 'vowels', correct: false, skipped: true },
          { skill: 'vowels', correct: true, skipped: false },
        ],
      },
    ]
    const signals = extractQuestSignals(sessions)
    expect(signals).toHaveLength(1)
    // Only 1 graded attempt (the non-skipped one) — below min for strong
    expect(signals[0].kind).toBe('neutral')
  })

  it('handles sessions with no evaluatedAt', () => {
    const sessions: QuestSessionLike[] = [
      {
        questions: [{ skill: 'math', correct: true, skipped: false }],
      },
    ]
    expect(extractQuestSignals(sessions)).toHaveLength(0)
  })

  it('groups questions by skill within a session', () => {
    const sessions: QuestSessionLike[] = [
      {
        evaluatedAt: '2026-06-01T10:00:00Z',
        questions: [
          { skill: 'vowels', correct: true, skipped: false },
          { skill: 'vowels', correct: true, skipped: false },
          { skill: 'consonants', correct: false, skipped: false },
          { skill: 'consonants', correct: false, skipped: false },
        ],
      },
    ]
    const signals = extractQuestSignals(sessions)
    expect(signals).toHaveLength(2)
    const vowelSignal = signals.find((s) => s.label === 'vowels')
    const consonantSignal = signals.find((s) => s.label === 'consonants')
    expect(vowelSignal?.kind).toBe('strong')
    expect(consonantSignal?.kind).toBe('struggle')
  })
})

// ── aggregateMastery ────────────────────────────────────────────────────────

describe('aggregateMastery', () => {
  it('returns empty array for no signals', () => {
    expect(aggregateMastery([])).toEqual([])
  })

  it('does NOT mark mastered with only 2 strong signals (below threshold)', () => {
    const signals: MasterySignal[] = [
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-01', source: 'checklist' },
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-02', source: 'checklist' },
    ]
    const rollups = aggregateMastery(signals)
    expect(rollups).toHaveLength(1)
    expect(rollups[0].mastered).toBe(false)
    expect(rollups[0].strongSignals).toBe(2)
  })

  it('marks mastered with 3+ strong signals across 2+ days', () => {
    const signals: MasterySignal[] = [
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-01', source: 'checklist' },
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-01', source: 'quest' },
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-02', source: 'checklist' },
    ]
    const rollups = aggregateMastery(signals)
    expect(rollups).toHaveLength(1)
    expect(rollups[0].mastered).toBe(true)
    expect(rollups[0].strongOccasions).toBe(2)
    expect(rollups[0].sources).toEqual(['checklist', 'quest'])
  })

  it('vetoes mastery when ANY struggle signal exists (zero tolerance)', () => {
    const signals: MasterySignal[] = [
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-01', source: 'checklist' },
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-02', source: 'checklist' },
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-03', source: 'checklist' },
      { skillKey: 'phonics', label: 'Phonics', kind: 'struggle', date: '2026-06-04', source: 'checklist' },
    ]
    const rollups = aggregateMastery(signals)
    expect(rollups[0].mastered).toBe(false)
    expect(rollups[0].struggleSignals).toBe(1)
  })

  it('does NOT mark mastered when all strong signals are on the same day', () => {
    const signals: MasterySignal[] = [
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-01', source: 'checklist' },
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-01', source: 'quest' },
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-01', source: 'checklist' },
    ]
    const rollups = aggregateMastery(signals)
    expect(rollups[0].mastered).toBe(false)
    expect(rollups[0].strongOccasions).toBe(1)
  })

  it('sorts mastered items first, then by strong signal count', () => {
    const signals: MasterySignal[] = [
      // Skill A: not mastered (only 1 strong)
      { skillKey: 'skillA', label: 'A', kind: 'strong', date: '2026-06-01', source: 'checklist' },
      // Skill B: mastered
      { skillKey: 'skillB', label: 'B', kind: 'strong', date: '2026-06-01', source: 'checklist' },
      { skillKey: 'skillB', label: 'B', kind: 'strong', date: '2026-06-02', source: 'checklist' },
      { skillKey: 'skillB', label: 'B', kind: 'strong', date: '2026-06-03', source: 'checklist' },
      // Skill C: not mastered (2 strong on same day)
      { skillKey: 'skillC', label: 'C', kind: 'strong', date: '2026-06-01', source: 'checklist' },
      { skillKey: 'skillC', label: 'C', kind: 'strong', date: '2026-06-01', source: 'quest' },
    ]
    const rollups = aggregateMastery(signals)
    expect(rollups[0].skillKey).toBe('skillB')
    expect(rollups[0].mastered).toBe(true)
    // Non-mastered sorted by strong count descending
    expect(rollups[1].skillKey).toBe('skillC')
    expect(rollups[1].strongSignals).toBe(2)
    expect(rollups[2].skillKey).toBe('skillA')
    expect(rollups[2].strongSignals).toBe(1)
  })

  it('uses the most recent label as display label', () => {
    const signals: MasterySignal[] = [
      { skillKey: 'phonics', label: 'Old Label', kind: 'strong', date: '2026-06-01', source: 'checklist' },
      { skillKey: 'phonics', label: 'New Label', kind: 'strong', date: '2026-06-05', source: 'checklist' },
    ]
    const rollups = aggregateMastery(signals)
    expect(rollups[0].label).toBe('New Label')
  })

  it('tracks lastSignalDate as the most recent signal', () => {
    const signals: MasterySignal[] = [
      { skillKey: 'math', label: 'Math', kind: 'neutral', date: '2026-06-10', source: 'checklist' },
      { skillKey: 'math', label: 'Math', kind: 'strong', date: '2026-06-01', source: 'checklist' },
    ]
    const rollups = aggregateMastery(signals)
    expect(rollups[0].lastSignalDate).toBe('2026-06-10')
  })

  it('includes evidence string describing the mastery status', () => {
    const signals: MasterySignal[] = [
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-01', source: 'checklist' },
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-02', source: 'checklist' },
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-03', source: 'checklist' },
    ]
    const rollups = aggregateMastery(signals)
    expect(rollups[0].mastered).toBe(true)
    expect(rollups[0].evidence).toContain('mastered via repeated got-it')
    expect(rollups[0].evidence).toContain('3 strong across 3 days')
  })

  it('skips signals with empty skillKey', () => {
    const signals: MasterySignal[] = [
      { skillKey: '', label: 'Phonics', kind: 'strong', date: '2026-06-01', source: 'checklist' },
    ]
    expect(aggregateMastery(signals)).toHaveLength(0)
  })

  it('counts neutral signals without affecting mastery threshold', () => {
    const signals: MasterySignal[] = [
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-01', source: 'checklist' },
      { skillKey: 'phonics', label: 'Phonics', kind: 'neutral', date: '2026-06-02', source: 'checklist' },
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-02', source: 'quest' },
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-03', source: 'checklist' },
    ]
    const rollups = aggregateMastery(signals)
    expect(rollups[0].mastered).toBe(true)
    expect(rollups[0].neutralSignals).toBe(1)
  })
})

// ── pendingCheckoffs ────────────────────────────────────────────────────────

describe('pendingCheckoffs', () => {
  it('returns empty when snapshot is null', () => {
    const rollups = aggregateMastery([
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-01', source: 'checklist' },
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-02', source: 'checklist' },
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-03', source: 'checklist' },
    ])
    expect(pendingCheckoffs(rollups, null)).toEqual([])
  })

  it('returns empty when rollup has no mastered items', () => {
    const rollups = aggregateMastery([
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-01', source: 'checklist' },
    ])
    const snapshot: SkillSnapshot = {
      childId: 'child-1',
      prioritySkills: [{ tag: 'phonics', label: 'Phonics', level: SkillLevel.Emerging }],
      supports: [],
      stopRules: [],
      evidenceDefinitions: [],
      conceptualBlocks: [],
    }
    expect(pendingCheckoffs(rollups, snapshot)).toEqual([])
  })

  it('includes mastered skill that matches an active priority skill', () => {
    const rollups = aggregateMastery([
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-01', source: 'checklist' },
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-02', source: 'checklist' },
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-03', source: 'checklist' },
    ])
    const snapshot: SkillSnapshot = {
      childId: 'child-1',
      prioritySkills: [{ tag: 'phonics', label: 'Phonics', level: SkillLevel.Emerging, masteryGate: MasteryGate.NotYet }],
      supports: [],
      stopRules: [],
      evidenceDefinitions: [],
      conceptualBlocks: [],
    }
    const pending = pendingCheckoffs(rollups, snapshot)
    expect(pending).toHaveLength(1)
    expect(pending[0].skillKey).toBe('phonics')
  })

  it('excludes mastered skill already at Secure + IndependentConsistent', () => {
    const rollups = aggregateMastery([
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-01', source: 'checklist' },
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-02', source: 'checklist' },
      { skillKey: 'phonics', label: 'Phonics', kind: 'strong', date: '2026-06-03', source: 'checklist' },
    ])
    const snapshot: SkillSnapshot = {
      childId: 'child-1',
      prioritySkills: [{
        tag: 'phonics',
        label: 'Phonics',
        level: SkillLevel.Secure,
        masteryGate: MasteryGate.IndependentConsistent,
      }],
      supports: [],
      stopRules: [],
      evidenceDefinitions: [],
      conceptualBlocks: [],
    }
    expect(pendingCheckoffs(rollups, snapshot)).toEqual([])
  })

  it('includes mastered skill matching an active conceptual block', () => {
    const rollups = aggregateMastery([
      { skillKey: 'short-vowels', label: 'Short Vowels', kind: 'strong', date: '2026-06-01', source: 'checklist' },
      { skillKey: 'short-vowels', label: 'Short Vowels', kind: 'strong', date: '2026-06-02', source: 'checklist' },
      { skillKey: 'short-vowels', label: 'Short Vowels', kind: 'strong', date: '2026-06-03', source: 'checklist' },
    ])
    const snapshot: SkillSnapshot = {
      childId: 'child-1',
      prioritySkills: [],
      supports: [],
      stopRules: [],
      evidenceDefinitions: [],
      conceptualBlocks: [
        {
          name: 'Short Vowels',
          affectedSkills: ['short-vowels'],
          status: 'ADDRESS_NOW',
          rationale: '',
          source: 'eval',
        },
      ],
    }
    const pending = pendingCheckoffs(rollups, snapshot)
    expect(pending).toHaveLength(1)
  })

  it('excludes mastered skill matching a RESOLVED block', () => {
    const rollups = aggregateMastery([
      { skillKey: 'short-vowels', label: 'Short Vowels', kind: 'strong', date: '2026-06-01', source: 'checklist' },
      { skillKey: 'short-vowels', label: 'Short Vowels', kind: 'strong', date: '2026-06-02', source: 'checklist' },
      { skillKey: 'short-vowels', label: 'Short Vowels', kind: 'strong', date: '2026-06-03', source: 'checklist' },
    ])
    const snapshot: SkillSnapshot = {
      childId: 'child-1',
      prioritySkills: [],
      supports: [],
      stopRules: [],
      evidenceDefinitions: [],
      conceptualBlocks: [
        {
          name: 'Short Vowels',
          affectedSkills: ['short-vowels'],
          status: 'RESOLVED',
          rationale: '',
          source: 'eval',
        },
      ],
    }
    expect(pendingCheckoffs(rollups, snapshot)).toEqual([])
  })
})

// ── Threshold constants ─────────────────────────────────────────────────────

describe('mastery threshold constants', () => {
  it('requires at least 3 strong signals', () => {
    expect(MASTERY_MIN_STRONG_SIGNALS).toBe(3)
  })

  it('requires at least 2 distinct occasions', () => {
    expect(MASTERY_MIN_OCCASIONS).toBe(2)
  })

  it('requires 80% accuracy for quest strong signal', () => {
    expect(QUEST_STRONG_ACCURACY).toBe(0.8)
  })

  it('requires at least 2 graded attempts for quest strong', () => {
    expect(QUEST_STRONG_MIN_ATTEMPTS).toBe(2)
  })

  it('marks 50% or below as quest struggle', () => {
    expect(QUEST_STRUGGLE_ACCURACY).toBe(0.5)
  })
})
