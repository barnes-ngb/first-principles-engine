import { useCallback, useRef } from 'react'

import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import {
  QUEST_EXIT_GUARD_COPY,
  questExitGenericNotice,
  questExitNotice,
  type QuestExitPhase,
} from './questSaveCopy'

/**
 * The door the Mine's own exits are held at (UX-496).
 *
 * The Books editor's `UnsavedBookDialog` (UX-473) is the precedent and this
 * follows its shape deliberately: a safe default *Stay here*, which is also
 * what Escape and a backdrop tap mean; a Retry only where retrying is a real
 * move; and a separately labelled, deliberate departure that promises nothing
 * in either direction. What differs is the Mine's third state — a `conflict`,
 * where a different run already owns this id, so there is nothing to retry and
 * the honest escape is the only move left.
 *
 * It holds and reads NOTHING. `phase` is derived by the page from its own
 * render state, so an acknowledged save closes this door by making `phase`
 * null — the child's next exit is a fresh tap — and the page's handlers do
 * their own synchronous re-check before anything happens. *Stay here* takes
 * focus on open, because the safe action is the one a stray Enter should hit.
 *
 * Short kid copy, all of it in `questSaveCopy.ts` and held to the shared kid
 * bar. Buttons are full-width and 48px so they fit a phone and a tablet.
 */
export default function QuestExitGuardDialog({
  phase,
  generic = false,
  canRetry,
  onRetry,
  onStay,
  onLeaveAnyway,
}: {
  /** The save phase holding the departure, or null for no open door. */
  phase: QuestExitPhase | null
  /**
   * The held notice is hidden from whoever is looking — a sibling profile, a
   * foreign family. The door still opens, because a held exit that showed
   * nothing was an exit swallowed; it just says nothing about the owner, the
   * phase or his Retry. Passed, never inferred: the page knows who is looking.
   */
  generic?: boolean
  /** Whether the held payload itself can still be re-sent. */
  canRetry: boolean
  onRetry: () => void
  onStay: () => void
  onLeaveAnyway: () => void
}) {
  const stayRef = useRef<HTMLButtonElement | null>(null)

  /**
   * `autoFocus` alone is not enough in a real browser: MUI's focus trap takes
   * focus for the dialog container as it mounts and the open transition can
   * land after that, leaving the container focused instead of the safe action.
   * So once the transition has ENTERED — the trap and the transition both
   * settled — the stay button is focused outright. Guarded because the door can
   * already be closed by then: a save that acknowledged mid-transition unmounts
   * this, and a stale transition's callback would hold a detached button.
   */
  const focusStay = useCallback(() => {
    const stay = stayRef.current
    if (!stay?.isConnected) return
    stay.focus()
  }, [])

  // Closed is the ordinary state, and then this renders nothing at all.
  if (!phase) return null
  const notice = generic ? questExitGenericNotice() : questExitNotice(phase)
  // `questExitGenericNotice` is not retryable, so the `generic` door offers no
  // Retry whatever `canRetry` says — the held payload is not this viewer's.
  const showRetry = notice.retryable && canRetry

  return (
    <Dialog
      open
      onClose={onStay}
      maxWidth="xs"
      fullWidth
      TransitionProps={{ onEntered: focusStay }}
    >
      <DialogTitle sx={{ fontSize: '18px', lineHeight: 1.4 }}>{notice.title}</DialogTitle>
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
          {/* The safe default, reachable in every state, focused on open — and
              what Escape and a backdrop tap mean. */}
          <Button
            autoFocus
            ref={stayRef}
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
