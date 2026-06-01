import { describe, it, expect } from 'vitest'

import { generateBlockId } from '../../../core/utils/blockerLifecycle'
import { MasteryGate, SkillLevel } from '../../../core/types/enums'
import type { ChecklistItem } from '../../../core/types/planning'
import type { ConceptualBlock, SkillSnapshot } from '../../../core/types/evaluation'
import type { SessionQuestion } from '../../quest/questTypes'
import {
  aggregateMastery,
  extractChecklistSignals,
  extractQuestSignals,
  pendingCheckoffs,
  type MasterySignal,
} from '../masteryRollup'

function item(label: string, mastery: ChecklistItem['mastery']): ChecklistItem {
  return { label, completed: true, mastery }
}

function q(skill: string, correct: boolean, skipped = false): SessionQuestion {
  return {
    id: `${skill}-${Math.random()}`,
    type: 'multiple-choice' as SessionQuestion['type'],
    level: 1,
    skill,
    prompt: '',
    options: [],
    correctAnswer: '',
    childAnswer: '',
    correct,
    skipped,
    responseTimeMs: 0,
    timestamp: '',
  }
}

// "general.add" → its slug — used to assert keying without hardcoding.
const ADD_KEY = generateBlockId('general.Add')

describe('extractChecklistSignals', () => {
  it('maps got-it/working/stuck to strong/neutral/struggle and keys by inferred skill', () => {
    const sigs = extractChecklistSignals([
      { date: '2026-05-01', checklist: [item('Add', 'got-it'), item('Read', 'working')] },
      { date: '2026-05-02', checklist: [item('Spell', 'stuck')] },
    ])
    expect(sigs).toHaveLength(3)
    const add = sigs.find((s) => s.label === 'Add')!
    expect(add.kind).toBe('strong')
    expect(add.skillKey).toBe(ADD_KEY)
    expect(add.source).toBe('checklist')
    expect(sigs.find((s) => s.label === 'Read')!.kind).toBe('neutral')
    expect(sigs.find((s) => s.label === 'Spell')!.kind).toBe('struggle')
  })

  it('ignores items without a mastery chip or label', () => {
    const sigs = extractChecklistSignals([
      { date: '2026-05-01', checklist: [item('Add', undefined), { label: '', completed: true, mastery: 'got-it' }] },
    ])
    expect(sigs).toHaveLength(0)
  })

  it('uses the first skill tag as the key when present', () => {
    const tagged: ChecklistItem = { label: 'Whatever', completed: true, mastery: 'got-it', skillTags: ['math.add.2digit'] }
    const sigs = extractChecklistSignals([{ date: '2026-05-01', checklist: [tagged] }])
    expect(sigs[0].skillKey).toBe(generateBlockId('math.add.2digit'))
  })
})

describe('extractQuestSignals', () => {
  it('groups by skill per session — strong needs >=2 attempts at >=80%', () => {
    const sigs = extractQuestSignals([
      { evaluatedAt: '2026-05-01T10:00:00.000Z', questions: [q('blend', true), q('blend', true)] },
    ])
    expect(sigs).toHaveLength(1)
    expect(sigs[0].kind).toBe('strong')
    expect(sigs[0].skillKey).toBe(generateBlockId('blend'))
    expect(sigs[0].date).toBe('2026-05-01')
  })

  it('a single correct answer is not strong (too few attempts)', () => {
    const sigs = extractQuestSignals([
      { evaluatedAt: '2026-05-01T10:00:00.000Z', questions: [q('blend', true)] },
    ])
    expect(sigs[0].kind).toBe('neutral')
  })

  it('low accuracy is a struggle signal; skipped questions are ungraded', () => {
    const sigs = extractQuestSignals([
      { evaluatedAt: '2026-05-01T10:00:00.000Z', questions: [q('blend', false), q('blend', false), q('blend', true, true)] },
    ])
    expect(sigs[0].kind).toBe('struggle')
  })
})

describe('aggregateMastery — conservative threshold', () => {
  function strong(skill: string, date: string): MasterySignal {
    return { skillKey: generateBlockId(skill), label: skill, kind: 'strong', date, source: 'checklist' }
  }

  it('three strong signals across two days clears mastery', () => {
    const rollups = aggregateMastery([
      strong('Add', '2026-05-01'),
      strong('Add', '2026-05-01'),
      strong('Add', '2026-05-03'),
    ])
    expect(rollups[0].mastered).toBe(true)
    expect(rollups[0].strongOccasions).toBe(2)
    expect(rollups[0].evidence).toMatch(/mastered via/)
  })

  it('a couple of got-its does NOT mark mastery', () => {
    const rollups = aggregateMastery([
      strong('Add', '2026-05-01'),
      strong('Add', '2026-05-02'),
    ])
    expect(rollups[0].mastered).toBe(false)
  })

  it('three strong on a single day does NOT clear (needs >=2 occasions)', () => {
    const rollups = aggregateMastery([
      strong('Add', '2026-05-01'),
      strong('Add', '2026-05-01'),
      strong('Add', '2026-05-01'),
    ])
    expect(rollups[0].strongSignals).toBe(3)
    expect(rollups[0].strongOccasions).toBe(1)
    expect(rollups[0].mastered).toBe(false)
  })

  it('a single stuck signal vetoes mastery even with strong evidence', () => {
    const rollups = aggregateMastery([
      strong('Add', '2026-05-01'),
      strong('Add', '2026-05-02'),
      strong('Add', '2026-05-03'),
      { skillKey: generateBlockId('Add'), label: 'Add', kind: 'struggle', date: '2026-05-04', source: 'checklist' },
    ])
    expect(rollups[0].struggleSignals).toBe(1)
    expect(rollups[0].mastered).toBe(false)
  })

  it('a still-struggling skill is never marked mastered', () => {
    const rollups = aggregateMastery([
      { skillKey: generateBlockId('Spell'), label: 'Spell', kind: 'struggle', date: '2026-05-01', source: 'checklist' },
      { skillKey: generateBlockId('Spell'), label: 'Spell', kind: 'neutral', date: '2026-05-02', source: 'checklist' },
      { skillKey: generateBlockId('Spell'), label: 'Spell', kind: 'struggle', date: '2026-05-03', source: 'quest' },
    ])
    expect(rollups[0].mastered).toBe(false)
  })

  it('combines checklist + quest signals and records both sources', () => {
    const rollups = aggregateMastery([
      { skillKey: generateBlockId('Add'), label: 'Add', kind: 'strong', date: '2026-05-01', source: 'checklist' },
      { skillKey: generateBlockId('Add'), label: 'Add', kind: 'strong', date: '2026-05-02', source: 'quest' },
      { skillKey: generateBlockId('Add'), label: 'Add', kind: 'strong', date: '2026-05-03', source: 'quest' },
    ])
    expect(rollups[0].mastered).toBe(true)
    expect(rollups[0].sources).toEqual(['checklist', 'quest'])
    expect(rollups[0].evidence).toMatch(/repeated got-it \/ quest/)
  })
})

describe('pendingCheckoffs', () => {
  const masteredRollup = {
    skillKey: generateBlockId('Add'),
    label: 'Add',
    strongSignals: 3,
    neutralSignals: 0,
    struggleSignals: 0,
    strongOccasions: 2,
    lastSignalDate: '2026-05-03',
    sources: ['checklist'] as Array<'checklist' | 'quest'>,
    mastered: true,
    evidence: 'mastered via repeated got-it — 2026-05-03 (3 strong across 2 days)',
  }

  function snap(extra: Partial<SkillSnapshot>): SkillSnapshot {
    return {
      childId: 'lincoln',
      prioritySkills: [],
      supports: [],
      stopRules: [],
      evidenceDefinitions: [],
      ...extra,
    }
  }

  it('surfaces a mastered skill that matches an active (non-Secure) priority skill', () => {
    const s = snap({
      prioritySkills: [{ tag: 'add', label: 'Add', level: SkillLevel.Emerging, masteryGate: MasteryGate.NotYet }],
    })
    expect(pendingCheckoffs([masteredRollup], s)).toHaveLength(1)
  })

  it('excludes a skill already marked Secure + IndependentConsistent (already checked off)', () => {
    const s = snap({
      prioritySkills: [{ tag: 'add', label: 'Add', level: SkillLevel.Secure, masteryGate: MasteryGate.IndependentConsistent }],
    })
    expect(pendingCheckoffs([masteredRollup], s)).toHaveLength(0)
  })

  it('surfaces a mastered skill that matches an active conceptual block', () => {
    const blk: ConceptualBlock = {
      id: generateBlockId('Add'),
      name: 'Add',
      affectedSkills: ['Add'],
      recommendation: 'ADDRESS_NOW',
      rationale: '',
      detectedAt: '2026-04-01',
      evaluationSessionId: '',
      status: 'ADDRESS_NOW',
    }
    expect(pendingCheckoffs([masteredRollup], snap({ conceptualBlocks: [blk] }))).toHaveLength(1)
  })

  it('excludes a skill that matches nothing on the map (cannot additively create mastered)', () => {
    const s = snap({
      prioritySkills: [{ tag: 'spell', label: 'Spell', level: SkillLevel.Emerging }],
    })
    expect(pendingCheckoffs([masteredRollup], s)).toHaveLength(0)
  })

  it('excludes below-threshold rollups', () => {
    const s = snap({
      prioritySkills: [{ tag: 'add', label: 'Add', level: SkillLevel.Emerging }],
    })
    expect(pendingCheckoffs([{ ...masteredRollup, mastered: false }], s)).toHaveLength(0)
  })
})
