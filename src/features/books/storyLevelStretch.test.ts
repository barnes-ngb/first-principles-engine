import { describe, it, expect } from 'vitest'

import {
  normalizeLevelStretch,
  levelStretchPhrase,
  ownLevelLabel,
  levelStretchOptions,
  levelStretchHint,
  DEFAULT_LEVEL_STRETCH,
  MAX_LEVEL_STRETCH,
  LEVEL_STRETCH_VALUES,
} from './storyLevelStretch'

// ── normalizeLevelStretch ────────────────────────────────────────

describe('normalizeLevelStretch', () => {
  it('returns 0 for 0', () => {
    expect(normalizeLevelStretch(0)).toBe(0)
  })

  it('returns 1 for 1', () => {
    expect(normalizeLevelStretch(1)).toBe(1)
  })

  it('returns 2 for 2', () => {
    expect(normalizeLevelStretch(2)).toBe(2)
  })

  it('clamps values above MAX_LEVEL_STRETCH to 2', () => {
    expect(normalizeLevelStretch(5)).toBe(2)
    expect(normalizeLevelStretch(100)).toBe(2)
  })

  it('clamps negative values to 0', () => {
    expect(normalizeLevelStretch(-1)).toBe(0)
    expect(normalizeLevelStretch(-99)).toBe(0)
  })

  it('rounds fractional values', () => {
    expect(normalizeLevelStretch(0.4)).toBe(0)
    expect(normalizeLevelStretch(0.6)).toBe(1)
    expect(normalizeLevelStretch(1.7)).toBe(2)
  })

  it('returns default for NaN', () => {
    expect(normalizeLevelStretch(NaN)).toBe(DEFAULT_LEVEL_STRETCH)
  })

  it('returns default for Infinity', () => {
    expect(normalizeLevelStretch(Infinity)).toBe(DEFAULT_LEVEL_STRETCH)
  })

  it('returns default for undefined', () => {
    expect(normalizeLevelStretch(undefined)).toBe(DEFAULT_LEVEL_STRETCH)
  })

  it('returns default for null', () => {
    expect(normalizeLevelStretch(null)).toBe(DEFAULT_LEVEL_STRETCH)
  })

  it('parses numeric strings', () => {
    expect(normalizeLevelStretch('1')).toBe(1)
    expect(normalizeLevelStretch('2')).toBe(2)
  })

  it('returns default for non-numeric strings', () => {
    expect(normalizeLevelStretch('abc')).toBe(DEFAULT_LEVEL_STRETCH)
  })
})

// ── levelStretchPhrase ───────────────────────────────────────────

describe('levelStretchPhrase', () => {
  it('says "one step up" for 1', () => {
    expect(levelStretchPhrase(1)).toBe('one step up')
  })

  it('says "two steps up" for 2', () => {
    expect(levelStretchPhrase(2)).toBe('two steps up')
  })

  it('says "two steps up" for 0 (only two phrases exist)', () => {
    expect(levelStretchPhrase(0)).toBe('two steps up')
  })
})

// ── ownLevelLabel ────────────────────────────────────────────────

describe('ownLevelLabel', () => {
  it("returns the child's name possessive", () => {
    expect(ownLevelLabel('Lincoln')).toBe("Lincoln's level")
  })

  it('returns "Their level" for empty name', () => {
    expect(ownLevelLabel('')).toBe('Their level')
  })

  it('trims whitespace', () => {
    expect(ownLevelLabel('  Lincoln  ')).toBe("Lincoln's level")
  })

  it('returns "Their level" for whitespace-only name', () => {
    expect(ownLevelLabel('   ')).toBe('Their level')
  })
})

// ── levelStretchOptions ──────────────────────────────────────────

describe('levelStretchOptions', () => {
  it('returns exactly 3 options', () => {
    expect(levelStretchOptions('Lincoln')).toHaveLength(3)
  })

  it('has values 0, 1, 2 in order', () => {
    const values = levelStretchOptions('Lincoln').map((o) => o.value)
    expect(values).toEqual([0, 1, 2])
  })

  it("includes the child's name in the own-level label", () => {
    const first = levelStretchOptions('Lincoln')[0]
    expect(first.label).toContain('Lincoln')
  })

  it("includes the child's name in hints", () => {
    const opts = levelStretchOptions('London')
    expect(opts[0].hint).toContain('London')
    expect(opts[1].hint).toContain('London')
    expect(opts[2].hint).toContain('London')
  })

  it('falls back to "this reader" for empty name', () => {
    const opts = levelStretchOptions('')
    expect(opts[0].hint).toContain('this reader')
  })

  it('default option (0) is first', () => {
    expect(levelStretchOptions('Lincoln')[0].value).toBe(DEFAULT_LEVEL_STRETCH)
  })
})

// ── levelStretchHint ─────────────────────────────────────────────

describe('levelStretchHint', () => {
  it('returns a non-empty hint for each valid stretch', () => {
    for (const v of LEVEL_STRETCH_VALUES) {
      expect(levelStretchHint(v, 'Lincoln').length).toBeGreaterThan(0)
    }
  })

  it('normalizes out-of-range values', () => {
    expect(levelStretchHint(99, 'Lincoln')).toBe(levelStretchHint(MAX_LEVEL_STRETCH, 'Lincoln'))
  })
})

// ── constants ────────────────────────────────────────────────────

describe('constants', () => {
  it('DEFAULT_LEVEL_STRETCH is 0', () => {
    expect(DEFAULT_LEVEL_STRETCH).toBe(0)
  })

  it('MAX_LEVEL_STRETCH is 2', () => {
    expect(MAX_LEVEL_STRETCH).toBe(2)
  })

  it('LEVEL_STRETCH_VALUES covers 0 through MAX', () => {
    expect([...LEVEL_STRETCH_VALUES]).toEqual([0, 1, 2])
  })
})
