import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, info.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
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
            Something went wrong
          </Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 480 }}>
            An unexpected error occurred. You can try again or reload the page.
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
        </Box>
      )
    }

    return this.props.children
  }
}
