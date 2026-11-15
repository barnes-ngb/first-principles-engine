// @vitest-environment node
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
import {
  completionChildSwitchNotice,
  completionDraftIsEmpty,
  completionPreview,
  coverageSummary,
  coverageSummaryHeadline,
  eligibleCitations,
  emptyCompletionDraft,
  needsApplyRetry,
  projectionStatusLine,
  reviewCompletionDraft,
  sortEvents,
  type CompletionDraft,
} from './programCompletionRule'

// ── Helpers ──────────────────────────────────────────────────────

function validDraft(overrides: Partial<CompletionDraft> = {}): CompletionDraft {
  return {
    program: ProgramCompletionProgram.FastPhonics,
    observedOn: '2026-10-01',
    source: NativeProgressSource.ParentReport,
    assistance: CompletionAssistance.Unknown,
    note: '',
    reportObservationId: '',
    ...overrides,
  }
}

function makeRow(
  overrides: Partial<NativeProgressObservation> = {},
): NativeProgressObservation {
  return {
    id: 'obs-1',
    childId: 'child-1',
    program: 'fastPhonics',
    nativeNumber: 20,
    meaning: NativeProgressMeaning.CompletedThrough,
    observedOn: '2026-09-15',
    source: NativeProgressSource.ParentReport,
    recordedAt: '2026-09-16T10:00:00Z',
    entryKey: 'ek-1',
    ...overrides,
  }
}

const TODAY = '2026-11-01'

// ── emptyCompletionDraft ─────────────────────────────────────────

describe('emptyCompletionDraft', () => {
  it('returns a draft with the seeded date and all defaults', () => {
    const draft = emptyCompletionDraft('2026-10-15')
    expect(draft.observedOn).toBe('2026-10-15')
    expect(draft.program).toBe(ProgramCompletionProgram.FastPhonics)
    expect(draft.source).toBe(NativeProgressSource.ParentReport)
    expect(draft.assistance).toBe(CompletionAssistance.Unknown)
    expect(draft.note).toBe('')
    expect(draft.reportObservationId).toBe('')
  })
})

// ── completionDraftIsEmpty ───────────────────────────────────────

describe('completionDraftIsEmpty', () => {
  it('returns true for a draft unchanged from defaults', () => {
    const draft = emptyCompletionDraft('2026-10-15')
    expect(completionDraftIsEmpty(draft, '2026-10-15')).toBe(true)
  })

  it('returns false when note is non-empty', () => {
    const draft = emptyCompletionDraft('2026-10-15')
    draft.note = 'some note'
    expect(completionDraftIsEmpty(draft, '2026-10-15')).toBe(false)
  })

  it('returns false when date was changed from seeded value', () => {
    const draft = emptyCompletionDraft('2026-10-15')
    draft.observedOn = '2026-10-16'
    expect(completionDraftIsEmpty(draft, '2026-10-15')).toBe(false)
  })

  it('returns false when citation was set', () => {
    const draft = emptyCompletionDraft('2026-10-15')
    draft.reportObservationId = 'obs-1'
    expect(completionDraftIsEmpty(draft, '2026-10-15')).toBe(false)
  })

  it('returns false when source was changed', () => {
    const draft = emptyCompletionDraft('2026-10-15')
    draft.source = NativeProgressSource.Certificate
    expect(completionDraftIsEmpty(draft, '2026-10-15')).toBe(false)
  })

  it('returns false when assistance was changed', () => {
    const draft = emptyCompletionDraft('2026-10-15')
    draft.assistance = CompletionAssistance.Independent
    expect(completionDraftIsEmpty(draft, '2026-10-15')).toBe(false)
  })

  it('treats whitespace-only note as empty', () => {
    const draft = emptyCompletionDraft('2026-10-15')
    draft.note = '   '
    expect(completionDraftIsEmpty(draft, '2026-10-15')).toBe(false)
  })
})

// ── reviewCompletionDraft ────────────────────────────────────────

describe('reviewCompletionDraft', () => {
  it('accepts a valid draft with no citation', () => {
    const result = reviewCompletionDraft(validDraft(), TODAY, [])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.reviewed.program).toBe(ProgramCompletionProgram.FastPhonics)
      expect(result.reviewed.observedOn).toBe('2026-10-01')
      expect(result.reviewed.source).toBe(NativeProgressSource.ParentReport)
      expect(result.reviewed.assistance).toBe(CompletionAssistance.Unknown)
      expect(result.reviewed.note).toBeUndefined()
      expect(result.reviewed.reportObservationId).toBeUndefined()
    }
  })

  it('includes note when non-empty', () => {
    const result = reviewCompletionDraft(
      validDraft({ note: 'He really finished' }),
      TODAY,
      [],
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.reviewed.note).toBe('He really finished')
    }
  })

  it('strips whitespace from observedOn', () => {
    const result = reviewCompletionDraft(
      validDraft({ observedOn: '  2026-10-01  ' }),
      TODAY,
      [],
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.reviewed.observedOn).toBe('2026-10-01')
    }
  })

  it('rejects empty observedOn', () => {
    const result = reviewCompletionDraft(
      validDraft({ observedOn: '' }),
      TODAY,
      [],
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.observedOn).toBeDefined()
    }
  })

  it('rejects a future date', () => {
    const result = reviewCompletionDraft(
      validDraft({ observedOn: '2027-01-01' }),
      TODAY,
      [],
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.observedOn).toContain("hasn't happened yet")
    }
  })

  it('rejects a date before 2000', () => {
    const result = reviewCompletionDraft(
      validDraft({ observedOn: '1999-12-31' }),
      TODAY,
      [],
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.observedOn).toContain('typo')
    }
  })

  it('rejects a malformed date', () => {
    const result = reviewCompletionDraft(
      validDraft({ observedOn: 'not-a-date' }),
      TODAY,
      [],
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.observedOn).toBeDefined()
    }
  })

  it('rejects a note exceeding the length limit', () => {
    const result = reviewCompletionDraft(
      validDraft({ note: 'x'.repeat(NOTE_MAX_LENGTH + 1) }),
      TODAY,
      [],
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.note).toBeDefined()
    }
  })

  it('accepts a note at exactly the length limit', () => {
    const result = reviewCompletionDraft(
      validDraft({ note: 'x'.repeat(NOTE_MAX_LENGTH) }),
      TODAY,
      [],
    )
    expect(result.ok).toBe(true)
  })

  it('rejects an invalid program', () => {
    const result = reviewCompletionDraft(
      validDraft({ program: 'bogus' as ProgramCompletionProgram }),
      TODAY,
      [],
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.program).toBeDefined()
    }
  })

  it('rejects an invalid source', () => {
    const result = reviewCompletionDraft(
      validDraft({ source: 'bogus' as NativeProgressSource }),
      TODAY,
      [],
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.source).toBeDefined()
    }
  })

  it('rejects an invalid assistance value', () => {
    const result = reviewCompletionDraft(
      validDraft({ assistance: 'bogus' as CompletionAssistance }),
      TODAY,
      [],
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.assistance).toBeDefined()
    }
  })

  it('reports all errors at once rather than stopping at first', () => {
    const result = reviewCompletionDraft(
      validDraft({
        observedOn: '',
        note: 'x'.repeat(NOTE_MAX_LENGTH + 1),
        source: 'bogus' as NativeProgressSource,
      }),
      TODAY,
      [],
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.observedOn).toBeDefined()
      expect(result.errors.note).toBeDefined()
      expect(result.errors.source).toBeDefined()
    }
  })

  it('rejects a cited row that is not eligible', () => {
    const row = makeRow({
      id: 'obs-x',
      meaning: NativeProgressMeaning.WorkingOn,
    })
    const result = reviewCompletionDraft(
      validDraft({ reportObservationId: 'obs-x' }),
      TODAY,
      [row],
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.reportObservationId).toBeDefined()
    }
  })

  it('accepts a cited row that IS eligible', () => {
    const row = makeRow({ id: 'obs-good' })
    const result = reviewCompletionDraft(
      validDraft({ reportObservationId: 'obs-good' }),
      TODAY,
      [row],
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.reviewed.reportObservationId).toBe('obs-good')
    }
  })
})

// ── eligibleCitations ────────────────────────────────────────────

describe('eligibleCitations', () => {
  it('returns only CompletedThrough rows at the final peak', () => {
    const eligible = makeRow({ id: 'a', nativeNumber: 20 })
    const workingOn = makeRow({
      id: 'b',
      nativeNumber: 20,
      meaning: NativeProgressMeaning.WorkingOn,
    })
    const wrongNumber = makeRow({ id: 'c', nativeNumber: 19 })

    const result = eligibleCitations(
      [eligible, workingOn, wrongNumber],
      ProgramCompletionProgram.FastPhonics,
    )
    expect(result.map((r) => r.id)).toEqual(['a'])
  })

  it('excludes corrected rows', () => {
    const original = makeRow({ id: 'obs-1', observedOn: '2026-09-10' })
    const correction = makeRow({
      id: 'obs-2',
      observedOn: '2026-09-12',
      correctsObservationId: 'obs-1',
    })

    const result = eligibleCitations(
      [original, correction],
      ProgramCompletionProgram.FastPhonics,
    )
    expect(result.map((r) => r.id)).toEqual(['obs-2'])
  })

  it('sorts newest observedOn first', () => {
    const older = makeRow({ id: 'a', observedOn: '2026-08-01' })
    const newer = makeRow({ id: 'b', observedOn: '2026-09-01' })

    const result = eligibleCitations(
      [older, newer],
      ProgramCompletionProgram.FastPhonics,
    )
    expect(result.map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('returns empty for an unknown program', () => {
    const row = makeRow()
    const result = eligibleCitations(
      [row],
      'bogus' as ProgramCompletionProgram,
    )
    expect(result).toEqual([])
  })
})

// ── sortEvents ───────────────────────────────────────────────────

describe('sortEvents', () => {
  const event = (id: string, recordedAt: string): ProgramCompletionEvent =>
    ({
      id,
      recordedAt,
      childId: 'c',
      program: ProgramCompletionProgram.FastPhonics,
      entryKey: id,
      kind: 'confirm',
      mappingVersion: 1,
    }) as ProgramCompletionEvent

  it('sorts newest-first by recordedAt', () => {
    const events = [
      event('a', '2026-08-01T00:00:00Z'),
      event('b', '2026-09-01T00:00:00Z'),
      event('c', '2026-07-01T00:00:00Z'),
    ]
    const sorted = sortEvents(events)
    expect(sorted.map((e) => e.id)).toEqual(['b', 'a', 'c'])
  })

  it('breaks ties by id (lexicographic)', () => {
    const events = [
      event('beta', '2026-08-01T00:00:00Z'),
      event('alpha', '2026-08-01T00:00:00Z'),
    ]
    const sorted = sortEvents(events)
    expect(sorted.map((e) => e.id)).toEqual(['alpha', 'beta'])
  })

  it('does not mutate the original array', () => {
    const events = [
      event('a', '2026-09-01T00:00:00Z'),
      event('b', '2026-08-01T00:00:00Z'),
    ]
    const original = [...events]
    sortEvents(events)
    expect(events).toEqual(original)
  })
})

// ── completionChildSwitchNotice ──────────────────────────────────

describe('completionChildSwitchNotice', () => {
  it('returns null when neither draft nor save was in flight', () => {
    expect(completionChildSwitchNotice('Lincoln', false, false)).toBeNull()
  })

  it('returns a notice when a draft was open', () => {
    const result = completionChildSwitchNotice('Lincoln', true, false)
    expect(result).toContain('Lincoln')
    expect(result).toContain('cleared')
  })

  it('returns a notice when a save was confirmed', () => {
    const result = completionChildSwitchNotice('Lincoln', false, true)
    expect(result).toContain('Lincoln')
    expect(result).toContain('record')
  })

  it('returns both parts when draft AND save were in flight', () => {
    const result = completionChildSwitchNotice('Lincoln', true, true)
    expect(result).toContain('cleared')
    expect(result).toContain('record')
  })
})

// ── needsApplyRetry ──────────────────────────────────────────────

describe('needsApplyRetry', () => {
  const stateWith = (
    status: CompletionProjectionStatus,
  ): ProgramCompletionState =>
    ({
      id: 'test',
      childId: 'c',
      program: ProgramCompletionProgram.FastPhonics,
      activeEntryKey: 'ek',
      activeAssertion: null,
      activeConfirmedAt: null,
      activeMappingVersion: null,
      projection: { status },
      eventCount: 1,
      lastEventAt: '2026-10-01',
      updatedAt: '2026-10-01',
    }) as ProgramCompletionState

  it('returns false for null state', () => {
    expect(needsApplyRetry(null)).toBe(false)
  })

  it('returns true for Pending status', () => {
    expect(needsApplyRetry(stateWith(CompletionProjectionStatus.Pending))).toBe(
      true,
    )
  })

  it('returns true for WithdrawalPending status', () => {
    expect(
      needsApplyRetry(stateWith(CompletionProjectionStatus.WithdrawalPending)),
    ).toBe(true)
  })

  it('returns false for Applied status', () => {
    expect(needsApplyRetry(stateWith(CompletionProjectionStatus.Applied))).toBe(
      false,
    )
  })

  it('returns false for Withdrawn status', () => {
    expect(
      needsApplyRetry(stateWith(CompletionProjectionStatus.Withdrawn)),
    ).toBe(false)
  })
})

// ── projectionStatusLine ─────────────────────────────────────────

describe('projectionStatusLine', () => {
  const stateWith = (
    status: CompletionProjectionStatus,
    detail?: string,
  ): ProgramCompletionState =>
    ({
      id: 'test',
      childId: 'c',
      program: ProgramCompletionProgram.FastPhonics,
      activeEntryKey: 'ek',
      activeAssertion: null,
      activeConfirmedAt: null,
      activeMappingVersion: null,
      projection: { status, ...(detail !== undefined ? { detail } : {}) },
      eventCount: 1,
      lastEventAt: '2026-10-01',
      updatedAt: '2026-10-01',
    }) as ProgramCompletionState

  it('returns null for null state', () => {
    expect(projectionStatusLine(null)).toBeNull()
  })

  it('returns learning-picture text for Applied', () => {
    const result = projectionStatusLine(
      stateWith(CompletionProjectionStatus.Applied),
    )
    expect(result).toContain('learning picture')
  })

  it('returns recorded text for Pending with no detail', () => {
    const result = projectionStatusLine(
      stateWith(CompletionProjectionStatus.Pending),
    )
    expect(result).toContain('Recorded')
  })

  it('uses detail when available for Pending', () => {
    const result = projectionStatusLine(
      stateWith(CompletionProjectionStatus.Pending, 'custom detail'),
    )
    expect(result).toBe('custom detail')
  })

  it('returns withdrawn text for WithdrawalPending with no detail', () => {
    const result = projectionStatusLine(
      stateWith(CompletionProjectionStatus.WithdrawalPending),
    )
    expect(result).toContain('Withdrawn')
  })

  it('returns detail or null for Withdrawn', () => {
    expect(
      projectionStatusLine(stateWith(CompletionProjectionStatus.Withdrawn)),
    ).toBeNull()
    expect(
      projectionStatusLine(
        stateWith(CompletionProjectionStatus.Withdrawn, 'some detail'),
      ),
    ).toBe('some detail')
  })
})

// ── coverageSummary / coverageSummaryHeadline ────────────────────

describe('coverageSummary', () => {
  it('returns lines for FastPhonics', () => {
    const lines = coverageSummary(ProgramCompletionProgram.FastPhonics)
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      expect(line.conceptId).toBeTruthy()
      expect(line.kidName).toBeTruthy()
      expect(['Covered', 'Covered in part']).toContain(line.reach)
      expect(line.unit).toBeTruthy()
    }
  })

  it('never says "mastered" — only covered', () => {
    const lines = coverageSummary(ProgramCompletionProgram.FastPhonics)
    for (const line of lines) {
      expect(line.reach.toLowerCase()).not.toContain('master')
    }
  })

  it('returns empty for a bogus program', () => {
    expect(
      coverageSummary('bogus' as ProgramCompletionProgram),
    ).toEqual([])
  })
})

describe('coverageSummaryHeadline', () => {
  it('names the program and counts concepts', () => {
    const headline = coverageSummaryHeadline(
      ProgramCompletionProgram.FastPhonics,
    )
    expect(headline).toContain('building block')
    expect(headline).toContain('Covered')
    expect(headline).not.toContain('master')
  })
})

// ── completionPreview ────────────────────────────────────────────

describe('completionPreview', () => {
  it('names the child and date', () => {
    const reviewed = {
      program: ProgramCompletionProgram.FastPhonics,
      observedOn: '2026-10-01',
      source: NativeProgressSource.ParentReport,
      assistance: CompletionAssistance.Unknown,
    }
    const result = completionPreview(reviewed, 'Lincoln', null)
    expect(result).toContain('Lincoln')
    expect(result).toContain('finished')
  })

  it('includes citation when present', () => {
    const reviewed = {
      program: ProgramCompletionProgram.FastPhonics,
      observedOn: '2026-10-01',
      source: NativeProgressSource.ParentReport,
      assistance: CompletionAssistance.Unknown,
    }
    const row = makeRow({ id: 'obs-1' })
    const result = completionPreview(reviewed, 'Lincoln', row)
    expect(result).toContain('Evidence')
  })
})
