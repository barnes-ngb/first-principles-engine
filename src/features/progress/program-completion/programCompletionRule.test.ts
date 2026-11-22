import { describe, expect, it } from 'vitest'

import {
  CompletionAssistance,
  CompletionProjectionStatus,
  CompletionWithdrawReason,
  ProgramCompletionProgram,
  type ProgramCompletionEvent,
  type ProgramCompletionState,
} from '../../../core/types/programCompletion'
import {
  NativeProgressMeaning,
  NativeProgressSource,
  NOTE_MAX_LENGTH,
  type NativeProgressObservation,
} from '../../../core/types/nativeProgress'
import { FAST_PHONICS_FINAL_PEAK } from '../../../core/foundations/fastPhonicsCompletion'

import {
  ASSISTANCE_CHOICES,
  ASSISTANCE_LABEL,
  COMPLETION_PROGRAMS,
  COMPLETION_SCOPE_NOTICE,
  COMPLETION_SOURCE_NOTICE,
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
  mappingUpgradeAvailable,
  mappingUpgradeLine,
  needsApplyRetry,
  newCompletionEntryKey,
  projectionStatusLine,
  reviewCompletionDraft,
  sortEvents,
  sourceConflictNotice,
  lastWithdrawSentence,
  type CompletionDraft,
} from './programCompletionRule'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeObservation(
  overrides: Partial<NativeProgressObservation> = {},
): NativeProgressObservation {
  return {
    id: 'obs-1',
    childId: 'child-1',
    program: 'fastPhonics',
    nativeNumber: FAST_PHONICS_FINAL_PEAK,
    meaning: NativeProgressMeaning.CompletedThrough,
    observedOn: '2026-10-01',
    source: NativeProgressSource.ParentReport,
    recordedAt: '2026-10-02T12:00:00Z',
    entryKey: 'ek-1',
    ...overrides,
  }
}

function makeDraft(overrides: Partial<CompletionDraft> = {}): CompletionDraft {
  return {
    program: ProgramCompletionProgram.FastPhonics,
    observedOn: '2026-10-10',
    source: NativeProgressSource.ParentReport,
    assistance: CompletionAssistance.Unknown,
    note: '',
    reportObservationId: '',
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
      observedOn: '2026-10-01',
      source: NativeProgressSource.ParentReport,
      assistance: CompletionAssistance.Unknown,
      reportedProgramVersion: 'unknown',
    },
    activeConfirmedAt: '2026-10-02T12:00:00Z',
    activeMappingVersion: 1,
    projection: {
      status: CompletionProjectionStatus.Applied,
      appliedMappingVersion: 1,
    },
    eventCount: 1,
    lastEventAt: '2026-10-02T12:00:00Z',
    updatedAt: '2026-10-02T12:00:00Z',
    ...overrides,
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

describe('COMPLETION_PROGRAMS', () => {
  it('contains FastPhonics', () => {
    expect(COMPLETION_PROGRAMS).toContain(ProgramCompletionProgram.FastPhonics)
  })
})

describe('ASSISTANCE_LABEL / ASSISTANCE_CHOICES', () => {
  it('has a label for every choice', () => {
    for (const choice of ASSISTANCE_CHOICES) {
      expect(ASSISTANCE_LABEL[choice]).toBeTruthy()
    }
  })
  it('unknown is first', () => {
    expect(ASSISTANCE_CHOICES[0]).toBe(CompletionAssistance.Unknown)
  })
})

describe('WITHDRAW_REASON_LABEL / WITHDRAW_REASON_CHOICES', () => {
  it('has a label for every choice', () => {
    for (const choice of WITHDRAW_REASON_CHOICES) {
      expect(WITHDRAW_REASON_LABEL[choice]).toBeTruthy()
    }
  })
  it('sourceCorrected is NOT a parent-pickable choice', () => {
    expect(WITHDRAW_REASON_CHOICES).not.toContain(
      CompletionWithdrawReason.SourceCorrected,
    )
  })
  it('sourceCorrected still has a label', () => {
    expect(WITHDRAW_REASON_LABEL[CompletionWithdrawReason.SourceCorrected]).toBeTruthy()
  })
})

describe('static notices', () => {
  it('scope notice says "not mastered" rather than claiming mastery', () => {
    expect(COMPLETION_SCOPE_NOTICE).toContain('does not say he has mastered')
  })
  it('source notice is non-empty', () => {
    expect(COMPLETION_SOURCE_NOTICE.length).toBeGreaterThan(0)
  })
  it('unknown-state notice mentions loading', () => {
    expect(COMPLETION_STATE_UNKNOWN.toLowerCase()).toContain('loaded')
  })
  it('unreadable-state notice says nothing changed', () => {
    expect(COMPLETION_STATE_UNREADABLE.toLowerCase()).toContain('nothing has been changed')
  })
  it('OBSERVED_ON_FLOOR is 2000-01-01', () => {
    expect(OBSERVED_ON_FLOOR).toBe('2000-01-01')
  })
})

// ─── emptyCompletionDraft ─────────────────────────────────────────────────────

describe('emptyCompletionDraft', () => {
  it('creates a draft seeded with the given date', () => {
    const draft = emptyCompletionDraft('2026-11-01')
    expect(draft.observedOn).toBe('2026-11-01')
    expect(draft.program).toBe(ProgramCompletionProgram.FastPhonics)
    expect(draft.note).toBe('')
    expect(draft.reportObservationId).toBe('')
    expect(draft.source).toBe(NativeProgressSource.ParentReport)
    expect(draft.assistance).toBe(CompletionAssistance.Unknown)
  })
})

// ─── completionDraftIsEmpty ───────────────────────────────────────────────────

describe('completionDraftIsEmpty', () => {
  it('returns true for a fresh empty draft', () => {
    const draft = emptyCompletionDraft('2026-11-01')
    expect(completionDraftIsEmpty(draft, '2026-11-01')).toBe(true)
  })

  it('returns false when date changed', () => {
    const draft = emptyCompletionDraft('2026-11-01')
    draft.observedOn = '2026-10-15'
    expect(completionDraftIsEmpty(draft, '2026-11-01')).toBe(false)
  })

  it('returns false when note is non-empty', () => {
    const draft = emptyCompletionDraft('2026-11-01')
    draft.note = 'He used an iPad'
    expect(completionDraftIsEmpty(draft, '2026-11-01')).toBe(false)
  })

  it('returns false when citation is set', () => {
    const draft = emptyCompletionDraft('2026-11-01')
    draft.reportObservationId = 'obs-1'
    expect(completionDraftIsEmpty(draft, '2026-11-01')).toBe(false)
  })

  it('returns false when assistance changed', () => {
    const draft = emptyCompletionDraft('2026-11-01')
    draft.assistance = CompletionAssistance.Independent
    expect(completionDraftIsEmpty(draft, '2026-11-01')).toBe(false)
  })

  it('returns false when source changed', () => {
    const draft = emptyCompletionDraft('2026-11-01')
    draft.source = NativeProgressSource.Certificate
    expect(completionDraftIsEmpty(draft, '2026-11-01')).toBe(false)
  })

  it('whitespace-only note is treated as empty', () => {
    const draft = emptyCompletionDraft('2026-11-01')
    draft.note = '   '
    expect(completionDraftIsEmpty(draft, '2026-11-01')).toBe(true)
  })
})

// ─── eligibleCitations ────────────────────────────────────────────────────────

describe('eligibleCitations', () => {
  it('returns rows that say completed through the final peak', () => {
    const row = makeObservation()
    const result = eligibleCitations([row], ProgramCompletionProgram.FastPhonics)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('obs-1')
  })

  it('excludes rows with wrong meaning (workingOn)', () => {
    const row = makeObservation({ meaning: NativeProgressMeaning.WorkingOn })
    expect(eligibleCitations([row], ProgramCompletionProgram.FastPhonics)).toHaveLength(0)
  })

  it('excludes rows with wrong meaning (uncertain)', () => {
    const row = makeObservation({ meaning: NativeProgressMeaning.Uncertain })
    expect(eligibleCitations([row], ProgramCompletionProgram.FastPhonics)).toHaveLength(0)
  })

  it('excludes rows with a number other than the final peak', () => {
    const row = makeObservation({ nativeNumber: 19 })
    expect(eligibleCitations([row], ProgramCompletionProgram.FastPhonics)).toHaveLength(0)
  })

  it('excludes rows for a different program', () => {
    const row = makeObservation({ program: 'mathseeds' })
    expect(eligibleCitations([row], ProgramCompletionProgram.FastPhonics)).toHaveLength(0)
  })

  it('excludes corrected rows', () => {
    const correction = makeObservation({
      id: 'obs-2',
      correctsObservationId: 'obs-1',
      entryKey: 'ek-2',
    })
    const original = makeObservation({ id: 'obs-1' })
    const result = eligibleCitations(
      [original, correction],
      ProgramCompletionProgram.FastPhonics,
    )
    expect(result.every((r) => r.id !== 'obs-1')).toBe(true)
  })

  it('sorts newest observedOn first', () => {
    const older = makeObservation({ id: 'obs-old', observedOn: '2026-09-01' })
    const newer = makeObservation({ id: 'obs-new', observedOn: '2026-10-15' })
    const result = eligibleCitations(
      [older, newer],
      ProgramCompletionProgram.FastPhonics,
    )
    expect(result[0].id).toBe('obs-new')
    expect(result[1].id).toBe('obs-old')
  })

  it('returns empty for unknown program', () => {
    const row = makeObservation()
    expect(eligibleCitations([row], 'unknownProgram' as ProgramCompletionProgram)).toHaveLength(0)
  })

  it('returns empty for empty rows', () => {
    expect(eligibleCitations([], ProgramCompletionProgram.FastPhonics)).toHaveLength(0)
  })
})

// ─── citationLabel ────────────────────────────────────────────────────────────

describe('citationLabel', () => {
  it('includes the number phrase, date and source', () => {
    const row = makeObservation()
    const label = citationLabel(row)
    expect(label).toContain('finished through peak 20')
    expect(label).toContain('parent report')
    expect(label).toContain('Oct 1')
  })
})

// ─── reviewCompletionDraft ────────────────────────────────────────────────────

describe('reviewCompletionDraft', () => {
  const today = '2026-10-15'

  it('accepts a valid draft', () => {
    const draft = makeDraft()
    const result = reviewCompletionDraft(draft, today, [])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.reviewed.program).toBe(ProgramCompletionProgram.FastPhonics)
      expect(result.reviewed.observedOn).toBe('2026-10-10')
    }
  })

  it('rejects empty observedOn', () => {
    const draft = makeDraft({ observedOn: '' })
    const result = reviewCompletionDraft(draft, today, [])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.observedOn).toBeTruthy()
  })

  it('rejects malformed date', () => {
    const draft = makeDraft({ observedOn: 'not-a-date' })
    const result = reviewCompletionDraft(draft, today, [])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.observedOn).toBeTruthy()
  })

  it('rejects future date', () => {
    const draft = makeDraft({ observedOn: '2027-01-01' })
    const result = reviewCompletionDraft(draft, today, [])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.observedOn).toContain("hasn't happened")
  })

  it('rejects date before floor', () => {
    const draft = makeDraft({ observedOn: '1999-12-31' })
    const result = reviewCompletionDraft(draft, today, [])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.observedOn).toContain('typo')
  })

  it('accepts the floor date itself', () => {
    const draft = makeDraft({ observedOn: OBSERVED_ON_FLOOR })
    const result = reviewCompletionDraft(draft, today, [])
    expect(result.ok).toBe(true)
  })

  it('rejects note over max length', () => {
    const draft = makeDraft({ note: 'x'.repeat(NOTE_MAX_LENGTH + 1) })
    const result = reviewCompletionDraft(draft, today, [])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.note).toBeTruthy()
  })

  it('accepts note at max length', () => {
    const draft = makeDraft({ note: 'x'.repeat(NOTE_MAX_LENGTH) })
    const result = reviewCompletionDraft(draft, today, [])
    expect(result.ok).toBe(true)
  })

  it('rejects invalid program', () => {
    const draft = makeDraft({ program: 'bogus' as ProgramCompletionProgram })
    const result = reviewCompletionDraft(draft, today, [])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.program).toBeTruthy()
  })

  it('rejects invalid source', () => {
    const draft = makeDraft({ source: 'bogus' as NativeProgressSource })
    const result = reviewCompletionDraft(draft, today, [])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.source).toBeTruthy()
  })

  it('rejects invalid assistance', () => {
    const draft = makeDraft({ assistance: 'bogus' as CompletionAssistance })
    const result = reviewCompletionDraft(draft, today, [])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.assistance).toBeTruthy()
  })

  it('rejects citation not in eligible rows', () => {
    const draft = makeDraft({ reportObservationId: 'nonexistent-obs' })
    const result = reviewCompletionDraft(draft, today, [])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.reportObservationId).toBeTruthy()
  })

  it('accepts citation that IS in eligible rows', () => {
    const row = makeObservation({ id: 'obs-valid' })
    const draft = makeDraft({ reportObservationId: 'obs-valid' })
    const result = reviewCompletionDraft(draft, today, [row])
    expect(result.ok).toBe(true)
  })

  it('reports ALL errors at once, not just the first', () => {
    const draft = makeDraft({
      observedOn: '',
      program: 'bogus' as ProgramCompletionProgram,
      source: 'bogus' as NativeProgressSource,
    })
    const result = reviewCompletionDraft(draft, today, [])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.observedOn).toBeTruthy()
      expect(result.errors.program).toBeTruthy()
      expect(result.errors.source).toBeTruthy()
    }
  })

  it('strips trailing whitespace from observedOn', () => {
    const draft = makeDraft({ observedOn: '2026-10-10 ' })
    const result = reviewCompletionDraft(draft, today, [])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.reviewed.observedOn).toBe('2026-10-10')
  })

  it('omits note from reviewed when empty', () => {
    const draft = makeDraft({ note: '' })
    const result = reviewCompletionDraft(draft, today, [])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.reviewed.note).toBeUndefined()
  })

  it('includes note in reviewed when non-empty', () => {
    const draft = makeDraft({ note: 'He used the iPad version' })
    const result = reviewCompletionDraft(draft, today, [])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.reviewed.note).toBe('He used the iPad version')
  })

  it('omits reportObservationId from reviewed when empty', () => {
    const draft = makeDraft({ reportObservationId: '' })
    const result = reviewCompletionDraft(draft, today, [])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.reviewed.reportObservationId).toBeUndefined()
  })
})

// ─── coverageSummary ──────────────────────────────────────────────────────────

describe('coverageSummary', () => {
  it('returns non-empty for FastPhonics', () => {
    const lines = coverageSummary(ProgramCompletionProgram.FastPhonics)
    expect(lines.length).toBeGreaterThan(0)
  })

  it('every line has a conceptId, kidName, reach and unit', () => {
    for (const line of coverageSummary(ProgramCompletionProgram.FastPhonics)) {
      expect(line.conceptId).toBeTruthy()
      expect(line.kidName).toBeTruthy()
      expect(line.unit).toBeTruthy()
      expect(['Covered', 'Covered in part']).toContain(line.reach)
    }
  })

  it('never says "mastered"', () => {
    for (const line of coverageSummary(ProgramCompletionProgram.FastPhonics)) {
      expect(line.reach.toLowerCase()).not.toContain('master')
    }
  })

  it('partial lines have a partialReason', () => {
    const partial = coverageSummary(ProgramCompletionProgram.FastPhonics).filter(
      (l) => l.reach === 'Covered in part',
    )
    for (const line of partial) {
      expect(line.partialReason).toBeTruthy()
    }
  })

  it('full lines do NOT have a partialReason', () => {
    const full = coverageSummary(ProgramCompletionProgram.FastPhonics).filter(
      (l) => l.reach === 'Covered',
    )
    for (const line of full) {
      expect(line.partialReason).toBeUndefined()
    }
  })

  it('returns empty for unknown program', () => {
    expect(coverageSummary('bogus' as ProgramCompletionProgram)).toHaveLength(0)
  })
})

// ─── coverageSummaryHeadline ──────────────────────────────────────────────────

describe('coverageSummaryHeadline', () => {
  it('mentions reading building blocks', () => {
    const hl = coverageSummaryHeadline(ProgramCompletionProgram.FastPhonics)
    expect(hl).toContain('reading building block')
  })

  it('says "covered" not "mastered"', () => {
    const hl = coverageSummaryHeadline(ProgramCompletionProgram.FastPhonics)
    expect(hl.toLowerCase()).toContain('covered')
    expect(hl.toLowerCase()).not.toContain('master')
  })

  it('mentions the program label', () => {
    const hl = coverageSummaryHeadline(ProgramCompletionProgram.FastPhonics)
    expect(hl).toContain('Fast Phonics')
  })
})

// ─── completionPreview ────────────────────────────────────────────────────────

describe('completionPreview', () => {
  it('names the child and the program', () => {
    const reviewed = {
      program: ProgramCompletionProgram.FastPhonics,
      observedOn: '2026-10-10',
      source: NativeProgressSource.ParentReport,
      assistance: CompletionAssistance.Unknown,
    }
    const text = completionPreview(reviewed, 'Lincoln', null)
    expect(text).toContain('Lincoln')
    expect(text).toContain('Fast Phonics')
    expect(text).toContain('Oct 10')
  })

  it('includes citation when provided', () => {
    const reviewed = {
      program: ProgramCompletionProgram.FastPhonics,
      observedOn: '2026-10-10',
      source: NativeProgressSource.ParentReport,
      assistance: CompletionAssistance.Unknown,
    }
    const obs = makeObservation()
    const text = completionPreview(reviewed, 'Lincoln', obs)
    expect(text).toContain('Evidence:')
  })
})

// ─── completionSavedNotice ────────────────────────────────────────────────────

describe('completionSavedNotice', () => {
  const reviewed = {
    program: ProgramCompletionProgram.FastPhonics,
    observedOn: '2026-10-10',
    source: NativeProgressSource.ParentReport,
    assistance: CompletionAssistance.Unknown,
  }

  it('says "covered — not as mastered" when applied', () => {
    const text = completionSavedNotice(reviewed, 'Lincoln', true)
    expect(text).toContain('covered — not as mastered')
  })

  it('says not marked yet when NOT applied', () => {
    const text = completionSavedNotice(reviewed, 'Lincoln', false)
    expect(text).toContain('NOT been marked yet')
  })

  it('always says no hours or rewards changed', () => {
    const text = completionSavedNotice(reviewed, 'Lincoln', true)
    expect(text).toContain('No hours, rewards or lesson numbers changed')
  })
})

// ─── simple notice functions ──────────────────────────────────────────────────

describe('completionAlreadyRecordedNotice', () => {
  it('names the child', () => {
    expect(completionAlreadyRecordedNotice('Lincoln')).toContain('Lincoln')
  })
  it('says nothing was saved twice', () => {
    expect(completionAlreadyRecordedNotice('Lincoln')).toContain('Nothing was saved twice')
  })
})

describe('completionFailureNotice', () => {
  it('says not confirmed as saved', () => {
    expect(completionFailureNotice()).toContain('not confirmed as saved')
  })
  it('says cannot be recorded twice', () => {
    expect(completionFailureNotice()).toContain('cannot be recorded twice')
  })
})

describe('completionNotSentNotice', () => {
  it('includes the reason', () => {
    expect(completionNotSentNotice('no connection')).toContain('no connection')
  })
  it('says nothing was written', () => {
    expect(completionNotSentNotice('x')).toContain('Nothing was written')
  })
})

describe('completionStrandedTitle / completionStrandedNotice', () => {
  it('title names the child', () => {
    expect(completionStrandedTitle('Lincoln')).toContain('Lincoln')
  })
  it('notice names the child and says cannot be recorded twice', () => {
    const text = completionStrandedNotice('Lincoln')
    expect(text).toContain('Lincoln')
    expect(text).toContain('cannot be recorded twice')
  })
})

describe('completionStrandedRefusedTitle / Notice', () => {
  it('title says refused', () => {
    expect(completionStrandedRefusedTitle('Lincoln')).toContain('refused')
  })
  it('notice includes kind label and reason', () => {
    const text = completionStrandedRefusedNotice('Lincoln', 'confirm', 'Row was corrected.')
    expect(text).toContain('Row was corrected.')
    expect(text).toContain('confirmation')
  })
  it('notice for withdraw uses "correction" label', () => {
    const text = completionStrandedRefusedNotice('Lincoln', 'withdraw', 'some reason')
    expect(text).toContain('correction')
  })
  it('falls back when reason is empty', () => {
    const text = completionStrandedRefusedNotice('Lincoln', 'confirm', '')
    expect(text).toContain('refused, with no reason given')
  })
})

describe('completionStrandedReasonLine', () => {
  it('includes the reason and the kind label', () => {
    const text = completionStrandedReasonLine('Lincoln', 'confirm', 'Server timed out.')
    expect(text).toContain('Server timed out.')
    expect(text).toContain('confirmation')
  })
  it('falls back when reason is empty', () => {
    const text = completionStrandedReasonLine('Lincoln', 'withdraw', '')
    expect(text).toContain('could not be completed just now')
  })
})

describe('completionUnresolvedHoldLine / Reason', () => {
  it('hold line names the child', () => {
    expect(completionUnresolvedHoldLine('Lincoln')).toContain('Lincoln')
  })
  it('reason names the child and the kind', () => {
    const text = completionUnresolvedHoldReason('Lincoln', 'confirm')
    expect(text).toContain('confirmation')
    expect(text).toContain('Lincoln')
  })
  it('withdraw kind says correction', () => {
    const text = completionUnresolvedHoldReason('Lincoln', 'withdraw')
    expect(text).toContain('correction')
  })
})

// ─── completionChildSwitchNotice ──────────────────────────────────────────────

describe('completionChildSwitchNotice', () => {
  it('returns null when nothing to report', () => {
    expect(completionChildSwitchNotice('Lincoln', false, false)).toBeNull()
  })

  it('mentions cleared draft when hadDraft', () => {
    const text = completionChildSwitchNotice('Lincoln', true, false)
    expect(text).toContain('cleared')
    expect(text).toContain('Lincoln')
  })

  it('mentions confirmed save when saveConfirmed', () => {
    const text = completionChildSwitchNotice('Lincoln', false, true)
    expect(text).toContain("Lincoln's record")
  })

  it('combines both when both true', () => {
    const text = completionChildSwitchNotice('Lincoln', true, true)
    expect(text).toContain('cleared')
    expect(text).toContain("Lincoln's record")
  })
})

// ─── activeCompletionSentence ─────────────────────────────────────────────────

describe('activeCompletionSentence', () => {
  it('returns null for null state', () => {
    expect(activeCompletionSentence(null, 'Lincoln')).toBeNull()
  })

  it('returns null when no active entry', () => {
    const state = makeState({ activeEntryKey: null, activeAssertion: null })
    expect(activeCompletionSentence(state, 'Lincoln')).toBeNull()
  })

  it('names the child and program and says "version not recorded"', () => {
    const state = makeState()
    const text = activeCompletionSentence(state, 'Lincoln')!
    expect(text).toContain('Lincoln')
    expect(text).toContain('Fast Phonics')
    expect(text).toContain('version not recorded')
  })

  it('renders unknown assistance as "not recorded"', () => {
    const state = makeState()
    const text = activeCompletionSentence(state, 'Lincoln')!
    expect(text).toContain('not recorded')
  })

  it('renders independent assistance', () => {
    const state = makeState({
      activeAssertion: {
        observedOn: '2026-10-01',
        source: NativeProgressSource.ParentReport,
        assistance: CompletionAssistance.Independent,
        reportedProgramVersion: 'unknown',
      },
    })
    const text = activeCompletionSentence(state, 'Lincoln')!
    expect(text).toContain('on his own')
  })

  it('renders someHelp assistance', () => {
    const state = makeState({
      activeAssertion: {
        observedOn: '2026-10-01',
        source: NativeProgressSource.ParentReport,
        assistance: CompletionAssistance.SomeHelp,
        reportedProgramVersion: 'unknown',
      },
    })
    const text = activeCompletionSentence(state, 'Lincoln')!
    expect(text).toContain('some help')
  })
})

// ─── projectionStatusLine ─────────────────────────────────────────────────────

describe('projectionStatusLine', () => {
  it('returns null for null state', () => {
    expect(projectionStatusLine(null)).toBeNull()
  })

  it('returns applied message for Applied status', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.Applied },
    })
    expect(projectionStatusLine(state)).toContain('learning picture')
  })

  it('returns pending message for Pending status', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.Pending },
    })
    expect(projectionStatusLine(state)).toContain('not been updated yet')
  })

  it('returns withdrawal pending message', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.WithdrawalPending },
    })
    expect(projectionStatusLine(state)).toContain('still has to be updated')
  })

  it('uses detail when provided on Pending', () => {
    const state = makeState({
      projection: {
        status: CompletionProjectionStatus.Pending,
        detail: 'Waiting for the model to exist.',
      },
    })
    expect(projectionStatusLine(state)).toBe('Waiting for the model to exist.')
  })

  it('returns detail for Withdrawn status', () => {
    const state = makeState({
      projection: {
        status: CompletionProjectionStatus.Withdrawn,
        detail: 'All refs removed.',
      },
    })
    expect(projectionStatusLine(state)).toBe('All refs removed.')
  })

  it('returns null for Withdrawn with no detail', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.Withdrawn },
    })
    expect(projectionStatusLine(state)).toBeNull()
  })
})

// ─── needsApplyRetry ──────────────────────────────────────────────────────────

describe('needsApplyRetry', () => {
  it('false for null', () => {
    expect(needsApplyRetry(null)).toBe(false)
  })
  it('true for Pending', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.Pending },
    })
    expect(needsApplyRetry(state)).toBe(true)
  })
  it('true for WithdrawalPending', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.WithdrawalPending },
    })
    expect(needsApplyRetry(state)).toBe(true)
  })
  it('false for Applied', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.Applied },
    })
    expect(needsApplyRetry(state)).toBe(false)
  })
  it('false for Withdrawn', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.Withdrawn },
    })
    expect(needsApplyRetry(state)).toBe(false)
  })
})

// ─── mappingUpgradeAvailable / mappingUpgradeLine ─────────────────────────────

describe('mappingUpgradeAvailable', () => {
  it('false for null state', () => {
    expect(mappingUpgradeAvailable(null, null)).toBe(false)
  })
  it('false for null mapping', () => {
    const state = makeState()
    expect(mappingUpgradeAvailable(state, null)).toBe(false)
  })
  it('false when no active entry', () => {
    const state = makeState({ activeEntryKey: null })
    expect(mappingUpgradeAvailable(state, { mappingVersion: 2 } as any)).toBe(false)
  })
  it('false when not Applied', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.Pending, appliedMappingVersion: 1 },
    })
    expect(mappingUpgradeAvailable(state, { mappingVersion: 2 } as any)).toBe(false)
  })
  it('false when versions match', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.Applied, appliedMappingVersion: 1 },
    })
    expect(mappingUpgradeAvailable(state, { mappingVersion: 1 } as any)).toBe(false)
  })
  it('true when mapping version is higher', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.Applied, appliedMappingVersion: 1 },
    })
    expect(mappingUpgradeAvailable(state, { mappingVersion: 2 } as any)).toBe(true)
  })
})

describe('mappingUpgradeLine', () => {
  it('returns null when no upgrade available', () => {
    expect(mappingUpgradeLine(null, null)).toBeNull()
  })
  it('mentions both versions when upgrade available', () => {
    const state = makeState({
      projection: { status: CompletionProjectionStatus.Applied, appliedMappingVersion: 1 },
    })
    const mapping = { mappingVersion: 2 } as any
    const text = mappingUpgradeLine(state, mapping)!
    expect(text).toContain('version 1')
    expect(text).toContain('2')
  })
})

// ─── sourceConflictNotice ─────────────────────────────────────────────────────

describe('sourceConflictNotice', () => {
  it('returns null for null state', () => {
    expect(sourceConflictNotice(null)).toBeNull()
  })
  it('returns null when no conflict', () => {
    expect(sourceConflictNotice(makeState())).toBeNull()
  })
  it('returns detail when conflict exists', () => {
    const state = makeState({
      sourceConflict: {
        reportObservationId: 'obs-1',
        correctedByObservationId: 'obs-2',
        noticedAt: '2026-10-10',
        detail: 'The cited entry was corrected.',
      },
    })
    expect(sourceConflictNotice(state)).toBe('The cited entry was corrected.')
  })
})

// ─── lastWithdrawSentence ─────────────────────────────────────────────────────

describe('lastWithdrawSentence', () => {
  it('returns null for null state', () => {
    expect(lastWithdrawSentence(null)).toBeNull()
  })
  it('returns null when there is an active entry', () => {
    const state = makeState({
      lastWithdraw: {
        entryKey: 'ek-w',
        reason: CompletionWithdrawReason.Mistake,
        at: '2026-10-10T12:00:00Z',
      },
    })
    expect(lastWithdrawSentence(state)).toBeNull()
  })
  it('returns sentence when withdrawn and no active entry', () => {
    const state = makeState({
      activeEntryKey: null,
      lastWithdraw: {
        entryKey: 'ek-w',
        reason: CompletionWithdrawReason.NotComplete,
        at: '2026-10-10T12:00:00Z',
      },
    })
    const text = lastWithdrawSentence(state)!
    expect(text).toContain('Withdrawn')
    expect(text).toContain("hasn't finished")
  })
})

// ─── eventSentence ────────────────────────────────────────────────────────────

describe('eventSentence', () => {
  it('formats confirm event', () => {
    const event: ProgramCompletionEvent = {
      id: 'e-1',
      childId: 'child-1',
      program: ProgramCompletionProgram.FastPhonics,
      entryKey: 'ek-1',
      kind: 'confirm',
      recordedAt: '2026-10-02T12:00:00Z',
      mappingVersion: 1,
      assertion: {
        observedOn: '2026-10-01',
        source: NativeProgressSource.ParentReport,
        assistance: CompletionAssistance.Unknown,
        reportedProgramVersion: 'unknown',
      },
    }
    const text = eventSentence(event)
    expect(text).toContain('confirmed')
    expect(text).toContain('Fast Phonics')
    expect(text).toContain('Oct 1')
  })

  it('formats withdraw event', () => {
    const event: ProgramCompletionEvent = {
      id: 'e-2',
      childId: 'child-1',
      program: ProgramCompletionProgram.FastPhonics,
      entryKey: 'ek-2',
      kind: 'withdraw',
      recordedAt: '2026-10-05T12:00:00Z',
      mappingVersion: 1,
      withdrawReason: CompletionWithdrawReason.Partial,
    }
    const text = eventSentence(event)
    expect(text).toContain('withdrawn')
    expect(text).toContain('partway through')
  })

  it('formats reapply event', () => {
    const event: ProgramCompletionEvent = {
      id: 'e-3',
      childId: 'child-1',
      program: ProgramCompletionProgram.FastPhonics,
      entryKey: 'ek-3',
      kind: 'reapply',
      recordedAt: '2026-10-08T12:00:00Z',
      mappingVersion: 2,
    }
    const text = eventSentence(event)
    expect(text).toContain('coverage map')
    expect(text).toContain('version 2')
  })

  it('handles confirm without assertion.observedOn', () => {
    const event: ProgramCompletionEvent = {
      id: 'e-4',
      childId: 'child-1',
      program: ProgramCompletionProgram.FastPhonics,
      entryKey: 'ek-4',
      kind: 'confirm',
      recordedAt: '2026-10-02T12:00:00Z',
      mappingVersion: 1,
    }
    const text = eventSentence(event)
    expect(text).toContain('confirmed')
    expect(text).not.toContain('as of')
  })
})

// ─── sortEvents ───────────────────────────────────────────────────────────────

describe('sortEvents', () => {
  it('sorts newest first', () => {
    const events: ProgramCompletionEvent[] = [
      { id: 'e-1', recordedAt: '2026-10-01T12:00:00Z' } as ProgramCompletionEvent,
      { id: 'e-2', recordedAt: '2026-10-05T12:00:00Z' } as ProgramCompletionEvent,
      { id: 'e-3', recordedAt: '2026-10-03T12:00:00Z' } as ProgramCompletionEvent,
    ]
    const sorted = sortEvents(events)
    expect(sorted[0].id).toBe('e-2')
    expect(sorted[1].id).toBe('e-3')
    expect(sorted[2].id).toBe('e-1')
  })

  it('breaks ties by id', () => {
    const events: ProgramCompletionEvent[] = [
      { id: 'b', recordedAt: '2026-10-01T12:00:00Z' } as ProgramCompletionEvent,
      { id: 'a', recordedAt: '2026-10-01T12:00:00Z' } as ProgramCompletionEvent,
    ]
    const sorted = sortEvents(events)
    expect(sorted[0].id).toBe('a')
    expect(sorted[1].id).toBe('b')
  })

  it('does not mutate the original array', () => {
    const events: ProgramCompletionEvent[] = [
      { id: 'e-2', recordedAt: '2026-10-05T12:00:00Z' } as ProgramCompletionEvent,
      { id: 'e-1', recordedAt: '2026-10-01T12:00:00Z' } as ProgramCompletionEvent,
    ]
    const sorted = sortEvents(events)
    expect(events[0].id).toBe('e-2')
    expect(sorted[0].id).toBe('e-2')
  })

  it('handles empty array', () => {
    expect(sortEvents([])).toHaveLength(0)
  })
})

// ─── newCompletionEntryKey ────────────────────────────────────────────────────

describe('newCompletionEntryKey', () => {
  it('returns a non-empty string', () => {
    const key = newCompletionEntryKey()
    expect(key.length).toBeGreaterThan(0)
  })

  it('returns unique values', () => {
    const keys = new Set(Array.from({ length: 100 }, () => newCompletionEntryKey()))
    expect(keys.size).toBe(100)
  })
})
