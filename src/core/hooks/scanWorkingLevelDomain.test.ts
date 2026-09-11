import { describe, expect, it } from 'vitest'

import { SubjectBucket } from '../types/enums'
import { workbookBridgeForSource } from '../foundations/workbookBridge'
import { mapSubjectBucket } from './useScanToActivityConfig'
import {
  isPhonicsBearingCurriculum,
  resolveScanWorkingLevelDomain,
} from './scanWorkingLevelDomain'

/**
 * The scan path's own two steps, so a case reads as it would arrive: a
 * curriculum name off a photo, bucketed and bridged exactly as
 * `syncScanToConfig` does it.
 */
const domainForScannedBook = (book: string) =>
  resolveScanWorkingLevelDomain(
    mapSubjectBucket(book, null),
    book,
    workbookBridgeForSource(book)?.sourceId ?? null,
  )

describe('resolveScanWorkingLevelDomain (UX-381)', () => {
  // ── The reported defect, first ──────────────────────────────────
  it('a handwriting page writes NO working level, for either boy', () => {
    // The two scans, verbatim from the 2026-09-11 exports.
    expect(domainForScannedBook('The Good and the Beautiful Handwriting Lesson 35')).toBeNull()
    expect(
      domainForScannedBook('The Good and the Beautiful Handwriting Level 3 Lesson 35'),
    ).toBeNull()
    // And the bare book name the config carries, without the lesson suffix.
    expect(domainForScannedBook('The Good and the Beautiful Handwriting')).toBeNull()
  })

  it('the other language-arts books that are not phonics write nothing either', () => {
    for (const book of [
      'The Good and the Beautiful Grammar',
      'Copywork Book 2',
      'Spelling You See Level C',
      'Handwriting Without Tears',
      'Language Arts Notebook',
    ]) {
      expect(domainForScannedBook(book), book).toBeNull()
    }
  })

  // ── What it still writes ────────────────────────────────────────
  it('a named phonics program still drives the phonics level', () => {
    expect(domainForScannedBook('Fast Phonics')).toBe('phonics')
    expect(domainForScannedBook('Explode the Code Phonics Book 3')).toBe('phonics')
  })

  it('a bridged phonics-bearing language-arts course still drives the phonics level', () => {
    // TGTB Language Arts Level 1 IS a phonics-bearing course, and is the one
    // true case the old blanket `LanguageArts → phonics` line was written for.
    const book = 'The Good and the Beautiful Language Arts Level 1'
    expect(mapSubjectBucket(book, null)).toBe(SubjectBucket.LanguageArts)
    expect(workbookBridgeForSource(book)?.sourceId).toBe('tgtbLanguageArts1')
    expect(domainForScannedBook(book)).toBe('phonics')
  })

  it('a reading book that is not phonics drives comprehension, as before', () => {
    expect(domainForScannedBook('Reading Comprehension Grade 2')).toBe('comprehension')
  })

  it('a math book drives math, as before', () => {
    expect(domainForScannedBook('The Good and the Beautiful Math K')).toBe('math')
  })

  it('a subject with no working-level mapping writes nothing', () => {
    expect(resolveScanWorkingLevelDomain(SubjectBucket.Science, 'Science Book', null)).toBeNull()
    expect(resolveScanWorkingLevelDomain(SubjectBucket.Other, 'Something', null)).toBeNull()
  })

  // ── The rule itself ─────────────────────────────────────────────
  it('a math bridge is not evidence about phonics', () => {
    // Mathseeds resolves to a bridge, but a bridge only speaks for its own graph.
    expect(resolveScanWorkingLevelDomain(SubjectBucket.LanguageArts, 'Mathseeds', 'mathseeds')).toBeNull()
  })

  it('an unrecognised or ambiguous name (null bridge) refuses rather than guesses', () => {
    expect(resolveScanWorkingLevelDomain(SubjectBucket.LanguageArts, 'Level 3 Workbook', null)).toBeNull()
  })

  it('isPhonicsBearingCurriculum takes either signal', () => {
    expect(isPhonicsBearingCurriculum('Handwriting', null)).toBe(false)
    expect(isPhonicsBearingCurriculum('Handwriting', 'fastPhonics')).toBe(true)
    expect(isPhonicsBearingCurriculum('Something Phonics', null)).toBe(true)
    expect(isPhonicsBearingCurriculum('Handwriting', 'mathseeds')).toBe(false)
  })
})
