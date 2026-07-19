import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'

import ErrorBoundary from './ErrorBoundary'

// The boundary reports scrubbed telemetry via the observability barrel; stub it
// so tests don't touch Firestore.
vi.mock('../core/observability', () => ({
  ErrorSource: { ReactErrorBoundary: 'react-error-boundary' },
  reportError: vi.fn(),
}))

function makeError(message: string, code?: string): Error {
  const e = new Error(message) as Error & { code?: string }
  if (code) e.code = code
  return e
}

/** Dispatch a global unhandledrejection the boundary listens for. */
function rejectGlobally(error: Error): void {
  act(() => {
    const event = new Event('unhandledrejection') as Event & { reason?: unknown }
    Object.defineProperty(event, 'reason', { value: error, configurable: true })
    window.dispatchEvent(event)
  })
}

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    configurable: true,
  })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

describe('ErrorBoundary (FEAT-110 transient connectivity)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    setVisibility('visible')
  })

  it('renders children on the success path (no error)', () => {
    render(
      <ErrorBoundary>
        <div>planner content</div>
      </ErrorBoundary>,
    )
    expect(screen.getByText('planner content')).toBeInTheDocument()
  })

  it('shows the gentle reconnecting state (not a crash) for a transient offline rejection', () => {
    render(
      <ErrorBoundary>
        <div>planner content</div>
      </ErrorBoundary>,
    )

    rejectGlobally(
      makeError('Failed to get document because the client is offline.', 'unavailable'),
    )

    expect(screen.getByText('Reconnecting…')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
  })

  it('auto-clears the transient boundary when the tab returns to the foreground', () => {
    render(
      <ErrorBoundary>
        <div>planner content</div>
      </ErrorBoundary>,
    )

    rejectGlobally(
      makeError('Failed to get document because the client is offline.', 'unavailable'),
    )
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument()

    // Returning to the foreground retries — the boundary clears, children show again.
    setVisibility('visible')

    expect(screen.queryByText('Reconnecting…')).not.toBeInTheDocument()
    expect(screen.getByText('planner content')).toBeInTheDocument()
  })

  it('escalates a genuine permission-denied error to the full crash screen and does NOT auto-clear on foreground', () => {
    render(
      <ErrorBoundary>
        <div>planner content</div>
      </ErrorBoundary>,
    )

    rejectGlobally(makeError('Missing or insufficient permissions.', 'permission-denied'))

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.queryByText('Reconnecting…')).not.toBeInTheDocument()

    // A foreground flip must NOT dismiss a genuine error.
    setVisibility('visible')
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })
})
