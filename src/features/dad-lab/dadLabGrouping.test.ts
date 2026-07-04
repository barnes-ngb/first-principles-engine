import { describe, expect, it } from 'vitest'

import type { DadLabReport } from '../../core/types'
import { formatMonthLabel, groupReportsByMonth } from './dadLabGrouping'

function report(date: string, id: string, arcId?: string): DadLabReport {
  return {
    id,
    date,
    weekKey: date,
    title: id,
    labType: 'science',
    question: '',
    description: '',
    status: 'complete',
    childReports: {},
    subjectTags: [],
    createdAt: date,
    updatedAt: date,
    ...(arcId ? { arcId } : {}),
  } as DadLabReport
}

describe('formatMonthLabel', () => {
  it('renders "YYYY-MM" as "Month YYYY"', () => {
    expect(formatMonthLabel('2026-07')).toBe('July 2026')
    expect(formatMonthLabel('2025-12')).toBe('December 2025')
  })

  it('returns the raw key when malformed', () => {
    expect(formatMonthLabel('nope')).toBe('nope')
  })
})

describe('groupReportsByMonth', () => {
  it('buckets by month, newest month first', () => {
    const groups = groupReportsByMonth([
      report('2026-07-19', 'g'),
      report('2026-07-05', 'f'),
      report('2026-06-21', 'e'),
      report('2026-05-03', 'd'),
    ])
    expect(groups.map((g) => g.key)).toEqual(['2026-07', '2026-06', '2026-05'])
    expect(groups[0].label).toBe('July 2026')
    expect(groups[0].reports.map((r) => r.id)).toEqual(['g', 'f'])
  })

  it('preserves input (date-desc) order within a bucket', () => {
    const groups = groupReportsByMonth([report('2026-07-19', 'later'), report('2026-07-01', 'earlier')])
    expect(groups[0].reports.map((r) => r.id)).toEqual(['later', 'earlier'])
  })

  it('interleaves arc-linked and one-off labs purely by date', () => {
    // An arc lab and a one-off in the same month sit together; the grouping
    // never implies the arc owns the month.
    const groups = groupReportsByMonth([
      report('2026-07-19', 'oneoff'),
      report('2026-07-12', 'arc', 'arc-1'),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].reports.map((r) => r.id)).toEqual(['oneoff', 'arc'])
  })

  it('buckets malformed/empty dates under Undated, sorted last', () => {
    const groups = groupReportsByMonth([report('', 'blank'), report('2026-07-01', 'dated')])
    expect(groups.map((g) => g.key)).toEqual(['2026-07', 'unknown'])
    expect(groups[1].label).toBe('Undated')
  })

  it('returns [] for no reports', () => {
    expect(groupReportsByMonth([])).toEqual([])
  })
})
