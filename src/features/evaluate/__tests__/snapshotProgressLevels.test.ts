/**
 * UX-187 — a "progressing" claim must not write the app's top mastery rating.
 *
 * Written against the pure reducer, because that is where the defect lived and
 * where the audit found it by execution rather than by reading a test:
 * `fullyMastered` was consulted in exactly one place (`targetStatus`, the
 * conceptual-block branch) and the priority-skill branch returned
 * `SkillLevel.Secure` / `MasteryGate.IndependentConsistent` unconditionally.
 *
 * The first block below is the regression guard on the OTHER half of the fix:
 * `skipPrioritySkillLevels` is additive and opt-in, so every existing caller —
 * the FUNC-02 scan write-through, `commitMasteryRollup`, the quest session, the
 * certificate paths — must behave exactly as it did.
 */
import { describe, expect, it } from 'vitest'

import { applyToSnapshot } from '../skillSnapshotWrites'
import type { SkillSnapshot } from '../../../core/types/evaluation'
import { MasteryGate, SkillLevel } from '../../../core/types/enums'

const AT = '2026-09-07'

const snapshotWith = (over: Partial<SkillSnapshot> = {}): Partial<SkillSnapshot> => ({
  childId: 'lincoln',
  prioritySkills: [
    {
      tag: 'th-digraph',
      label: 'th digraph',
      level: SkillLevel.Emerging,
      masteryGate: MasteryGate.NotYet,
    },
  ],
  supports: [],
  stopRules: [],
  evidenceDefinitions: [],
  conceptualBlocks: [
    {
      id: 'th-digraph',
      name: 'th digraph',
      status: 'ADDRESS_NOW',
    },
  ],
  ...over,
}) as Partial<SkillSnapshot>

describe('applyToSnapshot — the flag is absent everywhere it was absent before', () => {
  it('still writes Secure for a mastery claim, exactly as it always did', () => {
    const { snapshot, changed } = applyToSnapshot(snapshotWith(), {
      masteredSkills: ['th digraph'],
      fullyMastered: true,
      at: AT,
    })

    expect(changed).toBe(true)
    expect(snapshot.prioritySkills[0].level).toBe(SkillLevel.Secure)
    expect(snapshot.prioritySkills[0].masteryGate).toBe(MasteryGate.IndependentConsistent)
    expect(snapshot.conceptualBlocks?.[0].status).toBe('RESOLVED')
  })

  it('still writes Secure when a caller passes fullyMastered: false and nothing else', () => {
    // This IS the old defect, and it is deliberately still here: the FUNC-02
    // scan write-through (`CertificateScanSection`) passes exactly this shape,
    // and the fix is opt-in precisely so that path does not move.
    const { snapshot } = applyToSnapshot(snapshotWith(), {
      masteredSkills: ['th digraph'],
      fullyMastered: false,
      at: AT,
    })

    expect(snapshot.prioritySkills[0].level).toBe(SkillLevel.Secure)
    expect(snapshot.conceptualBlocks?.[0].status).toBe('RESOLVING')
  })
})

describe('applyToSnapshot — skipPrioritySkillLevels (UX-187)', () => {
  it('advances the block to RESOLVING and leaves the level exactly where it was', () => {
    const { snapshot, changed } = applyToSnapshot(snapshotWith(), {
      masteredSkills: ['th digraph'],
      fullyMastered: false,
      skipPrioritySkillLevels: true,
      at: AT,
    })

    expect(changed).toBe(true)
    expect(snapshot.conceptualBlocks?.[0].status).toBe('RESOLVING')
    expect(snapshot.prioritySkills[0].level).toBe(SkillLevel.Emerging)
    expect(snapshot.prioritySkills[0].masteryGate).toBe(MasteryGate.NotYet)
  })

  it('reports no change when the only match would have been a level', () => {
    // A child with the priority skill but no conceptual block for it. Before
    // the fix this returned `changed: true` and wrote full mastery; now there
    // is genuinely nothing a progress claim can record, and saying so is what
    // stops the card stamping "Done ✓" over it (UX-190).
    const { changed, snapshot } = applyToSnapshot(snapshotWith({ conceptualBlocks: [] }), {
      masteredSkills: ['th digraph'],
      fullyMastered: false,
      skipPrioritySkillLevels: true,
      at: AT,
    })

    expect(changed).toBe(false)
    expect(snapshot.prioritySkills[0].level).toBe(SkillLevel.Emerging)
  })

  it('can only ever move fewer fields — it never downgrades a Secure skill', () => {
    const secure = snapshotWith({
      prioritySkills: [
        {
          tag: 'th-digraph',
          label: 'th digraph',
          level: SkillLevel.Secure,
          masteryGate: MasteryGate.IndependentConsistent,
        },
      ],
    })

    const { snapshot } = applyToSnapshot(secure, {
      masteredSkills: ['th digraph'],
      fullyMastered: false,
      skipPrioritySkillLevels: true,
      at: AT,
    })

    expect(snapshot.prioritySkills[0].level).toBe(SkillLevel.Secure)
    expect(snapshot.prioritySkills[0].masteryGate).toBe(MasteryGate.IndependentConsistent)
  })

  it('leaves the additive add* ops working alongside it', () => {
    const { snapshot, changed } = applyToSnapshot(snapshotWith(), {
      masteredSkills: ['th digraph'],
      fullyMastered: false,
      skipPrioritySkillLevels: true,
      addSupports: ['sit beside him for the first two'],
      at: AT,
    })

    expect(changed).toBe(true)
    expect(snapshot.supports).toHaveLength(1)
    expect(snapshot.prioritySkills[0].level).toBe(SkillLevel.Emerging)
  })
})
