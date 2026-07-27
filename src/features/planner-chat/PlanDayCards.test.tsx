import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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

function renderCards(applied: boolean, onAddWatchItem = () => {}) {
  return render(
    <PlanDayCards
      draft={PLAN}
      hoursPerDay={2}
      masteryReviewLine=""
      readAloudBook=""
      weekStart="2026-07-19"
      generatingItemId={null}
      applied={applied}
      onToggleItem={() => {}}
      onMoveItem={() => {}}
      onRemoveItem={() => {}}
      onUpdateTime={() => {}}
      onAddWatchItem={onAddWatchItem}
    />,
  )
}

const addVideoButton = () => screen.queryByRole('button', { name: /add a video/i })

/**
 * FEAT-132: "Add a video" must survive Apply. It was gated behind `!applied`
 * alongside the structural edits, so the planner's add path disappeared at
 * exactly the moment a parent reaches for it — mid-week, on a live plan.
 */
describe('PlanDayCards — "Add a video" after Apply (FEAT-132)', () => {
  it('keeps the button once the week is applied', () => {
    renderCards(true)
    expect(addVideoButton()).not.toBeNull()
  })

  it('still shows it before Apply', () => {
    renderCards(false)
    expect(addVideoButton()).not.toBeNull()
  })

  it('reports the day index so the caller knows where to write', () => {
    const onAddWatchItem = vi.fn()
    renderCards(true, onAddWatchItem)
    fireEvent.click(addVideoButton()!)
    expect(onAddWatchItem).toHaveBeenCalledWith(0)
  })

  // Remove/move/retime would have to reconcile against days the family may
  // already be working through — only the additive action survives Apply.
  it('still gates the STRUCTURAL edits off once applied (unchanged)', () => {
    const { container } = renderCards(true)
    expect(container.querySelector('[data-testid="CloseIcon"]')).toBeNull()
  })

  it('still offers the structural edits before Apply (characterization)', () => {
    const { container } = renderCards(false)
    expect(container.querySelector('[data-testid="CloseIcon"]')).not.toBeNull()
  })
})
