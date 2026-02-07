import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@mui/material/Button'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { DEFAULT_FAMILY_ID } from '../../core/firebase/config'
import {
  childrenCollection,
  weeksCollection,
} from '../../core/firebase/firestore'
import type { Child, WeekPlan } from '../../core/types/domain'
import { getWeekRange } from '../engine/engine.logic'

const createDefaultWeekPlan = (
  weekStartDate: string,
  weekEndDate: string,
  children: Child[],
): WeekPlan => ({
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
  childGoals: children.map((child) => ({ childId: child.id, goals: [] })),
})

export default function WeekPage() {
  const navigate = useNavigate()
  const familyId = DEFAULT_FAMILY_ID
  const weekRange = useMemo(() => getWeekRange(new Date()), [])
  const weekPlanRef = useMemo(
    () => doc(weeksCollection(familyId), weekRange.start),
    [familyId, weekRange.start],
  )

  const [weekPlan, setWeekPlan] = useState<WeekPlan | null>(null)
  const [children, setChildren] = useState<Child[]>([])
  const [newGoalByChild, setNewGoalByChild] = useState<Record<string, string>>(
    {},
  )
  const [newMaterial, setNewMaterial] = useState('')
  const [newStep, setNewStep] = useState('')

  useEffect(() => {
    let isMounted = true

    const loadChildren = async () => {
      const snapshot = await getDocs(childrenCollection(familyId))
      if (!isMounted) return
      const loaded = snapshot.docs.map((docSnapshot) => ({
        ...(docSnapshot.data() as Child),
        id: docSnapshot.id,
      }))
      setChildren(loaded)
    }

    loadChildren()

    return () => {
      isMounted = false
    }
  }, [familyId])

  useEffect(() => {
    let isMounted = true

    const loadWeekPlan = async () => {
      const snapshot = await getDoc(weekPlanRef)
      if (!isMounted) return

      if (snapshot.exists()) {
        setWeekPlan(snapshot.data())
        return
      }

      const defaultWeekPlan = createDefaultWeekPlan(
        weekRange.start,
        weekRange.end,
        children,
      )
      await setDoc(weekPlanRef, defaultWeekPlan)
      if (isMounted) {
        setWeekPlan(defaultWeekPlan)
      }
    }

    loadWeekPlan()

    return () => {
      isMounted = false
    }
  }, [children, weekPlanRef, weekRange.end, weekRange.start])

  useEffect(() => {
    if (!weekPlan || children.length === 0) return
    const existingIds = new Set(weekPlan.childGoals.map((goal) => goal.childId))
    const additions = children
      .filter((child) => !existingIds.has(child.id))
      .map((child) => ({ childId: child.id, goals: [] }))
    if (additions.length === 0) return

    const updated = {
      ...weekPlan,
      childGoals: [...weekPlan.childGoals, ...additions],
    }
    void updateDoc(weekPlanRef, { childGoals: updated.childGoals }).then(() => {
      setWeekPlan(updated)
    })
  }, [children, weekPlan, weekPlanRef])

  const updateWeekField = useCallback(
    async (field: keyof WeekPlan, value: WeekPlan[keyof WeekPlan]) => {
      if (!weekPlan) return
      const updated = { ...weekPlan, [field]: value }
      setWeekPlan(updated)
      await updateDoc(weekPlanRef, { [field]: value })
    },
    [weekPlan, weekPlanRef],
  )

  const updateBuildLab = useCallback(
    async (field: keyof WeekPlan['buildLab'], value: string | string[]) => {
      if (!weekPlan) return
      const updatedBuildLab = { ...weekPlan.buildLab, [field]: value }
      const updated = { ...weekPlan, buildLab: updatedBuildLab }
      setWeekPlan(updated)
      await updateDoc(weekPlanRef, { buildLab: updatedBuildLab })
    },
    [weekPlan, weekPlanRef],
  )

  const handleAddMaterial = useCallback(async () => {
    if (!weekPlan) return
    const trimmed = newMaterial.trim()
    if (!trimmed) return
    const updatedMaterials = [...weekPlan.buildLab.materials, trimmed]
    setNewMaterial('')
    await updateBuildLab('materials', updatedMaterials)
  }, [newMaterial, updateBuildLab, weekPlan])

  const handleRemoveMaterial = useCallback(
    async (index: number) => {
      if (!weekPlan) return
      const updatedMaterials = weekPlan.buildLab.materials.filter(
        (_, itemIndex) => itemIndex !== index,
      )
      await updateBuildLab('materials', updatedMaterials)
    },
    [updateBuildLab, weekPlan],
  )

  const handleAddStep = useCallback(async () => {
    if (!weekPlan) return
    const trimmed = newStep.trim()
    if (!trimmed) return
    const updatedSteps = [...weekPlan.buildLab.steps, trimmed]
    setNewStep('')
    await updateBuildLab('steps', updatedSteps)
  }, [newStep, updateBuildLab, weekPlan])

  const handleRemoveStep = useCallback(
    async (index: number) => {
      if (!weekPlan) return
      const updatedSteps = weekPlan.buildLab.steps.filter(
        (_, itemIndex) => itemIndex !== index,
      )
      await updateBuildLab('steps', updatedSteps)
    },
    [updateBuildLab, weekPlan],
  )

  const handleGoalInputChange = useCallback((childId: string, value: string) => {
    setNewGoalByChild((prev) => ({ ...prev, [childId]: value }))
  }, [])

  const handleAddGoal = useCallback(
    async (childId: string) => {
      if (!weekPlan) return
      const trimmed = (newGoalByChild[childId] ?? '').trim()
      if (!trimmed) return

      const updatedChildGoals = weekPlan.childGoals.map((goal) =>
        goal.childId === childId
          ? { ...goal, goals: [...goal.goals, trimmed] }
          : goal,
      )
      setNewGoalByChild((prev) => ({ ...prev, [childId]: '' }))
      setWeekPlan({ ...weekPlan, childGoals: updatedChildGoals })
      await updateDoc(weekPlanRef, { childGoals: updatedChildGoals })
    },
    [newGoalByChild, weekPlan, weekPlanRef],
  )

  const handleRemoveGoal = useCallback(
    async (childId: string, goalIndex: number) => {
      if (!weekPlan) return
      const updatedChildGoals = weekPlan.childGoals.map((goal) => {
        if (goal.childId !== childId) return goal
        return {
          ...goal,
          goals: goal.goals.filter((_, index) => index !== goalIndex),
        }
      })
      setWeekPlan({ ...weekPlan, childGoals: updatedChildGoals })
      await updateDoc(weekPlanRef, { childGoals: updatedChildGoals })
    },
    [weekPlan, weekPlanRef],
  )

  if (!weekPlan) {
    return (
      <Page>
        <SectionCard title="Week">
          <Typography color="text.secondary">Loading week plan...</Typography>
        </SectionCard>
      </Page>
    )
  }

  return (
    <Page>
      <SectionCard title={`Week Plan (${weekPlan.startDate})`}>
        <Stack spacing={2}>
          <Typography color="text.secondary">
            Review the week plan, then jump into quick capture mode when ready.
          </Typography>
          <TextField
            label="Theme"
            value={weekPlan.theme}
            onChange={(event) => updateWeekField('theme', event.target.value)}
          />
          <TextField
            label="Virtue"
            value={weekPlan.virtue}
            onChange={(event) => updateWeekField('virtue', event.target.value)}
          />
          <TextField
            label="Scripture reference"
            value={weekPlan.scriptureRef}
            onChange={(event) =>
              updateWeekField('scriptureRef', event.target.value)
            }
          />
          <TextField
            label="Heart question"
            multiline
            minRows={2}
            value={weekPlan.heartQuestion}
            onChange={(event) =>
              updateWeekField('heartQuestion', event.target.value)
            }
          />
        </Stack>
      </SectionCard>

      <SectionCard title="Per-child goals">
        <Stack spacing={2}>
          {children.length === 0 ? (
            <Typography color="text.secondary">
              Add children to set weekly goals.
            </Typography>
          ) : (
            children.map((child) => {
              const childGoals =
                weekPlan.childGoals.find((goal) => goal.childId === child.id)
                  ?.goals ?? []
              return (
                <Stack key={child.id} spacing={1}>
                  <Typography variant="subtitle1">{child.name}</Typography>
                  {childGoals.length === 0 ? (
                    <Typography color="text.secondary">
                      No goals yet.
                    </Typography>
                  ) : (
                    <List dense>
                      {childGoals.map((goal, index) => (
                        <ListItem key={`${child.id}-${goal}-${index}`} disableGutters>
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            justifyContent="space-between"
                            sx={{ width: '100%' }}
                          >
                            <Typography variant="body2">{goal}</Typography>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => handleRemoveGoal(child.id, index)}
                            >
                              Remove
                            </Button>
                          </Stack>
                        </ListItem>
                      ))}
                    </List>
                  )}
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <TextField
                      label="Add goal"
                      fullWidth
                      value={newGoalByChild[child.id] ?? ''}
                      onChange={(event) =>
                        handleGoalInputChange(child.id, event.target.value)
                      }
                    />
                    <Button
                      variant="contained"
                      onClick={() => handleAddGoal(child.id)}
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
        <Stack spacing={2}>
          <TextField
            label="Title"
            value={weekPlan.buildLab.title}
            onChange={(event) => updateBuildLab('title', event.target.value)}
          />

          <Stack spacing={1}>
            <Typography variant="subtitle1">Materials</Typography>
            {weekPlan.buildLab.materials.length === 0 ? (
              <Typography color="text.secondary">
                No materials yet.
              </Typography>
            ) : (
              <List dense>
                {weekPlan.buildLab.materials.map((material, index) => (
                  <ListItem key={`${material}-${index}`} disableGutters>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      justifyContent="space-between"
                      sx={{ width: '100%' }}
                    >
                      <Typography variant="body2">{material}</Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleRemoveMaterial(index)}
                      >
                        Remove
                      </Button>
                    </Stack>
                  </ListItem>
                ))}
              </List>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                label="Add material"
                fullWidth
                value={newMaterial}
                onChange={(event) => setNewMaterial(event.target.value)}
              />
              <Button variant="contained" onClick={handleAddMaterial}>
                Add
              </Button>
            </Stack>
          </Stack>

          <Stack spacing={1}>
            <Typography variant="subtitle1">Steps</Typography>
            {weekPlan.buildLab.steps.length === 0 ? (
              <Typography color="text.secondary">No steps yet.</Typography>
            ) : (
              <List dense>
                {weekPlan.buildLab.steps.map((step, index) => (
                  <ListItem key={`${step}-${index}`} disableGutters>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      justifyContent="space-between"
                      sx={{ width: '100%' }}
                    >
                      <Typography variant="body2">{step}</Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleRemoveStep(index)}
                      >
                        Remove
                      </Button>
                    </Stack>
                  </ListItem>
                ))}
              </List>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                label="Add step"
                fullWidth
                value={newStep}
                onChange={(event) => setNewStep(event.target.value)}
              />
              <Button variant="contained" onClick={handleAddStep}>
                Add
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </SectionCard>

      <SectionCard title="Lab Mode">
        <Stack spacing={2}>
          <Typography color="text.secondary">
            Ready to jump into quick capture mode for this week?
          </Typography>
          <Button
            variant="contained"
            size="large"
            onClick={() => navigate('/week/lab')}
          >
            Start Lab Mode
          </Button>
        </Stack>
      </SectionCard>
    </Page>
  )
}
