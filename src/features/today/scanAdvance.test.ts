import { describe, expect, it } from 'vitest'

import type { ChecklistItem } from '../../core/types'
import { autoCompleteBypassedItems } from './scanAdvance'

const make = (overrides: Partial<ChecklistItem> = {}): ChecklistItem => ({
  label: 'Test Item',
  completed: false,
  ...overrides,
})

describe('autoCompleteBypassedItems', () => {
  it('auto-completes the scanned item when position advances', () => {
    const checklist = [
      make({ label: 'GATB Math Lesson 40', activityConfigId: 'cfg-1' }),
      make({ label: 'Reading', activityConfigId: 'cfg-2' }),
    ]
    const result = autoCompleteBypassedItems(checklist, 0, 'cfg-1', 42, 'do')

    expect(result).not.toBeNull()
    expect(result![0].completed).toBe(true)
    expect(result![0].completedAt).toBeDefined()
    expect(result![0].gradeResult).toBe('Scanned via lesson 42')
    // Reading item untouched
    expect(result![1].completed).toBe(false)
  })

  it('auto-completes other items with matching activityConfigId', () => {
    const checklist = [
      make({ label: 'GATB Math — morning', activityConfigId: 'cfg-1' }),
      make({ label: 'GATB Math — afternoon', activityConfigId: 'cfg-1' }),
      make({ label: 'Reading', activityConfigId: 'cfg-2' }),
    ]
    // Scan triggered from index 0, but index 1 also matches configId
    const result = autoCompleteBypassedItems(checklist, 0, 'cfg-1', 50, 'do')

    expect(result).not.toBeNull()
    expect(result![0].completed).toBe(true)
    expect(result![1].completed).toBe(true)
    expect(result![2].completed).toBe(false)
  })

  it('sets skipReason ai-recommended when recommendation is skip', () => {
    const checklist = [
      make({ label: 'GATB Reading', activityConfigId: 'cfg-1' }),
    ]
    const result = autoCompleteBypassedItems(checklist, 0, 'cfg-1', 35, 'skip')

    expect(result).not.toBeNull()
    expect(result![0].completed).toBe(true)
    expect(result![0].skipReason).toBe('ai-recommended')
  })

  it('does not set skipReason for non-skip recommendations', () => {
    const checklist = [
      make({ label: 'GATB Reading', activityConfigId: 'cfg-1' }),
    ]
    const result = autoCompleteBypassedItems(checklist, 0, 'cfg-1', 35, 'do')

    expect(result).not.toBeNull()
    expect(result![0].skipReason).toBeUndefined()
  })

  it('returns null when no configId provided', () => {
    const checklist = [make({ label: 'Item' })]
    expect(autoCompleteBypassedItems(checklist, 0, undefined, 10, 'do')).toBeNull()
  })

  it('returns null when no lesson number provided (no position change)', () => {
    const checklist = [make({ label: 'Item', activityConfigId: 'cfg-1' })]
    expect(autoCompleteBypassedItems(checklist, 0, 'cfg-1', null, 'do')).toBeNull()
  })

  it('skips already completed items', () => {
    const checklist = [
      make({ label: 'Already Done', activityConfigId: 'cfg-1', completed: true, completedAt: '2026-04-10T08:00:00Z' }),
    ]
    const result = autoCompleteBypassedItems(checklist, 0, 'cfg-1', 50, 'do')
    expect(result).toBeNull()
  })

  it('skips already skipped items', () => {
    const checklist = [
      make({ label: 'Skipped', activityConfigId: 'cfg-1', skipped: true }),
    ]
    const result = autoCompleteBypassedItems(checklist, 0, 'cfg-1', 50, 'do')
    expect(result).toBeNull()
  })

  it('auto-completes scanned item even without activityConfigId (index match)', () => {
    const checklist = [
      make({ label: 'GATB Math Lesson 40' }), // no activityConfigId
      make({ label: 'Reading' }),
    ]
    const result = autoCompleteBypassedItems(checklist, 0, 'cfg-1', 42, 'do')

    expect(result).not.toBeNull()
    expect(result![0].completed).toBe(true)
    expect(result![1].completed).toBe(false)
  })

  it('returns null when no items change', () => {
    const checklist = [
      make({ label: 'Unrelated', activityConfigId: 'cfg-other' }),
    ]
    // Index 5 is out of bounds, configId doesn't match
    const result = autoCompleteBypassedItems(checklist, 5, 'cfg-1', 42, 'do')
    expect(result).toBeNull()
  })
})
