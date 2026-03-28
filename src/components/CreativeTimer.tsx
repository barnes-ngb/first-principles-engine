import { useCallback, useState } from 'react'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import PaletteIcon from '@mui/icons-material/Palette'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import TimerIcon from '@mui/icons-material/Timer'

import { useFamilyId } from '../core/auth/useAuth'
import { useActiveChild } from '../core/hooks/useActiveChild'
import { useCreativeTimer } from '../core/hooks/useCreativeTimer'
import { SubjectBucket } from '../core/types/enums'

const SUBJECT_OPTIONS = [
  { label: 'Art', bucket: SubjectBucket.Art, description: 'Drawing, painting, crafting' },
  { label: 'Language Arts', bucket: SubjectBucket.LanguageArts, description: 'Writing stories, book creation' },
  { label: 'Math', bucket: SubjectBucket.Math, description: 'Counting, pricing, inventory' },
  { label: 'Practical Arts', bucket: SubjectBucket.Other, description: 'Building, assembling, making' },
] as const

interface CreativeTimerProps {
  /** Default subject bucket for this page context */
  defaultSubject?: SubjectBucket
  /** Description to auto-fill based on page context */
  defaultDescription?: string
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function subjectLabel(bucket: SubjectBucket): string {
  return SUBJECT_OPTIONS.find((o) => o.bucket === bucket)?.label ?? bucket
}

export default function CreativeTimer({
  defaultSubject = SubjectBucket.Art,
  defaultDescription = 'Creative time',
}: CreativeTimerProps) {
  const familyId = useFamilyId()
  const { activeChildId } = useActiveChild()

  const {
    state,
    startTimer,
    stopTimer,
    cancelTimer,
    hasPersistedTimer,
    resumePersistedTimer,
    dismissPersistedTimer,
  } = useCreativeTimer(familyId, activeChildId)

  const [selectedSubject, setSelectedSubject] = useState(defaultSubject)
  const [snack, setSnack] = useState<{ message: string; severity: 'success' | 'info' } | null>(null)
  const [saving, setSaving] = useState(false)

  const handleStart = useCallback(() => {
    const option = SUBJECT_OPTIONS.find((o) => o.bucket === selectedSubject)
    const desc = option ? `${defaultDescription} (${option.label})` : defaultDescription
    startTimer(selectedSubject, desc)
  }, [selectedSubject, defaultDescription, startTimer])

  const handleStop = useCallback(async () => {
    setSaving(true)
    try {
      const result = await stopTimer()
      if (result.saved) {
        setSnack({
          message: `${result.minutes} min logged as ${subjectLabel(state.subject!)}`,
          severity: 'success',
        })
      } else {
        setSnack({
          message: 'Keep creating! Timer saves after 5 minutes.',
          severity: 'info',
        })
      }
    } finally {
      setSaving(false)
    }
  }, [stopTimer, state.subject])

  // Resume prompt for persisted timer
  if (hasPersistedTimer && !state.isRunning) {
    return (
      <Box
        sx={{
          px: 2,
          py: 1,
          bgcolor: 'info.50',
          borderBottom: '1px solid',
          borderColor: 'info.200',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        <TimerIcon fontSize="small" color="info" />
        <Typography variant="body2" sx={{ flex: 1 }}>
          You were creating — want to continue?
        </Typography>
        <Button size="small" variant="contained" color="info" onClick={resumePersistedTimer}>
          Resume
        </Button>
        <Button size="small" onClick={dismissPersistedTimer}>
          Dismiss
        </Button>
      </Box>
    )
  }

  // Running state
  if (state.isRunning) {
    return (
      <>
        <Box
          sx={{
            px: 2,
            py: 1,
            bgcolor: 'success.50',
            borderBottom: '1px solid',
            borderColor: 'success.200',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <TimerIcon fontSize="small" color="success" />
          <Typography
            variant="body2"
            sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, minWidth: 48 }}
          >
            {formatElapsed(state.elapsed)}
          </Typography>
          <Chip
            label={subjectLabel(state.subject!)}
            size="small"
            sx={{ height: 24, fontSize: '0.75rem' }}
          />
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            variant="contained"
            color="error"
            startIcon={<StopIcon />}
            onClick={() => { void handleStop() }}
            disabled={saving}
            sx={{ minHeight: 32 }}
          >
            {saving ? 'Saving...' : 'Done'}
          </Button>
          <Button size="small" onClick={cancelTimer} sx={{ minHeight: 32 }}>
            Cancel
          </Button>
        </Box>

        <Snackbar
          open={!!snack}
          autoHideDuration={4000}
          onClose={() => setSnack(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            severity={snack?.severity ?? 'success'}
            onClose={() => setSnack(null)}
            variant="filled"
          >
            {snack?.message}
          </Alert>
        </Snackbar>
      </>
    )
  }

  // Idle state
  return (
    <>
      <Collapse in>
        <Box
          sx={{
            px: 2,
            py: 1,
            bgcolor: 'grey.50',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <PaletteIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
              Track time:
            </Typography>
            {SUBJECT_OPTIONS.map((opt) => (
              <Chip
                key={opt.bucket}
                label={opt.label}
                size="small"
                variant={selectedSubject === opt.bucket ? 'filled' : 'outlined'}
                color={selectedSubject === opt.bucket ? 'primary' : 'default'}
                onClick={() => setSelectedSubject(opt.bucket)}
                sx={{ height: 28 }}
              />
            ))}
            <Button
              size="small"
              variant="contained"
              startIcon={<PlayArrowIcon />}
              onClick={handleStart}
              sx={{ minHeight: 32, ml: 0.5 }}
            >
              Start
            </Button>
          </Stack>
        </Box>
      </Collapse>

      <Snackbar
        open={!!snack}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snack?.severity ?? 'success'}
          onClose={() => setSnack(null)}
          variant="filled"
        >
          {snack?.message}
        </Alert>
      </Snackbar>
    </>
  )
}
