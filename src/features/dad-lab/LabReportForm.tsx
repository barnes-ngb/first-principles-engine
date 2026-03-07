import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import SaveIcon from '@mui/icons-material/Save'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'

import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import AudioRecorder from '../../components/AudioRecorder'
import PhotoCapture from '../../components/PhotoCapture'
import { useFamilyId } from '../../core/auth/useAuth'
import { artifactsCollection } from '../../core/firebase/firestore'
import { generateFilename, uploadArtifactFile } from '../../core/firebase/upload'
import { useSaveState } from '../../core/hooks/useSaveState'
import type { Child, ChildLabReport, DadLabReport } from '../../core/types/domain'
import { DadLabStatus, DadLabType, EvidenceType, SubjectBucket } from '../../core/types/enums'
import { todayKey, weekKeyFromDate } from '../../core/utils/dateKey'
import { addDoc, updateDoc, doc } from 'firebase/firestore'

// ── Constants ──────────────────────────────────────────────────

const LAB_TYPES: Array<{ value: DadLabType; icon: string; label: string }> = [
  { value: DadLabType.Science, icon: '\u{1F9EA}', label: 'Science' },
  { value: DadLabType.Engineering, icon: '\u{1F528}', label: 'Engineering' },
  { value: DadLabType.Adventure, icon: '\u{1F333}', label: 'Adventure' },
  { value: DadLabType.Heart, icon: '\u{2764}\u{FE0F}', label: 'Heart' },
]

const SUBJECT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: SubjectBucket.Science, label: 'Science' },
  { value: SubjectBucket.Math, label: 'Math' },
  { value: SubjectBucket.Art, label: 'Art' },
  { value: SubjectBucket.PE, label: 'PE' },
  { value: SubjectBucket.Reading, label: 'Reading' },
  { value: SubjectBucket.SocialStudies, label: 'Social Studies' },
  { value: SubjectBucket.Other, label: 'Other' },
]

// Per-child field definitions
const LINCOLN_FIELDS = [
  { key: 'prediction', label: 'Prediction', placeholder: 'What did he think would happen?' },
  { key: 'explanation', label: 'Explanation', placeholder: 'How did he explain it to London?' },
  { key: 'notes', label: 'Notes', placeholder: 'Your observations about Lincoln' },
] as const

const LONDON_FIELDS = [
  { key: 'observation', label: 'Observation', placeholder: 'What did he notice or say?' },
  { key: 'creation', label: 'Creation', placeholder: 'What did he draw/build/make?' },
  { key: 'notes', label: 'Notes', placeholder: 'Your observations about London' },
] as const

// ── Props ──────────────────────────────────────────────────────

interface Prefill {
  title?: string
  question?: string
  labType?: DadLabType
  description?: string
  materials?: string[]
  lincolnRole?: string
  londonRole?: string
}

interface LabReportFormProps {
  report?: DadLabReport
  prefill?: Prefill
  children: Child[]
  onSave: (report: DadLabReport) => Promise<void>
  onCancel: () => void
}

// ── Helper ─────────────────────────────────────────────────────

function emptyChildReport(): ChildLabReport {
  return { artifacts: [] }
}

function getChildFields(childName: string) {
  const lower = childName.toLowerCase()
  if (lower === 'lincoln') return LINCOLN_FIELDS
  if (lower === 'london') return LONDON_FIELDS
  // Fallback: show all fields
  return [...LINCOLN_FIELDS.filter((f) => f.key !== 'notes'), ...LONDON_FIELDS]
}

// ── Component ──────────────────────────────────────────────────

export default function LabReportForm({
  report,
  prefill,
  children,
  onSave,
  onCancel,
}: LabReportFormProps) {
  const familyId = useFamilyId()
  const { saveState, withSave } = useSaveState()

  // Determine if this is an active lab being completed
  const isCompleting = report?.status === DadLabStatus.Active
  const isViewingComplete = report?.status === DadLabStatus.Complete
  const isEditing = !!report && !isCompleting

  // Form state
  const [date, setDate] = useState(report?.date ?? todayKey())
  const [title, setTitle] = useState(report?.title ?? prefill?.title ?? '')
  const [labType, setLabType] = useState<DadLabType>(
    report?.labType ?? prefill?.labType ?? DadLabType.Science,
  )
  const [totalMinutes, setTotalMinutes] = useState(report?.totalMinutes ?? 60)
  const [question, setQuestion] = useState(report?.question ?? prefill?.question ?? '')
  const [description, setDescription] = useState(
    report?.description ?? prefill?.description ?? '',
  )
  const [materials, setMaterials] = useState(
    (report?.materials ?? prefill?.materials ?? []).join(', '),
  )
  const [lincolnRole, setLincolnRole] = useState(
    report?.lincolnRole ?? prefill?.lincolnRole ?? '',
  )
  const [londonRole, setLondonRole] = useState(
    report?.londonRole ?? prefill?.londonRole ?? '',
  )
  const [childReports, setChildReports] = useState<Record<string, ChildLabReport>>(() => {
    if (report?.childReports) return report.childReports
    const initial: Record<string, ChildLabReport> = {}
    for (const child of children) {
      initial[child.id] = emptyChildReport()
    }
    return initial
  })
  const [subjectTags, setSubjectTags] = useState<string[]>(report?.subjectTags ?? [])
  const [skillTags, setSkillTags] = useState<string[]>(report?.skillTags ?? [])
  const [virtueTag, setVirtueTag] = useState(report?.virtueTag ?? '')
  const [dadReflection, setDadReflection] = useState(report?.dadReflection ?? '')
  const [bestMoment, setBestMoment] = useState(report?.bestMoment ?? '')
  const [nextTime, setNextTime] = useState(report?.nextTime ?? '')

  // Photo upload state
  const [uploadingChildId, setUploadingChildId] = useState<string | null>(null)
  const [artifactUrls, setArtifactUrls] = useState<Record<string, string>>({})
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null)

  // Initialize from prefill
  useEffect(() => {
    if (prefill && !report) {
      if (prefill.title) setTitle(prefill.title)
      if (prefill.question) setQuestion(prefill.question)
      if (prefill.labType) setLabType(prefill.labType)
      if (prefill.description) setDescription(prefill.description)
      if (prefill.materials) setMaterials(prefill.materials.join(', '))
      if (prefill.lincolnRole) setLincolnRole(prefill.lincolnRole)
      if (prefill.londonRole) setLondonRole(prefill.londonRole)
    }
  }, [prefill, report])

  // ── Child report field update ──

  const updateChildField = useCallback(
    (childId: string, field: string, value: string) => {
      setChildReports((prev) => ({
        ...prev,
        [childId]: { ...prev[childId] ?? emptyChildReport(), [field]: value },
      }))
    },
    [],
  )

  // ── Photo capture ──

  const handlePhotoCapture = useCallback(
    async (childId: string, file: File) => {
      setUploadingChildId(childId)
      try {
        const ext = file.name.split('.').pop() ?? 'jpg'
        const artifact = {
          childId,
          title: `Dad Lab photo - ${title}`,
          type: EvidenceType.Photo,
          createdAt: new Date().toISOString(),
          tags: {
            engineStage: 'Build' as const,
            domain: 'dad-lab',
            subjectBucket: SubjectBucket.Science,
            location: 'Home',
          },
        }
        const docRef = await addDoc(artifactsCollection(familyId), artifact as never)
        const filename = generateFilename(ext)
        const { downloadUrl } = await uploadArtifactFile(familyId, docRef.id, file, filename)
        await updateDoc(doc(artifactsCollection(familyId), docRef.id), { uri: downloadUrl })

        setChildReports((prev) => {
          const cr = prev[childId] ?? emptyChildReport()
          return { ...prev, [childId]: { ...cr, artifacts: [...cr.artifacts, docRef.id] } }
        })
        setArtifactUrls((prev) => ({ ...prev, [docRef.id]: downloadUrl }))
      } finally {
        setUploadingChildId(null)
      }
    },
    [familyId, title],
  )

  // ── Audio capture ──

  const handleAudioCapture = useCallback(
    async (childId: string, blob: Blob) => {
      setUploadingChildId(childId)
      try {
        const artifact = {
          childId,
          title: `Dad Lab recording - ${title}`,
          type: EvidenceType.Audio,
          createdAt: new Date().toISOString(),
          tags: {
            engineStage: 'Build' as const,
            domain: 'dad-lab',
            subjectBucket: SubjectBucket.Science,
            location: 'Home',
          },
        }
        const docRef = await addDoc(artifactsCollection(familyId), artifact as never)
        const filename = generateFilename('webm')
        const file = new File([blob], filename, { type: 'audio/webm' })
        const { downloadUrl } = await uploadArtifactFile(familyId, docRef.id, file, filename)
        await updateDoc(doc(artifactsCollection(familyId), docRef.id), { uri: downloadUrl })

        setChildReports((prev) => {
          const cr = prev[childId] ?? emptyChildReport()
          return { ...prev, [childId]: { ...cr, artifacts: [...cr.artifacts, docRef.id] } }
        })
        setArtifactUrls((prev) => ({ ...prev, [docRef.id]: downloadUrl }))
      } finally {
        setUploadingChildId(null)
      }
    },
    [familyId, title],
  )

  // ── Subject tag toggle ──

  const toggleSubject = useCallback((subject: string) => {
    setSubjectTags((prev) =>
      prev.includes(subject) ? prev.filter((s) => s !== subject) : [...prev, subject],
    )
  }, [])

  // ── Skill tag ──

  const removeSkillTag = useCallback((tag: string) => {
    setSkillTags((prev) => prev.filter((t) => t !== tag))
  }, [])

  const addSkillTag = useCallback((tag: string) => {
    setSkillTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]))
  }, [])

  // ── Save ──

  const handleSave = useCallback(async () => {
    const dateObj = new Date(date + 'T00:00:00')
    const parsedMaterials = materials
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)

    // Determine status: completing an active lab → complete; editing existing → keep status; new → planned
    let status: DadLabReport['status']
    if (isCompleting) {
      status = DadLabStatus.Complete
    } else if (report?.status) {
      status = report.status
    } else {
      status = DadLabStatus.Planned
    }

    const reportData: DadLabReport = {
      ...(report?.id ? { id: report.id } : {}),
      date,
      weekKey: weekKeyFromDate(dateObj),
      title: title.trim() || 'Untitled Lab',
      labType,
      question: question.trim(),
      description: description.trim(),
      status,
      materials: parsedMaterials.length > 0 ? parsedMaterials : undefined,
      lincolnRole: lincolnRole.trim() || undefined,
      londonRole: londonRole.trim() || undefined,
      childReports,
      subjectTags: subjectTags as DadLabReport['subjectTags'],
      skillTags: skillTags.length > 0 ? skillTags : undefined,
      virtueTag: virtueTag.trim() || undefined,
      dadReflection: dadReflection.trim() || undefined,
      bestMoment: bestMoment.trim() || undefined,
      nextTime: nextTime.trim() || undefined,
      totalMinutes: totalMinutes > 0 ? totalMinutes : undefined,
      createdAt: report?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await withSave(() => onSave(reportData))
  }, [
    date, title, labType, question, description, childReports, materials,
    lincolnRole, londonRole, subjectTags, skillTags, virtueTag, dadReflection,
    bestMoment, nextTime, totalMinutes, report, isCompleting, onSave, withSave,
  ])

  const disabled = isViewingComplete

  // ── Render ──

  return (
    <Stack spacing={3}>
      <Typography variant="h6" sx={{ fontWeight: 700 }}>
        {isCompleting
          ? 'Complete Lab'
          : report
            ? report.title
            : 'Plan a Lab'}
      </Typography>

      {/* Date + Title + Type + Duration */}
      <TextField
        label="Date"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        disabled={disabled || isCompleting}
        fullWidth
        slotProps={{ inputLabel: { shrink: true } }}
      />

      <TextField
        label="Title"
        placeholder="Volcano Lab, Birdhouse Build..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={disabled || isCompleting}
        fullWidth
      />

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          Lab Type
        </Typography>
        <ToggleButtonGroup
          value={labType}
          exclusive
          onChange={(_, val) => val && setLabType(val)}
          disabled={disabled || isCompleting}
          sx={{ flexWrap: 'wrap' }}
        >
          {LAB_TYPES.map((t) => (
            <ToggleButton key={t.value} value={t.value} sx={{ px: 2, py: 1 }}>
              {t.icon} {t.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <TextField
        label="Duration (minutes)"
        type="number"
        value={totalMinutes}
        onChange={(e) => setTotalMinutes(Number(e.target.value))}
        disabled={disabled}
        sx={{ maxWidth: 200 }}
      />

      {/* The Question */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 600 }}>
          The Question
        </Typography>
        <TextField
          placeholder="What question will we explore?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={disabled || isCompleting}
          fullWidth
          multiline
          minRows={2}
        />
      </Box>

      {/* Description / What Happened */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 600 }}>
          {isCompleting ? 'What Happened' : 'Description'}
        </Typography>
        <TextField
          placeholder={isCompleting ? 'Describe what happened...' : 'Describe what you plan to do...'}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={disabled}
          fullWidth
          multiline
          minRows={3}
        />
      </Box>

      {/* Materials (planning fields) */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 600 }}>
          Materials Needed
        </Typography>
        <TextField
          placeholder="Baking soda, vinegar, food coloring..."
          value={materials}
          onChange={(e) => setMaterials(e.target.value)}
          disabled={disabled || isCompleting}
          fullWidth
          helperText="Comma-separated list"
        />
      </Box>

      {/* Role assignments (planning fields) */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 600 }}>
          Roles
        </Typography>
        <Stack spacing={2}>
          <TextField
            label="Lincoln's role"
            placeholder="Makes prediction, runs the experiment, explains to London"
            value={lincolnRole}
            onChange={(e) => setLincolnRole(e.target.value)}
            disabled={disabled || isCompleting}
            fullWidth
            multiline
            minRows={2}
          />
          <TextField
            label="London's role"
            placeholder="Watches, draws what he sees, helps pour"
            value={londonRole}
            onChange={(e) => setLondonRole(e.target.value)}
            disabled={disabled || isCompleting}
            fullWidth
            multiline
            minRows={2}
          />
        </Stack>
      </Box>

      {/* Child contributions summary (shown when completing an active lab) */}
      {isCompleting && (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
            Kid Contributions
          </Typography>
          {children.map((child) => {
            const cr = childReports[child.id]
            const hasPrediction = !!cr?.prediction
            const hasExplanation = !!cr?.explanation
            const hasObservation = !!cr?.observation
            const hasCreation = !!cr?.creation
            const hasArtifacts = (cr?.artifacts?.length ?? 0) > 0
            const hasContent = hasPrediction || hasExplanation || hasObservation || hasCreation || hasArtifacts
            if (!hasContent) return null
            return (
              <Box
                key={child.id}
                sx={{ p: 1.5, mb: 1, borderRadius: 1, bgcolor: 'success.50', border: '1px solid', borderColor: 'success.200' }}
              >
                <Typography variant="subtitle2" color="success.main" sx={{ mb: 0.5 }}>
                  {child.name}&apos;s Work
                </Typography>
                {cr?.prediction && (
                  <Box sx={{ mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">Prediction:</Typography>
                    <Typography variant="body2">{cr.prediction}</Typography>
                  </Box>
                )}
                {cr?.explanation && (
                  <Box sx={{ mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">Explanation:</Typography>
                    <Typography variant="body2">{cr.explanation}</Typography>
                  </Box>
                )}
                {cr?.observation && (
                  <Box sx={{ mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">Observation:</Typography>
                    <Typography variant="body2">{cr.observation}</Typography>
                  </Box>
                )}
                {cr?.creation && (
                  <Box sx={{ mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">Creation:</Typography>
                    <Typography variant="body2">{cr.creation}</Typography>
                  </Box>
                )}
                {hasArtifacts && (
                  <Typography variant="caption" color="text.secondary">
                    {cr!.artifacts.length} artifact{cr!.artifacts.length !== 1 ? 's' : ''} captured
                  </Typography>
                )}
              </Box>
            )
          })}
        </Box>
      )}

      {/* Per-Child Sections (shown for active/completing or complete labs) */}
      {(isCompleting || isViewingComplete || (isEditing && report?.status !== DadLabStatus.Planned)) &&
        children.map((child) => {
          const cr = childReports[child.id] ?? emptyChildReport()
          const fields = getChildFields(child.name)
          const isUploading = uploadingChildId === child.id

          return (
            <Box key={child.id} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                {child.name}
              </Typography>

              <Stack spacing={2}>
                {fields.map((field) => (
                  <TextField
                    key={field.key}
                    label={field.label}
                    placeholder={field.placeholder}
                    value={(cr as unknown as Record<string, unknown>)[field.key] ?? ''}
                    onChange={(e) => updateChildField(child.id, field.key, e.target.value)}
                    disabled={disabled}
                    fullWidth
                    multiline
                    minRows={2}
                  />
                ))}

                {/* Artifact thumbnails */}
                {cr.artifacts.length > 0 && (
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {cr.artifacts.map((artifactId) => {
                      const url = artifactUrls[artifactId]
                      if (!url) return null
                      return (
                        <Box
                          key={artifactId}
                          component="img"
                          src={url}
                          alt="Lab photo"
                          onClick={() => setPreviewPhoto(url)}
                          sx={{
                            width: 80,
                            height: 80,
                            objectFit: 'cover',
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: 'divider',
                            cursor: 'pointer',
                          }}
                        />
                      )
                    })}
                  </Stack>
                )}

                {/* Capture buttons */}
                {!disabled && (
                  <Stack spacing={1}>
                    <PhotoCapture
                      onCapture={(file) => handlePhotoCapture(child.id, file)}
                      uploading={isUploading}
                      multiple
                    />
                    <AudioRecorder
                      onCapture={(blob) => handleAudioCapture(child.id, blob)}
                      uploading={isUploading}
                    />
                  </Stack>
                )}
              </Stack>
            </Box>
          )
        })}

      {/* Tags */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 600 }}>
          Subject Tags
        </Typography>
        <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.5}>
          {SUBJECT_OPTIONS.map((opt) => (
            <FormControlLabel
              key={opt.value}
              control={
                <Checkbox
                  checked={subjectTags.includes(opt.value)}
                  onChange={() => toggleSubject(opt.value)}
                  disabled={disabled}
                  size="small"
                />
              }
              label={opt.label}
              sx={{ mr: 0 }}
            />
          ))}
        </Stack>
      </Box>

      {/* Skill Tags */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 600 }}>
          Skill Tags
        </Typography>
        <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.5} sx={{ mb: 1 }}>
          {skillTags.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              onDelete={disabled ? undefined : () => removeSkillTag(tag)}
              size="small"
            />
          ))}
        </Stack>
        {!disabled && (
          <TextField
            placeholder="Type a skill tag and press Enter"
            size="small"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const input = e.target as HTMLInputElement
                const val = input.value.trim()
                if (val) {
                  addSkillTag(val)
                  input.value = ''
                }
              }
            }}
            fullWidth
          />
        )}
      </Box>

      {/* Virtue Tag (for heart labs) */}
      {labType === DadLabType.Heart && (
        <TextField
          label="Virtue"
          placeholder="What virtue or character trait?"
          value={virtueTag}
          onChange={(e) => setVirtueTag(e.target.value)}
          disabled={disabled}
          fullWidth
        />
      )}

      {/* Reflection (shown when completing or viewing complete) */}
      {(isCompleting || isViewingComplete) && (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 600 }}>
            Reflection
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Best moment"
              placeholder="The highlight of the lab"
              value={bestMoment}
              onChange={(e) => setBestMoment(e.target.value)}
              disabled={disabled}
              fullWidth
              multiline
              minRows={2}
            />
            <TextField
              label="Next time"
              placeholder="What to do differently"
              value={nextTime}
              onChange={(e) => setNextTime(e.target.value)}
              disabled={disabled}
              fullWidth
            />
            <TextField
              label="Dad's thoughts"
              placeholder="How did it go?"
              value={dadReflection}
              onChange={(e) => setDadReflection(e.target.value)}
              disabled={disabled}
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </Box>
      )}

      {/* Save / Complete button */}
      {!disabled && (
        <Button
          variant="contained"
          size="large"
          startIcon={
            saveState === 'saving' ? (
              <CircularProgress size={18} />
            ) : isCompleting ? (
              <CheckCircleIcon />
            ) : (
              <SaveIcon />
            )
          }
          onClick={handleSave}
          disabled={saveState === 'saving' || !title.trim()}
          color={isCompleting ? 'success' : 'primary'}
          sx={{ height: 56 }}
        >
          {saveState === 'saving'
            ? 'Saving...'
            : isCompleting
              ? 'Complete Lab'
              : 'Save Lab'}
        </Button>
      )}

      {disabled && (
        <Button variant="outlined" onClick={onCancel}>
          Back
        </Button>
      )}

      {/* Photo preview dialog */}
      <Dialog open={!!previewPhoto} onClose={() => setPreviewPhoto(null)} maxWidth="md">
        <DialogContent sx={{ p: 0 }}>
          <Box
            component="img"
            src={previewPhoto ?? undefined}
            sx={{ width: '100%', display: 'block' }}
          />
        </DialogContent>
      </Dialog>
    </Stack>
  )
}
