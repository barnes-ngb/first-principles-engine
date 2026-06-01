import { describe, expect, it } from 'vitest'

import {
  computeSentenceLevelFromQuestions,
  deriveSentenceFindings,
  computeWritingLevelFromSpellingQuestions,
  deriveWorkingLevelFromEvaluation,
  computeWorkingLevelFromSession,
} from './workingLevels'
import type { SessionQuestion } from './questTypes'
import type { EvaluationFinding, SkillSnapshot } from '../../core/types/evaluation'
import { generateBlockId } from '../../core/utils/blockerLifecycle'
import { extractQuestSignals, aggregateMastery } from '../evaluate/masteryRollup'
import { applyToSnapshot } from '../evaluate/skillSnapshotWrites'
import { SkillLevel, MasteryGate } from '../../core/types/enums'

// ── Builders ────────────────────────────────────────────────────

function sentenceQ(
  level: number,
  correct: boolean,
  skill = 'writing.composition.sentence',
): SessionQuestion {
  return {
    id: `bs_${Math.random().toString(36).slice(2)}`,
    type: 'build-sentence',
    level,
    skill,
    prompt: 'Listen, then build the sentence — tap the words in order!',
    options: ['⇧', 'the', 'cat', 'ran', '.'],
    correctAnswer: 'The cat ran.',
    childAnswer: correct ? 'The cat ran.' : 'the cat ran',
    correct,
    responseTimeMs: 4000,
    timestamp: new Date().toISOString(),
    inputMethod: 'tile',
  }
}

function spellQ(level: number, correct: boolean, skill = 'writing.spelling.phonetic'): SessionQuestion {
  return {
    id: `sw_${Math.random().toString(36).slice(2)}`,
    type: 'spell-word',
    level,
    skill,
    prompt: 'Listen, then spell the word with your sound-blocks!',
    options: ['c', 'a', 't'],
    correctAnswer: 'cat',
    childAnswer: correct ? 'cat' : 'cot',
    correct,
    responseTimeMs: 3000,
    timestamp: new Date().toISOString(),
    inputMethod: 'tile',
  }
}

function phonicsQ(level: number, correct: boolean): SessionQuestion {
  return {
    id: `mc_${Math.random().toString(36).slice(2)}`,
    type: 'multiple-choice',
    level,
    skill: 'phonics.cvc',
    prompt: 'What word?',
    options: ['cat', 'dog', 'sun'],
    correctAnswer: 'cat',
    childAnswer: correct ? 'cat' : 'dog',
    correct,
    responseTimeMs: 2000,
    timestamp: new Date().toISOString(),
  }
}

// ── Findings derive workingLevels.sentence (its own level) ────────

describe('computeSentenceLevelFromQuestions — sentence derives its own level', () => {
  it('derives the sentence level from the build-sentence subset only (highest correct)', () => {
    const questions = [sentenceQ(3, true), sentenceQ(4, true), sentenceQ(5, false)]
    const wl = computeSentenceLevelFromQuestions(questions)
    expect(wl).not.toBeNull()
    expect(wl!.level).toBe(4)
    expect(wl!.source).toBe('quest')
  })

  it('returns null when there were no sentence questions (only phonics/spelling)', () => {
    expect(computeSentenceLevelFromQuestions([phonicsQ(3, true), spellQ(4, true)])).toBeNull()
  })

  it('gentle downstep when nothing was built correctly', () => {
    expect(computeSentenceLevelFromQuestions([sentenceQ(4, false), sentenceQ(4, false)])!.level).toBe(3)
  })

  it('caps the sentence level at the sentence ceiling', () => {
    expect(computeSentenceLevelFromQuestions([sentenceQ(6, true)])!.level).toBeLessThanOrEqual(6)
  })

  it('ignores skipped / flagged sentence questions', () => {
    const questions = [sentenceQ(5, true), { ...sentenceQ(6, true), skipped: true }]
    expect(computeSentenceLevelFromQuestions(questions)!.level).toBe(5)
  })
})

// ── Separability: spelling ≠ sentence ≠ phonics, never one number ──

describe('sentence is a separable signal (never blurred with spelling or phonics)', () => {
  it('a mixed session derives DISTINCT phonics, spelling, and sentence levels', () => {
    // Strong phonics at L5, spelling steady at L3, sentence only at L2 — all three
    // must stay separate numbers from the same session.
    const questions: SessionQuestion[] = [
      phonicsQ(5, true), phonicsQ(5, true), phonicsQ(5, true),
      phonicsQ(4, true), phonicsQ(4, true),
      spellQ(3, true), spellQ(3, true),
      sentenceQ(2, true), sentenceQ(2, true),
    ]
    const phonics = computeWorkingLevelFromSession(questions, 5, 'phonics')
    const spelling = computeWritingLevelFromSpellingQuestions(questions)
    const sentence = computeSentenceLevelFromQuestions(questions)
    expect(phonics!.level).toBe(5)
    expect(spelling!.level).toBe(3)
    expect(sentence!.level).toBe(2)
    // Three different numbers — separable by construction.
    expect(new Set([phonics!.level, spelling!.level, sentence!.level]).size).toBe(3)
  })

  it('spelling derivation ignores sentence questions and vice versa (no cross-contamination)', () => {
    // Only sentence questions present → spelling derivation is null...
    expect(computeWritingLevelFromSpellingQuestions([sentenceQ(4, true)])).toBeNull()
    // ...and only spelling questions present → sentence derivation is null.
    expect(computeSentenceLevelFromQuestions([spellQ(4, true)])).toBeNull()
  })

  it('all sentence skills live under writing.composition.sentence / writing.sentence.* (not writing.spelling.*)', () => {
    const findings = deriveSentenceFindings([
      sentenceQ(2, true, 'writing.composition.sentence'),
      sentenceQ(3, true, 'writing.sentence.order'),
    ])
    expect(findings.length).toBe(2)
    expect(findings.every((f) => f.skill.startsWith('writing.'))).toBe(true)
    // None are tagged `writing.spelling.*` — the spelling level can never absorb them.
    expect(findings.some((f) => f.skill.startsWith('writing.spelling'))).toBe(false)
  })
})

// ── deriveSentenceFindings: emerging-only, NEVER mastered inline ──

describe('deriveSentenceFindings — seeds emerging, never asserts mastery inline', () => {
  it('emits emerging for built skills and not-yet for missed ones — never mastered', () => {
    const findings = deriveSentenceFindings([
      sentenceQ(2, true, 'writing.composition.sentence'),
      sentenceQ(3, false, 'writing.sentence.order'),
    ])
    const bySkill = Object.fromEntries(findings.map((f) => [f.skill, f.status]))
    expect(bySkill['writing.composition.sentence']).toBe('emerging')
    expect(bySkill['writing.sentence.order']).toBe('not-yet')
    // The load-bearing guardrail: sentence mastery is NEVER written inline.
    expect(findings.every((f) => f.status !== 'mastered')).toBe(true)
  })

  it('returns nothing for a session with no sentence questions', () => {
    expect(deriveSentenceFindings([phonicsQ(3, true), spellQ(3, true)])).toEqual([])
  })
})

// ── deriveWorkingLevelFromEvaluation supports the sentence domain ──

describe('deriveWorkingLevelFromEvaluation — sentence domain is distinct from writing', () => {
  it('maps a mastered sentence finding to a capped sentence level', () => {
    const findings: EvaluationFinding[] = [
      { skill: 'writing.sentence.prepositional', status: 'mastered', evidence: '', testedAt: '' },
    ]
    const wl = deriveWorkingLevelFromEvaluation(findings, 'sentence')
    expect(wl).not.toBeNull()
    expect(wl!.level).toBe(6)
  })

  it('a sentence finding does NOT register on the writing (spelling) domain map', () => {
    const findings: EvaluationFinding[] = [
      { skill: 'writing.composition.sentence', status: 'mastered', evidence: '', testedAt: '' },
    ]
    // The spelling map has no sentence keys → no writing level derived from it.
    expect(deriveWorkingLevelFromEvaluation(findings, 'writing')).toBeNull()
    // But the sentence map does pick it up.
    expect(deriveWorkingLevelFromEvaluation(findings, 'sentence')).not.toBeNull()
  })
})

// ── Sentence mastery routes through masteryRollup → central writer ─

describe('sentence mastery routes through the central writer (no inline write, never-downgrade)', () => {
  it('sentence signals roll up to mastered separately from spelling, then advance ONLY a matching entry', () => {
    const strongDay = (date: string) => ({
      evaluatedAt: `${date}T10:00:00Z`,
      questions: [
        sentenceQ(2, true, 'writing.composition.sentence'),
        sentenceQ(2, true, 'writing.composition.sentence'),
        // A spelling skill on the same day — must roll up under its OWN key.
        spellQ(3, true, 'writing.spelling.phonetic'),
        spellQ(3, true, 'writing.spelling.phonetic'),
      ],
    })
    const signals = extractQuestSignals([
      strongDay('2026-05-01'),
      strongDay('2026-05-02'),
      strongDay('2026-05-03'),
    ])
    const rollups = aggregateMastery(signals)
    const sentence = rollups.find((r) => r.skillKey === generateBlockId('writing.composition.sentence'))
    const spelling = rollups.find((r) => r.skillKey === generateBlockId('writing.spelling.phonetic'))
    // Two separate rollups — sentence and spelling never collapse into one.
    expect(sentence?.mastered).toBe(true)
    expect(spelling?.mastered).toBe(true)
    expect(sentence!.skillKey).not.toBe(spelling!.skillKey)

    // The central, additive writer advances ONLY the matching priority skill.
    const seeded: SkillSnapshot = {
      childId: 'lincoln',
      prioritySkills: [
        {
          tag: 'writing.composition.sentence',
          label: 'writing.composition.sentence',
          level: SkillLevel.Emerging,
          masteryGate: MasteryGate.NotYet,
        },
      ],
      supports: [],
      stopRules: [],
      evidenceDefinitions: [],
    }
    const { snapshot: after, changed } = applyToSnapshot(seeded, {
      masteredSkills: [sentence!.label, sentence!.skillKey],
      fullyMastered: true,
      at: 'AT',
    })
    expect(changed).toBe(true)
    expect(after.prioritySkills[0].level).toBe(SkillLevel.Secure)
  })

  it('does not advance a sentence skill that is not on the snapshot (additive writer never invents mastery)', () => {
    const empty: SkillSnapshot = {
      childId: 'lincoln',
      prioritySkills: [],
      supports: [],
      stopRules: [],
      evidenceDefinitions: [],
    }
    const { changed } = applyToSnapshot(empty, {
      masteredSkills: ['writing.composition.sentence', generateBlockId('writing.composition.sentence')],
      fullyMastered: true,
      at: 'AT',
    })
    expect(changed).toBe(false)
  })

  it('never downgrades an already-Secure sentence skill (never-downgrade)', () => {
    const secure: SkillSnapshot = {
      childId: 'lincoln',
      prioritySkills: [
        {
          tag: 'writing.composition.sentence',
          label: 'writing.composition.sentence',
          level: SkillLevel.Secure,
          masteryGate: MasteryGate.IndependentConsistent,
        },
      ],
      supports: [],
      stopRules: [],
      evidenceDefinitions: [],
    }
    const { snapshot: after } = applyToSnapshot(secure, {
      masteredSkills: ['writing.composition.sentence', generateBlockId('writing.composition.sentence')],
      fullyMastered: true,
      at: 'AT',
    })
    // Still Secure — the additive writer only ever advances, never downgrades.
    expect(after.prioritySkills[0].level).toBe(SkillLevel.Secure)
  })
})
