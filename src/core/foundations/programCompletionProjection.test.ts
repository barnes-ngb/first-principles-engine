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
import { effectiveConceptState } from '../../../functions/src/shared/foundations/completionCoverage'
import type { CompletionCoverageTarget } from './fastPhonicsCompletion'
import type { ConceptStateEntry, EvidenceRef, LearnerModel } from '../types/learnerModel'

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
