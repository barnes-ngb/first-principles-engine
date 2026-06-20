import { describe, expect, it } from 'vitest'

import { BusinessItemType } from '../../core/types/business'
import type { BusinessLogEntry } from '../../core/types/business'
import { sumBusinessLog } from './businessTotal'

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
