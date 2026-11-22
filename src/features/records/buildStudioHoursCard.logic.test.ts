import { describe, expect, it } from 'vitest'

import type { HoursEntry } from '../../core/types'
import type { BuildStudioCreditProvenance } from '../../core/types/buildStudio'
import { BUILD_STUDIO_CREDIT_HOURS_SOURCE } from '../../core/types/buildStudio'
import { creditHoursId } from '../build-studio/buildStudioCreditProof'

import { buildStudioCardAllowed, creditedRowsFor } from './buildStudioHoursCard.logic'

// ── Fixtures ───────────────────────────────────────────────────────────────

const CHILD = 'child-lincoln'
const OTHER_CHILD = 'child-london'
const FAMILY = 'family-barnes'

const validProvenance: BuildStudioCreditProvenance = {
  schema: 1,
  receiptId: 'rcpt-1',
  kind: 'challenge',
  projectId: 'proj-1',
  versionId: 'ver-1',
  versionDocId: `${CHILD}__proj-1__ver-1`,
  challengeId: 'ch-1',
  challengeRevision: 1,
  admittedMinutes: 15,
  workAtMs: 1700000000000,
  timeZone: 'America/Chicago',
}

function makeCreditEntry(overrides: Partial<HoursEntry> = {}): HoursEntry {
  return {
    id: creditHoursId(CHILD, 'proj-1', 'ver-1'),
    childId: CHILD,
    date: '2026-11-01',
    minutes: 15,
    source: BUILD_STUDIO_CREDIT_HOURS_SOURCE,
    buildStudioCredit: validProvenance,
    ...overrides,
  }
}

function makeBaseAllowedArgs() {
  return {
    canEdit: true,
    isChildProfile: false,
    profileChildResolved: true as boolean | undefined,
    familyId: FAMILY as string | null | undefined,
    childrenFamilyId: FAMILY as string | null | undefined,
    childrenLoading: false,
    activeChildId: CHILD as string | null | undefined,
    activeChildFound: true,
    recordsLoading: false,
    readScope: { familyId: FAMILY, startDate: '2026-11-01', endDate: '2026-11-30' },
    startDate: '2026-11-01',
    endDate: '2026-11-30',
  }
}

// ── buildStudioCardAllowed ─────────────────────────────────────────────────

describe('buildStudioCardAllowed', () => {
  it('returns true when every condition is met', () => {
    expect(buildStudioCardAllowed(makeBaseAllowedArgs())).toBe(true)
  })

  it('returns false for a child profile', () => {
    expect(buildStudioCardAllowed({ ...makeBaseAllowedArgs(), isChildProfile: true })).toBe(false)
  })

  it('returns false when canEdit is false', () => {
    expect(buildStudioCardAllowed({ ...makeBaseAllowedArgs(), canEdit: false })).toBe(false)
  })

  it('returns false when profileChildResolved is undefined', () => {
    expect(
      buildStudioCardAllowed({ ...makeBaseAllowedArgs(), profileChildResolved: undefined }),
    ).toBe(false)
  })

  it('returns false when profileChildResolved is false', () => {
    expect(buildStudioCardAllowed({ ...makeBaseAllowedArgs(), profileChildResolved: false })).toBe(
      false,
    )
  })

  it('returns false when familyId is null', () => {
    expect(buildStudioCardAllowed({ ...makeBaseAllowedArgs(), familyId: null })).toBe(false)
  })

  it('returns false when familyId is undefined', () => {
    expect(buildStudioCardAllowed({ ...makeBaseAllowedArgs(), familyId: undefined })).toBe(false)
  })

  it('returns false when familyId is empty string', () => {
    expect(buildStudioCardAllowed({ ...makeBaseAllowedArgs(), familyId: '' })).toBe(false)
  })

  it('returns false when childrenFamilyId does not match familyId', () => {
    expect(
      buildStudioCardAllowed({ ...makeBaseAllowedArgs(), childrenFamilyId: 'other-family' }),
    ).toBe(false)
  })

  it('returns false when children are loading', () => {
    expect(buildStudioCardAllowed({ ...makeBaseAllowedArgs(), childrenLoading: true })).toBe(false)
  })

  it('returns false when activeChildId is null', () => {
    expect(buildStudioCardAllowed({ ...makeBaseAllowedArgs(), activeChildId: null })).toBe(false)
  })

  it('returns false when activeChildId is empty string', () => {
    expect(buildStudioCardAllowed({ ...makeBaseAllowedArgs(), activeChildId: '' })).toBe(false)
  })

  it('returns false when active child is not found', () => {
    expect(buildStudioCardAllowed({ ...makeBaseAllowedArgs(), activeChildFound: false })).toBe(
      false,
    )
  })

  it('returns false when records are loading', () => {
    expect(buildStudioCardAllowed({ ...makeBaseAllowedArgs(), recordsLoading: true })).toBe(false)
  })

  it('returns false when readScope is null', () => {
    expect(buildStudioCardAllowed({ ...makeBaseAllowedArgs(), readScope: null })).toBe(false)
  })

  it('returns false when readScope.familyId does not match familyId', () => {
    expect(
      buildStudioCardAllowed({
        ...makeBaseAllowedArgs(),
        readScope: { familyId: 'other-family', startDate: '2026-11-01', endDate: '2026-11-30' },
      }),
    ).toBe(false)
  })

  it('returns false when readScope.startDate does not match', () => {
    expect(
      buildStudioCardAllowed({
        ...makeBaseAllowedArgs(),
        readScope: { familyId: FAMILY, startDate: '2026-10-01', endDate: '2026-11-30' },
      }),
    ).toBe(false)
  })

  it('returns false when readScope.endDate does not match', () => {
    expect(
      buildStudioCardAllowed({
        ...makeBaseAllowedArgs(),
        readScope: { familyId: FAMILY, startDate: '2026-11-01', endDate: '2026-12-31' },
      }),
    ).toBe(false)
  })
})

// ── creditedRowsFor ────────────────────────────────────────────────────────

describe('creditedRowsFor', () => {
  it('returns matching entries with valid provenance', () => {
    const entry = makeCreditEntry()
    const result = creditedRowsFor([entry], CHILD)
    expect(result).toHaveLength(1)
    expect(result[0].entry).toBe(entry)
    expect(result[0].provenance).toEqual(validProvenance)
  })

  it('filters out entries for a different child', () => {
    const entry = makeCreditEntry({ childId: OTHER_CHILD })
    expect(creditedRowsFor([entry], CHILD)).toHaveLength(0)
  })

  it('filters out entries with a different source', () => {
    const entry = makeCreditEntry({ source: 'manual' })
    expect(creditedRowsFor([entry], CHILD)).toHaveLength(0)
  })

  it('filters out entries with no source', () => {
    const entry = makeCreditEntry({ source: undefined })
    expect(creditedRowsFor([entry], CHILD)).toHaveLength(0)
  })

  it('returns empty array for empty input', () => {
    expect(creditedRowsFor([], CHILD)).toEqual([])
  })

  it('sorts results by date, oldest first', () => {
    const a = makeCreditEntry({
      date: '2026-11-15',
      id: creditHoursId(CHILD, 'proj-a', 'ver-a'),
      buildStudioCredit: { ...validProvenance, projectId: 'proj-a', versionId: 'ver-a' },
    })
    const b = makeCreditEntry({
      date: '2026-11-01',
      id: creditHoursId(CHILD, 'proj-b', 'ver-b'),
      buildStudioCredit: { ...validProvenance, projectId: 'proj-b', versionId: 'ver-b' },
    })
    const result = creditedRowsFor([a, b], CHILD)
    expect(result).toHaveLength(2)
    expect(result[0].entry.date).toBe('2026-11-01')
    expect(result[1].entry.date).toBe('2026-11-15')
  })

  it('sets provenance to null when buildStudioCredit is missing', () => {
    const entry = makeCreditEntry({ buildStudioCredit: undefined })
    const result = creditedRowsFor([entry], CHILD)
    expect(result).toHaveLength(1)
    expect(result[0].provenance).toBeNull()
  })

  it('sets provenance to null when schema is not 1', () => {
    const entry = makeCreditEntry({
      buildStudioCredit: { ...validProvenance, schema: 2 as unknown as 1 },
    })
    const result = creditedRowsFor([entry], CHILD)
    expect(result).toHaveLength(1)
    expect(result[0].provenance).toBeNull()
  })

  it('sets provenance to null when projectId is not a string', () => {
    const entry = makeCreditEntry({
      buildStudioCredit: {
        ...validProvenance,
        projectId: 42 as unknown as string,
      },
    })
    const result = creditedRowsFor([entry], CHILD)
    expect(result).toHaveLength(1)
    expect(result[0].provenance).toBeNull()
  })

  it('sets provenance to null when versionId is not a string', () => {
    const entry = makeCreditEntry({
      buildStudioCredit: {
        ...validProvenance,
        versionId: null as unknown as string,
      },
    })
    const result = creditedRowsFor([entry], CHILD)
    expect(result).toHaveLength(1)
    expect(result[0].provenance).toBeNull()
  })

  it('sets provenance to null when id does not match creditHoursId', () => {
    const entry = makeCreditEntry({ id: 'wrong-id' })
    const result = creditedRowsFor([entry], CHILD)
    expect(result).toHaveLength(1)
    expect(result[0].provenance).toBeNull()
  })

  it('handles mix of valid, invalid, and non-matching entries', () => {
    const valid = makeCreditEntry({ date: '2026-11-02' })
    const wrongChild = makeCreditEntry({ childId: OTHER_CHILD })
    const wrongSource = makeCreditEntry({ source: 'dad-lab', date: '2026-11-01' })
    const badProvenance = makeCreditEntry({
      date: '2026-11-03',
      id: 'bad-id',
    })

    const result = creditedRowsFor([valid, wrongChild, wrongSource, badProvenance], CHILD)
    expect(result).toHaveLength(2)
    expect(result[0].entry).toBe(valid)
    expect(result[0].provenance).toEqual(validProvenance)
    expect(result[1].entry).toBe(badProvenance)
    expect(result[1].provenance).toBeNull()
  })

  it('includes freeBuild entries with correct provenance', () => {
    const freeBuildProv: BuildStudioCreditProvenance = {
      ...validProvenance,
      kind: 'freeBuild',
      challengeId: undefined,
      challengeRevision: undefined,
    }
    const entry = makeCreditEntry({ buildStudioCredit: freeBuildProv })
    const result = creditedRowsFor([entry], CHILD)
    expect(result).toHaveLength(1)
    expect(result[0].provenance).toEqual(freeBuildProv)
  })
})
