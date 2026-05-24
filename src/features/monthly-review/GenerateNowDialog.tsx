import { useMemo, useState } from 'react'
import { getFunctions, httpsCallable } from 'firebase/functions'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import LinearProgress from '@mui/material/LinearProgress'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { useFamilyId } from '../../core/auth/useAuth'
import { app } from '../../core/firebase/firebase'
import type { Child } from '../../core/types'

const functions = getFunctions(app)
const generateFn = httpsCallable<
  { familyId: string; childId: string; month: string },
  { reviewId: string; skipped?: boolean; reason?: string }
>(functions, 'generateMonthlyReviewNow')

interface GenerateNowDialogProps {
  open: boolean
  onClose: () => void
  childOptions: Child[]
  defaultChildId?: string
  onGenerated: (reviewId: string) => void
}

/** Build list of the last N months as YYYY-MM, newest first. */
function lastMonths(n: number): string[] {
  const out: string[] = []
  const now = new Date()
  let y = now.getFullYear()
  let m = now.getMonth() + 1 // 1-indexed
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m -= 1
    if (m < 1) {
      m = 12
      y -= 1
    }
  }
  return out
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-')
  if (!y || !m) return month
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' })
}

export function GenerateNowDialog({
  open,
  onClose,
  childOptions,
  defaultChildId,
  onGenerated,
}: GenerateNowDialogProps) {
  const familyId = useFamilyId()
  const months = useMemo(() => lastMonths(6), [])

  const [childId, setChildId] = useState(
    defaultChildId ?? childOptions[0]?.id ?? '',
  )
  const [month, setMonth] = useState(months[1] ?? months[0])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset state when the dialog opens.
  const [lastOpen, setLastOpen] = useState(open)
  if (open && !lastOpen) {
    setLastOpen(true)
    setError(null)
    if (defaultChildId) setChildId(defaultChildId)
  } else if (!open && lastOpen) {
    setLastOpen(false)
  }

  const handleGenerate = async () => {
    if (!childId || !month) return
    setGenerating(true)
    setError(null)
    try {
      const res = await generateFn({ familyId, childId, month })
      const { reviewId, skipped, reason } = res.data
      if (skipped) {
        setError(
          reason === 'published'
            ? "That month's book is already published. Unpublish it first if you want to regenerate."
            : `Skipped: ${reason ?? 'unknown reason'}`,
        )
        setGenerating(false)
        return
      }
      onGenerated(reviewId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed'
      setError(msg)
      setGenerating(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={generating ? undefined : onClose}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>Generate a Monthly Book</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <DialogContentText>
            {generating
              ? 'Reading the month’s data… writing your book…'
              : 'This takes about 30 seconds. We’ll open the book when it’s ready.'}
          </DialogContentText>

          <FormControl size="small" fullWidth disabled={generating}>
            <InputLabel id="child-label">Child</InputLabel>
            <Select
              labelId="child-label"
              label="Child"
              value={childId}
              onChange={(e) => setChildId(e.target.value)}
            >
              {childOptions.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box>
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', display: 'block', mb: 1 }}
            >
              Month
            </Typography>
            <Stack spacing={1}>
              {months.map((m) => (
                <Button
                  key={m}
                  variant={m === month ? 'contained' : 'outlined'}
                  size="small"
                  fullWidth
                  disabled={generating}
                  onClick={() => setMonth(m)}
                  sx={{ justifyContent: 'flex-start' }}
                >
                  {formatMonthLabel(m)}
                </Button>
              ))}
            </Stack>
          </Box>

          {generating && <LinearProgress />}

          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={generating}>
          Cancel
        </Button>
        <Button
          onClick={() => void handleGenerate()}
          variant="contained"
          disabled={generating || !childId || !month}
        >
          {generating ? 'Generating…' : error ? 'Try again' : 'Generate'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
