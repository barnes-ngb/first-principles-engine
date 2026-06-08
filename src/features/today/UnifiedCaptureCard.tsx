import { useCallback, useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import { addDoc, doc, updateDoc } from 'firebase/firestore'

import AudioRecorder from '../../components/AudioRecorder'
import PhotoCapture from '../../components/PhotoCapture'
import SectionCard from '../../components/SectionCard'
import { kidPalette } from '../../app/tokens'
import {
  artifactsCollection,
  hoursCollection,
} from '../../core/firebase/firestore'
import {
  generateFilename,
  uploadArtifactFile,
} from '../../core/firebase/upload'
import type { Artifact, Child } from '../../core/types'
import {
  EngineStage,
  EvidenceType,
  LearningLocation,
  SubjectBucket,
  SubjectBucketLabel,
} from '../../core/types/enums'

const MAX_DURATION_MINUTES = 240
const DURATION_STEP = 5

interface CapturePreset {
  id: string
  label: string
  emoji: string
  subjectBucket: SubjectBucket
  suggestedMinutes: number
}

interface PresetGroup {
  label: string
  presets: CapturePreset[]
}

// v1 preset list, grouped by mental model. Subject buckets match the existing
// `SubjectBucket` enum (Reading | LanguageArts | Math | Science | SocialStudies |
// Music | Art | PracticalArts | PE | Other).
const PRESET_GROUPS: PresetGroup[] = [
  {
    label: 'Creative',
    presets: [
      { id: 'lego', label: 'Lego build', emoji: '🧱', subjectBucket: SubjectBucket.PracticalArts, suggestedMinutes: 45 },
      { id: 'baking', label: 'Baking / cooking', emoji: '🥖', subjectBucket: SubjectBucket.PracticalArts, suggestedMinutes: 30 },
      { id: 'drawing', label: 'Drawing / art', emoji: '🎨', subjectBucket: SubjectBucket.Art, suggestedMinutes: 30 },
      { id: 'music', label: 'Music practice', emoji: '🎵', subjectBucket: SubjectBucket.Music, suggestedMinutes: 20 },
      { id: 'reading', label: 'Reading session', emoji: '📚', subjectBucket: SubjectBucket.Reading, suggestedMinutes: 30 },
    ],
  },
  {
    label: 'Active',
    presets: [
      { id: 'nature', label: 'Nature / park', emoji: '🌳', subjectBucket: SubjectBucket.Science, suggestedMinutes: 45 },
      { id: 'sports', label: 'Sports / PE', emoji: '⚽', subjectBucket: SubjectBucket.PE, suggestedMinutes: 45 },
      { id: 'fieldtrip', label: 'Zoo / museum trip', emoji: '🦁', subjectBucket: SubjectBucket.Science, suggestedMinutes: 120 },
    ],
  },
]

type MediaTab = 'note' | 'photo' | 'audio'

type Variant = 'parent' | 'kid'

interface KidThemeTokens {
  accent: string
  saveColor: 'primary' | 'success' | 'secondary'
  fontFamily?: string
  chipSelectedBg: string
}

function getKidTheme(childName: string | undefined): KidThemeTokens {
  const isLincoln = (childName ?? '').toLowerCase() === 'lincoln'
  if (isLincoln) {
    return {
      accent: kidPalette.xpGreen,
      saveColor: 'success',
      fontFamily: '"Press Start 2P", monospace',
      chipSelectedBg: kidPalette.xpGreen,
    }
  }
  // London / default story palette
  return {
    accent: '#9DC183',
    saveColor: 'primary',
    fontFamily: '"Fredoka", "Comic Sans MS", sans-serif',
    chipSelectedBg: '#9DC183',
  }
}

interface UnifiedCaptureCardProps {
  familyId: string
  selectedChildId: string
  today: string
  weekPlanId: string | undefined
  selectableChildren: Child[]
  todayArtifacts: Artifact[]
  setTodayArtifacts: React.Dispatch<React.SetStateAction<Artifact[]>>
  onSnackMessage: (msg: { text: string; severity: 'success' | 'error' }) => void
  /** 'parent' (default) — full form. 'kid' — chip-required, +/- duration, audio-only note. */
  variant?: Variant
  /** Required when variant='kid' for per-child theming. */
  activeChild?: Child
}

export default function UnifiedCaptureCard({
  familyId,
  selectedChildId,
  today,
  weekPlanId,
  selectableChildren,
  todayArtifacts,
  setTodayArtifacts,
  onSnackMessage,
  variant = 'parent',
  activeChild,
}: UnifiedCaptureCardProps) {
  const isKid = variant === 'kid'
  const kidTheme = useMemo(
    () => (isKid ? getKidTheme(activeChild?.name) : null),
    [isKid, activeChild?.name],
  )

  // Kid variant defaults the media row to no tab selected; parent stays on note.
  const [mediaTab, setMediaTab] = useState<MediaTab | null>(isKid ? null : 'note')
  const [mediaUploading, setMediaUploading] = useState(false)
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  const [childId, setChildId] = useState(selectedChildId)
  const [activityName, setActivityName] = useState('')
  const [subjectBucket, setSubjectBucket] = useState<SubjectBucket>(SubjectBucket.Other)
  const [durationInput, setDurationInput] = useState('')
  const [noteText, setNoteText] = useState('')

  // Keep childId in sync with active child
  useEffect(() => {
    setChildId(selectedChildId)
  }, [selectedChildId])

  const parsedDuration = useMemo(() => {
    if (durationInput.trim() === '') return 0
    const n = Math.floor(Number(durationInput))
    if (!Number.isFinite(n) || n <= 0) return 0
    return Math.min(n, MAX_DURATION_MINUTES)
  }, [durationInput])

  const activeChildName =
    selectableChildren.find((c) => c.id === childId)?.name ?? activeChild?.name ?? 'child'

  const resetForm = useCallback(() => {
    setSelectedPresetId(null)
    setActivityName('')
    setSubjectBucket(SubjectBucket.Other)
    setDurationInput('')
    setNoteText('')
    setMediaTab(isKid ? null : 'note')
  }, [isKid])

  const handlePresetTap = useCallback((preset: CapturePreset) => {
    if (selectedPresetId === preset.id) {
      // De-select: clear the three pre-filled fields
      setSelectedPresetId(null)
      setActivityName('')
      setSubjectBucket(SubjectBucket.Other)
      setDurationInput('')
      return
    }
    setSelectedPresetId(preset.id)
    setActivityName(preset.label)
    setSubjectBucket(preset.subjectBucket)
    setDurationInput(String(preset.suggestedMinutes))
  }, [selectedPresetId])

  const buildArtifactBase = useCallback(
    (title: string, evidenceType: EvidenceType) => ({
      title,
      type: evidenceType,
      createdAt: new Date().toISOString(),
      childId,
      dayLogId: today,
      weekPlanId,
      tags: {
        engineStage: EngineStage.Build,
        domain: '',
        subjectBucket,
        location: LearningLocation.Home,
      },
      notes: '',
    }),
    [childId, today, weekPlanId, subjectBucket],
  )

  const writeHours = useCallback(
    async (minutes: number, notes: string): Promise<boolean> => {
      if (minutes <= 0) return false
      try {
        await addDoc(hoursCollection(familyId), {
          childId,
          date: today,
          minutes,
          subjectBucket,
          location: LearningLocation.Home,
          source: 'unified-capture',
          quickCapture: true,
          notes: notes || activityName || 'Capture',
        })
        return true
      } catch (err) {
        console.error('Failed to log unified-capture hours', err)
        return false
      }
    },
    [familyId, childId, subjectBucket, today, activityName],
  )

  const toastForResult = useCallback(
    ({ artifactSaved, hoursMinutes, hoursOk }: { artifactSaved: boolean; hoursMinutes: number; hoursOk: boolean }) => {
      if (artifactSaved && hoursMinutes > 0) {
        onSnackMessage({
          text: hoursOk
            ? `Captured + ${hoursMinutes} min logged`
            : "Captured (couldn't log hours — try again from Records)",
          severity: hoursOk ? 'success' : 'error',
        })
      } else if (artifactSaved) {
        onSnackMessage({ text: 'Captured', severity: 'success' })
      } else if (hoursMinutes > 0) {
        onSnackMessage({
          text: hoursOk
            ? `Logged ${hoursMinutes} min`
            : "Couldn't log hours — try again from Records",
          severity: hoursOk ? 'success' : 'error',
        })
      }
    },
    [onSnackMessage],
  )

  const handleNoteSave = useCallback(async () => {
    const content = noteText.trim()
    const minutes = parsedDuration
    const titleSeed = activityName.trim() || content.slice(0, 60) || `Capture ${today}`
    const hoursNotes = activityName.trim()
      ? content
        ? `${activityName.trim()}: ${content}`
        : activityName.trim()
      : content

    let artifactSaved = false
    if (content) {
      try {
        const artifact = {
          ...buildArtifactBase(titleSeed, EvidenceType.Note),
          content: noteText,
          activityName: activityName.trim() || undefined,
        }
        const docRef = await addDoc(artifactsCollection(familyId), artifact)
        setTodayArtifacts((prev) => [{ ...artifact, id: docRef.id }, ...prev])
        artifactSaved = true
      } catch (err) {
        console.error('Failed to save artifact', err)
        onSnackMessage({ text: 'Failed to save note.', severity: 'error' })
        return
      }
    }

    const hoursOk = minutes > 0 ? await writeHours(minutes, hoursNotes) : false
    toastForResult({ artifactSaved, hoursMinutes: minutes, hoursOk })
    resetForm()
  }, [
    noteText,
    parsedDuration,
    activityName,
    today,
    buildArtifactBase,
    familyId,
    setTodayArtifacts,
    onSnackMessage,
    writeHours,
    toastForResult,
    resetForm,
  ])

  const handlePhotoCapture = useCallback(
    async (file: File) => {
      setMediaUploading(true)
      try {
        const title = activityName.trim() || `Photo ${today}`
        const artifact = {
          ...buildArtifactBase(title, EvidenceType.Photo),
          activityName: activityName.trim() || undefined,
        }
        const docRef = await addDoc(artifactsCollection(familyId), artifact)
        const ext = file.name.split('.').pop() ?? 'jpg'
        const filename = generateFilename(ext)
        const { downloadUrl } = await uploadArtifactFile(familyId, docRef.id, file, filename)
        await updateDoc(doc(artifactsCollection(familyId), docRef.id), { uri: downloadUrl })
        setTodayArtifacts((prev) => [
          { ...artifact, id: docRef.id, uri: downloadUrl },
          ...prev,
        ])
        const minutes = parsedDuration
        const hoursOk = minutes > 0 ? await writeHours(minutes, title) : false
        toastForResult({ artifactSaved: true, hoursMinutes: minutes, hoursOk })
        resetForm()
      } catch (err) {
        console.error('Photo upload failed', err)
        onSnackMessage({ text: 'Photo upload failed.', severity: 'error' })
      } finally {
        setMediaUploading(false)
      }
    },
    [
      activityName,
      today,
      buildArtifactBase,
      familyId,
      setTodayArtifacts,
      onSnackMessage,
      parsedDuration,
      writeHours,
      toastForResult,
      resetForm,
    ],
  )

  const handleAudioCapture = useCallback(
    async (blob: Blob) => {
      setMediaUploading(true)
      try {
        const title = activityName.trim() || `Audio ${today}`
        const artifact = {
          ...buildArtifactBase(title, EvidenceType.Audio),
          activityName: activityName.trim() || undefined,
        }
        const docRef = await addDoc(artifactsCollection(familyId), artifact)
        const filename = generateFilename('webm')
        const { downloadUrl } = await uploadArtifactFile(familyId, docRef.id, blob, filename)
        await updateDoc(doc(artifactsCollection(familyId), docRef.id), { uri: downloadUrl })
        setTodayArtifacts((prev) => [
          { ...artifact, id: docRef.id, uri: downloadUrl },
          ...prev,
        ])
        const minutes = parsedDuration
        const hoursOk = minutes > 0 ? await writeHours(minutes, title) : false
        toastForResult({ artifactSaved: true, hoursMinutes: minutes, hoursOk })
        resetForm()
      } catch (err) {
        console.error('Audio upload failed', err)
        onSnackMessage({ text: 'Audio upload failed.', severity: 'error' })
      } finally {
        setMediaUploading(false)
      }
    },
    [
      activityName,
      today,
      buildArtifactBase,
      familyId,
      setTodayArtifacts,
      onSnackMessage,
      parsedDuration,
      writeHours,
      toastForResult,
      resetForm,
    ],
  )

  // ── Parent save (note tab) disabled state ──
  const noteSaveDisabled =
    mediaTab !== 'note' ||
    (!noteText.trim() && parsedDuration <= 0) ||
    (parsedDuration > 0 && (!childId || !subjectBucket))

  const noteSaveTooltip = (() => {
    if (mediaTab !== 'note') return undefined
    if (!noteText.trim() && parsedDuration <= 0) {
      return 'Add a photo, audio, note, or duration'
    }
    if (parsedDuration > 0 && (!childId || !subjectBucket)) {
      return 'Pick a child and subject first'
    }
    return undefined
  })()

  // ── Kid save (always visible) disabled state ──
  const kidSaveDisabled = !selectedPresetId || parsedDuration <= 0
  const kidSaveHelper = !selectedPresetId
    ? 'Tap a chip above to start'
    : parsedDuration <= 0
      ? 'Use + to add some minutes'
      : undefined

  const handleKidSave = useCallback(async () => {
    if (kidSaveDisabled) return
    const minutes = parsedDuration
    const hoursOk = await writeHours(minutes, activityName.trim())
    toastForResult({ artifactSaved: false, hoursMinutes: minutes, hoursOk })
    resetForm()
  }, [kidSaveDisabled, parsedDuration, writeHours, activityName, toastForResult, resetForm])

  const stepDuration = useCallback((delta: number) => {
    const current = parsedDuration
    const next = Math.max(0, Math.min(MAX_DURATION_MINUTES, current + delta))
    setDurationInput(next === 0 ? '' : String(next))
  }, [parsedDuration])

  // ── Chip rendering helpers ──
  const renderChip = (preset: CapturePreset) => {
    const selected = selectedPresetId === preset.id
    if (isKid && kidTheme) {
      return (
        <Chip
          key={preset.id}
          label={`${preset.emoji} ${preset.label}`}
          onClick={() => handlePresetTap(preset)}
          variant={selected ? 'filled' : 'outlined'}
          sx={{
            py: 2.5,
            px: 1,
            height: 'auto',
            fontSize: '1rem',
            fontFamily: kidTheme.fontFamily,
            bgcolor: selected ? kidTheme.chipSelectedBg : undefined,
            borderColor: kidTheme.accent,
            borderWidth: 2,
            color: selected ? '#000' : 'text.primary',
            '& .MuiChip-label': {
              px: 1.25,
              py: 0.5,
              fontSize: '0.95rem',
              whiteSpace: 'normal',
            },
          }}
        />
      )
    }
    return (
      <Chip
        key={preset.id}
        label={`${preset.emoji} ${preset.label}`}
        onClick={() => handlePresetTap(preset)}
        color={selected ? 'primary' : 'default'}
        variant={selected ? 'filled' : 'outlined'}
        size="small"
      />
    )
  }

  return (
    <>
      <SectionCard title="Capture">
        <Stack spacing={2}>
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: 'block',
                mb: 1,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Quick logs
            </Typography>
            <Stack spacing={1.5}>
              {PRESET_GROUPS.map((group) => (
                <Box key={group.label}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      display: 'block',
                      mb: 0.5,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      fontSize: 12,
                    }}
                  >
                    {group.label}
                  </Typography>
                  <Stack
                    direction="row"
                    spacing={isKid ? 1 : 0.75}
                    flexWrap="wrap"
                    useFlexGap
                  >
                    {group.presets.map(renderChip)}
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Box>

          <Divider />

          {!isKid && (
            <TextField
              label="Child"
              select
              value={childId}
              onChange={(event) => setChildId(event.target.value)}
            >
              <MenuItem value="" disabled>
                Select child
              </MenuItem>
              {selectableChildren.map((child) => (
                <MenuItem key={child.id} value={child.id}>
                  {child.name}
                </MenuItem>
              ))}
            </TextField>
          )}

          {!isKid && (
            <TextField
              label="What is this?"
              placeholder="e.g. dentist visit, made a fort"
              value={activityName}
              onChange={(event) => setActivityName(event.target.value)}
            />
          )}

          {!isKid && (
            <TextField
              label="Category"
              select
              value={subjectBucket}
              onChange={(event) => setSubjectBucket(event.target.value as SubjectBucket)}
            >
              {Object.values(SubjectBucket).map((bucket) => (
                <MenuItem key={bucket} value={bucket}>
                  {SubjectBucketLabel[bucket]}
                </MenuItem>
              ))}
            </TextField>
          )}

          {isKid ? (
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display: 'block',
                  mb: 1,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  fontSize: 12,
                }}
              >
                How long?
              </Typography>
              <Stack direction="row" alignItems="center" spacing={2} justifyContent="center">
                <IconButton
                  size="large"
                  onClick={() => stepDuration(-DURATION_STEP)}
                  disabled={parsedDuration <= 0}
                  aria-label="Decrease duration"
                  sx={{
                    border: '2px solid',
                    borderColor: kidTheme?.accent ?? 'primary.main',
                    width: 56,
                    height: 56,
                  }}
                >
                  <RemoveIcon fontSize="large" />
                </IconButton>
                <Typography
                  variant="h3"
                  sx={{
                    minWidth: 96,
                    textAlign: 'center',
                    fontFamily: kidTheme?.fontFamily,
                    fontSize: kidTheme?.fontFamily ? '1.5rem' : '2.5rem',
                  }}
                  aria-label="Duration in minutes"
                  data-testid="kid-duration-display"
                >
                  {parsedDuration}
                </Typography>
                <IconButton
                  size="large"
                  onClick={() => stepDuration(DURATION_STEP)}
                  disabled={parsedDuration >= MAX_DURATION_MINUTES}
                  aria-label="Increase duration"
                  sx={{
                    border: '2px solid',
                    borderColor: kidTheme?.accent ?? 'primary.main',
                    width: 56,
                    height: 56,
                  }}
                >
                  <AddIcon fontSize="large" />
                </IconButton>
              </Stack>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 1, textAlign: 'center' }}
              >
                minutes
              </Typography>
            </Box>
          ) : (
            <Box>
              <TextField
                label="How long? (optional)"
                type="number"
                value={durationInput}
                onChange={(event) => {
                  const raw = event.target.value
                  if (raw === '') {
                    setDurationInput('')
                    return
                  }
                  const n = Math.floor(Number(raw))
                  if (!Number.isFinite(n) || n < 0) return
                  setDurationInput(String(Math.min(n, MAX_DURATION_MINUTES)))
                }}
                inputProps={{
                  min: 0,
                  max: MAX_DURATION_MINUTES,
                  inputMode: 'numeric',
                  'aria-label': 'Duration in minutes',
                }}
                InputProps={{
                  endAdornment: (
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                      minutes
                    </Typography>
                  ),
                }}
                fullWidth
              />
              <Typography
                variant="caption"
                color="text.secondary"
                fontStyle="italic"
                sx={{ display: 'block', mt: 0.5 }}
              >
                {parsedDuration > 0
                  ? `Will log ${parsedDuration} minutes to ${SubjectBucketLabel[subjectBucket]}`
                  : `Counts toward ${activeChildName}'s school hours`}
              </Typography>
            </Box>
          )}

          <ToggleButtonGroup
            value={mediaTab}
            exclusive
            onChange={(_event, value) => {
              setMediaTab(value as MediaTab | null)
            }}
            fullWidth
            size="large"
          >
            {!isKid && <ToggleButton value="note">Note</ToggleButton>}
            <ToggleButton value="photo">📷 Photo</ToggleButton>
            <ToggleButton value="audio">🎤 Audio</ToggleButton>
          </ToggleButtonGroup>

          {mediaTab === 'note' && !isKid && (
            <>
              <TextField
                label="Note (optional)"
                multiline
                minRows={3}
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
              />
              <Button
                variant="contained"
                onClick={handleNoteSave}
                disabled={noteSaveDisabled}
                title={noteSaveTooltip}
              >
                Save Capture
              </Button>
            </>
          )}
          {mediaTab === 'photo' && (
            <PhotoCapture onCapture={handlePhotoCapture} uploading={mediaUploading} />
          )}
          {mediaTab === 'audio' && (
            <AudioRecorder onCapture={handleAudioCapture} uploading={mediaUploading} />
          )}

          {isKid && kidTheme && (
            <Stack spacing={0.5}>
              <Button
                variant="contained"
                color={kidTheme.saveColor}
                onClick={handleKidSave}
                disabled={kidSaveDisabled}
                size="large"
                fullWidth
                sx={{
                  py: 1.75,
                  fontSize: '1.1rem',
                  fontFamily: kidTheme.fontFamily,
                  bgcolor: kidTheme.accent,
                  color: '#000',
                  '&:hover': { bgcolor: kidTheme.accent, opacity: 0.9 },
                  '&.Mui-disabled': { bgcolor: 'action.disabledBackground' },
                }}
                title={kidSaveHelper}
              >
                Save Capture
              </Button>
              {kidSaveHelper && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', textAlign: 'center' }}
                >
                  {kidSaveHelper}
                </Typography>
              )}
            </Stack>
          )}
        </Stack>
      </SectionCard>

      {!isKid && (
        <SectionCard title="Artifacts">
          <Stack spacing={2}>
            {todayArtifacts.length === 0 ? (
              <Typography color="text.secondary">
                No artifacts logged yet today.
              </Typography>
            ) : (
              <List dense>
                {todayArtifacts.map((artifact) => (
                  <ListItem key={artifact.id ?? artifact.title} disableGutters>
                    <Stack spacing={1} sx={{ width: '100%' }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2">{artifact.title}</Typography>
                        <Chip size="small" label={artifact.type} />
                      </Stack>
                      {artifact.type === EvidenceType.Photo && artifact.uri && (
                        <Box
                          component="img"
                          src={artifact.uri}
                          alt={artifact.title}
                          sx={{
                            width: '100%',
                            maxHeight: 180,
                            objectFit: 'contain',
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: 'divider',
                          }}
                        />
                      )}
                      {artifact.type === EvidenceType.Audio && artifact.uri && (
                        <Box component="audio" controls src={artifact.uri} sx={{ width: '100%' }} />
                      )}
                    </Stack>
                  </ListItem>
                ))}
              </List>
            )}
          </Stack>
        </SectionCard>
      )}
    </>
  )
}
