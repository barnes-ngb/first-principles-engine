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
  const [artifactForm, setArtifactForm] = useState({
    childId: selectedChildId,
    evidenceType: EvidenceType.Note as EvidenceType,
    subjectBucket: SubjectBucket.Reading,
    content: '',
  })

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
      onSnackMessage({ text: 'Note saved.', severity: 'success' })
    } catch (err) {
      console.error('Failed to save artifact', err)
      onSnackMessage({ text: 'Failed to save note.', severity: 'error' })
    }
  }, [artifactForm, buildArtifactBase, familyId, today, setTodayArtifacts, onSnackMessage])

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
        onSnackMessage({ text: 'Photo uploaded.', severity: 'success' })
      } catch (err) {
        console.error('Photo upload failed', err)
        onSnackMessage({ text: 'Photo upload failed.', severity: 'error' })
      } finally {
        setMediaUploading(false)
      }
    },
    [buildArtifactBase, familyId, today, setTodayArtifacts, onSnackMessage],
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
        onSnackMessage({ text: 'Audio uploaded.', severity: 'success' })
      } catch (err) {
        console.error('Audio upload failed', err)
        onSnackMessage({ text: 'Audio upload failed.', severity: 'error' })
      } finally {
        setMediaUploading(false)
      }
    },
    [buildArtifactBase, familyId, today, setTodayArtifacts, onSnackMessage],
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
          {artifactForm.evidenceType === EvidenceType.Note && (
            <>
              <TextField
                label="Content"
                multiline
                minRows={3}
                value={artifactForm.content}
                onChange={(event) => handleArtifactChange('content', event.target.value)}
              />
              <Button variant="contained" onClick={handleArtifactSave}>
                Save Note
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
