import { describe, it, expect } from 'vitest'
import type { EvaluationFinding, WorkingLevels, WorkingLevel } from '../../../core/types/evaluation'
import { deriveWorkingLevelFromEvaluation, canOverwriteWorkingLevel } from '../../quest/workingLevels'

// Simulates the math branch of EvaluateChatPage.applyToSkillSnapshot (G26).
// Mirrors the inline branch at EvaluateChatPage.tsx:578-584.
function applyMathDerive(
  existing: WorkingLevels,
  findings: EvaluationFinding[],
): WorkingLevels {
  let merged: WorkingLevels = { ...existing }
  const mathLevel = deriveWorkingLevelFromEvaluation(findings, 'math')
  if (mathLevel && canOverwriteWorkingLevel(merged.math)) {
    merged = { ...merged, math: mathLevel }
  }
  return merged
}

function makeFinding(overrides: Partial<EvaluationFinding>): EvaluationFinding {
  return {
    skill: '',
    status: 'mastered',
    evidence: 'test',
    testedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('EvaluateChatPage Apply — math branch writes workingLevels.math (G26)', () => {
  it('writes math working level when findings produce a valid derive', () => {
    const existing: WorkingLevels = {}
    const findings = [makeFinding({ skill: 'math.addition.within-20' })]
    const result = applyMathDerive(existing, findings)
    expect(result.math).toBeDefined()
    expect(result.math!.level).toBe(2)
    expect(result.math!.source).toBe('evaluation')
  })

  it('preserves workingLevels.phonics when math eval runs', () => {
    const phonicsLevel: WorkingLevel = {
      level: 4,
      updatedAt: new Date().toISOString(),
      source: 'quest',
      evidence: 'existing phonics quest',
    }
    const existing: WorkingLevels = { phonics: phonicsLevel }
    const findings = [makeFinding({ skill: 'math.multiplication.facts' })]
    const result = applyMathDerive(existing, findings)
    expect(result.phonics).toEqual(phonicsLevel)
    expect(result.math!.level).toBe(5)
  })

  it('respects 48-hour manual override guard on math', () => {
    const manualMath: WorkingLevel = {
      level: 3,
      updatedAt: new Date().toISOString(), // just now
      source: 'manual',
      evidence: 'parent set',
    }
    const existing: WorkingLevels = { math: manualMath }
    const findings = [makeFinding({ skill: 'math.fractions.comparing' })] // would derive L6
    const result = applyMathDerive(existing, findings)
    expect(result.math).toEqual(manualMath) // manual override preserved
  })

  it('overwrites stale manual override after 48-hour window', () => {
    const staleManual: WorkingLevel = {
      level: 2,
      updatedAt: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
      source: 'manual',
      evidence: 'parent set 49h ago',
    }
    const existing: WorkingLevels = { math: staleManual }
    const findings = [makeFinding({ skill: 'math.subtraction.within-20' })]
    const result = applyMathDerive(existing, findings)
    expect(result.math!.level).toBe(3)
    expect(result.math!.source).toBe('evaluation')
  })

  it('leaves workingLevels untouched when math findings have no mastered status', () => {
    const existing: WorkingLevels = {}
    const findings = [
      makeFinding({ skill: 'math.addition.within-20', status: 'emerging' }),
      makeFinding({ skill: 'math.fractions', status: 'not-yet' }),
    ]
    const result = applyMathDerive(existing, findings)
    expect(result.math).toBeUndefined()
  })
})
