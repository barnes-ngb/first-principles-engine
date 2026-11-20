/**
 * Parent Records: Build Studio hours (LOCAL-VISION-007 slice 3, parent half).
 *
 * One small card in the Hours & Compliance tab. Credit for a new eligible Apple
 * Dash save is added AUTOMATICALLY (owner-approved, narrow exception to
 * confirm-before-write — see `buildStudioHoursCreditWrites.ts`). This card helps a
 * PARENT
 *
 *   1. see the credited rows, and open the exact saved work behind one (read-only);
 *   2. lower, or remove, a credited row's visible minutes (the parent's correction);
 *   3. nothing else: there is no review, confirm or approve control for a credit.
 *
 * ── The rules this file keeps ───────────────────────────────────────────────
 *
 *   • The automatic worker (`BuildStudioAutoCredit`) is mounted here for the
 *     family and child the page has already confirmed, and a successful settlement
 *     calls the page's existing Records refresh. It is a client workflow: pending
 *     credit is processed only while this view or the child's Build Studio page is
 *     open. It renders nothing and shows no minutes to a child.
 *   • A correction is the one write a parent makes here, from one click handler,
 *     with the minutes she saw. It only lowers or removes the visible row. It never
 *     raises time, re-attributes, resurrects a row or frees daily capacity (the
 *     writer's contract), and a removed row is never credited again — the permanent
 *     receipt, not the row, decides that.
 *   • A result belongs to ONE request. A token and an `alive` flag retire a
 *     correction that answers after the dialog closed, or after the family/child
 *     changed (the card is keyed by both).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
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
  correctBuildStudioCreditHours,
  type CreditCorrectionResult,
} from '../../core/firebase/buildStudioHoursCreditWrites'
import type { HoursEntry } from '../../core/types'
import { SubjectBucketLabel, type SubjectBucket } from '../../core/types/enums'
import BuildStudioAutoCredit from '../build-studio/BuildStudioAutoCredit'
import BuildStudioCreditedWorkDialog from './BuildStudioCreditedWorkDialog'
import { creditedRowsFor, type CreditedRow } from './buildStudioHoursCard.logic'

// ── Local presentation helpers ──────────────────────────────────────────────
// The pure gate and row helpers live in `buildStudioHoursCard.logic.ts`.

const subjectLabel = (s: string | undefined): string =>
  (s && SubjectBucketLabel[s as SubjectBucket]) || s || 'Subject'

// ── The card ────────────────────────────────────────────────────────────────

export interface BuildStudioHoursCardProps {
  familyId: string
  childId: string
  childName: string
  /** The Records range. Kept for the page's props; the worker reads the child's queue, not the range. */
  startDate: string
  endDate: string
  /** The current child's hours entries from the page's own Records read. */
  hoursEntries: HoursEntry[]
  /**
   * Re-run the page's Records read after a credit or correction. Resolves `false`
   * when the refresh failed or was dropped (the page guards it against a scope change).
   */
  onChanged: () => Promise<boolean>
}

/** Keyed by family AND child, so no state can outlive either. */
export default function BuildStudioHoursCard(props: BuildStudioHoursCardProps) {
  return <CardInner key={`${props.familyId}|${props.childId}`} {...props} />
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

function CardInner({ familyId, childId, childName, hoursEntries, onChanged }: BuildStudioHoursCardProps) {
  const alive = useRef(true)
  const tokenRef = useRef(0)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const [fix, setFix] = useState<FixState | null>(null)
  const [workRow, setWorkRow] = useState<CreditedRow | null>(null)

  const rows = useMemo(() => creditedRowsFor(hoursEntries, childId), [hoursEntries, childId])

  /** True while a writer call is in flight, so a double click cannot send two. */
  const writing = useRef(false)
  const current = useCallback((token: number) => alive.current && tokenRef.current === token, [])

  /** Reload Records, and say so truthfully if that did not work. */
  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      return await onChanged()
    } catch {
      return false
    }
  }, [onChanged])

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
        // A correction is a fact about the family's Records even if this card was
        // retired while it was in flight; the page's refresh guards itself against
        // a family/range/profile change.
        const refreshed = await refresh()
        if (!current(token)) return
        setFix((f) => (f && f.token === token ? { ...f, refreshed } : f))
      }
    },
    [familyId, childId, refresh, current],
  )

  // The worker is mounted for this confirmed family and child whether or not any
  // row shows yet; it renders nothing, so an empty card stays empty.
  const worker = (
    <BuildStudioAutoCredit familyId={familyId} childId={childId} enabled onSettled={refresh} />
  )
  // One fragment shape either way, so the worker is never remounted when the last
  // row is removed or the first one arrives.
  return (
    <>
      {worker}
      {rows.length > 0 && (
      <SectionCard title="Build Studio hours">
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Time {childName} spent in Build Studio. Credit for a new saved game is added automatically
            while Build Studio or this page is open. You can lower or remove any row below.
          </Typography>

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
                      <Button size="small" onClick={() => setWorkRow({ entry, provenance })}>
                        Open saved work
                      </Button>
                      <Button size="small" color="inherit" onClick={() => openFix({ entry, provenance })}>
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
        </Stack>

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
      )}
    </>
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
