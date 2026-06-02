import { describe, it, expect } from 'vitest'

import type { ConceptualBlock, SkillSnapshot } from '../../../core/types/evaluation'
import { MasteryGate, SkillLevel } from '../../../core/types/enums'
import { applyToSnapshot } from '../skillSnapshotWrites'

const AT = '2026-05-30T12:00:00.000Z'

function block(overrides: Partial<ConceptualBlock> & { id: string }): ConceptualBlock {
  return {
    name: overrides.name ?? overrides.id,
    affectedSkills: overrides.affectedSkills ?? [],
    recommendation: overrides.recommendation ?? 'ADDRESS_NOW',
    rationale: overrides.rationale ?? '',
    detectedAt: overrides.detectedAt ?? '2026-04-01T00:00:00.000Z',
    evaluationSessionId: overrides.evaluationSessionId ?? '',
    status: overrides.status ?? 'ADDRESS_NOW',
    sessionCount: overrides.sessionCount ?? 1,
    ...overrides,
  }
}

function snapshot(blocks: ConceptualBlock[], extra: Partial<SkillSnapshot> = {}): SkillSnapshot {
  return {
    childId: 'lincoln',
    prioritySkills: [],
    supports: [],
    stopRules: [],
    evidenceDefinitions: [],
    conceptualBlocks: blocks,
    ...extra,
  }
}

describe('applyToSnapshot — block lifecycle advance', () => {
  it('advances a matching ADDRESS_NOW block to RESOLVING (partial mastery)', () => {
    const snap = snapshot([
      block({ id: 'short-i-vs-e', name: 'Short i vs e', affectedSkills: ['Short i vs e'] }),
    ])
    const { snapshot: next, changed } = applyToSnapshot(snap, {
      masteredSkills: ['Short i vs e'],
      fullyMastered: false,
      source: 'scan',
      at: AT,
    })
    expect(changed).toBe(true)
    expect(next.conceptualBlocks?.[0].status).toBe('RESOLVING')
    expect(next.conceptualBlocks?.[0].lastSource).toBe('scan')
    expect(next.conceptualBlocks?.[0].sessionCount).toBe(2)
    expect(next.blocksUpdatedAt).toBe(AT)
  })

  it('advances straight to RESOLVED when the milestone marks full mastery', () => {
    const snap = snapshot([block({ id: 'cvc-blending', name: 'CVC blending' })])
    const { snapshot: next, changed } = applyToSnapshot(snap, {
      masteredSkills: ['CVC blending'],
      fullyMastered: true,
      at: AT,
    })
    expect(changed).toBe(true)
    expect(next.conceptualBlocks?.[0].status).toBe('RESOLVED')
    expect(next.conceptualBlocks?.[0].resolvedAt).toBe(AT)
  })

  it('matches via affectedSkills, not just the block name', () => {
    const snap = snapshot([
      block({ id: 'phonics-digraphs', name: 'Digraphs', affectedSkills: ['Consonant digraph sh'] }),
    ])
    const { changed, snapshot: next } = applyToSnapshot(snap, {
      masteredSkills: ['Consonant digraph sh'],
      at: AT,
    })
    expect(changed).toBe(true)
    expect(next.conceptualBlocks?.[0].status).toBe('RESOLVING')
  })

  it('no-ops when no block matches the mastered skill', () => {
    const snap = snapshot([block({ id: 'short-i-vs-e', name: 'Short i vs e' })])
    const { snapshot: next, changed } = applyToSnapshot(snap, {
      masteredSkills: ['Long division'],
      at: AT,
    })
    expect(changed).toBe(false)
    expect(next.conceptualBlocks?.[0].status).toBe('ADDRESS_NOW')
    expect(next.conceptualBlocks?.[0].sessionCount).toBe(1)
  })

  it('never downgrades a RESOLVED block and never reopens it', () => {
    const snap = snapshot([
      block({ id: 'cvc-blending', name: 'CVC blending', status: 'RESOLVED', resolvedAt: '2026-01-01T00:00:00.000Z' }),
    ])
    const { snapshot: next, changed } = applyToSnapshot(snap, {
      masteredSkills: ['CVC blending'],
      fullyMastered: false, // would be RESOLVING — a downgrade
      at: AT,
    })
    expect(changed).toBe(false)
    expect(next.conceptualBlocks?.[0].status).toBe('RESOLVED')
    expect(next.conceptualBlocks?.[0].resolvedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('leaves DEFER blocks untouched (a parent decision, not a scan call)', () => {
    const snap = snapshot([
      block({ id: 'fractions', name: 'Fractions', status: 'DEFER', recommendation: 'DEFER' }),
    ])
    const { snapshot: next, changed } = applyToSnapshot(snap, {
      masteredSkills: ['Fractions'],
      fullyMastered: true,
      at: AT,
    })
    expect(changed).toBe(false)
    expect(next.conceptualBlocks?.[0].status).toBe('DEFER')
  })

  it('does not touch unrelated blocks', () => {
    const snap = snapshot([
      block({ id: 'short-i-vs-e', name: 'Short i vs e' }),
      block({ id: 'fractions', name: 'Fractions' }),
    ])
    const { snapshot: next } = applyToSnapshot(snap, {
      masteredSkills: ['Short i vs e'],
      at: AT,
    })
    expect(next.conceptualBlocks?.[0].status).toBe('RESOLVING')
    expect(next.conceptualBlocks?.[1].status).toBe('ADDRESS_NOW')
    expect(next.conceptualBlocks?.[1].sessionCount).toBe(1)
  })

  it('is idempotent — re-applying the same update advances nothing further', () => {
    const snap = snapshot([block({ id: 'short-i-vs-e', name: 'Short i vs e' })])
    const first = applyToSnapshot(snap, { masteredSkills: ['Short i vs e'], at: AT })
    expect(first.changed).toBe(true)

    const second = applyToSnapshot(first.snapshot, { masteredSkills: ['Short i vs e'], at: '2026-06-01T00:00:00.000Z' })
    expect(second.changed).toBe(false)
    expect(second.snapshot.conceptualBlocks?.[0].sessionCount).toBe(2)
    expect(second.snapshot.conceptualBlocks?.[0].lastReinforcedAt).toBe(first.snapshot.conceptualBlocks?.[0].lastReinforcedAt)
  })

  it('can later escalate RESOLVING → RESOLVED on a mastery milestone', () => {
    const snap = snapshot([block({ id: 'short-i-vs-e', name: 'Short i vs e' })])
    const first = applyToSnapshot(snap, { masteredSkills: ['Short i vs e'], fullyMastered: false, at: AT })
    expect(first.snapshot.conceptualBlocks?.[0].status).toBe('RESOLVING')

    const second = applyToSnapshot(first.snapshot, { masteredSkills: ['Short i vs e'], fullyMastered: true, at: '2026-06-01T00:00:00.000Z' })
    expect(second.changed).toBe(true)
    expect(second.snapshot.conceptualBlocks?.[0].status).toBe('RESOLVED')
  })
})

describe('applyToSnapshot — tolerance + priority skills', () => {
  it('tolerates a missing/empty snapshot', () => {
    const { snapshot: next, changed } = applyToSnapshot(null, {
      masteredSkills: ['Anything'],
      at: AT,
    })
    expect(changed).toBe(false)
    expect(next.conceptualBlocks).toEqual([])
    expect(next.childId).toBe('')
  })

  it('no-ops on an empty mastered list', () => {
    const snap = snapshot([block({ id: 'short-i-vs-e', name: 'Short i vs e' })])
    const { changed } = applyToSnapshot(snap, { masteredSkills: [], at: AT })
    expect(changed).toBe(false)
  })

  it('upgrades a matching priority skill to secure/mastered (never downgrading)', () => {
    const snap = snapshot([], {
      prioritySkills: [
        { tag: 'phonics.cvc', label: 'CVC blending', level: SkillLevel.Emerging, masteryGate: MasteryGate.WithHelp },
      ],
    })
    const { snapshot: next, changed } = applyToSnapshot(snap, {
      masteredSkills: ['CVC blending'],
      at: AT,
    })
    expect(changed).toBe(true)
    expect(next.prioritySkills[0].level).toBe(SkillLevel.Secure)
    expect(next.prioritySkills[0].masteryGate).toBe(MasteryGate.IndependentConsistent)
  })

  it('leaves an already-secure priority skill untouched (idempotent)', () => {
    const snap = snapshot([], {
      prioritySkills: [
        { tag: 'phonics.cvc', label: 'CVC blending', level: SkillLevel.Secure, masteryGate: MasteryGate.IndependentConsistent },
      ],
    })
    const { changed } = applyToSnapshot(snap, { masteredSkills: ['CVC blending'], at: AT })
    expect(changed).toBe(false)
  })
})

describe('applyToSnapshot — additive edit ops (6a / Tier C Option 2)', () => {
  // ── Priority skills ────────────────────────────────────────────────
  it('appends a new priority skill, stamped as a parent directive', () => {
    const snap = snapshot([], {
      prioritySkills: [
        { tag: 'phonics.cvc', label: 'CVC blending', level: SkillLevel.Secure },
      ],
    })
    const { snapshot: next, changed, changedFields } = applyToSnapshot(snap, {
      masteredSkills: [],
      addPrioritySkills: ['Short vowel discrimination'],
      directive: 'Dad wants us to drill short vowels',
      at: AT,
    })
    expect(changed).toBe(true)
    expect(changedFields.prioritySkills).toBe(true)
    expect(next.prioritySkills).toHaveLength(2)
    const added = next.prioritySkills[1]
    expect(added.label).toBe('Short vowel discrimination')
    expect(added.tag).toBe('short-vowel-discrimination')
    // Newly flagged priorities assert "teach next", never a mastery claim.
    expect(added.level).toBe(SkillLevel.Emerging)
    expect(added.masteryGate).toBe(MasteryGate.NotYet)
    // Evidence/directive stamp lands on the new entry.
    expect(added.notes).toContain('parent directive via chat')
    expect(added.notes).toContain(AT)
    expect(added.notes).toContain('Dad wants us to drill short vowels')
    // Existing skill is left exactly as-is (no downgrade).
    expect(next.prioritySkills[0].level).toBe(SkillLevel.Secure)
    expect(next.updatedAt).toBe(AT)
  })

  it('no-ops when adding a priority skill that already exists (matched on slug)', () => {
    const snap = snapshot([], {
      prioritySkills: [
        { tag: 'cvc', label: 'CVC Blending', level: SkillLevel.Developing, masteryGate: MasteryGate.WithHelp },
      ],
    })
    const { snapshot: next, changed, changedFields } = applyToSnapshot(snap, {
      masteredSkills: [],
      addPrioritySkills: ['cvc blending'], // same slug as 'CVC Blending'
      at: AT,
    })
    expect(changed).toBe(false)
    expect(changedFields.prioritySkills).toBe(false)
    expect(next.prioritySkills).toHaveLength(1)
    // Existing entry untouched — no downgrade of level/gate.
    expect(next.prioritySkills[0].level).toBe(SkillLevel.Developing)
    expect(next.prioritySkills[0].masteryGate).toBe(MasteryGate.WithHelp)
  })

  it('dedups repeated adds within a single update', () => {
    const { snapshot: next, changed } = applyToSnapshot(snapshot([]), {
      masteredSkills: [],
      addPrioritySkills: ['Telling time', 'telling time', '  Telling Time  '],
      at: AT,
    })
    expect(changed).toBe(true)
    expect(next.prioritySkills).toHaveLength(1)
    expect(next.prioritySkills[0].label).toBe('Telling time')
  })

  // ── Supports ───────────────────────────────────────────────────────
  it('appends a new support, dedup\'d and stamped', () => {
    const snap = snapshot([], {
      supports: [{ label: 'Short reading sessions', description: 'existing' }],
    })
    const { snapshot: next, changed, changedFields } = applyToSnapshot(snap, {
      masteredSkills: [],
      addSupports: ['Manipulatives for math'],
      at: AT,
    })
    expect(changed).toBe(true)
    expect(changedFields.supports).toBe(true)
    expect(next.supports).toHaveLength(2)
    expect(next.supports[1].label).toBe('Manipulatives for math')
    expect(next.supports[1].description).toContain('parent directive via chat')
    // Existing support preserved untouched.
    expect(next.supports[0]).toEqual({ label: 'Short reading sessions', description: 'existing' })
  })

  it('no-ops on a duplicate support (case-insensitive label match)', () => {
    const snap = snapshot([], {
      supports: [{ label: 'Manipulatives for math', description: 'existing' }],
    })
    const { snapshot: next, changed, changedFields } = applyToSnapshot(snap, {
      masteredSkills: [],
      addSupports: ['MANIPULATIVES FOR MATH'],
      at: AT,
    })
    expect(changed).toBe(false)
    expect(changedFields.supports).toBe(false)
    expect(next.supports).toHaveLength(1)
    expect(next.supports[0].description).toBe('existing')
  })

  // ── Stop rules ─────────────────────────────────────────────────────
  it('appends a new stop rule, dedup\'d and stamped', () => {
    const snap = snapshot([], {
      stopRules: [{ label: 'Skip long passages', trigger: 'x', action: 'y' }],
    })
    const { snapshot: next, changed, changedFields } = applyToSnapshot(snap, {
      masteredSkills: [],
      addStopRules: ['Stop after 60s of refusal'],
      at: AT,
    })
    expect(changed).toBe(true)
    expect(changedFields.stopRules).toBe(true)
    expect(next.stopRules).toHaveLength(2)
    expect(next.stopRules[1].label).toBe('Stop after 60s of refusal')
    expect(next.stopRules[1].trigger).toBe('')
    expect(next.stopRules[1].action).toContain('parent directive via chat')
    // Existing stop rule preserved untouched.
    expect(next.stopRules[0]).toEqual({ label: 'Skip long passages', trigger: 'x', action: 'y' })
  })

  it('no-ops on a duplicate stop rule (case-insensitive label match)', () => {
    const snap = snapshot([], {
      stopRules: [{ label: 'Stop after 60s of refusal', trigger: 'x', action: 'y' }],
    })
    const { changed, changedFields } = applyToSnapshot(snap, {
      masteredSkills: [],
      addStopRules: ['stop after 60s of refusal'],
      at: AT,
    })
    expect(changed).toBe(false)
    expect(changedFields.stopRules).toBe(false)
  })

  it('uses a generic directive stamp when no directive text is supplied', () => {
    const { snapshot: next } = applyToSnapshot(snapshot([]), {
      masteredSkills: [],
      addSupports: ['Timer'],
      at: AT,
    })
    expect(next.supports[0].description).toBe(`parent directive via chat — ${AT}`)
  })

  // ── Invariant proofs ───────────────────────────────────────────────
  it('an additive edit never touches RESOLVED/DEFER blocks or downgrades skills', () => {
    const snap = snapshot(
      [
        block({ id: 'cvc-blending', name: 'CVC blending', status: 'RESOLVED', resolvedAt: '2026-01-01T00:00:00.000Z' }),
        block({ id: 'fractions', name: 'Fractions', status: 'DEFER', recommendation: 'DEFER' }),
        block({ id: 'short-i-vs-e', name: 'Short i vs e', status: 'ADDRESS_NOW' }),
      ],
      {
        prioritySkills: [
          { tag: 'reading.fluency', label: 'Reading fluency', level: SkillLevel.Secure, masteryGate: MasteryGate.IndependentConsistent },
        ],
      },
    )
    const { snapshot: next, changed } = applyToSnapshot(snap, {
      masteredSkills: [],
      addPrioritySkills: ['New skill to teach'],
      addSupports: ['New support'],
      addStopRules: ['New stop rule'],
      at: AT,
    })
    expect(changed).toBe(true)
    // Blocks are completely untouched by an additive edit (no mastered signal).
    expect(next.conceptualBlocks).toEqual(snap.conceptualBlocks)
    // Existing priority skill keeps its level + gate (never downgraded).
    expect(next.prioritySkills[0]).toEqual(snap.prioritySkills[0])
    // The additive entries were appended.
    expect(next.prioritySkills).toHaveLength(2)
    expect(next.supports).toHaveLength(1)
    expect(next.stopRules).toHaveLength(1)
    // blocksUpdatedAt is not bumped when no block changed.
    expect(next.blocksUpdatedAt).toBeUndefined()
  })

  it('combines a mastered-skill advance with additive edits in one update', () => {
    const snap = snapshot([block({ id: 'short-i-vs-e', name: 'Short i vs e' })], {
      supports: [],
    })
    const { snapshot: next, changed, changedFields } = applyToSnapshot(snap, {
      masteredSkills: ['Short i vs e'],
      addSupports: ['Extra timer'],
      at: AT,
    })
    expect(changed).toBe(true)
    expect(changedFields.conceptualBlocks).toBe(true)
    expect(changedFields.supports).toBe(true)
    expect(next.conceptualBlocks?.[0].status).toBe('RESOLVING')
    expect(next.supports).toHaveLength(1)
  })

  it('no-ops with no mastered signal and no additive edits', () => {
    const snap = snapshot([block({ id: 'short-i-vs-e', name: 'Short i vs e' })])
    const { changed, changedFields } = applyToSnapshot(snap, { masteredSkills: [], at: AT })
    expect(changed).toBe(false)
    expect(changedFields).toEqual({
      prioritySkills: false,
      conceptualBlocks: false,
      supports: false,
      stopRules: false,
      questActivity: false,
    })
  })
})
