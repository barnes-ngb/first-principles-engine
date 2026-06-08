import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ErrorState from './ErrorState'

describe('ErrorState', () => {
  it('shows a friendly default message', () => {
    render(<ErrorState />)
    expect(screen.getByText(/let’s try that again/i)).toBeInTheDocument()
  })

  it('shows a custom message', () => {
    render(<ErrorState message="Could not load books." />)
    expect(screen.getByText('Could not load books.')).toBeInTheDocument()
  })

  it('appends the error detail when distinct from the message', () => {
    render(<ErrorState message="Could not load books." error={new Error('network timeout')} />)
    expect(screen.getByText('network timeout')).toBeInTheDocument()
  })

  it('fires onRetry when the retry button is clicked', () => {
    const onRetry = vi.fn()
    render(<ErrorState onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('omits the retry button when no handler is given', () => {
    render(<ErrorState />)
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull()
  })
})
