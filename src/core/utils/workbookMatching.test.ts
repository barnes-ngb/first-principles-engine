import { describe, expect, it } from 'vitest'

import {
  extractLessonNumber,
  findWorkbookConfigId,
  isSameWorkbook,
  normalizeWorkbookName,
  type WorkbookConfigLike,
  type WorkbookLike,
} from './workbookMatching'
import { SubjectBucket } from '../types/enums'

describe('extractLessonNumber', () => {
  it('pulls a number from "Lesson N"', () => {
    expect(extractLessonNumber('GATB Math — Lesson 17')).toBe(17)
  })

  it('pulls a number from "les N"', () => {
    expect(extractLessonNumber('GATB Math les 5')).toBe(5)
  })

  it('pulls a number from "Chapter N"', () => {
    expect(extractLessonNumber('Saxon Math Chapter 42')).toBe(42)
  })

  it('returns null when no lesson number present', () => {
    expect(extractLessonNumber('Read Aloud')).toBeNull()
  })
})

describe('normalizeWorkbookName', () => {
  it('lowercases and strips lesson references', () => {
    expect(normalizeWorkbookName('GATB Math — Lesson 17')).toBe('gatb math')
  })

  it('strips time estimates', () => {
    expect(normalizeWorkbookName('GATB Reading Booster 30m')).toBe('gatb reading booster')
  })

  it('strips "book set"', () => {
    expect(normalizeWorkbookName('GATB Reading Booster B Book Set')).toBe('gatb reading booster b')
  })

  it('collapses separators and whitespace', () => {
    expect(normalizeWorkbookName('GATB  —  Reading :: Booster')).toBe('gatb reading booster')
  })
})

describe('isSameWorkbook', () => {
  const make = (overrides: Partial<WorkbookLike>): WorkbookLike => ({
    label: '',
    ...overrides,
  })

  it('matches on activityConfigId when both have it', () => {
    expect(
      isSameWorkbook(
        make({ label: 'A', activityConfigId: 'cfg-1' }),
        make({ label: 'B', activityConfigId: 'cfg-1' }),
      ),
    ).toBe(true)

    expect(
      isSameWorkbook(
        make({ label: 'A', activityConfigId: 'cfg-1' }),
        make({ label: 'A', activityConfigId: 'cfg-2' }),
      ),
    ).toBe(false)
  })

  it('matches "GATB Reading Booster Lesson 17" to "GATB Reading Booster B Book Set"', () => {
    expect(
      isSameWorkbook(
        make({ label: 'GATB Reading Booster B Book Set', subjectBucket: 'Reading' }),
        make({ label: 'GATB Reading Booster — Lesson 17', subjectBucket: 'Reading' }),
      ),
    ).toBe(true)
  })

  it('matches "Mathseeds Lesson 3" to "Mathseeds Mental Minute"', () => {
    expect(
      isSameWorkbook(
        make({ label: 'Mathseeds Mental Minute', subjectBucket: 'Math' }),
        make({ label: 'Mathseeds Lesson 3', subjectBucket: 'Math' }),
      ),
    ).toBe(true)
  })

  it('does not match unrelated items', () => {
    expect(
      isSameWorkbook(
        make({ label: 'Read Aloud', subjectBucket: 'Reading' }),
        make({ label: 'Math Warm Up', subjectBucket: 'Math' }),
      ),
    ).toBe(false)
  })

  it('does not match items with shared words across different subjects', () => {
    expect(
      isSameWorkbook(
        make({ label: 'Reading Stations', subjectBucket: 'Reading' }),
        make({ label: 'Math Stations', subjectBucket: 'Math' }),
      ),
    ).toBe(false)
  })
})

describe('findWorkbookConfigId (FEAT-62 lock-in join)', () => {
  const cfg = (overrides: Partial<WorkbookConfigLike>): WorkbookConfigLike => ({
    id: '',
    type: 'workbook',
    ...overrides,
  })

  const configs: WorkbookConfigLike[] = [
    cfg({ id: 'wb-math', name: 'Good and the Beautiful Math', subjectBucket: SubjectBucket.Math }),
    cfg({ id: 'wb-la', name: 'Good and the Beautiful Language Arts', subjectBucket: SubjectBucket.LanguageArts }),
    cfg({ id: 'wb-eggs', name: 'Reading Eggs', subjectBucket: SubjectBucket.Reading }),
  ]

  it('matches a TGTB math plan item to its workbook config', () => {
    expect(
      findWorkbookConfigId(
        { label: 'Good and the Beautiful Math (30m)', subjectBucket: SubjectBucket.Math },
        configs,
      ),
    ).toBe('wb-math')
  })

  it('disambiguates two GATB workbooks by subject', () => {
    expect(
      findWorkbookConfigId(
        { label: 'Good and the Beautiful Language Arts — Lesson 42', subjectBucket: SubjectBucket.LanguageArts },
        configs,
      ),
    ).toBe('wb-la')
  })

  it('returns undefined when no workbook matches (non-workbook item)', () => {
    expect(
      findWorkbookConfigId(
        { label: 'Prayer & Scripture', subjectBucket: SubjectBucket.Other },
        configs,
      ),
    ).toBeUndefined()
  })

  it('ignores non-workbook-type configs', () => {
    expect(
      findWorkbookConfigId(
        { label: 'Morning Routine', subjectBucket: SubjectBucket.Other },
        [cfg({ id: 'routine-1', name: 'Morning Routine', type: 'routine', subjectBucket: SubjectBucket.Other })],
      ),
    ).toBeUndefined()
  })

  it('excludes configs explicitly marked scannable:false', () => {
    expect(
      findWorkbookConfigId(
        { label: 'Reading Eggs', subjectBucket: SubjectBucket.Reading },
        [cfg({ id: 'wb-eggs', name: 'Reading Eggs', subjectBucket: SubjectBucket.Reading, scannable: false })],
      ),
    ).toBeUndefined()
  })

  it('treats absent scannable as scannable (legacy configs)', () => {
    expect(
      findWorkbookConfigId(
        { label: 'Reading Eggs (20m)', subjectBucket: SubjectBucket.Reading },
        configs,
      ),
    ).toBe('wb-eggs')
  })
})
