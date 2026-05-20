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
})
