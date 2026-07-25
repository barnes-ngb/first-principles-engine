import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import FormControlLabel from '@mui/material/FormControlLabel'
import Typography from '@mui/material/Typography'

import { useFamilyId } from '../../core/auth/useAuth'
import { useChildren } from '../../core/hooks/useChildren'
import {
  buildDataReviewExport,
  DataReviewExportMode,
  dataReviewExportFilename,
} from './dataReviewExport.logic'
import { loadDataReviewExportInput } from './dataReviewExportLoader'

interface ChildExportState {
  building: boolean
  error: string | null
  /** Last successful download, for a small confirmation line. */
  lastFile: string | null
}

/**
 * Flag-gated ( `?diag=1` ) parent-only data-review export (FEAT-120). Renders a
 * per-child "Download review export" button that reads the child's stored data
 * and downloads one markdown file, formatted for an LLM to audit.
 *
 * **Read-only.** Nothing in this feature writes: no Firestore write, no new
 * collection, no Cloud Function, no AI call. It reads existing collections
 * through the typed helpers in `core/firebase/firestore.ts` and builds a string.
 *
 * It lives on the diag panel deliberately — that surface is already parent-gated
 * and grandfathered out of the §14 display rules, and this file is for machine
 * review, so it MAY carry band numbers, node ids, counts, and percentages. None
 * of this belongs on a kid-facing or normal parent surface.
 *
 * Full history is the default; the "current school year only" checkbox collapses
 * prior-year detail to rollups for later recurring audits.
 */
export default function DataReviewExportPanel() {
  const [searchParams] = useSearchParams()
  const familyId = useFamilyId()
  const { children } = useChildren()
  const [currentYearOnly, setCurrentYearOnly] = useState(false)
  const [byChild, setByChild] = useState<Record<string, ChildExportState>>({})

  const handleExport = useCallback(
    async (childId: string, name: string, grade?: string, birthdate?: string) => {
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
        const markdown = buildDataReviewExport(input)
        const filename = dataReviewExportFilename(name, input.generatedAt, mode)

        // Same download path the portfolio markdown export uses.
        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8;' })
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', filename)
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.URL.revokeObjectURL(url)

        setByChild((prev) => ({
          ...prev,
          [childId]: { building: false, error: null, lastFile: filename },
        }))
      } catch (err) {
        setByChild((prev) => ({
          ...prev,
          [childId]: {
            building: false,
            error: err instanceof Error ? err.message : 'Export failed',
            lastFile: prev[childId]?.lastFile ?? null,
          },
        }))
      }
    },
    [familyId, currentYearOnly],
  )

  if (searchParams.get('diag') !== '1') return null

  return (
    <Box
      sx={{
        m: 2,
        p: 2,
        bgcolor: 'warning.50',
        border: '1px dashed',
        borderColor: 'warning.main',
        borderRadius: 1,
      }}
    >
      <Typography variant="overline" sx={{ fontWeight: 700 }}>
        Diagnostic — Data review export
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Downloads one markdown file per child describing what is actually stored —
        workbook configs, learner model, skill snapshot, sight words, hours,
        artifacts, Dad Lab, evaluations, quests, dispositions, XP — plus a
        deterministic integrity appendix. Read-only: this writes nothing and calls
        no AI. Drop the file into the design chat to audit for missing or
        mis-connected data.
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
            Current school year only (default off — the full history is the
            default; this collapses prior years to rollups)
          </Typography>
        }
        sx={{ mb: 1, alignItems: 'flex-start' }}
      />

      {children.map((child) => {
        const state = byChild[child.id]
        return (
          <Box key={child.id} sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {child.name}
              </Typography>
              <Button
                size="small"
                variant="outlined"
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
