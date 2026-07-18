import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TARGET_PAGE_COUNT,
  STORY_LENGTH_OPTIONS,
  MIN_TARGET_PAGE_COUNT,
  MAX_TARGET_PAGE_COUNT,
  clampTargetPageCount,
} from './storyPageTargets'

describe('storyPageTargets', () => {
  it('defaults to the priced product size (10)', () => {
    expect(DEFAULT_TARGET_PAGE_COUNT).toBe(10)
  })

  it('offers Short / Normal / Long with concrete page numbers', () => {
    expect(STORY_LENGTH_OPTIONS.map((o) => o.label)).toEqual([
      'Short',
      'Normal',
      'Long',
    ])
    expect(STORY_LENGTH_OPTIONS.map((o) => o.pages)).toEqual([6, 10, 14])
  })

  it('exposes the option range as min/max', () => {
    expect(MIN_TARGET_PAGE_COUNT).toBe(6)
    expect(MAX_TARGET_PAGE_COUNT).toBe(14)
  })

  it('keeps the default within the selectable options', () => {
    expect(STORY_LENGTH_OPTIONS.some((o) => o.pages === DEFAULT_TARGET_PAGE_COUNT)).toBe(
      true,
    )
  })
})

describe('clampTargetPageCount', () => {
  it('falls back to the default for a missing value (existing generations still work)', () => {
    expect(clampTargetPageCount(undefined)).toBe(DEFAULT_TARGET_PAGE_COUNT)
    expect(clampTargetPageCount(null)).toBe(DEFAULT_TARGET_PAGE_COUNT)
    expect(clampTargetPageCount(Number.NaN)).toBe(DEFAULT_TARGET_PAGE_COUNT)
  })

  it('passes an in-range target through (rounded)', () => {
    expect(clampTargetPageCount(6)).toBe(6)
    expect(clampTargetPageCount(10)).toBe(10)
    expect(clampTargetPageCount(11.4)).toBe(11)
  })

  it('clamps out-of-range values into the supported range', () => {
    expect(clampTargetPageCount(2)).toBe(MIN_TARGET_PAGE_COUNT)
    expect(clampTargetPageCount(99)).toBe(MAX_TARGET_PAGE_COUNT)
  })
})
