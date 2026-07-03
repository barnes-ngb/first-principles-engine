import { useCallback, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArchiveIcon from '@mui/icons-material/Archive'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import RouteIcon from '@mui/icons-material/Route'

import { EmptyState } from '../../components/states'
import type { ArcStep, ConceptArc } from '../../core/types'
import { ArcStepStatus } from '../../core/types/enums'

import { useConceptArcs } from './useConceptArcs'

const STEP_SEED_PLACEHOLDER = 'e.g. Electricity: static → circuit → switch → motor'

// ── Collected step row (additive; no percentages, no progress bars) ──

function StepChip({ step }: { step: ArcStep }) {
  if (step.status === ArcStepStatus.Done) {
    return <Chip label={step.title} size="small" color="success" />
  }
  if (step.status === ArcStepStatus.Active) {
    return (
      <Chip
        label={step.title}
        size="small"
        color="primary"
        variant="outlined"
        sx={{ fontWeight: 700, borderWidth: 2 }}
      />
    )
  }
  return <Chip label={step.title} size="small" variant="outlined" color="default" />
}

function ArcCard({
  arc,
  onEdit,
  onArchive,
}: {
  arc: ConceptArc
  onEdit: (arc: ConceptArc) => void
  onArchive: (arc: ConceptArc) => void
}) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {arc.title}
              </Typography>
              {arc.domainLabel && (
                <Chip label={arc.domainLabel} size="small" variant="outlined" />
              )}
            </Stack>
            {arc.steps.length > 0 ? (
              <Stack
                direction="row"
                spacing={0.75}
                flexWrap="wrap"
                useFlexGap
                alignItems="center"
                sx={{ mt: 1 }}
              >
                {arc.steps.map((step, i) => (
                  <StepChip key={`${step.title}-${i}`} step={step} />
                ))}
              </Stack>
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                No steps yet
              </Typography>
            )}
          </Box>
          <Stack direction="row" spacing={0.5}>
            <IconButton size="small" onClick={() => onEdit(arc)} title="Edit arc">
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => onArchive(arc)} title="Archive arc">
              <ArchiveIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

// ── Editor dialog (create / edit) ──

interface StepRow {
  title: string
  conceptBeat: string
  status: ArcStep['status']
}

function toRows(arc?: ConceptArc): StepRow[] {
  if (arc && arc.steps.length > 0) {
    return arc.steps.map((s) => ({ title: s.title, conceptBeat: s.conceptBeat, status: s.status }))
  }
  return [{ title: '', conceptBeat: '', status: ArcStepStatus.Upcoming }]
}

function ArcEditorDialog({
  open,
  arc,
  onClose,
  onSave,
}: {
  open: boolean
  arc?: ConceptArc
  onClose: () => void
  onSave: (arc: ConceptArc | undefined, data: { title: string; domainLabel: string; steps: ArcStep[] }) => Promise<void>
}) {
  const [title, setTitle] = useState(arc?.title ?? '')
  const [domainLabel, setDomainLabel] = useState(arc?.domainLabel ?? '')
  const [rows, setRows] = useState<StepRow[]>(() => toRows(arc))
  const [saving, setSaving] = useState(false)

  const updateRow = useCallback((index: number, patch: Partial<StepRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }, [])

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, { title: '', conceptBeat: '', status: ArcStepStatus.Upcoming }])
  }, [])

  const removeRow = useCallback((index: number) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }, [])

  const moveRow = useCallback((index: number, dir: -1 | 1) => {
    setRows((prev) => {
      const target = index + dir
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }, [])

  const cleanSteps = useMemo<ArcStep[]>(() => {
    const steps = rows
      .map((r) => ({ title: r.title.trim(), conceptBeat: r.conceptBeat.trim(), status: r.status }))
      .filter((r) => r.title.length > 0)
    // A new arc always starts with one active step so the report picker has a
    // sensible default; an edited arc keeps whatever statuses it already has.
    if (!arc && steps.length > 0 && !steps.some((s) => s.status === ArcStepStatus.Active)) {
      steps[0] = { ...steps[0], status: ArcStepStatus.Active }
    }
    return steps
  }, [rows, arc])

  const canSave = title.trim().length > 0 && cleanSteps.length > 0 && !saving

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await onSave(arc, { title: title.trim(), domainLabel: domainLabel.trim(), steps: cleanSteps })
      onClose()
    } finally {
      setSaving(false)
    }
  }, [arc, title, domainLabel, cleanSteps, onSave, onClose])

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{arc ? 'Edit Arc' : 'New Concept Arc'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Arc title"
            placeholder="The Electricity Arc"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
            autoFocus
          />
          <TextField
            label="Domain (optional)"
            placeholder="Electricity"
            value={domainLabel}
            onChange={(e) => setDomainLabel(e.target.value)}
            helperText="Free text — just a label, not a curriculum reference"
            fullWidth
          />

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
              Concept beats
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              {STEP_SEED_PLACEHOLDER}
            </Typography>
            <Stack spacing={1.5}>
              {rows.map((row, i) => (
                <Box
                  key={i}
                  sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
                >
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, minWidth: 20 }}>
                      {i + 1}.
                    </Typography>
                    <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
                      <TextField
                        label="Step title"
                        placeholder="Make a bulb light up"
                        value={row.title}
                        onChange={(e) => updateRow(i, { title: e.target.value })}
                        size="small"
                        fullWidth
                      />
                      <TextField
                        label="Concept beat (one line)"
                        placeholder="A loop lets current flow"
                        value={row.conceptBeat}
                        onChange={(e) => updateRow(i, { conceptBeat: e.target.value })}
                        size="small"
                        fullWidth
                      />
                    </Stack>
                    <Stack>
                      <IconButton
                        size="small"
                        onClick={() => moveRow(i, -1)}
                        disabled={i === 0}
                        title="Move up"
                      >
                        <ArrowUpwardIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => moveRow(i, 1)}
                        disabled={i === rows.length - 1}
                        title="Move down"
                      >
                        <ArrowDownwardIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => removeRow(i)}
                        disabled={rows.length <= 1}
                        title="Remove step"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Stack>
                </Box>
              ))}
            </Stack>
            <Button startIcon={<AddIcon />} onClick={addRow} sx={{ mt: 1 }} size="small">
              Add step
            </Button>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave}>
          {arc ? 'Save' : 'Create Arc'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Section ──

export default function ConceptArcsSection() {
  const { arcs, createArc, updateArc, archiveArc } = useConceptArcs()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<ConceptArc | undefined>()
  const [archiveTarget, setArchiveTarget] = useState<ConceptArc | undefined>()

  const handleNew = useCallback(() => {
    setEditing(undefined)
    setEditorOpen(true)
  }, [])

  const handleEdit = useCallback((arc: ConceptArc) => {
    setEditing(arc)
    setEditorOpen(true)
  }, [])

  const handleSave = useCallback(
    async (
      arc: ConceptArc | undefined,
      data: { title: string; domainLabel: string; steps: ArcStep[] },
    ) => {
      if (arc?.id) {
        await updateArc(arc.id, {
          title: data.title,
          domainLabel: data.domainLabel || undefined,
          steps: data.steps,
        })
      } else {
        await createArc({
          title: data.title,
          domainLabel: data.domainLabel || undefined,
          steps: data.steps,
        })
      }
    },
    [createArc, updateArc],
  )

  const handleArchiveConfirm = useCallback(async () => {
    if (!archiveTarget?.id) return
    await archiveArc(archiveTarget.id)
    setArchiveTarget(undefined)
  }, [archiveTarget, archiveArc])

  return (
    <Box sx={{ mb: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary">
          Concept Arcs
        </Typography>
        <Button size="small" startIcon={<RouteIcon />} onClick={handleNew}>
          New Arc
        </Button>
      </Stack>

      {arcs.length > 0 ? (
        <Stack spacing={1.5}>
          {arcs.map((arc) => (
            <ArcCard key={arc.id} arc={arc} onEdit={handleEdit} onArchive={setArchiveTarget} />
          ))}
        </Stack>
      ) : (
        <EmptyState
          title="No concept arcs yet"
          description={`Build a designed sequence of labs — ${STEP_SEED_PLACEHOLDER}`}
        />
      )}

      {editorOpen && (
        <ArcEditorDialog
          open={editorOpen}
          arc={editing}
          onClose={() => setEditorOpen(false)}
          onSave={handleSave}
        />
      )}

      <Dialog open={!!archiveTarget} onClose={() => setArchiveTarget(undefined)}>
        <DialogTitle>Archive Arc?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Archive &ldquo;{archiveTarget?.title}&rdquo;? It will be hidden from the active list.
            Completed labs stay linked.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setArchiveTarget(undefined)}>Cancel</Button>
          <Button onClick={handleArchiveConfirm} color="warning" variant="contained">
            Archive
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
