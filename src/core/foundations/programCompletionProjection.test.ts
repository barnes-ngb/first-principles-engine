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
import { applyReviewActionToModel } from '../../features/foundations-review/foundationsReviewActions'
import {
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
