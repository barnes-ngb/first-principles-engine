import { describe, expect, it } from 'vitest'
import {
  canAccessKnowledgeMine,
  hasMathCalibration,
  hasReadingCalibration,
} from './knowledgeMineAccess'
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

// ── Per-quest domain gating (ARCH-16) ──────────────────────────
//
// The Mine is a multi-domain hub; entry stays generic but each quest tile is
// gated on its own domain's calibration. These cases pin the leak that
// motivated ARCH-16: a math-only child must NOT reach the Reading quest.

const readingOnlySnapshot = baseSnapshot({
  // Reading eval emits phonics.* tags + a phonics working level.
  prioritySkills: [
    { tag: 'phonics.cvc.short-a', label: 'CVC short a', level: SkillLevel.Emerging },
  ],
  workingLevels: { phonics: { level: 3, updatedAt: '2026-01-01', source: 'evaluation' } },
})

const mathOnlySnapshot = baseSnapshot({
  // Math eval emits math.* tags + a math working level.
  prioritySkills: [
    { tag: 'math.addition.within-20', label: 'Addition within 20', level: SkillLevel.Emerging },
  ],
  workingLevels: { math: { level: 2, updatedAt: '2026-01-01', source: 'evaluation' } },
})

describe('hasReadingCalibration', () => {
  it('is true for a reading-only snapshot', () => {
    expect(hasReadingCalibration(readingOnlySnapshot)).toBe(true)
  })

  it('is true on a phonics or comprehension working level alone', () => {
    expect(
      hasReadingCalibration(
        baseSnapshot({ workingLevels: { phonics: { level: 2, updatedAt: '2026-01-01', source: 'quest' } } }),
      ),
    ).toBe(true)
    expect(
      hasReadingCalibration(
        baseSnapshot({ workingLevels: { comprehension: { level: 2, updatedAt: '2026-01-01', source: 'quest' } } }),
      ),
    ).toBe(true)
  })

  it('is true on a completed (reading) program', () => {
    expect(hasReadingCalibration(baseSnapshot({ completedPrograms: ['reading-eggs'] }))).toBe(true)
  })

  it('admits a free-form (non-prefixed) priority skill — reading is the default domain', () => {
    expect(
      hasReadingCalibration(
        baseSnapshot({ prioritySkills: [{ tag: 'letter sounds', label: 'Letter sounds', level: SkillLevel.Secure }] }),
      ),
    ).toBe(true)
  })

  it('is FALSE for a math-only snapshot — the leak ARCH-16 closes', () => {
    expect(hasReadingCalibration(mathOnlySnapshot)).toBe(false)
  })

  it('does not count a math-prefixed priority skill as reading', () => {
    expect(
      hasReadingCalibration(
        baseSnapshot({ prioritySkills: [{ tag: 'math.place-value', label: 'Place value', level: SkillLevel.Emerging }] }),
      ),
    ).toBe(false)
  })

  it('is false with no calibration anywhere', () => {
    expect(hasReadingCalibration(baseSnapshot())).toBe(false)
    expect(hasReadingCalibration(null)).toBe(false)
  })
})

describe('hasMathCalibration', () => {
  it('is true for a math-only snapshot', () => {
    expect(hasMathCalibration(mathOnlySnapshot)).toBe(true)
  })

  it('is true on a math working level alone', () => {
    expect(
      hasMathCalibration(
        baseSnapshot({ workingLevels: { math: { level: 3, updatedAt: '2026-01-01', source: 'quest' } } }),
      ),
    ).toBe(true)
  })

  it('is true on a math-prefixed priority skill alone', () => {
    expect(
      hasMathCalibration(
        baseSnapshot({ prioritySkills: [{ tag: 'math.number-sense', label: 'Number sense', level: SkillLevel.Emerging }] }),
      ),
    ).toBe(true)
  })

  it('is FALSE for a reading-only snapshot — Math Quest absent', () => {
    expect(hasMathCalibration(readingOnlySnapshot)).toBe(false)
  })

  it('is false with no calibration anywhere', () => {
    expect(hasMathCalibration(baseSnapshot())).toBe(false)
    expect(hasMathCalibration(null)).toBe(false)
  })
})

describe('per-domain gating — quest availability matrix', () => {
  it('reading-only → Reading available, Math absent', () => {
    expect(hasReadingCalibration(readingOnlySnapshot)).toBe(true)
    expect(hasMathCalibration(readingOnlySnapshot)).toBe(false)
    expect(canAccessKnowledgeMine(readingOnlySnapshot)).toBe(true)
  })

  it('math-only → Math available, Reading absent (the closed leak)', () => {
    expect(hasMathCalibration(mathOnlySnapshot)).toBe(true)
    expect(hasReadingCalibration(mathOnlySnapshot)).toBe(false)
    expect(canAccessKnowledgeMine(mathOnlySnapshot)).toBe(true)
  })

  it('no calibration → held at entry, both quests absent', () => {
    const empty = baseSnapshot()
    expect(hasReadingCalibration(empty)).toBe(false)
    expect(hasMathCalibration(empty)).toBe(false)
    expect(canAccessKnowledgeMine(empty)).toBe(false)
  })

  it('both domains calibrated → both quests available', () => {
    const both = baseSnapshot({
      prioritySkills: [
        { tag: 'phonics.cvc.short-a', label: 'CVC', level: SkillLevel.Emerging },
        { tag: 'math.addition.within-20', label: 'Addition', level: SkillLevel.Emerging },
      ],
    })
    expect(hasReadingCalibration(both)).toBe(true)
    expect(hasMathCalibration(both)).toBe(true)
  })
})

describe('per-domain helpers — capability, not identity', () => {
  it('source contains no name / isLincoln branch in the executable logic', () => {
    const code = accessSource.replace(/\/\*\*[\s\S]*?\*\//g, '')
    expect(code).not.toMatch(/isLincoln/)
    expect(code.toLowerCase()).not.toMatch(/lincoln|london/)
    expect(code).not.toMatch(/\.name\b/)
  })
})
