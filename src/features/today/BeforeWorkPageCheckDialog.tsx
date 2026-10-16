/**
 * The before-work page check, on screen.
 *
 * Three states, one at a time, on a phone-width sheet:
 *
 *  - **before the photo** — the disclosure, in full, ABOVE the two buttons.
 *    A parent reads what happens to the picture and what the call costs before
 *    the camera opens, not after;
 *  - **while it runs** — one line and a Stop, whose copy says what stopping
 *    actually does (`BEFORE_WORK_CANCEL_NOTICE`);
 *  - **the answer** — the photo, the subject/topic, the tentative verdict, the
 *    reason, the practical adaptation, and the uncertainty line.
 *
 * ── The actions, and why there are only two ──────────────────────────────────
 * **Close** and **Check another page**. There is no *Add to plan*, no *Skip
 * this lesson*, no *Update position*, no *Accept skip*, no *Mark complete* and
 * no mastery control, because a page nobody has done is not evidence about the
 * child and every one of those buttons writes a record that says it is. The
 * retrospective door still has them; this one is advice, and it ends when the
 * parent has read it.
 */

import CloseIcon from '@mui/icons-material/Close'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useRef } from 'react'

import {
  BEFORE_WORK_CANCEL_NOTICE,
  BEFORE_WORK_DISCLOSURE,
  BeforeWorkCheckStatus,
  BeforeWorkSuitability,
  type BeforeWorkCheckSummary,
} from './beforeWorkPageCheck'

export interface BeforeWorkPageCheckDialogProps {
  open: boolean
  /** The child the header named. Used in the title only. */
  childName: string
  status: BeforeWorkCheckStatus
  summary: BeforeWorkCheckSummary | null
  photoPreviewUrl: string | null
  /** The planned row this was opened from, when it was. */
  itemLabel: string | null
  cancelled: boolean
  /**
   * The controller's identity for the live family / child / day / capability.
   *
   * Used twice, both deliberate: as the file inputs' React `key`, so a change
   * **retires the old input element** instead of leaving it listening with the
   * native picker open over it; and captured when the picker is opened, so the
   * file it eventually delivers is bound to the identity it was opened under.
   */
  selectionToken: string
  onPick: (file: File, token: string) => void
  onCancel: () => void
  /** Drop the answer, stay open, go back to the disclosure + buttons. */
  onRetry: () => void
  onClose: () => void
}

/** The verdict's colour. Advice, so nothing reads as a pass or a fail mark. */
const TONE: Record<BeforeWorkSuitability, 'info' | 'success' | 'warning'> = {
  [BeforeWorkSuitability.Workable]: 'success',
  [BeforeWorkSuitability.Easy]: 'info',
  [BeforeWorkSuitability.NeedsTweak]: 'warning',
  [BeforeWorkSuitability.Stretch]: 'warning',
  [BeforeWorkSuitability.Inconclusive]: 'info',
}

export default function BeforeWorkPageCheckDialog({
  open,
  childName,
  status,
  summary,
  photoPreviewUrl,
  itemLabel,
  cancelled,
  selectionToken,
  onPick,
  onCancel,
  onRetry,
  onClose,
}: BeforeWorkPageCheckDialogProps) {
  const cameraRef = useRef<HTMLInputElement | null>(null)
  const uploadRef = useRef<HTMLInputElement | null>(null)
  /**
   * The identity the picker now open was opened under.
   *
   * A native picker is a modal OUTSIDE the page: it stays open while the shell
   * switches child, and then fires `change` on whatever input is still there.
   * The token is captured at the tap and handed back with the file, so the
   * controller can refuse a file chosen for a child who is no longer on screen.
   */
  const openedUnder = useRef(selectionToken)

  const openPicker = (input: HTMLInputElement | null) => {
    openedUnder.current = selectionToken
    input?.click()
  }

  const pick = (input: HTMLInputElement | null) => {
    const file = input?.files?.[0]
    const token = openedUnder.current
    // Let the same page be re-picked after a retry.
    if (input) input.value = ''
    if (file) onPick(file, token)
  }

  const running = status === BeforeWorkCheckStatus.Running
  const answered = status === BeforeWorkCheckStatus.Answered && summary != null

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="before-work-check-title">
      <DialogTitle id="before-work-check-title" sx={{ pr: 6 }}>
        {`Check this page for ${childName}`}
        {/* Distinct from the footer's "Close": two controls with the same
            accessible name are ambiguous to a screen reader and to a test. */}
        <IconButton
          aria-label="Close the page check"
          onClick={onClose}
          size="small"
          sx={{ position: 'absolute', right: 8, top: 12 }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {itemLabel && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {`Opened from: ${itemLabel}`}
          </Typography>
        )}

        {/* ── Before the photo: the disclosure, then the buttons ───────────── */}
        {!running && !answered && (
          <Stack spacing={1.5}>
            <Typography variant="body2">
              Hold up a page he has <strong>not done yet</strong>. You&apos;ll get a tentative read
              on whether it suits him today and what you might change — and nothing else happens.
            </Typography>
            <Box
              component="ul"
              aria-label="What happens to the photo"
              sx={{ m: 0, pl: 2.5, color: 'text.secondary' }}
            >
              {BEFORE_WORK_DISCLOSURE.map((line) => (
                <li key={line}>
                  <Typography variant="caption" sx={{ lineHeight: 1.5 }}>
                    {line}
                  </Typography>
                </li>
              ))}
            </Box>
            {cancelled && <Alert severity="info">{BEFORE_WORK_CANCEL_NOTICE}</Alert>}
            <Divider />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button
                variant="contained"
                startIcon={<PhotoCameraIcon />}
                onClick={() => openPicker(cameraRef.current)}
                sx={{ textTransform: 'none' }}
              >
                Take a photo
              </Button>
              <Button
                variant="outlined"
                startIcon={<UploadFileIcon />}
                onClick={() => openPicker(uploadRef.current)}
                sx={{ textTransform: 'none' }}
              >
                Upload a photo
              </Button>
            </Stack>
            {/* Two inputs rather than one, so the camera really is the camera on
                a phone while a file still comes from the picker.
                `key={selectionToken}`: when the child, the day or capability
                changes, these are NEW elements. The old ones — which a native
                picker may still be sitting on top of — are detached, so their
                change event reaches nothing. The token handed to `onPick` is the
                second half of the same guard, for the picker that delivers its
                file before React has repainted. */}
            <input
              key={`camera-${selectionToken}`}
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              aria-label="Take a photo of the page"
              onChange={() => pick(cameraRef.current)}
            />
            <input
              key={`upload-${selectionToken}`}
              ref={uploadRef}
              type="file"
              accept="image/*"
              hidden
              aria-label="Upload a photo of the page"
              onChange={() => pick(uploadRef.current)}
            />
          </Stack>
        )}

        {/* ── While it runs ────────────────────────────────────────────────── */}
        {running && (
          <Stack spacing={1.5} alignItems="flex-start">
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={18} />
              <Typography role="status" variant="body2">
                Looking at the page…
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {BEFORE_WORK_CANCEL_NOTICE}
            </Typography>
          </Stack>
        )}

        {/* ── The answer ───────────────────────────────────────────────────── */}
        {answered && summary && (
          <Stack spacing={1.5}>
            {photoPreviewUrl && (
              <Box
                component="img"
                src={photoPreviewUrl}
                alt="The page you asked about"
                sx={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 1, bgcolor: 'grey.100' }}
              />
            )}

            <Alert severity={TONE[summary.suitability]} icon={false}>
              <Typography variant="subtitle2">{summary.suitabilityLabel}</Typography>
              {summary.subjectLine && (
                <Typography variant="body2" sx={{ mt: 0.25 }}>
                  {summary.subjectLine}
                </Typography>
              )}
              {summary.pageLine && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {summary.pageLine}
                </Typography>
              )}
            </Alert>

            {summary.failureMessage && (
              <Typography variant="body2">{summary.failureMessage}</Typography>
            )}

            {summary.reason && (
              <Box>
                <Typography variant="overline" color="text.secondary">
                  Why
                </Typography>
                <Typography variant="body2">{summary.reason}</Typography>
              </Box>
            )}

            <Box>
              <Typography variant="overline" color="text.secondary">
                If you use it
              </Typography>
              <Typography variant="body2">
                {summary.adaptation ??
                  'No particular adaptation came back — use your own judgement on how much of it to do.'}
              </Typography>
            </Box>

            {/* The model's own "what I couldn't tell", when it gave one, above
                the app's unconditional caveat. */}
            {summary.limits && (
              <Typography variant="caption" color="text.secondary">
                {`Couldn’t tell from this photo: ${summary.limits}`}
              </Typography>
            )}

            <Typography variant="caption" color="text.secondary">
              {summary.uncertainty}
            </Typography>
          </Stack>
        )}
      </DialogContent>

      {/* Close and retry. Nothing here records, plans, skips or completes. */}
      <DialogActions>
        {running ? (
          <Button onClick={onCancel} sx={{ textTransform: 'none' }}>
            Stop
          </Button>
        ) : (
          <>
            {answered && (
              <Button onClick={onRetry} sx={{ textTransform: 'none' }}>
                Check another page
              </Button>
            )}
            <Button variant="contained" onClick={onClose} sx={{ textTransform: 'none' }}>
              Close
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}
