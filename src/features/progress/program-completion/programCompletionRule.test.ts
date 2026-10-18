import { describe, it, expect } from 'vitest'

import {
  CompletionAssistance,
  CompletionProjectionStatus,
  CompletionWithdrawReason,
  ProgramCompletionProgram,
} from '../../../core/types/programCompletion'
import type {
  ProgramCompletionEvent,
  ProgramCompletionState,
} from '../../../core/types/programCompletion'
import {
  NativeProgressMeaning,
  NativeProgressSource,
  NOTE_MAX_LENGTH,
} from '../../../core/types/nativeProgress'
import type { NativeProgressObservation } from '../../../core/types/nativeProgress'
import { FAST_PHONICS_FINAL_PEAK } from '../../../core/foundations/fastPhonicsCompletion'
import type { ProgramCompletionMapping } from '../../../core/foundations/fastPhonicsCompletion'

import {
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
  COMPLETION_PROGRAMS,
  OBSERVED_ON_FLOOR,
} from './programCompletionRule'

// ── Helpers ─────────────────────────────────────────────────────

function makeObservation(
  overrides: Partial<NativeProgressObservation> = {},
): NativeProgressObservation {
  return {
    id: 'obs-1',
    childId: 'child-1',
    program: 'fastPhonics',
    nativeNumber: FAST_PHONICS_FINAL_PEAK,
    meaning: NativeProgressMeaning.CompletedThrough,
    observedOn: '2026-10-10',
    source: NativeProgressSource.ParentReport,
    recordedAt: '2026-10-10T12:00:00Z',
    entryKey: 'ek-1',
    ...overrides,
  }
}

function makeState(
  overrides: Partial<ProgramCompletionState> = {},
): ProgramCompletionState {
  return {
    id: 'state-1',
    childId: 'child-1',
    program: ProgramCompletionProgram.FastPhonics,
    activeEntryKey: 'ek-1',
    activeAssertion: {
      observedOn: '2026-10-10',
      source: NativeProgressSource.ParentReport,
      assistance: CompletionAssistance.Unknown,
      reportedProgramVersion: 'unknown',
    },
    activeConfirmedAt: '2026-10-10T12:00:00Z',
    activeMappingVersion: 1,
    projection: {
      status: CompletionProjectionStatus.Applied,
      appliedMappingVersion: 1,
    },
    eventCount: 1,
    lastEventAt: '2026-10-10T12:00:00Z',
    updatedAt: '2026-10-10T12:00:00Z',
    ...overrides,
  }
}

// ── Tests ────────────────────────────────────────────────────────

describe('emptyCompletionDraft', () => {
  it('returns a draft with all defaults and the seeded date', () => {
    const draft = emptyCompletionDraft('2026-10-15')
    expect(draft.program).toBe(ProgramCompletionProgram.FastPhonics)
    expect(draft.observedOn).toBe('2026-10-15')
    expect(draft.source).toBe(NativeProgressSource.ParentReport)
    expect(draft.assistance).toBe(CompletionAssistance.Unknown)
    expect(draft.note).toBe('')
    expect(draft.reportObservationId).toBe('')
  })
})

describe('completionDraftIsEmpty', () => {
  it('returns true for an unmodified empty draft', () => {
    const draft = emptyCompletionDraft('2026-10-15')
    expect(completionDraftIsEmpty(draft, '2026-10-15')).toBe(true)
  })

  it('returns false when the date has changed', () => {
    const draft = emptyCompletionDraft('2026-10-15')
    draft.observedOn = '2026-10-16'
    expect(completionDraftIsEmpty(draft, '2026-10-15')).toBe(false)
  })

  it('returns false when a note has been typed', () => {
    const draft = emptyCompletionDraft('2026-10-15')
    draft.note = 'some note'
    expect(completionDraftIsEmpty(draft, '2026-10-15')).toBe(false)
  })

  it('returns false when a citation has been picked', () => {
    const draft = emptyCompletionDraft('2026-10-15')
    draft.reportObservationId = 'obs-1'
    expect(completionDraftIsEmpty(draft, '2026-10-15')).toBe(false)
  })

  it('returns false when assistance is changed', () => {
    const draft = emptyCompletionDraft('2026-10-15')
    draft.assistance = CompletionAssistance.Independent
    expect(completionDraftIsEmpty(draft, '2026-10-15')).toBe(false)
  })

  it('treats whitespace-only note as empty', () => {
    const draft = emptyCompletionDraft('2026-10-15')
    draft.note = '   '
    expect(completionDraftIsEmpty(draft, '2026-10-15')).toBe(true)
  })
})

describe('eligibleCitations', () => {
  it('returns rows matching program, meaning=CompletedThrough, and final peak', () => {
    const eligible = makeObservation()
    const rows = [eligible]
    const result = eligibleCitations(rows, ProgramCompletionProgram.FastPhonics)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('obs-1')
  })

  it('excludes rows with wrong meaning', () => {
    const rows = [
      makeObservation({ meaning: NativeProgressMeaning.WorkingOn }),
      makeObservation({ meaning: NativeProgressMeaning.Uncertain }),
    ]
    expect(eligibleCitations(rows, ProgramCompletionProgram.FastPhonics)).toHaveLength(0)
  })

  it('excludes rows with wrong number', () => {
    const rows = [makeObservation({ nativeNumber: 19 })]
    expect(eligibleCitations(rows, ProgramCompletionProgram.FastPhonics)).toHaveLength(0)
  })

  it('excludes rows that have been corrected', () => {
    const corrected = makeObservation({ id: 'obs-old' })
    const correction = makeObservation({
      id: 'obs-new',
      correctsObservationId: 'obs-old',
    })
    const result = eligibleCitations(
      [corrected, correction],
      ProgramCompletionProgram.FastPhonics,
    )
    expect(result.map((r) => r.id)).not.toContain('obs-old')
  })

  it('sorts newest first by observedOn', () => {
    const older = makeObservation({ id: 'obs-old', observedOn: '2026-09-01' })
    const newer = makeObservation({ id: 'obs-new', observedOn: '2026-10-10' })
    const result = eligibleCitations(
      [older, newer],
      ProgramCompletionProgram.FastPhonics,
    )
    expect(result[0].id).toBe('obs-new')
    expect(result[1].id).toBe('obs-old')
  })

  it('returns empty for an unknown program', () => {
    const rows = [makeObservation()]
    expect(eligibleCitations(rows, 'unknownProgram' as never)).toHaveLength(0)
  })
})

describe('citationLabel', () => {
  it('includes the number phrase, date and source', () => {
    const row = makeObservation({
      observedOn: '2026-10-10',
      source: NativeProgressSource.ParentReport,
    })
    const label = citationLabel(row)
    expect(label).toContain('peak 20')
    expect(label).toContain('Oct 10')
    expect(label).toContain('parent report')
  })
})

describe('reviewCompletionDraft', () => {
  const today = '2026-10-15'
  const validDraft = {
    program: ProgramCompletionProgram.FastPhonics,
    observedOn: '2026-10-10',
    source: NativeProgressSource.ParentReport,
    assistance: CompletionAssistance.Unknown,
    note: '',
    reportObservationId: '',
  }

  it('accepts a valid draft', () => {
    const result = reviewCompletionDraft(validDraft, today, [])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.reviewed.program).toBe(ProgramCompletionProgram.FastPhonics)
      expect(result.reviewed.observedOn).toBe('2026-10-10')
    }
  })

  it('rejects an invalid program', () => {
    const result = reviewCompletionDraft(
      { ...validDraft, program: 'bogus' as never },
      today,
      [],
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.program).toBeTruthy()
    }
  })

  it('rejects an invalid source', () => {
    const result = reviewCompletionDraft(
      { ...validDraft, source: 'smoke-signal' as never },
      today,
      [],
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.source).toBeTruthy()
    }
  })

  it('rejects an invalid assistance value', () => {
    const result = reviewCompletionDraft(
      { ...validDraft, assistance: 'cheated' as never },
      today,
      [],
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.assistance).toBeTruthy()
    }
  })

  it('rejects an empty date', () => {
    const result = reviewCompletionDraft(
      { ...validDraft, observedOn: '' },
      today,
      [],
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.observedOn).toContain('Pick the day')
    }
  })

  it('rejects an unparseable date', () => {
    const result = reviewCompletionDraft(
      { ...validDraft, observedOn: 'not-a-date' },
      today,
      [],
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.observedOn).toContain('real date')
    }
  })

  it('rejects a future date', () => {
    const result = reviewCompletionDraft(
      { ...validDraft, observedOn: '2099-01-01' },
      today,
      [],
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.observedOn).toContain("hasn't happened")
    }
  })

  it('rejects a date before the floor', () => {
    const result = reviewCompletionDraft(
      { ...validDraft, observedOn: '1999-01-01' },
      today,
      [],
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.observedOn).toContain('typo')
    }
  })

  it('rejects a note that exceeds the limit', () => {
    const result = reviewCompletionDraft(
      { ...validDraft, note: 'x'.repeat(NOTE_MAX_LENGTH + 1) },
      today,
      [],
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.note).toContain(`${NOTE_MAX_LENGTH}`)
    }
  })

  it('rejects an invalid citation', () => {
    const result = reviewCompletionDraft(
      { ...validDraft, reportObservationId: 'does-not-exist' },
      today,
      [],
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.reportObservationId).toBeTruthy()
    }
  })

  it('accepts a valid citation that matches an eligible row', () => {
    const row = makeObservation({ id: 'obs-valid' })
    const result = reviewCompletionDraft(
      { ...validDraft, reportObservationId: 'obs-valid' },
      today,
      [row],
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.reviewed.reportObservationId).toBe('obs-valid')
    }
  })

  it('reports multiple errors at once', () => {
    const result = reviewCompletionDraft(
      {
        program: 'bogus' as never,
        observedOn: '',
        source: 'nope' as never,
        assistance: 'nope' as never,
        note: 'x'.repeat(NOTE_MAX_LENGTH + 1),
        reportObservationId: '',
      },
      today,
      [],
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(Object.keys(result.errors).length).toBeGreaterThanOrEqual(4)
    }
  })

  it('strips empty note and empty citation from the reviewed output', () => {
    const result = reviewCompletionDraft(validDraft, today, [])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.reviewed).not.toHaveProperty('note')
      expect(result.reviewed).not.toHaveProperty('reportObservationId')
    }
  })

  it('keeps a non-empty note on the reviewed output', () => {
    const result = reviewCompletionDraft(
      { ...validDraft, note: 'He finished on a Saturday.' },
      today,
      [],
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.reviewed.note).toBe('He finished on a Saturday.')
    }
  })

  it('accepts today as the observed date', () => {
    const result = reviewCompletionDraft(
      { ...validDraft, observedOn: today },
      today,
      [],
    )
    expect(result.ok).toBe(true)
  })

  it('accepts the floor date itself', () => {
    const result = reviewCompletionDraft(
      { ...validDraft, observedOn: OBSERVED_ON_FLOOR },
      today,
      [],
    )
    expect(result.ok).toBe(true)
  })
})

describe('coverageSummary', () => {
  it('returns non-empty lines for FastPhonics', () => {
    const lines = coverageSummary(ProgramCompletionProgram.FastPhonics)
    expect(lines.length).toBeGreaterThan(0)
  })

  it('each line has conceptId, kidName, reach, and unit', () => {
    const lines = coverageSummary(ProgramCompletionProgram.FastPhonics)
    for (const line of lines) {
      expect(line.conceptId).toBeTruthy()
      expect(line.kidName).toBeTruthy()
      expect(['Covered', 'Covered in part']).toContain(line.reach)
      expect(line.unit).toBeTruthy()
    }
  })

  it('partial lines have a partialReason', () => {
    const lines = coverageSummary(ProgramCompletionProgram.FastPhonics)
    const partial = lines.filter((l) => l.reach === 'Covered in part')
    expect(partial.length).toBeGreaterThan(0)
    for (const line of partial) {
      expect(line.partialReason).toBeTruthy()
    }
  })

  it('full lines have no partialReason', () => {
    const lines = coverageSummary(ProgramCompletionProgram.FastPhonics)
    const full = lines.filter((l) => l.reach === 'Covered')
    for (const line of full) {
      expect(line.partialReason).toBeUndefined()
    }
  })

  it('returns empty for an unknown program', () => {
    expect(coverageSummary('bogus' as never)).toHaveLength(0)
  })
})

describe('coverageSummaryHeadline', () => {
  it('names the counts and explains what covered means', () => {
    const headline = coverageSummaryHeadline(ProgramCompletionProgram.FastPhonics)
    expect(headline).toContain('Finishing Fast Phonics covers')
    expect(headline).toContain('reading building block')
    expect(headline).toContain('Covered means the material was taught')
  })
})

describe('completionPreview', () => {
  it('names the child, the program and the date', () => {
    const reviewed = {
      program: ProgramCompletionProgram.FastPhonics,
      observedOn: '2026-10-10',
      source: NativeProgressSource.ParentReport,
      assistance: CompletionAssistance.Unknown,
    }
    const preview = completionPreview(reviewed, 'Lincoln', null)
    expect(preview).toContain('Lincoln')
    expect(preview).toContain('Fast Phonics')
    expect(preview).toContain('Oct 10')
    expect(preview).toContain('parent report')
  })

  it('includes citation when provided', () => {
    const reviewed = {
      program: ProgramCompletionProgram.FastPhonics,
      observedOn: '2026-10-10',
      source: NativeProgressSource.ParentReport,
      assistance: CompletionAssistance.Unknown,
    }
    const row = makeObservation()
    const preview = completionPreview(reviewed, 'Lincoln', row)
    expect(preview).toContain('Evidence:')
    expect(preview).toContain('peak 20')
  })
})

describe('completionSavedNotice', () => {
  const reviewed = {
    program: ProgramCompletionProgram.FastPhonics,
    observedOn: '2026-10-10',
    source: NativeProgressSource.ParentReport,
    assistance: CompletionAssistance.Unknown,
  }

  it('says "marked as covered" when applied', () => {
    const notice = completionSavedNotice(reviewed, 'Lincoln', true)
    expect(notice).toContain('Recorded for Lincoln')
    expect(notice).toContain('marked on his learning picture as covered')
    expect(notice).toContain('No hours, rewards or lesson numbers changed')
  })

  it('says "NOT marked yet" when not applied', () => {
    const notice = completionSavedNotice(reviewed, 'Lincoln', false)
    expect(notice).toContain('has NOT been marked yet')
  })
})

describe('completionAlreadyRecordedNotice', () => {
  it('names the child and says nothing was doubled', () => {
    expect(completionAlreadyRecordedNotice('Lincoln')).toBe(
      'Already recorded for Lincoln. Nothing was saved twice.',
    )
  })
})

describe('completionFailureNotice', () => {
  it('says the save was not confirmed and a retry is safe', () => {
    const notice = completionFailureNotice()
    expect(notice).toContain('not confirmed as saved')
    expect(notice).toContain('cannot be recorded twice')
  })
})

describe('completionNotSentNotice', () => {
  it('interpolates the reason', () => {
    const notice = completionNotSentNotice('the network is down')
    expect(notice).toContain('the network is down')
    expect(notice).toContain('Nothing was written')
  })
})

describe('completionStrandedTitle', () => {
  it('names the child', () => {
    expect(completionStrandedTitle('Lincoln')).toBe('Not confirmed for Lincoln')
  })
})

describe('completionStrandedNotice', () => {
  it('names the child twice and explains retry safety', () => {
    const notice = completionStrandedNotice('Lincoln')
    expect(notice).toContain('Lincoln')
    expect(notice).toContain('cannot be recorded twice')
  })
})

describe('completionStrandedRefusedTitle', () => {
  it('names the child', () => {
    expect(completionStrandedRefusedTitle('Lincoln')).toBe(
      'Trying again was refused for Lincoln',
    )
  })
})

describe('completionStrandedRefusedNotice', () => {
  it('includes the reason, the act label, and the child name', () => {
    const notice = completionStrandedRefusedNotice(
      'Lincoln',
      'confirm',
      'The cited row was corrected.',
    )
    expect(notice).toContain('The cited row was corrected.')
    expect(notice).toContain('confirmation')
    expect(notice).toContain('Lincoln')
  })

  it('uses "correction" for withdraw kind', () => {
    const notice = completionStrandedRefusedNotice('Lincoln', 'withdraw', 'reason')
    expect(notice).toContain('correction')
  })

  it('falls back when the reason is empty', () => {
    const notice = completionStrandedRefusedNotice('Lincoln', 'confirm', '')
    expect(notice).toContain('no reason given')
  })
})

describe('completionStrandedReasonLine', () => {
  it('scopes the reason to the attempt just now', () => {
    const line = completionStrandedReasonLine('Lincoln', 'confirm', 'Write failed.')
    expect(line).toContain('Write failed.')
    expect(line).toContain('about the try just now')
    expect(line).toContain('confirmation')
  })

  it('falls back for empty reason', () => {
    const line = completionStrandedReasonLine('Lincoln', 'withdraw', '')
    expect(line).toContain('could not be completed just now')
  })
})

describe('completionUnresolvedHoldLine', () => {
  it('names the child', () => {
    const line = completionUnresolvedHoldLine('Lincoln')
    expect(line).toContain('Lincoln')
    expect(line).toContain('settled')
  })
})

describe('completionUnresolvedHoldReason', () => {
  it('names the act and the child', () => {
    const reason = completionUnresolvedHoldReason('Lincoln', 'confirm')
    expect(reason).toContain('confirmation')
    expect(reason).toContain('Lincoln')
  })

  it('uses "correction" for withdraw', () => {
    const reason = completionUnresolvedHoldReason('Lincoln', 'withdraw')
    expect(reason).toContain('correction')
  })
})

describe('completionChildSwitchNotice', () => {
  it('returns null when neither draft nor save was present', () => {
    expect(completionChildSwitchNotice('Lincoln', false, false)).toBeNull()
  })

  it('mentions draft cleared when hadDraft is true', () => {
    const notice = completionChildSwitchNotice('Lincoln', true, false)
    expect(notice).toContain('Switched child')
    expect(notice).toContain('cleared and not saved')
    expect(notice).toContain('Lincoln')
  })

  it('mentions confirmed save when saveConfirmed is true', () => {
    const notice = completionChildSwitchNotice('Lincoln', false, true)
    expect(notice).toContain('confirmed')
    expect(notice).toContain('Lincoln')
  })

  it('includes both messages when both flags are true', () => {
    const notice = completionChildSwitchNotice('Lincoln', true, true)
    expect(notice).toContain('Switched child')
    expect(notice).toContain('confirmed')
  })
})

describe('activeCompletionSentence', () => {
  it('returns null when state is null', () => {
    expect(activeCompletionSentence(null, 'Lincoln')).toBeNull()
  })

  it('returns null when no activeEntryKey', () => {
    const state = makeState({ activeEntryKey: null, activeAssertion: null })
    expect(activeCompletionSentence(state, 'Lincoln')).toBeNull()
  })

  it('names the child and program when active', () => {
    const state = makeState()
    const sentence = activeCompletionSentence(state, 'Lincoln')
    expect(sentence).toContain('Lincoln')
    expect(sentence).toContain('Fast Phonics finished')
    expect(sentence).toContain('program version not recorded')
  })

  it('describes unknown assistance', () => {
    const state = makeState()
    const sentence = activeCompletionSentence(state, 'Lincoln')!
    expect(sentence).toContain('whether he had help is not recorded')
  })

  it('describes independent assistance', () => {
    const state = makeState({
      activeAssertion: {
        observedOn: '2026-10-10',
        source: NativeProgressSource.ParentReport,
        assistance: CompletionAssistance.Independent,
        reportedProgramVersion: 'unknown',
      },
    })
    const sentence = activeCompletionSentence(state, 'Lincoln')!
    expect(sentence).toContain('he did it on his own')
  })

  it('describes some-help assistance', () => {
    const state = makeState({
      activeAssertion: {
        observedOn: '2026-10-10',
        source: NativeProgressSource.ParentReport,
        assistance: CompletionAssistance.SomeHelp,
        reportedProgramVersion: 'unknown',
      },
    })
    const sentence = activeCompletionSentence(state, 'Lincoln')!
    expect(sentence).toContain('he had some help')
  })
})

describe('projectionStatusLine', () => {
  it('returns null for null state', () => {
    expect(projectionStatusLine(null)).toBeNull()
  })

  it('returns applied message', () => {
    const state = makeState()
    const line = projectionStatusLine(state)
    expect(line).toContain('Marked on his learning picture')
  })

  it('returns pending message', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.Pending },
    })
    const line = projectionStatusLine(state)
    expect(line).toContain('not been updated yet')
  })

  it('returns pending detail when available', () => {
    const state = makeState({
      projection: {
        status: CompletionProjectionStatus.Pending,
        detail: 'Custom detail here.',
      },
    })
    expect(projectionStatusLine(state)).toBe('Custom detail here.')
  })

  it('returns withdrawal-pending message', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.WithdrawalPending },
    })
    const line = projectionStatusLine(state)
    expect(line).toContain('still has to be updated')
  })

  it('returns detail for unknown status', () => {
    const state = makeState({
      projection: {
        status: CompletionProjectionStatus.Withdrawn,
        detail: 'Withdrawn detail.',
      },
    })
    expect(projectionStatusLine(state)).toBe('Withdrawn detail.')
  })

  it('returns null for unknown status with no detail', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.Withdrawn },
    })
    expect(projectionStatusLine(state)).toBeNull()
  })
})

describe('needsApplyRetry', () => {
  it('returns false for null', () => {
    expect(needsApplyRetry(null)).toBe(false)
  })

  it('returns true for Pending', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.Pending },
    })
    expect(needsApplyRetry(state)).toBe(true)
  })

  it('returns true for WithdrawalPending', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.WithdrawalPending },
    })
    expect(needsApplyRetry(state)).toBe(true)
  })

  it('returns false for Applied', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.Applied },
    })
    expect(needsApplyRetry(state)).toBe(false)
  })

  it('returns false for Withdrawn', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.Withdrawn },
    })
    expect(needsApplyRetry(state)).toBe(false)
  })
})

describe('mappingUpgradeAvailable', () => {
  const mapping: ProgramCompletionMapping = {
    sourceId: 'fastPhonics',
    label: 'Fast Phonics',
    mappingVersion: 2,
    scopeNote: '',
    targets: [],
    citableFinalPosition: 20,
  }

  it('returns false for null state', () => {
    expect(mappingUpgradeAvailable(null, mapping)).toBe(false)
  })

  it('returns false for null mapping', () => {
    expect(mappingUpgradeAvailable(makeState(), null)).toBe(false)
  })

  it('returns false when no active entry key', () => {
    const state = makeState({ activeEntryKey: null })
    expect(mappingUpgradeAvailable(state, mapping)).toBe(false)
  })

  it('returns false when not Applied', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.Pending },
    })
    expect(mappingUpgradeAvailable(state, mapping)).toBe(false)
  })

  it('returns false when applied version matches', () => {
    const state = makeState({
      projection: {
        status: CompletionProjectionStatus.Applied,
        appliedMappingVersion: 2,
      },
    })
    expect(mappingUpgradeAvailable(state, mapping)).toBe(false)
  })

  it('returns true when applied version is older', () => {
    const state = makeState({
      projection: {
        status: CompletionProjectionStatus.Applied,
        appliedMappingVersion: 1,
      },
    })
    expect(mappingUpgradeAvailable(state, mapping)).toBe(true)
  })

  it('returns false when appliedMappingVersion is undefined', () => {
    const state = makeState({
      projection: {
        status: CompletionProjectionStatus.Applied,
      },
    })
    expect(mappingUpgradeAvailable(state, mapping)).toBe(false)
  })
})

describe('mappingUpgradeLine', () => {
  const mapping: ProgramCompletionMapping = {
    sourceId: 'fastPhonics',
    label: 'Fast Phonics',
    mappingVersion: 2,
    scopeNote: '',
    targets: [],
    citableFinalPosition: 20,
  }

  it('returns null when no upgrade is available', () => {
    expect(mappingUpgradeLine(null, mapping)).toBeNull()
  })

  it('names both versions when an upgrade is available', () => {
    const state = makeState({
      projection: {
        status: CompletionProjectionStatus.Applied,
        appliedMappingVersion: 1,
      },
    })
    const line = mappingUpgradeLine(state, mapping)
    expect(line).toContain('version 1')
    expect(line).toContain('2')
    expect(line).toContain('reviewed since')
  })
})

describe('sourceConflictNotice', () => {
  it('returns null when no conflict', () => {
    expect(sourceConflictNotice(makeState())).toBeNull()
  })

  it('returns the conflict detail', () => {
    const state = makeState({
      sourceConflict: {
        reportObservationId: 'obs-1',
        correctedByObservationId: 'obs-2',
        noticedAt: '2026-10-12T00:00:00Z',
        detail: 'The row was corrected.',
      },
    })
    expect(sourceConflictNotice(state)).toBe('The row was corrected.')
  })
})

describe('lastWithdrawSentence', () => {
  it('returns null for null state', () => {
    expect(lastWithdrawSentence(null)).toBeNull()
  })

  it('returns null when there is an active entry', () => {
    const state = makeState({
      lastWithdraw: {
        entryKey: 'ek-w',
        reason: CompletionWithdrawReason.Mistake,
        at: '2026-10-12T00:00:00Z',
      },
    })
    expect(lastWithdrawSentence(state)).toBeNull()
  })

  it('returns a sentence when withdrawn and no active entry', () => {
    const state = makeState({
      activeEntryKey: null,
      activeAssertion: null,
      lastWithdraw: {
        entryKey: 'ek-w',
        reason: CompletionWithdrawReason.NotComplete,
        at: '2026-10-12T00:00:00Z',
      },
    })
    const sentence = lastWithdrawSentence(state)
    expect(sentence).toContain('Withdrawn')
    expect(sentence).toContain("hasn't finished it after all")
  })
})

describe('eventSentence', () => {
  it('describes a confirm event', () => {
    const event: ProgramCompletionEvent = {
      id: 'evt-1',
      childId: 'child-1',
      program: ProgramCompletionProgram.FastPhonics,
      entryKey: 'ek-1',
      kind: 'confirm',
      recordedAt: '2026-10-10T12:00:00Z',
      mappingVersion: 1,
      assertion: {
        observedOn: '2026-10-08',
        source: NativeProgressSource.ParentReport,
        assistance: CompletionAssistance.Unknown,
        reportedProgramVersion: 'unknown',
      },
    }
    const sentence = eventSentence(event)
    expect(sentence).toContain('you confirmed')
    expect(sentence).toContain('Fast Phonics')
    expect(sentence).toContain('Oct 8')
  })

  it('describes a withdraw event', () => {
    const event: ProgramCompletionEvent = {
      id: 'evt-2',
      childId: 'child-1',
      program: ProgramCompletionProgram.FastPhonics,
      entryKey: 'ek-2',
      kind: 'withdraw',
      recordedAt: '2026-10-12T12:00:00Z',
      mappingVersion: 1,
      withdrawReason: CompletionWithdrawReason.Partial,
    }
    const sentence = eventSentence(event)
    expect(sentence).toContain('withdrawn')
    expect(sentence).toContain("partway through")
  })

  it('describes a reapply event', () => {
    const event: ProgramCompletionEvent = {
      id: 'evt-3',
      childId: 'child-1',
      program: ProgramCompletionProgram.FastPhonics,
      entryKey: 'ek-3',
      kind: 'reapply',
      recordedAt: '2026-10-14T12:00:00Z',
      mappingVersion: 2,
    }
    const sentence = eventSentence(event)
    expect(sentence).toContain('coverage map was applied')
    expect(sentence).toContain('version 2')
  })
})

describe('sortEvents', () => {
  it('sorts newest first by recordedAt', () => {
    const events: ProgramCompletionEvent[] = [
      {
        id: 'evt-a',
        childId: 'c1',
        program: ProgramCompletionProgram.FastPhonics,
        entryKey: 'ek-a',
        kind: 'confirm',
        recordedAt: '2026-10-01T00:00:00Z',
        mappingVersion: 1,
      },
      {
        id: 'evt-b',
        childId: 'c1',
        program: ProgramCompletionProgram.FastPhonics,
        entryKey: 'ek-b',
        kind: 'withdraw',
        recordedAt: '2026-10-05T00:00:00Z',
        mappingVersion: 1,
      },
    ]
    const sorted = sortEvents(events)
    expect(sorted[0].id).toBe('evt-b')
    expect(sorted[1].id).toBe('evt-a')
  })

  it('breaks ties by id', () => {
    const events: ProgramCompletionEvent[] = [
      {
        id: 'evt-z',
        childId: 'c1',
        program: ProgramCompletionProgram.FastPhonics,
        entryKey: 'ek-z',
        kind: 'confirm',
        recordedAt: '2026-10-01T00:00:00Z',
        mappingVersion: 1,
      },
      {
        id: 'evt-a',
        childId: 'c1',
        program: ProgramCompletionProgram.FastPhonics,
        entryKey: 'ek-a',
        kind: 'confirm',
        recordedAt: '2026-10-01T00:00:00Z',
        mappingVersion: 1,
      },
    ]
    const sorted = sortEvents(events)
    expect(sorted[0].id).toBe('evt-a')
    expect(sorted[1].id).toBe('evt-z')
  })

  it('does not mutate the original array', () => {
    const events: ProgramCompletionEvent[] = [
      {
        id: 'evt-2',
        childId: 'c1',
        program: ProgramCompletionProgram.FastPhonics,
        entryKey: 'ek-2',
        kind: 'confirm',
        recordedAt: '2026-10-05T00:00:00Z',
        mappingVersion: 1,
      },
      {
        id: 'evt-1',
        childId: 'c1',
        program: ProgramCompletionProgram.FastPhonics,
        entryKey: 'ek-1',
        kind: 'confirm',
        recordedAt: '2026-10-01T00:00:00Z',
        mappingVersion: 1,
      },
    ]
    sortEvents(events)
    expect(events[0].id).toBe('evt-2')
  })
})

describe('newCompletionEntryKey', () => {
  it('returns a non-empty string', () => {
    const key = newCompletionEntryKey()
    expect(key.length).toBeGreaterThan(0)
  })

  it('returns different keys on successive calls', () => {
    const a = newCompletionEntryKey()
    const b = newCompletionEntryKey()
    expect(a).not.toBe(b)
  })
})

describe('COMPLETION_PROGRAMS', () => {
  it('contains FastPhonics', () => {
    expect(COMPLETION_PROGRAMS).toContain(ProgramCompletionProgram.FastPhonics)
  })
})
