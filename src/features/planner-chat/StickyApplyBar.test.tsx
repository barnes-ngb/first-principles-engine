import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import StickyApplyBar from './StickyApplyBar'

describe('StickyApplyBar', () => {
  it('renders the Apply button (the review-phase sticky bar)', () => {
    render(<StickyApplyBar planDirty={false} onApply={vi.fn()} />)
    expect(
      screen.getByRole('button', { name: /apply this week's plan/i }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('sticky-apply-bar')).toBeInTheDocument()
  })

  it('hides the "plan changed" hint when the draft is clean', () => {
    render(<StickyApplyBar planDirty={false} onApply={vi.fn()} />)
    expect(screen.queryByText(/plan changed/i)).not.toBeInTheDocument()
  })

  it('shows the "Plan changed — apply to save" hint after an edit', () => {
    render(<StickyApplyBar planDirty onApply={vi.fn()} />)
    expect(
      screen.getByText(/plan changed — apply to save/i),
    ).toBeInTheDocument()
  })

  it('fires onApply when the button is clicked', () => {
    const onApply = vi.fn()
    render(<StickyApplyBar planDirty={false} onApply={onApply} />)
    fireEvent.click(
      screen.getByRole('button', { name: /apply this week's plan/i }),
    )
    expect(onApply).toHaveBeenCalledTimes(1)
  })
})
