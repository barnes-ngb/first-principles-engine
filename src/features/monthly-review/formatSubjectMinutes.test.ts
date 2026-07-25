import { describe, it, expect } from 'vitest'
import { formatSubjectMinutes } from './formatSubjectMinutes'

describe('formatSubjectMinutes', () => {
  it('formats sub-60 values as minutes', () => {
    expect(formatSubjectMinutes(30)).toBe('30m')
    expect(formatSubjectMinutes(45)).toBe('45m')
    expect(formatSubjectMinutes(1)).toBe('1m')
    expect(formatSubjectMinutes(59)).toBe('59m')
  })

  it('rounds sub-60 values to nearest integer', () => {
    expect(formatSubjectMinutes(30.4)).toBe('30m')
    expect(formatSubjectMinutes(30.5)).toBe('31m')
    expect(formatSubjectMinutes(0.7)).toBe('1m')
  })

  it('formats exact hours without decimal', () => {
    expect(formatSubjectMinutes(60)).toBe('1h')
    expect(formatSubjectMinutes(120)).toBe('2h')
    expect(formatSubjectMinutes(300)).toBe('5h')
  })

  it('formats fractional hours with one decimal place', () => {
    expect(formatSubjectMinutes(90)).toBe('1.5h')
    expect(formatSubjectMinutes(150)).toBe('2.5h')
    expect(formatSubjectMinutes(75)).toBe('1.3h')
  })

  it('handles zero', () => {
    expect(formatSubjectMinutes(0)).toBe('0m')
  })
})
