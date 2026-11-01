import { describe, expect, it } from 'vitest'

import {
  CompletionAssistance,
  CompletionProjectionStatus,
  CompletionWithdrawReason,
  ProgramCompletionProgram,
} from '../../../core/types/programCompletion'
import type {
  ProgramCompletionAssertion,
  ProgramCompletionEvent,
  ProgramCompletionState,
} from '../../../core/types/programCompletion'
import {
  NativeProgressMeaning,
  NativeProgressSource,
  NOTE_MAX_LENGTH,
} from '../../../core/types/nativeProgress'
import type { NativeProgressObservation } from '../../../core/types/nativeProgress'
import {
  ASSISTANCE_CHOICES,
  ASSISTANCE_LABEL,
  COMPLETION_PROGRAMS,
  COMPLETION_SCOPE_NOTICE,
  COMPLETION_STATE_UNKNOWN,
  COMPLETION_STATE_UNREADABLE,
  OBSERVED_ON_FLOOR,
  WITHDRAW_REASON_CHOICES,
  WITHDRAW_REASON_LABEL,
  activeCompletionSentence,
  citationLabel,
  completionAlreadyRecordedNotice,
  completionChildSwitchNotice,
  completionDraftIsEmpty,
  completionFailureNotice,
  completionNotSentNotice,
  completionPreview,
  completionSavedNotice,
  completionStrandedNotice,
  completionStrandedReasonLine,
  completionStrandedRefusedNotice,
  completionStrandedRefusedTitle,
  completionStrandedTitle,
  completionUnresolvedHoldLine,
  completionUnresolvedHoldReason,
  coverageSummary,
  coverageSummaryHeadline,
  eligibleCitations,
  emptyCompletionDraft,
  eventSentence,
  lastWithdrawSentence,
  mappingUpgradeAvailable,
  mappingUpgradeLine,
  needsApplyRetry,
  newCompletionEntryKey,
  projectionStatusLine,
  reviewCompletionDraft,
  sortEvents,
  sourceConflictNotice,
} from './programCompletionRule'

// ─── Helpers ────────────────────────────────────────────────────────────────

const TODAY = '2026-10-15'

function makeObservation(
  overrides: Partial<NativeProgressObservation> = {},
): NativeProgressObservation {
  return {
    id: 'obs-1',
    childId: 'child-1',
    program: 'fastPhonics',
    nativeNumber: 20,
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
    activeConfirmedAt: '2026-10-10T14:00:00Z',
    activeMappingVersion: 1,
    projection: {
      status: CompletionProjectionStatus.Applied,
      appliedMappingVersion: 1,
    },
    eventCount: 1,
    lastEventAt: '2026-10-10T14:00:00Z',
    updatedAt: '2026-10-10T14:00:00Z',
    ...overrides,
  }
}

function makeEvent(
  overrides: Partial<ProgramCompletionEvent> = {},
): ProgramCompletionEvent {
  return {
    id: 'ev-1',
    childId: 'child-1',
    program: ProgramCompletionProgram.FastPhonics,
    entryKey: 'ek-1',
    kind: 'confirm',
    recordedAt: '2026-10-10T14:00:00Z',
    mappingVersion: 1,
    ...overrides,
  }
}

// ─── Constants ──────────────────────────────────────────────────────────────

describe('exported constants', () => {
  it('COMPLETION_PROGRAMS includes FastPhonics', () => {
    expect(COMPLETION_PROGRAMS).toContain(ProgramCompletionProgram.FastPhonics)
  })

  it('ASSISTANCE_LABEL covers all CompletionAssistance values', () => {
    for (const a of Object.values(CompletionAssistance)) {
      expect(ASSISTANCE_LABEL[a]).toBeDefined()
    }
  })

  it('ASSISTANCE_CHOICES includes all values', () => {
    for (const a of Object.values(CompletionAssistance)) {
      expect(ASSISTANCE_CHOICES).toContain(a)
    }
  })

  it('WITHDRAW_REASON_LABEL covers all CompletionWithdrawReason values', () => {
    for (const r of Object.values(CompletionWithdrawReason)) {
      expect(WITHDRAW_REASON_LABEL[r]).toBeDefined()
    }
  })

  it('WITHDRAW_REASON_CHOICES excludes SourceCorrected (app-only)', () => {
    expect(WITHDRAW_REASON_CHOICES).not.toContain(
      CompletionWithdrawReason.SourceCorrected,
    )
  })

  it('COMPLETION_SCOPE_NOTICE says "not a test" and "not mastered"', () => {
    expect(COMPLETION_SCOPE_NOTICE).toContain('not a test')
    expect(COMPLETION_SCOPE_NOTICE).toContain('mastered')
  })

  it('COMPLETION_STATE_UNKNOWN mentions loading', () => {
    expect(COMPLETION_STATE_UNKNOWN).toContain('loaded')
  })

  it('COMPLETION_STATE_UNREADABLE says nothing was changed', () => {
    expect(COMPLETION_STATE_UNREADABLE).toContain('Nothing has been changed')
  })

  it('OBSERVED_ON_FLOOR is 2000-01-01', () => {
    expect(OBSERVED_ON_FLOOR).toBe('2000-01-01')
  })
})

// ─── emptyCompletionDraft ───────────────────────────────────────────────────

describe('emptyCompletionDraft', () => {
  it('returns defaults with the given date', () => {
    const draft = emptyCompletionDraft('2026-10-15')
    expect(draft.program).toBe(ProgramCompletionProgram.FastPhonics)
    expect(draft.observedOn).toBe('2026-10-15')
    expect(draft.source).toBe(NativeProgressSource.ParentReport)
    expect(draft.assistance).toBe(CompletionAssistance.Unknown)
    expect(draft.note).toBe('')
    expect(draft.reportObservationId).toBe('')
  })
})

// ─── completionDraftIsEmpty ─────────────────────────────────────────────────

describe('completionDraftIsEmpty', () => {
  it('returns true for a fresh draft with the seeded date', () => {
    const draft = emptyCompletionDraft('2026-10-15')
    expect(completionDraftIsEmpty(draft, '2026-10-15')).toBe(true)
  })

  it('returns false when date differs from seed', () => {
    const draft = emptyCompletionDraft('2026-10-15')
    draft.observedOn = '2026-10-16'
    expect(completionDraftIsEmpty(draft, '2026-10-15')).toBe(false)
  })

  it('returns false when note is non-empty', () => {
    const draft = emptyCompletionDraft('2026-10-15')
    draft.note = 'He finished last week.'
    expect(completionDraftIsEmpty(draft, '2026-10-15')).toBe(false)
  })

  it('returns true when note is whitespace only', () => {
    const draft = emptyCompletionDraft('2026-10-15')
    draft.note = '   '
    expect(completionDraftIsEmpty(draft, '2026-10-15')).toBe(true)
  })

  it('returns false when reportObservationId is set', () => {
    const draft = emptyCompletionDraft('2026-10-15')
    draft.reportObservationId = 'obs-1'
    expect(completionDraftIsEmpty(draft, '2026-10-15')).toBe(false)
  })

  it('returns false when assistance is changed', () => {
    const draft = emptyCompletionDraft('2026-10-15')
    draft.assistance = CompletionAssistance.Independent
    expect(completionDraftIsEmpty(draft, '2026-10-15')).toBe(false)
  })

  it('returns false when source is changed', () => {
    const draft = emptyCompletionDraft('2026-10-15')
    draft.source = NativeProgressSource.Certificate
    expect(completionDraftIsEmpty(draft, '2026-10-15')).toBe(false)
  })
})

// ─── eligibleCitations ──────────────────────────────────────────────────────

describe('eligibleCitations', () => {
  it('returns rows matching the program, CompletedThrough, and at peak 20', () => {
    const rows = [makeObservation()]
    const result = eligibleCitations(rows, ProgramCompletionProgram.FastPhonics)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('obs-1')
  })

  it('excludes rows with wrong program', () => {
    const rows = [makeObservation({ program: 'mathseeds' })]
    const result = eligibleCitations(rows, ProgramCompletionProgram.FastPhonics)
    expect(result).toHaveLength(0)
  })

  it('excludes rows with WorkingOn meaning', () => {
    const rows = [makeObservation({ meaning: NativeProgressMeaning.WorkingOn })]
    const result = eligibleCitations(rows, ProgramCompletionProgram.FastPhonics)
    expect(result).toHaveLength(0)
  })

  it('excludes rows with Uncertain meaning', () => {
    const rows = [makeObservation({ meaning: NativeProgressMeaning.Uncertain })]
    const result = eligibleCitations(rows, ProgramCompletionProgram.FastPhonics)
    expect(result).toHaveLength(0)
  })

  it('excludes rows not at the final position (peak != 20)', () => {
    const rows = [makeObservation({ nativeNumber: 19 })]
    const result = eligibleCitations(rows, ProgramCompletionProgram.FastPhonics)
    expect(result).toHaveLength(0)
  })

  it('excludes rows past the final position (peak > 20)', () => {
    const rows = [makeObservation({ nativeNumber: 24 })]
    const result = eligibleCitations(rows, ProgramCompletionProgram.FastPhonics)
    expect(result).toHaveLength(0)
  })

  it('excludes corrected rows', () => {
    const corrected = makeObservation({ id: 'obs-1' })
    const correction = makeObservation({
      id: 'obs-2',
      correctsObservationId: 'obs-1',
      observedOn: '2026-10-12',
    })
    const rows = [corrected, correction]
    const result = eligibleCitations(rows, ProgramCompletionProgram.FastPhonics)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('obs-2')
  })

  it('sorts by observedOn descending (newest first)', () => {
    const rows = [
      makeObservation({ id: 'obs-old', observedOn: '2026-09-01' }),
      makeObservation({ id: 'obs-new', observedOn: '2026-10-10' }),
    ]
    const result = eligibleCitations(rows, ProgramCompletionProgram.FastPhonics)
    expect(result[0].id).toBe('obs-new')
    expect(result[1].id).toBe('obs-old')
  })

  it('returns empty for an unknown program', () => {
    const rows = [makeObservation()]
    const result = eligibleCitations(rows, 'unknownProgram' as never)
    expect(result).toHaveLength(0)
  })

  it('returns empty for empty rows', () => {
    expect(eligibleCitations([], ProgramCompletionProgram.FastPhonics)).toHaveLength(0)
  })
})

// ─── citationLabel ──────────────────────────────────────────────────────────

describe('citationLabel', () => {
  it('produces a readable label with numberPhrase, date and source', () => {
    const row = makeObservation()
    const label = citationLabel(row)
    expect(label).toContain('finished through peak 20')
    expect(label).toContain('parent report')
  })
})

// ─── reviewCompletionDraft ──────────────────────────────────────────────────

describe('reviewCompletionDraft', () => {
  const validDraft = () => ({
    ...emptyCompletionDraft('2026-10-10'),
    observedOn: '2026-10-10',
  })

  it('accepts a valid draft', () => {
    const result = reviewCompletionDraft(validDraft(), TODAY, [])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.reviewed.program).toBe(ProgramCompletionProgram.FastPhonics)
      expect(result.reviewed.observedOn).toBe('2026-10-10')
      expect(result.reviewed.source).toBe(NativeProgressSource.ParentReport)
      expect(result.reviewed.assistance).toBe(CompletionAssistance.Unknown)
    }
  })

  it('strips empty note from reviewed output', () => {
    const result = reviewCompletionDraft(validDraft(), TODAY, [])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.reviewed.note).toBeUndefined()
    }
  })

  it('includes trimmed note when non-empty', () => {
    const draft = { ...validDraft(), note: '  Finished last week  ' }
    const result = reviewCompletionDraft(draft, TODAY, [])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.reviewed.note).toBe('Finished last week')
    }
  })

  it('strips empty reportObservationId from reviewed output', () => {
    const result = reviewCompletionDraft(validDraft(), TODAY, [])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.reviewed.reportObservationId).toBeUndefined()
    }
  })

  it('includes reportObservationId when valid and eligible', () => {
    const row = makeObservation({ id: 'obs-cited' })
    const draft = { ...validDraft(), reportObservationId: 'obs-cited' }
    const result = reviewCompletionDraft(draft, TODAY, [row])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.reviewed.reportObservationId).toBe('obs-cited')
    }
  })

  // ── Date validation ──

  it('rejects empty date', () => {
    const draft = { ...validDraft(), observedOn: '' }
    const result = reviewCompletionDraft(draft, TODAY, [])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.observedOn).toContain('Pick the day')
    }
  })

  it('rejects unparseable date', () => {
    const draft = { ...validDraft(), observedOn: 'not-a-date' }
    const result = reviewCompletionDraft(draft, TODAY, [])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.observedOn).toContain('real date')
    }
  })

  it('rejects future date', () => {
    const draft = { ...validDraft(), observedOn: '2026-10-20' }
    const result = reviewCompletionDraft(draft, TODAY, [])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.observedOn).toContain("hasn't happened")
    }
  })

  it('rejects date before floor', () => {
    const draft = { ...validDraft(), observedOn: '1999-12-31' }
    const result = reviewCompletionDraft(draft, TODAY, [])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.observedOn).toContain('typo')
    }
  })

  it('accepts date exactly at floor', () => {
    const draft = { ...validDraft(), observedOn: OBSERVED_ON_FLOOR }
    const result = reviewCompletionDraft(draft, TODAY, [])
    expect(result.ok).toBe(true)
  })

  it('accepts date exactly at today', () => {
    const draft = { ...validDraft(), observedOn: TODAY }
    const result = reviewCompletionDraft(draft, TODAY, [])
    expect(result.ok).toBe(true)
  })

  // ── Note validation ──

  it('rejects note exceeding max length', () => {
    const draft = { ...validDraft(), note: 'x'.repeat(NOTE_MAX_LENGTH + 1) }
    const result = reviewCompletionDraft(draft, TODAY, [])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.note).toContain(`${NOTE_MAX_LENGTH}`)
    }
  })

  it('accepts note at exactly max length', () => {
    const draft = { ...validDraft(), note: 'x'.repeat(NOTE_MAX_LENGTH) }
    const result = reviewCompletionDraft(draft, TODAY, [])
    expect(result.ok).toBe(true)
  })

  // ── Citation validation ──

  it('rejects citation not in eligible list', () => {
    const draft = { ...validDraft(), reportObservationId: 'obs-nonexistent' }
    const result = reviewCompletionDraft(draft, TODAY, [])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.reportObservationId).toContain(
        'does not say this program was finished',
      )
    }
  })

  it('rejects citation pointing at a row that is not CompletedThrough', () => {
    const row = makeObservation({
      id: 'obs-wip',
      meaning: NativeProgressMeaning.WorkingOn,
    })
    const draft = { ...validDraft(), reportObservationId: 'obs-wip' }
    const result = reviewCompletionDraft(draft, TODAY, [row])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.reportObservationId).toBeDefined()
    }
  })

  // ── Multiple errors at once ──

  it('reports all errors simultaneously', () => {
    const draft = {
      ...validDraft(),
      observedOn: '',
      note: 'x'.repeat(NOTE_MAX_LENGTH + 1),
      reportObservationId: 'nonexistent',
    }
    const result = reviewCompletionDraft(draft, TODAY, [])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.observedOn).toBeDefined()
      expect(result.errors.note).toBeDefined()
      expect(result.errors.reportObservationId).toBeDefined()
    }
  })
})

// ─── coverageSummary ────────────────────────────────────────────────────────

describe('coverageSummary', () => {
  it('returns a non-empty list for FastPhonics', () => {
    const lines = coverageSummary(ProgramCompletionProgram.FastPhonics)
    expect(lines.length).toBeGreaterThan(0)
  })

  it('every line has a conceptId and kidName', () => {
    const lines = coverageSummary(ProgramCompletionProgram.FastPhonics)
    for (const line of lines) {
      expect(line.conceptId).toBeTruthy()
      expect(line.kidName).toBeTruthy()
    }
  })

  it('reach is either "Covered" or "Covered in part" (never mastered)', () => {
    const lines = coverageSummary(ProgramCompletionProgram.FastPhonics)
    for (const line of lines) {
      expect(['Covered', 'Covered in part']).toContain(line.reach)
    }
  })

  it('partial lines have a partialReason', () => {
    const lines = coverageSummary(ProgramCompletionProgram.FastPhonics)
    const partial = lines.filter((l) => l.reach === 'Covered in part')
    for (const line of partial) {
      expect(line.partialReason).toBeTruthy()
    }
  })

  it('returns empty for an unknown program', () => {
    expect(coverageSummary('nope' as never)).toHaveLength(0)
  })
})

// ─── coverageSummaryHeadline ────────────────────────────────────────────────

describe('coverageSummaryHeadline', () => {
  it('mentions "Covered means the material was taught"', () => {
    const headline = coverageSummaryHeadline(ProgramCompletionProgram.FastPhonics)
    expect(headline).toContain('Covered means the material was taught')
  })

  it('counts concepts correctly', () => {
    const headline = coverageSummaryHeadline(ProgramCompletionProgram.FastPhonics)
    const lines = coverageSummary(ProgramCompletionProgram.FastPhonics)
    const partial = lines.filter((l) => l.reach === 'Covered in part').length
    expect(headline).toContain(`part of ${partial} more`)
  })
})

// ─── completionPreview ──────────────────────────────────────────────────────

describe('completionPreview', () => {
  it('includes child name and program label', () => {
    const reviewed = {
      program: ProgramCompletionProgram.FastPhonics,
      observedOn: '2026-10-10',
      source: NativeProgressSource.ParentReport,
      assistance: CompletionAssistance.Unknown,
    }
    const preview = completionPreview(reviewed, 'Lincoln', null)
    expect(preview).toContain('Lincoln')
    expect(preview).toContain('finished')
    expect(preview).toContain('parent report')
  })

  it('includes citation label when a citation is provided', () => {
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

// ─── completionSavedNotice ──────────────────────────────────────────────────

describe('completionSavedNotice', () => {
  const reviewed = {
    program: ProgramCompletionProgram.FastPhonics,
    observedOn: '2026-10-10',
    source: NativeProgressSource.ParentReport,
    assistance: CompletionAssistance.Unknown,
  }

  it('when applied, mentions "marked" and "not as mastered"', () => {
    const notice = completionSavedNotice(reviewed, 'Lincoln', true)
    expect(notice).toContain('Lincoln')
    expect(notice).toContain('not as mastered')
    expect(notice).toContain('No hours, rewards or lesson numbers changed')
  })

  it('when not applied, mentions NOT been marked yet', () => {
    const notice = completionSavedNotice(reviewed, 'Lincoln', false)
    expect(notice).toContain('has NOT been marked yet')
  })
})

// ─── simple notice functions ────────────────────────────────────────────────

describe('simple notice functions', () => {
  it('completionAlreadyRecordedNotice names the child', () => {
    expect(completionAlreadyRecordedNotice('Lincoln')).toContain('Lincoln')
    expect(completionAlreadyRecordedNotice('Lincoln')).toContain('Already recorded')
  })

  it('completionFailureNotice says not confirmed', () => {
    expect(completionFailureNotice()).toContain('not confirmed as saved')
  })

  it('completionNotSentNotice includes the reason', () => {
    expect(completionNotSentNotice('network error')).toContain('network error')
    expect(completionNotSentNotice('network error')).toContain('not sent')
  })

  it('completionStrandedTitle names the child', () => {
    expect(completionStrandedTitle('Lincoln')).toContain('Lincoln')
    expect(completionStrandedTitle('Lincoln')).toContain('Not confirmed')
  })

  it('completionStrandedNotice names the child and mentions retry safety', () => {
    const notice = completionStrandedNotice('Lincoln')
    expect(notice).toContain('Lincoln')
    expect(notice).toContain('cannot be recorded twice')
  })

  it('completionStrandedRefusedTitle names the child', () => {
    expect(completionStrandedRefusedTitle('Lincoln')).toContain('Lincoln')
    expect(completionStrandedRefusedTitle('Lincoln')).toContain('refused')
  })

  it('completionStrandedRefusedNotice includes reason and kind', () => {
    const notice = completionStrandedRefusedNotice(
      'Lincoln',
      'confirm',
      'Citation was corrected',
    )
    expect(notice).toContain('Citation was corrected')
    expect(notice).toContain('confirmation')
    expect(notice).toContain('Lincoln')
  })

  it('completionStrandedRefusedNotice falls back for empty reason', () => {
    const notice = completionStrandedRefusedNotice('Lincoln', 'withdraw', '')
    expect(notice).toContain('refused, with no reason given')
  })

  it('completionStrandedReasonLine includes reason, kind, and child', () => {
    const line = completionStrandedReasonLine(
      'Lincoln',
      'confirm',
      'A check failed.',
    )
    expect(line).toContain('A check failed.')
    expect(line).toContain('confirmation')
    expect(line).toContain('Lincoln')
  })

  it('completionStrandedReasonLine falls back for empty reason', () => {
    const line = completionStrandedReasonLine('Lincoln', 'withdraw', '')
    expect(line).toContain('A check could not be completed')
  })

  it('completionUnresolvedHoldLine names the child', () => {
    expect(completionUnresolvedHoldLine('Lincoln')).toContain('Lincoln')
  })

  it('completionUnresolvedHoldReason names the kind', () => {
    const reason = completionUnresolvedHoldReason('Lincoln', 'confirm')
    expect(reason).toContain('confirmation')
    expect(reason).toContain('Lincoln')
  })
})

// ─── completionChildSwitchNotice ────────────────────────────────────────────

describe('completionChildSwitchNotice', () => {
  it('returns null when nothing was in progress', () => {
    expect(completionChildSwitchNotice('Lincoln', false, false)).toBeNull()
  })

  it('mentions cleared draft when hadDraft is true', () => {
    const notice = completionChildSwitchNotice('Lincoln', true, false)
    expect(notice).toContain('cleared')
    expect(notice).toContain('Lincoln')
  })

  it('mentions confirmed records when saveConfirmed is true', () => {
    const notice = completionChildSwitchNotice('Lincoln', false, true)
    expect(notice).toContain('Lincoln')
    expect(notice).toContain('already confirmed')
  })

  it('combines both messages when both flags are true', () => {
    const notice = completionChildSwitchNotice('Lincoln', true, true)
    expect(notice).toContain('cleared')
    expect(notice).toContain('already confirmed')
  })
})

// ─── activeCompletionSentence ───────────────────────────────────────────────

describe('activeCompletionSentence', () => {
  it('returns null when state is null', () => {
    expect(activeCompletionSentence(null, 'Lincoln')).toBeNull()
  })

  it('returns null when no active entry', () => {
    const state = makeState({ activeEntryKey: null, activeAssertion: null })
    expect(activeCompletionSentence(state, 'Lincoln')).toBeNull()
  })

  it('describes the active completion for Unknown assistance', () => {
    const state = makeState()
    const sentence = activeCompletionSentence(state, 'Lincoln')!
    expect(sentence).toContain('Lincoln')
    expect(sentence).toContain('finished')
    expect(sentence).toContain('whether he had help is not recorded')
    expect(sentence).toContain('program version not recorded')
  })

  it('describes Independent assistance', () => {
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

  it('describes SomeHelp assistance', () => {
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

// ─── projectionStatusLine ───────────────────────────────────────────────────

describe('projectionStatusLine', () => {
  it('returns null for null state', () => {
    expect(projectionStatusLine(null)).toBeNull()
  })

  it('returns applied text for Applied status', () => {
    const state = makeState()
    const line = projectionStatusLine(state)!
    expect(line).toContain('Marked on his learning picture')
  })

  it('returns pending text for Pending status', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.Pending },
    })
    const line = projectionStatusLine(state)!
    expect(line).toContain('not been updated yet')
  })

  it('returns custom detail when present on Pending', () => {
    const state = makeState({
      projection: {
        status: CompletionProjectionStatus.Pending,
        detail: 'Custom pending detail.',
      },
    })
    expect(projectionStatusLine(state)).toBe('Custom pending detail.')
  })

  it('returns withdrawal pending text', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.WithdrawalPending },
    })
    const line = projectionStatusLine(state)!
    expect(line).toContain('Withdrawn')
    expect(line).toContain('still has to be updated')
  })

  it('returns detail for Withdrawn status if present', () => {
    const state = makeState({
      projection: {
        status: CompletionProjectionStatus.Withdrawn,
        detail: 'Fully cleared.',
      },
    })
    expect(projectionStatusLine(state)).toBe('Fully cleared.')
  })

  it('returns null for Withdrawn with no detail', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.Withdrawn },
    })
    expect(projectionStatusLine(state)).toBeNull()
  })
})

// ─── needsApplyRetry ────────────────────────────────────────────────────────

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
    expect(needsApplyRetry(makeState())).toBe(false)
  })

  it('returns false for Withdrawn', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.Withdrawn },
    })
    expect(needsApplyRetry(state)).toBe(false)
  })
})

// ─── mappingUpgradeAvailable ────────────────────────────────────────────────

describe('mappingUpgradeAvailable', () => {
  it('returns false for null state', () => {
    expect(mappingUpgradeAvailable(null, null)).toBe(false)
  })

  it('returns false when no active entry', () => {
    const state = makeState({ activeEntryKey: null })
    expect(mappingUpgradeAvailable(state, null)).toBe(false)
  })

  it('returns false when not Applied', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.Pending },
    })
    expect(mappingUpgradeAvailable(state, { mappingVersion: 2 } as never)).toBe(false)
  })

  it('returns true when mapping version is newer', () => {
    const state = makeState({
      projection: {
        status: CompletionProjectionStatus.Applied,
        appliedMappingVersion: 1,
      },
    })
    expect(mappingUpgradeAvailable(state, { mappingVersion: 2 } as never)).toBe(true)
  })

  it('returns false when mapping version is same', () => {
    const state = makeState({
      projection: {
        status: CompletionProjectionStatus.Applied,
        appliedMappingVersion: 1,
      },
    })
    expect(mappingUpgradeAvailable(state, { mappingVersion: 1 } as never)).toBe(false)
  })
})

// ─── mappingUpgradeLine ─────────────────────────────────────────────────────

describe('mappingUpgradeLine', () => {
  it('returns null when no upgrade available', () => {
    expect(mappingUpgradeLine(null, null)).toBeNull()
  })

  it('returns a line naming both versions when available', () => {
    const state = makeState({
      projection: {
        status: CompletionProjectionStatus.Applied,
        appliedMappingVersion: 1,
      },
    })
    const line = mappingUpgradeLine(state, { mappingVersion: 2 } as never)
    expect(line).toContain('version 1')
    expect(line).toContain('2')
  })
})

// ─── sourceConflictNotice ───────────────────────────────────────────────────

describe('sourceConflictNotice', () => {
  it('returns null when no conflict', () => {
    expect(sourceConflictNotice(null)).toBeNull()
    expect(sourceConflictNotice(makeState())).toBeNull()
  })

  it('returns the conflict detail when present', () => {
    const state = makeState({
      sourceConflict: {
        reportObservationId: 'obs-1',
        correctedByObservationId: 'obs-2',
        noticedAt: '2026-10-12T00:00:00Z',
        detail: 'The cited entry was corrected.',
      },
    })
    expect(sourceConflictNotice(state)).toBe('The cited entry was corrected.')
  })
})

// ─── lastWithdrawSentence ───────────────────────────────────────────────────

describe('lastWithdrawSentence', () => {
  it('returns null when no state', () => {
    expect(lastWithdrawSentence(null)).toBeNull()
  })

  it('returns null when there IS an active entry (still standing)', () => {
    const state = makeState({
      lastWithdraw: {
        entryKey: 'ek-old',
        reason: CompletionWithdrawReason.Mistake,
        at: '2026-10-12T00:00:00Z',
      },
    })
    expect(lastWithdrawSentence(state)).toBeNull()
  })

  it('returns the withdraw sentence when no active entry', () => {
    const state = makeState({
      activeEntryKey: null,
      activeAssertion: null,
      lastWithdraw: {
        entryKey: 'ek-old',
        reason: CompletionWithdrawReason.NotComplete,
        at: '2026-10-12T00:00:00Z',
      },
    })
    const sentence = lastWithdrawSentence(state)!
    expect(sentence).toContain("hasn't finished")
    expect(sentence).toContain('Withdrawn')
  })
})

// ─── eventSentence ──────────────────────────────────────────────────────────

describe('eventSentence', () => {
  it('describes a confirm event', () => {
    const event = makeEvent({
      assertion: {
        observedOn: '2026-10-10',
        source: NativeProgressSource.ParentReport,
        assistance: CompletionAssistance.Unknown,
        reportedProgramVersion: 'unknown',
      },
    })
    const sentence = eventSentence(event)
    expect(sentence).toContain('confirmed')
    expect(sentence).toContain('is finished')
  })

  it('describes a withdraw event', () => {
    const event = makeEvent({
      kind: 'withdraw',
      withdrawReason: CompletionWithdrawReason.Partial,
    })
    const sentence = eventSentence(event)
    expect(sentence).toContain('withdrawn')
    expect(sentence).toContain('partway through')
  })

  it('describes a reapply event', () => {
    const event = makeEvent({ kind: 'reapply', mappingVersion: 2 })
    const sentence = eventSentence(event)
    expect(sentence).toContain('coverage map')
    expect(sentence).toContain('version 2')
  })

  it('defaults to Mistake when withdrawReason is missing on a withdraw', () => {
    const event = makeEvent({ kind: 'withdraw', withdrawReason: undefined })
    const sentence = eventSentence(event)
    expect(sentence).toContain('mistake')
  })
})

// ─── sortEvents ─────────────────────────────────────────────────────────────

describe('sortEvents', () => {
  it('sorts newest first', () => {
    const events = [
      makeEvent({ id: 'ev-old', recordedAt: '2026-10-01T00:00:00Z' }),
      makeEvent({ id: 'ev-new', recordedAt: '2026-10-10T00:00:00Z' }),
    ]
    const sorted = sortEvents(events)
    expect(sorted[0].id).toBe('ev-new')
    expect(sorted[1].id).toBe('ev-old')
  })

  it('breaks ties by id', () => {
    const events = [
      makeEvent({ id: 'ev-b', recordedAt: '2026-10-10T00:00:00Z' }),
      makeEvent({ id: 'ev-a', recordedAt: '2026-10-10T00:00:00Z' }),
    ]
    const sorted = sortEvents(events)
    expect(sorted[0].id).toBe('ev-a')
    expect(sorted[1].id).toBe('ev-b')
  })

  it('does not mutate the input array', () => {
    const events = [
      makeEvent({ id: 'ev-old', recordedAt: '2026-10-01T00:00:00Z' }),
      makeEvent({ id: 'ev-new', recordedAt: '2026-10-10T00:00:00Z' }),
    ]
    sortEvents(events)
    expect(events[0].id).toBe('ev-old')
  })
})

// ─── newCompletionEntryKey ──────────────────────────────────────────────────

describe('newCompletionEntryKey', () => {
  it('returns a non-empty string', () => {
    const key = newCompletionEntryKey()
    expect(key.length).toBeGreaterThan(0)
  })

  it('returns distinct keys on successive calls', () => {
    const keys = new Set(Array.from({ length: 10 }, () => newCompletionEntryKey()))
    expect(keys.size).toBe(10)
  })
})
