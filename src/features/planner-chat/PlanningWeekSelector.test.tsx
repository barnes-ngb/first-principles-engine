import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import PlanningWeekSelector from './PlanningWeekSelector'
import { planningWeekOptions } from './planningWeekSelection'

// Wed Jul 15, 2026 — both weeks plannable; Sat Jul 18 — "this week" has passed.
const WED = new Date(2026, 6, 15)
const SAT = new Date(2026, 6, 18)

describe('PlanningWeekSelector (FEAT-196)', () => {
  it('shows both weeks with the real dates each one writes to', () => {
    render(
      <PlanningWeekSelector
        options={planningWeekOptions(WED)}
        value="this"
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText('This week')).toBeInTheDocument()
    expect(screen.getByText('Jul 13–17')).toBeInTheDocument()
    expect(screen.getByText('Next week')).toBeInTheDocument()
    expect(screen.getByText('Jul 20–24')).toBeInTheDocument()
  })

  it('marks the active week pressed, so the choice is never ambiguous', () => {
    render(
      <PlanningWeekSelector
        options={planningWeekOptions(WED)}
        value="next"
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { pressed: true })).toHaveTextContent('Next week')
  })

  it('reports a pick to its caller', () => {
    const onChange = vi.fn()
    render(
      <PlanningWeekSelector
        options={planningWeekOptions(WED)}
        value="this"
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /next week/i }))
    expect(onChange).toHaveBeenCalledWith('next')
  })

  // MUI's exclusive ToggleButtonGroup reports `null` when the active button is
  // re-tapped. A week is never "none", so that deselect must be swallowed.
  it('ignores a deselect rather than clearing the target week', () => {
    const onChange = vi.fn()
    render(
      <PlanningWeekSelector
        options={planningWeekOptions(WED)}
        value="this"
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /this week/i }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows a passed week greyed out with its reason, not hidden', () => {
    const onChange = vi.fn()
    render(
      <PlanningWeekSelector
        options={planningWeekOptions(SAT)}
        value="next"
        onChange={onChange}
      />,
    )
    const passed = screen.getByRole('button', { name: /this week/i })
    expect(passed).toBeDisabled()
    expect(passed).toHaveTextContent('Jul 13–17 · already passed')
    fireEvent.click(passed)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('locks both weeks when the caller disables the selector', () => {
    render(
      <PlanningWeekSelector
        options={planningWeekOptions(WED)}
        value="this"
        onChange={vi.fn()}
        disabled
      />,
    )
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled()
    }
  })
})
