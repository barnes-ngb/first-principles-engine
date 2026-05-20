import type { ChecklistItem, DayLog } from '../../core/types'

export type DotState =
  | 'pending'
  | 'in-progress'
  | 'partial'
  | 'done'
  | 'skipped'
  | 'empty'

export interface DayStats {
  date: string
  label: string
  state: DotState
  plannedMinutes: number
  loggedMinutes: number
  subjects: string[]
}

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const

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

/** Sum planned/logged minutes for non-manual checklist items. */
export function getPlannedAndLogged(log: DayLog | null | undefined): {
  planned: number
  logged: number
  subjects: string[]
} {
  if (!log?.checklist) return { planned: 0, logged: 0, subjects: [] }
  let planned = 0
  let logged = 0
  const subjects = new Set<string>()
  for (const item of log.checklist) {
    if (item.source === 'manual') continue
    const mins = itemMinutes(item)
    planned += mins
    if (item.completed) {
      logged += mins
      if (item.subjectBucket) subjects.add(item.subjectBucket)
    }
  }
  return { planned, logged, subjects: [...subjects] }
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

/** Per-day state given the log and the calendar "today" date. */
export function computeDayState(
  date: string,
  log: DayLog | null | undefined,
  today: string,
): DotState {
  const { planned, logged } = getPlannedAndLogged(log)
  const hasPlan = planned > 0
  if (date === today) {
    return hasPlan ? 'in-progress' : 'empty'
  }
  if (date < today) {
    if (!hasPlan) return 'empty'
    if (logged === 0) return 'skipped'
    if (logged >= planned * 0.8) return 'done'
    return 'partial'
  }
  return hasPlan ? 'pending' : 'empty'
}

export function computeWeekStats(
  weekDates: string[],
  logsByDate: Record<string, DayLog | null>,
  today: string,
): DayStats[] {
  return weekDates.map((date, i) => {
    const log = logsByDate[date] ?? null
    const { planned, logged, subjects } = getPlannedAndLogged(log)
    return {
      date,
      label: DAY_LABELS[i] ?? '',
      state: computeDayState(date, log, today),
      plannedMinutes: planned,
      loggedMinutes: logged,
      subjects,
    }
  })
}

/** Hours chip label: hours when planned >= 60min, otherwise minutes. */
export function formatHoursChip(logged: number, planned: number): string {
  if (planned >= 60) {
    const hours = (mins: number): string =>
      mins % 60 === 0 ? `${mins / 60}` : (mins / 60).toFixed(1)
    return `${hours(logged)}/${hours(planned)} hrs`
  }
  return `${logged}/${planned} min`
}

export function isWeekEmpty(stats: DayStats[]): boolean {
  return stats.every((s) => s.plannedMinutes === 0)
}
