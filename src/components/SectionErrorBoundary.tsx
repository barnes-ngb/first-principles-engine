import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'

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
