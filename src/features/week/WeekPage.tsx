import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@mui/material/Button'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { DEFAULT_FAMILY_ID } from '../../core/firebase/config'
import { childrenCollection, weeksCollection } from '../../core/firebase/firestore'
import type { Child, WeekPlan } from '../../core/types/domain'
import { formatDateForInput } from '../../lib/format'
import { getWeekRange } from '../engine/engine.logic'

const createDefaultWeekPlan = (weekStartDate: string, weekEndDate: string): WeekPlan => ({
  id: weekStartDate,
  startDate: weekStartDate,
  endDate: weekEndDate,
  theme: '',
  virtue: '',
  scriptureRef: '',
  heartQuestion: '',
  tracks: [],
  flywheelPlan: '',
  buildLab: {
    title: '',
    materials: [],
    steps: [],
  },
  childGoals: [],
})

const normalizeBuildLab = (value: WeekPlan['buildLab'] | string | undefined) => {
  if (!value) {
    return { title: '', materials: [], steps: [] }
  }
  if (typeof value === 'string') {
    return { title: value, materials: [], steps: [] }
  }
  return {
    title: value.title ?? '',
    materials: value.materials ?? [],
    steps: value.steps ?? [],
  }
}

const normalizeChildGoals = (value: WeekPlan['childGoals'] | undefined) =>
  Array.isArray(value)
    ? value.map((entry) => ({
        childId: entry.childId,
        goals: entry.goals ?? [],
      }))
    : []

export default function WeekPage() {
  const today = useMemo(() => new Date(), [])
  const familyId = DEFAULT_FAMILY_ID
  const weekRange = useMemo(() => getWeekRange(today, 1), [today])
  const weekStartDate = weekRange.start
  const weekEndDate = weekRange.end
  const weekPlanRef = useMemo(
    () => doc(weeksCollection(familyId), weekStartDate),
    [familyId, weekStartDate],
  )
  const [weekPlan, setWeekPlan] = useState<WeekPlan | null>(null)
  const [children, setChildren] = useState<Child[]>([])

  const commitWeekPlan = useCallback(
    async (updated: WeekPlan, updates?: Partial<WeekPlan>) => {
      setWeekPlan(updated)
      if (updates) {
        await updateDoc(weekPlanRef, updates)
      } else {
        await setDoc(weekPlanRef, updated)
      }
    },
    [weekPlanRef],
  )

  useEffect(() => {
    let isMounted = true

    const loadWeekPlan = async () => {
      const snapshot = await getDoc(weekPlanRef)
      if (!isMounted) return

      if (snapshot.exists()) {
        const data = snapshot.data() as WeekPlan
        const normalized = {
          ...createDefaultWeekPlan(weekStartDate, weekEndDate),
          ...data,
          buildLab: normalizeBuildLab(data.buildLab),
          childGoals: normalizeChildGoals(data.childGoals),
        }
        setWeekPlan(normalized)
        return
      }

      const defaultPlan = createDefaultWeekPlan(weekStartDate, weekEndDate)
      await setDoc(weekPlanRef, defaultPlan)
      if (isMounted) {
        setWeekPlan(defaultPlan)
      }
    }

    loadWeekPlan()

    return () => {
      isMounted = false
    }
  }, [weekEndDate, weekPlanRef, weekStartDate])

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

  const handleFieldChange = useCallback(
    (field: keyof WeekPlan, value: WeekPlan[keyof WeekPlan]) => {
      if (!weekPlan) return
      const updated = { ...weekPlan, [field]: value }
      void commitWeekPlan(updated, { [field]: value })
    },
    [commitWeekPlan, weekPlan],
  )

  const updateChildGoals = useCallback(
    (childId: string, updater: (goals: string[]) => string[]) => {
      if (!weekPlan) return
      const currentGoals = weekPlan.childGoals ?? []
      const entryIndex = currentGoals.findIndex((entry) => entry.childId === childId)
      const entry =
        entryIndex >= 0
          ? currentGoals[entryIndex]
          : {
              childId,
              goals: [],
            }
      const updatedEntry = {
        ...entry,
        goals: updater(entry.goals),
      }
      const updatedGoals =
        entryIndex >= 0
          ? currentGoals.map((item, index) =>
              index === entryIndex ? updatedEntry : item,
            )
          : [...currentGoals, updatedEntry]
      const updated = {
        ...weekPlan,
        childGoals: updatedGoals,
      }
      void commitWeekPlan(updated, { childGoals: updatedGoals })
    },
    [commitWeekPlan, weekPlan],
  )

  const handleBuildLabChange = useCallback(
    (updates: Partial<WeekPlan['buildLab']>) => {
      if (!weekPlan) return
      const updatedBuildLab = {
        ...weekPlan.buildLab,
        ...updates,
      }
      const updated = {
        ...weekPlan,
        buildLab: updatedBuildLab,
      }
      void commitWeekPlan(updated, { buildLab: updatedBuildLab })
    },
    [commitWeekPlan, weekPlan],
  )

  const renderListField = (
    items: string[],
    onChange: (index: number, value: string) => void,
    onRemove: (index: number) => void,
    emptyLabel: string,
    itemLabel: (index: number) => string,
  ) => (
    <List dense>
      {items.length === 0 ? (
        <ListItem disableGutters>
          <Typography color="text.secondary">{emptyLabel}</Typography>
        </ListItem>
      ) : (
        items.map((item, index) => (
          <ListItem key={`${itemLabel(index)}-${index}`} disableGutters>
            <Stack direction="row" spacing={1} sx={{ width: '100%' }}>
              <TextField
                label={itemLabel(index)}
                value={item}
                fullWidth
                onChange={(event) => onChange(index, event.target.value)}
              />
              <Button
                variant="outlined"
                color="inherit"
                onClick={() => onRemove(index)}
              >
                Remove
              </Button>
            </Stack>
          </ListItem>
        ))
      )}
    </List>
  )

  if (!weekPlan) {
    return (
      <Page>
        <SectionCard title="Week Plan">
          <Typography color="text.secondary">Loading week plan...</Typography>
        </SectionCard>
      </Page>
    )
  }

  return (
    <Page>
      <SectionCard title={`Week Plan (${weekStartDate} → ${weekEndDate})`}>
        <Stack spacing={2}>
          <TextField
            label="Theme"
            value={weekPlan.theme}
            onChange={(event) => handleFieldChange('theme', event.target.value)}
            fullWidth
          />
          <TextField
            label="Virtue"
            value={weekPlan.virtue}
            onChange={(event) => handleFieldChange('virtue', event.target.value)}
            fullWidth
          />
          <TextField
            label="Scripture reference"
            value={weekPlan.scriptureRef}
            onChange={(event) =>
              handleFieldChange('scriptureRef', event.target.value)
            }
            fullWidth
          />
          <TextField
            label="Heart question"
            value={weekPlan.heartQuestion}
            onChange={(event) =>
              handleFieldChange('heartQuestion', event.target.value)
            }
            fullWidth
          />
          <TextField
            label="Flywheel plan"
            value={weekPlan.flywheelPlan}
            onChange={(event) =>
              handleFieldChange('flywheelPlan', event.target.value)
            }
            fullWidth
            multiline
            minRows={2}
          />
        </Stack>
      </SectionCard>

      <SectionCard title="Child goals">
        <Stack spacing={2}>
          {children.length === 0 ? (
            <Typography color="text.secondary">
              No children loaded yet. Add children to see goals.
            </Typography>
          ) : (
            children.map((child) => {
              const goalsEntry = weekPlan.childGoals?.find(
                (entry) => entry.childId === child.id,
              )
              const goals = goalsEntry?.goals ?? []
              return (
                <Stack key={child.id} spacing={1}>
                  <Typography variant="subtitle1">{child.name}</Typography>
                  {renderListField(
                    goals,
                    (index, value) =>
                      updateChildGoals(child.id, (current) =>
                        current.map((goal, goalIndex) =>
                          goalIndex === index ? value : goal,
                        ),
                      ),
                    (index) =>
                      updateChildGoals(child.id, (current) =>
                        current.filter((_, goalIndex) => goalIndex !== index),
                      ),
                    'No goals added yet.',
                    (index) => `Goal ${index + 1}`,
                  )}
                  <Button
                    variant="outlined"
                    onClick={() =>
                      updateChildGoals(child.id, (current) => [...current, ''])
                    }
                    sx={{ alignSelf: 'flex-start' }}
                  >
                    Add goal
                  </Button>
                </Stack>
              )
            })
          )}
        </Stack>
      </SectionCard>

      <SectionCard title="Build Lab">
        <Stack spacing={2}>
          <TextField
            label="Build Lab title"
            value={weekPlan.buildLab.title}
            onChange={(event) => handleBuildLabChange({ title: event.target.value })}
            fullWidth
          />
          <Stack spacing={1}>
            <Typography variant="subtitle1">Materials</Typography>
            {renderListField(
              weekPlan.buildLab.materials,
              (index, value) =>
                handleBuildLabChange({
                  materials: weekPlan.buildLab.materials.map((item, itemIndex) =>
                    itemIndex === index ? value : item,
                  ),
                }),
              (index) =>
                handleBuildLabChange({
                  materials: weekPlan.buildLab.materials.filter(
                    (_, itemIndex) => itemIndex !== index,
                  ),
                }),
              'No materials listed yet.',
              (index) => `Material ${index + 1}`,
            )}
            <Button
              variant="outlined"
              onClick={() =>
                handleBuildLabChange({
                  materials: [...weekPlan.buildLab.materials, ''],
                })
              }
              sx={{ alignSelf: 'flex-start' }}
            >
              Add material
            </Button>
          </Stack>
          <Stack spacing={1}>
            <Typography variant="subtitle1">Steps</Typography>
            {renderListField(
              weekPlan.buildLab.steps,
              (index, value) =>
                handleBuildLabChange({
                  steps: weekPlan.buildLab.steps.map((item, itemIndex) =>
                    itemIndex === index ? value : item,
                  ),
                }),
              (index) =>
                handleBuildLabChange({
                  steps: weekPlan.buildLab.steps.filter(
                    (_, itemIndex) => itemIndex !== index,
                  ),
                }),
              'No steps listed yet.',
              (index) => `Step ${index + 1}`,
            )}
            <Button
              variant="outlined"
              onClick={() =>
                handleBuildLabChange({
                  steps: [...weekPlan.buildLab.steps, ''],
                })
              }
              sx={{ alignSelf: 'flex-start' }}
            >
              Add step
            </Button>
          </Stack>
        </Stack>
      </SectionCard>

      <SectionCard title="Week dates">
        <Stack spacing={2}>
          <TextField
            label="Week start"
            value={formatDateForInput(weekPlan.startDate)}
            InputProps={{ readOnly: true }}
          />
          <TextField
            label="Week end"
            value={formatDateForInput(weekPlan.endDate ?? weekEndDate)}
            InputProps={{ readOnly: true }}
          />
        </Stack>
      </SectionCard>
    </Page>
  )
}
