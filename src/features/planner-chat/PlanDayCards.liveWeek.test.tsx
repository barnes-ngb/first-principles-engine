import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import PlanDayCards from './PlanDayCards'
import type { DraftWeeklyPlan } from '../../core/types'
import { SubjectBucket } from '../../core/types/enums'

/**
 * FEAT-138 — the applied week's day cards stop being read-only.
 *
 * These are the component half of the gate. The WRITE half (parent capability,
 * the completed-row refusal, append-before-remove) is pinned in
 * `today/liveDayEdit.test.ts`, where it is enforced rather than merely offered:
 * this file asserts which affordances exist, that one asserts what they can do.
 */

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
        {
          id: 'w1',
          title: 'Watch: How volcanoes work',
          subjectBucket: SubjectBucket.Science,
          estimatedMinutes: 12,
          skillTags: [],
          accepted: true,
          itemType: 'watch',
          watchVideoId: 'vid-1',
          category: 'choose',
        },
      ],
    },
  ],
  skipSuggestions: [],
  minimumWin: '',
}

type Overrides = Partial<React.ComponentProps<typeof PlanDayCards>>

function renderApplied(overrides: Overrides = {}) {
  return render(
    <PlanDayCards
      draft={PLAN}
      hoursPerDay={2}
      masteryReviewLine=""
      readAloudBook=""
      weekStart="2026-08-09"
      generatingItemId={null}
      applied
      onRemoveItem={() => {}}
      onMoveItemToDay={() => {}}
      onSwapWatchItem={() => {}}
      {...overrides}
    />,
  )
}

const moveButtons = () => screen.queryAllByRole('button', { name: /move to another day/i })
const swapButtons = () => screen.queryAllByRole('button', { name: /change video/i })
const removeButtons = () => screen.queryAllByRole('button', { name: /remove from this day/i })

describe('PlanDayCards — a live week is editable (FEAT-138)', () => {
  it('offers move-to-another-day and remove on every row of an applied week', () => {
    renderApplied()
    expect(moveButtons()).toHaveLength(2)
    expect(removeButtons()).toHaveLength(2)
  })

  it('offers "Change video" on the watch row only', () => {
    renderApplied()
    expect(swapButtons()).toHaveLength(1)
  })

  it('reports the day and row so the caller knows what to write', () => {
    const onMoveItemToDay = vi.fn()
    renderApplied({ onMoveItemToDay })
    fireEvent.click(moveButtons()[1])
    expect(onMoveItemToDay).toHaveBeenCalledWith(0, 1)
  })

  it('renders nothing when the caller withholds the handlers (kid profile)', () => {
    renderApplied({
      onRemoveItem: undefined,
      onMoveItemToDay: undefined,
      onSwapWatchItem: undefined,
    })
    expect(moveButtons()).toHaveLength(0)
    expect(swapButtons()).toHaveLength(0)
    expect(removeButtons()).toHaveLength(0)
  })
})

describe('PlanDayCards — a completed row refuses, and says why (FEAT-138)', () => {
  const LOCK = 'Lincoln already did this one — finished work stays on its day.'

  it('disables move, remove and swap on the locked row', () => {
    renderApplied({ itemEditLockReason: (_d, i) => (i === 1 ? LOCK : null) })
    // Row 0 (Math) is free; row 1 (the watch row) is locked.
    expect(moveButtons()[0]).not.toBeDisabled()
    expect(moveButtons()[1]).toBeDisabled()
    expect(removeButtons()[1]).toBeDisabled()
    expect(swapButtons()[0]).toBeDisabled()
  })

  it('states the reason in the card, not only in a tooltip a phone never opens', () => {
    renderApplied({ itemEditLockReason: (_d, i) => (i === 1 ? LOCK : null) })
    expect(screen.getByText(LOCK)).toBeInTheDocument()
  })

  it('cannot fire the handler for a locked row', () => {
    const onRemoveItem = vi.fn()
    renderApplied({ onRemoveItem, itemEditLockReason: () => LOCK })
    fireEvent.click(removeButtons()[0])
    expect(onRemoveItem).not.toHaveBeenCalled()
  })
})

describe('PlanDayCards — what stays locked on a live week (FEAT-138)', () => {
  it('planned minutes are still NOT editable once applied', () => {
    // Owner decision, held twice: editing planned minutes on a live week moves
    // compliance hours. `EditableTime` renders plain text without `onUpdateTime`,
    // so there is no preset popover to open.
    const onUpdateTime = vi.fn()
    renderApplied({ onUpdateTime })
    fireEvent.click(screen.getAllByText('10m')[0])
    expect(screen.queryByText('45m')).toBeNull()
    expect(onUpdateTime).not.toHaveBeenCalled()
  })

  it('the within-day reorder arrows are still gated off once applied', () => {
    const onMoveItem = vi.fn()
    renderApplied({ onMoveItem })
    expect(screen.queryAllByRole('button', { name: /move up/i })).toHaveLength(0)
    expect(screen.queryAllByRole('button', { name: /move down/i })).toHaveLength(0)
  })

  it('offers the reorder arrows before Apply, where the draft IS the plan', () => {
    render(
      <PlanDayCards
        draft={PLAN}
        hoursPerDay={2}
        masteryReviewLine=""
        readAloudBook=""
        weekStart="2026-08-09"
        generatingItemId={null}
        applied={false}
        onMoveItem={() => {}}
        onRemoveItem={() => {}}
      />,
    )
    expect(screen.queryAllByRole('button', { name: /move up/i })).toHaveLength(2)
  })
})
