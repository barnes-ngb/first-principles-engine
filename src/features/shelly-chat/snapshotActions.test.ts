import { describe, expect, it } from 'vitest'

import type { ChatAction } from '../../core/types'
import {
  describeSnapshotAction,
  isSnapshotAction,
  snapshotActionFootnote,
  snapshotNoMatchNotice,
} from './snapshotActions'
import type { SnapshotAction } from './snapshotActions'

// ── isSnapshotAction ────────────────────────────────────────────────────────

describe('isSnapshotAction — type guard for the four Tier-C kinds', () => {
  it('accepts addPrioritySkill', () => {
    const action: ChatAction = { kind: 'addPrioritySkill', childId: 'c1', skill: 'CVC blending' }
    expect(isSnapshotAction(action)).toBe(true)
  })

  it('accepts addSupport', () => {
    const action: ChatAction = { kind: 'addSupport', childId: 'c1', support: 'visual timer' }
    expect(isSnapshotAction(action)).toBe(true)
  })

  it('accepts addStopRule', () => {
    const action: ChatAction = { kind: 'addStopRule', childId: 'c1', rule: 'no more than 3 tries' }
    expect(isSnapshotAction(action)).toBe(true)
  })

  it('accepts markSkillProgress', () => {
    const action: ChatAction = { kind: 'markSkillProgress', childId: 'c1', skill: 'addition' }
    expect(isSnapshotAction(action)).toBe(true)
  })

  it('rejects non-snapshot kinds', () => {
    const action = { kind: 'addSightWord', childId: 'c1', word: 'the' } as ChatAction
    expect(isSnapshotAction(action)).toBe(false)
  })
})

// ── describeSnapshotAction ──────────────────────────────────────────────────

describe('describeSnapshotAction — preview text for the confirm card', () => {
  it('describes addPrioritySkill with the child name and skill', () => {
    const action: SnapshotAction = { kind: 'addPrioritySkill', childId: 'c1', skill: 'CVC blending' }
    expect(describeSnapshotAction(action, 'Lincoln')).toBe(
      'Add to Lincoln\'s priority skills: "CVC blending"',
    )
  })

  it('describes addSupport', () => {
    const action: SnapshotAction = { kind: 'addSupport', childId: 'c1', support: 'visual timer' }
    expect(describeSnapshotAction(action, 'Lincoln')).toBe(
      'Add to Lincoln\'s supports: "visual timer"',
    )
  })

  it('describes addStopRule', () => {
    const action: SnapshotAction = { kind: 'addStopRule', childId: 'c1', rule: '3 tries max' }
    expect(describeSnapshotAction(action, 'London')).toBe(
      'Add to London\'s stop rules: "3 tries max"',
    )
  })

  it('describes markSkillProgress mastered', () => {
    const action: SnapshotAction = {
      kind: 'markSkillProgress',
      childId: 'c1',
      skill: 'addition',
      mastered: true,
    }
    expect(describeSnapshotAction(action, 'Lincoln')).toBe(
      'Mark "addition" as mastered for Lincoln',
    )
  })

  it('describes markSkillProgress progressing', () => {
    const action: SnapshotAction = {
      kind: 'markSkillProgress',
      childId: 'c1',
      skill: 'subtraction',
      mastered: false,
    }
    expect(describeSnapshotAction(action, 'Lincoln')).toBe(
      'Mark "subtraction" as progressing for Lincoln',
    )
  })

  it('treats undefined mastered as progressing', () => {
    const action: SnapshotAction = {
      kind: 'markSkillProgress',
      childId: 'c1',
      skill: 'subtraction',
    }
    expect(describeSnapshotAction(action, 'London')).toContain('progressing')
  })
})

// ── snapshotActionFootnote ──────────────────────────────────────────────────

describe('snapshotActionFootnote — only markSkillProgress gets one (UX-187)', () => {
  it('returns empty string for addPrioritySkill', () => {
    const action: SnapshotAction = { kind: 'addPrioritySkill', childId: 'c1', skill: 'x' }
    expect(snapshotActionFootnote(action, 'Lincoln')).toBe('')
  })

  it('returns empty string for addSupport', () => {
    const action: SnapshotAction = { kind: 'addSupport', childId: 'c1', support: 'x' }
    expect(snapshotActionFootnote(action, 'Lincoln')).toBe('')
  })

  it('returns empty string for addStopRule', () => {
    const action: SnapshotAction = { kind: 'addStopRule', childId: 'c1', rule: 'x' }
    expect(snapshotActionFootnote(action, 'Lincoln')).toBe('')
  })

  it('returns mastered footnote for markSkillProgress with mastered=true', () => {
    const action: SnapshotAction = {
      kind: 'markSkillProgress',
      childId: 'c1',
      skill: 'addition',
      mastered: true,
    }
    const result = snapshotActionFootnote(action, 'Lincoln')
    expect(result).toContain('mastered')
    expect(result).toContain("Lincoln's Skill Snapshot")
    expect(result).toContain('cannot lower a level')
  })

  it('returns progressing footnote for markSkillProgress with mastered=false', () => {
    const action: SnapshotAction = {
      kind: 'markSkillProgress',
      childId: 'c1',
      skill: 'subtraction',
      mastered: false,
    }
    const result = snapshotActionFootnote(action, 'London')
    expect(result).toContain('without changing')
    expect(result).toContain("London's level")
    expect(result).toContain('Progress → Skill Snapshot')
  })
})

// ── snapshotNoMatchNotice ───────────────────────────────────────────────────

describe('snapshotNoMatchNotice — card text when the confirmed write changed nothing (UX-190)', () => {
  it('says addPrioritySkill is already present', () => {
    const action: SnapshotAction = { kind: 'addPrioritySkill', childId: 'c1', skill: 'CVC' }
    const result = snapshotNoMatchNotice(action, 'Lincoln')
    expect(result).toContain('"CVC"')
    expect(result).toContain("Lincoln's priority skills")
    expect(result).toContain('nothing was changed')
  })

  it('says addSupport is already present', () => {
    const action: SnapshotAction = { kind: 'addSupport', childId: 'c1', support: 'timer' }
    expect(snapshotNoMatchNotice(action, 'London')).toContain('"timer"')
  })

  it('says addStopRule is already present', () => {
    const action: SnapshotAction = { kind: 'addStopRule', childId: 'c1', rule: 'stop at 3' }
    expect(snapshotNoMatchNotice(action, 'Lincoln')).toContain('"stop at 3"')
  })

  it('gives the ambiguous markSkillProgress notice without claiming a single cause', () => {
    const action: SnapshotAction = {
      kind: 'markSkillProgress',
      childId: 'c1',
      skill: 'th sound',
    }
    const result = snapshotNoMatchNotice(action, 'Lincoln')
    expect(result).toContain("Lincoln's Skill Snapshot")
    expect(result).toContain('"th sound"')
    expect(result).toContain('Progress → Skill Snapshot')
  })
})
