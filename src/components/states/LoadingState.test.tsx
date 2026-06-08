import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import LoadingState from './LoadingState'

describe('LoadingState', () => {
  it('renders a progressbar', () => {
    render(<LoadingState />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('shows the label when provided', () => {
    render(<LoadingState label="Loading today’s log…" />)
    expect(screen.getByText('Loading today’s log…')).toBeInTheDocument()
  })

  it('omits the caption when no label is given', () => {
    const { container } = render(<LoadingState />)
    expect(container.querySelector('p')).toBeNull()
  })

  it('renders in full-height mode', () => {
    render(<LoadingState fullHeight label="Loading…" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })
})
