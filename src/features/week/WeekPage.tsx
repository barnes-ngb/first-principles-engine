import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@mui/material/Button'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { DEFAULT_FAMILY_ID } from '../../core/firebase/config'
import { childrenCollection, weeksCollection } from '../../core/firebase/firestore'
import type { Child, WeekPlan } from '../../core/types/domain'
import { TrackType } from '../../core/types/enums'
import { getWeekRange } from '../engine/engine.logic'

type WeekFieldKey = 'theme' | 'virtue' | 'scriptureRef' | 'heartQuestion'

type GoalDrafts = Record<string, string>

const createDefaultWeekPlan = (weekStartDate: string, weekEndDate: string): WeekPlan => ({
  id: weekStartDate,
  startDate: weekStartDate,
  endDate: weekEndDate,
  theme: '',
  virtue: '',
  scriptureRef: '',
  heartQuestion: '',
  tracks: [TrackType.Support, TrackType.Stretch],
  flywheelPlan: '',
  buildLab: {
    title: '',
    materials: [],
    steps: [],
  },
  childGoals: [],
})

export default function WeekPage() {
  const familyId = DEFAULT_FAMILY_ID
  const weekRange = useMemo(() => getWeekRange(new Date()), [])
  const weekPlanRef = useMemo(
    () => doc(weeksCollection(familyId), weekRange.start),
    [familyId, weekRange.start],
  )
  const [weekPlan, setWeekPlan] = useState<WeekPlan | null>(null)
  const [children, setChildren] = useState<Child[]>([])
  const [goalDrafts, setGoalDrafts] = useState<GoalDrafts>({})
  const [materialDraft, setMaterialDraft] = useState('')
  const [stepDraft, setStepDraft] = useState('')

  useEffect(() => {
    let isMounted = true

    const loadWeekPlan = async () => {
      const snapshot = await getDoc(weekPlanRef)
      if (!isMounted) return

      if (snapshot.exists()) {
        const data = snapshot.data() as WeekPlan
        setWeekPlan({ ...data, id: data.id ?? snapshot.id })
        return
      }

      const defaultPlan = createDefaultWeekPlan(weekRange.start, weekRange.end)
      await setDoc(weekPlanRef, defaultPlan)
      if (isMounted) {
        setWeekPlan(defaultPlan)
      }
    }

    loadWeekPlan()

    return () => {
      isMounted = false
    }
  }, [weekPlanRef, weekRange.end, weekRange.start])

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
    (field: WeekFieldKey, value: string) => {
      if (!weekPlan) return
      setWeekPlan({ ...weekPlan, [field]: value })
    },
    [weekPlan],
  )

  const handleFieldBlur = useCallback(
    async (field: WeekFieldKey) => {
      if (!weekPlan) return
      await updateDoc(weekPlanRef, { [field]: weekPlan[field] })
    },
    [weekPlan, weekPlanRef],
  )

  const handleBuildLabTitleChange = useCallback(
    (value: string) => {
      if (!weekPlan) return
      setWeekPlan({
        ...weekPlan,
        buildLab: {
          ...weekPlan.buildLab,
          title: value,
        },
      })
    },
    [weekPlan],
  )

  const handleBuildLabTitleBlur = useCallback(async () => {
    if (!weekPlan) return
    await updateDoc(weekPlanRef, { buildLab: weekPlan.buildLab })
  }, [weekPlan, weekPlanRef])

  const handleAddMaterial = useCallback(async () => {
    const trimmed = materialDraft.trim()
    if (!trimmed || !weekPlan) return

    const updatedBuildLab = {
      ...weekPlan.buildLab,
      materials: [...weekPlan.buildLab.materials, trimmed],
    }
    setWeekPlan({ ...weekPlan, buildLab: updatedBuildLab })
    setMaterialDraft('')
    await updateDoc(weekPlanRef, { buildLab: updatedBuildLab })
  }, [materialDraft, weekPlan, weekPlanRef])

  const handleRemoveMaterial = useCallback(
    async (index: number) => {
      if (!weekPlan) return
      const updatedMaterials = weekPlan.buildLab.materials.filter(
        (_, materialIndex) => materialIndex !== index,
      )
      const updatedBuildLab = {
        ...weekPlan.buildLab,
        materials: updatedMaterials,
      }
      setWeekPlan({ ...weekPlan, buildLab: updatedBuildLab })
      await updateDoc(weekPlanRef, { buildLab: updatedBuildLab })
    },
    [weekPlan, weekPlanRef],
  )

  const handleAddStep = useCallback(async () => {
    const trimmed = stepDraft.trim()
    if (!trimmed || !weekPlan) return

    const updatedBuildLab = {
      ...weekPlan.buildLab,
      steps: [...weekPlan.buildLab.steps, trimmed],
    }
    setWeekPlan({ ...weekPlan, buildLab: updatedBuildLab })
    setStepDraft('')
    await updateDoc(weekPlanRef, { buildLab: updatedBuildLab })
  }, [stepDraft, weekPlan, weekPlanRef])

  const handleRemoveStep = useCallback(
    async (index: number) => {
      if (!weekPlan) return
      const updatedSteps = weekPlan.buildLab.steps.filter(
        (_, stepIndex) => stepIndex !== index,
      )
      const updatedBuildLab = {
        ...weekPlan.buildLab,
        steps: updatedSteps,
      }
      setWeekPlan({ ...weekPlan, buildLab: updatedBuildLab })
      await updateDoc(weekPlanRef, { buildLab: updatedBuildLab })
    },
    [weekPlan, weekPlanRef],
  )

  const handleGoalDraftChange = useCallback((childId: string, value: string) => {
    setGoalDrafts((prev) => ({ ...prev, [childId]: value }))
  }, [])

  const handleAddGoal = useCallback(
    async (childId: string) => {
      const draft = goalDrafts[childId]?.trim()
      if (!draft || !weekPlan) return

      const existing = weekPlan.childGoals.find((goal) => goal.childId === childId)
      const updatedChildGoals = existing
        ? weekPlan.childGoals.map((goal) =>
            goal.childId === childId
              ? { ...goal, goals: [...goal.goals, draft] }
              : goal,
          )
        : [...weekPlan.childGoals, { childId, goals: [draft] }]

      setWeekPlan({ ...weekPlan, childGoals: updatedChildGoals })
      setGoalDrafts((prev) => ({ ...prev, [childId]: '' }))
      await updateDoc(weekPlanRef, { childGoals: updatedChildGoals })
    },
    [goalDrafts, weekPlan, weekPlanRef],
  )

  const handleRemoveGoal = useCallback(
    async (childId: string, index: number) => {
      if (!weekPlan) return
      const updatedChildGoals = weekPlan.childGoals
        .map((goal) =>
          goal.childId === childId
            ? { ...goal, goals: goal.goals.filter((_, i) => i !== index) }
            : goal,
        )
        .filter((goal) => goal.goals.length > 0)

      setWeekPlan({ ...weekPlan, childGoals: updatedChildGoals })
      await updateDoc(weekPlanRef, { childGoals: updatedChildGoals })
    },
    [weekPlan, weekPlanRef],
  )

  const getGoalsForChild = useCallback(
    (childId: string) =>
      weekPlan?.childGoals.find((goal) => goal.childId === childId)?.goals ?? [],
    [weekPlan],
  )

  return (
    <Page>
      <SectionCard title={`Week Plan (${weekRange.start} – ${weekRange.end})`}>
        {weekPlan ? (
          <Stack spacing={2}>
            <TextField
              label="Theme"
              fullWidth
              value={weekPlan.theme}
              onChange={(event) => handleFieldChange('theme', event.target.value)}
              onBlur={() => void handleFieldBlur('theme')}
            />
            <TextField
              label="Virtue"
              fullWidth
              value={weekPlan.virtue}
              onChange={(event) =>
                handleFieldChange('virtue', event.target.value)
              }
              onBlur={() => void handleFieldBlur('virtue')}
            />
            <TextField
              label="Scripture Reference"
              fullWidth
              value={weekPlan.scriptureRef}
              onChange={(event) =>
                handleFieldChange('scriptureRef', event.target.value)
              }
              onBlur={() => void handleFieldBlur('scriptureRef')}
            />
            <TextField
              label="Heart Question"
              fullWidth
              value={weekPlan.heartQuestion}
              onChange={(event) =>
                handleFieldChange('heartQuestion', event.target.value)
              }
              onBlur={() => void handleFieldBlur('heartQuestion')}
            />
          </Stack>
        ) : (
          <Typography color="text.secondary">Loading week plan...</Typography>
        )}
      </SectionCard>

      <SectionCard title="Child Goals">
        <Stack spacing={3}>
          {children.length === 0 ? (
            <Typography color="text.secondary">
              Add children to start setting weekly goals.
            </Typography>
          ) : (
            children.map((child) => {
              const goals = getGoalsForChild(child.id)
              return (
                <Stack key={child.id} spacing={1.5}>
                  <Typography variant="subtitle1">{child.name}</Typography>
                  {goals.length > 0 ? (
                    <List disablePadding>
                      {goals.map((goal, index) => (
                        <ListItem
                          key={`${child.id}-goal-${index}`}
                          secondaryAction={
                            <Button
                              size="small"
                              onClick={() => void handleRemoveGoal(child.id, index)}
                            >
                              Remove
                            </Button>
                          }
                        >
                          <ListItemText primary={goal} />
                        </ListItem>
                      ))}
                    </List>
                  ) : (
                    <Typography color="text.secondary">
                      No goals yet for {child.name}.
                    </Typography>
                  )}
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                    <TextField
                      label="Add goal"
                      fullWidth
                      value={goalDrafts[child.id] ?? ''}
                      onChange={(event) =>
                        handleGoalDraftChange(child.id, event.target.value)
                      }
                    />
                    <Button
                      variant="contained"
                      onClick={() => void handleAddGoal(child.id)}
                    >
                      Add
                    </Button>
                  </Stack>
                </Stack>
              )
            })
          )}
        </Stack>
      </SectionCard>

      <SectionCard title="Build Lab">
        {weekPlan ? (
          <Stack spacing={2}>
            <TextField
              label="Title"
              fullWidth
              value={weekPlan.buildLab.title}
              onChange={(event) => handleBuildLabTitleChange(event.target.value)}
              onBlur={() => void handleBuildLabTitleBlur()}
            />
            <Stack spacing={1.5}>
              <Typography variant="subtitle1">Materials</Typography>
              {weekPlan.buildLab.materials.length > 0 ? (
                <List disablePadding>
                  {weekPlan.buildLab.materials.map((material, index) => (
                    <ListItem
                      key={`${material}-${index}`}
                      secondaryAction={
                        <Button
                          size="small"
                          onClick={() => void handleRemoveMaterial(index)}
                        >
                          Remove
                        </Button>
                      }
                    >
                      <ListItemText primary={material} />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography color="text.secondary">
                  No materials yet.
                </Typography>
              )}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField
                  label="Add material"
                  fullWidth
                  value={materialDraft}
                  onChange={(event) => setMaterialDraft(event.target.value)}
                />
                <Button variant="contained" onClick={() => void handleAddMaterial()}>
                  Add
                </Button>
              </Stack>
            </Stack>
            <Stack spacing={1.5}>
              <Typography variant="subtitle1">Steps</Typography>
              {weekPlan.buildLab.steps.length > 0 ? (
                <List disablePadding>
                  {weekPlan.buildLab.steps.map((step, index) => (
                    <ListItem
                      key={`${step}-${index}`}
                      secondaryAction={
                        <Button
                          size="small"
                          onClick={() => void handleRemoveStep(index)}
                        >
                          Remove
                        </Button>
                      }
                    >
                      <ListItemText primary={step} />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography color="text.secondary">No steps yet.</Typography>
              )}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField
                  label="Add step"
                  fullWidth
                  value={stepDraft}
                  onChange={(event) => setStepDraft(event.target.value)}
                />
                <Button variant="contained" onClick={() => void handleAddStep()}>
                  Add
                </Button>
              </Stack>
            </Stack>
          </Stack>
        ) : (
          <Typography color="text.secondary">Loading build lab...</Typography>
        )}
      </SectionCard>
    </Page>
  )
}
