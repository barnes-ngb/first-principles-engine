import { describe, expect, it } from 'vitest'

import { BusinessItemType } from '../../core/types/business'
import type { BusinessLogEntry } from '../../core/types/business'
import { sumBusinessLog, sumConfirmedBusinessLog } from './businessTotal'

function entry(amount: number, overrides: Partial<BusinessLogEntry> = {}): BusinessLogEntry {
  return {
    id: Math.random().toString(36).slice(2),
    childId: 'lincoln',
    amount,
    itemType: BusinessItemType.StarterKit,
    date: '2026-06-19',
    createdAt: '2026-06-19T12:00:00.000Z',
    ...overrides,
  }
}

describe('sumBusinessLog', () => {
  it('returns 0 for an empty log', () => {
    expect(sumBusinessLog([])).toBe(0)
  })

  it('sums a single entry', () => {
    expect(sumBusinessLog([entry(15)])).toBe(15)
  })

  it('sums multiple entries (the additive money-in total)', () => {
    expect(sumBusinessLog([entry(8), entry(15), entry(40)])).toBe(63)
  })

  it('handles fractional dollar amounts', () => {
    expect(sumBusinessLog([entry(8.5), entry(15.25)])).toBeCloseTo(23.75)
  })

  it('floors negative amounts to 0 — the meter never drops', () => {
    // A negative amount must never subtract from the additive total.
    expect(sumBusinessLog([entry(20), entry(-5)])).toBe(20)
  })

  it('ignores non-finite amounts defensively', () => {
    expect(sumBusinessLog([entry(20), entry(Number.NaN), entry(Infinity)])).toBe(20)
  })
})

describe('sumConfirmedBusinessLog', () => {
  it('returns 0 for an empty log', () => {
    expect(sumConfirmedBusinessLog([])).toBe(0)
  })

  it('counts only entries with confirmed === true', () => {
    const log = [
      entry(15, { confirmed: true }),
      entry(40, { confirmed: true }),
      entry(8, { confirmed: false }),
    ]
    expect(sumConfirmedBusinessLog(log)).toBe(55)
  })

  it('excludes pending (confirmed === false) entries', () => {
    expect(sumConfirmedBusinessLog([entry(20, { confirmed: false })])).toBe(0)
  })

  it('treats a missing/undefined confirmed flag as pending (excluded)', () => {
    // The safe default: pre-chunk-4 entries stay uncounted until OK'd.
    expect(sumConfirmedBusinessLog([entry(20), entry(15, { confirmed: true })])).toBe(15)
  })

  it('never drops below the confirmed sum even with bad pending amounts', () => {
    const log = [
      entry(30, { confirmed: true }),
      entry(-5, { confirmed: true }),
      entry(99, { confirmed: false }),
    ]
    expect(sumConfirmedBusinessLog(log)).toBe(30)
  })
})
