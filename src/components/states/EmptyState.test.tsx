import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import EmptyState from './EmptyState'

describe('EmptyState', () => {
  it('renders the title', () => {
    render(<EmptyState title="Nothing here yet" />)
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument()
  })

  it('renders the optional description', () => {
    render(<EmptyState title="Nothing here yet" description="Make your first one!" />)
    expect(screen.getByText('Make your first one!')).toBeInTheDocument()
  })

  it('renders icon and action when provided', () => {
    render(
      <EmptyState
        title="Nothing here yet"
        icon={<svg data-testid="empty-icon" />}
        action={<button type="button">Make one</button>}
      />,
    )
    expect(screen.getByTestId('empty-icon')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Make one' })).toBeInTheDocument()
  })
})
