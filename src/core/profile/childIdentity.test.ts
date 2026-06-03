import { describe, expect, it } from 'vitest'

import {
  computeAge,
  getChildAgeGroup,
  OLDER_AGE_GROUP_THRESHOLD,
} from './childIdentity'

const NOW = new Date('2026-06-02T12:00:00Z')

describe('computeAge', () => {
  it('returns undefined for missing or empty birthdate', () => {
    expect(computeAge(undefined, NOW)).toBeUndefined()
    expect(computeAge('', NOW)).toBeUndefined()
  })

  it('returns undefined for an unparseable birthdate', () => {
    expect(computeAge('not-a-date', NOW)).toBeUndefined()
  })

  it('computes whole-year age (birthday already passed this year)', () => {
    // Lincoln: born 2015-09-30; as of 2026-06-02 birthday has NOT passed → 10
    expect(computeAge('2015-09-30', NOW)).toBe(10)
  })

  it('computes whole-year age (birthday already passed)', () => {
    // London: born 2020-02-20; as of 2026-06-02 birthday HAS passed → 6
    expect(computeAge('2020-02-20', NOW)).toBe(6)
  })

  it('does not count a birthday that has not yet occurred this year', () => {
    expect(computeAge('2016-12-25', NOW)).toBe(9)
    expect(computeAge('2016-06-02', NOW)).toBe(10) // birthday is today
  })
})

describe('getChildAgeGroup', () => {
  it('defaults to younger when no birthdate is set', () => {
    expect(getChildAgeGroup(null, NOW)).toBe('younger')
    expect(getChildAgeGroup({ birthdate: undefined }, NOW)).toBe('younger')
  })

  it('maps an older child to "older"', () => {
    expect(getChildAgeGroup({ birthdate: '2015-09-30' }, NOW)).toBe('older')
  })

  it('maps a young child to "younger"', () => {
    expect(getChildAgeGroup({ birthdate: '2020-02-20' }, NOW)).toBe('younger')
  })

  it('uses the documented threshold boundary', () => {
    const olderBday = `${NOW.getFullYear() - OLDER_AGE_GROUP_THRESHOLD}-01-01`
    const youngerBday = `${NOW.getFullYear() - (OLDER_AGE_GROUP_THRESHOLD - 1)}-01-01`
    expect(getChildAgeGroup({ birthdate: olderBday }, NOW)).toBe('older')
    expect(getChildAgeGroup({ birthdate: youngerBday }, NOW)).toBe('younger')
  })
})
