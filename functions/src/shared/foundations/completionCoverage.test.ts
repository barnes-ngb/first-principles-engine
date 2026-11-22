import { describe, expect, it } from 'vitest'

import {
  PROGRAM_COMPLETION_COVERAGE,
  CURRICULUM_POSITION_COVERAGE,
  EvidenceRefStatus,
  CoverageQualifier,
  COVERAGE_STATE_RANK,
  COVERAGE_CAP,
  COVERAGE_REVIEW_CEILING,
  ATTESTATION_EVIDENCE,
  EVAL_EVIDENCE,
  GOVERNING_DIRECT_KINDS,
  isActiveEvidence,
  activeEvidence,
  isGoverningDirectKind,
  governingDirectEvidence,
  governingDirectRead,
  pendingAttestationFreeze,
  acceptedDirectRead,
  CoverageWithheldReason,
  coveragePromotion,
  completionReviewNeeded,
  completionReviewCeiling,
  effectiveConceptState,
  completionReviewSupported,
  effectiveConceptStates,
  isCompletionCoverageRef,
  activeCompletionRefsFor,
  completionRefsFor,
  coverageSupportedState,
  survivingSupportedState,
  asCoverageState,
} from './completionCoverage.js'

import type {
  CoverageState,
  CoverageEntryLike,
  CoverageEvidenceLike,
} from './completionCoverage.js'

// ─── helpers ─────────────────────────────────────────────────────────────────

function ref(overrides: Partial<CoverageEvidenceLike> = {}): CoverageEvidenceLike {
  return { kind: 'quest', ...overrides }
}

function completionRef(overrides: Partial<CoverageEvidenceLike> = {}): CoverageEvidenceLike {
  return { kind: PROGRAM_COMPLETION_COVERAGE, completionId: 'comp-1', ...overrides }
}

function positionRef(overrides: Partial<CoverageEvidenceLike> = {}): CoverageEvidenceLike {
  return { kind: CURRICULUM_POSITION_COVERAGE, ...overrides }
}

function entry(overrides: Partial<CoverageEntryLike> = {}): CoverageEntryLike {
  return { state: 'not-yet', ...overrides }
}

// ─── constants ───────────────────────────────────────────────────────────────

describe('constants', () => {
  it('COVERAGE_CAP is forming', () => {
    expect(COVERAGE_CAP).toBe('forming')
  })

  it('COVERAGE_REVIEW_CEILING is frontier', () => {
    expect(COVERAGE_REVIEW_CEILING).toBe('frontier')
  })

  it('COVERAGE_STATE_RANK orders not-yet < frontier < forming < solid', () => {
    expect(COVERAGE_STATE_RANK['not-yet']).toBeLessThan(COVERAGE_STATE_RANK.frontier)
    expect(COVERAGE_STATE_RANK.frontier).toBeLessThan(COVERAGE_STATE_RANK.forming)
    expect(COVERAGE_STATE_RANK.forming).toBeLessThan(COVERAGE_STATE_RANK.solid)
  })

  it('GOVERNING_DIRECT_KINDS includes attestation, eval and quest', () => {
    expect(GOVERNING_DIRECT_KINDS).toContain(ATTESTATION_EVIDENCE)
    expect(GOVERNING_DIRECT_KINDS).toContain(EVAL_EVIDENCE)
    expect(GOVERNING_DIRECT_KINDS).toContain('quest')
  })
})

// ─── asCoverageState ─────────────────────────────────────────────────────────

describe('asCoverageState', () => {
  it.each(['solid', 'forming', 'frontier', 'not-yet'] as CoverageState[])(
    'accepts %s',
    (state) => {
      expect(asCoverageState(state)).toBe(state)
    },
  )

  it('rejects undefined', () => {
    expect(asCoverageState(undefined)).toBeUndefined()
  })

  it('rejects arbitrary strings', () => {
    expect(asCoverageState('mastered')).toBeUndefined()
    expect(asCoverageState('')).toBeUndefined()
  })
})

// ─── isActiveEvidence ────────────────────────────────────────────────────────

describe('isActiveEvidence', () => {
  it('returns true for a ref with no status (pre-FEAT-242)', () => {
    expect(isActiveEvidence(ref())).toBe(true)
  })

  it('returns true for an explicitly active ref', () => {
    expect(isActiveEvidence(ref({ status: EvidenceRefStatus.Active }))).toBe(true)
  })

  it('returns false for a superseded ref', () => {
    expect(isActiveEvidence(ref({ status: EvidenceRefStatus.Superseded }))).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isActiveEvidence(undefined)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isActiveEvidence(null)).toBe(false)
  })
})

// ─── activeEvidence ──────────────────────────────────────────────────────────

describe('activeEvidence', () => {
  it('filters out superseded refs', () => {
    const refs = [
      ref({ kind: 'quest', observedAt: '2026-01-01' }),
      ref({ kind: 'eval', status: EvidenceRefStatus.Superseded }),
      ref({ kind: 'attestation', observedAt: '2026-01-02' }),
    ]
    const result = activeEvidence(refs)
    expect(result).toHaveLength(2)
    expect(result[0].kind).toBe('quest')
    expect(result[1].kind).toBe('attestation')
  })

  it('returns empty array for undefined', () => {
    expect(activeEvidence(undefined)).toEqual([])
  })

  it('returns empty array for empty array', () => {
    expect(activeEvidence([])).toEqual([])
  })

  it('preserves the original ref type (generic)', () => {
    const richer = [{ kind: 'quest', extra: 42 }]
    const result = activeEvidence(richer)
    expect(result[0]).toHaveProperty('extra', 42)
  })
})

// ─── isGoverningDirectKind ───────────────────────────────────────────────────

describe('isGoverningDirectKind', () => {
  it('returns true for attestation', () => {
    expect(isGoverningDirectKind(ATTESTATION_EVIDENCE)).toBe(true)
  })

  it('returns true for eval', () => {
    expect(isGoverningDirectKind(EVAL_EVIDENCE)).toBe(true)
  })

  it('returns true for quest', () => {
    expect(isGoverningDirectKind('quest')).toBe(true)
  })

  it('returns false for coverage kinds', () => {
    expect(isGoverningDirectKind(PROGRAM_COMPLETION_COVERAGE)).toBe(false)
    expect(isGoverningDirectKind(CURRICULUM_POSITION_COVERAGE)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isGoverningDirectKind(undefined)).toBe(false)
  })
})

// ─── governingDirectEvidence ─────────────────────────────────────────────────

describe('governingDirectEvidence', () => {
  it('returns the latest active direct ref', () => {
    const e = entry({
      evidence: [
        ref({ kind: 'quest', observedAt: '2026-01-01' }),
        ref({ kind: 'eval', observedAt: '2026-01-05' }),
        ref({ kind: 'attestation', observedAt: '2026-01-03' }),
      ],
    })
    expect(governingDirectEvidence(e)?.kind).toBe('eval')
  })

  it('ignores superseded refs', () => {
    const e = entry({
      evidence: [
        ref({ kind: 'eval', observedAt: '2026-01-05', status: EvidenceRefStatus.Superseded }),
        ref({ kind: 'quest', observedAt: '2026-01-01' }),
      ],
    })
    expect(governingDirectEvidence(e)?.kind).toBe('quest')
  })

  it('ignores non-direct kinds', () => {
    const e = entry({
      evidence: [
        positionRef({ observedAt: '2026-01-10' }),
        completionRef({ observedAt: '2026-01-10' }),
      ],
    })
    expect(governingDirectEvidence(e)).toBeUndefined()
  })

  it('returns undefined for empty evidence', () => {
    expect(governingDirectEvidence(entry())).toBeUndefined()
    expect(governingDirectEvidence(undefined)).toBeUndefined()
  })

  it('filters by sinceIso', () => {
    const e = entry({
      evidence: [
        ref({ kind: 'quest', observedAt: '2026-01-01' }),
        ref({ kind: 'eval', observedAt: '2026-01-05' }),
      ],
    })
    const result = governingDirectEvidence(e, '2026-01-03')
    expect(result?.kind).toBe('eval')
    expect(result?.observedAt).toBe('2026-01-05')
  })

  it('sinceIso is strictly-after (not equal)', () => {
    const e = entry({
      evidence: [ref({ kind: 'quest', observedAt: '2026-01-05' })],
    })
    expect(governingDirectEvidence(e, '2026-01-05')).toBeUndefined()
  })

  it('a ref with no observedAt is older than any stamp', () => {
    const e = entry({
      evidence: [ref({ kind: 'quest' })],
    })
    expect(governingDirectEvidence(e, '2020-01-01')).toBeUndefined()
  })
})

// ─── governingDirectRead ─────────────────────────────────────────────────────

describe('governingDirectRead', () => {
  it('returns the latest active direct ref that read a state', () => {
    const e = entry({
      evidence: [
        ref({ kind: 'eval', observedAt: '2026-01-05', readState: 'forming' }),
        ref({ kind: 'quest', observedAt: '2026-01-10' }),
      ],
    })
    // The quest at 01-10 has no readState, so the eval at 01-05 wins
    expect(governingDirectRead(e)?.kind).toBe('eval')
    expect(governingDirectRead(e)?.readState).toBe('forming')
  })

  it('ignores refs with no readState', () => {
    const e = entry({
      evidence: [ref({ kind: 'quest', observedAt: '2026-01-10' })],
    })
    expect(governingDirectRead(e)).toBeUndefined()
  })

  it('ignores refs with invalid readState', () => {
    const e = entry({
      evidence: [ref({ kind: 'eval', observedAt: '2026-01-05', readState: 'bogus' })],
    })
    expect(governingDirectRead(e)).toBeUndefined()
  })

  it('later read beats earlier read', () => {
    const e = entry({
      evidence: [
        ref({ kind: 'eval', observedAt: '2026-01-01', readState: 'solid' }),
        ref({ kind: 'quest', observedAt: '2026-01-10', readState: 'frontier' }),
      ],
    })
    expect(governingDirectRead(e)?.readState).toBe('frontier')
  })

  it('returns undefined for empty / undefined', () => {
    expect(governingDirectRead(entry())).toBeUndefined()
    expect(governingDirectRead(undefined)).toBeUndefined()
  })
})

// ─── pendingAttestationFreeze ────────────────────────────────────────────────

describe('pendingAttestationFreeze', () => {
  it('returns the active attestation ref when needsReconcile is true', () => {
    const e = {
      state: 'forming' as CoverageState,
      needsReconcile: true,
      evidence: [
        ref({ kind: ATTESTATION_EVIDENCE, observedAt: '2026-01-01', readState: 'solid' }),
        ref({ kind: EVAL_EVIDENCE, observedAt: '2026-01-05', readState: 'frontier' }),
      ],
    }
    const frozen = pendingAttestationFreeze(e)
    expect(frozen?.kind).toBe(ATTESTATION_EVIDENCE)
  })

  it('returns undefined when needsReconcile is false', () => {
    const e = {
      state: 'forming' as CoverageState,
      needsReconcile: false,
      evidence: [
        ref({ kind: ATTESTATION_EVIDENCE, observedAt: '2026-01-01' }),
      ],
    }
    expect(pendingAttestationFreeze(e)).toBeUndefined()
  })

  it('returns undefined when needsReconcile is absent', () => {
    const e = entry({
      evidence: [ref({ kind: ATTESTATION_EVIDENCE, observedAt: '2026-01-01' })],
    })
    expect(pendingAttestationFreeze(e)).toBeUndefined()
  })

  it('returns undefined when attestation is superseded', () => {
    const e = {
      state: 'forming' as CoverageState,
      needsReconcile: true,
      evidence: [
        ref({ kind: ATTESTATION_EVIDENCE, status: EvidenceRefStatus.Superseded }),
      ],
    }
    expect(pendingAttestationFreeze(e)).toBeUndefined()
  })

  it('returns undefined for empty entry', () => {
    expect(pendingAttestationFreeze(undefined)).toBeUndefined()
  })
})

// ─── acceptedDirectRead ──────────────────────────────────────────────────────

describe('acceptedDirectRead', () => {
  it('delegates to governingDirectRead when no attestation freeze', () => {
    const e = entry({
      evidence: [
        ref({ kind: 'eval', observedAt: '2026-01-05', readState: 'frontier' }),
      ],
    })
    expect(acceptedDirectRead(e)?.readState).toBe('frontier')
  })

  it('excludes eval refs during attestation freeze', () => {
    const e: CoverageEntryLike = {
      state: 'forming',
      needsReconcile: true,
      evidence: [
        ref({ kind: ATTESTATION_EVIDENCE, observedAt: '2026-01-01', readState: 'solid' }),
        ref({ kind: EVAL_EVIDENCE, observedAt: '2026-01-05', readState: 'frontier' }),
      ],
    }
    // The eval is frozen, so the attestation's own readState should govern
    const result = acceptedDirectRead(e)
    expect(result?.kind).toBe(ATTESTATION_EVIDENCE)
    expect(result?.readState).toBe('solid')
  })

  it('allows quest reads during attestation freeze', () => {
    const e: CoverageEntryLike = {
      state: 'forming',
      needsReconcile: true,
      evidence: [
        ref({ kind: ATTESTATION_EVIDENCE, observedAt: '2026-01-01', readState: 'solid' }),
        ref({ kind: EVAL_EVIDENCE, observedAt: '2026-01-05', readState: 'frontier' }),
        ref({ kind: 'quest', observedAt: '2026-01-10', readState: 'forming' }),
      ],
    }
    const result = acceptedDirectRead(e)
    expect(result?.kind).toBe('quest')
    expect(result?.readState).toBe('forming')
  })

  it('respects sinceIso', () => {
    const e = entry({
      evidence: [
        ref({ kind: 'eval', observedAt: '2026-01-05', readState: 'frontier' }),
      ],
    })
    expect(acceptedDirectRead(e, '2026-01-06')).toBeUndefined()
  })
})

// ─── isCompletionCoverageRef ─────────────────────────────────────────────────

describe('isCompletionCoverageRef', () => {
  it('returns true for program completion coverage', () => {
    expect(isCompletionCoverageRef(completionRef())).toBe(true)
  })

  it('returns false for curriculum position', () => {
    expect(isCompletionCoverageRef(positionRef())).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isCompletionCoverageRef(undefined)).toBe(false)
  })
})

// ─── activeCompletionRefsFor ─────────────────────────────────────────────────

describe('activeCompletionRefsFor', () => {
  it('returns active completion refs for a specific completionId', () => {
    const e = entry({
      evidence: [
        completionRef({ completionId: 'comp-1' }),
        completionRef({ completionId: 'comp-2' }),
        completionRef({ completionId: 'comp-1', status: EvidenceRefStatus.Superseded }),
      ],
    })
    const result = activeCompletionRefsFor(e, 'comp-1')
    expect(result).toHaveLength(1)
    expect(result[0].completionId).toBe('comp-1')
  })

  it('returns empty for no match', () => {
    expect(activeCompletionRefsFor(entry(), 'comp-99')).toEqual([])
  })

  it('returns empty for undefined entry', () => {
    expect(activeCompletionRefsFor(undefined, 'comp-1')).toEqual([])
  })
})

// ─── completionRefsFor ───────────────────────────────────────────────────────

describe('completionRefsFor', () => {
  it('returns ALL refs (active + superseded) for a completionId', () => {
    const e = entry({
      evidence: [
        completionRef({ completionId: 'comp-1' }),
        completionRef({ completionId: 'comp-1', status: EvidenceRefStatus.Superseded }),
        completionRef({ completionId: 'comp-2' }),
      ],
    })
    const result = completionRefsFor(e, 'comp-1')
    expect(result).toHaveLength(2)
  })

  it('returns empty for undefined entry', () => {
    expect(completionRefsFor(undefined, 'comp-1')).toEqual([])
  })
})

// ─── coveragePromotion ───────────────────────────────────────────────────────

describe('coveragePromotion', () => {
  it('promotes not-yet to forming (the cap) by default', () => {
    const result = coveragePromotion(entry({ state: 'not-yet' }))
    expect(result.state).toBe('forming')
    expect(result.promoted).toBe(true)
    expect(result.priorState).toBe('not-yet')
    expect(result.withheldReason).toBeUndefined()
  })

  it('promotes frontier to forming', () => {
    const result = coveragePromotion(entry({ state: 'frontier' }))
    expect(result.state).toBe('forming')
    expect(result.promoted).toBe(true)
    expect(result.priorState).toBe('frontier')
  })

  it('caps proposed solid at forming (rule 1)', () => {
    const result = coveragePromotion(entry({ state: 'not-yet' }), CoverageQualifier.Direct, 'solid')
    expect(result.state).toBe('forming')
    expect(result.promoted).toBe(true)
  })

  it('honours a proposed state below the cap', () => {
    const result = coveragePromotion(
      entry({ state: 'not-yet' }),
      CoverageQualifier.Direct,
      'frontier',
    )
    expect(result.state).toBe('frontier')
    expect(result.promoted).toBe(true)
  })

  it('withholds partial coverage (rule 3)', () => {
    const result = coveragePromotion(entry({ state: 'not-yet' }), CoverageQualifier.Partial)
    expect(result.state).toBe('not-yet')
    expect(result.promoted).toBe(false)
    expect(result.withheldReason).toBe(CoverageWithheldReason.PartialQualifier)
  })

  it('withholds when already at or above the ceiling (rule 1)', () => {
    const result = coveragePromotion(entry({ state: 'forming' }))
    expect(result.state).toBe('forming')
    expect(result.promoted).toBe(false)
    expect(result.withheldReason).toBe(CoverageWithheldReason.AlreadyAtOrAbove)
  })

  it('withholds when solid (above cap)', () => {
    const result = coveragePromotion(entry({ state: 'solid' }))
    expect(result.state).toBe('solid')
    expect(result.promoted).toBe(false)
    expect(result.withheldReason).toBe(CoverageWithheldReason.AlreadyAtOrAbove)
  })

  it('withholds when direct evidence governs (rule 2)', () => {
    const e = entry({
      state: 'frontier',
      evidence: [ref({ kind: 'eval', observedAt: '2026-01-01' })],
    })
    const result = coveragePromotion(e)
    expect(result.state).toBe('frontier')
    expect(result.promoted).toBe(false)
    expect(result.withheldReason).toBe(CoverageWithheldReason.GoverningDirectEvidence)
  })

  it('partial check comes before the already-at-or-above check', () => {
    const result = coveragePromotion(entry({ state: 'forming' }), CoverageQualifier.Partial)
    expect(result.withheldReason).toBe(CoverageWithheldReason.PartialQualifier)
  })

  it('already-at-or-above comes before the direct-evidence check', () => {
    const e = entry({
      state: 'forming',
      evidence: [ref({ kind: 'eval', observedAt: '2026-01-01' })],
    })
    const result = coveragePromotion(e)
    expect(result.withheldReason).toBe(CoverageWithheldReason.AlreadyAtOrAbove)
  })

  it('handles undefined entry as not-yet', () => {
    const result = coveragePromotion(undefined)
    expect(result.state).toBe('forming')
    expect(result.promoted).toBe(true)
    expect(result.priorState).toBe('not-yet')
  })
})

// ─── completionReviewNeeded ──────────────────────────────────────────────────

describe('completionReviewNeeded', () => {
  it('returns true when flag is set', () => {
    expect(completionReviewNeeded(entry({ completionReviewNeeded: true }))).toBe(true)
  })

  it('returns false when flag is false', () => {
    expect(completionReviewNeeded(entry({ completionReviewNeeded: false }))).toBe(false)
  })

  it('returns false for undefined entry', () => {
    expect(completionReviewNeeded(undefined)).toBe(false)
  })

  it('returns false when flag is absent', () => {
    expect(completionReviewNeeded(entry())).toBe(false)
  })
})

// ─── coverageSupportedState ──────────────────────────────────────────────────

describe('coverageSupportedState', () => {
  it('returns undefined for a partial completion ref', () => {
    expect(
      coverageSupportedState(
        completionRef({ coverageQualifier: CoverageQualifier.Partial }),
      ),
    ).toBeUndefined()
  })

  it('returns undefined for a partial position ref', () => {
    expect(
      coverageSupportedState(
        positionRef({ coverageQualifier: CoverageQualifier.Partial }),
      ),
    ).toBeUndefined()
  })

  it('returns cap for a completion ref that owns promotion', () => {
    expect(
      coverageSupportedState(completionRef({ ownsPromotion: true })),
    ).toBe('forming')
  })

  it('returns cap for a completion ref that promoted', () => {
    expect(
      coverageSupportedState(completionRef({ promoted: true })),
    ).toBe('forming')
  })

  it('returns cap for a completion ref withheld as already-at-or-above', () => {
    expect(
      coverageSupportedState(
        completionRef({ withheldReason: CoverageWithheldReason.AlreadyAtOrAbove }),
      ),
    ).toBe('forming')
  })

  it('returns undefined for a completion ref that did not promote and was not withheld for already-at', () => {
    expect(
      coverageSupportedState(
        completionRef({ promoted: false, ownsPromotion: false }),
      ),
    ).toBeUndefined()
  })

  it('honours coverageCeiling on a completion ref', () => {
    expect(
      coverageSupportedState(
        completionRef({ ownsPromotion: true, coverageCeiling: 'frontier' }),
      ),
    ).toBe('frontier')
  })

  it('clamps completion coverageCeiling above forming to forming', () => {
    expect(
      coverageSupportedState(
        completionRef({ ownsPromotion: true, coverageCeiling: 'solid' }),
      ),
    ).toBe('forming')
  })

  it('returns cap for position ref with positionSync and no coverageCeiling', () => {
    expect(
      coverageSupportedState(positionRef({ positionSync: true })),
    ).toBe('forming')
  })

  it('returns undefined for position ref without positionSync and no coverageCeiling', () => {
    expect(coverageSupportedState(positionRef())).toBeUndefined()
  })

  it('honours coverageCeiling on a position ref', () => {
    expect(
      coverageSupportedState(positionRef({ coverageCeiling: 'frontier' })),
    ).toBe('frontier')
  })

  it('clamps position coverageCeiling above forming to forming', () => {
    expect(
      coverageSupportedState(positionRef({ coverageCeiling: 'solid' })),
    ).toBe('forming')
  })

  it('returns undefined for a non-coverage kind', () => {
    expect(coverageSupportedState(ref({ kind: 'quest' }))).toBeUndefined()
    expect(coverageSupportedState(ref({ kind: 'eval' }))).toBeUndefined()
    expect(coverageSupportedState(ref({ kind: 'attestation' }))).toBeUndefined()
  })

  it('returns undefined for undefined ref', () => {
    expect(coverageSupportedState(undefined)).toBeUndefined()
  })
})

// ─── survivingSupportedState ─────────────────────────────────────────────────

describe('survivingSupportedState', () => {
  it('returns direct read state when direct evidence has a readState', () => {
    const e = entry({
      evidence: [
        ref({ kind: 'eval', observedAt: '2026-01-05', readState: 'frontier' }),
        positionRef({ positionSync: true }),
      ],
    })
    expect(survivingSupportedState(e)).toBe('frontier')
  })

  it('falls through to coverage when no direct read', () => {
    const e = entry({
      evidence: [positionRef({ positionSync: true })],
    })
    expect(survivingSupportedState(e)).toBe('forming')
  })

  it('returns strongest surviving coverage claim', () => {
    const e = entry({
      evidence: [
        positionRef({ coverageCeiling: 'frontier' }),
        positionRef({ positionSync: true }),
      ],
    })
    expect(survivingSupportedState(e)).toBe('forming')
  })

  it('excludes released completion refs', () => {
    const e = entry({
      evidence: [
        completionRef({ completionId: 'comp-1', ownsPromotion: true }),
      ],
    })
    expect(survivingSupportedState(e, 'comp-1')).toBeUndefined()
  })

  it('keeps other completions when one is released', () => {
    const e = entry({
      evidence: [
        completionRef({ completionId: 'comp-1', ownsPromotion: true }),
        completionRef({ completionId: 'comp-2', ownsPromotion: true }),
      ],
    })
    expect(survivingSupportedState(e, 'comp-1')).toBe('forming')
  })

  it('ignores superseded refs', () => {
    const e = entry({
      evidence: [
        positionRef({ positionSync: true, status: EvidenceRefStatus.Superseded }),
      ],
    })
    expect(survivingSupportedState(e)).toBeUndefined()
  })

  it('returns undefined for entry with no evidence', () => {
    expect(survivingSupportedState(entry())).toBeUndefined()
  })

  it('returns undefined for undefined entry', () => {
    expect(survivingSupportedState(undefined)).toBeUndefined()
  })

  it('a failed quest (no readState) does not hide prior eval read', () => {
    const e = entry({
      evidence: [
        ref({ kind: 'eval', observedAt: '2026-01-01', readState: 'forming' }),
        ref({ kind: 'quest', observedAt: '2026-01-10' }),
      ],
    })
    expect(survivingSupportedState(e)).toBe('forming')
  })
})

// ─── completionReviewCeiling ─────────────────────────────────────────────────

describe('completionReviewCeiling', () => {
  it('returns frontier when nothing supports more', () => {
    expect(completionReviewCeiling(entry())).toBe('frontier')
  })

  it('raises to forming when a live position ref supports it', () => {
    const e = entry({
      evidence: [positionRef({ positionSync: true })],
    })
    expect(completionReviewCeiling(e)).toBe('forming')
  })

  it('stays at frontier when only partial coverage exists', () => {
    const e = entry({
      evidence: [positionRef({ coverageQualifier: CoverageQualifier.Partial })],
    })
    expect(completionReviewCeiling(e)).toBe('frontier')
  })

  it('returns frontier for undefined entry', () => {
    expect(completionReviewCeiling(undefined)).toBe('frontier')
  })
})

// ─── effectiveConceptState ───────────────────────────────────────────────────

describe('effectiveConceptState', () => {
  it('returns stored state when no completion review needed', () => {
    expect(effectiveConceptState(entry({ state: 'solid' }))).toBe('solid')
    expect(effectiveConceptState(entry({ state: 'forming' }))).toBe('forming')
    expect(effectiveConceptState(entry({ state: 'frontier' }))).toBe('frontier')
    expect(effectiveConceptState(entry({ state: 'not-yet' }))).toBe('not-yet')
  })

  it('returns not-yet for undefined entry', () => {
    expect(effectiveConceptState(undefined)).toBe('not-yet')
  })

  it('caps at frontier when completion review needed and nothing supports more', () => {
    const e = entry({
      state: 'forming',
      completionReviewNeeded: true,
    })
    expect(effectiveConceptState(e)).toBe('frontier')
  })

  it('caps at forming when completion review needed and coverage supports forming', () => {
    const e = entry({
      state: 'forming',
      completionReviewNeeded: true,
      evidence: [positionRef({ positionSync: true })],
    })
    expect(effectiveConceptState(e)).toBe('forming')
  })

  it('never exceeds stored state even with live coverage', () => {
    const e = entry({
      state: 'frontier',
      completionReviewNeeded: true,
      evidence: [positionRef({ positionSync: true })],
    })
    // stored state is frontier, coverage would support forming, but stored is the upper bound
    expect(effectiveConceptState(e)).toBe('frontier')
  })

  it('returns stored state at or below ceiling unchanged', () => {
    const e = entry({
      state: 'frontier',
      completionReviewNeeded: true,
    })
    // frontier === COVERAGE_REVIEW_CEILING, so no capping
    expect(effectiveConceptState(e)).toBe('frontier')
  })

  it('caps solid to frontier when no coverage supports it', () => {
    const e = entry({
      state: 'solid',
      completionReviewNeeded: true,
    })
    expect(effectiveConceptState(e)).toBe('frontier')
  })
})

// ─── completionReviewSupported ───────────────────────────────────────────────

describe('completionReviewSupported', () => {
  it('returns false when no completion review needed', () => {
    const e = entry({ state: 'forming', evidence: [positionRef({ positionSync: true })] })
    expect(completionReviewSupported(e)).toBe(false)
  })

  it('returns true when live coverage supports the stored state', () => {
    const e = entry({
      state: 'forming',
      completionReviewNeeded: true,
      evidence: [positionRef({ positionSync: true })],
    })
    expect(completionReviewSupported(e)).toBe(true)
  })

  it('returns false when nothing supports stored forming', () => {
    const e = entry({
      state: 'forming',
      completionReviewNeeded: true,
    })
    expect(completionReviewSupported(e)).toBe(false)
  })

  it('returns false for undefined entry', () => {
    expect(completionReviewSupported(undefined)).toBe(false)
  })
})

// ─── effectiveConceptStates ──────────────────────────────────────────────────

describe('effectiveConceptStates', () => {
  it('projects every entry through effectiveConceptState', () => {
    const states: Record<string, CoverageEntryLike> = {
      a: { state: 'solid' },
      b: { state: 'forming', completionReviewNeeded: true },
      c: { state: 'not-yet' },
    }
    const result = effectiveConceptStates(states)
    expect(result.a).toBe('solid')
    expect(result.b).toBe('frontier')
    expect(result.c).toBe('not-yet')
  })

  it('handles undefined map', () => {
    expect(effectiveConceptStates(undefined)).toEqual({})
  })

  it('handles empty map', () => {
    expect(effectiveConceptStates({})).toEqual({})
  })
})
