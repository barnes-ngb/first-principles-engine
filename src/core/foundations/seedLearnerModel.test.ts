import { describe, expect, it } from 'vitest'

import { foundationGraphs, FOUNDATION_NODE_MAP } from './index'
import { mergeSeededModel, seedLearnerModel } from './seedLearnerModel'
import type { ConceptStateKind, LearnerModel } from '../types/learnerModel'
import type { SkillSnapshot, WorkingLevel } from '../types/evaluation'
import type { SightWordProgress } from '../types/books'

const NOW = '2026-07-03T12:00:00.000Z'

function wl(level: number): WorkingLevel {
  return { level, updatedAt: NOW, source: 'quest' }
}

function snapshot(partial: Partial<SkillSnapshot>): SkillSnapshot {
  return {
    childId: 'child-1',
    prioritySkills: [],
    supports: [],
    stopRules: [],
    evidenceDefinitions: [],
    ...partial,
  }
}

function sightWords(total: number, mastered: number): SightWordProgress[] {
  return Array.from({ length: total }, (_, i) => ({
    word: `w${i}`,
    encounters: 5,
    selfReportedKnown: 1,
    helpRequested: 0,
    shellyConfirmed: false,
    masteryLevel: i < mastered ? 'mastered' : 'practicing',
    firstSeen: NOW,
    lastSeen: NOW,
    lastLevelChange: NOW,
  }))
}

/** Seed against both graphs with a fixed clock. */
function seed(
  snap: SkillSnapshot | null,
  sw: SightWordProgress[] | null = null,
): LearnerModel {
  return seedLearnerModel(foundationGraphs, 'child-1', snap, null, sw, { now: NOW })
}

/** Count states by kind. */
function counts(model: LearnerModel): Record<ConceptStateKind, number> {
  const out = { solid: 0, forming: 0, frontier: 0, 'not-yet': 0 }
  for (const s of Object.values(model.conceptStates)) out[s.state] += 1
  return out
}

/** The distinct bands (of the graph) occupied by non-`not-yet` states. */
function occupiedBands(model: LearnerModel): Set<string> {
  const bands = new Set<string>()
  for (const [id, s] of Object.entries(model.conceptStates)) {
    if (s.state !== 'not-yet') bands.add(FOUNDATION_NODE_MAP[id].band)
  }
  return bands
}

describe('seedLearnerModel — spiky mid-elementary profile (the terrain claim)', () => {
  // Phonics L4 → reading frontier at band 1 (blends/digraphs); math L5 → frontier
  // at band 3 (multiplication); writing L3 → encoding frontier at band 1; a mostly
  // mastered sight-word list. This is a decode-ahead-of-encode, phonics-behind-math
  // profile — the spiky terrain the model exists to render.
  const spiky = seed(
    snapshot({
      workingLevels: { phonics: wl(4), math: wl(5), writing: wl(3) },
    }),
    sightWords(10, 9), // 90% mastered → solid
  )

  it('seeds several phonics nodes solid with blends/digraphs at the frontier', () => {
    expect(spiky.conceptStates['reading.phonics.letterSounds'].state).toBe('solid')
    expect(spiky.conceptStates['reading.print.concepts'].state).toBe('solid')
    expect(spiky.conceptStates['reading.phonemic.hearSounds'].state).toBe('solid')
    expect(spiky.conceptStates['reading.phonics.blends'].state).toBe('frontier')
    expect(spiky.conceptStates['reading.phonics.digraphs'].state).toBe('frontier')
    expect(spiky.conceptStates['reading.phonics.longVowels'].state).toBe('not-yet')
  })

  it('keeps the entire comprehension strand not-yet (evidence-only)', () => {
    expect(spiky.conceptStates['reading.comprehension.listen'].state).toBe('not-yet')
    expect(spiky.conceptStates['reading.comprehension.explicit'].state).toBe('not-yet')
    expect(spiky.conceptStates['reading.comprehension.inference'].state).toBe('not-yet')
    expect(spiky.conceptStates['reading.comprehension.listen'].evidence).toEqual([])
  })

  it('seeds math with multiplication at the frontier, number sense solid', () => {
    expect(spiky.conceptStates['math.number.counting'].state).toBe('solid')
    expect(spiky.conceptStates['math.operations.addWithin20'].state).toBe('solid')
    expect(spiky.conceptStates['math.number.placeValue'].state).toBe('solid')
    expect(spiky.conceptStates['math.operations.multFacts'].state).toBe('frontier')
    expect(spiky.conceptStates['math.fractions.concepts'].state).toBe('not-yet')
  })

  it('holds regrouping (L7) not-yet at math level 5 — the node-id override, not band', () => {
    // Band-3 flow would call regrouping a peer of multFacts; the L7 override keeps
    // it ahead of a level-5 child. This is the "L7/L8 map by id, not band" rule.
    expect(spiky.conceptStates['math.operations.regrouping'].state).toBe('not-yet')
    expect(spiky.conceptStates['math.operations.multiTables'].state).toBe('not-yet')
  })

  it('decode/encode diverge: sight words solid, encoding at its own frontier', () => {
    expect(spiky.conceptStates['reading.phonics.sightWords'].state).toBe('solid')
    expect(spiky.conceptStates['reading.encoding.spellCvc'].state).toBe('frontier')
    expect(spiky.conceptStates['reading.encoding.spellPatterns'].state).toBe('not-yet')
  })

  it('occupies MULTIPLE bands simultaneously (spiky-as-terrain)', () => {
    const bands = occupiedBands(spiky)
    // Solid at band K, frontier at band 1 (reading) and band 3 (math), sight-word
    // node at K-1 — a legible landscape, not a single level-per-domain.
    expect(bands.size).toBeGreaterThanOrEqual(3)
    expect(bands.has('K')).toBe(true)
    expect(bands.has('1')).toBe(true)
    expect(bands.has('3')).toBe(true)
  })

  it('carries evidence on every non-not-yet state (the invariant)', () => {
    for (const [id, s] of Object.entries(spiky.conceptStates)) {
      if (s.state !== 'not-yet') {
        expect(s.evidence.length, `${id} (${s.state}) has no evidence`).toBeGreaterThan(0)
      }
    }
  })

  it('sight-word evidence carries the mastered share', () => {
    const ev = spiky.conceptStates['reading.phonics.sightWords'].evidence[0]
    expect(ev.kind).toBe('sightWordShare')
    expect(ev.masteredShare).toBeCloseTo(0.9)
  })

  it('reports status seeded', () => {
    expect(spiky.status).toBe('seeded')
    expect(spiky.graphVersion).toBe('reading@1+math@1')
  })
})

describe('seedLearnerModel — K-frontier profile', () => {
  // Phonics L1 + math L1: the whole map is at its earliest edge. Nearly everything
  // is not-yet; letter sounds / counting sit at the frontier.
  const kFrontier = seed(
    snapshot({ workingLevels: { phonics: wl(1), math: wl(1) } }),
    null,
  )

  it('puts letter sounds at the frontier and nearly all else not-yet', () => {
    expect(kFrontier.conceptStates['reading.phonics.letterSounds'].state).toBe('frontier')
    expect(kFrontier.conceptStates['reading.phonics.cvc'].state).toBe('not-yet')
    expect(kFrontier.conceptStates['reading.phonics.blends'].state).toBe('not-yet')
    expect(kFrontier.conceptStates['reading.phonics.sightWords'].state).toBe('not-yet')
  })

  it('puts counting at the frontier with the rest of math not-yet', () => {
    expect(kFrontier.conceptStates['math.number.counting'].state).toBe('frontier')
    expect(kFrontier.conceptStates['math.operations.addWithin20'].state).toBe('not-yet')
  })

  it('has zero solid states — nothing is below the K frontier', () => {
    expect(counts(kFrontier).solid).toBe(0)
  })

  it('occupies only the K band (contrast with the spiky terrain)', () => {
    expect([...occupiedBands(kFrontier)]).toEqual(['K'])
  })
})

describe('seedLearnerModel — priority skills and completed programs', () => {
  it('marks a gate-3 priority skill node solid with prioritySkill evidence', () => {
    const model = seed(
      snapshot({
        prioritySkills: [
          { tag: 'reading.phonics.cvc', label: 'CVC words', level: 'secure', masteryGate: 3 },
        ],
      }),
    )
    const state = model.conceptStates['reading.phonics.cvc']
    expect(state.state).toBe('solid')
    expect(state.evidence[0].kind).toBe('prioritySkill')
  })

  it('does not promote a below-gate priority skill', () => {
    const model = seed(
      snapshot({
        prioritySkills: [
          { tag: 'reading.phonics.cvc', label: 'CVC words', level: 'developing', masteryGate: 1 },
        ],
      }),
    )
    // No working level either → falls through to not-yet.
    expect(model.conceptStates['reading.phonics.cvc'].state).toBe('not-yet')
  })
})

describe('seedLearnerModel — L7/L8 node-id override at the ladder top', () => {
  it('seeds regrouping frontier at math level 7 and multiTables at level 8', () => {
    const atL7 = seed(snapshot({ workingLevels: { math: wl(7) } }))
    expect(atL7.conceptStates['math.operations.regrouping'].state).toBe('frontier')
    expect(atL7.conceptStates['math.operations.multiTables'].state).toBe('not-yet')

    const atL8 = seed(snapshot({ workingLevels: { math: wl(8) } }))
    expect(atL8.conceptStates['math.operations.regrouping'].state).toBe('solid')
    expect(atL8.conceptStates['math.operations.multiTables'].state).toBe('frontier')
  })
})

describe('seedLearnerModel — graceful degrade', () => {
  it('seeds an all-not-yet no-data model from nothing, without throwing', () => {
    const model = seed(null, null)
    expect(model.status).toBe('no-data')
    expect(counts(model)['not-yet']).toBe(Object.keys(model.conceptStates).length)
    expect(Object.keys(model.conceptStates)).toHaveLength(60)
  })

  it('populates modality calibration deterministically (no "no data" complaint)', () => {
    const model = seed(snapshot({ workingLevels: { phonics: wl(4), math: wl(5) } }))
    expect(model.modalityCalibration.reading.level).toBe(4)
    expect(model.modalityCalibration.math.level).toBe(5)
    expect(model.modalityCalibration.writing.note.length).toBeGreaterThan(0)
    // Never emits a shame/no-data phrase even when a modality has no level.
    expect(model.modalityCalibration.writing.note.toLowerCase()).not.toContain('no data')
  })
})

describe('mergeSeededModel — attestation guard', () => {
  it('returns the fresh seed when there is no existing model', () => {
    const fresh = seed(snapshot({ workingLevels: { phonics: wl(4) } }))
    expect(mergeSeededModel(null, fresh)).toBe(fresh)
  })

  it('preserves an existing concept that carries an attestation', () => {
    const fresh = seed(snapshot({ workingLevels: { phonics: wl(1) } }))
    // reading.phonics.longVowels would seed not-yet; pretend a parent attested it.
    const existing: LearnerModel = {
      ...fresh,
      seededAt: '2026-06-01T00:00:00.000Z',
      conceptStates: {
        ...fresh.conceptStates,
        'reading.phonics.longVowels': {
          state: 'solid',
          evidence: [
            {
              kind: 'attestation',
              sourceId: 'parent',
              note: 'Parent says he reads long-vowel words',
              observedAt: '2026-06-01T00:00:00.000Z',
            },
          ],
        },
      },
    }
    const merged = mergeSeededModel(existing, fresh)
    expect(merged.conceptStates['reading.phonics.longVowels'].state).toBe('solid')
    expect(merged.conceptStates['reading.phonics.longVowels'].evidence[0].kind).toBe('attestation')
    // Non-attested nodes come from the fresh seed.
    expect(merged.conceptStates['reading.phonics.letterSounds'].state).toBe('frontier')
    // Update keeps the original seededAt.
    expect(merged.seededAt).toBe('2026-06-01T00:00:00.000Z')
  })
})
