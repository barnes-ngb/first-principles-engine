import { describe, expect, it } from 'vitest'

import { describeActivityAudience } from './activityMinutesView'

describe('describeActivityAudience — who a setActivityMinutes card affects (FEAT-135)', () => {
  it('says "affects child only" for a child-specific config', () => {
    expect(describeActivityAudience('lincoln-id', ['Lincoln', 'London'], 'Lincoln')).toBe(
      'Affects Lincoln only.',
    )
  })

  it('lists both children for a shared config', () => {
    const result = describeActivityAudience('both', ['Lincoln', 'London'], 'Lincoln')
    expect(result).toContain('Lincoln and London')
    expect(result).toContain('Shared activity')
  })

  it('formats three children with commas and "and"', () => {
    const result = describeActivityAudience('both', ['A', 'B', 'C'], 'A')
    expect(result).toBe('Shared activity — this changes it for A, B and C.')
  })

  it('handles a single child in the allChildNames list for shared config', () => {
    const result = describeActivityAudience('both', ['Lincoln'], 'Lincoln')
    expect(result).toContain('Lincoln')
    expect(result).toContain('Shared activity')
  })

  it('falls back to "every child" when names list is empty', () => {
    const result = describeActivityAudience('both', [], 'Lincoln')
    expect(result).toContain('every child')
  })

  it('filters out blank names', () => {
    const result = describeActivityAudience('both', ['Lincoln', '', '  ', 'London'], 'Lincoln')
    expect(result).toBe('Shared activity — this changes it for Lincoln and London.')
  })
})
