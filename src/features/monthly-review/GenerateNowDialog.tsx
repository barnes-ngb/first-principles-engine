import { useEffect, useMemo, useRef, useState } from 'react'
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
import { useMonthlyReview } from '../../core/hooks/useMonthlyReviews'
import type { Child } from '../../core/types'
import {
  isDeadlineExceeded,
  isDraftReady,
  monthlyReviewDocId,
} from './monthlyDraftWatch'

/**
 * Must match `generateMonthlyReviewNow`'s `timeoutSeconds: 540`
 * (`functions/src/ai/monthlyReview.ts`). The Firebase SDK default is 70s,
 * which any month with real data blows past — the phone reported
 * `deadline-exceeded` while the server was still writing the book.
 */
const GENERATE_TIMEOUT_MS = 540_000

const functions = getFunctions(app)
const generateFn = httpsCallable<
  { familyId: string; childId: string; month: string },
  { reviewId: string; skipped?: boolean; reason?: string }
>(functions, 'generateMonthlyReviewNow', { timeout: GENERATE_TIMEOUT_MS })

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
  /**
   * Set when the client gave up before the server did. The call is gone, but
   * the function is still running and will write the doc — so we watch for it
   * rather than telling the parent their book failed.
   */
  const [waiting, setWaiting] = useState<{
    reviewId: string
    tappedAt: string
  } | null>(null)
  /** `generatedAt` on the first snapshot after `waiting` was set. */
  const baselineRef = useRef<{
    reviewId: string
    generatedAt: string | null
  } | null>(null)

  const {
    review: watchedReview,
    loading: watchLoading,
    error: watchError,
  } = useMonthlyReview(familyId, waiting?.reviewId)

  /* eslint-disable react-hooks/set-state-in-effect -- Reacting to an external
     Firestore subscription: `useMonthlyReview` reports snapshots as render
     values rather than a callback, so the only place to judge one is here.
     Each branch is self-terminating (it clears `waiting`), so no cascade. */
  useEffect(() => {
    if (!waiting) {
      baselineRef.current = null
      return
    }
    if (watchError) {
      setWaiting(null)
      setGenerating(false)
      setError(
        'We lost track of the book while it was being written. Check the list of books below in a few minutes.',
      )
      return
    }
    if (watchLoading) return

    const current = watchedReview?.generatedAt ?? null
    if (baselineRef.current?.reviewId !== waiting.reviewId) {
      baselineRef.current = { reviewId: waiting.reviewId, generatedAt: current }
    }
    if (
      isDraftReady({
        baseline: baselineRef.current.generatedAt,
        current,
        tappedAt: waiting.tappedAt,
      })
    ) {
      const { reviewId } = waiting
      baselineRef.current = null
      setWaiting(null)
      setGenerating(false)
      onGenerated(reviewId)
    }
  }, [waiting, watchedReview, watchLoading, watchError, onGenerated])
  /* eslint-enable react-hooks/set-state-in-effect */

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
    const tappedAt = new Date().toISOString()
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
      // Only the client timed out — the function has its own 540s and is very
      // likely still writing. Watch the doc instead of rendering a red failure.
      if (isDeadlineExceeded(err)) {
        setWaiting({ reviewId: monthlyReviewDocId(childId, month), tappedAt })
        return
      }
      const msg = err instanceof Error ? err.message : 'Generation failed'
      setError(msg)
      setGenerating(false)
    }
  }

  // Waiting is a passive read — closing just stops watching. The server keeps
  // writing and the book shows up in the list below.
  const canClose = !generating || !!waiting
  const handleClose = () => {
    baselineRef.current = null
    setWaiting(null)
    setGenerating(false)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={canClose ? handleClose : undefined}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>Generate a Monthly Book</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <DialogContentText>
            {waiting
              ? 'Still working — the book will open when it’s ready. You can close this and it will keep going.'
              : generating
                ? 'Reading the month’s data… writing your book…'
                : 'A month with a lot in it can take a few minutes. We’ll open the book when it’s ready.'}
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
        <Button onClick={handleClose} disabled={!canClose}>
          {waiting ? 'Close' : 'Cancel'}
        </Button>
        <Button
          onClick={() => void handleGenerate()}
          variant="contained"
          disabled={generating || !childId || !month}
        >
          {waiting
            ? 'Still working…'
            : generating
              ? 'Generating…'
              : error
                ? 'Try again'
                : 'Generate'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
