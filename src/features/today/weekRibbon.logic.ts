/**
 * Today's week ribbon — the counted week, and five dots for the plan (UX-443 /
 * UX-444).
 *
 * ── What the chip used to say, and why it changed ───────────────────────────
 *
 * Owner, 2026-09-25, on a Friday: *"In the day there's a total that is only
 * summing that day and actually the week … it doesn't include any of the extra
 * stuff like artifacts and time that might take place instead of the
 * assignments. Specifically, you see the 2.3/25 — only the check-mark ones seem
 * to make progress towards this."*
 *
 * The owner was right about what it counted. The chip was its own arithmetic: the
 * planned minutes of every checked NON-manual checklist row, over the planned
 * minutes of every non-manual row. So the `25` was not a target anybody set — it
 * was the week's plan, summed — and the `2.3` moved only when a planned row was
 * ticked. An `hours` document (the Capture card, the creative timer, the book
 * reader, a Dad Lab report), an `hoursAdjustments` row (*Log watch time*,
 * Historical Hours, a correction), a block's actual minutes and every manual row
 * — which is exactly what a kid's *⭐ I Did More!* writes — reached Records and
 * never reached Today.
 *
 * That split used to be deliberate and documented: `hoursReaderAgreement.test.ts`
 * excluded the ribbon BY NAME as *"a different question — progress through the
 * week's PLANNED checklist"*. The owner has now decided the question Today asks
 * is the question Records asks, so the ribbon moved from that exclusion list into
 * the agreement. Two decisions, both his (2026-09-25):
 *
 *   • **the chip shows counted hours only, with no denominator** — UX-211's rule
 *     (*"When we move to Texas hours aren't the goal"*) brought to Today; and
 *   • **a day with counted time is never "empty"**.
 *
 * ── What this file computes, and what it refuses to ─────────────────────────
 *
 * It computes no minute. The week's total is `computeHoursSummary` — the shared
 * `collectHoursContributions` fold (`functions/src/shared/hoursContributions.ts`,
 * ARCH-47 slice 4) the Records page, the compliance pack and the Review's
 * *Hours and Coverage* line read — over the same three arrays the Review reads
 * (`weekly-review/useWeekHoursInputs`). A day's counted minutes are those same
 * contributions bucketed by their own `date`; nothing is re-derived.
 *
 * The dots still answer *"did we do the plan?"* for a planned day — `done` and
 * `partial` stay plan-based, on checked planned minutes — because that is a
 * different claim from the chip's and one the dots have always made. What changed
 * is that a day that HAPPENED can no longer read as a day that did not: a past
 * day with no plan and counted time is `logged`, and a planned day where nothing
 * was ticked but time was counted is `partial` rather than `skipped`.
 *
 * Artifacts carry no minutes, by design (AUDIT-234, FEAT-238: evidence and time
 * are separate records), and they do not start to here. A photo moves the chip
 * only if the door that took it also wrote an `hours` row — the Capture card
 * does; most evidence doors do not.
 */

import type { ChecklistItem, DayLog, HoursAdjustment, HoursEntry } from '../../core/types'
import { weekRangeFromDateKey } from '../../core/utils/dateKey'
import {
  collectHoursContributions,
  computeHoursSummary,
} from '../records/records.logic'

export type DotState =
  | 'pending'
  | 'in-progress'
  | 'partial'
  | 'done'
  | 'skipped'
  /** A day with counted time and no plan (UX-444). Filled, never the empty ring. */
  | 'logged'
  | 'empty'

export interface DayStats {
  date: string
  label: string
  state: DotState
  /** Planned minutes on the day's non-manual rows — the plan, not a target. */
  plannedMinutes: number
  /** Counted minutes for the day, from the shared fold. */
  countedMinutes: number
  /** Non-manual (planned) rows on the day, and how many are ticked. */
  rowsPlanned: number
  rowsDone: number
  /** Subjects the day's counted minutes came from. */
  subjects: string[]
}

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const

// ── Copy — every string the ribbon renders ──────────────────────────────────

export const RIBBON_HEADING = 'This Week'
export const WEEK_EMPTY_LINE = 'Nothing planned for this week yet.'
export const PLAN_WEEK_LINK = '→ Plan My Week'
export const DAY_NO_PLAN_LINE = 'No plan for this day'
/**
 * The ribbon's week is the Review's week: Sunday to Saturday
 * (`weekRangeFromDateKey`). The dots draw Monday to Friday, so a Saturday Dad
 * Lab counts in the chip with no dot of its own — correct, and said.
 */
export const WEEK_RANGE_NOTE = 'This week runs Sunday to Saturday, so weekend time counts too.'

export function rowsDoneLine(done: number, total: number): string {
  return `${done} of ${total} ${total === 1 ? 'row' : 'rows'} done`
}

export function countedDayLine(minutes: number): string {
  return minutes > 0 ? `${Math.round(minutes)} min counted` : 'No time counted'
}

// ── The plan half ───────────────────────────────────────────────────────────

export function parseMinutesFromLabel(label: string): number {
  const match = label.match(/\((\d+)m\)/)
  return match ? parseInt(match[1], 10) : 0
}

export function itemMinutes(item: ChecklistItem): number {
  return (
    item.plannedMinutes ??
    item.estimatedMinutes ??
    parseMinutesFromLabel(item.label)
  )
}

export interface PlanProgress {
  /** Planned minutes over the day's non-manual rows. */
  planned: number
  /** Planned minutes over the ticked ones — for the `done` / `partial` rule only. */
  checked: number
  rowsPlanned: number
  rowsDone: number
}

/**
 * How far through its PLAN a day got. Manual rows are not the plan — a kid's
 * *I Did More* row is extra work, counted by the fold, never a planned row — so
 * they are skipped here and only here.
 */
export function getPlanProgress(log: DayLog | null | undefined): PlanProgress {
  const out: PlanProgress = { planned: 0, checked: 0, rowsPlanned: 0, rowsDone: 0 }
  if (!log?.checklist) return out
  for (const item of log.checklist) {
    if (item.source === 'manual') continue
    const mins = itemMinutes(item)
    out.planned += mins
    out.rowsPlanned += 1
    if (item.completed) {
      out.checked += mins
      out.rowsDone += 1
    }
  }
  return out
}

/**
 * The Monday the ribbon draws from, for the day being viewed (Codex round 1 on
 * `FIX-254`, P2): the Monday of the **Sun–Sat week that contains** `dateKey`.
 *
 * The chip counts that Sun–Sat week (`weekRangeFromDateKey`, the Review's week),
 * so the dots must be its Monday–Friday. `TodayPage`'s own Mon–Fri list is a
 * Monday-start week, which on a Sunday is the week that just ENDED — handing
 * that Monday to the ribbon made the chip count the previous Sun–Sat and leave
 * out the Sunday on screen. Monday–Saturday give the same answer either way;
 * only a Sunday differs, and there the ribbon now shows the week it is part of.
 */
export function ribbonWeekStart(dateKey: string): string {
  const sunday = new Date(weekRangeFromDateKey(dateKey).start + 'T00:00:00')
  sunday.setDate(sunday.getDate() + 1)
  const yyyy = sunday.getFullYear()
  const mm = String(sunday.getMonth() + 1).padStart(2, '0')
  const dd = String(sunday.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** Build Mon-Fri YYYY-MM-DD strings from a Monday weekStart. */
export function buildWeekDates(weekStart: string): string[] {
  const start = new Date(weekStart + 'T00:00:00')
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  })
}

/**
 * One day log per date for this child. Where a date holds more than one, the
 * one with the longer checklist is the plan — the rule the ribbon always used.
 * It chooses which PLAN the dot reads; it never touches a counted minute, which
 * the fold takes from every document.
 */
export function pickDayLogsByDate(
  dayLogs: readonly DayLog[],
  childId: string,
  weekDates: readonly string[],
): Record<string, DayLog | null> {
  const map: Record<string, DayLog | null> = {}
  for (const d of weekDates) map[d] = null
  for (const log of dayLogs) {
    if (log?.childId !== childId) continue
    if (!log.date || !(log.date in map)) continue
    const existing = map[log.date]
    if (!existing || (log.checklist?.length ?? 0) > (existing.checklist?.length ?? 0)) {
      map[log.date] = log
    }
  }
  return map
}

// ── The counted half ────────────────────────────────────────────────────────

export interface CountedDay {
  minutes: number
  subjects: string[]
}

/**
 * The fold's contributions, bucketed by their own `date`. A `reduce` and nothing
 * else: the minutes are the fold's, and a negative adjustment subtracts here as
 * it does everywhere.
 */
export function bucketContributionsByDate(
  contributions: readonly { date: string; minutes: number; subjectBucket: string }[],
): Record<string, CountedDay> {
  return contributions.reduce<Record<string, CountedDay>>((acc, c) => {
    const day = acc[c.date] ?? { minutes: 0, subjects: [] }
    day.minutes += c.minutes
    if (c.minutes > 0 && !day.subjects.includes(c.subjectBucket)) {
      day.subjects.push(c.subjectBucket)
    }
    acc[c.date] = day
    return acc
  }, {})
}

// ── The dot ─────────────────────────────────────────────────────────────────

/**
 * Per-day state (UX-444). The plan decides `done` / `partial` on a planned day,
 * exactly as before; counted time decides whether a day that was not the plan
 * still happened.
 *
 * | Situation                                       | State         |
 * |-------------------------------------------------|---------------|
 * | today, with a plan or any counted minutes       | `in-progress` |
 * | past, no plan, counted > 0                      | `logged`      |
 * | past, plan, nothing checked, counted == 0       | `skipped`     |
 * | past, plan, nothing checked, counted > 0        | `partial`     |
 * | past, plan, checked ≥ 80% of planned minutes    | `done`        |
 * | past, plan, checked < 80%                       | `partial`     |
 * | future, plan                                    | `pending`     |
 * | future, no plan, counted > 0                    | `logged`      |
 * | nothing at all                                  | `empty`       |
 */
export function computeDayState(
  date: string,
  plan: PlanProgress,
  countedMinutes: number,
  today: string,
): DotState {
  const hasPlan = plan.planned > 0
  const hasTime = countedMinutes > 0
  if (date === today) {
    return hasPlan || hasTime ? 'in-progress' : 'empty'
  }
  if (date < today) {
    if (!hasPlan) return hasTime ? 'logged' : 'empty'
    if (plan.checked === 0) return hasTime ? 'partial' : 'skipped'
    if (plan.checked >= plan.planned * 0.8) return 'done'
    return 'partial'
  }
  if (hasPlan) return 'pending'
  return hasTime ? 'logged' : 'empty'
}

export function computeWeekStats(
  weekDates: readonly string[],
  logsByDate: Record<string, DayLog | null>,
  countedByDate: Record<string, CountedDay>,
  today: string,
): DayStats[] {
  return weekDates.map((date, i) => {
    const plan = getPlanProgress(logsByDate[date] ?? null)
    const counted = countedByDate[date] ?? { minutes: 0, subjects: [] }
    return {
      date,
      label: DAY_LABELS[i] ?? '',
      state: computeDayState(date, plan, counted.minutes, today),
      plannedMinutes: plan.planned,
      countedMinutes: counted.minutes,
      rowsPlanned: plan.rowsPlanned,
      rowsDone: plan.rowsDone,
      subjects: counted.subjects,
    }
  })
}

export interface RibbonWeek {
  /** The week's counted minutes — `computeHoursSummary`, nothing else. */
  totalMinutes: number
  stats: DayStats[]
}

/**
 * The whole ribbon from the Review's three arrays. The chip's total and the
 * dots' minutes are one fold read two ways, so they cannot disagree with each
 * other or with *Hours and Coverage* for the same child and week.
 */
export function computeRibbonWeek(input: {
  dayLogs: DayLog[]
  hoursEntries: HoursEntry[]
  adjustments: HoursAdjustment[]
  childId: string
  weekDates: readonly string[]
  today: string
}): RibbonWeek {
  const { dayLogs, hoursEntries, adjustments, childId, weekDates, today } = input
  const totalMinutes = computeHoursSummary(dayLogs, hoursEntries, adjustments, childId)
    .totalMinutes
  const countedByDate = bucketContributionsByDate(
    collectHoursContributions(dayLogs, hoursEntries, adjustments, childId),
  )
  const logsByDate = pickDayLogsByDate(dayLogs, childId, weekDates)
  return {
    totalMinutes,
    stats: computeWeekStats(weekDates, logsByDate, countedByDate, today),
  }
}

// ── The chip ────────────────────────────────────────────────────────────────

/**
 * The week's counted time on the chip (UX-443): `3.8 hrs`, `45 min`. **No `/`,
 * no target, no percentage** — `weekly-review/weekHours.ts`'s rule, verbatim.
 * A total at or below zero (adjustments subtract) reads as none rather than as
 * a negative duration. The one formatter; `formatHoursChip` is retired.
 */
export function formatCountedHours(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0 min'
  if (minutes < 60) return `${Math.round(minutes)} min`
  const hours = minutes / 60
  const shown = hours % 1 === 0 ? `${hours}` : hours.toFixed(1)
  return `${shown} ${shown === '1' ? 'hr' : 'hrs'}`
}

/**
 * *"Nothing planned for this week yet"* is said only when nothing was planned
 * AND nothing was counted (UX-444). A week with logged time and no plan is not
 * empty — including a week whose only time is a weekend, which has no dot.
 */
export function isWeekEmpty(stats: readonly DayStats[], weekCountedMinutes: number): boolean {
  return (
    weekCountedMinutes <= 0 &&
    stats.every((s) => s.plannedMinutes === 0 && s.countedMinutes <= 0)
  )
}
