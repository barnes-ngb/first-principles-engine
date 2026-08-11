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

function renderCards(
  applied: boolean,
  onAddWatchItem = () => {},
  onToggleItem = () => {},
) {
  return render(
    <PlanDayCards
      draft={PLAN}
      hoursPerDay={2}
      masteryReviewLine=""
      readAloudBook=""
      weekStart="2026-07-19"
      generatingItemId={null}
      applied={applied}
      onToggleItem={onToggleItem}
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

  // FEAT-133 (Codex P2 on PR #1640): `/planner/chat` is outside `RequireParent`,
  // so `PlannerChatPage` withholds the handler for a non-parent profile. This is
  // the half of that gate this component owns — no handler, no affordance, on an
  // applied week or otherwise. (The `isParent` wiring itself lives in
  // `PlannerChatPage`, which has no test harness; `handleAddWatchItem` also
  // early-returns on the capability so the WRITE is guarded, not just the UI.)
  it('renders no add affordance at all when the caller withholds the handler', () => {
    render(
      <PlanDayCards
        draft={PLAN}
        hoursPerDay={2}
        masteryReviewLine=""
        readAloudBook=""
        weekStart="2026-07-19"
        generatingItemId={null}
        applied
        onToggleItem={() => {}}
      />,
    )
    expect(addVideoButton()).toBeNull()
  })

  it('reports the day index so the caller knows where to write', () => {
    const onAddWatchItem = vi.fn()
    renderCards(true, onAddWatchItem)
    fireEvent.click(addVideoButton()!)
    expect(onAddWatchItem).toHaveBeenCalledWith(0)
  })

  // FEAT-138 changed this: remove now SURVIVES Apply, because the caller writes
  // it into the saved day instead of into a draft nothing would flush. What
  // stays gated is the WITHIN-DAY reorder (whose draft and saved-day positions
  // diverge) and planned minutes (compliance hours) — see the FEAT-138 block
  // below, which pins both.
  it('offers remove on an applied week (FEAT-138)', () => {
    const { container } = renderCards(true)
    expect(container.querySelector('[data-testid="CloseIcon"]')).not.toBeNull()
  })

  it('still offers the structural edits before Apply (characterization)', () => {
    const { container } = renderCards(false)
    expect(container.querySelector('[data-testid="CloseIcon"]')).not.toBeNull()
  })
})

/**
 * FEAT-133 (Codex P2 on PR #1640): the applied view's cards are advertised as
 * read-only, but `onToggleItem` was forwarded regardless of `applied`. A toggle
 * there edits a draft that has no Apply bar to flush it — so the card silently
 * disagrees with the live checklist, and a subsequent "Add a video" persists
 * that divergence to the conversation doc.
 */
describe('PlanDayCards — acceptance toggle is inert once applied (FEAT-133)', () => {
  const toggle = (container: HTMLElement) =>
    container.querySelector('[data-testid="CheckCircleIcon"]')?.closest('button') ?? null

  it('renders the toggle as a static icon, not a button, once applied', () => {
    const onToggleItem = vi.fn()
    const { container } = renderCards(true, () => {}, onToggleItem)
    // The icon is still shown (the parent can see what was accepted)…
    expect(container.querySelector('[data-testid="CheckCircleIcon"]')).not.toBeNull()
    // …but there is nothing to press.
    expect(toggle(container)).toBeNull()
  })

  it('cannot mutate the draft from the applied view', () => {
    const onToggleItem = vi.fn()
    const { container } = renderCards(true, () => {}, onToggleItem)
    const icon = container.querySelector('[data-testid="CheckCircleIcon"]')!
    fireEvent.click(icon)
    expect(onToggleItem).not.toHaveBeenCalled()
  })

  it('still toggles before Apply, where the draft IS the plan (characterization)', () => {
    const onToggleItem = vi.fn()
    const { container } = renderCards(false, () => {}, onToggleItem)
    fireEvent.click(toggle(container)!)
    expect(onToggleItem).toHaveBeenCalledWith(0, 'm1')
  })
})
