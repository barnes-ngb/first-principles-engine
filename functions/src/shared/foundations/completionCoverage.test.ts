import { describe, it, expect } from 'vitest'

import {
  isActiveEvidence,
  activeEvidence,
  isGoverningDirectKind,
  governingDirectEvidence,
  governingDirectRead,
  pendingAttestationFreeze,
  acceptedDirectRead,
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
  EvidenceRefStatus,
  CoverageQualifier,
  CoverageWithheldReason,
  COVERAGE_CAP,
  COVERAGE_REVIEW_CEILING,
  PROGRAM_COMPLETION_COVERAGE,
  CURRICULUM_POSITION_COVERAGE,
  ATTESTATION_EVIDENCE,
  EVAL_EVIDENCE,
  type CoverageEvidenceLike,
  type CoverageEntryLike,
} from './completionCoverage'

// ── helpers ──────────────────────────────────────────────────────

function ref(overrides: Partial<CoverageEvidenceLike> = {}): CoverageEvidenceLike {
  return { kind: 'quest', ...overrides }
}

function entry(overrides: Partial<CoverageEntryLike> & { evidence?: CoverageEvidenceLike[] } = {}): CoverageEntryLike {
  return { state: 'not-yet', ...overrides }
}

// ── asCoverageState ──────────────────────────────────────────────

describe('asCoverageState', () => {
  it('returns the state for valid values', () => {
    expect(asCoverageState('solid')).toBe('solid')
    expect(asCoverageState('forming')).toBe('forming')
    expect(asCoverageState('frontier')).toBe('frontier')
    expect(asCoverageState('not-yet')).toBe('not-yet')
  })

  it('returns undefined for invalid values', () => {
    expect(asCoverageState('invalid')).toBeUndefined()
    expect(asCoverageState(undefined)).toBeUndefined()
    expect(asCoverageState('')).toBeUndefined()
  })
})

// ── isActiveEvidence ─────────────────────────────────────────────

describe('isActiveEvidence', () => {
  it('returns true for an active ref', () => {
    expect(isActiveEvidence(ref({ status: 'active' }))).toBe(true)
  })

  it('returns true for a ref with no status (legacy)', () => {
    expect(isActiveEvidence(ref())).toBe(true)
  })

  it('returns false for a superseded ref', () => {
    expect(isActiveEvidence(ref({ status: EvidenceRefStatus.Superseded }))).toBe(false)
  })

  it('returns false for null/undefined', () => {
    expect(isActiveEvidence(null)).toBe(false)
    expect(isActiveEvidence(undefined)).toBe(false)
  })
})

// ── activeEvidence ───────────────────────────────────────────────

describe('activeEvidence', () => {
  it('filters out superseded refs', () => {
    const refs = [
      ref({ kind: 'quest', status: 'active' }),
      ref({ kind: 'eval', status: 'superseded' }),
      ref({ kind: 'attestation' }),
    ]
    const result = activeEvidence(refs)
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.kind)).toEqual(['quest', 'attestation'])
  })

  it('returns empty array for undefined', () => {
    expect(activeEvidence(undefined)).toEqual([])
  })
})

// ── isGoverningDirectKind ────────────────────────────────────────

describe('isGoverningDirectKind', () => {
  it('returns true for attestation, eval, quest', () => {
    expect(isGoverningDirectKind('attestation')).toBe(true)
    expect(isGoverningDirectKind('eval')).toBe(true)
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

// ── governingDirectEvidence ──────────────────────────────────────

describe('governingDirectEvidence', () => {
  it('returns the latest active direct ref', () => {
    const e = entry({
      evidence: [
        ref({ kind: 'quest', observedAt: '2026-01-01T00:00:00Z' }),
        ref({ kind: 'eval', observedAt: '2026-02-01T00:00:00Z' }),
      ],
    })
    const result = governingDirectEvidence(e)
    expect(result?.kind).toBe('eval')
  })

  it('ignores non-direct kinds (coverage)', () => {
    const e = entry({
      evidence: [
        ref({ kind: CURRICULUM_POSITION_COVERAGE, observedAt: '2026-03-01T00:00:00Z' }),
      ],
    })
    expect(governingDirectEvidence(e)).toBeUndefined()
  })

  it('ignores superseded refs', () => {
    const e = entry({
      evidence: [
        ref({ kind: 'quest', status: 'superseded', observedAt: '2026-02-01T00:00:00Z' }),
        ref({ kind: 'quest', observedAt: '2026-01-01T00:00:00Z' }),
      ],
    })
    expect(governingDirectEvidence(e)?.observedAt).toBe('2026-01-01T00:00:00Z')
  })

  it('respects sinceIso filter', () => {
    const e = entry({
      evidence: [
        ref({ kind: 'quest', observedAt: '2026-01-01T00:00:00Z' }),
        ref({ kind: 'eval', observedAt: '2026-03-01T00:00:00Z' }),
      ],
    })
    const result = governingDirectEvidence(e, '2026-02-01T00:00:00Z')
    expect(result?.kind).toBe('eval')
  })

  it('returns undefined for no entry', () => {
    expect(governingDirectEvidence(undefined)).toBeUndefined()
  })

  it('returns a direct ref even without a readState (failed quest counts)', () => {
    const e = entry({
      evidence: [ref({ kind: 'quest', observedAt: '2026-01-01T00:00:00Z' })],
    })
    expect(governingDirectEvidence(e)).toBeDefined()
  })
})

// ── governingDirectRead ──────────────────────────────────────────

describe('governingDirectRead', () => {
  it('returns only refs with a valid readState', () => {
    const e = entry({
      evidence: [
        ref({ kind: 'quest', observedAt: '2026-02-01T00:00:00Z' }),
        ref({ kind: 'eval', observedAt: '2026-01-01T00:00:00Z', readState: 'forming' }),
      ],
    })
    const result = governingDirectRead(e)
    expect(result?.kind).toBe('eval')
    expect(result?.readState).toBe('forming')
  })

  it('returns undefined when no direct ref has a readState', () => {
    const e = entry({
      evidence: [ref({ kind: 'quest', observedAt: '2026-01-01T00:00:00Z' })],
    })
    expect(governingDirectRead(e)).toBeUndefined()
  })

  it('ignores refs with invalid readState', () => {
    const e = entry({
      evidence: [ref({ kind: 'quest', readState: 'invalid-state' })],
    })
    expect(governingDirectRead(e)).toBeUndefined()
  })
})

// ── pendingAttestationFreeze ─────────────────────────────────────

describe('pendingAttestationFreeze', () => {
  it('returns the attestation ref when needsReconcile is set', () => {
    const e = {
      evidence: [ref({ kind: ATTESTATION_EVIDENCE, observedAt: '2026-01-01T00:00:00Z' })],
      needsReconcile: true,
    }
    expect(pendingAttestationFreeze(e)?.kind).toBe(ATTESTATION_EVIDENCE)
  })

  it('returns undefined when needsReconcile is not set', () => {
    const e = {
      evidence: [ref({ kind: ATTESTATION_EVIDENCE })],
      needsReconcile: false,
    }
    expect(pendingAttestationFreeze(e)).toBeUndefined()
  })

  it('returns undefined when there is no attestation ref', () => {
    const e = {
      evidence: [ref({ kind: 'quest' })],
      needsReconcile: true,
    }
    expect(pendingAttestationFreeze(e)).toBeUndefined()
  })
})

// ── acceptedDirectRead ───────────────────────────────────────────

describe('acceptedDirectRead', () => {
  it('falls through to governingDirectRead when no freeze is active', () => {
    const e = {
      evidence: [
        ref({ kind: 'eval', observedAt: '2026-01-01T00:00:00Z', readState: 'forming' }),
      ],
    }
    expect(acceptedDirectRead(e)?.readState).toBe('forming')
  })

  it('excludes eval refs when attestation is frozen', () => {
    const e = {
      evidence: [
        ref({ kind: ATTESTATION_EVIDENCE, observedAt: '2026-01-01T00:00:00Z', readState: 'solid' }),
        ref({ kind: 'eval', observedAt: '2026-02-01T00:00:00Z', readState: 'frontier' }),
      ],
      needsReconcile: true,
    }
    const result = acceptedDirectRead(e)
    expect(result?.kind).toBe(ATTESTATION_EVIDENCE)
    expect(result?.readState).toBe('solid')
  })

  it('still returns quest refs while frozen', () => {
    const e = {
      evidence: [
        ref({ kind: ATTESTATION_EVIDENCE, observedAt: '2026-01-01T00:00:00Z' }),
        ref({ kind: 'quest', observedAt: '2026-03-01T00:00:00Z', readState: 'forming' }),
      ],
      needsReconcile: true,
    }
    expect(acceptedDirectRead(e)?.kind).toBe('quest')
  })
})

// ── coveragePromotion ────────────────────────────────────────────

describe('coveragePromotion', () => {
  it('promotes a not-yet entry to forming (the cap)', () => {
    const result = coveragePromotion(entry({ state: 'not-yet' }))
    expect(result.state).toBe('forming')
    expect(result.promoted).toBe(true)
    expect(result.priorState).toBe('not-yet')
    expect(result.withheldReason).toBeUndefined()
  })

  it('promotes a frontier entry to forming', () => {
    const result = coveragePromotion(entry({ state: 'frontier' }))
    expect(result.state).toBe('forming')
    expect(result.promoted).toBe(true)
    expect(result.priorState).toBe('frontier')
  })

  it('caps a solid proposal at forming (rule 1)', () => {
    const result = coveragePromotion(entry({ state: 'not-yet' }), CoverageQualifier.Direct, 'solid')
    expect(result.state).toBe('forming')
    expect(result.promoted).toBe(true)
  })

  it('honours a frontier proposal (below the cap)', () => {
    const result = coveragePromotion(entry({ state: 'not-yet' }), CoverageQualifier.Direct, 'frontier')
    expect(result.state).toBe('frontier')
    expect(result.promoted).toBe(true)
  })

  it('withholds on partial qualifier (rule 3)', () => {
    const result = coveragePromotion(entry({ state: 'not-yet' }), CoverageQualifier.Partial)
    expect(result.promoted).toBe(false)
    expect(result.state).toBe('not-yet')
    expect(result.withheldReason).toBe(CoverageWithheldReason.PartialQualifier)
  })

  it('withholds when already at the cap (rule 1)', () => {
    const result = coveragePromotion(entry({ state: 'forming' }))
    expect(result.promoted).toBe(false)
    expect(result.withheldReason).toBe(CoverageWithheldReason.AlreadyAtOrAbove)
  })

  it('withholds when already above the cap (solid)', () => {
    const result = coveragePromotion(entry({ state: 'solid' }))
    expect(result.promoted).toBe(false)
    expect(result.withheldReason).toBe(CoverageWithheldReason.AlreadyAtOrAbove)
  })

  it('withholds when direct evidence governs (rule 2)', () => {
    const e = entry({
      state: 'not-yet',
      evidence: [ref({ kind: 'quest', observedAt: '2026-01-01T00:00:00Z' })],
    })
    const result = coveragePromotion(e)
    expect(result.promoted).toBe(false)
    expect(result.withheldReason).toBe(CoverageWithheldReason.GoverningDirectEvidence)
  })

  it('uses not-yet when entry is undefined', () => {
    const result = coveragePromotion(undefined)
    expect(result.state).toBe('forming')
    expect(result.promoted).toBe(true)
    expect(result.priorState).toBe('not-yet')
  })
})

// ── completionReviewNeeded ───────────────────────────────────────

describe('completionReviewNeeded', () => {
  it('returns true when flag is set', () => {
    expect(completionReviewNeeded(entry({ completionReviewNeeded: true }))).toBe(true)
  })

  it('returns false when flag is absent', () => {
    expect(completionReviewNeeded(entry())).toBe(false)
    expect(completionReviewNeeded(undefined)).toBe(false)
  })
})

// ── effectiveConceptState ────────────────────────────────────────

describe('effectiveConceptState', () => {
  it('returns stored state when no review is needed', () => {
    expect(effectiveConceptState(entry({ state: 'solid' }))).toBe('solid')
    expect(effectiveConceptState(entry({ state: 'forming' }))).toBe('forming')
  })

  it('returns not-yet for undefined entry', () => {
    expect(effectiveConceptState(undefined)).toBe('not-yet')
  })

  it('caps at frontier when review is needed and nothing supports more', () => {
    const e = entry({ state: 'forming', completionReviewNeeded: true })
    expect(effectiveConceptState(e)).toBe(COVERAGE_REVIEW_CEILING)
  })

  it('reads at stored state when review needed but coverage supports it', () => {
    const e = entry({
      state: 'forming',
      completionReviewNeeded: true,
      evidence: [
        ref({
          kind: CURRICULUM_POSITION_COVERAGE,
          positionSync: true,
          status: 'active',
        }),
      ],
    })
    expect(effectiveConceptState(e)).toBe('forming')
  })
})

// ── effectiveConceptStates ───────────────────────────────────────

describe('effectiveConceptStates', () => {
  it('projects over a whole map', () => {
    const states = {
      'concept-a': entry({ state: 'solid' }),
      'concept-b': entry({ state: 'forming', completionReviewNeeded: true }),
    }
    const result = effectiveConceptStates(states)
    expect(result['concept-a']).toBe('solid')
    expect(result['concept-b']).toBe(COVERAGE_REVIEW_CEILING)
  })

  it('handles undefined map', () => {
    expect(effectiveConceptStates(undefined)).toEqual({})
  })
})

// ── isCompletionCoverageRef ──────────────────────────────────────

describe('isCompletionCoverageRef', () => {
  it('returns true for a completion coverage ref', () => {
    expect(isCompletionCoverageRef(ref({ kind: PROGRAM_COMPLETION_COVERAGE }))).toBe(true)
  })

  it('returns false for other kinds', () => {
    expect(isCompletionCoverageRef(ref({ kind: 'quest' }))).toBe(false)
    expect(isCompletionCoverageRef(undefined)).toBe(false)
  })
})

// ── activeCompletionRefsFor ──────────────────────────────────────

describe('activeCompletionRefsFor', () => {
  it('returns only active completion refs for the given completionId', () => {
    const e = {
      evidence: [
        ref({ kind: PROGRAM_COMPLETION_COVERAGE, completionId: 'c-1' }),
        ref({ kind: PROGRAM_COMPLETION_COVERAGE, completionId: 'c-2' }),
        ref({ kind: PROGRAM_COMPLETION_COVERAGE, completionId: 'c-1', status: 'superseded' }),
        ref({ kind: 'quest', completionId: 'c-1' }),
      ],
    }
    const result = activeCompletionRefsFor(e, 'c-1')
    expect(result).toHaveLength(1)
    expect(result[0].completionId).toBe('c-1')
  })
})

// ── completionRefsFor (includes superseded) ──────────────────────

describe('completionRefsFor', () => {
  it('returns all refs for a completionId including superseded ones', () => {
    const e = {
      evidence: [
        ref({ kind: PROGRAM_COMPLETION_COVERAGE, completionId: 'c-1' }),
        ref({ kind: PROGRAM_COMPLETION_COVERAGE, completionId: 'c-1', status: 'superseded' }),
        ref({ kind: PROGRAM_COMPLETION_COVERAGE, completionId: 'c-2' }),
      ],
    }
    const result = completionRefsFor(e, 'c-1')
    expect(result).toHaveLength(2)
  })
})

// ── coverageSupportedState ───────────────────────────────────────

describe('coverageSupportedState', () => {
  it('returns forming for a direct completion claim with ownsPromotion', () => {
    const r = ref({
      kind: PROGRAM_COMPLETION_COVERAGE,
      ownsPromotion: true,
    })
    expect(coverageSupportedState(r)).toBe(COVERAGE_CAP)
  })

  it('returns forming for a completion claim withheld as already-at-or-above', () => {
    const r = ref({
      kind: PROGRAM_COMPLETION_COVERAGE,
      withheldReason: CoverageWithheldReason.AlreadyAtOrAbove,
    })
    expect(coverageSupportedState(r)).toBe(COVERAGE_CAP)
  })

  it('returns undefined for a partial completion ref', () => {
    const r = ref({
      kind: PROGRAM_COMPLETION_COVERAGE,
      coverageQualifier: CoverageQualifier.Partial,
    })
    expect(coverageSupportedState(r)).toBeUndefined()
  })

  it('returns cap for a positionSync curriculumPosition ref', () => {
    const r = ref({
      kind: CURRICULUM_POSITION_COVERAGE,
      positionSync: true,
    })
    expect(coverageSupportedState(r)).toBe(COVERAGE_CAP)
  })

  it('reads coverageCeiling for a curriculumPosition ref that has one', () => {
    const r = ref({
      kind: CURRICULUM_POSITION_COVERAGE,
      coverageCeiling: 'frontier',
    })
    expect(coverageSupportedState(r)).toBe('frontier')
  })

  it('returns undefined for a manual curriculumPosition ref with no ceiling or positionSync', () => {
    const r = ref({ kind: CURRICULUM_POSITION_COVERAGE })
    expect(coverageSupportedState(r)).toBeUndefined()
  })

  it('returns undefined for non-coverage kinds', () => {
    expect(coverageSupportedState(ref({ kind: 'quest' }))).toBeUndefined()
  })

  it('returns undefined for undefined ref', () => {
    expect(coverageSupportedState(undefined)).toBeUndefined()
  })
})

// ── survivingSupportedState ──────────────────────────────────────

describe('survivingSupportedState', () => {
  it('returns direct readState when a direct read exists', () => {
    const e = {
      evidence: [
        ref({ kind: 'eval', readState: 'solid', observedAt: '2026-01-01T00:00:00Z' }),
        ref({ kind: CURRICULUM_POSITION_COVERAGE, positionSync: true }),
      ],
    }
    expect(survivingSupportedState(e)).toBe('solid')
  })

  it('falls back to coverage when no direct read exists', () => {
    const e = {
      evidence: [
        ref({ kind: CURRICULUM_POSITION_COVERAGE, positionSync: true }),
      ],
    }
    expect(survivingSupportedState(e)).toBe(COVERAGE_CAP)
  })

  it('excludes released completion refs', () => {
    const e = {
      evidence: [
        ref({ kind: PROGRAM_COMPLETION_COVERAGE, completionId: 'c-1', ownsPromotion: true }),
      ],
    }
    expect(survivingSupportedState(e, 'c-1')).toBeUndefined()
  })

  it('keeps non-released completion refs', () => {
    const e = {
      evidence: [
        ref({ kind: PROGRAM_COMPLETION_COVERAGE, completionId: 'c-1', ownsPromotion: true }),
        ref({ kind: PROGRAM_COMPLETION_COVERAGE, completionId: 'c-2', ownsPromotion: true }),
      ],
    }
    expect(survivingSupportedState(e, 'c-1')).toBe(COVERAGE_CAP)
  })

  it('returns undefined for empty evidence', () => {
    expect(survivingSupportedState(entry())).toBeUndefined()
    expect(survivingSupportedState(undefined)).toBeUndefined()
  })

  it('returns the strongest surviving coverage claim', () => {
    const e = {
      evidence: [
        ref({ kind: CURRICULUM_POSITION_COVERAGE, coverageCeiling: 'frontier' }),
        ref({ kind: CURRICULUM_POSITION_COVERAGE, positionSync: true }),
      ],
    }
    expect(survivingSupportedState(e)).toBe(COVERAGE_CAP)
  })
})

// ── completionReviewCeiling ──────────────────────────────────────

describe('completionReviewCeiling', () => {
  it('returns frontier when nothing supports more', () => {
    expect(completionReviewCeiling(entry())).toBe(COVERAGE_REVIEW_CEILING)
  })

  it('raises above frontier when live coverage supports it', () => {
    const e = entry({
      evidence: [
        ref({ kind: CURRICULUM_POSITION_COVERAGE, positionSync: true }),
      ],
    })
    expect(completionReviewCeiling(e)).toBe(COVERAGE_CAP)
  })
})

// ── completionReviewSupported ────────────────────────────────────

describe('completionReviewSupported', () => {
  it('returns false when no review is needed', () => {
    expect(completionReviewSupported(entry({ state: 'forming' }))).toBe(false)
  })

  it('returns false when nothing supports the stored state', () => {
    expect(
      completionReviewSupported(entry({ state: 'forming', completionReviewNeeded: true })),
    ).toBe(false)
  })

  it('returns true when live coverage supports the stored state', () => {
    const e = entry({
      state: 'forming',
      completionReviewNeeded: true,
      evidence: [
        ref({ kind: CURRICULUM_POSITION_COVERAGE, positionSync: true }),
      ],
    })
    expect(completionReviewSupported(e)).toBe(true)
  })
})
