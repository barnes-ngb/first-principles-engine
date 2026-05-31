import { describe, it, expect } from 'vitest'
import type { Child } from '../../core/types/family'
import { findYoungerSibling } from './teachBackRecipient'

const child = (props: Partial<Child> & { id: string; name: string }): Child =>
  props as Child

describe('findYoungerSibling', () => {
  it('returns the younger sibling for a child who has one (Lincoln → London)', () => {
    // Lincoln/London carry no explicit birthdate here, so derivation falls back
    // to the canonical name-keyed defaults (Lincoln older than London).
    const lincoln = child({ id: 'lincoln', name: 'Lincoln' })
    const london = child({ id: 'london', name: 'London' })

    const result = findYoungerSibling(lincoln, [lincoln, london])

    expect(result).not.toBeNull()
    expect(result?.name).toBe('London')
  })

  it('returns null for the youngest child (London has no one to teach)', () => {
    const lincoln = child({ id: 'lincoln', name: 'Lincoln' })
    const london = child({ id: 'london', name: 'London' })

    expect(findYoungerSibling(london, [lincoln, london])).toBeNull()
  })

  it('derives the recipient from birthdate, not from any hardcoded name', () => {
    // Arbitrary names prove the label is relationship-derived: the older child
    // (earlier birthdate) teaches the younger one regardless of what they're called.
    const older = child({ id: 'a', name: 'Robin', birthdate: '2012-03-15' })
    const younger = child({ id: 'b', name: 'Sky', birthdate: '2018-07-20' })

    expect(findYoungerSibling(older, [older, younger])?.name).toBe('Sky')
    expect(findYoungerSibling(younger, [older, younger])).toBeNull()
  })

  it('falls back to grade order when birthdates are unavailable', () => {
    const older = child({ id: 'x', name: 'Quinn', grade: '3' })
    const younger = child({ id: 'y', name: 'Wren', grade: 'K' })

    expect(findYoungerSibling(older, [older, younger])?.name).toBe('Wren')
    expect(findYoungerSibling(younger, [older, younger])).toBeNull()
  })

  it('picks the closest (oldest) younger sibling when several are younger', () => {
    const eldest = child({ id: '1', name: 'Eldest', birthdate: '2010-01-01' })
    const middle = child({ id: '2', name: 'Middle', birthdate: '2014-01-01' })
    const baby = child({ id: '3', name: 'Baby', birthdate: '2020-01-01' })

    expect(
      findYoungerSibling(eldest, [eldest, middle, baby])?.name,
    ).toBe('Middle')
  })

  it('returns null when there are no siblings', () => {
    const only = child({ id: 'only', name: 'Solo', birthdate: '2015-01-01' })
    expect(findYoungerSibling(only, [only])).toBeNull()
  })
})
