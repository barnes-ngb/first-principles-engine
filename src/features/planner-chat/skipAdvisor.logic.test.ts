import { describe, expect, it } from 'vitest'
import type { DraftPlanItem, SkillSnapshot } from '../../core/types/domain'
import { MasteryGate, SkillLevel, SubjectBucket } from '../../core/types/enums'
import {
  batchEvaluateSkip,
  evaluateSkipEligibility,
  getEffectiveMasteryGate,
  skillLevelToMasteryGate,
} from './skipAdvisor.logic'

const baseSnapshot: SkillSnapshot = {
  childId: 'c1',
  prioritySkills: [
    {
      tag: 'reading.cvcBlend',
      label: 'CVC Blending',
      level: SkillLevel.Emerging,
      masteryGate: MasteryGate.NotYet,
    },
    {
      tag: 'math.subtraction.regroup',
      label: 'Regrouping',
      level: SkillLevel.Practice,
      masteryGate: MasteryGate.MostlyIndependent,
    },
    {
      tag: 'math.addition.facts',
      label: 'Addition Facts',
      level: SkillLevel.Secure,
      masteryGate: MasteryGate.IndependentConsistent,
    },
  ],
  supports: [],
  stopRules: [],
  evidenceDefinitions: [],
}

function makeItem(overrides: Partial<DraftPlanItem> = {}): DraftPlanItem {
  return {
    id: 'item1',
    title: 'Test Item',
    subjectBucket: SubjectBucket.Math,
    estimatedMinutes: 15,
    skillTags: [],
    accepted: true,
    ...overrides,
  }
}

describe('evaluateSkipEligibility', () => {
  it('returns keep with no snapshot', () => {
    const result = evaluateSkipEligibility(makeItem(), null)
    expect(result.action).toBe('keep')
    expect(result.rationale).toContain('No skill data')
  })

  it('returns keep when no skill tags match', () => {
    const item = makeItem({ skillTags: ['science.biology'] })
    const result = evaluateSkipEligibility(item, baseSnapshot)
    expect(result.action).toBe('keep')
    expect(result.rationale).toContain('No priority skill match')
  })

  it('returns skip when mastery gate is IndependentConsistent', () => {
    const item = makeItem({ skillTags: ['math.addition.facts'] })
    const result = evaluateSkipEligibility(item, baseSnapshot)
    expect(result.action).toBe('skip')
    expect(result.rationale).toContain('Addition Facts')
    expect(result.evidenceLevel).toBe(MasteryGate.IndependentConsistent)
  })

  it('returns modify when mastery gate is MostlyIndependent', () => {
    const item = makeItem({ skillTags: ['math.subtraction.regroup'] })
    const result = evaluateSkipEligibility(item, baseSnapshot)
    expect(result.action).toBe('modify')
    expect(result.rationale).toContain('Regrouping')
    expect(result.evidenceLevel).toBe(MasteryGate.MostlyIndependent)
  })

  it('returns keep when mastery gate is NotYet', () => {
    const item = makeItem({ skillTags: ['reading.cvcBlend'] })
    const result = evaluateSkipEligibility(item, baseSnapshot)
    expect(result.action).toBe('keep')
  })

  it('returns keep when item has no skill tags', () => {
    const result = evaluateSkipEligibility(makeItem(), baseSnapshot)
    expect(result.action).toBe('keep')
  })
})

describe('batchEvaluateSkip', () => {
  it('evaluates all items and returns a map', () => {
    const items: DraftPlanItem[] = [
      makeItem({ id: 'a', skillTags: ['math.addition.facts'] }),
      makeItem({ id: 'b', skillTags: ['reading.cvcBlend'] }),
      makeItem({ id: 'c', isAppBlock: true }),
    ]
    const results = batchEvaluateSkip(items, baseSnapshot)
    expect(results.size).toBe(3)
    expect(results.get('a')!.action).toBe('skip')
    expect(results.get('b')!.action).toBe('keep')
    expect(results.get('c')!.action).toBe('keep')
    expect(results.get('c')!.rationale).toContain('App block')
  })
})

describe('skillLevelToMasteryGate', () => {
  it('maps skill levels to mastery gates', () => {
    expect(skillLevelToMasteryGate('emerging')).toBe(MasteryGate.NotYet)
    expect(skillLevelToMasteryGate('developing')).toBe(MasteryGate.WithHelp)
    expect(skillLevelToMasteryGate('supported')).toBe(MasteryGate.WithHelp)
    expect(skillLevelToMasteryGate('practice')).toBe(MasteryGate.MostlyIndependent)
    expect(skillLevelToMasteryGate('secure')).toBe(MasteryGate.IndependentConsistent)
    expect(skillLevelToMasteryGate('unknown')).toBe(MasteryGate.NotYet)
  })
})

describe('getEffectiveMasteryGate', () => {
  it('returns explicit masteryGate when set', () => {
    const skill = {
      tag: 'reading.cvcBlend',
      label: 'CVC',
      level: SkillLevel.Emerging,
      masteryGate: MasteryGate.WithHelp,
    }
    expect(getEffectiveMasteryGate(skill)).toBe(MasteryGate.WithHelp)
  })

  it('falls back to skill level conversion when masteryGate is undefined', () => {
    const skill = {
      tag: 'reading.cvcBlend',
      label: 'CVC',
      level: SkillLevel.Practice,
    }
    expect(getEffectiveMasteryGate(skill)).toBe(MasteryGate.MostlyIndependent)
  })
})
