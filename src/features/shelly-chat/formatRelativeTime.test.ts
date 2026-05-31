import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { formatRelativeTime } from './formatRelativeTime'

// Anchor "now" so the relative math is deterministic regardless of CI clock/locale.
const NOW = new Date('2026-05-30T12:00:00.000Z')

function minutesAgo(mins: number): string {
  return new Date(NOW.getTime() - mins * 60_000).toISOString()
}
function hoursAgo(hrs: number): string {
  return new Date(NOW.getTime() - hrs * 3_600_000).toISOString()
}
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString()
}

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "Just now" for under a minute', () => {
    expect(formatRelativeTime(minutesAgo(0))).toBe('Just now')
    expect(formatRelativeTime(new Date(NOW.getTime() - 30_000).toISOString())).toBe('Just now')
  })

  it('returns minutes for under an hour', () => {
    expect(formatRelativeTime(minutesAgo(1))).toBe('1m ago')
    expect(formatRelativeTime(minutesAgo(59))).toBe('59m ago')
  })

  it('returns hours for under a day', () => {
    expect(formatRelativeTime(hoursAgo(1))).toBe('1h ago')
    expect(formatRelativeTime(hoursAgo(23))).toBe('23h ago')
  })

  it('returns "Yesterday" for exactly one day', () => {
    expect(formatRelativeTime(daysAgo(1))).toBe('Yesterday')
  })

  it('returns a weekday name for 2-6 days ago (not an "Nd ago" string)', () => {
    const result = formatRelativeTime(daysAgo(3))
    // Branch check: it must take the weekday branch, not minutes/hours/yesterday.
    expect(result).not.toMatch(/ago$/)
    expect(result).not.toBe('Yesterday')
    expect(result).toBe(new Date(daysAgo(3)).toLocaleDateString([], { weekday: 'long' }))
  })

  it('returns a month/day label for a week or more ago', () => {
    const result = formatRelativeTime(daysAgo(10))
    expect(result).toBe(new Date(daysAgo(10)).toLocaleDateString([], { month: 'short', day: 'numeric' }))
    expect(result).not.toMatch(/ago$/)
  })
})
