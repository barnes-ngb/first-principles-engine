import { describe, expect, it } from 'vitest'

import {
  formatDateForCsv,
  formatDateForInput,
  formatDateYmd,
  normalizeDateString,
  parseDateYmd,
  toCsvValue,
} from './format'

describe('formatDateYmd', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(formatDateYmd(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('pads single-digit months and days', () => {
    expect(formatDateYmd(new Date(2026, 1, 7))).toBe('2026-02-07')
  })
})

describe('parseDateYmd', () => {
  it('parses a valid YYYY-MM-DD string', () => {
    const result = parseDateYmd('2026-02-07')

    expect(result).toBeInstanceOf(Date)
    expect(result!.getFullYear()).toBe(2026)
    expect(result!.getMonth()).toBe(1)
    expect(result!.getDate()).toBe(7)
  })

  it('returns null for invalid format', () => {
    expect(parseDateYmd('02-07-2026')).toBeNull()
    expect(parseDateYmd('not-a-date')).toBeNull()
    expect(parseDateYmd('')).toBeNull()
  })

  it('returns null for impossible dates', () => {
    expect(parseDateYmd('2026-02-30')).toBeNull()
    expect(parseDateYmd('2026-13-01')).toBeNull()
  })
})

describe('normalizeDateString', () => {
  it('normalizes a valid date string', () => {
    expect(normalizeDateString('2026-02-07')).toBe('2026-02-07')
  })

  it('returns the input unchanged for invalid dates', () => {
    expect(normalizeDateString('bad')).toBe('bad')
  })
})

describe('formatDateForInput', () => {
  it('accepts a Date object', () => {
    expect(formatDateForInput(new Date(2026, 1, 7))).toBe('2026-02-07')
  })

  it('accepts a string and normalizes it', () => {
    expect(formatDateForInput('2026-02-07')).toBe('2026-02-07')
  })
})

describe('formatDateForCsv', () => {
  it('formats the same as formatDateForInput', () => {
    expect(formatDateForCsv('2026-02-07')).toBe('2026-02-07')
  })
})

describe('toCsvValue', () => {
  it('returns plain strings unchanged', () => {
    expect(toCsvValue('hello')).toBe('hello')
  })

  it('returns numbers as strings', () => {
    expect(toCsvValue(42)).toBe('42')
  })

  it('returns empty string for null', () => {
    expect(toCsvValue(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(toCsvValue(undefined)).toBe('')
  })

  it('wraps values containing commas in quotes', () => {
    expect(toCsvValue('a,b')).toBe('"a,b"')
  })

  it('wraps values containing double quotes and escapes them', () => {
    expect(toCsvValue('say "hello"')).toBe('"say ""hello"""')
  })

  it('wraps values containing newlines in quotes', () => {
    expect(toCsvValue('line1\nline2')).toBe('"line1\nline2"')
  })

  it('handles combined special characters', () => {
    expect(toCsvValue('a,"b"\nc')).toBe('"a,""b""\nc"')
  })
})
