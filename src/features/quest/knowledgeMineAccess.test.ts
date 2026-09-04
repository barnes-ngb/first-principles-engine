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

// ── FEAT-184 / UX-150: a starting frame is not calibration ──────────────────
//
// "Load Starter Defaults" writes a template's `prioritySkills` into the same
// field an evaluation writes. London's K frame carries a reading row AND a
// `math.` row, so before this rule one parent tap satisfied both gates and the
// whole Mine opened for a child nothing had been tuned for.

import { isStarterSkill } from './knowledgeMineAccess'
import { getDefaultsForChild, STARTER_PRIORITY_SKILLS } from '../evaluation/childDefaults'
import { defaultPrioritySkills as londonPrioritySkills } from '../evaluation/londonDefaults'
import { defaultPrioritySkills as lincolnPrioritySkills } from '../evaluation/lincolnDefaults'
import { MasteryGate } from '../../core/types/enums'

describe('starter defaults do not open the Mine (FEAT-184 / UX-150)', () => {
  /** What `SkillSnapshotPage`'s "Load Starter Defaults" writes for a kindergarten-band child. */
  const londonAfterDefaults = () =>
    baseSnapshot({
      childId: 'child-k',
      prioritySkills: [...getDefaultsForChild({ grade: 'Kindergarten' }).prioritySkills],
    })

  it('the K template is the one the defaults selector hands a kindergarten-band child', () => {
    expect(getDefaultsForChild({ grade: 'Kindergarten' }).prioritySkills).toBe(londonPrioritySkills)
  })

  it('London with defaults applied and nothing else → both gates false, entry held', () => {
    const snapshot = londonAfterDefaults()
    expect(hasReadingCalibration(snapshot)).toBe(false)
    expect(hasMathCalibration(snapshot)).toBe(false)
    expect(canAccessKnowledgeMine(snapshot)).toBe(false)
  })

  it('every template row is recognised as a starter — the union covers both frames', () => {
    for (const skill of [...londonPrioritySkills, ...lincolnPrioritySkills]) {
      if (skill.level === SkillLevel.Emerging && skill.masteryGate === MasteryGate.NotYet) {
        expect(isStarterSkill(skill), skill.tag).toBe(true)
        expect(STARTER_PRIORITY_SKILLS).toContain(skill)
      }
    }
  })

  it('the same tags at Developing are real evidence — a quest that upgraded a starter opens the Mine', () => {
    const upgraded = londonAfterDefaults()
    upgraded.prioritySkills = upgraded.prioritySkills.map((s) =>
      s.tag === 'reading.letterSound' ? { ...s, level: SkillLevel.Developing } : s,
    )
    expect(isStarterSkill(upgraded.prioritySkills.find((s) => s.tag === 'reading.letterSound')!)).toBe(false)
    expect(hasReadingCalibration(upgraded)).toBe(true)
    // The math row is still untouched, so the Math quest stays absent.
    expect(hasMathCalibration(upgraded)).toBe(false)
    expect(canAccessKnowledgeMine(upgraded)).toBe(true)
  })

  it('a starter tag whose mastery gate moved is real evidence too — only the exact shape is a starter', () => {
    const gated = londonAfterDefaults()
    gated.prioritySkills = gated.prioritySkills.map((s) =>
      s.tag === 'math.placeValue' ? { ...s, masteryGate: MasteryGate.WithHelp } : s,
    )
    expect(hasMathCalibration(gated)).toBe(true)
  })

  it('the same tag written by an evaluation (no mastery gate) is not a starter', () => {
    // Evaluations write `{tag, label, level}`; the template always stamps `NotYet`.
    const evaluated = baseSnapshot({
      prioritySkills: [{ tag: 'reading.letterSound', label: 'Letter sounds', level: SkillLevel.Emerging }],
    })
    expect(isStarterSkill(evaluated.prioritySkills[0])).toBe(false)
    expect(hasReadingCalibration(evaluated)).toBe(true)
  })

  it('a non-template tag at the starter shape is still evidence — the tag has to be a template row', () => {
    const snapshot = baseSnapshot({
      prioritySkills: [
        { tag: 'reading.cvcSegment', label: 'CVC segmenting', level: SkillLevel.Emerging, masteryGate: MasteryGate.NotYet },
      ],
    })
    expect(hasReadingCalibration(snapshot)).toBe(true)
  })

  it('Lincoln is unchanged — his working levels open the gate whatever his priority rows hold', () => {
    const lincoln = baseSnapshot({
      childId: 'child-older',
      prioritySkills: [...getDefaultsForChild({ grade: '4th grade' }).prioritySkills],
      workingLevels: { phonics: { level: 3, updatedAt: '2026-01-01', source: 'quest' } },
    })
    expect(hasReadingCalibration(lincoln)).toBe(true)
    expect(canAccessKnowledgeMine(lincoln)).toBe(true)
  })

  it('identical starter snapshots gate identically regardless of childId (still capability, never name)', () => {
    const a = londonAfterDefaults()
    const b = { ...londonAfterDefaults(), childId: 'anyone-else' }
    expect(canAccessKnowledgeMine(a)).toBe(canAccessKnowledgeMine(b))
  })
})
