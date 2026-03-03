/**
 * Energy Pattern Detection (T-303)
 *
 * Analyzes 4–8 weeks of daily energy data to detect:
 * - Which days of the week tend to be low-energy
 * - Multi-day low-energy streaks
 * - Overall energy trend (declining / stable / improving)
 *
 * Output: suggested standing MVD days, load reduction advice,
 *         or "no pattern detected" — formatted for AI prompt injection.
 */

import type { EnergyLevel } from '../types/enums'

// ── Input / Output Types ──────────────────────────────────────

/** A single day's energy record. */
export interface DailyEnergyEntry {
  /** YYYY-MM-DD */
  date: string
  energy: EnergyLevel
}

/** A streak of consecutive low-energy or overwhelmed days. */
export interface EnergyStreak {
  startDate: string
  endDate: string
  length: number
}

export interface DayOfWeekPattern {
  /** 0 = Sunday … 6 = Saturday */
  dayIndex: number
  dayName: string
  lowCount: number
  totalCount: number
  lowRate: number
}

export const EnergyTrend = {
  Declining: 'declining',
  Stable: 'stable',
  Improving: 'improving',
} as const
export type EnergyTrend = (typeof EnergyTrend)[keyof typeof EnergyTrend]

export interface EnergyPatternResult {
  /** Days of the week that cross the low-energy threshold. */
  suggestedMvdDays: string[]
  /** Multi-day low-energy streaks (length >= 2). */
  streaks: EnergyStreak[]
  /** Overall energy trend over the analysis window. */
  trend: EnergyTrend
  /** Per-day-of-week breakdown. */
  dayBreakdown: DayOfWeekPattern[]
  /** Human-readable summary suitable for AI prompt injection. */
  summary: string
}

// ── Constants ─────────────────────────────────────────────────

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** A day is considered "low" if energy is 'low' or 'overwhelmed'. */
const isLowEnergy = (energy: EnergyLevel): boolean =>
  energy === 'low' || energy === 'overwhelmed'

/**
 * Threshold: if ≥ 50 % of entries for a day-of-week are low,
 * that day is flagged as a standing MVD candidate.
 */
const LOW_RATE_THRESHOLD = 0.5

/** Minimum entries for a day-of-week before we flag it. */
const MIN_ENTRIES_PER_DAY = 2

// ── Core Analysis ─────────────────────────────────────────────

/**
 * Detect per-day-of-week low-energy patterns.
 * Returns an array of DayOfWeekPattern sorted by dayIndex.
 */
export function analyzeDayOfWeekPatterns(entries: DailyEnergyEntry[]): DayOfWeekPattern[] {
  const buckets: { low: number; total: number }[] = Array.from({ length: 7 }, () => ({
    low: 0,
    total: 0,
  }))

  for (const entry of entries) {
    const d = parseDateToLocal(entry.date)
    if (!d) continue
    const dow = d.getDay()
    buckets[dow].total++
    if (isLowEnergy(entry.energy)) {
      buckets[dow].low++
    }
  }

  return buckets.map((b, i) => ({
    dayIndex: i,
    dayName: DAY_NAMES[i],
    lowCount: b.low,
    totalCount: b.total,
    lowRate: b.total > 0 ? b.low / b.total : 0,
  }))
}

/**
 * Find consecutive runs of low-energy days (length >= 2).
 * Entries must be sorted by date ascending before calling.
 */
export function detectStreaks(entries: DailyEnergyEntry[]): EnergyStreak[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  const streaks: EnergyStreak[] = []

  let streakStart: string | null = null
  let prevDate: string | null = null
  let streakLen = 0

  for (const entry of sorted) {
    const isLow = isLowEnergy(entry.energy)
    const isConsecutive = prevDate !== null && isNextDay(prevDate, entry.date)

    if (isLow && (streakLen === 0 || isConsecutive)) {
      if (streakLen === 0) streakStart = entry.date
      streakLen++
    } else {
      if (streakLen >= 2 && streakStart) {
        streaks.push({ startDate: streakStart, endDate: prevDate!, length: streakLen })
      }
      streakLen = isLow ? 1 : 0
      streakStart = isLow ? entry.date : null
    }
    prevDate = entry.date
  }

  // Close trailing streak
  if (streakLen >= 2 && streakStart && prevDate) {
    streaks.push({ startDate: streakStart, endDate: prevDate, length: streakLen })
  }

  return streaks
}

/**
 * Determine overall energy trend by comparing the low-energy rate
 * of the first half vs the second half of the analysis window.
 */
export function detectTrend(entries: DailyEnergyEntry[]): EnergyTrend {
  if (entries.length < 4) return EnergyTrend.Stable

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  const mid = Math.floor(sorted.length / 2)
  const firstHalf = sorted.slice(0, mid)
  const secondHalf = sorted.slice(mid)

  const lowRate = (arr: DailyEnergyEntry[]) =>
    arr.length === 0 ? 0 : arr.filter((e) => isLowEnergy(e.energy)).length / arr.length

  const firstRate = lowRate(firstHalf)
  const secondRate = lowRate(secondHalf)
  const delta = secondRate - firstRate

  // 15 percentage-point shift threshold
  if (delta > 0.15) return EnergyTrend.Declining
  if (delta < -0.15) return EnergyTrend.Improving
  return EnergyTrend.Stable
}

// ── Main Entry Point ──────────────────────────────────────────

/**
 * Analyze energy entries and produce a full pattern result
 * with a human-readable summary for AI prompt injection.
 */
export function analyzeEnergyPatterns(entries: DailyEnergyEntry[]): EnergyPatternResult {
  if (entries.length === 0) {
    return {
      suggestedMvdDays: [],
      streaks: [],
      trend: EnergyTrend.Stable,
      dayBreakdown: [],
      summary: 'No energy data available.',
    }
  }

  const dayBreakdown = analyzeDayOfWeekPatterns(entries)
  const streaks = detectStreaks(entries)
  const trend = detectTrend(entries)

  const suggestedMvdDays = dayBreakdown
    .filter((d) => d.totalCount >= MIN_ENTRIES_PER_DAY && d.lowRate >= LOW_RATE_THRESHOLD)
    .map((d) => d.dayName)

  const summary = buildSummary(suggestedMvdDays, streaks, trend)

  return { suggestedMvdDays, streaks, trend, dayBreakdown, summary }
}

// ── Summary Builder ───────────────────────────────────────────

function buildSummary(mvdDays: string[], streaks: EnergyStreak[], trend: EnergyTrend): string {
  const parts: string[] = []

  if (mvdDays.length > 0) {
    parts.push(
      `Standing MVD days suggested: ${mvdDays.join(', ')} (≥50% of these days were low-energy).`,
    )
  }

  if (streaks.length > 0) {
    const longest = streaks.reduce((a, b) => (b.length > a.length ? b : a))
    parts.push(
      `${streaks.length} low-energy streak(s) detected (longest: ${longest.length} days, ${longest.startDate} to ${longest.endDate}).`,
    )
  }

  if (trend === EnergyTrend.Declining) {
    parts.push('Overall energy is trending down — consider reducing weekly load or adding rest days.')
  } else if (trend === EnergyTrend.Improving) {
    parts.push('Overall energy is trending up — current load appears sustainable.')
  }

  if (parts.length === 0) {
    return 'No energy pattern detected — energy levels appear stable and balanced.'
  }

  return parts.join(' ')
}

// ── Prompt Formatter ──────────────────────────────────────────

/**
 * Format an EnergyPatternResult as a section suitable for
 * injection into a weekly review or planner AI system prompt.
 */
export function formatEnergyPatternsForPrompt(result: EnergyPatternResult): string {
  const lines: string[] = ['## Energy Patterns (last 4–8 weeks)', '']

  if (result.summary === 'No energy data available.') {
    lines.push('No energy pattern data available for this period.')
    return lines.join('\n')
  }

  lines.push(result.summary)

  if (result.suggestedMvdDays.length > 0) {
    lines.push('')
    lines.push(
      `Suggested standing MVD days: ${result.suggestedMvdDays.join(', ')}. On these days, default to Minimum Viable Day planning unless the family explicitly opts for a Normal Day.`,
    )
  }

  if (result.trend === EnergyTrend.Declining) {
    lines.push('')
    lines.push(
      'Energy trend is declining. Prioritize sustainable routines, shorter sessions, and more frequent breaks. Suggest load reduction in this week\'s plan.',
    )
  }

  return lines.join('\n')
}

// ── Date Helpers ──────────────────────────────────────────────

function parseDateToLocal(dateStr: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function isNextDay(prevDate: string, nextDate: string): boolean {
  const prev = parseDateToLocal(prevDate)
  const next = parseDateToLocal(nextDate)
  if (!prev || !next) return false
  const diff = next.getTime() - prev.getTime()
  return diff === 24 * 60 * 60 * 1000
}
