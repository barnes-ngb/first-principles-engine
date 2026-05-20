import { describe, expect, it } from 'vitest'

import type { ChecklistItem, DayLog } from '../../core/types'
import {
  computeRollover,
  formatRolloverSource,
  getItemsToRollOver,
  getPreviousSchoolDay,
  mergeRolledItems,
} from './rollover'

// ── getPreviousSchoolDay ────────────────────────────────────────────

describe('getPreviousSchoolDay', () => {
  it('returns previous day for Tuesday-Friday', () => {
    expect(getPreviousSchoolDay('2026-04-14')).toBe('2026-04-13') // Tue→Mon
    expect(getPreviousSchoolDay('2026-04-15')).toBe('2026-04-14') // Wed→Tue
    expect(getPreviousSchoolDay('2026-04-16')).toBe('2026-04-15') // Thu→Wed
    expect(getPreviousSchoolDay('2026-04-17')).toBe('2026-04-16') // Fri→Thu
  })

  it('returns Friday for Monday (skips weekend)', () => {
    expect(getPreviousSchoolDay('2026-04-13')).toBe('2026-04-10') // Mon→Fri
  })

  it('returns null for Saturday and Sunday', () => {
    expect(getPreviousSchoolDay('2026-04-11')).toBeNull() // Sat
    expect(getPreviousSchoolDay('2026-04-12')).toBeNull() // Sun
  })

  it('handles month boundaries', () => {
    // Monday March 2, 2026 → Friday Feb 27, 2026
    expect(getPreviousSchoolDay('2026-03-02')).toBe('2026-02-27')
  })

  it('handles year boundaries', () => {
    // Monday Jan 5, 2026 → Friday Jan 2, 2026
    expect(getPreviousSchoolDay('2026-01-05')).toBe('2026-01-02')
  })
})

// ── getItemsToRollOver ──────────────────────────────────────────────

describe('getItemsToRollOver', () => {
  const make = (overrides: Partial<ChecklistItem> = {}): ChecklistItem => ({
    label: 'Test Item',
    completed: false,
    ...overrides,
  })

  it('returns unchecked, non-skipped items', () => {
    const items = [
      make({ label: 'Incomplete' }),
      make({ label: 'Done', completed: true }),
      make({ label: 'Skipped', skipped: true }),
    ]
    const result = getItemsToRollOver(items)
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('Incomplete')
  })

  it('excludes aspirational items', () => {
    const items = [
      make({ label: 'Regular', aspirational: false }),
      make({ label: 'Aspirational', aspirational: true }),
    ]
    const result = getItemsToRollOver(items)
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('Regular')
  })

  it('returns empty array when all items are complete', () => {
    const items = [make({ completed: true }), make({ completed: true })]
    expect(getItemsToRollOver(items)).toHaveLength(0)
  })
})

// ── mergeRolledItems ────────────────────────────────────────────────

describe('mergeRolledItems', () => {
  const make = (overrides: Partial<ChecklistItem> = {}): ChecklistItem => ({
    label: 'Test Item',
    completed: false,
    ...overrides,
  })

  it('appends rolled items to end of today checklist when no workbook match', () => {
    const today = [make({ label: 'Today Item' })]
    const rolled = [make({ label: 'Yesterday Item' })]
    const result = mergeRolledItems(today, rolled, '2026-04-10')

    expect(result).toHaveLength(2)
    expect(result[0].label).toBe('Today Item')
    expect(result[1].label).toBe('Yesterday Item')
    expect(result[1].rolledOver).toBe(true)
    expect(result[1].rolledOverFrom).toBe('2026-04-10')
  })

  it('rolled item with matching activityConfigId REPLACES planned item', () => {
    const today = [make({ label: 'GATB Math', activityConfigId: 'cfg-1' })]
    const rolled = [make({ label: 'GATB Math L5', activityConfigId: 'cfg-1' })]
    const result = mergeRolledItems(today, rolled, '2026-04-10')

    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('GATB Math L5')
    expect(result[0].rolledOver).toBe(true)
    expect(result[0].rolledOverFrom).toBe('2026-04-10')
  })

  it('rolled "GATB Reading Booster Lesson 17" replaces planned "GATB Reading Booster B Book Set"', () => {
    const today = [
      make({ label: 'GATB Reading Booster B Book Set', subjectBucket: 'Reading' }),
    ]
    const rolled = [
      make({ label: 'GATB Reading Booster — Lesson 17', subjectBucket: 'Reading' }),
    ]
    const result = mergeRolledItems(today, rolled, '2026-04-10')

    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('GATB Reading Booster — Lesson 17')
    expect(result[0].rolledOver).toBe(true)
  })

  it('rolled "Mathseeds Lesson 3" replaces planned "Mathseeds Mental Minute"', () => {
    const today = [make({ label: 'Mathseeds Mental Minute', subjectBucket: 'Math' })]
    const rolled = [make({ label: 'Mathseeds Lesson 3', subjectBucket: 'Math' })]
    const result = mergeRolledItems(today, rolled, '2026-04-10')

    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('Mathseeds Lesson 3')
    expect(result[0].rolledOver).toBe(true)
  })

  it('rolled item with no workbook match is appended normally', () => {
    const today = [make({ label: 'Math Warm Up', subjectBucket: 'Math' })]
    const rolled = [make({ label: 'Art Project', subjectBucket: 'Art' })]
    const result = mergeRolledItems(today, rolled, '2026-04-10')

    expect(result).toHaveLength(2)
    expect(result[1].label).toBe('Art Project')
    expect(result[1].rolledOver).toBe(true)
  })

  it('two rolled items for different workbooks both get kept', () => {
    const rolled = [
      make({ label: 'GATB Math Lesson 5', subjectBucket: 'Math' }),
      make({ label: 'GATB Reading Lesson 12', subjectBucket: 'Reading' }),
    ]
    const result = mergeRolledItems([], rolled, '2026-04-10')

    expect(result).toHaveLength(2)
    expect(result[0].label).toBe('GATB Math Lesson 5')
    expect(result[1].label).toBe('GATB Reading Lesson 12')
  })

  it('when both have lesson numbers, higher number wins (planned higher ⇒ planned kept)', () => {
    const today = [make({ label: 'GATB Math — Lesson 18', subjectBucket: 'Math' })]
    const rolled = [make({ label: 'GATB Math — Lesson 17', subjectBucket: 'Math' })]
    const result = mergeRolledItems(today, rolled, '2026-04-10')

    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('GATB Math — Lesson 18')
    // Planned item kept as-is — not rolled
    expect(result[0].rolledOver).toBeUndefined()
  })

  it('when both have lesson numbers, higher number wins (rolled higher ⇒ rolled kept)', () => {
    const today = [make({ label: 'GATB Math — Lesson 10', subjectBucket: 'Math' })]
    const rolled = [make({ label: 'GATB Math — Lesson 17', subjectBucket: 'Math' })]
    const result = mergeRolledItems(today, rolled, '2026-04-10')

    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('GATB Math — Lesson 17')
    expect(result[0].rolledOver).toBe(true)
  })

  it('skip guidance copied from planned to rolled when rolled lacks it', () => {
    const today = [
      make({
        label: 'GATB Reading Booster B Book Set',
        subjectBucket: 'Reading',
        skipGuidance: 'If stuck, re-read the example aloud together.',
        block: 'core-reading',
        plannedMinutes: 30,
      }),
    ]
    const rolled = [
      make({ label: 'GATB Reading Booster — Lesson 17', subjectBucket: 'Reading' }),
    ]
    const result = mergeRolledItems(today, rolled, '2026-04-10')

    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('GATB Reading Booster — Lesson 17')
    expect(result[0].skipGuidance).toBe('If stuck, re-read the example aloud together.')
    expect(result[0].block).toBe('core-reading')
    expect(result[0].plannedMinutes).toBe(30)
    expect(result[0].rolledOver).toBe(true)
  })

  it('resets completion-related fields on rolled items', () => {
    const rolled = [
      make({
        label: 'Completed Yesterday',
        completed: false,
        completedAt: '2026-04-10T10:00:00Z',
        actualMinutes: 30,
        evidenceArtifactId: 'art-1',
        evidenceCollection: 'scans',
        gradeResult: 'good',
        mastery: 'got-it',
        engagement: 'engaged',
        scanned: true,
      }),
    ]
    const result = mergeRolledItems([], rolled, '2026-04-10')

    expect(result[0].completed).toBe(false)
    expect(result[0].completedAt).toBeUndefined()
    expect(result[0].actualMinutes).toBeUndefined()
    expect(result[0].evidenceArtifactId).toBeUndefined()
    expect(result[0].evidenceCollection).toBeUndefined()
    expect(result[0].gradeResult).toBeUndefined()
    expect(result[0].mastery).toBeUndefined()
    expect(result[0].engagement).toBeUndefined()
    expect(result[0].scanned).toBeUndefined()
  })

  it('preserves planning fields (subjectBucket, block, etc.)', () => {
    const rolled = [
      make({
        label: 'GATB Reading',
        activityConfigId: 'cfg-2',
        subjectBucket: 'Reading',
        block: 'core-reading',
        plannedMinutes: 20,
        contentGuide: 'Lesson 42',
        itemType: 'workbook',
      }),
    ]
    const result = mergeRolledItems([], rolled, '2026-04-10')

    expect(result[0].activityConfigId).toBe('cfg-2')
    expect(result[0].subjectBucket).toBe('Reading')
    expect(result[0].block).toBe('core-reading')
    expect(result[0].plannedMinutes).toBe(20)
    expect(result[0].contentGuide).toBe('Lesson 42')
    expect(result[0].itemType).toBe('workbook')
  })

  it('handles empty today checklist', () => {
    const rolled = [make({ label: 'Item A' }), make({ label: 'Item B' })]
    const result = mergeRolledItems([], rolled, '2026-04-10')

    expect(result).toHaveLength(2)
    expect(result.every((i) => i.rolledOver)).toBe(true)
  })
})

// ── computeRollover ─────────────────────────────────────────────────

describe('computeRollover', () => {
  const make = (overrides: Partial<ChecklistItem> = {}): ChecklistItem => ({
    label: 'Test Item',
    completed: false,
    ...overrides,
  })

  const makeDayLog = (checklist: ChecklistItem[]): DayLog => ({
    childId: 'lincoln',
    date: '2026-04-10',
    blocks: [],
    checklist,
  })

  it('returns merged checklist when previous day has incomplete items', () => {
    const prevLog = makeDayLog([
      make({ label: 'Unfinished', completed: false }),
      make({ label: 'Done', completed: true }),
    ])
    const result = computeRollover('2026-04-13', [], prevLog)

    expect(result).not.toBeNull()
    expect(result).toHaveLength(1)
    expect(result![0].label).toBe('Unfinished')
    expect(result![0].rolledOver).toBe(true)
  })

  it('returns null when previous day has no checklist', () => {
    const prevLog = makeDayLog([])
    expect(computeRollover('2026-04-13', [], prevLog)).toBeNull()
  })

  it('returns null when all items are complete', () => {
    const prevLog = makeDayLog([
      make({ label: 'Done', completed: true }),
    ])
    expect(computeRollover('2026-04-13', [], prevLog)).toBeNull()
  })

  it('returns null when previous day log is null', () => {
    expect(computeRollover('2026-04-13', [], null)).toBeNull()
  })

  it('merges with existing today checklist, replacing same-workbook items', () => {
    const prevLog = makeDayLog([
      make({ label: 'Reading Lesson 5', activityConfigId: 'cfg-1' }),
      make({ label: 'Math Lesson 3', activityConfigId: 'cfg-2' }),
    ])
    const today = [make({ label: 'Reading', activityConfigId: 'cfg-1' })]
    const result = computeRollover('2026-04-13', today, prevLog)

    expect(result).not.toBeNull()
    expect(result).toHaveLength(2)
    // Planned "Reading" replaced by rolled "Reading Lesson 5"
    expect(result![0].label).toBe('Reading Lesson 5')
    expect(result![0].rolledOver).toBe(true)
    expect(result![1].label).toBe('Math Lesson 3')
    expect(result![1].rolledOver).toBe(true)
  })

  it('chain rollover works — previously rolled items roll again', () => {
    const prevLog = makeDayLog([
      make({
        label: 'Chain Item',
        rolledOver: true,
        rolledOverFrom: '2026-04-08',
      }),
    ])
    const result = computeRollover('2026-04-13', [], prevLog)

    expect(result).not.toBeNull()
    expect(result).toHaveLength(1)
    expect(result![0].rolledOver).toBe(true)
    // rolledOverFrom should be the immediate previous day, not the original
    expect(result![0].rolledOverFrom).toBe('2026-04-10')
  })
})

// ── formatRolloverSource ────────────────────────────────────────────

describe('formatRolloverSource', () => {
  it('returns day name', () => {
    expect(formatRolloverSource('2026-04-10')).toBe('Friday')
    expect(formatRolloverSource('2026-04-13')).toBe('Monday')
  })
})
