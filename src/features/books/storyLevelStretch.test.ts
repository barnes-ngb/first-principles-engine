import { describe, it, expect } from 'vitest'

import {
  normalizeLevelStretch,
  levelStretchPhrase,
  ownLevelLabel,
  levelStretchOptions,
  levelStretchHint,
  LEVEL_STRETCH_VALUES,
  DEFAULT_LEVEL_STRETCH,
  MAX_LEVEL_STRETCH,
  LEVEL_STRETCH_CAPTION,
  LEVEL_STRETCH_FOOTNOTE,
} from './storyLevelStretch'

describe('normalizeLevelStretch', () => {
  it('returns 0, 1, or 2 for valid values', () => {
    expect(normalizeLevelStretch(0)).toBe(0)
    expect(normalizeLevelStretch(1)).toBe(1)
    expect(normalizeLevelStretch(2)).toBe(2)
  })

  it('clamps values above MAX_LEVEL_STRETCH to 2', () => {
    expect(normalizeLevelStretch(3)).toBe(2)
    expect(normalizeLevelStretch(7)).toBe(2)
    expect(normalizeLevelStretch(100)).toBe(2)
  })

  it('clamps negative values to 0', () => {
    expect(normalizeLevelStretch(-1)).toBe(0)
    expect(normalizeLevelStretch(-100)).toBe(0)
  })

  it('rounds fractional values', () => {
    expect(normalizeLevelStretch(0.4)).toBe(0)
    expect(normalizeLevelStretch(0.6)).toBe(1)
    expect(normalizeLevelStretch(1.5)).toBe(2)
    expect(normalizeLevelStretch(1.4)).toBe(1)
  })

  it('returns default for non-finite numbers', () => {
    expect(normalizeLevelStretch(NaN)).toBe(DEFAULT_LEVEL_STRETCH)
    expect(normalizeLevelStretch(Infinity)).toBe(DEFAULT_LEVEL_STRETCH)
    expect(normalizeLevelStretch(-Infinity)).toBe(DEFAULT_LEVEL_STRETCH)
  })

  it('coerces string numbers', () => {
    expect(normalizeLevelStretch('1')).toBe(1)
    expect(normalizeLevelStretch('2')).toBe(2)
    expect(normalizeLevelStretch('0')).toBe(0)
  })

  it('returns default for non-numeric strings', () => {
    expect(normalizeLevelStretch('abc')).toBe(DEFAULT_LEVEL_STRETCH)
    expect(normalizeLevelStretch('')).toBe(DEFAULT_LEVEL_STRETCH)
  })

  it('returns default for undefined and null', () => {
    expect(normalizeLevelStretch(undefined)).toBe(DEFAULT_LEVEL_STRETCH)
    expect(normalizeLevelStretch(null)).toBe(DEFAULT_LEVEL_STRETCH)
  })
})

describe('levelStretchPhrase', () => {
  it('returns "one step up" for stretch 1', () => {
    expect(levelStretchPhrase(1)).toBe('one step up')
  })

  it('returns "two steps up" for stretch 2', () => {
    expect(levelStretchPhrase(2)).toBe('two steps up')
  })

  it('returns "two steps up" for stretch 0 (normalized to 0, not 1)', () => {
    expect(levelStretchPhrase(0)).toBe('two steps up')
  })
})

describe('ownLevelLabel', () => {
  it('returns "Lincoln\'s level" for a named child', () => {
    expect(ownLevelLabel('Lincoln')).toBe("Lincoln's level")
  })

  it('trims whitespace', () => {
    expect(ownLevelLabel('  Lincoln  ')).toBe("Lincoln's level")
  })

  it('returns "Their level" for an empty name', () => {
    expect(ownLevelLabel('')).toBe('Their level')
  })

  it('returns "Their level" for whitespace-only name', () => {
    expect(ownLevelLabel('   ')).toBe('Their level')
  })
})

describe('levelStretchOptions', () => {
  it('returns three options in order: 0, 1, 2', () => {
    const options = levelStretchOptions('Lincoln')
    expect(options).toHaveLength(3)
    expect(options[0].value).toBe(0)
    expect(options[1].value).toBe(1)
    expect(options[2].value).toBe(2)
  })

  it('first option uses ownLevelLabel', () => {
    const options = levelStretchOptions('Lincoln')
    expect(options[0].label).toBe("Lincoln's level")
  })

  it('hints mention the child name', () => {
    const options = levelStretchOptions('London')
    expect(options[0].hint).toContain('London')
    expect(options[1].hint).toContain('London')
    expect(options[2].hint).toContain('London')
  })

  it('uses "this reader" for empty name', () => {
    const options = levelStretchOptions('')
    expect(options[1].hint).toContain('this reader')
  })
})

describe('levelStretchHint', () => {
  it('returns the matching option hint for a valid stretch', () => {
    const hint = levelStretchHint(1, 'Lincoln')
    expect(hint).toContain('One rung above')
    expect(hint).toContain('Lincoln')
  })

  it('normalizes invalid stretch values', () => {
    const hint = levelStretchHint(5, 'Lincoln')
    expect(hint).toContain('Two rungs above')
  })

  it('never returns empty string for any valid value', () => {
    for (const v of LEVEL_STRETCH_VALUES) {
      expect(levelStretchHint(v, 'Lincoln')).not.toBe('')
    }
  })
})

describe('constants', () => {
  it('LEVEL_STRETCH_VALUES has exactly 0, 1, 2', () => {
    expect([...LEVEL_STRETCH_VALUES]).toEqual([0, 1, 2])
  })

  it('DEFAULT_LEVEL_STRETCH is 0', () => {
    expect(DEFAULT_LEVEL_STRETCH).toBe(0)
  })

  it('MAX_LEVEL_STRETCH is 2', () => {
    expect(MAX_LEVEL_STRETCH).toBe(2)
  })

  it('LEVEL_STRETCH_CAPTION is non-empty', () => {
    expect(LEVEL_STRETCH_CAPTION.length).toBeGreaterThan(0)
  })

  it('LEVEL_STRETCH_FOOTNOTE mentions Skill Snapshot', () => {
    expect(LEVEL_STRETCH_FOOTNOTE).toContain('Skill Snapshot')
  })
})
