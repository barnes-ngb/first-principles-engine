import { describe, it, expect } from 'vitest'

import { applyToSnapshot } from './skillSnapshotWrites'
import type { SnapshotApplyUpdate } from './skillSnapshotWrites'
import type { SkillSnapshot, ConceptualBlock, PrioritySkill } from '../../core/types/evaluation'
import { MasteryGate, SkillLevel } from '../../core/types/enums'

const NOW = '2026-06-15T12:00:00.000Z'

const baseSnapshot: SkillSnapshot = {
  childId: 'child-1',
  prioritySkills: [],
  supports: [],
  stopRules: [],
  evidenceDefinitions: [],
  conceptualBlocks: [],
}

const makeBlock = (
  name: string,
  status: 'ADDRESS_NOW' | 'RESOLVING' | 'RESOLVED' | 'DEFER' = 'ADDRESS_NOW',
): ConceptualBlock => ({
  name,
  affectedSkills: [name.toLowerCase()],
  recommendation: 'ADDRESS_NOW',
  status,
  rationale: 'test',
  source: 'evaluation',
  evaluationSessionId: '',
  detectedAt: '2026-01-01',
})

const makeSkill = (
  label: string,
  level: SkillLevel = SkillLevel.Emerging,
  gate: MasteryGate = MasteryGate.NotYet,
): PrioritySkill => ({
  tag: label.toLowerCase().replace(/\s+/g, '-'),
  label,
  level,
  masteryGate: gate,
})

// ── Mastered-skill block advancement ────────────────────────────────────────

describe('applyToSnapshot — block advancement', () => {
  it('advances an ADDRESS_NOW block to RESOLVING when fullyMastered is false', () => {
    const snapshot = {
      ...baseSnapshot,
      conceptualBlocks: [makeBlock('Short Vowels', 'ADDRESS_NOW')],
    }
    const update: SnapshotApplyUpdate = {
      masteredSkills: ['Short Vowels'],
      fullyMastered: false,
      at: NOW,
    }
    const { snapshot: result, changed, changedFields } = applyToSnapshot(snapshot, update)
    expect(changed).toBe(true)
    expect(changedFields.conceptualBlocks).toBe(true)
    expect(result.conceptualBlocks![0].status).toBe('RESOLVING')
  })

  it('advances an ADDRESS_NOW block to RESOLVED when fullyMastered is true', () => {
    const snapshot = {
      ...baseSnapshot,
      conceptualBlocks: [makeBlock('Short Vowels', 'ADDRESS_NOW')],
    }
    const update: SnapshotApplyUpdate = {
      masteredSkills: ['Short Vowels'],
      fullyMastered: true,
      at: NOW,
    }
    const { snapshot: result } = applyToSnapshot(snapshot, update)
    expect(result.conceptualBlocks![0].status).toBe('RESOLVED')
    expect(result.conceptualBlocks![0].resolvedAt).toBe(NOW)
  })

  it('advances a RESOLVING block to RESOLVED when fullyMastered is true', () => {
    const snapshot = {
      ...baseSnapshot,
      conceptualBlocks: [makeBlock('Short Vowels', 'RESOLVING')],
    }
    const update: SnapshotApplyUpdate = {
      masteredSkills: ['Short Vowels'],
      fullyMastered: true,
      at: NOW,
    }
    const { snapshot: result, changed } = applyToSnapshot(snapshot, update)
    expect(changed).toBe(true)
    expect(result.conceptualBlocks![0].status).toBe('RESOLVED')
  })

  it('never reopens a RESOLVED block', () => {
    const snapshot = {
      ...baseSnapshot,
      conceptualBlocks: [makeBlock('Short Vowels', 'RESOLVED')],
    }
    const update: SnapshotApplyUpdate = {
      masteredSkills: ['Short Vowels'],
      fullyMastered: false,
      at: NOW,
    }
    const { changed } = applyToSnapshot(snapshot, update)
    expect(changed).toBe(false)
  })

  it('never overrides a DEFER block', () => {
    const snapshot = {
      ...baseSnapshot,
      conceptualBlocks: [makeBlock('Short Vowels', 'DEFER')],
    }
    const update: SnapshotApplyUpdate = {
      masteredSkills: ['Short Vowels'],
      fullyMastered: true,
      at: NOW,
    }
    const { changed } = applyToSnapshot(snapshot, update)
    expect(changed).toBe(false)
  })

  it('does not downgrade a RESOLVING block to ADDRESS_NOW', () => {
    const snapshot = {
      ...baseSnapshot,
      conceptualBlocks: [makeBlock('Short Vowels', 'RESOLVING')],
    }
    const update: SnapshotApplyUpdate = {
      masteredSkills: ['Short Vowels'],
      fullyMastered: false,
      at: NOW,
    }
    const { changed } = applyToSnapshot(snapshot, update)
    expect(changed).toBe(false)
  })

  it('is idempotent — re-applying the same update changes nothing', () => {
    const snapshot = {
      ...baseSnapshot,
      conceptualBlocks: [makeBlock('Short Vowels', 'ADDRESS_NOW')],
    }
    const update: SnapshotApplyUpdate = {
      masteredSkills: ['Short Vowels'],
      fullyMastered: false,
      at: NOW,
    }
    const first = applyToSnapshot(snapshot, update)
    const second = applyToSnapshot(first.snapshot, update)
    expect(second.changed).toBe(false)
  })

  it('matches blocks by affectedSkills (slug matching)', () => {
    const block = makeBlock('Vowel Discrimination')
    block.affectedSkills = ['short vowel i vs e']
    const snapshot = { ...baseSnapshot, conceptualBlocks: [block] }
    const update: SnapshotApplyUpdate = {
      masteredSkills: ['short vowel i vs e'],
      fullyMastered: true,
      at: NOW,
    }
    const { snapshot: result, changed } = applyToSnapshot(snapshot, update)
    expect(changed).toBe(true)
    expect(result.conceptualBlocks![0].status).toBe('RESOLVED')
  })

  it('appends evidence and increments sessionCount', () => {
    const block = makeBlock('Short Vowels', 'ADDRESS_NOW')
    block.sessionCount = 2
    block.evidence = 'prior scan'
    const snapshot = { ...baseSnapshot, conceptualBlocks: [block] }
    const update: SnapshotApplyUpdate = {
      masteredSkills: ['Short Vowels'],
      fullyMastered: false,
      evidence: 'new scan result',
      at: NOW,
    }
    const { snapshot: result } = applyToSnapshot(snapshot, update)
    expect(result.conceptualBlocks![0].evidence).toBe('prior scan | new scan result')
    expect(result.conceptualBlocks![0].sessionCount).toBe(3)
    expect(result.conceptualBlocks![0].lastReinforcedAt).toBe(NOW)
  })

  it('deduplicates evidence (does not re-append same string)', () => {
    const block = makeBlock('Short Vowels', 'ADDRESS_NOW')
    block.evidence = 'scan mastered'
    const snapshot = { ...baseSnapshot, conceptualBlocks: [block] }
    const update: SnapshotApplyUpdate = {
      masteredSkills: ['Short Vowels'],
      fullyMastered: false,
      evidence: 'scan mastered',
      at: NOW,
    }
    const { snapshot: result } = applyToSnapshot(snapshot, update)
    expect(result.conceptualBlocks![0].evidence).toBe('scan mastered')
  })
})

// ── Priority skill advancement ──────────────────────────────────────────────

describe('applyToSnapshot — priority skill advancement', () => {
  it('advances a matching priority skill to Secure + IndependentConsistent', () => {
    const snapshot = {
      ...baseSnapshot,
      prioritySkills: [makeSkill('Phonics', SkillLevel.Emerging, MasteryGate.NotYet)],
    }
    const update: SnapshotApplyUpdate = {
      masteredSkills: ['Phonics'],
      at: NOW,
    }
    const { snapshot: result, changedFields } = applyToSnapshot(snapshot, update)
    expect(changedFields.prioritySkills).toBe(true)
    expect(result.prioritySkills[0].level).toBe(SkillLevel.Secure)
    expect(result.prioritySkills[0].masteryGate).toBe(MasteryGate.IndependentConsistent)
  })

  it('does not downgrade a skill already at Secure + IndependentConsistent', () => {
    const snapshot = {
      ...baseSnapshot,
      prioritySkills: [makeSkill('Phonics', SkillLevel.Secure, MasteryGate.IndependentConsistent)],
    }
    const update: SnapshotApplyUpdate = {
      masteredSkills: ['Phonics'],
      at: NOW,
    }
    const { changedFields } = applyToSnapshot(snapshot, update)
    expect(changedFields.prioritySkills).toBe(false)
  })

  it('leaves non-matching priority skills untouched', () => {
    const snapshot = {
      ...baseSnapshot,
      prioritySkills: [
        makeSkill('Phonics', SkillLevel.Emerging),
        makeSkill('Math Facts', SkillLevel.Developing),
      ],
    }
    const update: SnapshotApplyUpdate = {
      masteredSkills: ['Phonics'],
      at: NOW,
    }
    const { snapshot: result } = applyToSnapshot(snapshot, update)
    expect(result.prioritySkills[0].level).toBe(SkillLevel.Secure)
    expect(result.prioritySkills[1].level).toBe(SkillLevel.Developing)
  })
})

// ── Additive edit ops (Tier C Option 2) ─────────────────────────────────────

describe('applyToSnapshot — additive edit ops', () => {
  it('appends new priority skills at Emerging level', () => {
    const snapshot = {
      ...baseSnapshot,
      prioritySkills: [makeSkill('Phonics')],
    }
    const update: SnapshotApplyUpdate = {
      masteredSkills: [],
      addPrioritySkills: ['Sight Words'],
      directive: 'Please work on sight words',
      at: NOW,
    }
    const { snapshot: result, changedFields } = applyToSnapshot(snapshot, update)
    expect(changedFields.prioritySkills).toBe(true)
    expect(result.prioritySkills).toHaveLength(2)
    expect(result.prioritySkills[1].label).toBe('Sight Words')
    expect(result.prioritySkills[1].level).toBe(SkillLevel.Emerging)
    expect(result.prioritySkills[1].notes).toContain('Please work on sight words')
    expect(result.prioritySkills[1].notes).toContain('parent directive via chat')
  })

  it('deduplicates priority skills by slug', () => {
    const snapshot = {
      ...baseSnapshot,
      prioritySkills: [makeSkill('Phonics')],
    }
    const update: SnapshotApplyUpdate = {
      masteredSkills: [],
      addPrioritySkills: ['Phonics', 'phonics'],
      at: NOW,
    }
    const { changedFields } = applyToSnapshot(snapshot, update)
    expect(changedFields.prioritySkills).toBe(false)
  })

  it('appends new supports with directive stamp', () => {
    const snapshot = {
      ...baseSnapshot,
      supports: [{ label: 'Visual timer', description: 'existing' }],
    }
    const update: SnapshotApplyUpdate = {
      masteredSkills: [],
      addSupports: ['Word wall near desk'],
      directive: 'He needs a word wall',
      at: NOW,
    }
    const { snapshot: result, changedFields } = applyToSnapshot(snapshot, update)
    expect(changedFields.supports).toBe(true)
    expect(result.supports).toHaveLength(2)
    expect(result.supports[1].label).toBe('Word wall near desk')
    expect(result.supports[1].description).toContain('He needs a word wall')
  })

  it('deduplicates supports by lowercase label', () => {
    const snapshot = {
      ...baseSnapshot,
      supports: [{ label: 'Visual timer', description: 'desc' }],
    }
    const update: SnapshotApplyUpdate = {
      masteredSkills: [],
      addSupports: ['visual timer', 'VISUAL TIMER'],
      at: NOW,
    }
    const { changedFields } = applyToSnapshot(snapshot, update)
    expect(changedFields.supports).toBe(false)
  })

  it('appends new stop rules with directive stamp', () => {
    const update: SnapshotApplyUpdate = {
      masteredSkills: [],
      addStopRules: ['Stop after 2 wrong attempts'],
      directive: 'He gets frustrated quickly',
      at: NOW,
    }
    const { snapshot: result, changedFields } = applyToSnapshot(baseSnapshot, update)
    expect(changedFields.stopRules).toBe(true)
    expect(result.stopRules).toHaveLength(1)
    expect(result.stopRules[0].label).toBe('Stop after 2 wrong attempts')
    expect(result.stopRules[0].action).toContain('He gets frustrated quickly')
    expect(result.stopRules[0].trigger).toBe('')
  })

  it('deduplicates stop rules by lowercase label', () => {
    const snapshot = {
      ...baseSnapshot,
      stopRules: [{ label: 'Stop after 2 wrong', trigger: '', action: '' }],
    }
    const update: SnapshotApplyUpdate = {
      masteredSkills: [],
      addStopRules: ['stop after 2 wrong'],
      at: NOW,
    }
    const { changedFields } = applyToSnapshot(snapshot, update)
    expect(changedFields.stopRules).toBe(false)
  })

  it('skips empty/whitespace-only entries in all add* arrays', () => {
    const update: SnapshotApplyUpdate = {
      masteredSkills: [],
      addPrioritySkills: ['', '  '],
      addSupports: ['', '  '],
      addStopRules: ['', '  '],
      at: NOW,
    }
    const { changed } = applyToSnapshot(baseSnapshot, update)
    expect(changed).toBe(false)
  })
})

// ── Quest activity marker ───────────────────────────────────────────────────

describe('applyToSnapshot — quest activity marker', () => {
  it('records a quest activity marker for a domain', () => {
    const update: SnapshotApplyUpdate = {
      masteredSkills: [],
      recordQuestActivity: {
        domain: 'phonics',
        marker: { lastQuestAt: NOW, outcome: 'rose', levelReached: 3 },
      },
      at: NOW,
    }
    const { snapshot: result, changedFields } = applyToSnapshot(baseSnapshot, update)
    expect(changedFields.questActivity).toBe(true)
    expect(result.questActivity?.phonics?.lastQuestAt).toBe(NOW)
  })

  it('preserves other domain markers when writing one', () => {
    const snapshot = {
      ...baseSnapshot,
      questActivity: {
        math: { lastQuestAt: '2026-06-01', outcome: 'held' as const, levelReached: 2 },
      },
    }
    const update: SnapshotApplyUpdate = {
      masteredSkills: [],
      recordQuestActivity: {
        domain: 'phonics',
        marker: { lastQuestAt: NOW, outcome: 'rose', levelReached: 1 },
      },
      at: NOW,
    }
    const { snapshot: result } = applyToSnapshot(snapshot, update)
    expect(result.questActivity?.math?.levelReached).toBe(2)
    expect(result.questActivity?.phonics?.levelReached).toBe(1)
  })
})

// ── No-op / edge cases ──────────────────────────────────────────────────────

describe('applyToSnapshot — edge cases', () => {
  it('returns changed: false when no mastered skills match and no additive ops', () => {
    const snapshot = {
      ...baseSnapshot,
      conceptualBlocks: [makeBlock('Short Vowels', 'ADDRESS_NOW')],
    }
    const update: SnapshotApplyUpdate = {
      masteredSkills: ['Long Division'],
      at: NOW,
    }
    const { changed } = applyToSnapshot(snapshot, update)
    expect(changed).toBe(false)
  })

  it('tolerates null snapshot', () => {
    const update: SnapshotApplyUpdate = {
      masteredSkills: [],
      addPrioritySkills: ['Phonics'],
      at: NOW,
    }
    const { snapshot: result, changed } = applyToSnapshot(null, update)
    expect(changed).toBe(true)
    expect(result.childId).toBe('')
    expect(result.prioritySkills).toHaveLength(1)
  })

  it('tolerates undefined snapshot', () => {
    const { snapshot: result } = applyToSnapshot(undefined, {
      masteredSkills: [],
      addStopRules: ['Stop at frustration'],
      at: NOW,
    })
    expect(result.stopRules).toHaveLength(1)
  })

  it('sets updatedAt only when changed', () => {
    const update: SnapshotApplyUpdate = {
      masteredSkills: ['Nonexistent'],
      at: NOW,
    }
    const { snapshot: result } = applyToSnapshot(baseSnapshot, update)
    expect(result.updatedAt).toBeUndefined()
  })

  it('sets blocksUpdatedAt only when blocks changed', () => {
    const snapshot = {
      ...baseSnapshot,
      conceptualBlocks: [makeBlock('Phonics', 'ADDRESS_NOW')],
    }
    const update: SnapshotApplyUpdate = {
      masteredSkills: [],
      addPrioritySkills: ['New Skill'],
      at: NOW,
    }
    const { snapshot: result } = applyToSnapshot(snapshot, update)
    expect(result.blocksUpdatedAt).toBeUndefined()
  })

  it('handles empty masteredSkills array', () => {
    const snapshot = {
      ...baseSnapshot,
      conceptualBlocks: [makeBlock('Phonics', 'ADDRESS_NOW')],
    }
    const update: SnapshotApplyUpdate = { masteredSkills: [], at: NOW }
    const { changed } = applyToSnapshot(snapshot, update)
    expect(changed).toBe(false)
  })

  it('preserves all existing snapshot fields through the reducer', () => {
    const snapshot: SkillSnapshot = {
      childId: 'child-1',
      prioritySkills: [makeSkill('Phonics')],
      supports: [{ label: 'Timer', description: 'visual' }],
      stopRules: [{ label: 'Stop at 2', trigger: '', action: '' }],
      evidenceDefinitions: [{ label: 'ev', description: 'desc' }],
      conceptualBlocks: [],
      workingLevels: { phonics: { level: 3, updatedAt: '2026-01-01', source: 'quest' } },
      createdAt: '2026-01-01',
    }
    const { snapshot: result } = applyToSnapshot(snapshot, {
      masteredSkills: [],
      at: NOW,
    })
    expect(result.childId).toBe('child-1')
    expect(result.prioritySkills).toHaveLength(1)
    expect(result.supports).toHaveLength(1)
    expect(result.stopRules).toHaveLength(1)
    expect(result.evidenceDefinitions).toHaveLength(1)
    expect(result.workingLevels).toEqual({ phonics: { level: 3, updatedAt: '2026-01-01', source: 'quest' } })
    expect(result.createdAt).toBe('2026-01-01')
  })
})
