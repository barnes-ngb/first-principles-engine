import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'

import type { GenerationProgress as ProgressState } from './useBookGenerator'

interface Props {
  progress: ProgressState
  isLincoln?: boolean
}

export default function GenerationProgress({ progress, isLincoln }: Props) {
  const { phase, currentPage, totalPages, message, lastImageUrl } = progress

  const pct =
    phase === 'writing'
      ? 5
      : phase === 'illustrating' && totalPages > 0
        ? 10 + (currentPage / totalPages) * 80
        : phase === 'saving'
          ? 95
          : phase === 'done'
            ? 100
            : 0

  const writingDone = phase !== 'writing'
  const illustratingDone = phase === 'saving' || phase === 'done'

  return (
    <Stack
      spacing={3}
      alignItems="center"
      sx={{
        py: 4,
        px: 2,
        textAlign: 'center',
        minHeight: 300,
      }}
    >
      <Typography
        variant="h5"
        sx={{
          fontWeight: 700,
          ...(isLincoln
            ? { fontFamily: '"Press Start 2P", monospace', fontSize: '0.8rem' }
            : {}),
        }}
      >
        {isLincoln ? 'Crafting your book...' : 'Creating your book...'}
      </Typography>

      {/* Step indicators */}
      <Stack spacing={1} sx={{ width: '100%', maxWidth: 360 }}>
        <StepRow
          label="Writing your story"
          done={writingDone}
          active={phase === 'writing'}
        />
        <StepRow
          label={
            phase === 'illustrating'
              ? `Illustrating page ${currentPage} of ${totalPages}`
              : 'Illustrating pages'
          }
          done={illustratingDone}
          active={phase === 'illustrating'}
        />
        <StepRow
          label="Saving your book"
          done={phase === 'done'}
          active={phase === 'saving'}
        />
      </Stack>

      {/* Progress bar */}
      {phase !== 'error' && phase !== 'done' && (
        <Box sx={{ width: '100%', maxWidth: 360 }}>
          <LinearProgress
            variant="determinate"
            value={pct}
            sx={{ height: 8, borderRadius: 4 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
            {message}
          </Typography>
        </Box>
      )}

      {/* Preview of last completed illustration */}
      {lastImageUrl && phase === 'illustrating' && (
        <Box
          component="img"
          src={lastImageUrl}
          alt="Last generated illustration"
          sx={{
            maxWidth: 200,
            maxHeight: 200,
            borderRadius: 2,
            boxShadow: 2,
            opacity: 0.9,
          }}
        />
      )}

      {/* Done state */}
      {phase === 'done' && (
        <Stack alignItems="center" spacing={1}>
          <CheckCircleIcon sx={{ fontSize: 48, color: 'success.main' }} />
          <Typography variant="h6" color="success.main">
            Your book is ready!
          </Typography>
        </Stack>
      )}

      {/* Error state */}
      {phase === 'error' && (
        <Stack alignItems="center" spacing={1}>
          <ErrorOutlineIcon sx={{ fontSize: 48, color: 'error.main' }} />
          <Typography variant="body1" color="error.main">
            {message}
          </Typography>
        </Stack>
      )}
    </Stack>
  )
}

function StepRow({
  label,
  done,
  active,
}: {
  label: string
  done: boolean
  active: boolean
}) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      {done ? (
        <CheckCircleIcon sx={{ fontSize: 20, color: 'success.main' }} />
      ) : (
        <Box
          sx={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            border: '2px solid',
            borderColor: active ? 'primary.main' : 'text.disabled',
            bgcolor: active ? 'primary.50' : 'transparent',
          }}
        />
      )}
      <Typography
        variant="body2"
        sx={{
          color: done ? 'success.main' : active ? 'text.primary' : 'text.disabled',
          fontWeight: active ? 600 : 400,
        }}
      >
        {label}
      </Typography>
    </Stack>
  )
}
