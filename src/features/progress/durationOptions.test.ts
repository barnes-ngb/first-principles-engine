import { describe, expect, it } from 'vitest'

import { CURRICULUM_DURATION_OPTIONS, durationOptionsWithValue } from './durationOptions'

describe('CURRICULUM_DURATION_OPTIONS — the canonical minute set (UX-267)', () => {
  it('is sorted ascending', () => {
    for (let i = 1; i < CURRICULUM_DURATION_OPTIONS.length; i++) {
      expect(CURRICULUM_DURATION_OPTIONS[i]).toBeGreaterThan(CURRICULUM_DURATION_OPTIONS[i - 1])
    }
  })

  it('includes the legacy 10 and 20 minute values', () => {
    expect(CURRICULUM_DURATION_OPTIONS).toContain(10)
    expect(CURRICULUM_DURATION_OPTIONS).toContain(20)
  })

  it('includes the 15-minute-stepped values up to 45', () => {
    expect(CURRICULUM_DURATION_OPTIONS).toContain(15)
    expect(CURRICULUM_DURATION_OPTIONS).toContain(30)
    expect(CURRICULUM_DURATION_OPTIONS).toContain(45)
  })

  it('includes 60 and 90 as round breakpoints', () => {
    expect(CURRICULUM_DURATION_OPTIONS).toContain(60)
    expect(CURRICULUM_DURATION_OPTIONS).toContain(90)
  })

  it('deliberately omits 75', () => {
    expect(CURRICULUM_DURATION_OPTIONS).not.toContain(75)
  })
})

describe('durationOptionsWithValue — merges a current value into the canonical set', () => {
  it('returns the canonical set when value is already in it', () => {
    expect(durationOptionsWithValue(30)).toEqual([...CURRICULUM_DURATION_OPTIONS])
  })

  it('inserts a non-standard value in sorted position', () => {
    const result = durationOptionsWithValue(37)
    expect(result).toContain(37)
    const idx37 = result.indexOf(37)
    expect(result[idx37 - 1]).toBeLessThan(37)
    expect(result[idx37 + 1]).toBeGreaterThan(37)
  })

  it('inserts a value below the minimum', () => {
    const result = durationOptionsWithValue(5)
    expect(result[0]).toBe(5)
  })

  it('inserts a value above the maximum', () => {
    const result = durationOptionsWithValue(120)
    expect(result[result.length - 1]).toBe(120)
  })

  it('does not duplicate an existing canonical value', () => {
    const result = durationOptionsWithValue(10)
    expect(result.filter((v) => v === 10)).toHaveLength(1)
  })
})
