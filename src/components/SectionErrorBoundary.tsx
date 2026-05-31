import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'

import { ErrorSource, reportError } from '../core/observability'

interface Props {
  children: ReactNode
  /** Label shown in error message, e.g. "checklist" or "quick capture" */
  section?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[SectionErrorBoundary${this.props.section ? `: ${this.props.section}` : ''}]`,
      error,
      info.componentStack,
    )
    // ARCH-11: report scrubbed telemetry so isolated section crashes aren't silent.
    void reportError({
      name: error.name,
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack ?? null,
      section: this.props.section ?? null,
      route: typeof window !== 'undefined' ? window.location.pathname : null,
      source: ErrorSource.ReactSectionBoundary,
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert
          severity="warning"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Retry
            </Button>
          }
          sx={{ my: 1 }}
        >
          {this.props.section
            ? `The ${this.props.section} section couldn't load.`
            : "This section couldn't load."}
          {' '}Tap Retry or refresh the page.
        </Alert>
      )
    }
    return this.props.children
  }
}
