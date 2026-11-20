/**
 * Parent Records: Build Studio hours (LOCAL-VISION-007 slice 3, parent half).
 *
 * One small card in the Hours & Compliance tab. It helps a PARENT
 *
 *   1. find new Apple Dash saves that may earn a fixed credit, review the exact
 *      proposal (date, subject, child, minutes, saved work) and confirm it;
 *   2. open the exact saved work behind a credited row (read-only);
 *   3. lower, or remove, a credited row's visible minutes.
 *
 * ── The rules this file keeps ───────────────────────────────────────────────
 *
 *   • PROPOSE → CONFIRM → WRITE. Nothing here writes from an effect, a render or a
 *     page view. The guarded writer is called from exactly two click handlers
 *     (confirm credit, confirm correction), with the exact preview the parent saw.
 *   • A failure is never shown as success. A network failure is retryable with the
 *     SAME proposal (the receipt makes the retry idempotent); anything that says the
 *     work is no longer eligible offers Close / Reload, never a forced retry.
 *   • Every result belongs to ONE request. A token and an `alive` flag retire a
 *     preview, a confirmation or a correction that answers after the dialog closed,
 *     or after the family/child changed (the card is keyed by both).
 *   • Old saves are not offered: only versions carrying a server `acceptedAt` that
 *     falls in the Records range are listed, and `previewBuildStudioCredit` is the
 *     authority on whether any of them is really eligible.
 *   • Corrections only lower or remove the visible minutes. They never raise time,
 *     re-attribute, resurrect a row or free daily capacity (the writer's contract).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import SectionCard from '../../components/SectionCard'
import {
  confirmBuildStudioCredit,
  correctBuildStudioCreditHours,
  previewBuildStudioCredit,
  type CreditConfirmResult,
  type CreditCorrectionResult,
  type CreditPreviewResult,
} from '../../core/firebase/buildStudioHoursCreditWrites'
import type { HoursEntry } from '../../core/types'
import type { BuildStudioVersion } from '../../core/types/buildStudio'
import { SubjectBucketLabel, type SubjectBucket } from '../../core/types/enums'
import { describeAttemptForParent } from '../build-studio/buildStudioChallenges'
import {
  buildStudioDownloadsForArchive,
  downloadTextFile,
} from '../build-studio/buildStudioExport'
import { savedLine } from '../build-studio/buildStudioSavedLine'
import { BUILD_STUDIO_PROJECT_ID } from '../build-studio/buildStudioStarter'
import {
  useBuildStudioVersions,
  VersionsStatus,
} from '../build-studio/useBuildStudioVersions'
import BuildStudioCreditedWorkDialog from './BuildStudioCreditedWorkDialog'
import {
  candidateVersions,
  creditedRowsFor,
  MAX_LISTED,
  type CreditedRow,
} from './buildStudioHoursCard.logic'

// ── Local presentation helpers ──────────────────────────────────────────────
// The pure gate, row and candidate helpers live in `buildStudioHoursCard.logic.ts`.

const subjectLabel = (s: string | undefined): string =>
  (s && SubjectBucketLabel[s as SubjectBucket]) || s || 'Subject'

function declinedText(reason: string): string {
  switch (reason) {
    case 'over-daily-cap':
      return 'That day’s Build Studio credit is full (4 hours is the most for a day), so this save can’t be credited.'
    case 'challenge-already-credited-today':
      return 'This challenge was already credited that day, so it can’t be credited again.'
    case 'free-build-too-soon':
      return 'Too soon after another game credit — free-building credits need to be 15 minutes apart.'
    case 'duplicate-source':
      return 'This save is already counted.'
    default:
      return 'This save can’t be credited right now.'
  }
}

function unprovenText(reason: string): string {
  switch (reason) {
    case 'unchanged':
      return 'Nothing changed from the previous save, so there is nothing new to credit.'
    case 'pending-write':
      return 'This save hasn’t finished reaching the server. Check again in a moment.'
    case 'not-eligible':
      return 'This is an older save that was not set aside for hours, so it can’t be credited.'
    default:
      return 'This save’s work couldn’t be verified, so it can’t be credited.'
  }
}

// ── The card ────────────────────────────────────────────────────────────────

export interface BuildStudioHoursCardProps {
  familyId: string
  childId: string
  childName: string
  startDate: string
  endDate: string
  /** The current child's hours entries from the page's own Records read. */
  hoursEntries: HoursEntry[]
  /**
   * Re-run the page's Records read after a save/correction. Resolves `false` when
   * the refresh failed or was dropped (the page guards it against a scope change).
   */
  onChanged: () => Promise<boolean>
}

/** Keyed by family AND child, so no state can outlive either. */
export default function BuildStudioHoursCard(props: BuildStudioHoursCardProps) {
  return <CardInner key={`${props.familyId}|${props.childId}`} {...props} />
}

interface ReviewState {
  version: BuildStudioVersion
  token: number
  /** `null` while the preview is loading. */
  preview: CreditPreviewResult | null
  /** The exact proposal being confirmed; pinned at the click. */
  proposal: Extract<CreditPreviewResult, { status: 'ready' }>['proposal'] | null
  confirming: boolean
  outcome: CreditConfirmResult | null
  refreshed: boolean | null
}

interface FixState {
  row: CreditedRow
  token: number
  mode: 'lower' | 'remove'
  value: string
  busy: boolean
  outcome: CreditCorrectionResult | null
  refreshed: boolean | null
}

function CardInner({
  familyId,
  childId,
  childName,
  startDate,
  endDate,
  hoursEntries,
  onChanged,
}: BuildStudioHoursCardProps) {
  const read = useBuildStudioVersions(familyId, childId, BUILD_STUDIO_PROJECT_ID)
  const alive = useRef(true)
  const tokenRef = useRef(0)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const [review, setReview] = useState<ReviewState | null>(null)
  const [fix, setFix] = useState<FixState | null>(null)
  const [workRow, setWorkRow] = useState<CreditedRow | null>(null)
  /** How many candidate saves are listed; "Show more" grows it, so none is hidden for good. */
  const [shown, setShown] = useState(MAX_LISTED)

  const rows = useMemo(() => creditedRowsFor(hoursEntries, childId), [hoursEntries, childId])
  const creditedVersionIds = useMemo(
    () => new Set(rows.flatMap((r) => (r.provenance ? [r.provenance.versionId] : []))),
    [rows],
  )

  const answered =
    read.status === VersionsStatus.Ready &&
    read.childId === childId &&
    read.projectId === BUILD_STUDIO_PROJECT_ID
  const candidates = useMemo(
    () =>
      answered
        ? candidateVersions(read.versions, childId, creditedVersionIds, startDate, endDate)
        : [],
    [answered, read.versions, childId, creditedVersionIds, startDate, endDate],
  )

  /** True while a writer call is in flight, so a double click cannot send two. */
  const writing = useRef(false)
  const current = useCallback(
    (token: number) => alive.current && tokenRef.current === token,
    [],
  )

  // ── Review a save ──
  const runPreview = useCallback(
    (version: BuildStudioVersion) => {
      const token = ++tokenRef.current
      setReview({
        version,
        token,
        preview: null,
        proposal: null,
        confirming: false,
        outcome: null,
        refreshed: null,
      })
      previewBuildStudioCredit({
        familyId,
        childId,
        projectId: BUILD_STUDIO_PROJECT_ID,
        versionId: version.versionId,
      })
        .catch((): CreditPreviewResult => ({ status: 'failed', reason: 'read-failed' }))
        .then((preview) => {
          if (!current(token)) return
          setReview((r) => (r && r.token === token ? { ...r, preview } : r))
        })
    },
    [familyId, childId, current],
  )

  const closeReview = useCallback(() => {
    tokenRef.current += 1
    setReview(null)
  }, [])

  /** Reload Records, and say so truthfully if that did not work. */
  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      return await onChanged()
    } catch {
      return false
    }
  }, [onChanged])

  const confirmCredit = useCallback(
    async (state: ReviewState) => {
      // Pin the proposal at the click: a retry sends the SAME one.
      const proposal =
        state.proposal ?? (state.preview?.status === 'ready' ? state.preview.proposal : null)
      if (!proposal || writing.current) return
      writing.current = true
      const token = state.token
      setReview((r) => (r && r.token === token ? { ...r, proposal, confirming: true } : r))
      let outcome: CreditConfirmResult
      if (proposal.familyId !== familyId || proposal.childId !== childId) {
        outcome = { status: 'invalid' }
      } else {
        try {
          outcome = await confirmBuildStudioCredit(proposal)
        } catch {
          outcome = { status: 'failed', retryable: true, reason: 'write-failed' }
        }
      }
      writing.current = false
      // A confirmed write is a fact about the family's Records even if this card
      // was retired (the child changed) while it was in flight. The page's refresh
      // guards itself against a family/range/profile change; the retired token
      // only stops THIS card's dialog state from being touched.
      const confirmed = outcome.status === 'credited' || outcome.status === 'alreadySettled'
      if (current(token)) {
        setReview((r) => (r && r.token === token ? { ...r, confirming: false, outcome } : r))
      }
      if (confirmed) {
        const refreshed = await refresh()
        if (!current(token)) return
        setReview((r) => (r && r.token === token ? { ...r, refreshed } : r))
      }
    },
    [familyId, childId, refresh, current],
  )

  // ── Correct a row ──
  const closeFix = useCallback(() => {
    tokenRef.current += 1
    setFix(null)
  }, [])

  const openFix = (row: CreditedRow) => {
    const token = ++tokenRef.current
    setFix({
      row,
      token,
      mode: row.entry.minutes > 1 ? 'lower' : 'remove',
      value: '',
      busy: false,
      outcome: null,
      refreshed: null,
    })
  }

  const confirmFix = useCallback(
    async (state: FixState) => {
      const p = state.row.provenance
      if (!p || writing.current) return
      writing.current = true
      const token = state.token
      const minutes = state.mode === 'remove' ? ('delete' as const) : Number(state.value)
      setFix((f) => (f && f.token === token ? { ...f, busy: true } : f))
      let outcome: CreditCorrectionResult
      try {
        outcome = await correctBuildStudioCreditHours({
          familyId,
          childId,
          projectId: p.projectId,
          versionId: p.versionId,
          expectedMinutes: state.row.entry.minutes,
          minutes,
        })
      } catch {
        outcome = { status: 'failed', retryable: true }
      }
      writing.current = false
      if (current(token)) {
        setFix((f) => (f && f.token === token ? { ...f, busy: false, outcome } : f))
      }
      if (outcome.status === 'corrected' || outcome.status === 'deleted') {
        // Same rule as a credit: refresh the parent's Records even if retired.
        const refreshed = await refresh()
        if (!current(token)) return
        setFix((f) => (f && f.token === token ? { ...f, refreshed } : f))
      }
    },
    [familyId, childId, refresh, current],
  )

  // ── Visibility: out of the way unless there is something to say ──
  if (read.status === VersionsStatus.Loading && rows.length === 0) return null
  const failed = read.status === VersionsStatus.Failed
  if (!failed && rows.length === 0 && candidates.length === 0) return null

  return (
    <SectionCard title="Build Studio hours">
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Time {childName} spent in Build Studio. Nothing counts until you review and confirm it here.
        </Typography>

        {failed && (
          <Alert
            severity="warning"
            action={
              <Button size="small" onClick={read.retry}>
                Retry
              </Button>
            }
          >
            Couldn’t check {childName}’s saved games for new Build Studio credit. Credited rows
            below are not affected.
          </Alert>
        )}

        {candidates.length > 0 && (
          <Stack spacing={1}>
            <Typography variant="subtitle2">New saves to review</Typography>
            {candidates.slice(0, shown).map((v) => (
              <Stack
                key={v.id}
                direction="row"
                spacing={1}
                alignItems="center"
                justifyContent="space-between"
              >
                <Stack sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {v.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {savedLine(v.createdAt)}
                  </Typography>
                </Stack>
                <Button size="small" onClick={() => runPreview(v)}>
                  Review credit
                </Button>
              </Stack>
            ))}
            {candidates.length > shown && (
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="caption" color="text.secondary">
                  Showing the {shown} newest of {candidates.length}.
                </Typography>
                <Button size="small" onClick={() => setShown((n) => n + MAX_LISTED)}>
                  Show more
                </Button>
              </Stack>
            )}
          </Stack>
        )}

        {rows.length > 0 && (
          <Stack spacing={1}>
            <Typography variant="subtitle2">Credited</Typography>
            {rows.map(({ entry, provenance }) => (
              <Stack
                key={entry.id ?? `${entry.date}-${entry.minutes}`}
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                alignItems={{ sm: 'center' }}
                justifyContent="space-between"
              >
                <Typography variant="body2">
                  {entry.date} · {entry.minutes} min · {subjectLabel(entry.subjectBucket)}
                </Typography>
                <Stack direction="row" spacing={1}>
                  {provenance ? (
                    <>
                      <Button
                        size="small"
                        onClick={() => setWorkRow({ entry, provenance })}
                      >
                        Open saved work
                      </Button>
                      <Button
                        size="small"
                        color="inherit"
                        onClick={() => openFix({ entry, provenance })}
                      >
                        Adjust
                      </Button>
                    </>
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      Saved-work link unavailable
                    </Typography>
                  )}
                </Stack>
              </Stack>
            ))}
          </Stack>
        )}
      </Stack>

      {review && (
        <ReviewDialog
          childName={childName}
          state={review}
          onClose={closeReview}
          onConfirm={() => void confirmCredit(review)}
          onCheckAgain={() => runPreview(review.version)}
          onReload={() => {
            void refresh()
            closeReview()
          }}
        />
      )}

      {fix && (
        <FixDialog
          childName={childName}
          state={fix}
          onChange={(patch) => setFix((f) => (f ? { ...f, ...patch } : f))}
          onClose={closeFix}
          onConfirm={() => void confirmFix(fix)}
          onReload={() => {
            void refresh()
            closeFix()
          }}
        />
      )}

      {workRow?.provenance && (
        <BuildStudioCreditedWorkDialog
          familyId={familyId}
          childId={childId}
          childName={childName}
          provenance={workRow.provenance}
          rowDate={workRow.entry.date}
          onClose={() => setWorkRow(null)}
        />
      )}
    </SectionCard>
  )
}

// ── Review dialog ───────────────────────────────────────────────────────────

function ReviewDialog({
  childName,
  state,
  onClose,
  onConfirm,
  onCheckAgain,
  onReload,
}: {
  childName: string
  state: ReviewState
  onClose: () => void
  onConfirm: () => void
  onCheckAgain: () => void
  onReload: () => void
}) {
  const { version, preview, confirming, outcome } = state
  const challenge = describeAttemptForParent(version)

  const download = () => {
    try {
      const [archive] = buildStudioDownloadsForArchive(version.sourceArchive, version.label)
      if (archive) downloadTextFile(archive)
    } catch {
      /* the detail on screen is unaffected */
    }
  }

  let body
  let actions
  const closeOnly = (
    <Button onClick={onClose} disabled={confirming}>
      Close
    </Button>
  )
  const closeOrReload = (
    <>
      <Button onClick={onReload}>Reload records</Button>
      {closeOnly}
    </>
  )

  if (outcome) {
    switch (outcome.status) {
      case 'credited':
      case 'alreadySettled': {
        const r = outcome.receipt
        body = (
          <Stack spacing={1}>
            <Alert severity={outcome.status === 'credited' ? 'success' : 'info'}>
              {outcome.status === 'credited'
                ? `Credited ${r.minutes} minutes of ${subjectLabel(r.subjectBucket)} to ${childName} on ${r.schoolDate}.`
                : `Already credited: ${r.minutes} minutes of ${subjectLabel(r.subjectBucket)} on ${r.schoolDate}. Nothing more was added.`}
            </Alert>
            {state.refreshed === false && (
              <Alert severity="warning">
                It’s recorded, but Records didn’t refresh. Reload the page to see it.
              </Alert>
            )}
          </Stack>
        )
        actions = closeOnly
        break
      }
      case 'failed':
        if (outcome.retryable) {
          body = (
            <Alert severity="warning">
              We couldn’t confirm whether this was recorded — it may or may not have gone through.
              Trying again checks the same save and won’t add it twice.
            </Alert>
          )
          actions = (
            <>
              <Button variant="contained" onClick={onConfirm}>
                Try again
              </Button>
              {closeOnly}
            </>
          )
        } else {
          body = (
            <Alert severity="error">
              This credit couldn’t be recorded and nothing was added. Close and reload Records.
            </Alert>
          )
          actions = closeOrReload
        }
        break
      case 'declined':
        body = <Alert severity="warning">{declinedText(outcome.reason)}</Alert>
        actions = closeOrReload
        break
      case 'unproven':
        body = <Alert severity="warning">{unprovenText(outcome.reason)}</Alert>
        actions = closeOrReload
        break
      case 'stale':
        body = (
          <Alert severity="warning">
            This save (or the family’s settings) changed after you reviewed it, so nothing was
            added. Close, or reload Records and review again.
          </Alert>
        )
        actions = closeOrReload
        break
      default:
        body = (
          <Alert severity="warning">
            This saved work isn’t available to credit any more. Nothing was added.
          </Alert>
        )
        actions = closeOrReload
    }
  } else if (preview === null) {
    body = (
      <Stack direction="row" spacing={1.5} alignItems="center" role="status" aria-live="polite">
        <CircularProgress size={18} />
        <Typography variant="body2">Checking this save…</Typography>
      </Stack>
    )
    actions = closeOnly
  } else {
    switch (preview.status) {
      case 'ready': {
        const p = preview.proposal
        body = (
          <Stack spacing={1}>
            <Typography variant="body2">
              Credit <strong>{p.minutes} minutes</strong> of{' '}
              <strong>{subjectLabel(p.subjectBucket)}</strong> to <strong>{childName}</strong> on{' '}
              <strong>{p.schoolDate}</strong>?
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {p.source.kind === 'challenge'
                ? 'A prediction was recorded with this saved version.'
                : 'For changing their own game.'}{' '}
              The amount is fixed; it doesn’t depend on how long they spent.
            </Typography>
            <Typography variant="subtitle2" sx={{ pt: 1 }}>
              Saved work: {version.label}
            </Typography>
            <Typography variant="caption" color="text.secondary">
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
          </Stack>
        )
        actions = (
          <>
            <Button onClick={download} disabled={confirming}>
              Download source archive
            </Button>
            <Button onClick={onClose} disabled={confirming}>
              Cancel
            </Button>
            <Button variant="contained" onClick={onConfirm} disabled={confirming}>
              {confirming ? 'Confirming…' : 'Confirm credit'}
            </Button>
          </>
        )
        break
      }
      case 'declined':
        body = (
          <Alert severity="warning">
            {declinedText(preview.reason)} (Would have been {preview.proposal.schoolDate}.)
          </Alert>
        )
        actions = closeOnly
        break
      case 'alreadySettled':
        body = (
          <Alert severity="info">
            Already credited: {preview.receipt.minutes} minutes of{' '}
            {subjectLabel(preview.receipt.subjectBucket)} on {preview.receipt.schoolDate}. It can’t
            be credited again.
          </Alert>
        )
        actions = closeOnly
        break
      case 'unproven':
        body = <Alert severity="warning">{unprovenText(preview.reason)}</Alert>
        actions =
          preview.reason === 'pending-write' ? (
            <>
              <Button onClick={onCheckAgain}>Check again</Button>
              {closeOnly}
            </>
          ) : (
            closeOnly
          )
        break
      case 'failed':
        if (preview.reason === 'read-failed') {
          body = (
            <Alert severity="error">
              Couldn’t check this save just now. Nothing was changed.
            </Alert>
          )
          actions = (
            <>
              <Button onClick={onCheckAgain}>Try again</Button>
              {closeOnly}
            </>
          )
        } else {
          body = (
            <Alert severity="error">
              Build Studio credit records for this day look damaged, so nothing can be added. Nothing
              was changed.
            </Alert>
          )
          actions = closeOnly
        }
        break
      default:
        body = (
          <Alert severity="info">
            This save can’t be credited (it isn’t available or isn’t eligible).
          </Alert>
        )
        actions = closeOnly
    }
  }

  return (
    <Dialog
      open
      onClose={confirming ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="bs-review-title"
    >
      <DialogTitle id="bs-review-title">Review Build Studio credit</DialogTitle>
      <DialogContent>{body}</DialogContent>
      <DialogActions>{actions}</DialogActions>
    </Dialog>
  )
}

// ── Correction dialog ───────────────────────────────────────────────────────

function FixDialog({
  childName,
  state,
  onChange,
  onClose,
  onConfirm,
  onReload,
}: {
  childName: string
  state: FixState
  onChange: (patch: Partial<FixState>) => void
  onClose: () => void
  onConfirm: () => void
  onReload: () => void
}) {
  const { row, mode, value, busy, outcome } = state
  const minutes = row.entry.minutes
  const n = Number(value)
  const lowerValid = value.trim() !== '' && Number.isSafeInteger(n) && n > 0 && n < minutes
  const canConfirm = mode === 'remove' || lowerValid
  const done = outcome?.status === 'corrected' || outcome?.status === 'deleted'

  let result = null
  let retryable = false
  if (outcome) {
    if (outcome.status === 'corrected') {
      result = (
        <Alert severity="success">
          Lowered to {outcome.minutes} minutes.
          {state.refreshed === false ? ' Records didn’t refresh — reload the page to see it.' : ''}
        </Alert>
      )
    } else if (outcome.status === 'deleted') {
      result = (
        <Alert severity="success">
          Removed from Records.
          {state.refreshed === false ? ' Records didn’t refresh — reload the page to see it.' : ''}
        </Alert>
      )
    } else if (outcome.status === 'failed' && outcome.retryable) {
      retryable = true
      result = (
        <Alert severity="warning">
          We couldn’t confirm whether this change was recorded — it may have gone through. Reload
          Records to check, or try again; if it was already applied, the row will show as changed
          and nothing is lowered twice.
        </Alert>
      )
    } else if (outcome.status === 'stale') {
      result = (
        <Alert severity="warning">
          This row changed since you opened it, so nothing was changed. Close and reload Records.
        </Alert>
      )
    } else {
      result = (
        <Alert severity="warning">
          This row can’t be adjusted (it isn’t a valid lower amount, or its credit record is
          missing). Nothing was changed.
        </Alert>
      )
    }
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="xs" aria-labelledby="bs-fix-title">
      <DialogTitle id="bs-fix-title">Adjust Build Studio row</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          <Typography variant="body2">
            {childName} · {row.entry.date} · {minutes} min · {subjectLabel(row.entry.subjectBucket)}
          </Typography>
          {!done && (
            <RadioGroup
              value={mode}
              onChange={(e) => onChange({ mode: e.target.value as 'lower' | 'remove' })}
            >
              {minutes > 1 && (
                <FormControlLabel value="lower" control={<Radio />} label="Lower the minutes" />
              )}
              {mode === 'lower' && minutes > 1 && (
                <TextField
                  size="small"
                  type="number"
                  label="New minutes"
                  value={value}
                  onChange={(e) => onChange({ value: e.target.value })}
                  helperText={`A whole number from 1 to ${minutes - 1}`}
                  error={value !== '' && !lowerValid}
                />
              )}
              <FormControlLabel value="remove" control={<Radio />} label="Remove this row" />
            </RadioGroup>
          )}
          <Typography variant="caption" color="text.secondary">
            This only changes what Records shows. It can’t add time, move it to someone else,
            bring a removed row back, or make room for another credit that day.
          </Typography>
          {result}
        </Stack>
      </DialogContent>
      <DialogActions>
        {!done && (retryable || outcome === null) && (
          <Button variant="contained" onClick={onConfirm} disabled={busy || !canConfirm}>
            {busy ? 'Saving…' : retryable ? 'Try again' : mode === 'remove' ? 'Remove row' : 'Lower minutes'}
          </Button>
        )}
        {outcome && !done && <Button onClick={onReload}>Reload records</Button>}
        <Button onClick={onClose} disabled={busy}>
          {done ? 'Close' : 'Cancel'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
