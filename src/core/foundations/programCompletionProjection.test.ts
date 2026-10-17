import { describe, expect, it } from 'vitest'

import {
  applyCompletionCoverage,
  completionCoverageHasActiveRefs,
  completionCoverageIsApplied,
  withdrawCompletionCoverage,
  type CompletionCoverageWrite,
} from './programCompletionProjection'
import { applyBridgeCoverageToModel } from './workbookBridge'
import { applyEvalFindingsToModel } from './evalModelSync'
import { applyQuestResultsToModel } from './questTargeting'
import { applyReviewActionToModel } from '../../features/foundations-review/foundationsReviewActions'
import {
  completionReviewCeiling,
  completionReviewSupported,
  coverageSupportedState,
  effectiveConceptState,
  survivingSupportedState,
} from '../../../functions/src/shared/foundations/completionCoverage'
import type { CompletionCoverageTarget } from './fastPhonicsCompletion'
import type {
  ConceptStateEntry,
  ConceptStateKind,
  EvidenceRef,
  LearnerModel,
} from '../types/learnerModel'

const CVC = 'reading.phonics.cvc'
const BLENDS = 'reading.phonics.blends'
const HEAR = 'reading.phonemic.hearSounds'
const OBSERVED = '2026-09-01T00:00:00.000Z'
const NOW = '2026-10-17T12:00:00.000Z'
const LATER = '2026-10-18T12:00:00.000Z'

function model(states: Record<string, ConceptStateEntry> = {}): LearnerModel {
  return {
    childId: 'c1',
    graphVersion: 'reading@1+math@1',
    status: 'seeded',
    conceptStates: states,
    modalityCalibration: { reading: { note: '' }, writing: { note: '' }, math: { note: '' } },
    whatMattersNext: [],
    changeFeed: [],
    openQuestions: [],
    seededAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  }
}

const direct = (conceptId: string, peak = 7): CompletionCoverageTarget => ({
  conceptId,
  qualifier: 'direct',
  attributedPeak: peak,
  attributedPeakLabel: `Peak ${peak}`,
})

const partial = (conceptId: string, peak = 1): CompletionCoverageTarget => ({
  conceptId,
  qualifier: 'partial',
  attributedPeak: peak,
  attributedPeakLabel: `Peak ${peak}`,
  partialReason: 'wider than the program',
})

function write(
  targets: CompletionCoverageTarget[],
  mappingVersion = 1,
  completionId = 'fastPhonics:draft-1',
): CompletionCoverageWrite {
  return {
    completionId,
    program: 'fastPhonics',
    programLabel: 'Fast Phonics',
    mappingVersion,
    observedAtIso: OBSERVED,
    detail: 'map note',
    targets,
  }
}

const refsOn = (m: LearnerModel, id: string): EvidenceRef[] => m.conceptStates[id].evidence

describe('applyCompletionCoverage — what one confirmation claims', () => {
  it('raises a directly aligned concept to forming, never past it', () => {
    const next = applyCompletionCoverage(model(), write([direct(CVC)]), NOW).model
    expect(next.conceptStates[CVC].state).toBe('forming')
    const ref = refsOn(next, CVC).at(-1)!
    expect(ref.kind).toBe('programCompletionCoverage')
    expect(ref.promoted).toBe(true)
    expect(ref.ownsPromotion).toBe(true)
    expect(ref.baselineState).toBe('not-yet')
    // The observation date, not the save clock — so a later eval stays later.
    expect(ref.observedAt).toBe(OBSERVED)
    expect(ref.recordedAt).toBe(NOW)
  })

  it('never reaches solid, and never downgrades a solid concept', () => {
    const solid = model({
      [CVC]: { state: 'solid', evidence: [], seededAt: NOW },
    })
    const next = applyCompletionCoverage(solid, write([direct(CVC)]), NOW).model
    expect(next.conceptStates[CVC].state).toBe('solid')
    expect(refsOn(next, CVC).at(-1)!.promoted).toBe(false)
  })

  it('records a partial concept as evidence and promotes nothing', () => {
    const next = applyCompletionCoverage(model(), write([partial(HEAR)]), NOW).model
    expect(next.conceptStates[HEAR].state).toBe('not-yet')
    const ref = refsOn(next, HEAR).at(-1)!
    expect(ref.coverageQualifier).toBe('partial')
    expect(ref.promoted).toBe(false)
    expect(ref.readState).toBeUndefined()
  })

  it('creates no attestation, queues no quest, and leaves needsReconcile alone', () => {
    const standing = model({
      [CVC]: {
        state: 'frontier',
        evidence: [
          { kind: 'attestation', sourceId: 'reviewChat', note: 'seen', observedAt: '2026-08-01T00:00:00.000Z', readState: 'frontier' },
        ],
        needsReconcile: true,
        seededAt: NOW,
      },
    })
    const applied = applyCompletionCoverage(standing, write([direct(CVC)]), NOW)
    expect(applied.model.openQuestions).toHaveLength(0)
    expect(refsOn(applied.model, CVC).some((r) => r.kind === 'attestation')).toBe(true)
    expect(refsOn(applied.model, CVC).filter((r) => r.kind === 'attestation')).toHaveLength(1)
    expect(applied.model.conceptStates[CVC].needsReconcile).toBe(true)
    // Governing direct evidence ⇒ the state stands where the parent put it.
    expect(applied.model.conceptStates[CVC].state).toBe('frontier')
    expect(refsOn(applied.model, CVC).at(-1)!.withheldReason).toBe('governing-direct-evidence')
  })

  it('is one source across every concept it touches', () => {
    const next = applyCompletionCoverage(model(), write([direct(CVC), direct(BLENDS, 14)]), NOW).model
    const ids = new Set(
      [CVC, BLENDS].map((id) => refsOn(next, id).at(-1)!.completionId),
    )
    expect(ids.size).toBe(1)
  })

  it('is idempotent at the same mapping version — no second ref, no inflation', () => {
    const once = applyCompletionCoverage(model(), write([direct(CVC)]), NOW).model
    const twice = applyCompletionCoverage(once, write([direct(CVC)]), LATER).model
    expect(refsOn(twice, CVC)).toHaveLength(1)
    expect(completionCoverageIsApplied(twice, 'fastPhonics:draft-1', 1, [CVC])).toBe(true)
  })
})

describe('re-apply and mapping revision keep ownership (Sol findings 3 and 4)', () => {
  it('carries the original baseline through an idempotent re-apply, so a later withdrawal still undoes it', () => {
    const once = applyCompletionCoverage(model(), write([direct(CVC)]), NOW).model
    const again = applyCompletionCoverage(once, write([direct(CVC)]), LATER).model
    const ref = refsOn(again, CVC).at(-1)!
    expect(ref.ownsPromotion).toBe(true)
    expect(ref.baselineState).toBe('not-yet')

    const withdrawn = withdrawCompletionCoverage(again, 'fastPhonics:draft-1', LATER, 'notComplete')
    expect(withdrawn.model.conceptStates[CVC].state).toBe('not-yet')
  })

  it('carries it through a mapping-version upgrade too', () => {
    const v1 = applyCompletionCoverage(model(), write([direct(CVC)], 1), NOW).model
    const v2 = applyCompletionCoverage(v1, write([direct(CVC)], 2), LATER).model
    const active = refsOn(v2, CVC).filter((r) => r.status !== 'superseded')
    expect(active).toHaveLength(1)
    expect(active[0].mappingVersion).toBe(2)
    expect(active[0].ownsPromotion).toBe(true)
    expect(active[0].baselineState).toBe('not-yet')
    // The v1 ref is kept, marked.
    expect(refsOn(v2, CVC).some((r) => r.status === 'superseded')).toBe(true)

    const withdrawn = withdrawCompletionCoverage(v2, 'fastPhonics:draft-1', LATER, 'mistake')
    expect(withdrawn.model.conceptStates[CVC].state).toBe('not-yet')
  })

  it('RELEASES a concept the new mapping no longer claims', () => {
    const v1 = applyCompletionCoverage(
      model(),
      write([direct(CVC), direct(BLENDS, 14)], 1),
      NOW,
    ).model
    expect(v1.conceptStates[BLENDS].state).toBe('forming')

    const v2 = applyCompletionCoverage(v1, write([direct(CVC)], 2), LATER)
    expect(v2.releasedConceptIds).toContain(BLENDS)
    expect(
      completionCoverageHasActiveRefs(
        { ...v2.model, conceptStates: { [BLENDS]: v2.model.conceptStates[BLENDS] } },
        'fastPhonics:draft-1',
      ),
    ).toBe(false)
    expect(v2.model.conceptStates[BLENDS].state).toBe('not-yet')
    expect(v2.model.conceptStates[CVC].state).toBe('forming')
  })

  it('releases the promotion when a target is DOWNGRADED to partial', () => {
    const v1 = applyCompletionCoverage(model(), write([direct(HEAR, 1)], 1), NOW).model
    expect(v1.conceptStates[HEAR].state).toBe('forming')

    const v2 = applyCompletionCoverage(v1, write([partial(HEAR)], 2), LATER)
    expect(v2.releasedConceptIds).toContain(HEAR)
    expect(v2.model.conceptStates[HEAR].state).toBe('not-yet')
    const active = refsOn(v2.model, HEAR).filter((r) => r.status !== 'superseded')
    expect(active).toHaveLength(1)
    expect(active[0].coverageQualifier).toBe('partial')
    expect(active[0].ownsPromotion).toBe(false)
  })
})

describe('withdrawal (Sol finding 2 and the organizer rule)', () => {
  it('KEEPS surviving independent workbook coverage instead of dropping to not-yet', () => {
    // Sol's exact sequence: completion raises CVC, an independent workbook
    // position then covers it, the completion is withdrawn.
    const confirmed = applyCompletionCoverage(model(), write([direct(CVC)]), NOW).model
    const covered = applyBridgeCoverageToModel(
      confirmed,
      [{ conceptId: CVC, unitLabel: 'Peak 7' }],
      'fastPhonics',
      LATER,
      'manual',
    ).model

    const withdrawn = withdrawCompletionCoverage(covered, 'fastPhonics:draft-1', LATER, 'notComplete')
    const entry = withdrawn.model.conceptStates[CVC]
    expect(entry.state).toBe('forming')
    expect(withdrawn.supportedConceptIds).toContain(CVC)
    // The workbook ref survives untouched; only ours is superseded.
    const live = entry.evidence.filter((r) => r.status !== 'superseded')
    expect(live.some((r) => r.kind === 'curriculumPosition')).toBe(true)
    expect(live.some((r) => r.kind === 'programCompletionCoverage')).toBe(false)
    expect(entry.completionReviewNeeded).toBeFalsy()
  })

  it('returns to the recorded baseline when nothing else supports the concept', () => {
    const confirmed = applyCompletionCoverage(model(), write([direct(CVC)]), NOW).model
    const withdrawn = withdrawCompletionCoverage(confirmed, 'fastPhonics:draft-1', LATER, 'partial')
    expect(withdrawn.model.conceptStates[CVC].state).toBe('not-yet')
    expect(withdrawn.revertedConceptIds).toContain(CVC)
  })

  it('leaves a LATER eval in control, and never restores a higher historical read', () => {
    const confirmed = applyCompletionCoverage(model(), write([direct(CVC)]), NOW).model
    const evaluated = applyEvalFindingsToModel(
      confirmed,
      [{ conceptId: CVC, state: 'frontier', note: 'eval read' }],
      'sess-1',
      LATER,
    ).model
    expect(evaluated.conceptStates[CVC].state).toBe('frontier')

    const withdrawn = withdrawCompletionCoverage(evaluated, 'fastPhonics:draft-1', LATER, 'mistake')
    expect(withdrawn.model.conceptStates[CVC].state).toBe('frontier')
    expect(withdrawn.directlyGovernedConceptIds).toContain(CVC)
  })

  it('withdraws only its OWN contribution — another confirmation survives', () => {
    const first = applyCompletionCoverage(
      model(),
      write([direct(CVC)], 1, 'fastPhonics:draft-1'),
      NOW,
    ).model
    const second = applyCompletionCoverage(
      first,
      write([direct(CVC)], 1, 'fastPhonics:draft-2'),
      LATER,
    ).model

    const withdrawn = withdrawCompletionCoverage(second, 'fastPhonics:draft-1', LATER, 'mistake')
    const live = withdrawn.model.conceptStates[CVC].evidence.filter(
      (r) => r.status !== 'superseded',
    )
    expect(live).toHaveLength(1)
    expect(live[0].completionId).toBe('fastPhonics:draft-2')
    expect(withdrawn.model.conceptStates[CVC].state).toBe('forming')
  })

  it('flags completion review — not needsReconcile — when a legacy ref has no provenance', () => {
    const legacy = model({
      [CVC]: {
        state: 'forming',
        evidence: [
          {
            kind: 'programCompletionCoverage',
            sourceId: 'fastPhonics:old',
            note: 'legacy',
            observedAt: OBSERVED,
            completionId: 'fastPhonics:old',
            promoted: true,
          },
        ],
        seededAt: NOW,
      },
    })
    const withdrawn = withdrawCompletionCoverage(legacy, 'fastPhonics:old', LATER, 'mistake')
    const entry = withdrawn.model.conceptStates[CVC]
    expect(entry.state).toBe('forming') // history is not rewritten
    expect(entry.completionReviewNeeded).toBe(true)
    expect(entry.needsReconcile).toBeUndefined()
    // ...and every advice consumer reads it conservatively.
    expect(effectiveConceptState(entry)).toBe('frontier')
    expect(withdrawn.reviewNeededConceptIds).toContain(CVC)
  })

  it('touches nothing it does not own', () => {
    const other = model({
      [BLENDS]: {
        state: 'solid',
        evidence: [
          { kind: 'quest', sourceId: 's1', note: 'mine', observedAt: LATER, readState: 'solid' },
        ],
        seededAt: NOW,
      },
    })
    const confirmed = applyCompletionCoverage(other, write([direct(CVC)]), NOW).model
    const withdrawn = withdrawCompletionCoverage(confirmed, 'fastPhonics:draft-1', LATER, 'mistake')
    expect(withdrawn.model.conceptStates[BLENDS]).toEqual(other.conceptStates[BLENDS])
  })
})

/**
 * A withdrawal may only rest on support that was actually ASSERTED (PR1900 P1).
 *
 * The defect: every active `curriculumPosition` ref was read as cap-strength
 * support. A Review-Chat `covered` action may propose `frontier` or `not-yet` —
 * the parser validates both and the writer honours them — so a completion that
 * promoted such a concept to `forming` and was then withdrawn left the concept
 * standing at `forming` on a claim that had never said more than "the edge".
 *
 * **Negative control for a reviewer:** make `coverageSupportedState` return
 * `COVERAGE_CAP` for every `curriculumPosition` ref (the pre-repair line) and the
 * first two cases below fail with `forming` — an unsupported state served as
 * settled, with no `completionReviewNeeded` flag to mark it.
 */
describe('withdrawal rests only on support that was actually asserted', () => {
  const coveredIn = (proposedState: ConceptStateKind) =>
    ({
      kind: 'covered',
      childId: 'c1',
      conceptId: CVC,
      source: 'Fast Phonics',
      unit: 'Peak 7',
      proposedState,
    }) as const

  const EARLY = '2026-08-20T00:00:00.000Z' // before the completion's own observation

  it('keeps a `frontier` manual claim at frontier — not at the coverage cap', () => {
    const covered = applyReviewActionToModel(model(), coveredIn('frontier'), NOW).model
    expect(covered.conceptStates[CVC].state).toBe('frontier')
    expect(covered.conceptStates[CVC].evidence.at(-1)!.coverageCeiling).toBe('frontier')

    const confirmed = applyCompletionCoverage(covered, write([direct(CVC)]), NOW).model
    expect(confirmed.conceptStates[CVC].state).toBe('forming')
    expect(refsOn(confirmed, CVC).at(-1)!.baselineState).toBe('frontier')

    const withdrawn = withdrawCompletionCoverage(confirmed, 'fastPhonics:draft-1', LATER, 'notComplete')
    const entry = withdrawn.model.conceptStates[CVC]
    expect(entry.state).toBe('frontier')
    // Reconstructable from two agreeing records (the claim and the baseline), so
    // there is nothing for a parent to settle.
    expect(entry.completionReviewNeeded).toBeFalsy()
    expect(withdrawn.revertedConceptIds).toContain(CVC)
    expect(effectiveConceptState(entry)).toBe('frontier')
  })

  it('keeps a `not-yet` manual claim at not-yet', () => {
    const covered = applyReviewActionToModel(model(), coveredIn('not-yet'), NOW).model
    const ref = covered.conceptStates[CVC].evidence.at(-1)!
    expect(covered.conceptStates[CVC].state).toBe('not-yet')
    // Withheld AND stamped: what the claim is worth is recorded either way.
    expect(ref.withheldReason).toBe('already-at-or-above')
    expect(ref.coverageCeiling).toBe('not-yet')

    const confirmed = applyCompletionCoverage(covered, write([direct(CVC)]), NOW).model
    expect(confirmed.conceptStates[CVC].state).toBe('forming')

    const withdrawn = withdrawCompletionCoverage(confirmed, 'fastPhonics:draft-1', LATER, 'notComplete')
    const entry = withdrawn.model.conceptStates[CVC]
    expect(entry.state).toBe('not-yet')
    expect(entry.completionReviewNeeded).toBeFalsy()
  })

  it('positive control: a `forming` manual claim DOES hold the cap after a withdrawal', () => {
    const confirmed = applyCompletionCoverage(model(), write([direct(CVC)]), NOW).model
    const covered = applyReviewActionToModel(confirmed, coveredIn('forming'), LATER).model
    const ref = covered.conceptStates[CVC].evidence.at(-1)!
    // It moved nothing — the completion had already raised the concept — and
    // that is exactly the claim a withdrawal must not discard.
    expect(ref.withheldReason).toBe('already-at-or-above')
    expect(ref.coverageCeiling).toBe('forming')

    const withdrawn = withdrawCompletionCoverage(covered, 'fastPhonics:draft-1', LATER, 'notComplete')
    expect(withdrawn.model.conceptStates[CVC].state).toBe('forming')
    expect(withdrawn.supportedConceptIds).toContain(CVC)
  })

  it('stamps what each coverage writer claims, §13-clamped', () => {
    const synced = applyBridgeCoverageToModel(
      model(),
      [{ conceptId: CVC, unitLabel: 'Peak 7' }],
      'fastPhonics',
      NOW,
      'scan',
    ).model
    // The position sync has no way to claim anything but the cap.
    expect(synced.conceptStates[CVC].evidence.at(-1)!.coverageCeiling).toBe('forming')

    const claimedSolid = applyReviewActionToModel(model(), coveredIn('solid'), NOW).model
    expect(claimedSolid.conceptStates[CVC].evidence.at(-1)!.coverageCeiling).toBe('forming')
    expect(claimedSolid.conceptStates[CVC].state).toBe('forming')
  })

  it('reverts to the recorded baseline for a legacy manual ref that recorded no claim', () => {
    // A `curriculumPosition` ref written before `coverageCeiling` existed: it may
    // have claimed anything, and nothing on it says which. The baseline is the
    // state the concept actually held while that very ref was on the entry, so
    // reverting to it neither invents cap support nor loses what the ref did.
    const legacy = model({
      [CVC]: {
        state: 'frontier',
        evidence: [
          {
            kind: 'curriculumPosition',
            sourceId: 'Fast Phonics',
            note: 'Covered in Fast Phonics Peak 7',
            observedAt: EARLY,
            source: 'Fast Phonics',
            via: 'manual',
          },
        ],
        seededAt: NOW,
      },
    })
    const before = legacy.conceptStates[CVC].evidence[0]
    const confirmed = applyCompletionCoverage(legacy, write([direct(CVC)]), NOW).model
    expect(confirmed.conceptStates[CVC].state).toBe('forming')

    const withdrawn = withdrawCompletionCoverage(confirmed, 'fastPhonics:draft-1', LATER, 'notComplete')
    const entry = withdrawn.model.conceptStates[CVC]
    expect(entry.state).toBe('frontier')
    expect(entry.completionReviewNeeded).toBeFalsy()
    expect(withdrawn.revertedConceptIds).toContain(CVC)
    // The old ref is read, never rewritten.
    expect(entry.evidence[0]).toEqual(before)
  })

  it('reads an unstamped ref by its PRODUCER, and a partial claim as nothing', () => {
    // The position sync's own writes (`positionSync`) could only ever have
    // claimed the cap, so a pre-stamp sync ref still supports `forming`; an
    // unstamped manual ref supports nothing, because nothing says what it said.
    expect(
      coverageSupportedState({ kind: 'curriculumPosition', positionSync: true }),
    ).toBe('forming')
    expect(coverageSupportedState({ kind: 'curriculumPosition' })).toBeUndefined()
    expect(
      coverageSupportedState({ kind: 'curriculumPosition', coverageCeiling: 'frontier' }),
    ).toBe('frontier')
    // Rule 1 still holds on the read side, whatever a ref carries.
    expect(
      coverageSupportedState({ kind: 'curriculumPosition', coverageCeiling: 'solid' }),
    ).toBe('forming')
    expect(
      coverageSupportedState({
        kind: 'curriculumPosition',
        coverageCeiling: 'forming',
        coverageQualifier: 'partial',
      }),
    ).toBeUndefined()
    // A completion claims the cap by construction, stamp or no stamp.
    expect(
      coverageSupportedState({
        kind: 'programCompletionCoverage',
        completionId: 'fastPhonics:other',
        withheldReason: 'already-at-or-above',
      }),
    ).toBe('forming')
  })

  it('takes the STRONGEST surviving claim, and a direct read still outranks all of them', () => {
    const claims = [
      { kind: 'curriculumPosition', coverageCeiling: 'frontier' },
      { kind: 'curriculumPosition', coverageCeiling: 'forming' },
    ]
    expect(survivingSupportedState({ evidence: claims }, 'fastPhonics:draft-1')).toBe('forming')
    expect(
      survivingSupportedState(
        { evidence: [...claims, { kind: 'eval', observedAt: EARLY, readState: 'frontier' }] },
        'fastPhonics:draft-1',
      ),
    ).toBe('frontier')
  })

  it('leaves a surviving direct read in control of the release, cap or no cap', () => {
    // Guard, not a change: a backdated completion (observed 1 Sep) withdrawn
    // while the only direct read was observed BEFORE it — so the "later direct
    // evidence governs" branch does not fire and the release recomputes. The
    // eval's own read decides, and the surviving `forming` workbook claim must
    // not raise the concept back over it.
    const confirmed = applyCompletionCoverage(model(), write([direct(CVC)]), NOW).model
    const synced = applyBridgeCoverageToModel(
      confirmed,
      [{ conceptId: CVC, unitLabel: 'Peak 7' }],
      'fastPhonics',
      NOW,
      'scan',
    ).model
    const evaluated = applyEvalFindingsToModel(
      synced,
      [{ conceptId: CVC, state: 'frontier', note: 'backdated eval read' }],
      'sess-2',
      EARLY,
    ).model
    expect(evaluated.conceptStates[CVC].state).toBe('frontier')

    const withdrawn = withdrawCompletionCoverage(evaluated, 'fastPhonics:draft-1', LATER, 'mistake')
    expect(withdrawn.model.conceptStates[CVC].state).toBe('frontier')
    expect(withdrawn.directlyGovernedConceptIds).not.toContain(CVC)
  })

  it('rewrites no history: the claim is untouched and the released refs are kept, marked', () => {
    const covered = applyReviewActionToModel(model(), coveredIn('frontier'), NOW).model
    const confirmed = applyCompletionCoverage(covered, write([direct(CVC)]), NOW).model
    const claimBefore = refsOn(confirmed, CVC).find((r) => r.kind === 'curriculumPosition')

    const withdrawn = withdrawCompletionCoverage(confirmed, 'fastPhonics:draft-1', LATER, 'notComplete')
    const after = refsOn(withdrawn.model, CVC)
    expect(after).toHaveLength(refsOn(confirmed, CVC).length) // nothing deleted
    expect(after.find((r) => r.kind === 'curriculumPosition')).toEqual(claimBefore)

    const ours = after.find((r) => r.kind === 'programCompletionCoverage')!
    expect(ours.status).toBe('superseded')
    expect(ours.supersededAt).toBe(LATER)
    expect(ours.supersededReason).toBe('notComplete')
    // What the confirmation claimed in October stays readable afterwards.
    expect(ours.baselineState).toBe('frontier')
    expect(ours.readState).toBe('forming')
  })
})

describe('withdrawal after a quest (PR1900 round3)', () => {
  it.each([{ correct: 1, total: 2 }, { correct: 1, total: 1 }])('does not retain completion promotion for an insufficient result: %j', (score) => {
    const confirmed = applyCompletionCoverage(model(), write([direct(CVC)]), NOW).model
    const quest = applyQuestResultsToModel(confirmed, [{ conceptId: CVC, ...score }], 'quest-test', LATER).model
    expect(quest.conceptStates[CVC].state).toBe('forming')
    expect(quest.conceptStates[CVC].evidence.at(-1)!.readState).toBeUndefined()
    const withdrawn = withdrawCompletionCoverage(quest, 'fastPhonics:draft-1', LATER, 'mistake')
    expect(withdrawn.model.conceptStates[CVC].state).toBe('not-yet')
    expect(withdrawn.directlyGovernedConceptIds).not.toContain(CVC)
    expect(withdrawn.model.conceptStates[CVC].evidence.at(-1)).toEqual(quest.conceptStates[CVC].evidence.at(-1))
  })

  it('retains a successful quest state independently of completion', () => {
    const confirmed = applyCompletionCoverage(model(), write([direct(CVC)]), NOW).model
    const quest = applyQuestResultsToModel(confirmed, [{ conceptId: CVC, correct: 2, total: 2 }], 'quest-pass', LATER).model
    expect(quest.conceptStates[CVC].evidence.at(-1)!.readState).toBe('solid')
    const withdrawn = withdrawCompletionCoverage(quest, 'fastPhonics:draft-1', LATER, 'mistake')
    expect(withdrawn.model.conceptStates[CVC].state).toBe('solid')
    expect(withdrawn.directlyGovernedConceptIds).toContain(CVC)
  })

  it('keeps ambiguity after a failed quest and settles it only with a qualifying result', () => {
    const uncertain = model({ [CVC]: { state: 'forming', evidence: [], completionReviewNeeded: true, seededAt: NOW } })
    const failed = applyQuestResultsToModel(uncertain, [{ conceptId: CVC, correct: 0, total: 2 }], 'quest-fail', LATER).model
    expect(failed.conceptStates[CVC].completionReviewNeeded).toBe(true)
    const passed = applyQuestResultsToModel(failed, [{ conceptId: CVC, correct: 2, total: 2 }], 'quest-pass', LATER).model
    expect(passed.conceptStates[CVC].completionReviewNeeded).toBe(false)
  })

  it('does not hide surviving independent coverage behind an unvalued quest', () => {
    const first = applyCompletionCoverage(model(), write([direct(CVC)]), NOW).model
    const second = applyCompletionCoverage(first, write([direct(CVC)], 1, 'independent'), NOW).model
    const quest = applyQuestResultsToModel(second, [{ conceptId: CVC, correct: 0, total: 2 }], 'quest-fail', LATER).model
    const withdrawn = withdrawCompletionCoverage(quest, 'fastPhonics:draft-1', LATER, 'mistake')
    expect(withdrawn.model.conceptStates[CVC].state).toBe('forming')
    expect(withdrawn.supportedConceptIds).toContain(CVC)
    expect(withdrawn.directlyGovernedConceptIds).not.toContain(CVC)
  })

  it('uses a later recorded lower direct read rather than a stale stored state', () => {
    const confirmed = applyCompletionCoverage(model(), write([direct(CVC)]), NOW).model
    confirmed.conceptStates[CVC].evidence.push({ kind: 'eval', sourceId: 'eval-later', readState: 'frontier', observedAt: LATER, note: 'Direct read' })
    const withdrawn = withdrawCompletionCoverage(confirmed, 'fastPhonics:draft-1', LATER, 'mistake')
    expect(withdrawn.model.conceptStates[CVC].state).toBe('frontier')
    expect(withdrawn.model.changeFeed.at(-1)).toMatchObject({ from: 'forming', to: 'frontier' })
    expect(withdrawn.directlyGovernedConceptIds).toContain(CVC)
  })
})

/**
 * A legacy ambiguity is not a permanent one (finding 4304724649).
 *
 * The defect: an entry left at `forming` with `completionReviewNeeded` by an
 * unreconstructable withdrawal went on being read at `frontier` even after a
 * NEW confirmation's reviewed mapping covered the same concept `direct`. That
 * claim is withheld — the stored state is already at the coverage cap, so there
 * is nothing to promote — and the old reader asked only "is the flag set?", so a
 * current, independent, cap-strength claim counted for nothing.
 *
 * The repair stores no new field and clears no flag: the review ceiling is
 * DERIVED from the live refs (`completionReviewCeiling`), which is also what
 * makes the reverse true — superseding that claim restores the uncertainty by
 * itself, with no baseline, `readState` or provenance invented to carry the
 * `forming` through. The release's own flag-clearing is narrowed to the one
 * branch that earns it (a direct observation), pinned by the last two cases.
 *
 * **Negative control for a reviewer:** restore `effectiveConceptState` to the
 * flat `COVERAGE_REVIEW_CEILING` cap (`return rank[state] > rank[frontier] ?
 * frontier : state`) and the first case below fails on the fresh confirmation's
 * `forming`; drop the flag on apply instead and the same case fails on the
 * withdrawal's `frontier`.
 */
describe('fresh coverage on an entry still under completion review', () => {
  /** A real pre-FEAT-242 ref: it owned the promotion and recorded no baseline. */
  const legacyModel = (state: ConceptStateKind = 'forming'): LearnerModel =>
    model({
      [CVC]: {
        state,
        evidence: [
          {
            kind: 'programCompletionCoverage',
            sourceId: 'fastPhonics:old',
            note: 'legacy',
            observedAt: OBSERVED,
            completionId: 'fastPhonics:old',
            promoted: true,
          },
        ],
        seededAt: NOW,
      },
    })

  /** The withdrawal that can only flag, plus the state it leaves behind. */
  function flagged(state: ConceptStateKind = 'forming'): LearnerModel {
    const withdrawn = withdrawCompletionCoverage(legacyModel(state), 'fastPhonics:old', LATER, 'mistake')
    expect(withdrawn.reviewNeededConceptIds).toContain(CVC)
    expect(withdrawn.model.conceptStates[CVC].completionReviewNeeded).toBe(true)
    return withdrawn.model
  }

  const freshRef = (m: LearnerModel, completionId: string): EvidenceRef =>
    refsOn(m, CVC).filter((r) => r.completionId === completionId).at(-1)!

  it('reads the ambiguous state at the edge, at the fresh claim, then at the edge again', () => {
    const uncertain = flagged()
    const legacyBefore = refsOn(uncertain, CVC)[0]
    expect(effectiveConceptState(uncertain.conceptStates[CVC])).toBe('frontier')
    expect(completionReviewSupported(uncertain.conceptStates[CVC])).toBe(false)

    // A fresh confirmation covers the same concept `direct`. It promotes nothing
    // — the stored state is already at the cap — and that is the whole point.
    const confirmed = applyCompletionCoverage(uncertain, write([direct(CVC)], 1, 'fastPhonics:fresh'), LATER)
    const entry = confirmed.model.conceptStates[CVC]
    const fresh = freshRef(confirmed.model, 'fastPhonics:fresh')
    expect(fresh.promoted).toBe(false)
    expect(fresh.ownsPromotion).toBe(false)
    expect(fresh.withheldReason).toBe('already-at-or-above')
    // Nothing is fabricated to carry the reading: no state anybody read, and a
    // baseline that is only the state actually found on the entry.
    expect(fresh.readState).toBeUndefined()
    expect(fresh.baselineState).toBe('forming')
    expect(confirmed.promotedConceptIds).not.toContain(CVC)
    // The record of the ambiguity stands — the flag is NOT cleared by a
    // statement about material — while the read now follows the live claim.
    expect(entry.state).toBe('forming')
    expect(entry.completionReviewNeeded).toBe(true)
    expect(completionReviewCeiling(entry)).toBe('forming')
    expect(effectiveConceptState(entry)).toBe('forming')
    expect(completionReviewSupported(entry)).toBe(true)
    // ...and the legacy ref is read, never rewritten.
    expect(refsOn(confirmed.model, CVC)[0]).toEqual(legacyBefore)

    // Withdrawing the fresh claim puts the uncertainty back, by itself.
    const withdrawn = withdrawCompletionCoverage(confirmed.model, 'fastPhonics:fresh', LATER, 'notComplete')
    const after = withdrawn.model.conceptStates[CVC]
    expect(after.state).toBe('forming') // history still not rewritten
    expect(after.completionReviewNeeded).toBe(true)
    expect(effectiveConceptState(after)).toBe('frontier')
    expect(completionReviewSupported(after)).toBe(false)
    expect(freshRef(withdrawn.model, 'fastPhonics:fresh').status).toBe('superseded')
    expect(refsOn(withdrawn.model, CVC)[0]).toEqual(legacyBefore)
    // Nothing was reverted or promoted: the claim never held this promotion.
    expect(withdrawn.revertedConceptIds).not.toContain(CVC)
    expect(withdrawn.supportedConceptIds).not.toContain(CVC)
  })

  it('keeps the claim and its provenance across a re-apply and a mapping upgrade', () => {
    const confirmed = applyCompletionCoverage(flagged(), write([direct(CVC)], 1, 'fastPhonics:fresh'), LATER).model
    const again = applyCompletionCoverage(confirmed, write([direct(CVC)], 1, 'fastPhonics:fresh'), LATER).model
    // Idempotent: the retry replaced its own ref rather than appending one.
    expect(refsOn(again, CVC)).toHaveLength(refsOn(confirmed, CVC).length)
    expect(effectiveConceptState(again.conceptStates[CVC])).toBe('forming')

    const v2 = applyCompletionCoverage(again, write([direct(CVC)], 2, 'fastPhonics:fresh'), LATER).model
    const refs = refsOn(v2, CVC).filter((r) => r.completionId === 'fastPhonics:fresh')
    expect(refs.map((r) => [r.mappingVersion, r.status])).toEqual([
      [1, 'superseded'],
      [2, 'active'],
    ])
    // The re-curation is visible and the stamps never drift upward.
    for (const ref of refs) {
      expect(ref.baselineState).toBe('forming')
      expect(ref.ownsPromotion).toBe(false)
      expect(ref.readState).toBeUndefined()
    }
    expect(v2.conceptStates[CVC].completionReviewNeeded).toBe(true)
    expect(effectiveConceptState(v2.conceptStates[CVC])).toBe('forming')

    const withdrawn = withdrawCompletionCoverage(v2, 'fastPhonics:fresh', LATER, 'notComplete')
    expect(effectiveConceptState(withdrawn.model.conceptStates[CVC])).toBe('frontier')
  })

  it('is not resolved by a partial claim, nor by a quest that read nothing', () => {
    const partialClaim = applyCompletionCoverage(flagged(), write([partial(CVC)], 1, 'fastPhonics:fresh'), LATER).model
    const entry = partialClaim.conceptStates[CVC]
    expect(refsOn(partialClaim, CVC).at(-1)!.coverageQualifier).toBe('partial')
    // A claim that stands for part of the concept supports no state (rule 3).
    expect(completionReviewCeiling(entry)).toBe('frontier')
    expect(effectiveConceptState(entry)).toBe('frontier')

    const failed = applyQuestResultsToModel(partialClaim, [{ conceptId: CVC, correct: 0, total: 2 }], 'quest-fail', LATER).model
    expect(failed.conceptStates[CVC].completionReviewNeeded).toBe(true)
    expect(effectiveConceptState(failed.conceptStates[CVC])).toBe('frontier')
  })

  it('lets a later direct observation prevail over the fresh claim', () => {
    const confirmed = applyCompletionCoverage(flagged(), write([direct(CVC)], 1, 'fastPhonics:fresh'), LATER).model
    expect(effectiveConceptState(confirmed.conceptStates[CVC])).toBe('forming')

    // A live direct read of the CHILD outranks any statement about material,
    // including this one — the same precedence a release uses.
    confirmed.conceptStates[CVC].evidence.push({
      kind: 'eval', sourceId: 'eval-later', readState: 'frontier', observedAt: LATER, note: 'Direct read',
    })
    expect(completionReviewCeiling(confirmed.conceptStates[CVC])).toBe('frontier')
    expect(effectiveConceptState(confirmed.conceptStates[CVC])).toBe('frontier')

    // And the real eval path settles the basis outright, flag included.
    const evaluated = applyEvalFindingsToModel(
      confirmed,
      [{ conceptId: CVC, state: 'frontier', note: 'calibrated read' }],
      'sess-fresh',
      LATER,
    ).model
    expect(evaluated.conceptStates[CVC].state).toBe('frontier')
    expect(evaluated.conceptStates[CVC].completionReviewNeeded).toBe(false)
  })

  it('survives either withdrawal order when two confirmations overlap', () => {
    const both = applyCompletionCoverage(
      applyCompletionCoverage(flagged(), write([direct(CVC)], 1, 'fastPhonics:fresh-a'), LATER).model,
      write([direct(CVC)], 1, 'fastPhonics:fresh-b'),
      LATER,
    ).model

    for (const [first, second] of [
      ['fastPhonics:fresh-a', 'fastPhonics:fresh-b'],
      ['fastPhonics:fresh-b', 'fastPhonics:fresh-a'],
    ]) {
      const one = withdrawCompletionCoverage(both, first, LATER, 'notComplete').model
      const survivor = freshRef(one, second)
      // The other claim stands on its own, at the strength IT asserted...
      expect(survivor.status).not.toBe('superseded')
      expect(survivor.baselineState).toBe('forming')
      expect(survivor.ownsPromotion).toBe(false)
      expect(one.conceptStates[CVC].state).toBe('forming')
      expect(one.conceptStates[CVC].completionReviewNeeded).toBe(true)
      expect(effectiveConceptState(one.conceptStates[CVC])).toBe('forming')

      // ...and only when both are gone does the uncertainty come back.
      const none = withdrawCompletionCoverage(one, second, LATER, 'notComplete').model
      expect(none.conceptStates[CVC].state).toBe('forming')
      expect(none.conceptStates[CVC].completionReviewNeeded).toBe(true)
      expect(effectiveConceptState(none.conceptStates[CVC])).toBe('frontier')
    }
  })

  it('never lets coverage read an uncertain solid as solid', () => {
    const confirmed = applyCompletionCoverage(flagged('solid'), write([direct(CVC)], 1, 'fastPhonics:fresh'), LATER).model
    const entry = confirmed.conceptStates[CVC]
    expect(entry.state).toBe('solid') // the record is untouched
    // Coverage caps at `forming` (rule 1), so the strongest thing it can lift an
    // uncertain entry to is `forming` — mastery is never inferred from material.
    expect(completionReviewCeiling(entry)).toBe('forming')
    expect(effectiveConceptState(entry)).toBe('forming')
    // Coverage does not reach the stored `solid`, so nothing is "standing
    // behind" this reading and the cautious wording is still the true one.
    expect(completionReviewSupported(entry)).toBe(false)
  })

  it('keeps the open review when a release only reverts to its own baseline', () => {
    // The flagged state here is `frontier` — low enough for a fresh
    // confirmation to actually promote it — so the release takes the `reverted`
    // branch rather than the evidence-only one. Reverting to the baseline the
    // confirmation itself recorded answers "where was this concept?", not "was
    // the withdrawn basis sound?", so the flag must survive: clearing it there
    // would retire an open question nobody had answered.
    const uncertain = flagged('frontier')
    const confirmed = applyCompletionCoverage(uncertain, write([direct(CVC)], 1, 'fastPhonics:fresh'), LATER)
    const fresh = freshRef(confirmed.model, 'fastPhonics:fresh')
    expect(fresh.promoted).toBe(true)
    expect(fresh.baselineState).toBe('frontier')
    expect(confirmed.model.conceptStates[CVC].state).toBe('forming')
    expect(confirmed.model.conceptStates[CVC].completionReviewNeeded).toBe(true)
    expect(effectiveConceptState(confirmed.model.conceptStates[CVC])).toBe('forming')

    const withdrawn = withdrawCompletionCoverage(confirmed.model, 'fastPhonics:fresh', LATER, 'notComplete')
    const after = withdrawn.model.conceptStates[CVC]
    expect(withdrawn.revertedConceptIds).toContain(CVC)
    expect(after.state).toBe('frontier')
    expect(after.completionReviewNeeded).toBe(true)
    expect(effectiveConceptState(after)).toBe('frontier')
    expect(completionReviewSupported(after)).toBe(false)
  })

  it('still lets a direct observation close the review on release', () => {
    // The one thing that DOES settle it: a direct read of the child made after
    // the confirmation's own observation. Unchanged by this repair, pinned here
    // so the narrowing above cannot quietly become "nothing ever clears it".
    const confirmed = applyCompletionCoverage(flagged('frontier'), write([direct(CVC)], 1, 'fastPhonics:fresh'), LATER).model
    confirmed.conceptStates[CVC].evidence.push({
      kind: 'eval', sourceId: 'eval-later', readState: 'frontier', observedAt: LATER, note: 'Direct read',
    })
    const withdrawn = withdrawCompletionCoverage(confirmed, 'fastPhonics:fresh', LATER, 'notComplete')
    expect(withdrawn.directlyGovernedConceptIds).toContain(CVC)
    expect(withdrawn.model.conceptStates[CVC].state).toBe('frontier')
    expect(withdrawn.model.conceptStates[CVC].completionReviewNeeded).toBe(false)
  })
})
