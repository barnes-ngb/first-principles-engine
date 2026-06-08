import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

export interface LoadingStateProps {
  /** Optional caption shown beneath the spinner (e.g. "Loading today's log…"). */
  label?: string
  /**
   * When true, centers the spinner within a min-height block (full-section
   * loading). When false (default), renders inline — a small spinner + label
   * row suited to in-flow placement.
   */
  fullHeight?: boolean
  /** Spinner size in px. Defaults to 40 (full-height) or 20 (inline). */
  size?: number
}

/**
 * Shared loading indicator — a theme-colored `CircularProgress` with an
 * optional caption. Replaces the ~49 ad-hoc inline `<CircularProgress>` usages
 * (migrated in UI Batch 3b).
 */
export default function LoadingState({ label, fullHeight = false, size }: LoadingStateProps) {
  const spinnerSize = size ?? (fullHeight ? 40 : 20)

  if (fullHeight) {
    return (
      <Stack
        alignItems="center"
        justifyContent="center"
        spacing={2}
        sx={{ minHeight: 240, py: 4 }}
        role="status"
      >
        <CircularProgress size={spinnerSize} color="primary" />
        {label && (
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
        )}
      </Stack>
    )
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }} role="status">
      <CircularProgress size={spinnerSize} color="primary" />
      {label && (
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      )}
    </Box>
  )
}
