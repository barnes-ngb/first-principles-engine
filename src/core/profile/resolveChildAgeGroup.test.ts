import { describe, expect, it } from 'vitest'

import { resolveChildAgeGroup } from './childIdentity'
import type { Child } from '../types'

// FEAT-183 — the key every behavioural age branch now reads.
//
// `getChildAgeGroup` is birthdate-only and answers 'younger' when the doc has
// none, which is safe for seeding a font but NOT for choosing a branch: an
// older child whose Firestore doc predates the ARCH-15 identity backfill would
// silently land in the younger child's flow. This helper falls back to the
// canonical birthdate seed first, so today's two boys resolve the same way
// with or without a stored birthdate.

const NOW = new Date('2026-09-03T12:00:00Z')

function child(overrides: Partial<Child>): Child {
  return { id: 'c-x', name: 'Child', ...overrides } as Child
}

describe('resolveChildAgeGroup', () => {
  it('reads the stored birthdate when there is one', () => {
    expect(resolveChildAgeGroup(child({ name: 'Rowan', birthdate: '2014-01-01' }), NOW)).toBe('older')
    expect(resolveChildAgeGroup(child({ name: 'Rowan', birthdate: '2021-01-01' }), NOW)).toBe('younger')
  })

  it('falls back to the canonical seed for a doc with no birthdate', () => {
    // The exact case the plain birthdate-only helper gets wrong.
    expect(resolveChildAgeGroup(child({ name: 'Lincoln' }), NOW)).toBe('older')
    expect(resolveChildAgeGroup(child({ name: 'London' }), NOW)).toBe('younger')
  })

  it('keeps today’s answer for both boys with their real birthdates', () => {
    expect(resolveChildAgeGroup(child({ name: 'Lincoln', birthdate: '2015-09-30' }), NOW)).toBe('older')
    expect(resolveChildAgeGroup(child({ name: 'London', birthdate: '2020-02-20' }), NOW)).toBe('younger')
  })

  it('turns on the age, not the name — a renamed older child still reads older', () => {
    expect(resolveChildAgeGroup(child({ name: 'Rowan', birthdate: '2015-09-30' }), NOW)).toBe('older')
    expect(resolveChildAgeGroup(child({ name: 'Lincoln', birthdate: '2021-06-01' }), NOW)).toBe('younger')
  })

  it('defaults to younger with no age signal at all', () => {
    expect(resolveChildAgeGroup(child({ name: 'Rowan' }), NOW)).toBe('younger')
    expect(resolveChildAgeGroup(child({ name: 'Rowan', birthdate: 'not-a-date' }), NOW)).toBe('younger')
    expect(resolveChildAgeGroup(null, NOW)).toBe('younger')
  })

  it('crosses the documented threshold at 8', () => {
    expect(resolveChildAgeGroup(child({ name: 'Rowan', birthdate: '2018-09-04' }), NOW)).toBe('younger')
    expect(resolveChildAgeGroup(child({ name: 'Rowan', birthdate: '2018-09-03' }), NOW)).toBe('older')
  })
})
