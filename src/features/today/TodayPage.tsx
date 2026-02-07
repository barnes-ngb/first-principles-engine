import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Divider,
  FormControlLabel,
  List,
  ListItem,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import Checkbox from '@mui/material/Checkbox'
import {
  addDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore'

import { DEFAULT_FAMILY_ID } from '../../core/firebase/config'
import {
  artifactsCollection,
  childrenCollection,
  daysCollection,
  weeksCollection,
} from '../../core/firebase/firestore'
import { createDefaultDayLog } from '../../core/types/daylog.model'
import type { Artifact, Child, DayBlock, DayLog, WeekPlan } from '../../core/types/domain'
import {
  EngineStage,
  EvidenceType,
  Location,
  SubjectBucket,
} from '../../core/types/enums'

const formatToday = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const placeholderChildren: Child[] = [
  { id: 'placeholder-1', name: 'Placeholder Child' },
  { id: 'placeholder-2', name: 'Sibling Placeholder' },
]

export default function TodayPage() {
  const familyId = DEFAULT_FAMILY_ID
  const today = useMemo(() => formatToday(), [])
  const dayLogRef = useMemo(() => doc(daysCollection(familyId), today), [familyId, today])

  const [dayLog, setDayLog] = useState<DayLog | null>(null)
  const [children, setChildren] = useState<Child[]>([])
  const [weekPlanId, setWeekPlanId] = useState<string | null>(null)
  const [artifactDraft, setArtifactDraft] = useState({
    childId: '',
    engineStage: EngineStage.Wonder,
    subjectBucket: SubjectBucket.Other,
    location: Location.Home,
    domain: '',
    content: '',
  })
  const [savingArtifact, setSavingArtifact] = useState(false)

  useEffect(() => {
    let isMounted = true

    const loadData = async () => {
      const dayLogSnapshot = await getDoc(dayLogRef)
      let resolvedDayLog: DayLog

      if (!dayLogSnapshot.exists()) {
        resolvedDayLog = createDefaultDayLog(today)
        await setDoc(dayLogRef, resolvedDayLog)
      } else {
        resolvedDayLog = dayLogSnapshot.data()
      }

      const childrenSnapshot = await getDocs(childrenCollection(familyId))
      const fetchedChildren = childrenSnapshot.docs.map((document) => ({
        ...document.data(),
        id: document.id,
      }))

      const weeksSnapshot = await getDocs(weeksCollection(familyId))
      const matchingWeek = weeksSnapshot.docs
        .map((document) => ({ ...document.data(), id: document.id }))
        .find((week: WeekPlan & { id: string }) => {
          const start = week.startDate
          const end = week.endDate ?? week.startDate
          return today >= start && today <= end
        })

      if (!isMounted) return

      setDayLog(resolvedDayLog)
      setChildren(fetchedChildren)
      setWeekPlanId(matchingWeek?.id ?? null)
      setArtifactDraft((prev) => ({
        ...prev,
        childId:
          prev.childId ||
          fetchedChildren[0]?.id ||
          placeholderChildren[0]?.id ||
          '',
      }))
    }

    void loadData()

    return () => {
      isMounted = false
    }
  }, [dayLogRef, familyId, today])

  const persistBlocks = async (nextBlocks: DayBlock[]) => {
    setDayLog((prev) => (prev ? { ...prev, blocks: nextBlocks } : prev))
    await updateDoc(dayLogRef, { blocks: nextBlocks })
  }

  const handleBlockUpdate = async (index: number, updates: Partial<DayBlock>) => {
    if (!dayLog) return
    const nextBlocks = dayLog.blocks.map((block, blockIndex) =>
      blockIndex === index ? { ...block, ...updates } : block,
    )
    await persistBlocks(nextBlocks)
  }

  const handleChecklistToggle = async (
    blockIndex: number,
    checklistIndex: number,
    checked: boolean,
  ) => {
    if (!dayLog) return
    const nextBlocks = dayLog.blocks.map((block, index) => {
      if (index !== blockIndex) return block
      const nextChecklist =
        block.checklist?.map((item, itemIndex) =>
          itemIndex === checklistIndex ? { ...item, completed: checked } : item,
        ) ?? []
      return { ...block, checklist: nextChecklist }
    })
    await persistBlocks(nextBlocks)
  }

  const handleSaveArtifact = async () => {
    if (!artifactDraft.domain && !artifactDraft.content) return
    setSavingArtifact(true)
    const artifactPayload: Artifact = {
      title: artifactDraft.domain || 'Captured Artifact',
      type: EvidenceType.Note,
      createdAt: new Date().toISOString(),
      tags: {
        engineStage: artifactDraft.engineStage,
        domain: artifactDraft.domain || 'General',
        subjectBucket: artifactDraft.subjectBucket,
        location: artifactDraft.location,
      },
      notes: artifactDraft.content,
      childId: artifactDraft.childId || undefined,
      dayLogId: dayLogRef.id,
      weekPlanId: weekPlanId ?? undefined,
    }

    await addDoc(artifactsCollection(familyId), artifactPayload)

    setArtifactDraft((prev) => ({
      ...prev,
      domain: '',
      content: '',
    }))
    setSavingArtifact(false)
  }

  const childOptions = children.length > 0 ? children : placeholderChildren

  return (
    <Stack spacing={4} sx={{ p: 3 }}>
      <Box>
        <Typography variant="h4">Today</Typography>
        <Typography color="text.secondary">{today}</Typography>
      </Box>

      <Stack spacing={2}>
        <Typography variant="h5">Day Blocks</Typography>
        <List sx={{ bgcolor: 'background.paper', borderRadius: 2 }}>
          {dayLog?.blocks.map((block, index) => (
            <Box key={block.id ?? `${block.type}-${index}`}>
              <ListItem alignItems="flex-start" disableGutters sx={{ px: 2, py: 2 }}>
                <Stack spacing={2} sx={{ width: '100%' }}>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Typography variant="h6">{block.type}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {block.title ?? 'Untitled block'}
                    </Typography>
                  </Stack>

                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    <TextField
                      label="Subject Bucket"
                      select
                      value={block.subjectBucket ?? ''}
                      onChange={(event) =>
                        void handleBlockUpdate(index, {
                          subjectBucket: event.target.value as SubjectBucket,
                        })
                      }
                      fullWidth
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
                      value={block.location ?? ''}
                      onChange={(event) =>
                        void handleBlockUpdate(index, {
                          location: event.target.value as Location,
                        })
                      }
                      fullWidth
                    >
                      {Object.values(Location).map((location) => (
                        <MenuItem key={location} value={location}>
                          {location}
                        </MenuItem>
                      ))}
                    </TextField>

                    <TextField
                      label="Planned Minutes"
                      type="number"
                      value={block.plannedMinutes ?? 0}
                      onChange={(event) =>
                        void handleBlockUpdate(index, {
                          plannedMinutes: Number(event.target.value),
                        })
                      }
                      fullWidth
                    />

                    <TextField
                      label="Actual Minutes"
                      type="number"
                      value={block.actualMinutes ?? 0}
                      onChange={(event) =>
                        void handleBlockUpdate(index, {
                          actualMinutes: Number(event.target.value),
                        })
                      }
                      fullWidth
                    />
                  </Stack>

                  <Stack spacing={1}>
                    <Typography variant="subtitle2">Checklist</Typography>
                    {block.checklist?.length ? (
                      block.checklist.map((item, checklistIndex) => (
                        <FormControlLabel
                          key={item.id ?? `${block.id}-check-${checklistIndex}`}
                          control={
                            <Checkbox
                              checked={item.completed}
                              onChange={(event) =>
                                void handleChecklistToggle(
                                  index,
                                  checklistIndex,
                                  event.target.checked,
                                )
                              }
                            />
                          }
                          label={item.label}
                        />
                      ))
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        No checklist items yet.
                      </Typography>
                    )}
                  </Stack>

                  <TextField
                    label="Quick note"
                    multiline
                    minRows={2}
                    value={block.notes ?? ''}
                    onChange={(event) =>
                      void handleBlockUpdate(index, { notes: event.target.value })
                    }
                  />
                </Stack>
              </ListItem>
              {index < (dayLog?.blocks.length ?? 0) - 1 ? <Divider /> : null}
            </Box>
          ))}
        </List>
      </Stack>

      <Stack spacing={2}>
        <Typography variant="h5">Capture Artifact</Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            label="Child"
            select
            value={artifactDraft.childId}
            onChange={(event) =>
              setArtifactDraft((prev) => ({
                ...prev,
                childId: event.target.value,
              }))
            }
            fullWidth
          >
            {childOptions.map((child) => (
              <MenuItem key={child.id} value={child.id}>
                {child.name}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Engine Stage"
            select
            value={artifactDraft.engineStage}
            onChange={(event) =>
              setArtifactDraft((prev) => ({
                ...prev,
                engineStage: event.target.value as EngineStage,
              }))
            }
            fullWidth
          >
            {Object.values(EngineStage).map((stage) => (
              <MenuItem key={stage} value={stage}>
                {stage}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Subject Bucket"
            select
            value={artifactDraft.subjectBucket}
            onChange={(event) =>
              setArtifactDraft((prev) => ({
                ...prev,
                subjectBucket: event.target.value as SubjectBucket,
              }))
            }
            fullWidth
          >
            {Object.values(SubjectBucket).map((bucket) => (
              <MenuItem key={bucket} value={bucket}>
                {bucket}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            label="Location"
            select
            value={artifactDraft.location}
            onChange={(event) =>
              setArtifactDraft((prev) => ({
                ...prev,
                location: event.target.value as Location,
              }))
            }
            fullWidth
          >
            {Object.values(Location).map((location) => (
              <MenuItem key={location} value={location}>
                {location}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Domain"
            value={artifactDraft.domain}
            onChange={(event) =>
              setArtifactDraft((prev) => ({
                ...prev,
                domain: event.target.value,
              }))
            }
            fullWidth
          />
        </Stack>

        <TextField
          label="Content"
          multiline
          minRows={3}
          value={artifactDraft.content}
          onChange={(event) =>
            setArtifactDraft((prev) => ({
              ...prev,
              content: event.target.value,
            }))
          }
        />

        <Box>
          <Button
            variant="contained"
            onClick={() => void handleSaveArtifact()}
            disabled={savingArtifact}
          >
            Save
          </Button>
        </Box>
      </Stack>
    </Stack>
  )
}
