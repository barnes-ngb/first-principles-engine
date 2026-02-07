import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Divider from '@mui/material/Divider'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {
  addDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { DEFAULT_FAMILY_ID } from '../../core/firebase/config'
import {
  artifactsCollection,
  childrenCollection,
  daysCollection,
  laddersCollection,
  weeksCollection,
} from '../../core/firebase/firestore'
import type { Artifact, Child, DayLog, Ladder, Rung } from '../../core/types/domain'
import {
  EngineStage,
  EvidenceType,
  LearningLocation,
  SubjectBucket,
} from '../../core/types/enums'
import { createDefaultDayLog } from './daylog.model'

export default function TodayPage() {
  const today = new Date().toISOString().slice(0, 10)
  const familyId = DEFAULT_FAMILY_ID
  const dayLogRef = useMemo(
    () => doc(daysCollection(familyId), today),
    [familyId, today],
  )
  const [dayLog, setDayLog] = useState<DayLog | null>(null)
  const [children, setChildren] = useState<Child[]>([])
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [ladders, setLadders] = useState<Ladder[]>([])
  const [weekPlanId, setWeekPlanId] = useState<string | undefined>()
  const [linkingArtifact, setLinkingArtifact] = useState<Artifact | null>(null)
  const [selectedLadderId, setSelectedLadderId] = useState('')
  const [selectedRungId, setSelectedRungId] = useState('')
  const [isLinking, setIsLinking] = useState(false)
  const [artifactForm, setArtifactForm] = useState({
    childId: '',
    engineStage: EngineStage.Wonder,
    subjectBucket: SubjectBucket.Reading,
    location: LearningLocation.Home,
    domain: '',
    content: '',
  })

  const placeholderChildren = [
    { id: 'placeholder-1', name: 'Sample Child 1' },
    { id: 'placeholder-2', name: 'Sample Child 2' },
  ]
  const selectableChildren = children.length > 0 ? children : placeholderChildren

  const ladderById = useMemo(() => {
    return ladders.reduce<Record<string, Ladder>>((acc, ladder) => {
      if (ladder.id) {
        acc[ladder.id] = ladder
      }
      return acc
    }, {})
  }, [ladders])

  const rungsForSelectedLadder = useMemo(() => {
    if (!selectedLadderId) return []
    const ladder = ladderById[selectedLadderId]
    if (!ladder) return []
    return [...ladder.rungs].sort((a, b) => a.order - b.order)
  }, [ladderById, selectedLadderId])

  const persistDayLog = useCallback(
    async (updated: DayLog) => {
      setDayLog(updated)
      await setDoc(dayLogRef, updated)
    },
    [dayLogRef],
  )

  useEffect(() => {
    let isMounted = true

    const loadDayLog = async () => {
      const snapshot = await getDoc(dayLogRef)
      if (!isMounted) return

      if (snapshot.exists()) {
        setDayLog(snapshot.data())
        return
      }

      const defaultLog = createDefaultDayLog(today)
      await setDoc(dayLogRef, defaultLog)
      if (isMounted) {
        setDayLog(defaultLog)
      }
    }

    loadDayLog()

    return () => {
      isMounted = false
    }
  }, [dayLogRef, today])

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

    const loadWeekPlan = async () => {
      const snapshot = await getDocs(weeksCollection(familyId))
      if (!isMounted) return
      const matching = snapshot.docs
        .map((docSnapshot) => ({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        }))
        .find((plan) => {
          const start = plan.startDate as string
          const end = plan.endDate as string | undefined
          return start <= today && (!end || today <= end)
        })
      setWeekPlanId(matching?.id)
    }

    loadChildren()
    loadWeekPlan()

    return () => {
      isMounted = false
    }
  }, [familyId, today])

  useEffect(() => {
    let isMounted = true

    const loadArtifactsAndLadders = async () => {
      const [artifactSnapshot, ladderSnapshot] = await Promise.all([
        getDocs(artifactsCollection(familyId)),
        getDocs(laddersCollection(familyId)),
      ])

      if (!isMounted) return

      const loadedArtifacts = artifactSnapshot.docs
        .map((docSnapshot) => ({
          id: docSnapshot.id,
          ...(docSnapshot.data() as Artifact),
        }))
        .filter((artifact) => artifact.dayLogId === today)
      const loadedLadders = ladderSnapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...(docSnapshot.data() as Ladder),
      }))

      setArtifacts(loadedArtifacts)
      setLadders(loadedLadders)
    }

    void loadArtifactsAndLadders()

    return () => {
      isMounted = false
    }
  }, [familyId, today])

  const handleBlockFieldChange = useCallback(
    (index: number, field: keyof DayLog['blocks'][number], value: unknown) => {
      if (!dayLog) return
      const updatedBlocks = dayLog.blocks.map((block, blockIndex) =>
        blockIndex === index ? { ...block, [field]: value } : block,
      )
      void persistDayLog({ ...dayLog, blocks: updatedBlocks })
    },
    [dayLog, persistDayLog],
  )

  const handleChecklistToggle = useCallback(
    (blockIndex: number, itemIndex: number) => {
      if (!dayLog) return
      const updatedBlocks = dayLog.blocks.map((block, currentIndex) => {
        if (currentIndex !== blockIndex || !block.checklist) {
          return block
        }
        const updatedChecklist = block.checklist.map((item, checklistIndex) =>
          checklistIndex === itemIndex
            ? { ...item, completed: !item.completed }
            : item,
        )
        return { ...block, checklist: updatedChecklist }
      })
      void persistDayLog({ ...dayLog, blocks: updatedBlocks })
    },
    [dayLog, persistDayLog],
  )

  const handleArtifactChange = useCallback(
    (
      field: keyof typeof artifactForm,
      value: (typeof artifactForm)[keyof typeof artifactForm],
    ) => {
      setArtifactForm((prev) => ({ ...prev, [field]: value }))
    },
    [],
  )

  const handleArtifactSave = useCallback(async () => {
    const content = artifactForm.content.trim()
    const domain = artifactForm.domain.trim()
    const title =
      content.slice(0, 60) || domain || `Artifact for ${today}`
    const createdAt = new Date().toISOString()
    const newArtifact: Artifact = {
      title,
      type: EvidenceType.Note,
      createdAt,
      content: artifactForm.content,
      childId: artifactForm.childId || undefined,
      dayLogId: today,
      weekPlanId,
      tags: {
        engineStage: artifactForm.engineStage,
        domain: artifactForm.domain,
        subjectBucket: artifactForm.subjectBucket,
        location: artifactForm.location,
      },
      notes: '',
    }

    const docRef = await addDoc(artifactsCollection(familyId), newArtifact)
    setArtifacts((prev) => [...prev, { ...newArtifact, id: docRef.id }])

    setArtifactForm((prev) => ({
      ...prev,
      domain: '',
      content: '',
    }))
  }, [artifactForm, familyId, today, weekPlanId])

  const ladderRefForArtifact = useCallback(
    (artifact: Artifact) => {
      const ladderRef = artifact.tags?.ladderRef
      if (!ladderRef) return undefined
      if (typeof ladderRef === 'string') {
        const [ladderId, rungId] = ladderRef.split(':')
        if (!ladderId || !rungId) return undefined
        return { ladderId, rungId }
      }
      return ladderRef
    },
    [],
  )

  const ladderLabelForArtifact = useCallback(
    (artifact: Artifact) => {
      const ladderRef = ladderRefForArtifact(artifact)
      if (!ladderRef) return ''
      const ladder = ladderById[ladderRef.ladderId]
      const rung = ladder?.rungs.find((item: Rung) => item.id === ladderRef.rungId)
      if (!ladder || !rung) return 'Linked to ladder rung'
      return `${ladder.title} • ${rung.title}`
    },
    [ladderById, ladderRefForArtifact],
  )

  const handleOpenLinkDialog = useCallback(
    (artifact: Artifact) => {
      const ladderRef = ladderRefForArtifact(artifact)
      setSelectedLadderId(ladderRef?.ladderId ?? '')
      setSelectedRungId(ladderRef?.rungId ?? '')
      setLinkingArtifact(artifact)
    },
    [ladderRefForArtifact],
  )

  const handleCloseLinkDialog = useCallback(() => {
    setLinkingArtifact(null)
    setSelectedLadderId('')
    setSelectedRungId('')
  }, [])

  const handleSaveLink = useCallback(async () => {
    if (!linkingArtifact?.id || !selectedLadderId || !selectedRungId) return
    setIsLinking(true)
    const ladderRef = { ladderId: selectedLadderId, rungId: selectedRungId }
    await updateDoc(doc(artifactsCollection(familyId), linkingArtifact.id), {
      'tags.ladderRef': ladderRef,
    })
    setArtifacts((prev) =>
      prev.map((artifact) =>
        artifact.id === linkingArtifact.id
          ? { ...artifact, tags: { ...artifact.tags, ladderRef } }
          : artifact,
      ),
    )
    setIsLinking(false)
    handleCloseLinkDialog()
  }, [
    familyId,
    handleCloseLinkDialog,
    linkingArtifact,
    selectedLadderId,
    selectedRungId,
  ])

  if (!dayLog) {
    return (
      <Page>
        <SectionCard title="DayLog">
          <Typography color="text.secondary">Loading today&apos;s log...</Typography>
        </SectionCard>
      </Page>
    )
  }

  return (
    <Page>
      <SectionCard title={`DayLog (${dayLog.date})`}>
        <Typography color="text.secondary" gutterBottom>
          Use the editor below to capture today&apos;s highlights and reflections.
        </Typography>
        <List dense>
          {dayLog.blocks.map((block, index) => (
            <ListItem key={`${block.type}-${index}`} disableGutters>
              <Stack spacing={2} sx={{ width: '100%' }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                  <Typography variant="subtitle1" sx={{ minWidth: 140 }}>
                    {block.type}
                  </Typography>
                  <TextField
                    label="Subject bucket"
                    select
                    fullWidth
                    value={block.subjectBucket ?? ''}
                    onChange={(event) =>
                      handleBlockFieldChange(
                        index,
                        'subjectBucket',
                        event.target.value || undefined,
                      )
                    }
                  >
                    <MenuItem value="">Unassigned</MenuItem>
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
                    value={block.location ?? ''}
                    onChange={(event) =>
                      handleBlockFieldChange(
                        index,
                        'location',
                        event.target.value || undefined,
                      )
                    }
                  >
                    <MenuItem value="">Unassigned</MenuItem>
                    {Object.values(LearningLocation).map((location) => (
                      <MenuItem key={location} value={location}>
                        {location}
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                  <TextField
                    label="Planned minutes"
                    type="number"
                    value={block.plannedMinutes ?? ''}
                    onChange={(event) =>
                      handleBlockFieldChange(
                        index,
                        'plannedMinutes',
                        event.target.value === ''
                          ? undefined
                          : Number(event.target.value),
                      )
                    }
                  />
                  <TextField
                    label="Actual minutes"
                    type="number"
                    value={block.actualMinutes ?? ''}
                    onChange={(event) =>
                      handleBlockFieldChange(
                        index,
                        'actualMinutes',
                        event.target.value === ''
                          ? undefined
                          : Number(event.target.value),
                      )
                    }
                  />
                </Stack>
                <TextField
                  label="Quick note"
                  multiline
                  minRows={2}
                  value={block.notes ?? ''}
                  onChange={(event) =>
                    handleBlockFieldChange(index, 'notes', event.target.value)
                  }
                />
                <Stack spacing={1}>
                  {block.checklist && block.checklist.length > 0 ? (
                    block.checklist.map((item, itemIndex) => (
                      <FormControlLabel
                        key={`${item.label}-${itemIndex}`}
                        control={
                          <Checkbox
                            checked={item.completed}
                            onChange={() =>
                              handleChecklistToggle(index, itemIndex)
                            }
                          />
                        }
                        label={item.label}
                      />
                    ))
                  ) : (
                    <Typography color="text.secondary">
                      No checklist items yet.
                    </Typography>
                  )}
                </Stack>
                <Divider />
              </Stack>
            </ListItem>
          ))}
        </List>
      </SectionCard>
      <SectionCard title="Capture Artifact">
        <Stack spacing={2}>
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
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="Engine stage"
              select
              fullWidth
              value={artifactForm.engineStage}
              onChange={(event) =>
                handleArtifactChange('engineStage', event.target.value as EngineStage)
              }
            >
              {Object.values(EngineStage).map((stage) => (
                <MenuItem key={stage} value={stage}>
                  {stage}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Subject bucket"
              select
              fullWidth
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
            <TextField
              label="Location"
              select
              fullWidth
              value={artifactForm.location}
              onChange={(event) =>
                handleArtifactChange(
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
            onChange={(event) => handleArtifactChange('domain', event.target.value)}
          />
          <TextField
            label="Content"
            multiline
            minRows={3}
            value={artifactForm.content}
            onChange={(event) => handleArtifactChange('content', event.target.value)}
          />
          <Button variant="contained" onClick={handleArtifactSave}>
            Save
          </Button>
        </Stack>
      </SectionCard>
      <SectionCard title="Artifacts">
        {artifacts.length === 0 ? (
          <Typography color="text.secondary">
            No artifacts captured yet.
          </Typography>
        ) : (
          <List dense>
            {artifacts.map((artifact) => {
              const ladderLabel = ladderLabelForArtifact(artifact)
              return (
                <ListItem key={artifact.id ?? artifact.title} disableGutters>
                  <Stack
                    spacing={1}
                    direction={{ xs: 'column', sm: 'row' }}
                    alignItems={{ sm: 'center' }}
                    justifyContent="space-between"
                    sx={{ width: '100%' }}
                  >
                    <Stack spacing={0.5}>
                      <Typography variant="subtitle2">{artifact.title}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {artifact.tags?.engineStage} · {artifact.tags?.domain || 'No domain'}
                      </Typography>
                      {ladderLabel ? (
                        <Typography variant="caption" color="text.secondary">
                          Linked to {ladderLabel}
                        </Typography>
                      ) : null}
                    </Stack>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleOpenLinkDialog(artifact)}
                      sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}
                    >
                      Link to rung
                    </Button>
                  </Stack>
                </ListItem>
              )
            })}
          </List>
        )}
      </SectionCard>
      <Dialog
        open={Boolean(linkingArtifact)}
        onClose={handleCloseLinkDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Link to ladder rung</DialogTitle>
        <DialogContent>
          {ladders.length === 0 ? (
            <Typography color="text.secondary">
              No ladders available yet.
            </Typography>
          ) : (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField
                label="Ladder"
                select
                value={selectedLadderId}
                onChange={(event) => {
                  setSelectedLadderId(event.target.value)
                  setSelectedRungId('')
                }}
              >
                <MenuItem value="" disabled>
                  Select ladder
                </MenuItem>
                {ladders.map((ladder) => (
                  <MenuItem key={ladder.id} value={ladder.id}>
                    {ladder.title}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Rung"
                select
                value={selectedRungId}
                onChange={(event) => setSelectedRungId(event.target.value)}
                disabled={!selectedLadderId}
              >
                <MenuItem value="" disabled>
                  Select rung
                </MenuItem>
                {rungsForSelectedLadder.map((rung) => (
                  <MenuItem key={rung.id} value={rung.id}>
                    {rung.title}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseLinkDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveLink}
            disabled={
              isLinking || !selectedLadderId || !selectedRungId || ladders.length === 0
            }
          >
            Save link
          </Button>
        </DialogActions>
      </Dialog>
    </Page>
  )
}
