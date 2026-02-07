import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Divider from '@mui/material/Divider'
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
import type { Child, DayLog, Ladder, Rung } from '../../core/types/domain'
import {
  EngineStage,
  EvidenceType,
  LearningLocation,
  SubjectBucket,
} from '../../core/types/enums'
import { createDefaultDayLog } from './daylog.model'

const rungIdFor = (rung: Rung) => rung.id ?? `order-${rung.order}`

export default function TodayPage() {
  const today = new Date().toISOString().slice(0, 10)
  const familyId = DEFAULT_FAMILY_ID
  const dayLogRef = useMemo(
    () => doc(daysCollection(familyId), today),
    [familyId, today],
  )
  const [dayLog, setDayLog] = useState<DayLog | null>(null)
  const [children, setChildren] = useState<Child[]>([])
  const [ladders, setLadders] = useState<Ladder[]>([])
  const [weekPlanId, setWeekPlanId] = useState<string | undefined>()
  const [artifactForm, setArtifactForm] = useState({
    childId: '',
    engineStage: EngineStage.Wonder,
    subjectBucket: SubjectBucket.Reading,
    location: LearningLocation.Home,
    domain: '',
    content: '',
    ladderId: '',
    rungId: '',
  })

  const placeholderChildren = [
    { id: 'placeholder-1', name: 'Sample Child 1' },
    { id: 'placeholder-2', name: 'Sample Child 2' },
  ]
  const selectableChildren = children.length > 0 ? children : placeholderChildren

  const selectedLadder = useMemo(
    () => ladders.find((ladder) => ladder.id === artifactForm.ladderId),
    [artifactForm.ladderId, ladders],
  )

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

    const loadLadders = async () => {
      const snapshot = await getDocs(laddersCollection(familyId))
      if (!isMounted) return
      const loadedLadders = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...(docSnapshot.data() as Ladder),
      }))
      setLadders(loadedLadders)
    }

    loadChildren()
    loadWeekPlan()
    loadLadders()

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
      setArtifactForm((prev) => {
        if (field === 'ladderId') {
          return { ...prev, ladderId: value as string, rungId: '' }
        }
        return { ...prev, [field]: value }
      })
    },
    [],
  )

  const handleArtifactSave = useCallback(async () => {
    const content = artifactForm.content.trim()
    const domain = artifactForm.domain.trim()
    const title =
      content.slice(0, 60) || domain || `Artifact for ${today}`
    const createdAt = new Date().toISOString()

    const tags = {
      engineStage: artifactForm.engineStage,
      domain: artifactForm.domain,
      subjectBucket: artifactForm.subjectBucket,
      location: artifactForm.location,
      ...(artifactForm.ladderId && artifactForm.rungId
        ? {
            ladderRef: {
              ladderId: artifactForm.ladderId,
              rungId: artifactForm.rungId,
            },
          }
        : {}),
    }

    await addDoc(artifactsCollection(familyId), {
      title,
      type: EvidenceType.Note,
      createdAt,
      content: artifactForm.content,
      childId: artifactForm.childId || undefined,
      dayLogId: today,
      weekPlanId,
      tags,
      notes: '',
    })

    setArtifactForm((prev) => ({
      ...prev,
      domain: '',
      content: '',
    }))
  }, [artifactForm, familyId, today, weekPlanId])

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
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="Ladder"
              select
              fullWidth
              value={artifactForm.ladderId}
              onChange={(event) =>
                handleArtifactChange('ladderId', event.target.value)
              }
            >
              <MenuItem value="">No ladder</MenuItem>
              {ladders.map((ladder) => (
                <MenuItem key={ladder.id} value={ladder.id}>
                  {ladder.title}
                </MenuItem>
              ))}
            </TextField>
            {selectedLadder ? (
              <TextField
                label="Rung"
                select
                fullWidth
                value={artifactForm.rungId}
                onChange={(event) =>
                  handleArtifactChange('rungId', event.target.value)
                }
              >
                <MenuItem value="">No rung</MenuItem>
                {[...selectedLadder.rungs]
                  .sort((a, b) => a.order - b.order)
                  .map((rung) => (
                    <MenuItem key={rungIdFor(rung)} value={rungIdFor(rung)}>
                      {rung.title}
                    </MenuItem>
                  ))}
              </TextField>
            ) : null}
          </Stack>
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
    </Page>
  )
}
