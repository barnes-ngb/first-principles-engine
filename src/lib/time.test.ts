import { describe, expect, it } from 'vitest'

import { getSchoolYearRange } from './time'

describe('getSchoolYearRange', () => {
  it('returns the current school year for dates on or after July 1', () => {
    const result = getSchoolYearRange(new Date(2024, 6, 1))

    expect(result).toEqual({
      start: '2024-07-01',
      end: '2025-06-30',
    })
  })

  it('returns the prior school year for dates before July 1', () => {
    const result = getSchoolYearRange(new Date(2024, 5, 30))

    expect(result).toEqual({
      start: '2023-07-01',
      end: '2024-06-30',
    })
  })
})
