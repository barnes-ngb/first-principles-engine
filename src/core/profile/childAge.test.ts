import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import type { Child } from '../types/family'
import { CHILD_BIRTHDATES, deriveChildAge } from './childAge'

describe('deriveChildAge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 7)) // June 7, 2026
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('computes age from explicit birthdate on child record', () => {
    const child: Child = { id: 'c1', name: 'TestChild', birthdate: '2016-03-15' }
    expect(deriveChildAge(child)).toBe(10)
  })

  it('falls back to CHILD_BIRTHDATES when no birthdate on record', () => {
    const child: Child = { id: 'lincoln', name: 'Lincoln' }
    // Lincoln's default birthdate is 2015-09-01, so on June 7, 2026 he's 10
    expect(deriveChildAge(child)).toBe(10)
  })

  it('uses London default birthdate', () => {
    const child: Child = { id: 'london', name: 'London' }
    // London's default birthdate is 2019-05-01, so on June 7, 2026 he's 7
    expect(deriveChildAge(child)).toBe(7)
  })

  it('returns null for unknown child with no birthdate', () => {
    const child: Child = { id: 'unknown', name: 'Unknown' }
    expect(deriveChildAge(child)).toBeNull()
  })

  it('prefers explicit birthdate over default', () => {
    const child: Child = { id: 'lincoln', name: 'Lincoln', birthdate: '2014-01-01' }
    // Explicit says Jan 2014, so on June 7 2026 he'd be 12
    expect(deriveChildAge(child)).toBe(12)
  })

  it('handles birthday not yet reached in current year', () => {
    vi.setSystemTime(new Date(2026, 0, 15)) // Jan 15, 2026
    const child: Child = { id: 'c1', name: 'Test', birthdate: '2016-06-01' }
    // Birthday is June, hasn't happened yet in Jan — still 9
    expect(deriveChildAge(child)).toBe(9)
  })

  it('handles exact birthday (month and day match)', () => {
    vi.setSystemTime(new Date(2026, 5, 1)) // June 1, 2026
    const child: Child = { id: 'c1', name: 'Test', birthdate: '2016-06-01' }
    expect(deriveChildAge(child)).toBe(10)
  })

  it('handles birthday earlier this month but day not reached', () => {
    vi.setSystemTime(new Date(2026, 5, 1)) // June 1, 2026
    const child: Child = { id: 'c1', name: 'Test', birthdate: '2016-06-15' }
    // Same month but birthday is the 15th, today is the 1st — still 9
    expect(deriveChildAge(child)).toBe(9)
  })

  it('returns null for invalid birthdate string', () => {
    const child: Child = { id: 'c1', name: 'Test', birthdate: 'not-a-date' }
    expect(deriveChildAge(child)).toBeNull()
  })

  it('returns null for empty birthdate string', () => {
    const child: Child = { id: 'c1', name: 'Test', birthdate: '' }
    expect(deriveChildAge(child)).toBeNull()
  })
})

describe('CHILD_BIRTHDATES defaults', () => {
  it('contains Lincoln and London entries', () => {
    expect(CHILD_BIRTHDATES).toHaveProperty('Lincoln')
    expect(CHILD_BIRTHDATES).toHaveProperty('London')
  })

  it('has valid YYYY-MM-DD format', () => {
    const dateRe = /^\d{4}-\d{2}-\d{2}$/
    for (const date of Object.values(CHILD_BIRTHDATES)) {
      expect(date).toMatch(dateRe)
    }
  })
})
