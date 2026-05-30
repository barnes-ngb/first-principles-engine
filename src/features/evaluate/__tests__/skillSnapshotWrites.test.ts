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
