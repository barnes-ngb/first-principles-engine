import { describe, it, expect } from 'vitest'

import { parseDateFromDocId, deriveChildIdFromDocId } from './docId'

describe('parseDateFromDocId', () => {
  it('extracts date from new format {date}_{childId}', () => {
    expect(parseDateFromDocId('2025-03-15_child-abc')).toBe('2025-03-15')
  })

  it('extracts date from legacy format {childId}_{date}', () => {
    expect(parseDateFromDocId('child-abc_2025-03-15')).toBe('2025-03-15')
  })

  it('returns the raw ID when it is exactly a date', () => {
    expect(parseDateFromDocId('2025-03-15')).toBe('2025-03-15')
  })

  it('returns raw ID when no YYYY-MM-DD segment found', () => {
    expect(parseDateFromDocId('some-random-id')).toBe('some-random-id')
  })

  it('handles IDs with multiple underscores by checking prefix/suffix', () => {
    expect(parseDateFromDocId('2025-03-15_child_with_underscores')).toBe('2025-03-15')
  })

  it('handles suffix date with multi-part childId', () => {
    expect(parseDateFromDocId('abc_def_2025-03-15')).toBe('2025-03-15')
  })
})

describe('deriveChildIdFromDocId', () => {
  it('extracts childId from {date}_{childId} format', () => {
    expect(deriveChildIdFromDocId('2025-03-15_child-abc')).toBe('child-abc')
  })

  it('extracts childId from legacy {childId}_{date} format', () => {
    expect(deriveChildIdFromDocId('child-abc_2025-03-15')).toBe('child-abc')
  })

  it('returns undefined when no underscore present', () => {
    expect(deriveChildIdFromDocId('2025-03-15')).toBeUndefined()
  })

  it('returns undefined when no valid date segment found', () => {
    expect(deriveChildIdFromDocId('abc_def')).toBeUndefined()
  })

  it('handles empty string gracefully', () => {
    expect(deriveChildIdFromDocId('')).toBeUndefined()
  })
})
