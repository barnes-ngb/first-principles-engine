/**
 * Where a Dad Lab upload says how it is going and how it ended (FIX-269 /
 * UX-461). It is presentational only: it holds no state, reads no Firestore and
 * writes nothing. Its words come from `labUploadCopy.ts`.
 *
 * An in-flight upload shows a spinner, a line naming it and, when the host
 * passes `onCancel`, a Cancel button. A finished upload that left no file
 * shows its sentence, a Try again that re-sends the same file, and a Dismiss.
 */
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import {
  LAB_UPLOAD_CANCEL_LABEL,
  LAB_UPLOAD_DISMISS_LABEL,
  LAB_UPLOAD_RETRY_LABEL,
  LabUploadFailure,
  labUploadFailureLine,
  labUploadInFlightLine,
  type LabUploadAudience,
} from './labUploadCopy'
import type { LabUploadFailed, LabUploadInFlight } from './useLabUploads'

interface LabUploadStatusProps<T> {
  audience: LabUploadAudience
  inFlight: LabUploadInFlight<T>[]
  failures: LabUploadFailed<T>[]
  /** Omit to show no Cancel button. */
  onCancel?: (id: number) => void
  onRetry: (failed: LabUploadFailed<T>) => void
  onDismiss: (id: number) => void
}

export default function LabUploadStatus<T>({
  audience,
  inFlight,
  failures,
  onCancel,
  onRetry,
  onDismiss,
}: LabUploadStatusProps<T>) {
  if (inFlight.length === 0 && failures.length === 0) return null
  return (
    <Stack spacing={1} data-testid="lab-upload-status">
      {inFlight.map((u) => (
        <Stack
          key={`up-${u.id}`}
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ px: 1.5, py: 1, borderRadius: 1, bgcolor: 'action.hover' }}
        >
          <CircularProgress size={16} />
          <Typography variant="body2" sx={{ flexGrow: 1 }}>
            {labUploadInFlightLine(audience, u.job.subject)}
          </Typography>
          {onCancel && (
            <Button size="small" onClick={() => onCancel(u.id)}>
              {LAB_UPLOAD_CANCEL_LABEL}
            </Button>
          )}
        </Stack>
      ))}
      {failures.map((f) => (
        <Alert
          key={`fail-${f.id}`}
          severity={f.failure === LabUploadFailure.Failed ? 'error' : 'warning'}
          action={
            <Stack direction="row" spacing={0.5}>
              <Button color="inherit" size="small" onClick={() => onRetry(f)}>
                {LAB_UPLOAD_RETRY_LABEL}
              </Button>
              <Button color="inherit" size="small" onClick={() => onDismiss(f.id)}>
                {LAB_UPLOAD_DISMISS_LABEL}
              </Button>
            </Stack>
          }
        >
          {labUploadFailureLine(audience, f.job.subject, f.failure)}
        </Alert>
      ))}
    </Stack>
  )
}
