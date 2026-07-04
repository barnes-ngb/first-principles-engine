import type { DadLabReport } from '../../core/types'

/** A month bucket of completed labs, newest month first. */
export interface MonthGroup {
  /** `YYYY-MM` — stable key for expansion state + current-month comparison. */
  key: string
  /** Display label, e.g. "July 2026". */
  label: string
  /** Reports in this month, preserving the input order (date desc). */
  reports: DadLabReport[]
}

/** Turn a `YYYY-MM` key into a "Month YYYY" label (e.g. "July 2026"). */
export function formatMonthLabel(key: string): string {
  const [y, m] = key.split('-').map((n) => parseInt(n, 10))
  if (!y || !m) return key
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/**
 * Group completed labs into month/year buckets, newest month first (FEAT-55).
 *
 * Input is expected already sorted date-desc (the `useDadLabReports` query
 * orders `date` desc); within a bucket that order is preserved. Reports with a
 * malformed/empty `date` are bucketed under an `'unknown'` key sorted last so
 * they never silently vanish. Arc-linked and one-off labs interleave purely by
 * date — the grouping says nothing about arcs, so no display implies an arc
 * owns consecutive weeks.
 */
export function groupReportsByMonth(reports: DadLabReport[]): MonthGroup[] {
  const buckets = new Map<string, DadLabReport[]>()
  for (const r of reports) {
    const key = /^\d{4}-\d{2}/.test(r.date ?? '') ? r.date.slice(0, 7) : 'unknown'
    const list = buckets.get(key)
    if (list) list.push(r)
    else buckets.set(key, [r])
  }

  return [...buckets.keys()]
    .sort((a, b) => {
      if (a === 'unknown') return 1
      if (b === 'unknown') return -1
      return a < b ? 1 : a > b ? -1 : 0 // newest first
    })
    .map((key) => ({
      key,
      label: key === 'unknown' ? 'Undated' : formatMonthLabel(key),
      reports: buckets.get(key)!,
    }))
}
