// The map moves when the child moves (UX-291) — and the four rules that make a
// projection safe to run on a page view are asserted here, not claimed.
//
// The fixtures are the owner's own screen: a model seeded on 2026-07-06 at
// phonics level 5, and a child whose phonics level has since moved. Every "level
// N" below is a real `projectWorkingLevelStates` answer, not a hand-written one.
import { describe, expect, it } from 'vitest'

import { foundationGraphs } from './index'
import { projectWorkingLevelStates } from './seedLearnerModel'
import { currentDrivingLevels } from './seedLearnerModel'
import {
  applyWorkingLevelProjection,
  shouldReprojectWorkingLevels,
} from './workingLevelProjection'
import type { EvidenceKind, LearnerModel } from '../types/learnerModel'
import type { SkillSnapshot } from '../types/evaluation'

const SEEDED_AT = '2026-07-06T12:55:33.000Z'
const LEVEL_MOVED_AT = '2026-09-01T09:00:00.000Z'
const NOW = '2026-09-09T18:00:00.000Z'

/** A snapshot carrying one phonics working level, stamped when it moved. */
function snapshot(level: number | undefined, updatedAt = LEVEL_MOVED_AT): SkillSnapshot {
  return {
    childId: 'c1',
    workingLevels:
      level == null ? {} : { phonics: { level, updatedAt, source: 'manual' } },
  } as SkillSnapshot
}

/** A stored model whose band-derived states were computed at `SEEDED_AT`. */
function storedAt(phonicsLevel: number, over: Partial<LearnerModel> = {}): LearnerModel {
  return {
    childId: 'c1',
    graphVersion: 'reading@1+math@1',
    status: 'seeded',
    conceptStates: projectWorkingLevelStates(
      foundationGraphs,
      'c1',
      snapshot(phonicsLevel, SEEDED_AT),
      SEEDED_AT,
    ),
    projectedThrough: { phonics: phonicsLevel, writing: null, math: null },
    modalityCalibration: { reading: { note: '' }, writing: { note: '' }, math: { note: '' } },
    whatMattersNext: [],
    changeFeed: [],
    openQuestions: [],
    seededAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    ...over,
  }
}

const project = (model: LearnerModel, level: number | undefined, stamp = LEVEL_MOVED_AT) =>
  applyWorkingLevelProjection(model, foundationGraphs, 'c1', snapshot(level, stamp), NOW)

describe('shouldReprojectWorkingLevels — the watermark is the INPUTS', () => {
  it('is true when a driving level differs from the one that was projected', () => {
    expect(shouldReprojectWorkingLevels(storedAt(5), snapshot(7))).toBe(true)
  })

  it('is false when the levels are the ones already projected', () => {
    expect(shouldReprojectWorkingLevels(storedAt(5), snapshot(5))).toBe(false)
  })

  // Codex round 2, finding 1 — the reason this compares values per field rather
  // than one maximum timestamp.
  it('sees a level change a clock-skewed device stamped OLDER than another level', () => {
    const model = storedAt(5, { projectedThrough: { phonics: 5, math: 3, writing: null } })
    const skewed = {
      childId: 'c1',
      workingLevels: {
        phonics: { level: 5, updatedAt: '2026-09-08T00:00:00.000Z', source: 'manual' },
        // Written later in real time, stamped earlier by a device behind the clock.
        math: { level: 6, updatedAt: '2026-09-02T00:00:00.000Z', source: 'quest' },
      },
    } as SkillSnapshot
    expect(shouldReprojectWorkingLevels(model, skewed)).toBe(true)
  })

  it('sees a same-field level whose stamp moved BACKWARDS', () => {
    const model = storedAt(7, { projectedThrough: { phonics: 7, writing: null, math: null } })
    expect(shouldReprojectWorkingLevels(model, snapshot(4, '2026-01-01T00:00:00.000Z'))).toBe(
      true,
    )
  })

  it('sees a level that appeared, and one that was cleared', () => {
    const none = { phonics: null, writing: null, math: null }
    expect(shouldReprojectWorkingLevels(storedAt(5, { projectedThrough: none }), snapshot(5))).toBe(
      true,
    )
    expect(
      shouldReprojectWorkingLevels(
        storedAt(5, { projectedThrough: { ...none, phonics: 5 } }),
        null,
      ),
    ).toBe(true)
  })

  // Codex round 2, finding 2 — a model with no recorded projection cannot support
  // a claim about what it was projected from, and the seed's wall clock was the
  // wrong thing to guess with.
  it('is true when nothing has been recorded, rather than guessing from seededAt', () => {
    const unrecorded = storedAt(5)
    delete (unrecorded as { projectedThrough?: unknown }).projectedThrough
    expect(shouldReprojectWorkingLevels(unrecorded, snapshot(5, SEEDED_AT))).toBe(true)
    expect(shouldReprojectWorkingLevels(unrecorded, null)).toBe(true)
  })

  it('ignores levels that drive no band — an unrelated level must not cost a write', () => {
    const withComprehension = {
      childId: 'c1',
      workingLevels: {
        phonics: { level: 5, updatedAt: SEEDED_AT, source: 'manual' },
        comprehension: { level: 4, updatedAt: NOW, source: 'quest' },
        sentence: { level: 3, updatedAt: NOW, source: 'quest' },
      },
    } as SkillSnapshot
    expect(shouldReprojectWorkingLevels(storedAt(5), withComprehension)).toBe(false)
  })

  it('never reads updatedAt at all — a stamp is a client clock, a level is the input', () => {
    // Same levels, wildly different stamps in both directions: no re-projection.
    expect(shouldReprojectWorkingLevels(storedAt(5), snapshot(5, '2099-01-01T00:00:00.000Z'))).toBe(
      false,
    )
    expect(shouldReprojectWorkingLevels(storedAt(5), snapshot(5, '1999-01-01T00:00:00.000Z'))).toBe(
      false,
    )
    const noStamp = { childId: 'c1', workingLevels: { phonics: { level: 5 } } } as SkillSnapshot
    expect(shouldReprojectWorkingLevels(storedAt(5), noStamp)).toBe(false)
  })
})

describe('currentDrivingLevels', () => {
  it('reads exactly the driving keys', () => {
    const snap = {
      childId: 'c1',
      workingLevels: {
        phonics: { level: 5, updatedAt: NOW, source: 'manual' },
        math: { level: 3, updatedAt: NOW, source: 'quest' },
        writing: { level: 2, updatedAt: NOW, source: 'manual' },
        comprehension: { level: 4, updatedAt: NOW, source: 'quest' },
        sentence: { level: 1, updatedAt: NOW, source: 'quest' },
      },
    } as SkillSnapshot
    expect(currentDrivingLevels(snap)).toEqual({ phonics: 5, math: 3, writing: 2 })
  })

  it('is TOTAL — every driving key present, "no level" as null, never omitted', () => {
    // Codex round 3: an omitted key survives Firestore's `{merge:true}` forever,
    // so the next mount reads a cleared level as different and the projection
    // re-runs and re-writes on every mount.
    const none = { phonics: null, writing: null, math: null }
    expect(currentDrivingLevels(null)).toEqual(none)
    expect(
      currentDrivingLevels({
        childId: 'c1',
        workingLevels: { phonics: { level: NaN }, math: { level: undefined } },
      } as unknown as SkillSnapshot),
    ).toEqual(none)
    expect(Object.keys(currentDrivingLevels(snapshot(5))).sort()).toEqual([
      'math',
      'phonics',
      'writing',
    ])
  })

  it('a cleared level settles in ONE write, not on every mount forever', () => {
    // phonics 5 + math 3 was projected; math has since been cleared.
    const model = storedAt(5, { projectedThrough: { phonics: 5, math: 3, writing: null } })
    expect(shouldReprojectWorkingLevels(model, snapshot(5))).toBe(true)

    // Writing the TOTAL map is what settles it — every leaf is overwritten, so
    // the stale `math: 3` cannot survive the merge.
    const settled = storedAt(5, { projectedThrough: currentDrivingLevels(snapshot(5)) })
    expect(shouldReprojectWorkingLevels(settled, snapshot(5))).toBe(false)
  })

  it('is what the seeder records, so a fresh model needs no re-projection', () => {
    const seeded = storedAt(5)
    expect(seeded.projectedThrough).toEqual(currentDrivingLevels(snapshot(5)))
    expect(shouldReprojectWorkingLevels(seeded, snapshot(5))).toBe(false)
  })
})

describe('applyWorkingLevelProjection — the level moved', () => {
  it("moves the states London's screen had frozen at level 5", () => {
    const { model, changedConceptIds } = project(storedAt(5), 7)

    // Frozen at level 5 these read `frontier` / `not-yet`; at level 7 they move.
    expect(model.conceptStates['reading.phonics.longVowels'].state).toBe('solid')
    expect(model.conceptStates['reading.phonics.rControlled'].state).toBe('frontier')
    expect(changedConceptIds).toEqual([
      'reading.phonics.longVowels',
      'reading.phonics.vowelTeams',
      'reading.phonics.rControlled',
      'reading.phonics.diphthongs',
      'reading.decoding.multisyllable',
    ])
  })

  it('appends the new reading to the evidence trail rather than replacing it', () => {
    const before = storedAt(5).conceptStates['reading.phonics.longVowels']
    expect(before.state).toBe('frontier')
    expect(before.evidence[0].note).toBe('At phonics working level 5')

    const { model } = project(storedAt(5), 7)
    const after = model.conceptStates['reading.phonics.longVowels']
    expect(after.evidence).toHaveLength(2)
    // The stale reading STAYS — it is the record of what was true in July.
    expect(after.evidence[0].note).toBe('At phonics working level 5')
    expect(after.evidence[1].note).toBe('Below phonics working level 7')
    expect(after.evidence[1].observedAt).toBe(NOW)
    // And the original seed stamp is not rewritten.
    expect(after.seededAt).toBe(SEEDED_AT)
  })

  it('appends a changeFeed line for EVERY state it moves — UX-290s open half', () => {
    const { model, changedConceptIds } = project(storedAt(5), 7)
    expect(model.changeFeed).toHaveLength(changedConceptIds.length)

    const line = model.changeFeed.find(
      (c) => c.conceptId === 'reading.phonics.longVowels',
    )
    expect(line).toBeDefined()
    expect(line?.from).toBe('frontier')
    expect(line?.to).toBe('solid')
    expect(line?.at).toBe(NOW)
    expect(line?.cause).toContain('phonics now at level 7')
    // No-shame vocabulary: a projection only ever raises, so nothing may read as a loss.
    for (const entry of model.changeFeed) {
      expect(entry.cause).not.toMatch(/behind|regress|drop|lost|fail/i)
    }
  })

  it('keeps existing changeFeed history and moves updatedAt', () => {
    const prior = {
      conceptId: 'reading.fluency.accuracy',
      from: 'not-yet' as const,
      to: 'solid' as const,
      cause: 'eval',
      at: SEEDED_AT,
    }
    const { model } = project(storedAt(5, { changeFeed: [prior] }), 7)
    expect(model.changeFeed[0]).toEqual(prior)
    expect(model.updatedAt).toBe(NOW)
  })
})

describe('applyWorkingLevelProjection — the four rules', () => {
  // Rule 1. The UX-290 guarantee, and the thing a whole-layer sweep is most
  // likely to break. Positive control: dropping the
  // `carriesNonDerivableEvidence` skip in the fold fails every case here.
  const witnessed: EvidenceKind[] = [
    'attestation',
    'curriculumPosition',
    'eval',
    'quest',
    'scan',
  ]
  for (const kind of witnessed) {
    it(`never moves a concept carrying a ${kind} ref, at any level change`, () => {
      const base = storedAt(5)
      const conceptId = 'reading.phonics.longVowels'
      const model: LearnerModel = {
        ...base,
        conceptStates: {
          ...base.conceptStates,
          [conceptId]: {
            state: 'forming',
            evidence: [{ kind, sourceId: 's-1', note: 'someone saw this', observedAt: SEEDED_AT }],
            seededAt: SEEDED_AT,
          },
        },
      }

      // Level 7 would otherwise raise this concept `frontier` → `solid`.
      const { model: next, changedConceptIds } = project(model, 7)
      expect(next.conceptStates[conceptId].state).toBe('forming')
      expect(next.conceptStates[conceptId].evidence).toHaveLength(1)
      expect(changedConceptIds).not.toContain(conceptId)
      expect(next.changeFeed.some((c) => c.conceptId === conceptId)).toBe(false)
    })
  }

  it('moves a concept whose only evidence IS seeder-derived — the preserve rule is not a blanket freeze', () => {
    const { changedConceptIds } = project(storedAt(5), 7)
    expect(changedConceptIds).toContain('reading.phonics.longVowels')
  })

  // Rule 2. Positive control: removing the STATE_RANK guard makes both fail.
  it('is upgrade-only — a level that moved DOWN demotes nothing', () => {
    // Level 5 reads `frontier` on a concept level 7 read `solid`, so this is a
    // demotion the band pass genuinely offers, with a real evidence ref behind
    // it — not one the "a raised state must carry evidence" guard would catch.
    const at5 = project(storedAt(7), 5)
    expect(at5.model.conceptStates['reading.phonics.longVowels'].state).toBe('solid')
    expect(at5.model.conceptStates['reading.phonics.vowelTeams'].state).toBe('solid')
    expect(at5.changedConceptIds).toEqual([])

    // And all the way down to `not-yet`, which is the same rule at rank 0.
    const at2 = project(storedAt(7), 2)
    expect(at2.model.conceptStates['reading.phonics.longVowels'].state).toBe('solid')
    expect(at2.changedConceptIds).toEqual([])
  })

  it('never demotes on ABSENCE — a level that has not been re-measured is not a level that dropped', () => {
    const { model, changedConceptIds } = project(storedAt(7), undefined)
    expect(model.conceptStates['reading.phonics.longVowels'].state).toBe('solid')
    expect(model.conceptStates['reading.phonics.rControlled'].state).toBe('frontier')
    expect(changedConceptIds).toEqual([])
  })

  // Rule 4. Positive control: returning a spread copy instead of `model` fails
  // the identity assertion, which is what the writer keys its no-op on.
  it('a projection that moves nothing returns the SAME model object', () => {
    const model = storedAt(5)
    const result = project(model, 5)
    expect(result.changedConceptIds).toEqual([])
    expect(result.model).toBe(model)
    expect(result.model.updatedAt).toBe(SEEDED_AT)
  })

  it('touches nothing outside the band-derived set — sight words included (UX-293 is its own row)', () => {
    const base = storedAt(5)
    const model: LearnerModel = {
      ...base,
      conceptStates: {
        ...base.conceptStates,
        'reading.phonics.sightWords': {
          state: 'forming',
          evidence: [
            {
              kind: 'sightWordShare',
              sourceId: 'sightWordProgress',
              note: '4/10 sight words mastered (40%)',
              observedAt: SEEDED_AT,
              masteredShare: 0.4,
            },
          ],
          seededAt: SEEDED_AT,
        },
        // An evidence-only node the band pass has no driver for.
        'reading.comprehension.inference': {
          state: 'frontier',
          evidence: [{ kind: 'eval', sourceId: 'e-1', note: 'n', observedAt: SEEDED_AT }],
          seededAt: SEEDED_AT,
        },
      },
    }
    const { model: next } = project(model, 7)
    expect(next.conceptStates['reading.phonics.sightWords']).toEqual(
      model.conceptStates['reading.phonics.sightWords'],
    )
    expect(next.conceptStates['reading.comprehension.inference']).toEqual(
      model.conceptStates['reading.comprehension.inference'],
    )
  })

  it('every state it raises carries evidence — the models one invariant', () => {
    const { model, changedConceptIds } = project(storedAt(5), 7)
    for (const id of changedConceptIds) {
      const entry = model.conceptStates[id]
      expect(entry.state).not.toBe('not-yet')
      expect(entry.evidence.length).toBeGreaterThan(0)
      expect(entry.evidence.at(-1)?.kind).toBe('workingLevel')
    }
  })
})
