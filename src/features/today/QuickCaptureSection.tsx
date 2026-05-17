import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
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

interface QuickCaptureSectionProps {
  familyId: string
  selectedChildId: string
  today: string
  weekPlanId: string | undefined
  selectableChildren: Child[]
  todayArtifacts: Artifact[]
  setTodayArtifacts: React.Dispatch<React.SetStateAction<Artifact[]>>
  onSnackMessage: (msg: { text: string; severity: 'success' | 'error' }) => void
}

export default function QuickCaptureSection({
  familyId,
  selectedChildId,
  today,
  weekPlanId,
  selectableChildren,
  todayArtifacts,
  setTodayArtifacts,
  onSnackMessage,
}: QuickCaptureSectionProps) {
  const [mediaUploading, setMediaUploading] = useState(false)
  const [durationInput, setDurationInput] = useState('')
  const [artifactForm, setArtifactForm] = useState({
    childId: selectedChildId,
    evidenceType: EvidenceType.Note as EvidenceType,
    subjectBucket: SubjectBucket.Reading,
    content: '',
  })

  const parsedDuration = (() => {
    if (durationInput.trim() === '') return 0
    const n = Math.floor(Number(durationInput))
    if (!Number.isFinite(n) || n <= 0) return 0
    return Math.min(n, MAX_DURATION_MINUTES)
  })()

  const activeChildName =
    selectableChildren.find((c) => c.id === artifactForm.childId)?.name ?? 'child'

  // Keep artifact form childId in sync with active child
  useEffect(() => {
    setArtifactForm((prev) => ({ ...prev, childId: selectedChildId }))
  }, [selectedChildId])

  const handleArtifactChange = useCallback(
    (
      field: keyof typeof artifactForm,
      value: (typeof artifactForm)[keyof typeof artifactForm],
    ) => {
      setArtifactForm((prev) => ({ ...prev, [field]: value }))
    },
    [],
  )

  const writeQuickCaptureHours = useCallback(
    async (minutes: number, notes: string): Promise<boolean> => {
      if (minutes <= 0) return false
      try {
        await addDoc(hoursCollection(familyId), {
          childId: artifactForm.childId,
          date: today,
          minutes,
          subjectBucket: artifactForm.subjectBucket,
          location: LearningLocation.Home,
          source: 'quick-capture',
          quickCapture: true,
          notes: notes || 'Quick Capture',
        })
        return true
      } catch (err) {
        console.error('Failed to log Quick Capture hours', err)
        return false
      }
    },
    [familyId, artifactForm.childId, artifactForm.subjectBucket, today],
  )

  const buildArtifactBase = useCallback(
    (title: string, evidenceType: EvidenceType) => {
      const createdAt = new Date().toISOString()
      return {
        title,
        type: evidenceType,
        createdAt,
        childId: artifactForm.childId,
        dayLogId: today,
        weekPlanId,
        tags: {
          engineStage: EngineStage.Build,
          domain: '',
          subjectBucket: artifactForm.subjectBucket,
          location: LearningLocation.Home,
        },
        notes: '',
      }
    },
    [artifactForm, today, weekPlanId],
  )

  const handleArtifactSave = useCallback(async () => {
    const content = artifactForm.content.trim()
    const title = content.slice(0, 60) || `Artifact for ${today}`

    const artifact = {
      ...buildArtifactBase(title, EvidenceType.Note),
      content: artifactForm.content,
    }

    try {
      const docRef = await addDoc(artifactsCollection(familyId), artifact)
      setTodayArtifacts((prev) => [{ ...artifact, id: docRef.id }, ...prev])
      setArtifactForm((prev) => ({ ...prev, content: '' }))
      const minutes = parsedDuration
      if (minutes > 0) {
        const ok = await writeQuickCaptureHours(minutes, content)
        setDurationInput('')
        onSnackMessage({
          text: ok
            ? `Captured + ${minutes} min logged`
            : "Captured (couldn't log hours — try again from Records)",
          severity: ok ? 'success' : 'error',
        })
      } else {
        onSnackMessage({ text: 'Captured', severity: 'success' })
      }
    } catch (err) {
      console.error('Failed to save artifact', err)
      onSnackMessage({ text: 'Failed to save note.', severity: 'error' })
    }
  }, [
    artifactForm,
    buildArtifactBase,
    familyId,
    today,
    setTodayArtifacts,
    onSnackMessage,
    parsedDuration,
    writeQuickCaptureHours,
  ])

  const handlePhotoCapture = useCallback(
    async (file: File) => {
      setMediaUploading(true)
      try {
        const title = `Photo ${today}`
        const artifact = buildArtifactBase(title, EvidenceType.Photo)
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
        if (minutes > 0) {
          const ok = await writeQuickCaptureHours(minutes, title)
          setDurationInput('')
          onSnackMessage({
            text: ok
              ? `Captured + ${minutes} min logged`
              : "Captured (couldn't log hours — try again from Records)",
            severity: ok ? 'success' : 'error',
          })
        } else {
          onSnackMessage({ text: 'Captured', severity: 'success' })
        }
      } catch (err) {
        console.error('Photo upload failed', err)
        onSnackMessage({ text: 'Photo upload failed.', severity: 'error' })
      } finally {
        setMediaUploading(false)
      }
    },
    [
      buildArtifactBase,
      familyId,
      today,
      setTodayArtifacts,
      onSnackMessage,
      parsedDuration,
      writeQuickCaptureHours,
    ],
  )

  const handleAudioCapture = useCallback(
    async (blob: Blob) => {
      setMediaUploading(true)
      try {
        const title = `Audio ${today}`
        const artifact = buildArtifactBase(title, EvidenceType.Audio)
        const docRef = await addDoc(artifactsCollection(familyId), artifact)
        const filename = generateFilename('webm')
        const { downloadUrl } = await uploadArtifactFile(familyId, docRef.id, blob, filename)
        await updateDoc(doc(artifactsCollection(familyId), docRef.id), { uri: downloadUrl })
        setTodayArtifacts((prev) => [
          { ...artifact, id: docRef.id, uri: downloadUrl },
          ...prev,
        ])
        const minutes = parsedDuration
        if (minutes > 0) {
          const ok = await writeQuickCaptureHours(minutes, title)
          setDurationInput('')
          onSnackMessage({
            text: ok
              ? `Captured + ${minutes} min logged`
              : "Captured (couldn't log hours — try again from Records)",
            severity: ok ? 'success' : 'error',
          })
        } else {
          onSnackMessage({ text: 'Captured', severity: 'success' })
        }
      } catch (err) {
        console.error('Audio upload failed', err)
        onSnackMessage({ text: 'Audio upload failed.', severity: 'error' })
      } finally {
        setMediaUploading(false)
      }
    },
    [
      buildArtifactBase,
      familyId,
      today,
      setTodayArtifacts,
      onSnackMessage,
      parsedDuration,
      writeQuickCaptureHours,
    ],
  )

  return (
    <>
      <SectionCard title="Quick Capture">
        <Stack spacing={2}>
          <ToggleButtonGroup
            value={artifactForm.evidenceType}
            exclusive
            onChange={(_event, value) => {
              if (value) handleArtifactChange('evidenceType', value)
            }}
            fullWidth
            size="large"
          >
            <ToggleButton value={EvidenceType.Note}>Note</ToggleButton>
            <ToggleButton value={EvidenceType.Photo}>Photo</ToggleButton>
            <ToggleButton value={EvidenceType.Audio}>Audio</ToggleButton>
          </ToggleButtonGroup>
          <TextField
            label="Child"
            select
            value={artifactForm.childId}
            onChange={(event) => handleArtifactChange('childId', event.target.value)}
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
            label="Subject bucket"
            select
            value={artifactForm.subjectBucket}
            onChange={(event) =>
              handleArtifactChange(
                'subjectBucket',
                event.target.value as SubjectBucket,
              )
            }
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
                ? `Will log ${parsedDuration} minutes to ${artifactForm.subjectBucket}`
                : `Counts toward ${activeChildName}'s school hours`}
            </Typography>
          </Box>
          {artifactForm.evidenceType === EvidenceType.Note && (
            <>
              <TextField
                label="Content"
                multiline
                minRows={3}
                value={artifactForm.content}
                onChange={(event) => handleArtifactChange('content', event.target.value)}
              />
              <Button
                variant="contained"
                onClick={handleArtifactSave}
                disabled={
                  parsedDuration > 0 &&
                  (!artifactForm.childId || !artifactForm.subjectBucket)
                }
                title={
                  parsedDuration > 0 &&
                  (!artifactForm.childId || !artifactForm.subjectBucket)
                    ? 'Pick a child and subject first'
                    : undefined
                }
              >
                Save Capture
              </Button>
            </>
          )}
          {artifactForm.evidenceType === EvidenceType.Photo && (
            <PhotoCapture onCapture={handlePhotoCapture} uploading={mediaUploading} />
          )}
          {artifactForm.evidenceType === EvidenceType.Audio && (
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
                      <Typography variant="body2">
                        {artifact.title}
                      </Typography>
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
