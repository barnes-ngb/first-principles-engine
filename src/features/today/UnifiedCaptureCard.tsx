import { useCallback, useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { addDoc, doc, updateDoc } from 'firebase/firestore'

import AudioRecorder from '../../components/AudioRecorder'
import PhotoCapture from '../../components/PhotoCapture'
import SectionCard from '../../components/SectionCard'
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
} from '../../core/types/enums'

const MAX_DURATION_MINUTES = 240

interface CapturePreset {
  id: string
  label: string
  emoji: string
  subjectBucket: SubjectBucket
  suggestedMinutes: number
}

// v1 preset list. Subject buckets match the existing `SubjectBucket` enum
// (Reading | LanguageArts | Math | Science | SocialStudies | Music | Art | PE | Other).
// "Lego" and "Baking" fall back to Art / Other because there is no PracticalArts bucket.
const CAPTURE_PRESETS: CapturePreset[] = [
  { id: 'lego', label: 'Lego build', emoji: '🧱', subjectBucket: SubjectBucket.Art, suggestedMinutes: 45 },
  { id: 'baking', label: 'Baking / cooking', emoji: '🥖', subjectBucket: SubjectBucket.Other, suggestedMinutes: 30 },
  { id: 'nature', label: 'Nature / park', emoji: '🌳', subjectBucket: SubjectBucket.Science, suggestedMinutes: 45 },
  { id: 'music', label: 'Music practice', emoji: '🎵', subjectBucket: SubjectBucket.Music, suggestedMinutes: 20 },
  { id: 'drawing', label: 'Drawing / art', emoji: '🎨', subjectBucket: SubjectBucket.Art, suggestedMinutes: 30 },
  { id: 'reading', label: 'Reading session', emoji: '📚', subjectBucket: SubjectBucket.Reading, suggestedMinutes: 30 },
  { id: 'fieldtrip', label: 'Zoo / museum trip', emoji: '🦁', subjectBucket: SubjectBucket.Science, suggestedMinutes: 120 },
  { id: 'sports', label: 'Sports / PE', emoji: '⚽', subjectBucket: SubjectBucket.PE, suggestedMinutes: 45 },
]

type MediaTab = 'note' | 'photo' | 'audio'

interface UnifiedCaptureCardProps {
  familyId: string
  selectedChildId: string
  today: string
  weekPlanId: string | undefined
  selectableChildren: Child[]
  todayArtifacts: Artifact[]
  setTodayArtifacts: React.Dispatch<React.SetStateAction<Artifact[]>>
  onSnackMessage: (msg: { text: string; severity: 'success' | 'error' }) => void
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
}: UnifiedCaptureCardProps) {
  const [mediaTab, setMediaTab] = useState<MediaTab>('note')
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
    selectableChildren.find((c) => c.id === childId)?.name ?? 'child'

  const resetForm = useCallback(() => {
    setSelectedPresetId(null)
    setActivityName('')
    setSubjectBucket(SubjectBucket.Other)
    setDurationInput('')
    setNoteText('')
    setMediaTab('note')
  }, [])

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

  return (
    <>
      <SectionCard title="Capture">
        <Stack spacing={2}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Quick logs (tap to pre-fill)
            </Typography>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {CAPTURE_PRESETS.map((preset) => {
                const selected = selectedPresetId === preset.id
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
              })}
            </Stack>
          </Box>

          <Divider />

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

          <TextField
            label="What is this?"
            placeholder="e.g. dentist visit, made a fort"
            value={activityName}
            onChange={(event) => setActivityName(event.target.value)}
          />

          <TextField
            label="Category"
            select
            value={subjectBucket}
            onChange={(event) => setSubjectBucket(event.target.value as SubjectBucket)}
          >
            {Object.values(SubjectBucket).map((bucket) => (
              <MenuItem key={bucket} value={bucket}>
                {bucket}
              </MenuItem>
            ))}
          </TextField>

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
                ? `Will log ${parsedDuration} minutes to ${subjectBucket}`
                : `Counts toward ${activeChildName}'s school hours`}
            </Typography>
          </Box>

          <ToggleButtonGroup
            value={mediaTab}
            exclusive
            onChange={(_event, value) => {
              if (value) setMediaTab(value as MediaTab)
            }}
            fullWidth
            size="large"
          >
            <ToggleButton value="note">Note</ToggleButton>
            <ToggleButton value="photo">Photo</ToggleButton>
            <ToggleButton value="audio">Audio</ToggleButton>
          </ToggleButtonGroup>

          {mediaTab === 'note' && (
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
        </Stack>
      </SectionCard>

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
    </>
  )
}
