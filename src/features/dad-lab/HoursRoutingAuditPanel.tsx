import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { addDoc, getDocs } from 'firebase/firestore'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { hoursAdjustmentsCollection } from '../../core/firebase/firestore'
import type { DadLabReport, HoursAdjustment } from '../../core/types'
import { SubjectBucketLabel } from '../../core/types/enums'
import type { SubjectBucket } from '../../core/types/enums'
import { formatDateShort } from '../../core/utils/dateKey'
import { assertAttributed } from '../records/records.logic'
import { buildHoursRoutingAudit, buildRoutingAdjustments } from './hoursRoutingAudit'
import type { RoutingAuditRow } from './hoursRoutingAudit'

interface Props {
  familyId: string
  /** All Dad Lab reports (the live listener's list from `useDadLabReports`). */
  reports: DadLabReport[]
  children: Array<{ id: string; name: string }>
}

const tagLabels = (tags: SubjectBucket[]): string =>
  tags.length === 0 ? '—' : tags.map((t) => SubjectBucketLabel[t] ?? t).join(', ')

/**
 * DATA-16 — Dad Lab hours routing audit panel (Step 1: read-only surfacing).
 *
 * Flag-gated (`?diag=1`), parent-only (`DadLabPage` renders it only in the
 * parent view). Surfaces every **completed** Dad Lab report whose minutes may
 * not have reached MO compliance totals, in-app, because the owner cannot reach
 * the Firestore console. Two clearly-separated tiers:
 *   - **Empty tags** — the headline: minutes routed to ZERO hours (the
 *     `syncComplianceHours` empty-`subjectTags` guard).
 *   - **Informational** — routed already, but stored tags differ from what the
 *     FEAT-55 `LAB_TYPE_SUBJECTS` mapping now implies. Visibility only.
 *
 * Reads `dadLabReports` (via prop) and `hoursAdjustments` (to detect
 * already-corrected rows). The **empty-tags** tier gets a propose→confirm write
 * path: a confirmed proposal writes NEW `hoursAdjustments` entries only (never
 * rewrites stored hours or reports), whole-family per DATA-04, stamped so the
 * idempotence guard renders an already-corrected row as resolved and never
 * proposes twice. The **informational** tier is visibility only — no write path.
 * Nothing writes without an explicit per-item or confirm-all tap. Re-runnable.
 */
export default function HoursRoutingAuditPanel({ familyId, reports, children }: Props) {
  const [searchParams] = useSearchParams()
  const [adjustments, setAdjustments] = useState<HoursAdjustment[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savingAll, setSavingAll] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enabled = searchParams.get('diag') === '1'

  const loadAdjustments = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(hoursAdjustmentsCollection(familyId))
      setAdjustments(snap.docs.map((d) => ({ ...(d.data() as HoursAdjustment), id: d.id })))
    } finally {
      setLoading(false)
    }
  }, [familyId])

  useEffect(() => {
    if (!enabled) return
    void loadAdjustments()
  }, [enabled, loadAdjustments])

  const childIds = useMemo(() => children.map((c) => c.id), [children])
  const audit = useMemo(
    () => buildHoursRoutingAudit(reports, adjustments, childIds),
    [reports, adjustments, childIds],
  )

  /**
   * Write the confirmed correction for ONE empty-tags row. Builds additive
   * `hoursAdjustments` payloads (whole-family per DATA-04) via the pure builder,
   * guards each with `assertAttributed` (DATA-05), and reloads so the row flips
   * to "already corrected". The builder returns `[]` for a resolved row, so a
   * double-tap can never write twice (idempotence). Never rewrites stored hours.
   */
  const confirmRow = useCallback(
    async (row: RoutingAuditRow) => {
      const payloads = buildRoutingAdjustments(row, new Date().toISOString())
      if (payloads.length === 0) return
      setSavingId(row.reportId)
      setError(null)
      try {
        for (const payload of payloads) {
          await addDoc(hoursAdjustmentsCollection(familyId), assertAttributed(payload))
        }
        await loadAdjustments()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to write adjustment')
      } finally {
        setSavingId(null)
      }
    },
    [familyId, loadAdjustments],
  )

  /** Confirm-all: write every still-unresolved empty-tags proposal, then reload
   *  once. Each row is re-checked by the builder, so already-corrected rows are
   *  skipped even mid-batch. */
  const confirmAll = useCallback(async () => {
    setSavingAll(true)
    setError(null)
    try {
      for (const row of audit.emptyTags) {
        const payloads = buildRoutingAdjustments(row, new Date().toISOString())
        for (const payload of payloads) {
          await addDoc(hoursAdjustmentsCollection(familyId), assertAttributed(payload))
        }
      }
      await loadAdjustments()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to write adjustments')
    } finally {
      setSavingAll(false)
    }
  }, [audit.emptyTags, familyId, loadAdjustments])

  if (!enabled) return null

  const openCount = audit.emptyTags.filter((r) => !r.resolved).length

  return (
    <Box
      sx={{
        my: 2,
        p: 2,
        bgcolor: 'warning.50',
        border: '1px dashed',
        borderColor: 'warning.main',
        borderRadius: 1,
      }}
    >
      <Typography variant="overline" sx={{ fontWeight: 700 }}>
        Diagnostic — Hours routing audit (DATA-16)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Completed Dad Labs whose minutes may not have reached MO compliance totals.
        Reads reports + <code>hoursAdjustments</code>; writes nothing here.
      </Typography>

      {loading ? (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 1 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">
            Loading adjustments…
          </Typography>
        </Stack>
      ) : (
        <>
          {/* ── Summary ── */}
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
            <Chip
              size="small"
              color={openCount > 0 ? 'warning' : 'success'}
              label={`${openCount} empty-tag lab${openCount === 1 ? '' : 's'} unrouted`}
            />
            <Chip
              size="small"
              variant="outlined"
              label={`${audit.unroutedMinutesPerChild}m unrouted / child (DATA-04: × ${children.length} kids)`}
            />
            {audit.informational.length > 0 && (
              <Chip
                size="small"
                variant="outlined"
                label={`${audit.informational.length} informational (routed, tags differ)`}
              />
            )}
          </Stack>

          {error && (
            <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {/* ── Empty-tags tier (headline) ── */}
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent="space-between"
            sx={{ mb: 0.5 }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Empty tags — minutes credited zero hours
            </Typography>
            {openCount > 1 && (
              <Button
                size="small"
                variant="contained"
                color="warning"
                disabled={savingAll || savingId !== null}
                onClick={confirmAll}
              >
                {savingAll ? 'Crediting…' : `Confirm all (${openCount})`}
              </Button>
            )}
          </Stack>
          {audit.emptyTags.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              None — every completed lab carries subject tags. ✓
            </Typography>
          ) : (
            <Stack spacing={1} sx={{ mb: 2 }}>
              {audit.emptyTags.map((row) => (
                <AuditRowCard
                  key={row.reportId}
                  row={row}
                  childCount={children.length}
                  childNames={children.map((c) => c.name)}
                  onConfirm={confirmRow}
                  saving={savingId === row.reportId}
                  disabled={savingAll || (savingId !== null && savingId !== row.reportId)}
                />
              ))}
            </Stack>
          )}

          {/* ── Informational tier (visibility only) ── */}
          {audit.informational.length > 0 && (
            <>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                Informational — routed, but tags differ from the mapping
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                These DID credit hours (possibly coarsely). No correction is proposed
                in this audit — visibility only.
              </Typography>
              <Stack spacing={1}>
                {audit.informational.map((row) => (
                  <AuditRowCard key={row.reportId} row={row} childCount={children.length} />
                ))}
              </Stack>
            </>
          )}
        </>
      )}
    </Box>
  )
}

/** One flagged report: title/date/type/minutes, current vs implied tags, and the
 *  honest per-child delta (written vs mapping-implied). For an unresolved
 *  empty-tags row an `onConfirm` handler renders the propose→confirm card. */
function AuditRowCard({
  row,
  childCount,
  childNames = [],
  onConfirm,
  saving = false,
  disabled = false,
}: {
  row: RoutingAuditRow
  childCount: number
  childNames?: string[]
  onConfirm?: (row: RoutingAuditRow) => void
  saving?: boolean
  disabled?: boolean
}) {
  const showProposal = row.tier === 'empty-tags' && !row.resolved && !!onConfirm
  const whoLabel = childNames.length > 0 ? childNames.join(' + ') : 'both children'
  return (
    <Box
      sx={{
        p: 1,
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {row.title}
        </Typography>
        <Chip size="small" variant="outlined" label={row.labType} />
        <Typography variant="caption" color="text.secondary">
          {formatDateShort(row.date)} · {row.minutes}m
        </Typography>
        {row.resolved && (
          <Chip size="small" color="success" label="already corrected" />
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
        Current tags: {tagLabels(row.currentTags)} → implied: {tagLabels(row.impliedTags)}
      </Typography>
      <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>
        Written: <strong>{row.writtenMinutesPerChild}m</strong>/child · implied:{' '}
        <strong>{row.impliedMinutesPerChild}m</strong>/child · delta:{' '}
        <strong>
          {row.deltaMinutesPerChild >= 0 ? '+' : ''}
          {row.deltaMinutesPerChild}m
        </strong>
        /child (× {childCount} kids, DATA-04)
      </Typography>
      {showProposal && (
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="space-between"
          sx={{ mt: 1 }}
        >
          <Typography variant="caption" color="text.secondary">
            Credit {row.impliedMinutesPerChild}m to {tagLabels(row.impliedTags)} for {whoLabel},
            dated {formatDateShort(row.date)}.
          </Typography>
          <Button
            size="small"
            variant="outlined"
            color="warning"
            disabled={saving || disabled}
            onClick={() => onConfirm?.(row)}
          >
            {saving ? 'Crediting…' : 'Confirm'}
          </Button>
        </Stack>
      )}
    </Box>
  )
}
