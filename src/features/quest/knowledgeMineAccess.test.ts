import { describe, expect, it } from 'vitest'
import { canAccessKnowledgeMine } from './knowledgeMineAccess'
import accessSource from './knowledgeMineAccess.ts?raw'
import type { SkillSnapshot } from '../../core/types'
import { SkillLevel } from '../../core/types/enums'

function baseSnapshot(overrides: Partial<SkillSnapshot> = {}): SkillSnapshot {
  return {
    childId: 'child-x',
    prioritySkills: [],
    supports: [],
    stopRules: [],
    evidenceDefinitions: [],
    ...overrides,
  }
}

describe('canAccessKnowledgeMine', () => {
  it('holds a child with no snapshot (never evaluated)', () => {
    expect(canAccessKnowledgeMine(null)).toBe(false)
    expect(canAccessKnowledgeMine(undefined)).toBe(false)
  })

  it('holds a child with an empty snapshot (auto-created, no calibration data)', () => {
    expect(canAccessKnowledgeMine(baseSnapshot())).toBe(false)
  })

  it('admits a child with at least one recorded priority skill', () => {
    const snapshot = baseSnapshot({
      prioritySkills: [
        { tag: 'reading.cvcBlend', label: 'CVC blending', level: SkillLevel.Emerging },
      ],
    })
    expect(canAccessKnowledgeMine(snapshot)).toBe(true)
  })

  it('admits a child whose skill tag is a free-form (non-prefixed) string', () => {
    // AI-authored tags are not guaranteed to carry a `reading.` prefix.
    const snapshot = baseSnapshot({
      prioritySkills: [
        { tag: 'letter sounds', label: 'Letter sounds', level: SkillLevel.Secure },
      ],
    })
    expect(canAccessKnowledgeMine(snapshot)).toBe(true)
  })

  it('admits a child with a completed program', () => {
    const snapshot = baseSnapshot({ completedPrograms: ['reading-eggs'] })
    expect(canAccessKnowledgeMine(snapshot)).toBe(true)
  })

  it('admits a child with a quest working level', () => {
    const snapshot = baseSnapshot({
      workingLevels: { phonics: { level: 3, updatedAt: '2026-01-01', source: 'quest' } },
    })
    expect(canAccessKnowledgeMine(snapshot)).toBe(true)
  })

  it('keys on snapshot data, not name: identical snapshots gate identically regardless of childId', () => {
    const data: Partial<SkillSnapshot> = {
      prioritySkills: [
        { tag: 'reading.sightWords', label: 'Sight words', level: SkillLevel.Emerging },
      ],
    }
    const lincolnish = baseSnapshot({ ...data, childId: 'lincoln-id' })
    const londonish = baseSnapshot({ ...data, childId: 'london-id' })
    expect(canAccessKnowledgeMine(lincolnish)).toBe(canAccessKnowledgeMine(londonish))
    expect(canAccessKnowledgeMine(lincolnish)).toBe(true)
  })

  it('source contains no name / isLincoln reference (capability, not identity)', () => {
    // Strip the doc comment so prose mentioning the trap (the words "name",
    // "Lincoln", "isLincoln") doesn't trip the assertion — we only care that
    // the executable logic never branches on identity.
    const code = accessSource.replace(/\/\*\*[\s\S]*?\*\//g, '')
    expect(code).not.toMatch(/isLincoln/)
    expect(code.toLowerCase()).not.toMatch(/lincoln|london/)
    expect(code).not.toMatch(/\.name\b/)
  })
})
