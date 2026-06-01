import { describe, it, expect, vi, beforeEach } from 'vitest'

import { generateBlockId } from '../../../core/utils/blockerLifecycle'
import { applyToSnapshot } from '../skillSnapshotWrites'
import type { ConceptualBlock, SkillSnapshot } from '../../../core/types/evaluation'
import { MasteryGate, SkillLevel } from '../../../core/types/enums'
import type { MasterySkillRollup } from '../masteryRollup'

// The ONLY snapshot-write seam this feature is allowed to use. Mocking it lets
// us assert commitMasteryRollup routes through the central writer and adds no
// inline Firestore write of its own.
vi.mock('../skillSnapshotWrites', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../skillSnapshotWrites')>()
  return { ...actual, writeSnapshotUpdate: vi.fn() }
})

import { writeSnapshotUpdate } from '../skillSnapshotWrites'
import { commitMasteryRollup } from '../commitMasteryRollup'

const mockWrite = vi.mocked(writeSnapshotUpdate)

function rollup(overrides: Partial<MasterySkillRollup>): MasterySkillRollup {
  return {
    skillKey: generateBlockId('Add'),
    label: 'Add',
    strongSignals: 3,
    neutralSignals: 0,
    struggleSignals: 0,
    strongOccasions: 2,
    lastSignalDate: '2026-05-03',
    sources: ['checklist'],
    mastered: true,
    evidence: 'mastered via repeated got-it — 2026-05-03 (3 strong across 2 days)',
    ...overrides,
  }
}

describe('commitMasteryRollup — central writer only', () => {
  beforeEach(() => {
    mockWrite.mockReset()
    mockWrite.mockResolvedValue({ changed: true })
  })

  it('routes mastered skills through writeSnapshotUpdate as additive fullyMastered writes', async () => {
    const res = await commitMasteryRollup('fam', 'lincoln', [rollup({})], { at: 'AT' })

    expect(mockWrite).toHaveBeenCalledTimes(1)
    const [familyId, childId, update] = mockWrite.mock.calls[0]
    expect(familyId).toBe('fam')
    expect(childId).toBe('lincoln')
    expect(update.fullyMastered).toBe(true)
    expect(update.source).toBe('parent')
    expect(update.evidence).toMatch(/mastered via/)
    // both label + slug passed so the matcher can hit skill or block
    expect(update.masteredSkills).toContain('Add')
    expect(update.masteredSkills).toContain(generateBlockId('Add'))
    expect(res.checkedOff.map((c) => c.label)).toEqual(['Add'])
    expect(res.changed).toBe(true)
  })

  it('never commits a below-threshold (still-working) skill', async () => {
    const res = await commitMasteryRollup('fam', 'lincoln', [rollup({ mastered: false })])
    expect(mockWrite).not.toHaveBeenCalled()
    expect(res.changed).toBe(false)
    expect(res.checkedOff).toHaveLength(0)
  })

  it('only writes that actually advanced the snapshot count as checked off', async () => {
    mockWrite.mockResolvedValueOnce({ changed: false })
    const res = await commitMasteryRollup('fam', 'lincoln', [rollup({})])
    expect(res.checkedOff).toHaveLength(0)
    expect(res.changed).toBe(false)
  })
})

// These exercise the real central writer (un-mocked import) to prove the
// never-downgrade contract holds on the path commitMasteryRollup drives.
describe('mastery write-through — never downgrades (via applyToSnapshot)', () => {
  function snapshot(extra: Partial<SkillSnapshot>): SkillSnapshot {
    return {
      childId: 'lincoln',
      prioritySkills: [],
      supports: [],
      stopRules: [],
      evidenceDefinitions: [],
      ...extra,
    }
  }

  it('leaves an unrelated unresolved block untouched when marking a different skill mastered', () => {
    const gap: ConceptualBlock = {
      id: generateBlockId('Spell'),
      name: 'Spell',
      affectedSkills: ['Spell'],
      recommendation: 'ADDRESS_NOW',
      rationale: '',
      detectedAt: '2026-04-01',
      evaluationSessionId: '',
      status: 'ADDRESS_NOW',
    }
    const { snapshot: next } = applyToSnapshot(snapshot({ conceptualBlocks: [gap] }), {
      masteredSkills: ['Add', generateBlockId('Add')],
      fullyMastered: true,
      at: 'AT',
    })
    const stillThere = next.conceptualBlocks?.find((b) => b.id === generateBlockId('Spell'))
    expect(stillThere?.status).toBe('ADDRESS_NOW')
  })

  it('does not downgrade an already-Secure priority skill', () => {
    const before = snapshot({
      prioritySkills: [
        { tag: 'add', label: 'Add', level: SkillLevel.Secure, masteryGate: MasteryGate.IndependentConsistent },
      ],
    })
    const { snapshot: next, changed } = applyToSnapshot(before, {
      masteredSkills: ['Add'],
      fullyMastered: true,
      at: 'AT',
    })
    expect(changed).toBe(false)
    expect(next.prioritySkills[0].level).toBe(SkillLevel.Secure)
  })
})
