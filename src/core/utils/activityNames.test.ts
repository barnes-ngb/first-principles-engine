import { describe, expect, it } from 'vitest'

import {
  MAX_ACTIVITY_ALIASES,
  activityNames,
  matchesActivityName,
  normalizeAliases,
} from './activityNames'

describe('activityNames', () => {
  it('lists the name first, then the alternates in order', () => {
    expect(
      activityNames({ name: 'Math K', aliases: ['Simply Good and Beautiful Math K', 'SGAB Math'] }),
    ).toEqual(['Math K', 'Simply Good and Beautiful Math K', 'SGAB Math'])
  })

  it('is empty for a config with nothing usable', () => {
    expect(activityNames(null)).toEqual([])
    expect(activityNames({ name: '   ' })).toEqual([])
  })

  it('narrows an unvalidated stored aliases field instead of throwing', () => {
    // Firestore is unvalidated: a stored non-array, or an array holding numbers
    // and blanks, must yield the names that ARE usable rather than poisoning a
    // matcher (the ARCH-47 slice-4 rule, applied at this edge).
    const odd = { name: 'Math K', aliases: 42 as unknown as string[] }
    expect(activityNames(odd)).toEqual(['Math K'])
    const mixed = { name: 'Math K', aliases: [null, 7, '  ', 'Cover Name'] as unknown as string[] }
    expect(activityNames(mixed)).toEqual(['Math K', 'Cover Name'])
  })

  it('drops an alternate that keys the same as the name', () => {
    expect(activityNames({ name: 'Math K', aliases: ['math k!', 'Cover Name'] })).toEqual([
      'Math K',
      'Cover Name',
    ])
  })
})

describe('matchesActivityName', () => {
  const config = { name: 'Math K', aliases: ['Simply Good and Beautiful Math K — Course Book'] }

  it('matches the name and every alternate', () => {
    expect(matchesActivityName(config, 'Math K')).toBe(true)
    expect(matchesActivityName(config, 'math k')).toBe(true)
    expect(matchesActivityName(config, 'Simply Good and Beautiful Math K - Course Book')).toBe(true)
  })

  it('does not match a name that differs by a real word', () => {
    // UX-205/UX-207: alternates widen WHAT is compared, never HOW. Loosening
    // the comparison is how a scan starts matching the wrong workbook.
    expect(matchesActivityName({ name: 'Good and the Beautiful Math' }, 'The Good and the Beautiful Math')).toBe(false)
    expect(matchesActivityName(config, 'Math')).toBe(false)
  })

  it('never matches an empty candidate', () => {
    expect(matchesActivityName(config, '')).toBe(false)
    expect(matchesActivityName(config, null)).toBe(false)
  })
})

describe('normalizeAliases', () => {
  it('drops blanks, the name itself, and duplicates by key', () => {
    expect(normalizeAliases(['  ', 'math k', 'Cover Name', 'cover name!'], 'Math K')).toEqual([
      'Cover Name',
    ])
  })

  it('caps from the oldest end so the newest alternate survives', () => {
    const many = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']
    const kept = normalizeAliases(many, 'Math K')
    expect(kept).toHaveLength(MAX_ACTIVITY_ALIASES)
    expect(kept).toEqual(['a2', 'a3', 'a4', 'a5', 'a6', 'a7'])
  })

  it('returns [] for a non-array stored value', () => {
    expect(normalizeAliases(undefined, 'Math K')).toEqual([])
    expect(normalizeAliases(99 as unknown as string[], 'Math K')).toEqual([])
  })
})
