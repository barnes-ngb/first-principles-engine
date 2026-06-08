import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Button from '@mui/material/Button'

export interface ErrorStateProps {
  /**
   * Friendly, non-alarming message. If omitted, a calm default is shown. When
   * `error` is also provided, its `.message` is appended as quiet detail.
   */
  message?: string
  /** Optional retry handler — renders a "Try again" button when provided. */
  onRetry?: () => void
  /** Optional underlying error; its `.message` is shown as muted detail. */
  error?: Error | null
}

const DEFAULT_MESSAGE = 'Something went wrong — let’s try that again.'

/**
 * Shared error-state — a calm MUI `Alert severity="error"` with a friendly
 * default message and an optional Retry button. Tone is deliberately
 * non-alarming because these surface on kid screens too. Replaces the
 * split-across-`Alert`/`Typography` error displays (migrated in UI Batch 3b).
 */
export default function ErrorState({ message, onRetry, error }: ErrorStateProps) {
  const detail = error?.message
  return (
    <Alert
      severity="error"
      action={
        onRetry ? (
          <Button color="inherit" size="small" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    >
      <AlertTitle sx={{ mb: detail ? 0.5 : 0 }}>{message ?? DEFAULT_MESSAGE}</AlertTitle>
      {detail && detail !== message ? detail : null}
    </Alert>
  )
}
