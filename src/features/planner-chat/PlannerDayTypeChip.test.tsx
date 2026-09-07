import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import type { DraftWeeklyPlan } from '../../core/types'
import { DayType, SubjectBucket } from '../../core/types/enums'
import PlannerDayTypeChip from './PlannerDayTypeChip'
import PlanDayCards from './PlanDayCards'

describe('PlannerDayTypeChip', () => {
  it('renders nothing without a change handler — the capability gate', () => {
    // `/planner/chat` sits outside `RequireParent`, so a kid profile can reach
    // the page by URL. The page withholds the handler; nothing must render.
    const { container } = render(
      <PlannerDayTypeChip day="Tuesday" dayType={DayType.Normal} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('says what kind of day it is in words, without being tapped', () => {
    render(
      <PlannerDayTypeChip day="Tuesday" dayType={DayType.Life} onChange={vi.fn()} />,
    )
    expect(screen.getByText('Life Day')).toBeInTheDocument()
  })

  it('names the day in its accessible label', () => {
    render(
      <PlannerDayTypeChip day="Thursday" dayType={DayType.Normal} onChange={vi.fn()} />,
    )
    expect(
      screen.getByLabelText(/Thursday: Full\. Change what kind of day this is\./),
    ).toBeInTheDocument()
  })

  it('offers all three kinds with a line explaining each — not a cycling button', () => {
    render(
      <PlannerDayTypeChip day="Tuesday" dayType={DayType.Normal} onChange={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('Full'))

    expect(screen.getByText('Light')).toBeInTheDocument()
    expect(screen.getByText('Life Day')).toBeInTheDocument()
    expect(
      screen.getByText(/This day is the lesson\. Set it aside/),
    ).toBeInTheDocument()
  })

  it('hands up the chosen type and closes', () => {
    const onChange = vi.fn()
    render(
      <PlannerDayTypeChip day="Tuesday" dayType={DayType.Normal} onChange={onChange} />,
    )
    fireEvent.click(screen.getByText('Full'))
    fireEvent.click(screen.getByText('Life Day'))

    expect(onChange).toHaveBeenCalledExactlyOnceWith(DayType.Life)
  })
})

// ── The control on a real day card ───────────────────────────────────────────

const draft = (): DraftWeeklyPlan =>
  ({
    days: [
      {
        day: 'Monday',
        timeBudgetMinutes: 260,
        items: [
          {
            id: 'm1',
            title: 'GATB Math',
            subjectBucket: SubjectBucket.Math,
            estimatedMinutes: 30,
            skillTags: [],
            accepted: true,
            category: 'must-do' as const,
          },
        ],
      },
      { day: 'Tuesday', timeBudgetMinutes: 260, items: [] },
    ],
    skipSuggestions: [],
    minimumWin: 'Read together',
  }) as unknown as DraftWeeklyPlan

const cardProps = {
  draft: draft(),
  hoursPerDay: 4.3,
  readAloudBook: '',
  weekStart: '2026-08-16',
  generatingItemId: null,
  applied: false,
}

describe('the day type on a plan day card', () => {
  it('shows no control for a profile that cannot plan', () => {
    render(<PlanDayCards {...cardProps} />)
    expect(screen.queryByLabelText(/Change what kind of day this is/)).toBeNull()
  })

  it('shows one control per day for a parent', () => {
    render(<PlanDayCards {...cardProps} onDayTypeChange={vi.fn()} />)
    expect(screen.getAllByLabelText(/Change what kind of day this is/)).toHaveLength(2)
  })

  it('names the day it belongs to, so two chips are never confused', () => {
    render(<PlanDayCards {...cardProps} onDayTypeChange={vi.fn()} />)
    expect(screen.getByLabelText(/^Monday: Full/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Tuesday: Full/)).toBeInTheDocument()
  })

  it('hands up the day name with the type', () => {
    const onDayTypeChange = vi.fn()
    render(<PlanDayCards {...cardProps} onDayTypeChange={onDayTypeChange} />)

    fireEvent.click(screen.getByLabelText(/^Tuesday: Full/))
    fireEvent.click(screen.getByText('Life Day'))

    expect(onDayTypeChange).toHaveBeenCalledExactlyOnceWith('Tuesday', DayType.Life)
  })

  it('is withheld once the week is applied — the card is a mirror with no Apply bar', () => {
    render(<PlanDayCards {...cardProps} applied onDayTypeChange={vi.fn()} />)
    expect(screen.queryByLabelText(/Change what kind of day this is/)).toBeNull()
  })
})

describe('what a set-aside day says', () => {
  const setAside = [{ day: 'Tuesday', dayType: DayType.Life }]

  it('reads as a day the parent chose, never as an unfinished one', () => {
    render(<PlanDayCards {...cardProps} dayTypes={setAside} onDayTypeChange={vi.fn()} />)

    // "No items" and "Nothing planned yet" are both true and both wrong here —
    // they read as a plan that failed to fill rather than one that was declined.
    expect(screen.queryByText('No items')).toBeNull()
    expect(screen.queryByText('Nothing planned yet')).toBeNull()
    expect(screen.getByText(/This day is the lesson\. Set it aside/)).toBeInTheDocument()
  })

  it('shows no budget chip — there is no target to fall short of', () => {
    render(<PlanDayCards {...cardProps} dayTypes={setAside} onDayTypeChange={vi.fn()} />)

    // Monday keeps its own budget chip; Tuesday, set aside, has none. A
    // `0m / 258m` there would read as a shortfall against a target the parent
    // deliberately declined.
    expect(screen.getByText('30m / 258m')).toBeInTheDocument()
    expect(screen.queryByText(/^0m \//)).toBeNull()
    expect(screen.queryByText('Nothing planned yet')).toBeNull()
  })

  it('keeps the budget chip on a day that is merely empty', () => {
    render(<PlanDayCards {...cardProps} onDayTypeChange={vi.fn()} />)
    expect(screen.getByText('Nothing planned yet')).toBeInTheDocument()
    expect(screen.getByText('No items')).toBeInTheDocument()
  })

  it('offers no "Add a video" — the row would be discarded at the next generate', () => {
    render(
      <PlanDayCards
        {...cardProps}
        dayTypes={setAside}
        onDayTypeChange={vi.fn()}
        onAddWatchItem={vi.fn()}
      />,
    )
    // Monday still offers it; Tuesday does not.
    expect(screen.getAllByRole('button', { name: /Add a video/ })).toHaveLength(1)
  })
})
