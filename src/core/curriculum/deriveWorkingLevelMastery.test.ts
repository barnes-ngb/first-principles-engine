import { describe, expect, it } from 'vitest'

import type { WorkingLevel } from '../types/evaluation'
import {
  applyReDerivedMastery,
  deriveWorkingLevelMastery,
} from './deriveWorkingLevelMastery'
import { CURRICULUM_NODE_MAP } from './curriculumMap'
import type { SkillNodeStatus } from './skillStatus'
import { SkillStatus } from './skillStatus'
// Layering check: the same maps are still consumed by the quest derivation.
import { deriveWorkingLevelFromEvaluation } from '../../features/quest/workingLevels'

// ── helpers ────────────────────────────────────────────────────
function wl(level: number, source: WorkingLevel['source'] = 'quest'): WorkingLevel {
  return { level, updatedAt: '2026-01-01T00:00:00.000Z', source }
}

function node(
  nodeId: string,
  status: SkillStatus,
  source: SkillNodeStatus['source'],
): SkillNodeStatus {
  return { nodeId, status, source, updatedAt: '2026-01-01T00:00:00.000Z' }
}

// ── deriveWorkingLevelMastery ──────────────────────────────────
describe('deriveWorkingLevelMastery', () => {
  it('marks below-level nodes mastered and at-level nodes in-progress (phonics L4)', () => {
    const derived = deriveWorkingLevelMastery({ phonics: wl(4) })

    // L1–L3 → mastered
    expect(derived['reading.phonics.letterSounds']).toBe(SkillStatus.Mastered)
    expect(derived['reading.phonics.cvc']).toBe(SkillStatus.Mastered)
    expect(derived['reading.phonics.blends']).toBe(SkillStatus.Mastered)
    // L4 (== N) → in-progress
    expect(derived['reading.phonics.digraphs']).toBe(SkillStatus.InProgress)
    // L5+ never reached
    expect(derived['reading.phonics.longVowels']).toBeUndefined()
    expect(derived['reading.phonics.rControlled']).toBeUndefined()
  })

  it('contributes nothing when there are no working levels (speech / empty)', () => {
    expect(deriveWorkingLevelMastery(undefined)).toEqual({})
    expect(deriveWorkingLevelMastery(null)).toEqual({})
    expect(deriveWorkingLevelMastery({})).toEqual({})
    // No working-level key produces any speech.* node.
    const derived = deriveWorkingLevelMastery({ phonics: wl(8), math: wl(8) })
    expect(Object.keys(derived).some((id) => id.startsWith('speech.'))).toBe(false)
  })

  it('routes math working levels to math nodes', () => {
    const derived = deriveWorkingLevelMastery({ math: wl(2) })
    expect(derived['math.number.counting']).toBe(SkillStatus.Mastered) // L1 < 2
    expect(derived['math.operations.addSub']).toBe(SkillStatus.InProgress) // L2 == N
  })

  it('drops cross-domain leaks via the per-key domain guard (math never lights reading.fluency)', () => {
    // `multiplication.fluency` (math L8) substring-matches `…fluency` → reading.fluency.accuracy.
    // The math key only permits the `math` domain, so it must be dropped.
    const derived = deriveWorkingLevelMastery({ math: wl(8) })
    expect(derived['reading.fluency.accuracy']).toBeUndefined()
    // ...and every derived node stays inside the math domain.
    for (const id of Object.keys(derived)) {
      expect(CURRICULUM_NODE_MAP[id]?.domain).toBe('math')
    }
    // multDiv is mastered: its L5 intro tags (< 8) win over the L8 fluency tags.
    expect(derived['math.operations.multDiv']).toBe(SkillStatus.Mastered)
  })

  it('lets Mastered win when several tags resolve to one node', () => {
    // phonics L6: long-vowel (L5 < 6) masters longVowels; vowel-team (L6 == N) would
    // only imply in-progress on the same node — Mastered must win.
    const derived = deriveWorkingLevelMastery({ phonics: wl(6) })
    expect(derived['reading.phonics.cvc']).toBe(SkillStatus.Mastered)
    expect(derived['reading.phonics.longVowels']).toBe(SkillStatus.Mastered)
  })

  it('is per-child clean — same level data lights the same nodes (no name dependency)', () => {
    const a = deriveWorkingLevelMastery({ phonics: wl(4) })
    const b = deriveWorkingLevelMastery({ phonics: wl(4) })
    expect(a).toEqual(b)
  })
})

// ── applyReDerivedMastery ──────────────────────────────────────
describe('applyReDerivedMastery', () => {
  const NOW = '2026-06-20T00:00:00.000Z'

  it('writes derived mastery into an empty map and reports the changed nodes', () => {
    const { skills, changedNodeIds } = applyReDerivedMastery({}, { phonics: wl(4) }, [], NOW)

    expect(skills['reading.phonics.cvc']).toMatchObject({
      status: SkillStatus.Mastered,
      source: 'evaluation',
      updatedAt: NOW,
    })
    expect(skills['reading.phonics.digraphs'].status).toBe(SkillStatus.InProgress)
    expect(changedNodeIds).toContain('reading.phonics.cvc')
    expect(changedNodeIds).toContain('reading.phonics.digraphs')
  })

  it('never overrides a manual node (manual FREEZE)', () => {
    const existing: Record<string, SkillNodeStatus> = {
      // A deliberate manual downgrade of a node the working level would master.
      'reading.phonics.cvc': node('reading.phonics.cvc', SkillStatus.InProgress, 'manual'),
    }
    const { skills, changedNodeIds } = applyReDerivedMastery(existing, { phonics: wl(4) }, [], NOW)

    expect(skills['reading.phonics.cvc']).toEqual(existing['reading.phonics.cvc'])
    expect(skills['reading.phonics.cvc'].source).toBe('manual')
    expect(changedNodeIds).not.toContain('reading.phonics.cvc')
  })

  it('is upgrade-only — never downgrades a stored mastered node', () => {
    const existing: Record<string, SkillNodeStatus> = {
      // Stored mastered; the working level would only imply in-progress (== N).
      'reading.phonics.digraphs': node('reading.phonics.digraphs', SkillStatus.Mastered, 'program'),
    }
    const { skills, changedNodeIds } = applyReDerivedMastery(existing, { phonics: wl(4) }, [], NOW)

    expect(skills['reading.phonics.digraphs'].status).toBe(SkillStatus.Mastered)
    expect(changedNodeIds).not.toContain('reading.phonics.digraphs')
  })

  it('upgrades in-progress → mastered (non-manual)', () => {
    const existing: Record<string, SkillNodeStatus> = {
      'reading.phonics.cvc': node('reading.phonics.cvc', SkillStatus.InProgress, 'evaluation'),
    }
    const { skills, changedNodeIds } = applyReDerivedMastery(existing, { phonics: wl(4) }, [], NOW)
    expect(skills['reading.phonics.cvc'].status).toBe(SkillStatus.Mastered)
    expect(changedNodeIds).toContain('reading.phonics.cvc')
  })

  it('persist-delta — no changes on a second pass (idempotent)', () => {
    const first = applyReDerivedMastery({}, { phonics: wl(4) }, [], NOW)
    expect(first.changedNodeIds.length).toBeGreaterThan(0)

    const second = applyReDerivedMastery(first.skills, { phonics: wl(4) }, [], NOW)
    expect(second.changedNodeIds).toEqual([])
    expect(second.skills).toEqual(first.skills)
  })

  it('marks completed-program nodes mastered (program source)', () => {
    const { skills, changedNodeIds } = applyReDerivedMastery({}, undefined, ['reading-eggs'], NOW)
    // reading-eggs is linked to the foundational phonics nodes.
    expect(skills['reading.phonics.letterSounds']).toMatchObject({
      status: SkillStatus.Mastered,
      source: 'program',
    })
    expect(changedNodeIds).toContain('reading.phonics.letterSounds')
  })

  it('lets program Mastered win over a working-level in-progress on the same node', () => {
    // phonics L4 implies digraphs in-progress; reading-eggs implies digraphs mastered.
    const { skills } = applyReDerivedMastery({}, { phonics: wl(4) }, ['reading-eggs'], NOW)
    expect(skills['reading.phonics.digraphs']).toMatchObject({
      status: SkillStatus.Mastered,
      source: 'program',
    })
  })

  it('does not mutate the input skills object', () => {
    const existing: Record<string, SkillNodeStatus> = {}
    applyReDerivedMastery(existing, { phonics: wl(4) }, [], NOW)
    expect(existing).toEqual({})
  })
})

// ── Layering: quest still derives identically from the moved maps ──
describe('layering — quest workingLevels consumes the moved maps', () => {
  it('deriveWorkingLevelFromEvaluation still resolves phonics findings', () => {
    const result = deriveWorkingLevelFromEvaluation(
      [{ skill: 'digraphs', status: 'mastered', evidence: 'x', testedAt: '2026-01-01' }],
      'phonics',
    )
    expect(result?.level).toBe(4)
    expect(result?.source).toBe('evaluation')
  })

  it('a phonics-4 quest derivation and the map inversion agree on the frontier', () => {
    // The quest derives level 4 from a digraphs-mastered finding; the inversion
    // then treats L4 (digraphs) as the in-progress frontier — same map, two readings.
    const lvl = deriveWorkingLevelFromEvaluation(
      [{ skill: 'digraphs', status: 'mastered', evidence: 'x', testedAt: '2026-01-01' }],
      'phonics',
    )
    const derived = deriveWorkingLevelMastery({ phonics: wl(lvl!.level) })
    expect(derived['reading.phonics.digraphs']).toBe(SkillStatus.InProgress)
  })
})
