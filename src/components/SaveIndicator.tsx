import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface SaveIndicatorProps {
  state: SaveState
  /** When state is 'error', show the actual error message instead of generic "Save failed". */
  errorMessage?: string | null
}

export default function SaveIndicator({ state, errorMessage }: SaveIndicatorProps) {
  if (state === 'idle') return null

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1.5,
        py: 0.5,
        borderRadius: 1,
        bgcolor: 'action.hover',
        transition: 'opacity 0.2s ease',
        ...(state === 'error' ? { maxWidth: '100%', flexWrap: 'wrap' } : {}),
      }}
    >
      {state === 'saving' && (
        <>
          <CircularProgress size={14} />
          <Typography variant="caption" color="text.secondary">
            Saving...
          </Typography>
        </>
      )}
      {state === 'saved' && (
        <>
          <CheckCircleOutlineIcon sx={{ fontSize: 16, color: 'success.main' }} />
          <Typography variant="caption" color="success.main">
            Saved
          </Typography>
        </>
      )}
      {state === 'error' && (
        <>
          <ErrorOutlineIcon sx={{ fontSize: 16, color: 'error.main' }} />
          <Typography variant="caption" color="error.main" sx={{ wordBreak: 'break-word' }}>
            {errorMessage || 'Save failed'}
          </Typography>
        </>
      )}
    </Box>
  )
}
