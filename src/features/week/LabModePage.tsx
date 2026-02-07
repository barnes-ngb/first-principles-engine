import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { addDoc, getDocs } from 'firebase/firestore'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { DEFAULT_FAMILY_ID } from '../../core/firebase/config'
import {
  artifactsCollection,
  childrenCollection,
} from '../../core/firebase/firestore'
import type { Child } from '../../core/types/domain'
import {
  EngineStage,
  EvidenceType,
  LearningLocation,
  SubjectBucket,
} from '../../core/types/enums'

type ArtifactFormState = {
  childId: string
  engineStage: EngineStage
  subjectBucket: SubjectBucket
  location: LearningLocation
  domain: string
  content: string
}

const defaultFormState = (engineStage: EngineStage): ArtifactFormState => ({
  childId: '',
  engineStage,
  subjectBucket: SubjectBucket.Science,
  location: LearningLocation.Home,
  domain: '',
  content: '',
})

export default function LabModePage() {
  const familyId = DEFAULT_FAMILY_ID
  const [children, setChildren] = useState<Child[]>([])
  const [selectedStage, setSelectedStage] = useState<EngineStage | null>(null)
  const [artifactForm, setArtifactForm] = useState<ArtifactFormState>(() =>
    defaultFormState(EngineStage.Wonder),
  )

  const placeholderChildren = [
    { id: 'placeholder-1', name: 'Sample Child 1' },
    { id: 'placeholder-2', name: 'Sample Child 2' },
  ]
  const selectableChildren = children.length > 0 ? children : placeholderChildren

  useEffect(() => {
    let isMounted = true

    const loadChildren = async () => {
      const snapshot = await getDocs(childrenCollection(familyId))
      if (!isMounted) return
      const loadedChildren = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...(docSnapshot.data() as Child),
      }))
      setChildren(loadedChildren)
    }

    loadChildren()

    return () => {
      isMounted = false
    }
  }, [familyId])

  const handleStageSelect = useCallback((stage: EngineStage) => {
    setSelectedStage(stage)
    setArtifactForm(defaultFormState(stage))
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

  const handleSave = useCallback(async () => {
    const content = artifactForm.content.trim()
    const domain = artifactForm.domain.trim()
    const title =
      content.slice(0, 60) ||
      domain ||
      `${artifactForm.engineStage} Lab Note`
    const createdAt = new Date().toISOString()
    const dayLogId = createdAt.slice(0, 10)

    await addDoc(artifactsCollection(familyId), {
      title,
      type: EvidenceType.Note,
      createdAt,
      content: artifactForm.content,
      childId: artifactForm.childId || undefined,
      dayLogId,
      tags: {
        engineStage: artifactForm.engineStage,
        domain: artifactForm.domain,
        subjectBucket: artifactForm.subjectBucket,
        location: artifactForm.location,
      },
      notes: '',
    })

    setSelectedStage(null)
    setArtifactForm(defaultFormState(EngineStage.Wonder))
  }, [artifactForm, familyId])

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

  return (
    <Page>
      {selectedStage ? (
        <SectionCard title={`Capture ${selectedStage} Note`}>
          <Stack spacing={2}>
            <TextField
              label="Child"
              select
              value={artifactForm.childId}
              onChange={(event) =>
                handleFormChange('childId', event.target.value)
              }
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
          </Stack>
        </SectionCard>
      ) : (
        <SectionCard title="Lab Mode">
          <Stack spacing={2}>
            <Typography color="text.secondary">
              Tap a stage to capture a quick note.
            </Typography>
            <Stack spacing={2}>{stageButtons}</Stack>
          </Stack>
        </SectionCard>
      )}
    </Page>
  )
}
