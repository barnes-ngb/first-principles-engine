import { describe, expect, it } from 'vitest'
import type { DailyEnergyEntry } from './energyPatterns'
import {
  analyzeEnergyPatterns,
  analyzeDayOfWeekPatterns,
  detectStreaks,
  detectTrend,
  formatEnergyPatternsForPrompt,
  EnergyTrend,
} from './energyPatterns'

// ── Helpers ───────────────────────────────────────────────────

/** Build a date string for a given Monday offset + day-of-week offset. */
function makeDate(weekOffset: number, dayOffset: number): string {
  // Base Monday: 2026-01-05
  const base = new Date(2026, 0, 5)
  base.setDate(base.getDate() + weekOffset * 7 + dayOffset)
  const y = base.getFullYear()
  const m = String(base.getMonth() + 1).padStart(2, '0')
  const d = String(base.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function entry(date: string, energy: DailyEnergyEntry['energy']): DailyEnergyEntry {
  return { date, energy }
}

// ── analyzeDayOfWeekPatterns ──────────────────────────────────

describe('analyzeDayOfWeekPatterns', () => {
  it('returns 7 day buckets even with no data', () => {
    const result = analyzeDayOfWeekPatterns([])
    expect(result).toHaveLength(7)
    expect(result.every((d) => d.totalCount === 0)).toBe(true)
  })

  it('counts low-energy days by day-of-week', () => {
    // 2026-01-05 is a Monday, 2026-01-12 is a Monday
    const entries: DailyEnergyEntry[] = [
      entry('2026-01-05', 'low'),       // Monday
      entry('2026-01-06', 'normal'),     // Tuesday
      entry('2026-01-07', 'normal'),     // Wednesday
      entry('2026-01-12', 'low'),        // Monday
      entry('2026-01-13', 'normal'),     // Tuesday
      entry('2026-01-14', 'overwhelmed'),// Wednesday
    ]
    const result = analyzeDayOfWeekPatterns(entries)

    // Monday (index 1): 2 low / 2 total = 1.0
    expect(result[1].lowCount).toBe(2)
    expect(result[1].totalCount).toBe(2)
    expect(result[1].lowRate).toBe(1.0)

    // Tuesday (index 2): 0 low / 2 total = 0
    expect(result[2].lowCount).toBe(0)
    expect(result[2].totalCount).toBe(2)
    expect(result[2].lowRate).toBe(0)

    // Wednesday (index 3): 1 low / 2 total = 0.5 (overwhelmed counts as low)
    expect(result[3].lowCount).toBe(1)
    expect(result[3].totalCount).toBe(2)
    expect(result[3].lowRate).toBe(0.5)
  })

  it('treats overwhelmed as low-energy', () => {
    const entries: DailyEnergyEntry[] = [
      entry('2026-01-05', 'overwhelmed'), // Monday
      entry('2026-01-12', 'overwhelmed'), // Monday
    ]
    const result = analyzeDayOfWeekPatterns(entries)
    expect(result[1].lowCount).toBe(2)
    expect(result[1].lowRate).toBe(1.0)
  })
})

// ── detectStreaks ──────────────────────────────────────────────

describe('detectStreaks', () => {
  it('returns empty array when no streaks exist', () => {
    const entries: DailyEnergyEntry[] = [
      entry('2026-01-05', 'low'),
      entry('2026-01-07', 'low'),   // gap — not consecutive
    ]
    expect(detectStreaks(entries)).toEqual([])
  })

  it('detects a 2-day streak', () => {
    const entries: DailyEnergyEntry[] = [
      entry('2026-01-05', 'low'),
      entry('2026-01-06', 'low'),
    ]
    const streaks = detectStreaks(entries)
    expect(streaks).toHaveLength(1)
    expect(streaks[0]).toEqual({
      startDate: '2026-01-05',
      endDate: '2026-01-06',
      length: 2,
    })
  })

  it('detects a 4-day streak mixing low and overwhelmed', () => {
    const entries: DailyEnergyEntry[] = [
      entry('2026-01-05', 'low'),
      entry('2026-01-06', 'overwhelmed'),
      entry('2026-01-07', 'low'),
      entry('2026-01-08', 'low'),
    ]
    const streaks = detectStreaks(entries)
    expect(streaks).toHaveLength(1)
    expect(streaks[0].length).toBe(4)
  })

  it('detects multiple separate streaks', () => {
    const entries: DailyEnergyEntry[] = [
      entry('2026-01-05', 'low'),
      entry('2026-01-06', 'low'),
      entry('2026-01-07', 'normal'),  // break
      entry('2026-01-08', 'low'),
      entry('2026-01-09', 'low'),
      entry('2026-01-10', 'low'),
    ]
    const streaks = detectStreaks(entries)
    expect(streaks).toHaveLength(2)
    expect(streaks[0].length).toBe(2)
    expect(streaks[1].length).toBe(3)
  })

  it('handles unsorted input', () => {
    const entries: DailyEnergyEntry[] = [
      entry('2026-01-07', 'low'),
      entry('2026-01-05', 'low'),
      entry('2026-01-06', 'low'),
    ]
    const streaks = detectStreaks(entries)
    expect(streaks).toHaveLength(1)
    expect(streaks[0].length).toBe(3)
  })

  it('does not count a single low day as a streak', () => {
    const entries: DailyEnergyEntry[] = [
      entry('2026-01-05', 'normal'),
      entry('2026-01-06', 'low'),
      entry('2026-01-07', 'normal'),
    ]
    expect(detectStreaks(entries)).toEqual([])
  })
})

// ── detectTrend ───────────────────────────────────────────────

describe('detectTrend', () => {
  it('returns stable with fewer than 4 entries', () => {
    const entries: DailyEnergyEntry[] = [
      entry('2026-01-05', 'low'),
      entry('2026-01-06', 'low'),
      entry('2026-01-07', 'low'),
    ]
    expect(detectTrend(entries)).toBe(EnergyTrend.Stable)
  })

  it('detects declining trend', () => {
    // First half: all normal. Second half: all low.
    const entries: DailyEnergyEntry[] = [
      entry('2026-01-05', 'normal'),
      entry('2026-01-06', 'normal'),
      entry('2026-01-07', 'normal'),
      entry('2026-01-08', 'normal'),
      entry('2026-01-09', 'low'),
      entry('2026-01-10', 'low'),
      entry('2026-01-11', 'low'),
      entry('2026-01-12', 'low'),
    ]
    expect(detectTrend(entries)).toBe(EnergyTrend.Declining)
  })

  it('detects improving trend', () => {
    // First half: all low. Second half: all normal.
    const entries: DailyEnergyEntry[] = [
      entry('2026-01-05', 'low'),
      entry('2026-01-06', 'low'),
      entry('2026-01-07', 'low'),
      entry('2026-01-08', 'low'),
      entry('2026-01-09', 'normal'),
      entry('2026-01-10', 'normal'),
      entry('2026-01-11', 'normal'),
      entry('2026-01-12', 'normal'),
    ]
    expect(detectTrend(entries)).toBe(EnergyTrend.Improving)
  })

  it('returns stable when halves are similar', () => {
    const entries: DailyEnergyEntry[] = [
      entry('2026-01-05', 'low'),
      entry('2026-01-06', 'normal'),
      entry('2026-01-07', 'low'),
      entry('2026-01-08', 'normal'),
      entry('2026-01-09', 'low'),
      entry('2026-01-10', 'normal'),
      entry('2026-01-11', 'low'),
      entry('2026-01-12', 'normal'),
    ]
    expect(detectTrend(entries)).toBe(EnergyTrend.Stable)
  })
})

// ── analyzeEnergyPatterns (integration) ───────────────────────

describe('analyzeEnergyPatterns', () => {
  it('returns no-data result for empty input', () => {
    const result = analyzeEnergyPatterns([])
    expect(result.suggestedMvdDays).toEqual([])
    expect(result.streaks).toEqual([])
    expect(result.trend).toBe(EnergyTrend.Stable)
    expect(result.summary).toBe('No energy data available.')
  })

  it('suggests MVD days when a day-of-week is consistently low', () => {
    // 6 weeks of data: every Friday is low
    const entries: DailyEnergyEntry[] = []
    for (let week = 0; week < 6; week++) {
      // Monday–Thursday normal
      for (let d = 0; d < 4; d++) {
        entries.push(entry(makeDate(week, d), 'normal'))
      }
      // Friday low
      entries.push(entry(makeDate(week, 4), 'low'))
    }

    const result = analyzeEnergyPatterns(entries)
    expect(result.suggestedMvdDays).toContain('Friday')
    expect(result.suggestedMvdDays).not.toContain('Monday')
    expect(result.summary).toContain('Standing MVD days suggested')
    expect(result.summary).toContain('Friday')
  })

  it('does not suggest MVD for a day with only 1 entry', () => {
    const entries: DailyEnergyEntry[] = [
      entry('2026-01-09', 'low'), // Friday — only one data point
    ]
    const result = analyzeEnergyPatterns(entries)
    expect(result.suggestedMvdDays).toEqual([])
  })

  it('detects streaks and declining trend together', () => {
    const entries: DailyEnergyEntry[] = [
      // Week 1: all normal
      entry('2026-01-05', 'normal'),
      entry('2026-01-06', 'normal'),
      entry('2026-01-07', 'normal'),
      entry('2026-01-08', 'normal'),
      entry('2026-01-09', 'normal'),
      // Week 2: all low (streak + declining)
      entry('2026-01-12', 'low'),
      entry('2026-01-13', 'low'),
      entry('2026-01-14', 'low'),
      entry('2026-01-15', 'low'),
      entry('2026-01-16', 'low'),
    ]

    const result = analyzeEnergyPatterns(entries)
    expect(result.streaks.length).toBeGreaterThan(0)
    expect(result.trend).toBe(EnergyTrend.Declining)
    expect(result.summary).toContain('trending down')
    expect(result.summary).toContain('streak')
  })

  it('reports no pattern for stable, balanced data', () => {
    // 4 weeks, all normal
    const entries: DailyEnergyEntry[] = []
    for (let week = 0; week < 4; week++) {
      for (let d = 0; d < 5; d++) {
        entries.push(entry(makeDate(week, d), 'normal'))
      }
    }

    const result = analyzeEnergyPatterns(entries)
    expect(result.suggestedMvdDays).toEqual([])
    expect(result.streaks).toEqual([])
    expect(result.trend).toBe(EnergyTrend.Stable)
    expect(result.summary).toContain('No energy pattern detected')
  })
})

// ── formatEnergyPatternsForPrompt ─────────────────────────────

describe('formatEnergyPatternsForPrompt', () => {
  it('formats empty result', () => {
    const result = analyzeEnergyPatterns([])
    const text = formatEnergyPatternsForPrompt(result)
    expect(text).toContain('## Energy Patterns')
    expect(text).toContain('No energy pattern data available')
  })

  it('includes MVD day suggestions in prompt', () => {
    const entries: DailyEnergyEntry[] = []
    for (let week = 0; week < 6; week++) {
      for (let d = 0; d < 4; d++) {
        entries.push(entry(makeDate(week, d), 'normal'))
      }
      entries.push(entry(makeDate(week, 4), 'low'))
    }

    const result = analyzeEnergyPatterns(entries)
    const text = formatEnergyPatternsForPrompt(result)
    expect(text).toContain('Suggested standing MVD days: Friday')
    expect(text).toContain('Minimum Viable Day')
  })

  it('includes declining trend warning in prompt', () => {
    const entries: DailyEnergyEntry[] = [
      entry('2026-01-05', 'normal'),
      entry('2026-01-06', 'normal'),
      entry('2026-01-07', 'normal'),
      entry('2026-01-08', 'normal'),
      entry('2026-01-09', 'low'),
      entry('2026-01-10', 'low'),
      entry('2026-01-11', 'low'),
      entry('2026-01-12', 'low'),
    ]

    const result = analyzeEnergyPatterns(entries)
    const text = formatEnergyPatternsForPrompt(result)
    expect(text).toContain('Energy trend is declining')
    expect(text).toContain('load reduction')
  })

  it('does not include declining section for stable trend', () => {
    const entries: DailyEnergyEntry[] = []
    for (let week = 0; week < 4; week++) {
      for (let d = 0; d < 5; d++) {
        entries.push(entry(makeDate(week, d), 'normal'))
      }
    }
    const result = analyzeEnergyPatterns(entries)
    const text = formatEnergyPatternsForPrompt(result)
    expect(text).not.toContain('declining')
  })
})
