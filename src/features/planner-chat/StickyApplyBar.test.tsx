import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import StickyApplyBar from './StickyApplyBar'

const LABEL = 'Apply to Sep 7–11'

describe('StickyApplyBar', () => {
  it('renders the Apply button (the review-phase sticky bar)', () => {
    render(<StickyApplyBar planDirty={false} onApply={vi.fn()} applyLabel={LABEL} />)
    expect(screen.getByRole('button', { name: LABEL })).toBeInTheDocument()
    expect(screen.getByTestId('sticky-apply-bar')).toBeInTheDocument()
  })

  // FEAT-196: the biggest write in the app names its target ON the control.
  it('names the week it writes to, rather than a possessive', () => {
    render(<StickyApplyBar planDirty={false} onApply={vi.fn()} applyLabel={LABEL} />)
    expect(screen.getByRole('button', { name: /sep 7–11/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /this week's plan/i })).not.toBeInTheDocument()
  })

  it('hides the "plan changed" hint when the draft is clean', () => {
    render(<StickyApplyBar planDirty={false} onApply={vi.fn()} applyLabel={LABEL} />)
    expect(screen.queryByText(/plan changed/i)).not.toBeInTheDocument()
  })

  it('shows the "Plan changed — apply to save" hint after an edit', () => {
    render(<StickyApplyBar planDirty onApply={vi.fn()} applyLabel={LABEL} />)
    expect(
      screen.getByText(/plan changed — apply to save/i),
    ).toBeInTheDocument()
  })

  it('fires onApply when the button is clicked', () => {
    const onApply = vi.fn()
    render(<StickyApplyBar planDirty={false} onApply={onApply} applyLabel={LABEL} />)
    fireEvent.click(screen.getByRole('button', { name: LABEL }))
    expect(onApply).toHaveBeenCalledTimes(1)
  })
})
