import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { QUEST_EXIT_GUARD_COPY } from './questSaveCopy'
import type { QuestExitHold } from './useQuestSession'

/**
 * The door the Mine's completion exits are held at (UX-496).
 *
 * The Books editor's `UnsavedBookDialog` (UX-473) is the precedent and this
 * follows its shape deliberately: a safe default *Stay here*, which is also
 * what Escape and a backdrop tap mean; a Retry only where retrying is a real
 * move; and a separately labelled, deliberate departure that promises nothing
 * in either direction. What differs is the Mine's third state — a `conflict`,
 * where a different run already owns this id, so there is nothing to retry and
 * the honest escape is the only move left.
 *
 * It is a short kid's screen, not an explanation: every string is in
 * `questSaveCopy.ts` and held to the shared kid bar. The buttons are full-width
 * and 48px so they fit a phone and a tablet and are not for mis-hitting, and
 * the plain (not pixel) font applies — this is new child-facing text.
 */
export interface QuestExitNotice {
  title: string
  body: string
  /** What leaving does and does not promise. */
  warning: string
  /** A write is in flight right now, so there is nothing to re-ask for. */
  busy: boolean
  /** Whether a Retry door belongs on this dialog at all. */
  retryable: boolean
  /** A failure, as opposed to an ordinary wait — colour and tone follow. */
  failed: boolean
}

/**
 * The dialog's copy for the phase it is actually in.
 *
 * A hold that is merely `saving` is a WAIT and must not borrow the vocabulary
 * of a problem: no error colour, no retry, no claim that anything was lost. A
 * `conflict` is a failure but not a retryable one — offering *Try saving again*
 * there would ask the child to re-send a payload that can never land.
 */
export function questExitNotice(hold: Exclude<QuestExitHold, 'clear'>): QuestExitNotice {
  if (hold === 'saving') {
    return {
      title: QUEST_EXIT_GUARD_COPY.savingTitle,
      body: QUEST_EXIT_GUARD_COPY.savingBody,
      warning: QUEST_EXIT_GUARD_COPY.leaveWarning,
      busy: true,
      retryable: false,
      failed: false,
    }
  }
  if (hold === 'conflict') {
    return {
      title: QUEST_EXIT_GUARD_COPY.conflictTitle,
      body: QUEST_EXIT_GUARD_COPY.conflictBody,
      warning: QUEST_EXIT_GUARD_COPY.leaveWarning,
      busy: false,
      // Nothing to retry: another run owns this id. The escape is the move.
      retryable: false,
      failed: true,
    }
  }
  return {
    title: QUEST_EXIT_GUARD_COPY.failedTitle,
    body: QUEST_EXIT_GUARD_COPY.failedBody,
    warning: QUEST_EXIT_GUARD_COPY.leaveWarning,
    busy: false,
    retryable: true,
    failed: true,
  }
}

export default function QuestExitGuardDialog({
  hold,
  canRetry,
  onRetry,
  onStay,
  onLeaveAnyway,
}: {
  /** `clear` closes the door: the exit it was held for has nothing to ask. */
  hold: QuestExitHold
  /** Whether the held payload itself can still be re-sent. */
  canRetry: boolean
  onRetry: () => void
  onStay: () => void
  onLeaveAnyway: () => void
}) {
  const open = hold !== 'clear'
  const notice = questExitNotice(open ? (hold as Exclude<QuestExitHold, 'clear'>) : 'saving')
  const showRetry = notice.retryable && canRetry

  return (
    <Dialog open={open} onClose={onStay} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: '18px', lineHeight: 1.4 }} data-testid="quest-exit-guard-title">
        {notice.title}
      </DialogTitle>
      <DialogContent>
        {notice.failed ? (
          <Alert severity="error" sx={{ mb: 1, fontSize: '14px' }}>
            {notice.body}
          </Alert>
        ) : (
          <Typography
            sx={{ fontSize: '14px', lineHeight: 1.45, display: 'flex', alignItems: 'center', gap: 1 }}
          >
            {notice.busy && <CircularProgress size={16} />}
            {notice.body}
          </Typography>
        )}
        <Typography sx={{ fontSize: '14px', lineHeight: 1.45, mt: 1 }} color="text.secondary">
          {notice.warning}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 2 }}>
        <Stack spacing={1} sx={{ width: '100%' }}>
          {/* The safe default, reachable in every state — and what Escape and a
              backdrop tap mean. */}
          <Button
            onClick={onStay}
            variant="contained"
            fullWidth
            sx={{ minHeight: 48, fontSize: '14px', textTransform: 'none' }}
          >
            {QUEST_EXIT_GUARD_COPY.stay}
          </Button>
          {showRetry && (
            <Button
              onClick={onRetry}
              variant="outlined"
              fullWidth
              sx={{ minHeight: 48, fontSize: '14px', textTransform: 'none' }}
            >
              {QUEST_EXIT_GUARD_COPY.retry}
            </Button>
          )}
          <Button
            onClick={onLeaveAnyway}
            color="error"
            fullWidth
            sx={{ minHeight: 48, fontSize: '14px', textTransform: 'none' }}
          >
            {QUEST_EXIT_GUARD_COPY.leave}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  )
}
