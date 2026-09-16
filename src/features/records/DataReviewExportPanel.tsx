import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import FormControlLabel from '@mui/material/FormControlLabel'
import Typography from '@mui/material/Typography'

import { useFamilyId } from '../../core/auth/useAuth'
import { useProfile } from '../../core/profile/useProfile'
import { APP_BUILD } from '../../core/observability/buildInfo'
import {
  buildDataReviewExport,
  DataReviewExportMode,
  dataReviewExportFilename,
  type DataReviewChild,
} from './dataReviewExport.logic'
import { loadDataReviewExportInput } from './dataReviewExportLoader'
import { loadReviewExportChildren } from './dataReviewExportChildren'

interface ChildExportState {
  building: boolean
  error: string | null
  /** Last successful download, for a small confirmation line. */
  lastFile: string | null
}

/**
 * Parent-only data-review export (FEAT-120), also available at `?diag=1`. Renders a
 * per-child "Download review export" button that reads the child's stored data
 * and downloads one markdown file, formatted for an LLM to audit.
 *
 * **Read-only.** Nothing in this feature writes: no Firestore write, no new
 * collection, no Cloud Function, no AI call. It reads existing collections
 * through the typed helpers in `core/firebase/firestore.ts` and builds a string.
 *
 * Records offers a normal parent entry; the original diagnostic entry remains.
 * Technical details belong in the downloaded file, not this control's UI.
 *
 * **Parent gate (capability, never a name).** `?diag=1` is NOT an access control
 * — `/progress` sits OUTSIDE the `RequireParent` block in `app/router.tsx`, so a
 * kid profile that types the URL renders this page. The export carries every
 * child's birthdate, parent notes, assessment data, and artifact media URLs, so
 * the panel additionally requires the parent capability (`canEdit`, the same
 * signal `RequireParent` uses — ARCH-41/42/43: capability, never `isLincoln` or
 * a name). Moving the whole `/progress` route behind `RequireParent` would
 * change kid access to Progress broadly and is out of this run's scope.
 *
 * Full history is the default; the "current school year only" checkbox collapses
 * prior-year detail to rollups for later recurring audits.
 */
export default function DataReviewExportPanel({ entry = 'diagnostic' }: {
  entry?: 'diagnostic' | 'records'
}) {
  const [searchParams] = useSearchParams()
  const familyId = useFamilyId()
  const { canEdit } = useProfile()
  // Gating unmounts the scoped download controller, invalidating pending work.
  if (!canEdit || !familyId) return null
  if (entry === 'diagnostic' && searchParams.get('diag') !== '1') return null
  return <FamilyReviewExport
    key={familyId}
    familyId={familyId}
    diagnostic={entry === 'diagnostic'}
  />
}

/** Do not use useChildren here: its auto-create effect is not a read-only operation. */
function FamilyReviewExport({ familyId, diagnostic }: { familyId: string; diagnostic: boolean }) {
  const [children, setChildren] = useState<DataReviewChild[] | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    loadReviewExportChildren(familyId).then(result => {
      if (!cancelled) setChildren(result)
    }).catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [familyId, attempt])
  if (error) return <Box sx={{ m: 2 }} role="alert">
    <Typography>Could not load children for the review export.</Typography>
    <Button onClick={() => { setError(false); setAttempt(value => value + 1) }}>Try again</Button>
  </Box>
  if (!children) return <Typography role="status" sx={{ m: 2 }}>Loading review export…</Typography>
  if (children.length === 0) return <Typography sx={{ m: 2 }}>No children are available for a review export.</Typography>
  return <ScopedReviewExport familyId={familyId} children={children} diagnostic={diagnostic} />
}

function ScopedReviewExport({ familyId, children, diagnostic }: {
  familyId: string
  children: DataReviewChild[]
  diagnostic: boolean
}) {
  const [currentYearOnly, setCurrentYearOnly] = useState(false)
  const [byChild, setByChild] = useState<Record<string, ChildExportState>>({})
  const lifetime = useRef<object | null>(null)
  const pending = useRef(new Set<string>())
  useLayoutEffect(() => {
    const token = {}
    lifetime.current = token
    return () => { lifetime.current = null }
  }, [])

  const handleExport = useCallback(
    async (childId: string, name: string, grade?: string, birthdate?: string) => {
      const token = lifetime.current
      if (!token || pending.current.has(childId) || !children.some(child => child.id === childId)) return
      pending.current.add(childId)
      const isCurrent = () => lifetime.current === token
      setByChild((prev) => ({
        ...prev,
        [childId]: { building: true, error: null, lastFile: prev[childId]?.lastFile ?? null },
      }))
      try {
        const mode = currentYearOnly
          ? DataReviewExportMode.CurrentYear
          : DataReviewExportMode.FullHistory
        const input = await loadDataReviewExportInput(
          familyId,
          { id: childId, name, grade, birthdate },
          mode,
        )
        if (!isCurrent()) return
        const markdown = buildDataReviewExport({ ...input, appBuild: APP_BUILD })
        const filename = dataReviewExportFilename(name, input.generatedAt, mode)

        // Same download path the portfolio markdown export uses.
        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8;' })
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', filename)
        try {
          document.body.appendChild(link)
          link.click()
        } finally {
          link.remove()
          window.URL.revokeObjectURL(url)
        }

        setByChild((prev) => ({
          ...prev,
          [childId]: { building: false, error: null, lastFile: filename },
        }))
      } catch (err) {
        if (!isCurrent()) return
        setByChild((prev) => ({
          ...prev,
          [childId]: {
            building: false,
            error: err instanceof Error ? err.message : 'Export failed',
            lastFile: prev[childId]?.lastFile ?? null,
          },
        }))
      } finally {
        pending.current.delete(childId)
      }
    },
    [familyId, currentYearOnly, children],
  )

  return (
    <Box
      sx={{
        m: 2,
        p: 2,
        bgcolor: diagnostic ? 'warning.50' : 'background.paper',
        border: diagnostic ? '1px dashed' : '1px solid',
        borderColor: diagnostic ? 'warning.main' : 'divider',
        borderRadius: 1,
      }}
    >
      <Typography component="h2" variant={diagnostic ? 'overline' : 'h6'} sx={{ fontWeight: 700 }}>
        {diagnostic ? 'Diagnostic — Data review export' : 'Export for review'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Download one file per child with learning progress, supporting evidence,
        recorded hours and checks for missing links. You can attach it to your
        design chat for review. Downloading changes no records and sends nothing to AI.
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        The file contains private child details, notes and media links. Review it
        before sharing. Images and recordings are not downloaded into the file.
        Its scope is chosen below, separately from the Records date filters.
        Learning progress keeps its earlier supporting evidence in either scope.
      </Typography>

      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={currentYearOnly}
            onChange={(e) => setCurrentYearOnly(e.target.checked)}
          />
        }
        label={
          <Typography variant="body2">
            Current school year only (keeps older-year totals)
          </Typography>
        }
        sx={{ mb: 1, alignItems: 'flex-start' }}
      />

      {children.map((child) => {
        const state = byChild[child.id]
        return (
          <Box key={child.id} sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {child.name}
              </Typography>
              <Button
                size="small"
                variant="outlined"
                sx={{ minHeight: 48 }}
                disabled={state?.building}
                onClick={() =>
                  void handleExport(
                    child.id,
                    child.name,
                    child.grade,
                    child.birthdate,
                  )
                }
              >
                {state?.building ? 'Building…' : 'Download review export'}
              </Button>
              {state?.building && <CircularProgress size={16} />}
            </Box>
            {state?.error && (
              <Typography variant="body2" color="error.main">
                {state.error}
              </Typography>
            )}
            {state?.lastFile && !state.building && !state.error && (
              <Typography variant="caption" color="text.secondary">
                Downloaded <code>{state.lastFile}</code>
              </Typography>
            )}
          </Box>
        )
      })}
    </Box>
  )
}
