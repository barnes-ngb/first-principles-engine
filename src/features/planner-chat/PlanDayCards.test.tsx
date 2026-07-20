import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import PlanDayCards from './PlanDayCards'
import type { DraftWeeklyPlan } from '../../core/types'
import { SubjectBucket } from '../../core/types/enums'

const PLAN: DraftWeeklyPlan = {
  days: [
    {
      day: 'Monday',
      timeBudgetMinutes: 120,
      items: [
        {
          id: 'm1',
          title: 'Math',
          subjectBucket: SubjectBucket.Math,
          estimatedMinutes: 10,
          skillTags: [],
          accepted: true,
        },
      ],
    },
  ],
  skipSuggestions: [],
  minimumWin: '',
}

describe('PlanDayCards — week header (FEAT-112)', () => {
  it('carries a prominent "Week of …" header for the planning week', () => {
    render(
      <PlanDayCards
        draft={PLAN}
        hoursPerDay={2}
        masteryReviewLine=""
        readAloudBook=""
        weekStart="2026-07-19"
        generatingItemId={null}
        applied={false}
        onToggleItem={() => {}}
      />,
    )
    expect(screen.getByText('Week of Jul 20–24')).toBeInTheDocument()
    // …and the day card shows its concrete date, threaded through to PlanPreviewCard.
    expect(screen.getByText('Monday · Jul 20')).toBeInTheDocument()
  })
})
