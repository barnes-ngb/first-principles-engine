import { describe, it, expect } from 'vitest'
import { isWorkbookMatch, normalizeForMatch } from './useScanToActivityConfig'

describe('normalizeForMatch', () => {
  it('strips "Mental Minute" suffix so the base curriculum name compares cleanly', () => {
    expect(normalizeForMatch('Mathseeds Mental Minute')).toBe(normalizeForMatch('Mathseeds'))
  })

  it('strips level designations', () => {
    expect(normalizeForMatch('Reading Eggs Level 3')).toBe(normalizeForMatch('Reading Eggs'))
  })

  it('strips leading "The"', () => {
    expect(normalizeForMatch('The Good and the Beautiful Math')).toBe(
      normalizeForMatch('Good and the Beautiful Math'),
    )
  })
})

describe('isWorkbookMatch', () => {
  it('matches "Mathseeds" with "Mathseeds Mental Minute" — same base curriculum', () => {
    expect(isWorkbookMatch('Mathseeds Mental Minute', 'Mathseeds')).toBe(true)
    expect(isWorkbookMatch('Mathseeds', 'Mathseeds Mental Minute')).toBe(true)
  })

  it('matches GATB variants with subject in common', () => {
    expect(
      isWorkbookMatch('Good and the Beautiful Math', 'GATB Math'),
    ).toBe(true)
  })

  it('does NOT match unrelated curricula', () => {
    expect(isWorkbookMatch('Mathseeds', 'Reading Eggs')).toBe(false)
    expect(isWorkbookMatch('Handwriting Without Tears', 'Math With Mom')).toBe(false)
  })

  // DATA-15: the bare same-subject fallback ("one primary workbook per subject")
  // was removed because it collapsed distinctly-named workbooks that shared a
  // detected subject into one config. These cases pin the corrected behavior.

  it('(a) does NOT collapse distinctly-named workbooks that share a subject', () => {
    // Four distinct Math workbooks, all detected subject "Math". Before the fix
    // the bare same-subject fallback made every pair match → 4 configs → 1.
    const mathWorkbooks = ['Mathseeds', 'Beast Academy', 'Math Mammoth', 'Saxon Math']
    for (let i = 0; i < mathWorkbooks.length; i++) {
      for (let j = i + 1; j < mathWorkbooks.length; j++) {
        expect(
          isWorkbookMatch(mathWorkbooks[i], mathWorkbooks[j], 'Math', 'Math'),
        ).toBe(false)
      }
    }
  })

  it('(b) still matches a generic / subject-only scan to the existing subject workbook', () => {
    // A nameless scan falls back to its subject name ("Math"), or a generic
    // "Math Workbook". Either should update the existing Math workbook, not
    // create a duplicate — preserved via the generic-workbook and
    // one-contains-the-other rules.
    expect(isWorkbookMatch('Mathseeds', 'Math Workbook', 'Math', 'Math')).toBe(true)
    expect(isWorkbookMatch('Mathseeds', 'Math', 'Math', 'Math')).toBe(true)
  })

  it('(c) treats GATB Math and GATB Language Arts as distinct', () => {
    expect(
      isWorkbookMatch(
        'Good and the Beautiful Math',
        'Good and the Beautiful Language Arts',
        'Math',
        'LanguageArts',
      ),
    ).toBe(false)
  })

  it('(d) matches an exact re-scan despite surface variations (the / level / parens)', () => {
    // normalizeForMatch strips leading "The", "Level N", and parentheticals, so a
    // re-scan of the same workbook still resolves to the same config.
    expect(isWorkbookMatch('Reading Eggs Level 3', 'Reading Eggs')).toBe(true)
    expect(
      isWorkbookMatch('The Good and the Beautiful Math (Unit 2)', 'Good and the Beautiful Math'),
    ).toBe(true)
  })
})
