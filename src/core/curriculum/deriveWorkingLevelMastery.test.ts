import { describe, expect, it } from 'vitest'

import type { PrioritySkill, WorkingLevel } from '../types/evaluation'
import type { SightWordProgress } from '../types/books'
import { MasteryGate, SkillLevel } from '../types/enums'
import {
  applyReDerivedMastery,
  deriveSightWordMastery,
  deriveSnapshotPrioritySkillMastery,
  deriveWorkingLevelMastery,
  SIGHT_WORD_MASTERED_THRESHOLD,
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

function sw(
  word: string,
  masteryLevel: SightWordProgress['masteryLevel'],
): SightWordProgress {
  return {
    word,
    encounters: 0,
    selfReportedKnown: 0,
    helpRequested: 0,
    shellyConfirmed: false,
    masteryLevel,
    firstSeen: '2026-01-01T00:00:00.000Z',
    lastSeen: '2026-01-01T00:00:00.000Z',
    lastLevelChange: '2026-01-01T00:00:00.000Z',
  }
}

function priority(tag: string, masteryGate?: PrioritySkill['masteryGate']): PrioritySkill {
  return { tag, label: tag, level: SkillLevel.Secure, masteryGate }
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

// ── deriveSightWordMastery (chunk 2) ───────────────────────────
describe('deriveSightWordMastery', () => {
  const NODE = 'reading.phonics.sightWords'

  it('marks the node Mastered at/above the mastered threshold (>= 80%)', () => {
    // 4/5 = 80% mastered → meets the threshold exactly.
    const list = [
      sw('the', 'mastered'),
      sw('was', 'mastered'),
      sw('said', 'mastered'),
      sw('are', 'mastered'),
      sw('you', 'practicing'),
    ]
    expect(SIGHT_WORD_MASTERED_THRESHOLD).toBe(0.8)
    expect(deriveSightWordMastery(list)[NODE]).toBe(SkillStatus.Mastered)
  })

  it('marks the node InProgress when partly learned but below the threshold', () => {
    // 1/4 = 25% mastered (< 80%) but several words past `new` → InProgress.
    const list = [
      sw('the', 'mastered'),
      sw('was', 'familiar'),
      sw('said', 'practicing'),
      sw('are', 'new'),
    ]
    expect(deriveSightWordMastery(list)[NODE]).toBe(SkillStatus.InProgress)
  })

  it('contributes nothing for an empty list', () => {
    expect(deriveSightWordMastery([])).toEqual({})
    expect(deriveSightWordMastery(undefined)).toEqual({})
    expect(deriveSightWordMastery(null)).toEqual({})
  })

  it('contributes nothing when every word is still `new`', () => {
    const list = [sw('the', 'new'), sw('was', 'new')]
    expect(deriveSightWordMastery(list)).toEqual({})
  })
})

// ── deriveSnapshotPrioritySkillMastery (chunk 2) ───────────────
describe('deriveSnapshotPrioritySkillMastery', () => {
  it('maps a gate-3 (mastered) priority skill to its node as Mastered', () => {
    const result = deriveSnapshotPrioritySkillMastery([
      priority('phonics.cvc', MasteryGate.IndependentConsistent),
    ])
    expect(result['reading.phonics.cvc']).toBe(SkillStatus.Mastered)
  })

  it('ignores priority skills below the mastery gate', () => {
    expect(
      deriveSnapshotPrioritySkillMastery([
        priority('phonics.cvc', MasteryGate.MostlyIndependent),
        priority('phonics.blends', MasteryGate.WithHelp),
        priority('phonics.digraphs', undefined),
      ]),
    ).toEqual({})
  })

  it('ignores tags that resolve to no curriculum node', () => {
    expect(
      deriveSnapshotPrioritySkillMastery([
        priority('totally.unknown.tag', MasteryGate.IndependentConsistent),
      ]),
    ).toEqual({})
  })

  it('contributes nothing for empty / missing priority skills', () => {
    expect(deriveSnapshotPrioritySkillMastery([])).toEqual({})
    expect(deriveSnapshotPrioritySkillMastery(undefined)).toEqual({})
  })
})

// ── applyReDerivedMastery — chunk 2 inputs folded in ───────────
describe('applyReDerivedMastery — sight-word + priority-skill inputs', () => {
  const NOW = '2026-06-20T00:00:00.000Z'

  it('writes sight-word mastery into the sight-word node (evaluation source)', () => {
    const list = [sw('the', 'mastered'), sw('was', 'mastered'), sw('said', 'mastered'), sw('are', 'mastered'), sw('you', 'mastered')]
    const { skills, changedNodeIds } = applyReDerivedMastery({}, undefined, [], NOW, list)
    expect(skills['reading.phonics.sightWords']).toMatchObject({
      status: SkillStatus.Mastered,
      source: 'evaluation',
      updatedAt: NOW,
    })
    expect(changedNodeIds).toContain('reading.phonics.sightWords')
  })

  it('writes snapshot priority-skill mastery into the mapped node', () => {
    const { skills, changedNodeIds } = applyReDerivedMastery({}, undefined, [], NOW, undefined, [
      priority('phonics.digraphs', MasteryGate.IndependentConsistent),
    ])
    expect(skills['reading.phonics.digraphs']).toMatchObject({
      status: SkillStatus.Mastered,
      source: 'evaluation',
    })
    expect(changedNodeIds).toContain('reading.phonics.digraphs')
  })

  it('keeps the manual FREEZE with the new inputs (sight-word node)', () => {
    const existing: Record<string, SkillNodeStatus> = {
      'reading.phonics.sightWords': node('reading.phonics.sightWords', SkillStatus.InProgress, 'manual'),
    }
    const list = [sw('the', 'mastered'), sw('was', 'mastered'), sw('said', 'mastered'), sw('are', 'mastered'), sw('you', 'mastered')]
    const { skills, changedNodeIds } = applyReDerivedMastery(existing, undefined, [], NOW, list, [
      priority('phonics.sightwords', MasteryGate.IndependentConsistent),
    ])
    expect(skills['reading.phonics.sightWords']).toEqual(existing['reading.phonics.sightWords'])
    expect(changedNodeIds).not.toContain('reading.phonics.sightWords')
  })

  it('combines working-level + sight-word + snapshot inputs, upgrade-only', () => {
    const list = [sw('the', 'mastered'), sw('was', 'mastered'), sw('said', 'mastered'), sw('are', 'mastered')]
    const priorities = [priority('phonics.rcontrolled', MasteryGate.IndependentConsistent)]

    const { skills, changedNodeIds } = applyReDerivedMastery(
      {},
      { phonics: wl(4) },
      [],
      NOW,
      list,
      priorities,
    )
    // working level: L1–L3 mastered, L4 in-progress
    expect(skills['reading.phonics.cvc'].status).toBe(SkillStatus.Mastered)
    expect(skills['reading.phonics.digraphs'].status).toBe(SkillStatus.InProgress)
    // sight words: 100% mastered → node mastered
    expect(skills['reading.phonics.sightWords'].status).toBe(SkillStatus.Mastered)
    // snapshot: gate-3 r-controlled → node mastered (above the L4 frontier)
    expect(skills['reading.phonics.rControlled'].status).toBe(SkillStatus.Mastered)
    expect(changedNodeIds.length).toBeGreaterThan(0)
  })

  it('is idempotent with the new inputs — no write on a second pass', () => {
    const list = [sw('the', 'mastered'), sw('was', 'mastered'), sw('said', 'mastered'), sw('are', 'mastered')]
    const priorities = [priority('phonics.cvc', MasteryGate.IndependentConsistent)]

    const first = applyReDerivedMastery({}, { phonics: wl(4) }, [], NOW, list, priorities)
    expect(first.changedNodeIds.length).toBeGreaterThan(0)

    const second = applyReDerivedMastery(first.skills, { phonics: wl(4) }, [], NOW, list, priorities)
    expect(second.changedNodeIds).toEqual([])
    expect(second.skills).toEqual(first.skills)
  })

  it('Mastered wins — a gate-3 priority skill upgrades a working-level in-progress node', () => {
    // phonics L4 implies digraphs in-progress; a gate-3 digraphs priority skill masters it.
    const { skills } = applyReDerivedMastery({}, { phonics: wl(4) }, [], NOW, undefined, [
      priority('phonics.digraphs', MasteryGate.IndependentConsistent),
    ])
    expect(skills['reading.phonics.digraphs'].status).toBe(SkillStatus.Mastered)
  })
})
