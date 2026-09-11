import { describe, it, expect } from 'vitest'
import {
  deriveLevelForSubject,
  isWorkbookMatch,
  mapSubjectBucket,
  normalizeForMatch,
  planScannedNameUpgrade,
} from './useScanToActivityConfig'

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

// ── planScannedNameUpgrade (UX-279) ─────────────────────────────────────────
//
// The rule that would have made a rename not survive its first scan.

describe('planScannedNameUpgrade', () => {
  const COVER = 'Simply Good and Beautiful Math K — Course Book'

  it('still upgrades a name nobody has curated — the original rule, intact', () => {
    expect(planScannedNameUpgrade({ name: 'Math' }, COVER)).toEqual({
      name: COVER,
      curriculum: COVER,
    })
  })

  it('never shortens a name — a less specific scan changes nothing', () => {
    expect(planScannedNameUpgrade({ name: COVER }, 'Math')).toEqual({
      name: null,
      curriculum: null,
    })
  })

  it('leaves a RENAMED config\'s name alone, and still upgrades its curriculum', () => {
    // She renamed the cover name to "Math K", so the old name is an alternate.
    // Without this, the next photo of that cover writes the long name straight
    // back over her label and the rename is gone.
    expect(planScannedNameUpgrade({ name: 'Math K', aliases: [COVER] }, COVER)).toEqual({
      name: null,
      curriculum: COVER,
    })
  })

  it('upgrades a row no parent has ever named — the field is ABSENT there', () => {
    expect(planScannedNameUpgrade({ name: 'Math' }, COVER).name).toBe(COVER)
  })

  it('an EMPTY alternates list is still a parent having named this row', () => {
    // Codex round 2, P2. Two real saves write `[]`: a re-spelling rename, where
    // the old name keys the same and buys no slot, and a parent removing the
    // alternates she no longer wanted. Requiring a non-empty list let the next
    // longer scanned cover overwrite the label she had just chosen. Nothing but
    // the rename dialog writes this field, so its presence is the marker.
    expect(planScannedNameUpgrade({ name: 'Math K', aliases: [] }, COVER)).toEqual({
      name: null,
      curriculum: COVER,
    })
  })

  it('keeps the 100-character ceiling on a scanned name', () => {
    const runaway = 'x'.repeat(120)
    expect(planScannedNameUpgrade({ name: 'Math' }, runaway)).toEqual({
      name: null,
      curriculum: null,
    })
  })
})

// ── UX-381: which working level a scanned page may write ─────────
//
// `deriveLevelForSubject` is the scan path's own join of the domain rule and
// the three ladders, so these assert the whole decision the way the scan makes
// it — from a curriculum name, through `mapSubjectBucket`, to a level or none.

describe('deriveLevelForSubject (UX-381)', () => {
  const forBook = (book: string, lesson: number | null) =>
    deriveLevelForSubject(mapSubjectBucket(book, null), lesson, book)

  it('writes NO level for the handwriting page both boys did', () => {
    expect(forBook('The Good and the Beautiful Handwriting', 35)).toBeNull()
    expect(forBook('The Good and the Beautiful Handwriting Level 3', 35)).toBeNull()
  })

  it('still writes the phonics level for a real phonics program', () => {
    expect(forBook('Fast Phonics', 35)).toMatchObject({
      key: 'phonics',
      level: { level: 2, source: 'curriculum' },
    })
  })

  it('still writes math and comprehension exactly as before', () => {
    expect(forBook('The Good and the Beautiful Math K', 35)).toMatchObject({
      key: 'math',
      level: { level: 2 },
    })
    expect(forBook('Reading Comprehension Grade 2', 35)).toMatchObject({
      key: 'comprehension',
      level: { level: 3 },
    })
  })

  it('writes nothing without a lesson number, whatever the book', () => {
    expect(forBook('Fast Phonics', null)).toBeNull()
    expect(forBook('The Good and the Beautiful Math K', 0)).toBeNull()
  })
})
