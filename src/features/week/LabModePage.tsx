import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { addDoc, doc, updateDoc } from 'firebase/firestore'

import AudioRecorder from '../../components/AudioRecorder'
import ChildSelector from '../../components/ChildSelector'
import Page from '../../components/Page'
import PhotoCapture from '../../components/PhotoCapture'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  artifactsCollection,
} from '../../core/firebase/firestore'
import {
  generateFilename,
  uploadArtifactFile,
} from '../../core/firebase/upload'
import { useChildren } from '../../core/hooks/useChildren'
import {
  EngineStage,
  EvidenceType,
  LearningLocation,
  SubjectBucket,
} from '../../core/types/enums'

type ArtifactFormState = {
  childId: string
  evidenceType: EvidenceType
  engineStage: EngineStage
  subjectBucket: SubjectBucket
  location: LearningLocation
  domain: string
  content: string
}

const defaultFormState = (
  engineStage: EngineStage,
  childId = '',
): ArtifactFormState => ({
  childId,
  evidenceType: EvidenceType.Note,
  engineStage,
  subjectBucket: SubjectBucket.Science,
  location: LearningLocation.Home,
  domain: '',
  content: '',
})

export default function LabModePage() {
  const familyId = useFamilyId()
  const { children, selectedChildId, isLoading: childrenLoading, addChild } = useChildren()
  const [selectedStage, setSelectedStage] = useState<EngineStage | null>(null)
  const [mediaUploading, setMediaUploading] = useState(false)
  const [artifactForm, setArtifactForm] = useState<ArtifactFormState>(() =>
    defaultFormState(EngineStage.Wonder),
  )

  // Sync hook's auto-selected child into the artifact form
  useEffect(() => {
    if (selectedChildId) {
      setArtifactForm((prev) => {
        if (prev.childId) return prev
        return { ...prev, childId: selectedChildId }
      })
    }
  }, [selectedChildId])

  const handleStageSelect = useCallback((stage: EngineStage) => {
    setSelectedStage(stage)
    setArtifactForm((prev) => defaultFormState(stage, prev.childId))
  }, [])

  const handleFormChange = useCallback(
    (
      field: keyof ArtifactFormState,
      value: ArtifactFormState[keyof ArtifactFormState],
    ) => {
      setArtifactForm((prev) => ({ ...prev, [field]: value }))
    },
    [],
  )

  const buildBase = useCallback(
    (title: string, evidenceType: EvidenceType) => {
      const createdAt = new Date().toISOString()
      const dayLogId = createdAt.slice(0, 10)
      return {
        title,
        type: evidenceType,
        createdAt,
        childId: artifactForm.childId,
        dayLogId,
        tags: {
          engineStage: artifactForm.engineStage,
          domain: artifactForm.domain,
          subjectBucket: artifactForm.subjectBucket,
          location: artifactForm.location,
        },
        notes: '',
      }
    },
    [artifactForm],
  )

  const handleSave = useCallback(async () => {
    const content = artifactForm.content.trim()
    const domain = artifactForm.domain.trim()
    const title =
      content.slice(0, 60) ||
      domain ||
      `${artifactForm.engineStage} Lab Note`

    await addDoc(artifactsCollection(familyId), {
      ...buildBase(title, EvidenceType.Note),
      content: artifactForm.content,
    })

    setSelectedStage(null)
    setArtifactForm((prev) => defaultFormState(EngineStage.Wonder, prev.childId))
  }, [artifactForm, buildBase, familyId])

  const handlePhotoCapture = useCallback(
    async (file: File) => {
      setMediaUploading(true)
      try {
        const domain = artifactForm.domain.trim()
        const title = domain || `${artifactForm.engineStage} Lab Photo`
        const artifact = buildBase(title, EvidenceType.Photo)
        const docRef = await addDoc(artifactsCollection(familyId), artifact)
        const ext = file.name.split('.').pop() ?? 'jpg'
        const filename = generateFilename(ext)
        const { downloadUrl } = await uploadArtifactFile(familyId, docRef.id, file, filename)
        await updateDoc(doc(artifactsCollection(familyId), docRef.id), { uri: downloadUrl })
        setSelectedStage(null)
        setArtifactForm((prev) => defaultFormState(EngineStage.Wonder, prev.childId))
      } finally {
        setMediaUploading(false)
      }
    },
    [artifactForm, buildBase, familyId],
  )

  const handleAudioCapture = useCallback(
    async (blob: Blob) => {
      setMediaUploading(true)
      try {
        const domain = artifactForm.domain.trim()
        const title = domain || `${artifactForm.engineStage} Lab Audio`
        const artifact = buildBase(title, EvidenceType.Audio)
        const docRef = await addDoc(artifactsCollection(familyId), artifact)
        const filename = generateFilename('webm')
        const { downloadUrl } = await uploadArtifactFile(familyId, docRef.id, blob, filename)
        await updateDoc(doc(artifactsCollection(familyId), docRef.id), { uri: downloadUrl })
        setSelectedStage(null)
        setArtifactForm((prev) => defaultFormState(EngineStage.Wonder, prev.childId))
      } finally {
        setMediaUploading(false)
      }
    },
    [artifactForm, buildBase, familyId],
  )

  const stageButtons = useMemo(
    () =>
      Object.values(EngineStage).map((stage) => (
        <Button
          key={stage}
          variant="contained"
          size="large"
          onClick={() => handleStageSelect(stage)}
          sx={{ height: 72, fontSize: '1.2rem' }}
        >
          {stage}
        </Button>
      )),
    [handleStageSelect],
  )

  const handleChildSelect = useCallback(
    (childId: string) => {
      handleFormChange('childId', childId)
    },
    [handleFormChange],
  )

  return (
    <Page>
      <Stack spacing={2}>
        <ChildSelector
          children={children}
          selectedChildId={artifactForm.childId}
          onSelect={handleChildSelect}
          onChildAdded={addChild}
          isLoading={childrenLoading}
        />
        {selectedStage ? (
          <SectionCard title={`Capture ${selectedStage} Artifact`}>
            <Stack spacing={2}>
              <ToggleButtonGroup
                value={artifactForm.evidenceType}
                exclusive
                onChange={(_event, value) => {
                  if (value) handleFormChange('evidenceType', value)
                }}
                fullWidth
                size="large"
              >
                <ToggleButton value={EvidenceType.Note}>Note</ToggleButton>
                <ToggleButton value={EvidenceType.Photo}>Photo</ToggleButton>
                <ToggleButton value={EvidenceType.Audio}>Audio</ToggleButton>
              </ToggleButtonGroup>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField
                  label="Subject bucket"
                  select
                  fullWidth
                  value={artifactForm.subjectBucket}
                  onChange={(event) =>
                    handleFormChange(
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
                <TextField
                  label="Location"
                  select
                  fullWidth
                  value={artifactForm.location}
                  onChange={(event) =>
                    handleFormChange(
                      'location',
                      event.target.value as LearningLocation,
                    )
                  }
                >
                  {Object.values(LearningLocation).map((location) => (
                    <MenuItem key={location} value={location}>
                      {location}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
              <TextField
                label="Domain"
                value={artifactForm.domain}
                onChange={(event) => handleFormChange('domain', event.target.value)}
              />
              {artifactForm.evidenceType === EvidenceType.Note && (
                <>
                  <TextField
                    label="Note"
                    multiline
                    minRows={3}
                    value={artifactForm.content}
                    onChange={(event) =>
                      handleFormChange('content', event.target.value)
                    }
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <Button variant="contained" onClick={handleSave}>
                      Save Note
                    </Button>
                    <Button variant="outlined" onClick={() => setSelectedStage(null)}>
                      Cancel
                    </Button>
                  </Stack>
                </>
              )}
              {artifactForm.evidenceType === EvidenceType.Photo && (
                <Stack spacing={2}>
                  <PhotoCapture onCapture={handlePhotoCapture} uploading={mediaUploading} />
                  <Button variant="outlined" onClick={() => setSelectedStage(null)}>
                    Cancel
                  </Button>
                </Stack>
              )}
              {artifactForm.evidenceType === EvidenceType.Audio && (
                <Stack spacing={2}>
                  <AudioRecorder onCapture={handleAudioCapture} uploading={mediaUploading} />
                  <Button variant="outlined" onClick={() => setSelectedStage(null)}>
                    Cancel
                  </Button>
                </Stack>
              )}
            </Stack>
          </SectionCard>
        ) : (
          <SectionCard title="Lab Mode">
            <Stack spacing={2}>
              <Typography color="text.secondary">
                Tap a stage to capture a quick artifact.
              </Typography>
              <Stack spacing={2}>{stageButtons}</Stack>
            </Stack>
          </SectionCard>
        )}
      </Stack>
    </Page>
  )
}
