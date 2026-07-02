import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { DayLog, HoursAdjustment, HoursEntry } from '../../core/types'
import { DayBlockType, SubjectBucket } from '../../core/types/enums'
import MonthlyTrend from './MonthlyTrend'
import { computeHoursSummary } from './records.logic'

// DATA-01 guard: the rendered cumulative-core chip must show the SAME number as
// the canonical compliance figure (computeHoursSummary), not an inflated count.
describe('MonthlyTrend (DATA-01 display reconciliation)', () => {
  const dayLogs: DayLog[] = [
    {
      childId: 'lincoln',
      date: '2026-01-10',
      blocks: [
        { type: DayBlockType.Reading, title: 'Reading', subjectBucket: SubjectBucket.Reading, actualMinutes: 50, location: 'Home' },
        { type: DayBlockType.Math, title: 'Math', subjectBucket: SubjectBucket.Math, actualMinutes: 40, location: 'Home' },
      ],
      // Inflated checklist for the SAME work as the tracked blocks (title-matched
      // via the shared matcher), which the old chart wrongly counted (240 vs 90
      // actual). Deduped against the matched blocks-with-actuals (DATA-14).
      checklist: [
        { label: 'Reading (120m)', completed: true, subjectBucket: SubjectBucket.Reading, estimatedMinutes: 120 },
        { label: 'Math (120m)', completed: true, subjectBucket: SubjectBucket.Math, estimatedMinutes: 120 },
      ],
    } as DayLog,
    {
      childId: 'lincoln',
      date: '2026-02-12',
      blocks: [],
      checklist: [
        { label: 'Science (30m)', completed: true, subjectBucket: SubjectBucket.Science, estimatedMinutes: 30 },
        { label: 'Art (40m)', completed: true, subjectBucket: SubjectBucket.Art, estimatedMinutes: 40 },
      ],
    } as DayLog,
  ]
  const hoursEntries: HoursEntry[] = []
  const adjustments: HoursAdjustment[] = []

  it('shows a cumulative-core chip equal to the canonical core total (2h core, not the inflated 4.5h)', () => {
    const summary = computeHoursSummary(dayLogs, hoursEntries, adjustments, 'lincoln')
    // Canonical core: 50 + 40 (block actuals) + 30 (Science checklist) = 120 min = 2h.
    // Old inflated chart counted Jan checklist 240 + Feb Science 30 = 270 min = 4.5h ("5h core").
    expect(summary.coreMinutes).toBe(120)

    render(
      <MonthlyTrend
        dayLogs={dayLogs}
        hoursEntries={hoursEntries}
        adjustments={adjustments}
        startDate="2026-01"
        endDate="2026-02"
        childId="lincoln"
      />,
    )

    const expectedCoreH = (summary.coreMinutes / 60).toFixed(0) // "2"
    // The chip reads "<n>h core" — assert it matches canonical, and that the
    // old inflated figure (240 + 30 = 270 min = "5h core") is NOT shown.
    expect(screen.getByText(`${expectedCoreH}h core`)).toBeInTheDocument()
    expect(screen.queryByText('5h core')).not.toBeInTheDocument()
  })
})
