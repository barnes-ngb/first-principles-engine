import { describe, expect, it } from 'vitest'

import type { EvaluationFinding } from '../../core/types/evaluation'
import { domainLabel, isScoreyFallbackSummary, uniqueSkills } from './mineRecap.logic'

// ── isScoreyFallbackSummary ────────────────────────────────────

describe('isScoreyFallbackSummary', () => {
  it('returns true for undefined', () => {
    expect(isScoreyFallbackSummary(undefined)).toBe(true)
  })

  it('returns true for empty string', () => {
    expect(isScoreyFallbackSummary('')).toBe(true)
  })

  it('returns true for whitespace-only string', () => {
    expect(isScoreyFallbackSummary('   ')).toBe(true)
  })

  it('returns true for "Interactive reading quest..." fallback', () => {
    expect(
      isScoreyFallbackSummary('Interactive reading quest: 4/6 correct, reached level 3'),
    ).toBe(true)
  })

  it('returns true for text starting with "interactive" (case-insensitive)', () => {
    expect(isScoreyFallbackSummary('INTERACTIVE session summary')).toBe(true)
    expect(isScoreyFallbackSummary('interactive math quest')).toBe(true)
  })

  it('returns true for X/Y score patterns', () => {
    expect(isScoreyFallbackSummary('Got 4/6 correct')).toBe(true)
    expect(isScoreyFallbackSummary('Score: 10 / 12')).toBe(true)
  })

  it('returns true for "reached level" text', () => {
    expect(isScoreyFallbackSummary('Good session, reached level 5')).toBe(true)
  })

  it('returns true for percentage patterns', () => {
    expect(isScoreyFallbackSummary('Scored 85%')).toBe(true)
    expect(isScoreyFallbackSummary('75 % accuracy')).toBe(true)
  })

  it('returns false for a genuine AI-generated narrative summary', () => {
    expect(
      isScoreyFallbackSummary(
        'Lincoln practiced CVC blending and showed strong decoding with short-a words.',
      ),
    ).toBe(false)
  })

  it('returns false for a narrative that mentions skills without scores', () => {
    expect(
      isScoreyFallbackSummary('Worked on digraphs and sight word recognition today.'),
    ).toBe(false)
  })

  it('does not match "interactive" in the middle of a word', () => {
    expect(isScoreyFallbackSummary('Non-interactive lesson on phonics')).toBe(false)
  })
})

// ── domainLabel ────────────────────────────────────────────────

describe('domainLabel', () => {
  it('capitalizes domain slug', () => {
    expect(domainLabel('reading')).toBe('Reading')
  })

  it('capitalizes single-word domain', () => {
    expect(domainLabel('math')).toBe('Math')
  })

  it('capitalizes multi-word domain (only first letter)', () => {
    expect(domainLabel('socialStudies')).toBe('SocialStudies')
  })

  it('returns "Learning" for empty string', () => {
    expect(domainLabel('')).toBe('Learning')
  })

  it('handles single-character domain', () => {
    expect(domainLabel('a')).toBe('A')
  })
})

// ── uniqueSkills ────────────────────────────────────────────────

describe('uniqueSkills', () => {
  it('returns empty array for empty input', () => {
    expect(uniqueSkills([])).toEqual([])
  })

  it('extracts unique skill labels preserving first-seen order', () => {
    const findings: EvaluationFinding[] = [
      { skill: 'CVC blending', level: 'emerging' },
      { skill: 'Sight words', level: 'developing' },
      { skill: 'CVC blending', level: 'developing' },
    ] as EvaluationFinding[]
    expect(uniqueSkills(findings)).toEqual(['CVC blending', 'Sight words'])
  })

  it('skips findings with empty or missing skill', () => {
    const findings = [
      { skill: 'Phonics', level: 'emerging' },
      { skill: '', level: 'emerging' },
      { skill: undefined, level: 'emerging' },
      { skill: '  ', level: 'emerging' },
      { skill: 'Fluency', level: 'developing' },
    ] as EvaluationFinding[]
    expect(uniqueSkills(findings)).toEqual(['Phonics', 'Fluency'])
  })

  it('trims whitespace from skill labels', () => {
    const findings = [
      { skill: '  Digraphs  ', level: 'emerging' },
      { skill: 'Digraphs', level: 'developing' },
    ] as EvaluationFinding[]
    expect(uniqueSkills(findings)).toEqual(['Digraphs'])
  })

  it('preserves insertion order across many duplicates', () => {
    const findings = [
      { skill: 'B', level: 'e' },
      { skill: 'A', level: 'e' },
      { skill: 'C', level: 'e' },
      { skill: 'A', level: 'e' },
      { skill: 'B', level: 'e' },
    ] as EvaluationFinding[]
    expect(uniqueSkills(findings)).toEqual(['B', 'A', 'C'])
  })
})
