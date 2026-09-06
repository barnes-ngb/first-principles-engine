import { describe, it, expect } from 'vitest'
import {
  DEFAULT_LEVEL_STRETCH,
  levelStretchHint,
  levelStretchOptions,
  levelStretchPhrase,
  normalizeLevelStretch,
  ownLevelLabel,
} from '../storyLevelStretch'

// ── normalizeLevelStretch ───────────────────────────────────────

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
    expect(normalizeLevelStretch(-999)).toBe(0)
  })

  it('rounds fractional values', () => {
    expect(normalizeLevelStretch(0.4)).toBe(0)
    expect(normalizeLevelStretch(0.6)).toBe(1)
    expect(normalizeLevelStretch(1.5)).toBe(2)
  })

  it('returns the default for non-finite numbers', () => {
    expect(normalizeLevelStretch(NaN)).toBe(DEFAULT_LEVEL_STRETCH)
    expect(normalizeLevelStretch(Infinity)).toBe(DEFAULT_LEVEL_STRETCH)
    expect(normalizeLevelStretch(-Infinity)).toBe(DEFAULT_LEVEL_STRETCH)
  })

  it('returns the default for non-number types', () => {
    expect(normalizeLevelStretch(undefined)).toBe(DEFAULT_LEVEL_STRETCH)
    expect(normalizeLevelStretch(null)).toBe(DEFAULT_LEVEL_STRETCH)
    expect(normalizeLevelStretch({})).toBe(DEFAULT_LEVEL_STRETCH)
    expect(normalizeLevelStretch([])).toBe(DEFAULT_LEVEL_STRETCH)
  })

  it('coerces boolean true to 1 via Number()', () => {
    expect(normalizeLevelStretch(true)).toBe(1)
  })

  it('coerces numeric strings', () => {
    expect(normalizeLevelStretch('1')).toBe(1)
    expect(normalizeLevelStretch('2')).toBe(2)
    expect(normalizeLevelStretch('0')).toBe(0)
  })

  it('returns the default for non-numeric strings', () => {
    expect(normalizeLevelStretch('abc')).toBe(DEFAULT_LEVEL_STRETCH)
    expect(normalizeLevelStretch('')).toBe(DEFAULT_LEVEL_STRETCH)
  })
})

// ── levelStretchPhrase ──────────────────────────────────────────

describe('levelStretchPhrase', () => {
  it('returns "one step up" for 1', () => {
    expect(levelStretchPhrase(1)).toBe('one step up')
  })

  it('returns "two steps up" for 2', () => {
    expect(levelStretchPhrase(2)).toBe('two steps up')
  })

  it('returns "two steps up" for 0 (normalizes to 0, which is not 1)', () => {
    expect(levelStretchPhrase(0)).toBe('two steps up')
  })
})

// ── ownLevelLabel ───────────────────────────────────────────────

describe('ownLevelLabel', () => {
  it('returns "Lincoln\'s level" for "Lincoln"', () => {
    expect(ownLevelLabel('Lincoln')).toBe("Lincoln's level")
  })

  it('trims the name', () => {
    expect(ownLevelLabel('  Lincoln  ')).toBe("Lincoln's level")
  })

  it('returns "Their level" for an empty name', () => {
    expect(ownLevelLabel('')).toBe('Their level')
    expect(ownLevelLabel('   ')).toBe('Their level')
  })
})

// ── levelStretchOptions ─────────────────────────────────────────

describe('levelStretchOptions', () => {
  it('returns three options in order: 0, 1, 2', () => {
    const options = levelStretchOptions('Lincoln')
    expect(options).toHaveLength(3)
    expect(options.map((o) => o.value)).toEqual([0, 1, 2])
  })

  it('the first option uses the child name', () => {
    const options = levelStretchOptions('Lincoln')
    expect(options[0].label).toBe("Lincoln's level")
  })

  it('uses "this reader" as fallback when name is empty', () => {
    const options = levelStretchOptions('')
    expect(options[0].hint).toContain('this reader')
    expect(options[1].hint).toContain('this reader')
  })

  it('every option has a non-empty hint', () => {
    for (const opt of levelStretchOptions('Lincoln')) {
      expect(opt.hint.length).toBeGreaterThan(0)
    }
  })
})

// ── levelStretchHint ────────────────────────────────────────────

describe('levelStretchHint', () => {
  it('returns the matching option hint for each valid value', () => {
    const options = levelStretchOptions('Lincoln')
    for (const opt of options) {
      expect(levelStretchHint(opt.value, 'Lincoln')).toBe(opt.hint)
    }
  })

  it('normalizes an out-of-range value before looking up', () => {
    const options = levelStretchOptions('Lincoln')
    expect(levelStretchHint(5, 'Lincoln')).toBe(options[2].hint)
  })
})
