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
// The round-2 block below drives the flag through the REAL withdrawal writer
// rather than hand-setting it, and reads the result through the one reader every
// advice consumer uses.
import { withdrawCompletionCoverage } from './programCompletionProjection'
import { effectiveConceptState } from '../../../functions/src/shared/foundations/completionCoverage'
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

describe('withdrawn evidence is history, not a projection guard (PR1900 round3)', () => {
  it('allows level movement past a superseded completion while preserving that ref', () => {
    const current = storedAt(5)
    const id = 'reading.phonics.longVowels'
    const history = { kind: 'programCompletionCoverage' as const, sourceId: 'retired', completionId: 'retired', status: 'superseded' as const, note: 'Withdrawn', observedAt: SEEDED_AT }
    current.conceptStates[id] = { ...current.conceptStates[id], state: 'frontier', evidence: [history] }
    const before = structuredClone(current)
    const projected = applyWorkingLevelProjection(current, foundationGraphs, 'c1', snapshot(7), NOW)
    expect(projected.model.conceptStates[id].state).toBe('solid')
    expect(projected.model.conceptStates[id].evidence).toContainEqual(history)
    expect(projected.changedConceptIds).toContain(id)
    expect(current).toEqual(before)
  })

  it('still protects an active direct observation beside withdrawn history', () => {
    const current = storedAt(5)
    const id = 'reading.phonics.longVowels'
    current.conceptStates[id] = {
      ...current.conceptStates[id], state: 'frontier', evidence: [
        { kind: 'programCompletionCoverage', sourceId: 'retired', completionId: 'retired', status: 'superseded', note: 'Withdrawn', observedAt: SEEDED_AT },
        { kind: 'eval', sourceId: 'eval-current', readState: 'frontier', note: 'Current direct read', observedAt: NOW },
      ],
    }
    const projected = applyWorkingLevelProjection(current, foundationGraphs, 'c1', snapshot(7), NOW)
    expect(projected.model.conceptStates[id]).toEqual(current.conceptStates[id])
    expect(projected.changedConceptIds).not.toContain(id)
  })
})

/**
 * A fresh level ESTABLISHES a state, so it ends the completion review (round 2,
 * finding 4304817073).
 *
 * The defect: this projection wrote a fresh `solid` over an entry an
 * unreconstructable completion withdrawal had flagged, and spread
 * `completionReviewNeeded: true` through to it. The shared support reader values
 * coverage claims and direct observations — a band-derived `workingLevel` ref is
 * neither — so `effectiveConceptState` capped the new reading at `frontier` and
 * nothing in the system could ever lift it: every advice surface went on serving
 * the working edge for a concept the child's own level had just established.
 *
 * The repair retires the flag on exactly the concepts this pass raises, and
 * nowhere else. It does NOT teach `survivingSupportedState` about `workingLevel`
 * refs: that reader is also the withdrawal's, so a new kind of support there
 * would change what props a concept up when a completion is released.
 *
 * **Negative control for a reviewer:** drop the one `completionReviewNeeded`
 * line from the fold and the first case fails on `effective` (`frontier`, with
 * the flag still `true`). Move it above the rule 1 / rule 2 guards — clearing
 * the flag on every flagged concept the pass merely visits — and the blocked and
 * lower controls fail on the flag. The equal control is the one that pins that
 * no flag-only sweep was added: it still gets the same model object back.
 */
describe('a raised state retires the completion review (round 2)', () => {
  const ID = 'reading.phonics.longVowels'
  /** The pre-FEAT-242 ref an old confirmation left: it owned the promotion and recorded no baseline. */
  const legacy = {
    kind: 'programCompletionCoverage' as const,
    sourceId: 'fastPhonics:old',
    completionId: 'fastPhonics:old',
    note: 'Fast Phonics finished',
    observedAt: SEEDED_AT,
    promoted: true,
  }

  /**
   * The real lifecycle, not a hand-set flag: a legacy confirmation raised a
   * band-seeded concept, and withdrawing it could not reconstruct the basis.
   *
   * `level` is the level the model was seeded at, and `state` the state the
   * withdrawal is left holding.
   */
  function flaggedModel(level: number, state: 'forming' | 'solid'): LearnerModel {
    const current = storedAt(level)
    const seeded = current.conceptStates[ID]
    current.conceptStates[ID] = {
      ...seeded,
      state,
      // An unrelated standing field: a withdrawal must not touch it, and neither
      // may the retirement below (FEAT-76 is resolved by one specific act).
      needsReconcile: true,
      evidence: [...(seeded.evidence ?? []), legacy],
    }
    const withdrawn = withdrawCompletionCoverage(current, 'fastPhonics:old', LEVEL_MOVED_AT, 'mistake')
    expect(withdrawn.reviewNeededConceptIds).toContain(ID)
    const entry = withdrawn.model.conceptStates[ID]
    expect(entry.state).toBe(state) // history is not rewritten
    expect(entry.completionReviewNeeded).toBe(true)
    // The band-derived ref sitting right there is NOT support the shared reader
    // values, which is the whole reason the flag has to be retired rather than
    // out-voted: advice reads the working edge until something establishes a state.
    expect(effectiveConceptState(entry)).toBe('frontier')
    return withdrawn.model
  }

  it('reads a freshly projected solid as solid, flag retired, history intact', () => {
    const uncertain = flaggedModel(5, 'forming')
    const legacyAfterWithdrawal = uncertain.conceptStates[ID].evidence.find(
      (e) => e.completionId === 'fastPhonics:old',
    )
    expect(legacyAfterWithdrawal?.status).toBe('superseded')

    // Level 7 reads `solid` where level 5 read `frontier`, so this is a genuine
    // raise over the `forming` the withdrawal was left holding.
    const { model: next, changedConceptIds } = project(uncertain, 7)
    const entry = next.conceptStates[ID]
    expect(changedConceptIds).toContain(ID)
    expect(entry.state).toBe('solid')
    // Explicitly `false`, never absent: the writer MERGES this entry into
    // Firestore (and JSON-scrubs `undefined`), where a missing key would leave
    // the stored `true` behind.
    expect(entry.completionReviewNeeded).toBe(false)
    expect('completionReviewNeeded' in entry).toBe(true)
    // ...so every advice consumer now reads what the level established.
    expect(effectiveConceptState(entry)).toBe('solid')

    // Nothing else moved: the record of the withdrawal, the standing reconcile
    // question, and the new reading's own evidence.
    expect(entry.needsReconcile).toBe(true)
    expect(entry.evidence).toContainEqual(legacyAfterWithdrawal)
    expect(entry.evidence.at(-1)?.kind).toBe('workingLevel')
    expect(next.changeFeed.some((c) => c.conceptId === ID && c.to === 'solid')).toBe(true)
    // And a concept that never carried the flag does not acquire the key.
    const untouched = next.conceptStates['reading.phonics.vowelTeams']
    expect('completionReviewNeeded' in untouched).toBe(false)
  })

  it('blocked: an ACTIVE claim beside the flag keeps rule 1, and the derived read', () => {
    // A fresh confirmation's own ref is active, so rule 1 skips the concept
    // outright — a derived writer may not overwrite what is currently claimed.
    // The entry is therefore unchanged, flag included, and the reading comes
    // from the live claim through the shared reader rather than from this pass.
    const uncertain = flaggedModel(5, 'forming')
    uncertain.conceptStates[ID] = {
      ...uncertain.conceptStates[ID],
      evidence: [
        ...uncertain.conceptStates[ID].evidence,
        {
          kind: 'programCompletionCoverage',
          sourceId: 'fastPhonics:fresh',
          completionId: 'fastPhonics:fresh',
          note: 'Fast Phonics finished',
          observedAt: LEVEL_MOVED_AT,
          status: 'active',
          coverageQualifier: 'direct',
          withheldReason: 'already-at-or-above',
        },
      ],
    }
    const before = structuredClone(uncertain.conceptStates[ID])

    const { model: next, changedConceptIds } = project(uncertain, 7)
    expect(changedConceptIds).not.toContain(ID)
    expect(next.conceptStates[ID]).toEqual(before)
    expect(next.conceptStates[ID].completionReviewNeeded).toBe(true)
    // The core fresh-completion behaviour is untouched by this repair: the live
    // claim supports the coverage cap, so advice reads `forming` — not `solid`,
    // which no claim and no level has established here.
    expect(effectiveConceptState(next.conceptStates[ID])).toBe('forming')
  })

  it('equal: a projection that confirms the stored state retires nothing', () => {
    // Seeded at 7 and projected at 7: the band pass offers the state the entry
    // already holds, so rule 2 skips it. Nothing was established, so the
    // uncertainty stands — and rule 4 still returns the SAME object, which is
    // what a flag-only sweep would have broken.
    const uncertain = flaggedModel(7, 'solid')
    const result = project(uncertain, 7)
    expect(result.changedConceptIds).toEqual([])
    expect(result.model).toBe(uncertain)
    expect(result.model.conceptStates[ID].completionReviewNeeded).toBe(true)
    expect(effectiveConceptState(result.model.conceptStates[ID])).toBe('frontier')
  })

  it('lower: a level that moved DOWN retires nothing and demotes nothing', () => {
    const uncertain = flaggedModel(7, 'solid')
    const { model: next, changedConceptIds } = project(uncertain, 5)
    expect(changedConceptIds).not.toContain(ID)
    expect(next.conceptStates[ID].state).toBe('solid')
    expect(next.conceptStates[ID].completionReviewNeeded).toBe(true)
    expect(effectiveConceptState(next.conceptStates[ID])).toBe('frontier')
  })
})
