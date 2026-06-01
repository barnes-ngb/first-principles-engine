import { describe, expect, it } from 'vitest'

import {
  computeWritingLevelFromSpellingQuestions,
  deriveSpellingFindings,
  deriveWorkingLevelFromEvaluation,
  computeWorkingLevelFromSession,
} from './workingLevels'
import type { SessionQuestion } from './questTypes'
import type { EvaluationFinding } from '../../core/types/evaluation'
import { generateBlockId } from '../../core/utils/blockerLifecycle'
import { extractQuestSignals, aggregateMastery } from '../evaluate/masteryRollup'
import { applyToSnapshot } from '../evaluate/skillSnapshotWrites'
import type { SkillSnapshot } from '../../core/types/evaluation'
import { SkillLevel, MasteryGate } from '../../core/types/enums'

// ── Builders ────────────────────────────────────────────────────

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

// ── Findings derive workingLevels.writing (spelling) ──────────────

describe('computeWritingLevelFromSpellingQuestions — spelling derives writing level', () => {
  it('derives the writing level from the spelling subset only (highest correct)', () => {
    const questions = [spellQ(3, true), spellQ(4, true), spellQ(5, false)]
    const wl = computeWritingLevelFromSpellingQuestions(questions)
    expect(wl).not.toBeNull()
    expect(wl!.level).toBe(4) // highest level spelled correctly
    expect(wl!.source).toBe('quest')
  })

  it('returns null when there were no spelling questions (only phonics)', () => {
    const questions = [phonicsQ(3, true), phonicsQ(4, true)]
    expect(computeWritingLevelFromSpellingQuestions(questions)).toBeNull()
  })

  it('gentle downstep when nothing was spelled correctly', () => {
    const wl = computeWritingLevelFromSpellingQuestions([spellQ(4, false), spellQ(4, false)])
    expect(wl!.level).toBe(3)
  })

  it('caps the writing level at the spelling ceiling', () => {
    const wl = computeWritingLevelFromSpellingQuestions([spellQ(6, true)])
    expect(wl!.level).toBeLessThanOrEqual(6)
  })

  it('ignores skipped / flagged spelling questions', () => {
    const questions = [
      spellQ(5, true), // would set level 5...
      { ...spellQ(6, true), skipped: true }, // ...but this skipped L6 must not count
    ]
    expect(computeWritingLevelFromSpellingQuestions(questions)!.level).toBe(5)
  })
})

// ── Separability: spelling ≠ phonics, never one blurred number ────

describe('spelling is a separable signal (never blurred with phonics)', () => {
  it('a mixed session derives DISTINCT phonics and writing levels', () => {
    // Strong phonics at L5, but spelling only steady at L3 — the two must not collapse.
    const questions: SessionQuestion[] = [
      phonicsQ(5, true), phonicsQ(5, true), phonicsQ(5, true),
      phonicsQ(4, true), phonicsQ(4, true),
      spellQ(3, true), spellQ(3, true),
    ]
    const phonics = computeWorkingLevelFromSession(questions, 5, 'phonics')
    const writing = computeWritingLevelFromSpellingQuestions(questions)
    expect(phonics!.level).toBe(5)
    expect(writing!.level).toBe(3)
    // Different numbers from the same session — separable by construction.
    expect(phonics!.level).not.toBe(writing!.level)
  })

  it('all spelling skills live under writing.spelling.* (a future composition signal would not blur them)', () => {
    const findings = deriveSpellingFindings([
      spellQ(2, true, 'writing.spelling.sightWord'),
      spellQ(3, true, 'writing.spelling.phonetic'),
    ])
    expect(findings.every((f) => f.skill.startsWith('writing.spelling'))).toBe(true)
    // None are tagged `writing.composition.*` — composition stays a distinct,
    // future signal that this spelling level can never absorb.
    expect(findings.some((f) => f.skill.startsWith('writing.composition'))).toBe(false)
  })
})

// ── deriveSpellingFindings: emerging-only, NEVER mastered inline ──

describe('deriveSpellingFindings — seeds emerging, never asserts mastery inline', () => {
  it('emits emerging for spelled skills and not-yet for missed ones — never mastered', () => {
    const findings = deriveSpellingFindings([
      spellQ(2, true, 'writing.spelling.sightWord'),
      spellQ(3, false, 'writing.spelling.phonetic'),
    ])
    const bySkill = Object.fromEntries(findings.map((f) => [f.skill, f.status]))
    expect(bySkill['writing.spelling.sightWord']).toBe('emerging')
    expect(bySkill['writing.spelling.phonetic']).toBe('not-yet')
    // The load-bearing guardrail: spelling mastery is NEVER written inline.
    expect(findings.every((f) => f.status !== 'mastered')).toBe(true)
  })

  it('returns nothing for a session with no spelling questions', () => {
    expect(deriveSpellingFindings([phonicsQ(3, true)])).toEqual([])
  })
})

// ── deriveWorkingLevelFromEvaluation supports the writing domain ──

describe('deriveWorkingLevelFromEvaluation — writing domain', () => {
  it('maps mastered writing.spelling findings to a capped writing level', () => {
    const findings: EvaluationFinding[] = [
      { skill: 'writing.spelling.vowel-team', status: 'mastered', evidence: '', testedAt: '' },
    ]
    const wl = deriveWorkingLevelFromEvaluation(findings, 'writing')
    expect(wl).not.toBeNull()
    expect(wl!.level).toBe(6)
  })

  it('returns null when no writing finding is mastered', () => {
    const findings: EvaluationFinding[] = [
      { skill: 'writing.spelling.cvc', status: 'emerging', evidence: '', testedAt: '' },
    ]
    expect(deriveWorkingLevelFromEvaluation(findings, 'writing')).toBeNull()
  })
})

// ── Spelling mastery routes through masteryRollup → central writer ─

describe('spelling mastery routes through the central writer (no inline write)', () => {
  it('writing.spelling signals roll up to mastered across days, then advance ONLY a matching snapshot entry', () => {
    // The conservative rollup needs ≥3 strong signals across ≥2 days, zero
    // struggles. Each session is one strong occasion (2 correct ≥ 80%), so three
    // strong spelling days on the same skill clear the (reused) threshold.
    const strongDay = (date: string) => ({
      evaluatedAt: `${date}T10:00:00Z`,
      questions: [
        spellQ(3, true, 'writing.spelling.phonetic'),
        spellQ(3, true, 'writing.spelling.phonetic'),
      ],
    })
    const signals = extractQuestSignals([
      strongDay('2026-05-01'),
      strongDay('2026-05-02'),
      strongDay('2026-05-03'),
    ])
    expect(signals.every((s) => s.skillKey === generateBlockId('writing.spelling.phonetic'))).toBe(true)

    const rollups = aggregateMastery(signals)
    const spelling = rollups.find((r) => r.skillKey === generateBlockId('writing.spelling.phonetic'))
    expect(spelling?.mastered).toBe(true)

    // The central, additive writer advances the matching priority skill to Secure
    // — and never invents or downgrades. This is the ONLY path spelling mastery
    // takes (the quest hook seeds an emerging skill; it never writes Secure inline).
    const seeded: SkillSnapshot = {
      childId: 'lincoln',
      prioritySkills: [
        {
          tag: 'writing.spelling.phonetic',
          label: 'writing.spelling.phonetic',
          level: SkillLevel.Emerging,
          masteryGate: MasteryGate.NotYet,
        },
      ],
      supports: [],
      stopRules: [],
      evidenceDefinitions: [],
    }
    const { snapshot: after, changed } = applyToSnapshot(seeded, {
      masteredSkills: [spelling!.label, spelling!.skillKey],
      fullyMastered: true,
      at: 'AT',
    })
    expect(changed).toBe(true)
    expect(after.prioritySkills[0].level).toBe(SkillLevel.Secure)
  })

  it('does not advance spelling that is not yet on the snapshot (additive writer never invents mastery)', () => {
    const empty: SkillSnapshot = {
      childId: 'lincoln',
      prioritySkills: [],
      supports: [],
      stopRules: [],
      evidenceDefinitions: [],
    }
    const { changed } = applyToSnapshot(empty, {
      masteredSkills: ['writing.spelling.phonetic', generateBlockId('writing.spelling.phonetic')],
      fullyMastered: true,
      at: 'AT',
    })
    expect(changed).toBe(false)
  })
})
