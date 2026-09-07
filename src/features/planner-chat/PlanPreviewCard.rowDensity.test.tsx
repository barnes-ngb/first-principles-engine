import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import PlanPreviewCard from './PlanPreviewCard'
import type { DraftWeeklyPlan } from '../../core/types'
import { SubjectBucket } from '../../core/types/enums'

/**
 * UX-251 — row density on a phone.
 *
 * Each row could carry ↑, ↓, 📅 and ✕ (and, on a watch row, a fifth), as 16px
 * icons at `p: 0.25`, beside a title, an App chip, a skip chip and the editable
 * minutes — repeated across ~15 rows a day and five days at 390px. The two
 * arrows are the least-used of them (the model orders the day; the parent's real
 * edits are remove and move-to-another-day) and the hardest to hit, so they now
 * live behind one overflow.
 *
 * These assertions are about the CONTROLS, not the write: `onMoveItem` is
 * unchanged, still edits the draft, still gated on `!applied` by `PlanDayCards`.
 */

function plan(itemCount: number): DraftWeeklyPlan {
  return {
    days: [
      {
        day: 'Monday',
        timeBudgetMinutes: 120,
        items: Array.from({ length: itemCount }, (_, i) => ({
          id: `i${i}`,
          title: `Item ${i}`,
          subjectBucket: SubjectBucket.Math,
          estimatedMinutes: 10,
          skillTags: [],
          accepted: true,
        })),
      },
    ],
    skipSuggestions: [],
    minimumWin: '',
  } as unknown as DraftWeeklyPlan
}

function renderCard(itemCount: number, onMoveItem = vi.fn()) {
  render(
    <PlanPreviewCard
      plan={plan(itemCount)}
      hoursPerDay={2}
      weekStart="2026-07-19"
      onMoveItem={onMoveItem}
      onRemoveItem={() => {}}
      onMoveItemToDay={() => {}}
    />,
  )
  return onMoveItem
}

const overflowButtons = () => screen.queryAllByRole('button', { name: /reorder this item/i })

describe('the within-day reorder lives behind one overflow (UX-251)', () => {
  it('puts no bare arrows on the row', () => {
    renderCard(3)
    expect(screen.queryByRole('button', { name: /^move up$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^move down$/i })).toBeNull()
  })

  it('leaves the first-class taps where they were', () => {
    renderCard(3)
    // Remove and move-to-another-day are the edits a parent actually makes, so
    // they stay one tap, not two.
    expect(screen.getAllByRole('button', { name: /remove from this day/i })).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: /move to another day/i })).toHaveLength(3)
  })

  it('gives each row exactly one reorder control instead of two', () => {
    renderCard(3)
    expect(overflowButtons()).toHaveLength(3)
  })

  it('renders no reorder control at all on a one-item day', () => {
    // Both directions are dead ends there — two disabled arrows was the old
    // behaviour and an inert affordance is what FEAT-138 went out of its way to
    // stop rendering.
    renderCard(1)
    expect(overflowButtons()).toHaveLength(0)
  })

  it('still reorders, through labelled menu rows rather than adjacent arrows', () => {
    const onMoveItem = renderCard(3)
    fireEvent.click(overflowButtons()[1])
    fireEvent.click(screen.getByRole('menuitem', { name: /move up/i }))
    expect(onMoveItem).toHaveBeenCalledWith(0, 1, -1)
  })

  it('moves down from the same menu', () => {
    const onMoveItem = renderCard(3)
    fireEvent.click(overflowButtons()[0])
    fireEvent.click(screen.getByRole('menuitem', { name: /move down/i }))
    expect(onMoveItem).toHaveBeenCalledWith(0, 0, 1)
  })

  it('disables the direction that would fall off the end', () => {
    renderCard(3)
    fireEvent.click(overflowButtons()[0])
    expect(screen.getByRole('menuitem', { name: /move up/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('menuitem', { name: /move down/i })).not.toHaveAttribute(
      'aria-disabled',
    )
  })

  it('renders nothing reorder-shaped when the caller withholds the handler', () => {
    // The applied week: `PlanDayCards` passes no `onMoveItem`, because the cards
    // are a mirror of saved days with no Apply bar to flush a draft edit.
    render(
      <PlanPreviewCard
        plan={plan(3)}
        hoursPerDay={2}
        weekStart="2026-07-19"
        onRemoveItem={() => {}}
      />,
    )
    expect(overflowButtons()).toHaveLength(0)
  })
})
