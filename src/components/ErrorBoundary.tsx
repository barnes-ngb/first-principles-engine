import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'

import { ErrorSource, reportError } from '../core/observability'
import { isTransientConnectivityError } from '../core/firebase/transientRetry'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  // FEAT-110: a transient connectivity blip (mobile backgrounds the tab → the
  // Firestore socket drops → an in-flight read rejects "client is offline") is
  // shown as a gentle "reconnecting" state, not a crash, and auto-clears when
  // the tab returns to the foreground. Genuine faults keep the full crash screen.
  transient: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, transient: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      transient: isTransientConnectivityError(error),
    }
  }

  componentDidMount() {
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection)
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
  }

  componentWillUnmount() {
    window.removeEventListener(
      'unhandledrejection',
      this.handleUnhandledRejection,
    )
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, info.componentStack)
    // ARCH-11: report scrubbed crash telemetry. React render errors don't reach
    // window.onerror, so this boundary is the only capture point for them.
    void reportError({
      name: error.name,
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack ?? null,
      route: typeof window !== 'undefined' ? window.location.pathname : null,
      source: ErrorSource.ReactErrorBoundary,
    })
  }

  handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    event.preventDefault()
    const error =
      event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason ?? 'Unhandled promise rejection'))
    const transient = isTransientConnectivityError(error)
    // A transient blip is expected on mobile (backgrounded tab); log at warn,
    // not error, and show the gentle reconnect state rather than a crash.
    if (transient) console.warn('Transient connectivity blip:', error)
    else console.error('Unhandled promise rejection:', error)
    this.setState({ hasError: true, error, transient })
  }

  // FEAT-110: returning to the foreground is the natural "retry" — mobile
  // suspends a backgrounded tab, so the socket reconnects on return. Auto-clear
  // a transient error boundary then instead of leaving a screen to dismiss.
  handleVisibilityChange = () => {
    if (
      document.visibilityState === 'visible' &&
      this.state.hasError &&
      this.state.transient
    ) {
      this.handleRetry()
    }
  }

  handleReload = () => {
    window.location.reload()
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, transient: false })
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            minHeight: '60vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            px: 3,
            textAlign: 'center',
          }}
        >
          <Typography variant="h5" fontWeight={600}>
            {this.state.transient ? 'Reconnecting…' : 'Something went wrong'}
          </Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 480 }}>
            {this.state.transient
              ? 'You went offline for a moment. Your work is safe — this will clear itself when you’re back online, or tap Try Again.'
              : 'An unexpected error occurred. You can try again or reload the page.'}
          </Typography>
          {this.state.error && (
            <Typography
              variant="body2"
              sx={{
                mt: 1,
                p: 2,
                borderRadius: 1,
                bgcolor: 'action.hover',
                fontFamily: 'monospace',
                maxWidth: 560,
                wordBreak: 'break-word',
              }}
            >
              {this.state.error.message}
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
            <Button variant="contained" onClick={this.handleRetry}>
              Try Again
            </Button>
            <Button variant="outlined" onClick={this.handleReload}>
              Reload Page
            </Button>
          </Box>
          <Link href="/settings" underline="hover" sx={{ mt: 1 }}>
            Go to Settings
          </Link>
        </Box>
      )
    }

    return this.props.children
  }
}
