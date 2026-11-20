/**
 * The exact saved work behind one Build Studio credit — a PARENT's read-only view
 * (LOCAL-VISION-007 slice 3).
 *
 * Opened from a credited Records row. It resolves the ONE version the row's own
 * provenance names (`readBuildStudioCreditedVersion`, which re-checks that the
 * provenance is this child's, for Apple Dash, and names the deterministic ids) and
 * shows it. It never falls back to the newest version, never reads MakeCode and
 * never writes.
 *
 * ── An answer belongs to ONE request ────────────────────────────────────────
 * The effect's own cleanup retires its callbacks before anything else, and a
 * stored answer is shown only while its key is the key this render wants. So
 * closing (the dialog unmounts), a retry, or a different family/child/row can
 * never display a retired answer.
 */

import { useCallback, useEffect, useState } from 'react'
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
  readBuildStudioCreditedVersion,
  type CreditVersionReadResult,
} from '../../core/firebase/buildStudioHoursCreditWrites'
import type { BuildStudioCreditProvenance } from '../../core/types/buildStudio'
import { describeAttemptForParent } from '../build-studio/buildStudioChallenges'
import {
  buildStudioDownloadsForArchive,
  downloadTextFile,
} from '../build-studio/buildStudioExport'
import { savedLine } from '../build-studio/buildStudioSavedLine'

export interface CreditedWorkDialogProps {
  familyId: string
  childId: string
  childName: string
  /** The row's FULL recorded provenance — the exact reader needs all of it. */
  provenance: BuildStudioCreditProvenance
  /** Shown in the title so the parent knows which row this is. */
  rowDate: string
  onClose: () => void
}

type Settled = { key: string; result: CreditVersionReadResult }

const MALFORMED_TEXT =
  'The saved work on file does not match this credit’s record, so it is not shown. ' +
  'The credit itself is unchanged.'

export default function BuildStudioCreditedWorkDialog({
  familyId,
  childId,
  childName,
  provenance,
  rowDate,
  onClose,
}: CreditedWorkDialogProps) {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<Settled | null>(null)
  const key = `${familyId}|${childId}|${provenance.receiptId}|${attempt}`

  useEffect(() => {
    let retired = false
    readBuildStudioCreditedVersion({ familyId, childId, provenance })
      .then((result) => {
        if (!retired) setSettled({ key, result })
      })
      .catch(() => {
        if (!retired) setSettled({ key, result: { status: 'failed' } })
      })
    return () => {
      retired = true
    }
    // `key` pins family, child, receipt and retry; `provenance` is the row's own
    // immutable record and is addressed by that receipt id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const result = settled?.key === key ? settled.result : null
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const download = useCallback(() => {
    if (result?.status !== 'ok') return
    try {
      const [archive] = buildStudioDownloadsForArchive(
        result.version.sourceArchive,
        result.version.label,
      )
      if (archive) downloadTextFile(archive)
    } catch {
      // The reader validated the archive; a parse failure here is not a reason to
      // show anything but the detail already on screen.
    }
  }, [result])

  let body
  if (result === null) {
    body = (
      <Stack direction="row" spacing={1.5} alignItems="center" role="status" aria-live="polite">
        <CircularProgress size={18} />
        <Typography variant="body2">Opening the saved work…</Typography>
      </Stack>
    )
  } else if (result.status === 'failed') {
    body = (
      <Alert
        severity="warning"
        action={
          <Button size="small" onClick={retry}>
            Retry
          </Button>
        }
      >
        Couldn’t read the saved work just now. The credit is unchanged.
      </Alert>
    )
  } else if (result.status === 'unavailable') {
    body = (
      <Alert severity="info">
        This saved version isn’t on file any more. The credit and its Records row are
        unchanged.
      </Alert>
    )
  } else if (result.status === 'malformed') {
    body = <Alert severity="warning">{MALFORMED_TEXT}</Alert>
  } else {
    const { version } = result
    const challenge = describeAttemptForParent(version)
    body = (
      <Stack spacing={1}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {version.label}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {savedLine(version.createdAt)}
        </Typography>
        {challenge && (
          <Typography variant="body2">
            {challenge.summary}
            {challenge.followUp ? ` Ask: ${challenge.followUp}` : ''}
          </Typography>
        )}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}
        >
          {version.fileCount} files · {version.byteSize} bytes · {version.sourceDigest}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Read-only. This is the exact save this credit was given for — not a newer one.
        </Typography>
      </Stack>
    )
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="bs-work-title">
      <DialogTitle id="bs-work-title">
        Saved work — {childName}, {rowDate}
      </DialogTitle>
      <DialogContent>{body}</DialogContent>
      <DialogActions>
        {result?.status === 'ok' && (
          <Button onClick={download}>Download source archive</Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
