import { useCallback, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import LightbulbIcon from '@mui/icons-material/Lightbulb'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import VisibilityIcon from '@mui/icons-material/Visibility'

import ArtifactGallery from '../../components/ArtifactGallery'
import { useAI, TaskType } from '../../core/ai/useAI'
import { useFamilyId } from '../../core/auth/useAuth'
import { useChildren } from '../../core/hooks/useChildren'
import { useProfile } from '../../core/profile/useProfile'
import type { DadLabReport } from '../../core/types'
import type { DadLabType } from '../../core/types/enums'
import { DadLabStatus, SubjectBucket, UserProfile } from '../../core/types/enums'
import { formatDateShort, weekKeyFromDate } from '../../core/utils/dateKey'
import { formatDateYmd } from '../../core/utils/format'
import KidLabView from './KidLabView'
import LabReportForm from './LabReportForm'
import LabSuggestions from './LabSuggestions'
import { useDadLabReports } from './useDadLabReports'

const LAB_TYPE_ICONS: Record<DadLabType, string> = {
  science: '\u{1F9EA}',
  engineering: '\u{1F528}',
  adventure: '\u{1F333}',
  heart: '\u{2764}\u{FE0F}',
}

const LAB_TYPE_LABELS: Record<DadLabType, string> = {
  science: 'Science',
  engineering: 'Engineering',
  adventure: 'Adventure',
  heart: 'Heart',
}

const STATUS_COLORS: Record<DadLabStatus, 'warning' | 'info' | 'success'> = {
  planned: 'warning',
  active: 'info',
  complete: 'success',
}

const STATUS_LABELS: Record<DadLabStatus, string> = {
  planned: 'Planned',
  active: 'Active',
  complete: 'Complete',
}

const LAB_TYPE_MAP: Record<string, DadLabType> = {
  science: 'science',
  engineering: 'engineering',
  adventure: 'adventure',
  heart: 'heart',
}

function parseLabType(raw: string): DadLabType {
  return LAB_TYPE_MAP[raw.toLowerCase().trim()] ?? 'science'
}

interface Prefill {
  title?: string
  question?: string
  labType?: DadLabType
  description?: string
  materials?: string[]
  lincolnRole?: string
  londonRole?: string
  duration?: number
}

function getNextSaturday(): Date {
  const d = new Date()
  const day = d.getDay()
  const diff = (6 - day + 7) % 7 || 7
  d.setDate(d.getDate() + (day === 6 ? 0 : diff))
  return d
}

export default function DadLabPage() {
  const { profile } = useProfile()
  const familyId = useFamilyId()
  const isKid = profile === UserProfile.Lincoln || profile === UserProfile.London

  const { reports, loading, saveReport, updateStatus, deleteReport } = useDadLabReports()
  const { children } = useChildren()
  const { chat } = useAI()
  const [view, setView] = useState<'list' | 'form'>('list')
  const [editingReport, setEditingReport] = useState<DadLabReport | undefined>()
  const [prefill, setPrefill] = useState<Prefill | undefined>()
  const [completing, setCompleting] = useState(false)
  const [readOnly, setReadOnly] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DadLabReport | undefined>()
  const [ideaOpen, setIdeaOpen] = useState(false)
  const [ideaText, setIdeaText] = useState('')
  const [ideaLoading, setIdeaLoading] = useState(false)
  const [ideaResult, setIdeaResult] = useState<Prefill | null>(null)

  // Split reports by status
  const { planned, active, completed } = useMemo(() => {
    const p: DadLabReport[] = []
    const a: DadLabReport[] = []
    const c: DadLabReport[] = []
    for (const r of reports) {
      if (r.status === DadLabStatus.Planned) p.push(r)
      else if (r.status === DadLabStatus.Active) a.push(r)
      else c.push(r)
    }
    return { planned: p, active: a, completed: c }
  }, [reports])

  const handleNew = useCallback(() => {
    setEditingReport(undefined)
    setPrefill(undefined)
    setView('form')
  }, [])

  const handleView = useCallback((report: DadLabReport) => {
    setEditingReport(report)
    setPrefill(undefined)
    setCompleting(false)
    setReadOnly(true)
    setView('form')
  }, [])

  const handleEdit = useCallback((report: DadLabReport) => {
    setEditingReport(report)
    setPrefill(undefined)
    setCompleting(false)
    setReadOnly(false)
    setView('form')
  }, [])

  const handleCancel = useCallback(() => {
    setEditingReport(undefined)
    setPrefill(undefined)
    setCompleting(false)
    setReadOnly(false)
    setView('list')
  }, [])

  const handleSave = useCallback(
    async (report: DadLabReport) => {
      await saveReport(report)
      setView('list')
      setEditingReport(undefined)
      setPrefill(undefined)
    },
    [saveReport],
  )

  const handleSuggestionSelect = useCallback(
    async (data: Prefill) => {
      setSuggestionsOpen(false)
      const nextSat = getNextSaturday()
      const dateStr = formatDateYmd(nextSat)

      const planned: DadLabReport = {
        date: dateStr,
        weekKey: weekKeyFromDate(nextSat),
        title: data.title ?? 'Untitled Lab',
        labType: data.labType ?? 'science',
        question: data.question ?? '',
        description: data.description ?? '',
        status: DadLabStatus.Planned,
        materials: data.materials,
        lincolnRole: data.lincolnRole,
        londonRole: data.londonRole,
        childReports: {},
        subjectTags: [
          data.labType === 'science' || data.labType === 'engineering'
            ? SubjectBucket.Science
            : SubjectBucket.Other,
        ],
        totalMinutes: data.duration ?? 60,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await saveReport(planned)
    },
    [saveReport],
  )

  const handleStartLab = useCallback(
    async (reportId: string) => {
      await updateStatus(reportId, DadLabStatus.Active)
    },
    [updateStatus],
  )

  const handleCompleteLab = useCallback(
    (report: DadLabReport) => {
      // Open form with reflection fields to complete the lab
      setEditingReport(report)
      setPrefill(undefined)
      setCompleting(true)
      setView('form')
    },
    [],
  )

  const handleDeleteRequest = useCallback(
    (report: DadLabReport) => {
      setDeleteTarget(report)
    },
    [],
  )

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget?.id) return
    await deleteReport(deleteTarget.id)
    setDeleteTarget(undefined)
  }, [deleteTarget, deleteReport])

  const handleDeleteCancel = useCallback(() => {
    setDeleteTarget(undefined)
  }, [])

  const handleRefineIdea = useCallback(async () => {
    if (!ideaText.trim()) return
    setIdeaLoading(true)
    setIdeaResult(null)

    try {
      const response = await chat({
        familyId,
        childId: children[0]?.id ?? '',
        taskType: TaskType.Chat,
        messages: [{
          role: 'user',
          content: `I have an idea for a Dad Lab activity. Structure it into a complete lab plan.

My idea: "${ideaText}"

Context:
- Lincoln (10, neurodivergent, loves Minecraft/building/art)
- London (6, loves drawing and stories)
- Both boys
- Saturday morning lab, 45-90 minutes

Respond in EXACTLY this format (no other text):
Title: [a catchy name for the lab]
Type: [science/engineering/adventure/heart]
Question: [a driving question that frames the exploration]
Description: [2-3 sentences about what we'll do and learn]
Materials: [comma-separated list of what we need]
Lincoln's role: [specific tasks — he leads, measures, explains]
London's role: [specific tasks — he observes, draws, helps]
Duration: [estimated minutes]`,
        }],
      })

      if (response?.message) {
        const get = (key: string): string => {
          const match = response.message!.match(new RegExp(`${key}:\\s*(.+)`, 'i'))
          return match?.[1]?.trim() ?? ''
        }

        setIdeaResult({
          title: get('Title') || ideaText.slice(0, 40),
          labType: parseLabType(get('Type')),
          question: get('Question'),
          description: get('Description'),
          materials: get('Materials').split(',').map(s => s.trim()).filter(Boolean),
          lincolnRole: get("Lincoln's role") || get('Lincoln'),
          londonRole: get("London's role") || get('London'),
        })
      } else {
        // Fallback: create a basic structure from the idea text
        setIdeaResult({
          title: ideaText.slice(0, 50),
          labType: 'science' as DadLabType,
          question: '',
          description: ideaText,
          materials: [],
          lincolnRole: '',
          londonRole: '',
        })
      }
    } catch (err) {
      console.error('Refine idea failed:', err)
      // Still let Nathan plan manually
      setIdeaResult({
        title: ideaText.slice(0, 50),
        labType: 'science' as DadLabType,
        question: '',
        description: ideaText,
        materials: [],
        lincolnRole: '',
        londonRole: '',
      })
    } finally {
      setIdeaLoading(false)
    }
  }, [ideaText, chat, familyId, children])

  // Stats (completed labs only)
  const stats = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const thisYear = completed.filter((r) => r.date.startsWith(String(currentYear)))
    const totalMinutes = thisYear.reduce((acc, r) => acc + (r.totalMinutes ?? 0), 0)
    const byType = thisYear.reduce(
      (acc, r) => {
        acc[r.labType] = (acc[r.labType] ?? 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )
    return { count: thisYear.length, totalHours: Math.round(totalMinutes / 60), byType }
  }, [completed])

  if (isKid) {
    return (
      <KidLabView
        familyId={familyId}
        childName={profile === UserProfile.Lincoln ? 'Lincoln' : 'London'}
      />
    )
  }

  if (view === 'form') {
    return (
      <Box sx={{ maxWidth: 600, mx: 'auto', px: 2, pt: { xs: 1, md: 2 }, pb: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={handleCancel} sx={{ mb: 2 }}>
          Back
        </Button>
        <LabReportForm
          report={editingReport}
          prefill={prefill}
          children={children}
          completing={completing}
          readOnly={readOnly}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', px: 2, pt: { xs: 1, md: 2 }, pb: 2 }}>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>
        Dad Lab
      </Typography>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 3 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleNew}>
          Plan a Lab
        </Button>
        <Button
          variant="outlined"
          startIcon={<AutoAwesomeIcon />}
          onClick={() => setSuggestionsOpen(true)}
        >
          Suggest a Lab
        </Button>
        <Button
          variant="outlined"
          startIcon={<LightbulbIcon />}
          onClick={() => setIdeaOpen(true)}
        >
          I Have an Idea
        </Button>
      </Stack>

      {loading && <Typography color="text.secondary">Loading...</Typography>}

      {/* ── Section 1: Planned Labs ── */}
      {planned.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Planned
          </Typography>
          <Stack spacing={1.5}>
            {planned.map((report) => (
              <PlannedLabCard
                key={report.id}
                report={report}
                onEdit={handleEdit}
                onStart={handleStartLab}
                onDelete={handleDeleteRequest}
              />
            ))}
          </Stack>
        </Box>
      )}

      {/* ── Section 2: Active Lab ── */}
      {active.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Active
          </Typography>
          <Stack spacing={1.5}>
            {active.map((report) => (
              <ActiveLabCard
                key={report.id}
                report={report}
                familyId={familyId}
                onEdit={handleEdit}
                onComplete={handleCompleteLab}
                onDelete={handleDeleteRequest}
              />
            ))}
          </Stack>
        </Box>
      )}

      {/* ── Section 3: Completed Labs ── */}
      {completed.length > 0 && (
        <>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Completed
          </Typography>
          <Stack spacing={1.5} sx={{ mb: 3 }}>
            {completed.map((report) => (
              <ReportCard key={report.id} report={report} familyId={familyId} onView={handleView} onEdit={handleEdit} />
            ))}
          </Stack>

          <Divider sx={{ mb: 2 }} />
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Stats ({new Date().getFullYear()})
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip label={`${stats.count} labs`} size="small" />
            <Chip label={`${stats.totalHours} hours`} size="small" />
            {Object.entries(stats.byType).map(([type, count]) => (
              <Chip
                key={type}
                label={`${LAB_TYPE_LABELS[type as DadLabType] ?? type}: ${count}`}
                size="small"
                variant="outlined"
              />
            ))}
          </Stack>
        </>
      )}

      {!loading && reports.length === 0 && (
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          No labs yet. Plan your first Saturday lab!
        </Typography>
      )}

      <LabSuggestions
        open={suggestionsOpen}
        onClose={() => setSuggestionsOpen(false)}
        onSelect={handleSuggestionSelect}
      />

      <Dialog
        open={ideaOpen}
        onClose={() => { setIdeaOpen(false); setIdeaResult(null); setIdeaText('') }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Build a Lab from Your Idea</DialogTitle>
        <DialogContent>
          {!ideaResult ? (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Describe your idea — rough is fine. The AI will structure it into a full lab plan
                with roles, materials, and a driving question.
              </Typography>
              <TextField
                fullWidth
                multiline
                minRows={3}
                maxRows={6}
                placeholder="e.g., I want to do something with magnets and see what's magnetic around the house... or: we have cardboard boxes, let's build something... or: Lincoln is interested in volcanoes lately"
                value={ideaText}
                onChange={e => setIdeaText(e.target.value)}
                disabled={ideaLoading}
                autoFocus
              />
              <Button
                variant="contained"
                onClick={handleRefineIdea}
                disabled={!ideaText.trim() || ideaLoading}
                startIcon={ideaLoading ? <CircularProgress size={18} /> : <AutoAwesomeIcon />}
                fullWidth
              >
                {ideaLoading ? 'Building lab plan...' : 'Build This Into a Lab'}
              </Button>
            </Stack>
          ) : (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Here&apos;s your idea structured as a lab. Edit anything, then plan it.
              </Typography>

              <TextField
                label="Title"
                fullWidth
                size="small"
                value={ideaResult.title}
                onChange={e => setIdeaResult({ ...ideaResult, title: e.target.value })}
              />
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {(['science', 'engineering', 'adventure', 'heart'] as DadLabType[]).map(t => (
                  <Chip
                    key={t}
                    label={`${LAB_TYPE_ICONS[t]} ${t}`}
                    onClick={() => setIdeaResult({ ...ideaResult, labType: t })}
                    color={ideaResult.labType === t ? 'primary' : 'default'}
                    variant={ideaResult.labType === t ? 'filled' : 'outlined'}
                  />
                ))}
              </Stack>
              <TextField
                label="Driving Question"
                fullWidth
                size="small"
                value={ideaResult.question}
                onChange={e => setIdeaResult({ ...ideaResult, question: e.target.value })}
              />
              <TextField
                label="Description"
                fullWidth
                size="small"
                multiline
                minRows={2}
                value={ideaResult.description}
                onChange={e => setIdeaResult({ ...ideaResult, description: e.target.value })}
              />
              <TextField
                label="Materials Needed"
                fullWidth
                size="small"
                value={ideaResult.materials?.join(', ') ?? ''}
                onChange={e => setIdeaResult({
                  ...ideaResult,
                  materials: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                })}
                helperText="Comma-separated"
              />
              <TextField
                label="Lincoln's Role"
                fullWidth
                size="small"
                multiline
                minRows={1}
                value={ideaResult.lincolnRole ?? ''}
                onChange={e => setIdeaResult({ ...ideaResult, lincolnRole: e.target.value })}
              />
              <TextField
                label="London's Role"
                fullWidth
                size="small"
                multiline
                minRows={1}
                value={ideaResult.londonRole ?? ''}
                onChange={e => setIdeaResult({ ...ideaResult, londonRole: e.target.value })}
              />

              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  onClick={() => {
                    handleSuggestionSelect(ideaResult)
                    setIdeaOpen(false)
                    setIdeaResult(null)
                    setIdeaText('')
                  }}
                  fullWidth
                >
                  Plan This Lab
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => { setIdeaResult(null) }}
                >
                  Back
                </Button>
              </Stack>
            </Stack>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={handleDeleteCancel}>
        <DialogTitle>Delete Lab?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete &ldquo;{deleteTarget?.title}&rdquo;? This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// ── Planned Lab Card ──────────────────────────────────────────────

function PlannedLabCard({
  report,
  onEdit,
  onStart,
  onDelete,
}: {
  report: DadLabReport
  onEdit: (report: DadLabReport) => void
  onStart: (id: string) => void
  onDelete: (report: DadLabReport) => void
}) {
  return (
    <Card variant="outlined" sx={{ borderLeft: '4px solid', borderLeftColor: 'warning.main' }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <Typography sx={{ fontSize: '1.3rem', mt: 0.3 }}>
            {LAB_TYPE_ICONS[report.labType] ?? ''}
          </Typography>
          <Box sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onEdit(report)}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
                {report.title}
              </Typography>
              <Chip
                label={STATUS_LABELS[report.status]}
                color={STATUS_COLORS[report.status]}
                size="small"
                variant="outlined"
              />
            </Stack>
            {report.question && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontStyle: 'italic', mt: 0.25 }}
                noWrap
              >
                &ldquo;{report.question}&rdquo;
              </Typography>
            )}
            {report.materials && report.materials.length > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Materials: {report.materials.join(', ')}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary">
              {LAB_TYPE_LABELS[report.labType]} &middot; {formatDateShort(report.date)}
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.5}>
            <IconButton
              size="small"
              color="success"
              onClick={() => onStart(report.id!)}
              title="Start Lab"
            >
              <PlayArrowIcon />
            </IconButton>
            <IconButton
              size="small"
              color="error"
              onClick={() => onDelete(report)}
              title="Delete"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

// ── Active Lab Card ───────────────────────────────────────────────

function ActiveLabCard({
  report,
  familyId,
  onEdit,
  onComplete,
  onDelete,
}: {
  report: DadLabReport
  familyId: string
  onEdit: (report: DadLabReport) => void
  onComplete: (report: DadLabReport) => void
  onDelete: (report: DadLabReport) => void
}) {
  const artifactCount = Object.values(report.childReports).reduce(
    (acc, cr) => acc + (cr.artifacts?.length ?? 0),
    0,
  )

  // Check what Lincoln has contributed
  const lincolnReport = report.childReports?.lincoln
  const hasLincolnInput = !!(
    lincolnReport?.prediction ||
    lincolnReport?.explanation ||
    (lincolnReport?.artifacts?.length ?? 0) > 0
  )

  return (
    <Card
      variant="outlined"
      sx={{
        borderLeft: '4px solid',
        borderLeftColor: 'info.main',
        bgcolor: 'action.hover',
      }}
    >
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <Typography sx={{ fontSize: '1.3rem', mt: 0.3 }}>
            {LAB_TYPE_ICONS[report.labType] ?? ''}
          </Typography>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
                {report.title}
              </Typography>
              <Chip label="Active" color="info" size="small" />
            </Stack>
            {report.question && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontStyle: 'italic', mt: 0.25 }}
                noWrap
              >
                &ldquo;{report.question}&rdquo;
              </Typography>
            )}

            {/* Lincoln's contributions summary */}
            {hasLincolnInput && (
              <Box
                sx={{
                  mt: 1,
                  p: 1,
                  bgcolor: 'success.50',
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'success.200',
                }}
              >
                <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>
                  Lincoln contributed:
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                  {lincolnReport?.prediction && (
                    <Chip label="Prediction" size="small" color="success" variant="outlined" />
                  )}
                  {lincolnReport?.explanation && (
                    <Chip label="Explanation" size="small" color="success" variant="outlined" />
                  )}
                  {(lincolnReport?.artifacts?.length ?? 0) > 0 && (
                    <Chip
                      label={`${lincolnReport!.artifacts.length} photo${lincolnReport!.artifacts.length !== 1 ? 's' : ''}`}
                      size="small"
                      color="success"
                      variant="outlined"
                    />
                  )}
                </Stack>
                {/* Lincoln's actual photos + audio */}
                {(lincolnReport?.artifacts?.length ?? 0) > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <ArtifactGallery
                      familyId={familyId}
                      artifactIds={lincolnReport!.artifacts}
                      thumbnailSize={56}
                    />
                  </Box>
                )}
              </Box>
            )}

            {/* London's contributions */}
            {(() => {
              const londonReport = report.childReports?.london
              return (londonReport?.artifacts?.length ?? 0) > 0 ? (
                <Box
                  sx={{
                    mt: 1,
                    p: 1,
                    bgcolor: 'info.50',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'info.200',
                  }}
                >
                  <Typography variant="caption" color="info.main" sx={{ fontWeight: 600 }}>
                    London contributed:
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <ArtifactGallery
                      familyId={familyId}
                      artifactIds={londonReport!.artifacts}
                      thumbnailSize={56}
                    />
                  </Box>
                </Box>
              ) : null
            })()}

            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                {LAB_TYPE_LABELS[report.labType]}
              </Typography>
              {artifactCount > 0 && (
                <Typography variant="caption" color="text.secondary">
                  &middot; {artifactCount} artifact{artifactCount !== 1 ? 's' : ''}
                </Typography>
              )}
            </Stack>
          </Box>

          <Stack spacing={0.5} alignItems="flex-end">
            <Button variant="outlined" size="small" startIcon={<EditIcon />} onClick={() => onEdit(report)}>
              Edit
            </Button>
            <Button variant="contained" size="small" onClick={() => onComplete(report)}>
              Complete
            </Button>
            <IconButton size="small" color="error" onClick={() => onDelete(report)} title="Delete">
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

// ── Completed Report Card ─────────────────────────────────────────

function ReportCard({
  report,
  familyId,
  onView,
  onEdit,
}: {
  report: DadLabReport
  familyId: string
  onView: (report: DadLabReport) => void
  onEdit: (report: DadLabReport) => void
}) {
  const artifactCount = Object.values(report.childReports).reduce(
    (acc, cr) => acc + (cr.artifacts?.length ?? 0),
    0,
  )

  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography sx={{ fontSize: '1.3rem' }}>
            {LAB_TYPE_ICONS[report.labType] ?? ''}
          </Typography>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
              {report.title}
            </Typography>
            <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="caption" color="text.secondary">
                {LAB_TYPE_LABELS[report.labType]}
              </Typography>
              {report.totalMinutes && (
                <Typography variant="caption" color="text.secondary">
                  &middot; {report.totalMinutes} min
                </Typography>
              )}
              {artifactCount > 0 && (
                <Typography variant="caption" color="text.secondary">
                  &middot; {artifactCount} photo{artifactCount !== 1 ? 's' : ''}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                &middot; {formatDateShort(report.date)}
              </Typography>
            </Stack>
            {report.question && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5, fontStyle: 'italic' }}
                noWrap
              >
                &ldquo;{report.question}&rdquo;
              </Typography>
            )}
            {/* Show up to 4 thumbnails in list view */}
            {(() => {
              const allArtifactIds = Object.values(report.childReports)
                .flatMap(cr => cr.artifacts ?? [])
              return allArtifactIds.length > 0 ? (
                <Box sx={{ mt: 0.5 }}>
                  <ArtifactGallery
                    familyId={familyId}
                    artifactIds={allArtifactIds.slice(0, 4)}
                    thumbnailSize={48}
                  />
                </Box>
              ) : null
            })()}
          </Box>
          <Stack direction="row" spacing={0.5}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<EditIcon />}
              onClick={() => onEdit(report)}
            >
              Edit
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<VisibilityIcon />}
              onClick={() => onView(report)}
            >
              View
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}
