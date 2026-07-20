import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import PlanPreviewCard from './PlanPreviewCard'
import type { DraftWeeklyPlan } from '../../core/types'
import { SubjectBucket } from '../../core/types/enums'

function makeWeekPlan(): DraftWeeklyPlan {
  const day = (name: string) => ({
    day: name,
    timeBudgetMinutes: 120,
    items: [
      {
        id: `${name}-1`,
        title: `${name} work`,
        subjectBucket: SubjectBucket.Math,
        estimatedMinutes: 10,
        skillTags: [],
        accepted: true,
      },
    ],
  })
  return {
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day),
    skipSuggestions: [],
    minimumWin: '',
  }
}

describe('PlanPreviewCard — concrete day dates (FEAT-112)', () => {
  // Planning week Jul 20–24, 2026 → Sunday-start 2026-07-19.
  it('renders each day header with its concrete mapped date when weekStart is given', () => {
    render(<PlanPreviewCard plan={makeWeekPlan()} hoursPerDay={2} weekStart="2026-07-19" />)
    expect(screen.getByText('Monday · Jul 20')).toBeInTheDocument()
    expect(screen.getByText('Wednesday · Jul 22')).toBeInTheDocument()
    expect(screen.getByText('Friday · Jul 24')).toBeInTheDocument()
  })

  it('falls back to bare weekday names when weekStart is absent', () => {
    render(<PlanPreviewCard plan={makeWeekPlan()} hoursPerDay={2} />)
    expect(screen.getByText('Monday')).toBeInTheDocument()
    expect(screen.queryByText(/Monday · /)).not.toBeInTheDocument()
  })
})
