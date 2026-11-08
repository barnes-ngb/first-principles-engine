import { describe, it, expect } from 'vitest'

import {
  COMPLETION_PROGRAMS,
  ASSISTANCE_LABEL,
  ASSISTANCE_CHOICES,
  WITHDRAW_REASON_LABEL,
  WITHDRAW_REASON_CHOICES,
  COMPLETION_SCOPE_NOTICE,
  COMPLETION_STATE_UNKNOWN,
  COMPLETION_STATE_UNREADABLE,
  OBSERVED_ON_FLOOR,
  emptyCompletionDraft,
  completionDraftIsEmpty,
  eligibleCitations,
  citationLabel,
  reviewCompletionDraft,
  coverageSummary,
  coverageSummaryHeadline,
  completionPreview,
  completionSavedNotice,
  completionAlreadyRecordedNotice,
  completionFailureNotice,
  completionNotSentNotice,
  completionStrandedTitle,
  completionStrandedNotice,
  completionStrandedRefusedTitle,
  completionStrandedRefusedNotice,
  completionStrandedReasonLine,
  completionUnresolvedHoldLine,
  completionUnresolvedHoldReason,
  completionChildSwitchNotice,
  activeCompletionSentence,
  projectionStatusLine,
  needsApplyRetry,
  mappingUpgradeAvailable,
  mappingUpgradeLine,
  sourceConflictNotice,
  lastWithdrawSentence,
  eventSentence,
  sortEvents,
  newCompletionEntryKey,
} from './programCompletionRule'

import {
  CompletionAssistance,
  CompletionProjectionStatus,
  CompletionWithdrawReason,
  ProgramCompletionProgram,
} from '../../../core/types/programCompletion'

import {
  NativeProgressMeaning,
  NativeProgressSource,
} from '../../../core/types/nativeProgress'

import type { NativeProgressObservation } from '../../../core/types/nativeProgress'
import type {
  ProgramCompletionEvent,
  ProgramCompletionState,
} from '../../../core/types/programCompletion'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TODAY = '2026-10-15'

function makeObservation(
  overrides: Partial<NativeProgressObservation> & { id: string },
): NativeProgressObservation {
  return {
    program: ProgramCompletionProgram.FastPhonics,
    nativeNumber: 20,
    meaning: NativeProgressMeaning.CompletedThrough,
    source: NativeProgressSource.ParentReport,
    observedOn: '2026-10-01',
    recordedAt: '2026-10-01T12:00:00Z',
    entryKey: 'entry-1',
    childId: 'child-1',
    ...overrides,
  } as NativeProgressObservation
}

// ─── Constants ────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('COMPLETION_PROGRAMS contains FastPhonics', () => {
    expect(COMPLETION_PROGRAMS).toContain(ProgramCompletionProgram.FastPhonics)
  })

  it('ASSISTANCE_LABEL covers all choices', () => {
    for (const choice of ASSISTANCE_CHOICES) {
      expect(ASSISTANCE_LABEL[choice]).toBeTruthy()
    }
  })

  it('WITHDRAW_REASON_LABEL covers all choices', () => {
    for (const choice of WITHDRAW_REASON_CHOICES) {
      expect(WITHDRAW_REASON_LABEL[choice]).toBeTruthy()
    }
  })

  it('WITHDRAW_REASON_CHOICES does not include sourceCorrected', () => {
    expect(WITHDRAW_REASON_CHOICES).not.toContain(
      CompletionWithdrawReason.SourceCorrected,
    )
  })

  it('COMPLETION_SCOPE_NOTICE mentions no hours', () => {
    expect(COMPLETION_SCOPE_NOTICE).toContain('no hours')
  })

  it('COMPLETION_STATE_UNKNOWN mentions loading', () => {
    expect(COMPLETION_STATE_UNKNOWN).toContain('loaded')
  })

  it('COMPLETION_STATE_UNREADABLE mentions unchanged', () => {
    expect(COMPLETION_STATE_UNREADABLE).toContain('Nothing has been changed')
  })
})

// ─── emptyCompletionDraft / completionDraftIsEmpty ────────────────────────────

describe('emptyCompletionDraft', () => {
  it('produces a draft with the seeded date', () => {
    const draft = emptyCompletionDraft('2026-10-15')
    expect(draft.observedOn).toBe('2026-10-15')
    expect(draft.note).toBe('')
    expect(draft.reportObservationId).toBe('')
  })
})

describe('completionDraftIsEmpty', () => {
  it('returns true for an unmodified draft', () => {
    const d = emptyCompletionDraft('2026-10-15')
    expect(completionDraftIsEmpty(d, '2026-10-15')).toBe(true)
  })

  it('returns false when date differs from seed', () => {
    const d = emptyCompletionDraft('2026-10-15')
    d.observedOn = '2026-10-14'
    expect(completionDraftIsEmpty(d, '2026-10-15')).toBe(false)
  })

  it('returns false when note is non-empty', () => {
    const d = emptyCompletionDraft('2026-10-15')
    d.note = 'He really did it'
    expect(completionDraftIsEmpty(d, '2026-10-15')).toBe(false)
  })

  it('returns false when citation is set', () => {
    const d = emptyCompletionDraft('2026-10-15')
    d.reportObservationId = 'obs-123'
    expect(completionDraftIsEmpty(d, '2026-10-15')).toBe(false)
  })

  it('returns true when note is whitespace-only', () => {
    const d = emptyCompletionDraft('2026-10-15')
    d.note = '   '
    expect(completionDraftIsEmpty(d, '2026-10-15')).toBe(true)
  })
})

// ─── eligibleCitations ───────────────────────────────────────────────────────

describe('eligibleCitations', () => {
  it('returns rows that are completedThrough at the citable final position', () => {
    const rows = [
      makeObservation({ id: 'obs-1', nativeNumber: 20 }),
      makeObservation({ id: 'obs-2', nativeNumber: 19 }),
    ]
    const result = eligibleCitations(rows, ProgramCompletionProgram.FastPhonics)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('obs-1')
  })

  it('excludes rows with wrong meaning', () => {
    const rows = [
      makeObservation({
        id: 'obs-1',
        nativeNumber: 20,
        meaning: NativeProgressMeaning.WorkingOn,
      }),
    ]
    expect(eligibleCitations(rows, ProgramCompletionProgram.FastPhonics)).toHaveLength(0)
  })

  it('excludes rows that have been corrected', () => {
    const rows = [
      makeObservation({ id: 'obs-1', nativeNumber: 20 }),
      makeObservation({
        id: 'obs-2',
        nativeNumber: 20,
        correctsObservationId: 'obs-1',
      }),
    ]
    const result = eligibleCitations(rows, ProgramCompletionProgram.FastPhonics)
    expect(result.every((r) => r.id !== 'obs-1')).toBe(true)
  })

  it('sorts newest observedOn first', () => {
    const rows = [
      makeObservation({ id: 'obs-1', nativeNumber: 20, observedOn: '2026-09-01' }),
      makeObservation({ id: 'obs-2', nativeNumber: 20, observedOn: '2026-10-01' }),
    ]
    const result = eligibleCitations(rows, ProgramCompletionProgram.FastPhonics)
    expect(result[0].id).toBe('obs-2')
  })

  it('returns empty for unknown program', () => {
    const rows = [makeObservation({ id: 'obs-1', nativeNumber: 20 })]
    expect(eligibleCitations(rows, 'unknownProgram' as ProgramCompletionProgram)).toEqual([])
  })
})

// ─── reviewCompletionDraft ────────────────────────────────────────────────────

describe('reviewCompletionDraft', () => {
  const validDraft = {
    ...emptyCompletionDraft(TODAY),
    observedOn: '2026-10-10',
  }

  it('accepts a valid draft', () => {
    const result = reviewCompletionDraft(validDraft, TODAY, [])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.reviewed.program).toBe(ProgramCompletionProgram.FastPhonics)
      expect(result.reviewed.observedOn).toBe('2026-10-10')
    }
  })

  it('rejects a future date', () => {
    const draft = { ...validDraft, observedOn: '2027-01-01' }
    const result = reviewCompletionDraft(draft, TODAY, [])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.observedOn).toContain("hasn't happened")
    }
  })

  it('rejects a date before the floor', () => {
    const draft = { ...validDraft, observedOn: '1999-12-31' }
    const result = reviewCompletionDraft(draft, TODAY, [])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.observedOn).toContain('typo')
    }
  })

  it('rejects an empty date', () => {
    const draft = { ...validDraft, observedOn: '' }
    const result = reviewCompletionDraft(draft, TODAY, [])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.observedOn).toBeTruthy()
    }
  })

  it('rejects a non-date string', () => {
    const draft = { ...validDraft, observedOn: 'not-a-date' }
    const result = reviewCompletionDraft(draft, TODAY, [])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.observedOn).toContain('real date')
    }
  })

  it('rejects a note that exceeds the max length', () => {
    const draft = { ...validDraft, note: 'x'.repeat(401) }
    const result = reviewCompletionDraft(draft, TODAY, [])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.note).toContain('under')
    }
  })

  it('accepts a note at exactly the max length', () => {
    const draft = { ...validDraft, note: 'x'.repeat(400) }
    const result = reviewCompletionDraft(draft, TODAY, [])
    expect(result.ok).toBe(true)
  })

  it('rejects an invalid citation id', () => {
    const draft = { ...validDraft, reportObservationId: 'nonexistent-id' }
    const result = reviewCompletionDraft(draft, TODAY, [])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.reportObservationId).toBeTruthy()
    }
  })

  it('accepts a valid citation when the observation is eligible', () => {
    const rows = [makeObservation({ id: 'obs-valid', nativeNumber: 20 })]
    const draft = { ...validDraft, reportObservationId: 'obs-valid' }
    const result = reviewCompletionDraft(draft, TODAY, rows)
    expect(result.ok).toBe(true)
  })

  it('strips note and citation from reviewed output when empty', () => {
    const result = reviewCompletionDraft(validDraft, TODAY, [])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.reviewed).not.toHaveProperty('note')
      expect(result.reviewed).not.toHaveProperty('reportObservationId')
    }
  })

  it('includes note in reviewed output when non-empty', () => {
    const draft = { ...validDraft, note: 'He finished all peaks' }
    const result = reviewCompletionDraft(draft, TODAY, [])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.reviewed.note).toBe('He finished all peaks')
    }
  })

  it('reports ALL errors at once, not just the first', () => {
    const draft = {
      ...emptyCompletionDraft(TODAY),
      observedOn: '',
      note: 'x'.repeat(500),
      reportObservationId: 'bogus',
    }
    const result = reviewCompletionDraft(draft, TODAY, [])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.observedOn).toBeTruthy()
      expect(result.errors.note).toBeTruthy()
      expect(result.errors.reportObservationId).toBeTruthy()
    }
  })
})

// ─── coverageSummary ─────────────────────────────────────────────────────────

describe('coverageSummary', () => {
  it('returns lines for FastPhonics', () => {
    const lines = coverageSummary(ProgramCompletionProgram.FastPhonics)
    expect(lines.length).toBeGreaterThan(0)
  })

  it('every line has a conceptId, kidName, reach, and unit', () => {
    const lines = coverageSummary(ProgramCompletionProgram.FastPhonics)
    for (const line of lines) {
      expect(line.conceptId).toBeTruthy()
      expect(line.kidName).toBeTruthy()
      expect(line.reach).toMatch(/^Covered/)
      expect(line.unit).toBeTruthy()
    }
  })

  it('reach is "Covered" or "Covered in part", never mastered', () => {
    const lines = coverageSummary(ProgramCompletionProgram.FastPhonics)
    for (const line of lines) {
      expect(line.reach === 'Covered' || line.reach === 'Covered in part').toBe(true)
    }
  })

  it('returns empty for unknown program', () => {
    expect(coverageSummary('unknown' as ProgramCompletionProgram)).toEqual([])
  })
})

describe('coverageSummaryHeadline', () => {
  it('mentions reading building blocks', () => {
    const headline = coverageSummaryHeadline(ProgramCompletionProgram.FastPhonics)
    expect(headline).toContain('reading building block')
  })

  it('mentions that covered is not checked', () => {
    const headline = coverageSummaryHeadline(ProgramCompletionProgram.FastPhonics)
    expect(headline).toContain('not that it has been checked')
  })
})

// ─── completionPreview / completionSavedNotice ───────────────────────────────

describe('completionPreview', () => {
  it('names the child and the program', () => {
    const reviewed = {
      program: ProgramCompletionProgram.FastPhonics,
      observedOn: '2026-10-10',
      source: NativeProgressSource.ParentReport,
      assistance: CompletionAssistance.Unknown,
    }
    const preview = completionPreview(reviewed, 'Lincoln', null)
    expect(preview).toContain('Lincoln')
    expect(preview).toContain('finished')
  })

  it('includes citation when provided', () => {
    const reviewed = {
      program: ProgramCompletionProgram.FastPhonics,
      observedOn: '2026-10-10',
      source: NativeProgressSource.ParentReport,
      assistance: CompletionAssistance.Unknown,
    }
    const citation = makeObservation({ id: 'obs-1', nativeNumber: 20 })
    const preview = completionPreview(reviewed, 'Lincoln', citation)
    expect(preview).toContain('Evidence:')
  })
})

describe('completionSavedNotice', () => {
  const reviewed = {
    program: ProgramCompletionProgram.FastPhonics,
    observedOn: '2026-10-10',
    source: NativeProgressSource.ParentReport,
    assistance: CompletionAssistance.Unknown,
  }

  it('says "marked" when applied', () => {
    const notice = completionSavedNotice(reviewed, 'Lincoln', true)
    expect(notice).toContain('marked')
    expect(notice).toContain('covered')
  })

  it('says "NOT been marked" when not applied', () => {
    const notice = completionSavedNotice(reviewed, 'Lincoln', false)
    expect(notice).toContain('NOT been marked')
  })

  it('mentions no hours changed', () => {
    const notice = completionSavedNotice(reviewed, 'Lincoln', true)
    expect(notice).toContain('No hours')
  })
})

// ─── Notice functions ─────────────────────────────────────────────────────────

describe('completionAlreadyRecordedNotice', () => {
  it('names the child', () => {
    expect(completionAlreadyRecordedNotice('Lincoln')).toContain('Lincoln')
  })

  it('mentions nothing saved twice', () => {
    expect(completionAlreadyRecordedNotice('Lincoln')).toContain('twice')
  })
})

describe('completionFailureNotice', () => {
  it('mentions not confirmed as saved', () => {
    expect(completionFailureNotice()).toContain('not confirmed')
  })

  it('mentions cannot be recorded twice', () => {
    expect(completionFailureNotice()).toContain('twice')
  })
})

describe('completionNotSentNotice', () => {
  it('includes the reason', () => {
    expect(completionNotSentNotice('model is down')).toContain('model is down')
  })

  it('says nothing was written', () => {
    expect(completionNotSentNotice('reason')).toContain('Nothing was written')
  })
})

// ─── Stranded notices ─────────────────────────────────────────────────────────

describe('stranded notices', () => {
  it('completionStrandedTitle names the child', () => {
    expect(completionStrandedTitle('London')).toContain('London')
  })

  it('completionStrandedNotice mentions retry safety', () => {
    const notice = completionStrandedNotice('London')
    expect(notice).toContain('twice')
    expect(notice).toContain('London')
  })

  it('completionStrandedRefusedTitle names the child', () => {
    expect(completionStrandedRefusedTitle('London')).toContain('London')
  })

  it('completionStrandedRefusedNotice includes reason and kind', () => {
    const notice = completionStrandedRefusedNotice('London', 'confirm', 'Row was corrected.')
    expect(notice).toContain('Row was corrected.')
    expect(notice).toContain('confirmation')
    expect(notice).toContain('London')
  })

  it('completionStrandedRefusedNotice uses fallback for empty reason', () => {
    const notice = completionStrandedRefusedNotice('London', 'withdraw', '')
    expect(notice).toContain('refused')
    expect(notice).toContain('correction')
  })

  it('completionStrandedReasonLine includes the reason', () => {
    const line = completionStrandedReasonLine('London', 'confirm', 'Network timeout.')
    expect(line).toContain('Network timeout.')
    expect(line).toContain('confirmation')
  })

  it('completionStrandedReasonLine uses fallback for empty reason', () => {
    const line = completionStrandedReasonLine('London', 'confirm', '')
    expect(line).toContain('could not be completed')
  })
})

// ─── Hold notices ─────────────────────────────────────────────────────────────

describe('hold notices', () => {
  it('completionUnresolvedHoldLine mentions the child', () => {
    expect(completionUnresolvedHoldLine('Lincoln')).toContain('Lincoln')
  })

  it('completionUnresolvedHoldReason mentions the kind', () => {
    expect(completionUnresolvedHoldReason('Lincoln', 'confirm')).toContain('confirmation')
    expect(completionUnresolvedHoldReason('Lincoln', 'withdraw')).toContain('correction')
  })
})

// ─── completionChildSwitchNotice ─────────────────────────────────────────────

describe('completionChildSwitchNotice', () => {
  it('returns null when nothing was in progress', () => {
    expect(completionChildSwitchNotice('Lincoln', false, false)).toBeNull()
  })

  it('mentions cleared draft when there was one', () => {
    const notice = completionChildSwitchNotice('Lincoln', true, false)
    expect(notice).toContain('cleared')
    expect(notice).toContain('Lincoln')
  })

  it('mentions confirmed save when there was one', () => {
    const notice = completionChildSwitchNotice('Lincoln', false, true)
    expect(notice).toContain('Lincoln')
    expect(notice).toContain('record')
  })

  it('mentions both when both are true', () => {
    const notice = completionChildSwitchNotice('Lincoln', true, true)
    expect(notice).toContain('cleared')
    expect(notice).toContain('record')
  })
})

// ─── activeCompletionSentence ────────────────────────────────────────────────

describe('activeCompletionSentence', () => {
  it('returns null for null state', () => {
    expect(activeCompletionSentence(null, 'Lincoln')).toBeNull()
  })

  it('returns null when no active entry', () => {
    const state = { activeEntryKey: '', program: ProgramCompletionProgram.FastPhonics } as ProgramCompletionState
    expect(activeCompletionSentence(state, 'Lincoln')).toBeNull()
  })

  it('names the child and describes assistance', () => {
    const state = {
      activeEntryKey: 'key-1',
      program: ProgramCompletionProgram.FastPhonics,
      activeAssertion: {
        observedOn: '2026-10-10',
        source: NativeProgressSource.ParentReport,
        assistance: CompletionAssistance.Independent,
      },
    } as ProgramCompletionState
    const sentence = activeCompletionSentence(state, 'Lincoln')
    expect(sentence).toContain('Lincoln')
    expect(sentence).toContain('on his own')
  })
})

// ─── projectionStatusLine / needsApplyRetry ──────────────────────────────────

describe('projectionStatusLine', () => {
  it('returns null for null state', () => {
    expect(projectionStatusLine(null)).toBeNull()
  })

  it('returns applied message for Applied status', () => {
    const state = {
      projection: { status: CompletionProjectionStatus.Applied },
    } as ProgramCompletionState
    const line = projectionStatusLine(state)
    expect(line).toContain('learning picture')
  })

  it('returns pending message for Pending status', () => {
    const state = {
      projection: { status: CompletionProjectionStatus.Pending },
    } as ProgramCompletionState
    const line = projectionStatusLine(state)
    expect(line).toContain('not been updated')
  })
})

describe('needsApplyRetry', () => {
  it('returns false for null', () => {
    expect(needsApplyRetry(null)).toBe(false)
  })

  it('returns true for Pending', () => {
    const state = {
      projection: { status: CompletionProjectionStatus.Pending },
    } as ProgramCompletionState
    expect(needsApplyRetry(state)).toBe(true)
  })

  it('returns true for WithdrawalPending', () => {
    const state = {
      projection: { status: CompletionProjectionStatus.WithdrawalPending },
    } as ProgramCompletionState
    expect(needsApplyRetry(state)).toBe(true)
  })

  it('returns false for Applied', () => {
    const state = {
      projection: { status: CompletionProjectionStatus.Applied },
    } as ProgramCompletionState
    expect(needsApplyRetry(state)).toBe(false)
  })
})

// ─── mappingUpgradeAvailable ─────────────────────────────────────────────────

describe('mappingUpgradeAvailable', () => {
  it('returns false for null state', () => {
    expect(mappingUpgradeAvailable(null, null)).toBe(false)
  })

  it('returns false when status is not Applied', () => {
    const state = {
      activeEntryKey: 'key-1',
      projection: {
        status: CompletionProjectionStatus.Pending,
        appliedMappingVersion: 1,
      },
    } as ProgramCompletionState
    expect(mappingUpgradeAvailable(state, { mappingVersion: 2 } as any)).toBe(false)
  })

  it('returns true when applied version is older than mapping version', () => {
    const state = {
      activeEntryKey: 'key-1',
      projection: {
        status: CompletionProjectionStatus.Applied,
        appliedMappingVersion: 1,
      },
    } as ProgramCompletionState
    expect(mappingUpgradeAvailable(state, { mappingVersion: 2 } as any)).toBe(true)
  })

  it('returns false when versions match', () => {
    const state = {
      activeEntryKey: 'key-1',
      projection: {
        status: CompletionProjectionStatus.Applied,
        appliedMappingVersion: 2,
      },
    } as ProgramCompletionState
    expect(mappingUpgradeAvailable(state, { mappingVersion: 2 } as any)).toBe(false)
  })
})

describe('mappingUpgradeLine', () => {
  it('returns null when upgrade not available', () => {
    expect(mappingUpgradeLine(null, null)).toBeNull()
  })

  it('returns a line mentioning both versions when upgrade is available', () => {
    const state = {
      activeEntryKey: 'key-1',
      projection: {
        status: CompletionProjectionStatus.Applied,
        appliedMappingVersion: 1,
      },
    } as ProgramCompletionState
    const line = mappingUpgradeLine(state, { mappingVersion: 2 } as any)
    expect(line).toContain('1')
    expect(line).toContain('2')
    expect(line).toContain('reviewed')
  })
})

// ─── sourceConflictNotice / lastWithdrawSentence ─────────────────────────────

describe('sourceConflictNotice', () => {
  it('returns null for null state', () => {
    expect(sourceConflictNotice(null)).toBeNull()
  })

  it('returns null when no conflict', () => {
    const state = {} as ProgramCompletionState
    expect(sourceConflictNotice(state)).toBeNull()
  })

  it('returns the detail when conflict exists', () => {
    const state = {
      sourceConflict: { detail: 'The cited row was corrected.' },
    } as ProgramCompletionState
    expect(sourceConflictNotice(state)).toBe('The cited row was corrected.')
  })
})

describe('lastWithdrawSentence', () => {
  it('returns null for null state', () => {
    expect(lastWithdrawSentence(null)).toBeNull()
  })

  it('returns null when there is an active entry', () => {
    const state = {
      activeEntryKey: 'key-1',
      lastWithdraw: {
        at: '2026-10-01T12:00:00Z',
        reason: CompletionWithdrawReason.Mistake,
      },
    } as ProgramCompletionState
    expect(lastWithdrawSentence(state)).toBeNull()
  })

  it('returns a sentence for a withdrawn state', () => {
    const state = {
      activeEntryKey: '',
      lastWithdraw: {
        at: '2026-10-01T12:00:00Z',
        reason: CompletionWithdrawReason.NotComplete,
      },
    } as ProgramCompletionState
    const sentence = lastWithdrawSentence(state)
    expect(sentence).toContain('Withdrawn')
    expect(sentence).toContain("hasn't finished")
  })
})

// ─── eventSentence / sortEvents ──────────────────────────────────────────────

describe('eventSentence', () => {
  it('describes a confirm event', () => {
    const event = {
      id: 'ev-1',
      kind: 'confirm',
      program: ProgramCompletionProgram.FastPhonics,
      recordedAt: '2026-10-10T12:00:00Z',
      assertion: { observedOn: '2026-10-09' },
    } as ProgramCompletionEvent
    const sentence = eventSentence(event)
    expect(sentence).toContain('confirmed')
    expect(sentence).toContain('finished')
  })

  it('describes a withdraw event', () => {
    const event = {
      id: 'ev-2',
      kind: 'withdraw',
      program: ProgramCompletionProgram.FastPhonics,
      recordedAt: '2026-10-11T12:00:00Z',
      withdrawReason: CompletionWithdrawReason.Mistake,
    } as ProgramCompletionEvent
    const sentence = eventSentence(event)
    expect(sentence).toContain('withdrawn')
    expect(sentence).toContain('mistake')
  })

  it('describes a reviewed-apply event', () => {
    const event = {
      id: 'ev-3',
      kind: 'reviewed-apply',
      program: ProgramCompletionProgram.FastPhonics,
      recordedAt: '2026-10-12T12:00:00Z',
      mappingVersion: 2,
    } as ProgramCompletionEvent
    const sentence = eventSentence(event)
    expect(sentence).toContain('reviewed')
    expect(sentence).toContain('version 2')
  })
})

describe('sortEvents', () => {
  it('sorts newest first', () => {
    const events = [
      { id: 'a', recordedAt: '2026-09-01T00:00:00Z' },
      { id: 'b', recordedAt: '2026-10-01T00:00:00Z' },
      { id: 'c', recordedAt: '2026-08-01T00:00:00Z' },
    ] as ProgramCompletionEvent[]
    const sorted = sortEvents(events)
    expect(sorted[0].id).toBe('b')
    expect(sorted[1].id).toBe('a')
    expect(sorted[2].id).toBe('c')
  })

  it('breaks ties by id', () => {
    const events = [
      { id: 'b', recordedAt: '2026-10-01T00:00:00Z' },
      { id: 'a', recordedAt: '2026-10-01T00:00:00Z' },
    ] as ProgramCompletionEvent[]
    const sorted = sortEvents(events)
    expect(sorted[0].id).toBe('a')
    expect(sorted[1].id).toBe('b')
  })

  it('does not mutate the input array', () => {
    const events = [
      { id: 'b', recordedAt: '2026-10-01T00:00:00Z' },
      { id: 'a', recordedAt: '2026-09-01T00:00:00Z' },
    ] as ProgramCompletionEvent[]
    sortEvents(events)
    expect(events[0].id).toBe('b')
  })
})

// ─── newCompletionEntryKey ───────────────────────────────────────────────────

describe('newCompletionEntryKey', () => {
  it('returns a non-empty string', () => {
    const key = newCompletionEntryKey()
    expect(key.length).toBeGreaterThan(0)
  })

  it('returns unique keys on consecutive calls', () => {
    const a = newCompletionEntryKey()
    const b = newCompletionEntryKey()
    expect(a).not.toBe(b)
  })
})
