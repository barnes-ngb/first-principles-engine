import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { SaveState } from '../../components/SaveIndicator'
import {
  DEPARTURE_LEAVE_LABEL,
  DEPARTURE_RETRY_LABEL,
  DEPARTURE_STAY_LABEL,
  departureNotice,
} from './unsavedBookDeparture'

interface UnsavedBookDialogProps {
  open: boolean
  saveState: SaveState
  saveErrorMessage?: string | null
  onRetry: () => void
  onStay: () => void
  onLeaveAnyway: () => void
}

/**
 * The door the departure guard holds (UX-473).
 *
 * Two faces, because a held departure has two meanings. Over a write that is
 * simply still going it is a QUIET wait — a saving line, no error colour, no
 * Retry, and it closes itself the moment the save is confirmed. Over a write
 * that FAILED it is the recovery door: the actual error, and *Try again*.
 *
 * *Stay here* is reachable in every state, including mid-write, and is also
 * what a backdrop tap and Escape mean. *Leave anyway* is reachable in every
 * state too, including mid-write, and that is a correction (PR #1921): an
 * in-flight write is not a bounded wait. Offline, Firestore's `setDoc` promise
 * stays pending until the backend is reachable, so withholding the leave door
 * while `busy` left a kid with no way out at all — *Stay here* only dismisses
 * the dialog and the next tap is held again. So the door stays open, and the
 * dialog's own copy is what makes the choice informed rather than silent: the
 * latest edits MAY not be saved, and a write already on its way may still
 * finish. It is still its own labelled, deliberate tap — nothing times out,
 * nothing escapes on its own, and the guard itself is unchanged. Buttons are
 * full-width and 48px on a phone: these are the taps that decide whether an
 * edit survives, and they are not for mis-hitting.
 */
export default function UnsavedBookDialog({
  open,
  saveState,
  saveErrorMessage,
  onRetry,
  onStay,
  onLeaveAnyway,
}: UnsavedBookDialogProps) {
  // `hasUnsavedEdits: true` is a statement of fact, not an assumption: this
  // dialog is only reachable through a departure the guard held, and the guard
  // holds nothing unless an edit is outstanding.
  const notice = departureNotice({ saveState, hasUnsavedEdits: true }, saveErrorMessage)

  return (
    <Dialog open={open} onClose={onStay} maxWidth="xs" fullWidth>
      <DialogTitle>{notice.title}</DialogTitle>
      <DialogContent>
        {notice.stage === 'failed' ? (
          <Alert severity="error" sx={{ mb: 1 }}>
            {notice.detail}
          </Alert>
        ) : (
          <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {notice.busy && <CircularProgress size={16} />}
            {notice.detail}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {notice.reassurance}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 2 }}>
        <Stack spacing={1} sx={{ width: '100%' }}>
          <Button
            onClick={onStay}
            variant={notice.retryable ? 'outlined' : 'contained'}
            fullWidth
            sx={{ minHeight: 48 }}
          >
            {DEPARTURE_STAY_LABEL}
          </Button>
          {notice.retryable && (
            <Button onClick={onRetry} variant="contained" fullWidth sx={{ minHeight: 48 }}>
              {DEPARTURE_RETRY_LABEL}
            </Button>
          )}
          <Button
            onClick={onLeaveAnyway}
            color="error"
            fullWidth
            sx={{ minHeight: 48 }}
          >
            {DEPARTURE_LEAVE_LABEL}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  )
}
