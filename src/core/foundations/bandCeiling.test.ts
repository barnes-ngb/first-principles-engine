import { describe, it, expect } from 'vitest'

import { makeBandCeilingLessonToUnit } from './bandCeiling'

describe('makeBandCeilingLessonToUnit', () => {
  const ceilings = [50, 100, 150, 200]
  const lessonToUnit = makeBandCeilingLessonToUnit(ceilings)

  it('maps a lesson to the ceiling of the band it falls into', () => {
    expect(lessonToUnit(1)).toBe(50)
    expect(lessonToUnit(25)).toBe(50)
    expect(lessonToUnit(50)).toBe(50)
  })

  it('maps a lesson at a band boundary to that ceiling', () => {
    expect(lessonToUnit(50)).toBe(50)
    expect(lessonToUnit(100)).toBe(100)
    expect(lessonToUnit(150)).toBe(150)
    expect(lessonToUnit(200)).toBe(200)
  })

  it('maps a lesson just past a boundary to the next ceiling', () => {
    expect(lessonToUnit(51)).toBe(100)
    expect(lessonToUnit(101)).toBe(150)
    expect(lessonToUnit(151)).toBe(200)
  })

  it('clamps lessons past the last band to the final ceiling', () => {
    expect(lessonToUnit(201)).toBe(200)
    expect(lessonToUnit(999)).toBe(200)
  })

  it('returns null for lesson 0 (not-started sentinel)', () => {
    expect(lessonToUnit(0)).toBeNull()
  })

  it('returns null for negative lessons', () => {
    expect(lessonToUnit(-1)).toBeNull()
    expect(lessonToUnit(-100)).toBeNull()
  })

  it('returns null for NaN', () => {
    expect(lessonToUnit(NaN)).toBeNull()
  })

  it('returns null for Infinity', () => {
    expect(lessonToUnit(Infinity)).toBeNull()
    expect(lessonToUnit(-Infinity)).toBeNull()
  })

  it('returns null for empty ceilings array', () => {
    const emptyFn = makeBandCeilingLessonToUnit([])
    expect(emptyFn(1)).toBeNull()
    expect(emptyFn(0)).toBeNull()
  })

  it('works with a single-band ceiling', () => {
    const singleFn = makeBandCeilingLessonToUnit([30])
    expect(singleFn(1)).toBe(30)
    expect(singleFn(30)).toBe(30)
    expect(singleFn(31)).toBe(30)
  })

  it('handles fractional lessons (rounds up within band)', () => {
    expect(lessonToUnit(49.5)).toBe(50)
    expect(lessonToUnit(50.5)).toBe(100)
  })
})
