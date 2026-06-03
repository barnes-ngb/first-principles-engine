import { describe, it, expect } from 'vitest'

import { assertWorkbookOwner, isWorkbookOwnerInvalid } from './useActivityConfigs'

/**
 * DATA-08 — workbooks are per-child; `'both'` is barred for workbook-type
 * configs (routines keep `'both'`). These guard the central writer so a
 * `'both'` workbook can never be created or saved, which is what made London's
 * Curriculum show Lincoln's GATB workbooks.
 */
describe('isWorkbookOwnerInvalid', () => {
  it('rejects a workbook owned by both', () => {
    expect(isWorkbookOwnerInvalid('workbook', 'both')).toBe(true)
  })

  it('allows a workbook owned by a specific child', () => {
    expect(isWorkbookOwnerInvalid('workbook', 'lincoln')).toBe(false)
    expect(isWorkbookOwnerInvalid('workbook', 'london')).toBe(false)
  })

  it('allows a routine owned by both (shared routines keep both)', () => {
    expect(isWorkbookOwnerInvalid('routine', 'both')).toBe(false)
    expect(isWorkbookOwnerInvalid('formation', 'both')).toBe(false)
  })
})

describe('assertWorkbookOwner', () => {
  it('throws when a workbook would be saved as both (create or edit)', () => {
    expect(() => assertWorkbookOwner('workbook', 'both')).toThrow(/specific child/)
  })

  it('does not throw for a workbook assigned to a child', () => {
    expect(() => assertWorkbookOwner('workbook', 'lincoln')).not.toThrow()
  })

  it('does not throw for a both routine', () => {
    expect(() => assertWorkbookOwner('routine', 'both')).not.toThrow()
  })
})

/**
 * Reader visibility mirrors the activity-config query `where('childId','in',
 * [childId,'both'])`. A `'both'` workbook leaks to every child; once reassigned
 * to its real owner it shows only for that child.
 */
function isVisibleToChild(configChildId: string, childId: string): boolean {
  return configChildId === childId || configChildId === 'both'
}

describe('reassignment removes the cross-child bleed', () => {
  it('a both workbook is visible to every child', () => {
    expect(isVisibleToChild('both', 'lincoln')).toBe(true)
    expect(isVisibleToChild('both', 'london')).toBe(true)
  })

  it('a workbook reassigned to Lincoln no longer appears for London', () => {
    const reassigned = 'lincoln'
    expect(isVisibleToChild(reassigned, 'london')).toBe(false)
    expect(isVisibleToChild(reassigned, 'lincoln')).toBe(true)
  })
})
