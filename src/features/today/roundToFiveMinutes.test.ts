import { describe, expect, it } from 'vitest'

import { roundToFiveMinutes } from './useTodayMiningMinutes'

describe('roundToFiveMinutes', () => {
  it('returns 0 for 0 minutes', () => {
    expect(roundToFiveMinutes(0)).toBe(0)
  })

  it('returns 0 for negative minutes', () => {
    expect(roundToFiveMinutes(-5)).toBe(0)
    expect(roundToFiveMinutes(-100)).toBe(0)
  })

  it('rounds up tiny values to minimum of 5', () => {
    expect(roundToFiveMinutes(1)).toBe(5)
    expect(roundToFiveMinutes(2)).toBe(5)
  })

  it('rounds 3 to 5 (nearest 5 is 5, and min is 5)', () => {
    expect(roundToFiveMinutes(3)).toBe(5)
  })

  it('returns 5 for exactly 5', () => {
    expect(roundToFiveMinutes(5)).toBe(5)
  })

  it('rounds 7 to 5 (nearest 5)', () => {
    expect(roundToFiveMinutes(7)).toBe(5)
  })

  it('rounds 8 to 10 (nearest 5)', () => {
    expect(roundToFiveMinutes(8)).toBe(10)
  })

  it('returns 10 for exactly 10', () => {
    expect(roundToFiveMinutes(10)).toBe(10)
  })

  it('rounds 12 to 10', () => {
    expect(roundToFiveMinutes(12)).toBe(10)
  })

  it('rounds 13 to 15', () => {
    expect(roundToFiveMinutes(13)).toBe(15)
  })

  it('handles exact multiples of 5 unchanged', () => {
    expect(roundToFiveMinutes(15)).toBe(15)
    expect(roundToFiveMinutes(20)).toBe(20)
    expect(roundToFiveMinutes(45)).toBe(45)
    expect(roundToFiveMinutes(60)).toBe(60)
  })

  it('rounds 2.5 (midpoint) to 5 via Math.round', () => {
    expect(roundToFiveMinutes(2.5)).toBe(5)
  })

  it('rounds large values correctly', () => {
    expect(roundToFiveMinutes(97)).toBe(95)
    expect(roundToFiveMinutes(98)).toBe(100)
    expect(roundToFiveMinutes(123)).toBe(125)
  })
})
