import { describe, expect, it } from 'vitest'

import { PlanType, PlanTypeLabel } from '../../core/types/enums'
import { DAY_TYPE_CHOICES } from './dayTypeChoices'

describe('the day-type picker offers every kind of day', () => {
  it('covers the union — a new type can never be unreachable', () => {
    expect(DAY_TYPE_CHOICES.map((c) => c.value).sort()).toEqual(
      Object.values(PlanType).sort(),
    )
  })

  it('includes the Life Day', () => {
    const life = DAY_TYPE_CHOICES.find((c) => c.value === PlanType.Life)
    expect(life).toBeDefined()
    expect(PlanTypeLabel[PlanType.Life]).toBe('Life Day')
  })
})

describe('the copy does not rank the three kinds of day', () => {
  /**
   * The charter is explicitly no-shame and all three types count as real school.
   * A description that measures one day against another — "lighter", "the bare
   * minimum", "when you can't manage the full routine" — turns a choice of shape
   * into a confession of shortfall. Asserted as an absence, on every line.
   */
  const RANKING = [
    /\bless\b/i,
    /\blighter\b/i,
    /\bminimum\b/i,
    /\bbare\b/i,
    /\bonly\b/i,
    /\bjust\b/i,
    /\bcan'?t\b/i,
    /\bfail/i,
    /\bbehind\b/i,
    /\bshould\b/i,
    /\binstead of\b/i,
    /\bfall back\b/i,
    /\bnot enough\b/i,
    /\bskip/i,
    /\bshort(er|fall)?\b/i,
    /\bbad day\b/i,
    /\bhard day\b/i,
  ]

  for (const choice of DAY_TYPE_CHOICES) {
    it(`${PlanTypeLabel[choice.value]} says what it is, not what it lacks`, () => {
      for (const pattern of RANKING) {
        expect(
          choice.description,
          `${PlanTypeLabel[choice.value]} description matches ${pattern}`,
        ).not.toMatch(pattern)
      }
    })

    it(`${PlanTypeLabel[choice.value]} does not name another kind of day`, () => {
      for (const other of Object.values(PlanType)) {
        if (other === choice.value) continue
        expect(choice.description.toLowerCase()).not.toContain(
          PlanTypeLabel[other].toLowerCase(),
        )
      }
    })

    it(`${PlanTypeLabel[choice.value]} is one readable line`, () => {
      expect(choice.description.trim()).not.toBe('')
      expect(choice.description.length).toBeLessThanOrEqual(90)
      expect(choice.description.trim().endsWith('.')).toBe(true)
    })
  }
})
