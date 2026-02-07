import { useCallback, useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'

import Page from '../../components/Page'
import SaveIndicator from '../../components/SaveIndicator'
import type { SaveState } from '../../components/SaveIndicator'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  childrenCollection,
  weeksCollection,
} from '../../core/firebase/firestore'
import type { Child, WeekPlan } from '../../core/types/domain'
import { useDebounce } from '../../lib/useDebounce'
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
  const familyId = useFamilyId()
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
  const [saveState, setSaveState] = useState<SaveState>('idle')

  useEffect(() => {
    let isMounted = true

    const loadChildren = async () => {
      try {
        const snapshot = await getDocs(childrenCollection(familyId))
        if (!isMounted) return
        const loaded = snapshot.docs.map((docSnapshot) => ({
          ...(docSnapshot.data() as Child),
          id: docSnapshot.id,
        }))
        setChildren(loaded)
      } catch (err) {
        console.error('Failed to load children', err)
      }
    }

    loadChildren()

    return () => {
      isMounted = false
    }
  }, [familyId])

  useEffect(() => {
    let isMounted = true

    const loadWeekPlan = async () => {
      try {
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
      } catch (err) {
        console.error('Failed to load week plan', err)
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

  // --- Save helpers with debounce + status tracking ---

  const writeField = useCallback(
    async (field: string, value: unknown) => {
      setSaveState('saving')
      try {
        await updateDoc(weekPlanRef, { [field]: value })
        setSaveState('saved')
      } catch (err) {
        console.error('Failed to save week plan field', err)
        setSaveState('error')
      }
    },
    [weekPlanRef],
  )

  const debouncedWriteField = useDebounce(
    (field: string, value: unknown) => void writeField(field, value),
    800,
  )

  const updateWeekField = useCallback(
    (field: keyof WeekPlan, value: WeekPlan[keyof WeekPlan]) => {
      if (!weekPlan) return
      setWeekPlan({ ...weekPlan, [field]: value })
      debouncedWriteField(field, value)
    },
    [weekPlan, debouncedWriteField],
  )

  const writeBuildLab = useCallback(
    async (updatedBuildLab: WeekPlan['buildLab']) => {
      setSaveState('saving')
      try {
        await updateDoc(weekPlanRef, { buildLab: updatedBuildLab })
        setSaveState('saved')
      } catch (err) {
        console.error('Failed to save build lab', err)
        setSaveState('error')
      }
    },
    [weekPlanRef],
  )

  const debouncedWriteBuildLab = useDebounce(
    (updatedBuildLab: WeekPlan['buildLab']) => void writeBuildLab(updatedBuildLab),
    800,
  )

  const updateBuildLab = useCallback(
    (field: keyof WeekPlan['buildLab'], value: string | string[]) => {
      if (!weekPlan) return
      const updatedBuildLab = { ...weekPlan.buildLab, [field]: value }
      setWeekPlan({ ...weekPlan, buildLab: updatedBuildLab })
      // Debounce title changes; persist list mutations immediately
      if (field === 'title') {
        debouncedWriteBuildLab(updatedBuildLab)
      } else {
        void writeBuildLab(updatedBuildLab)
      }
    },
    [weekPlan, debouncedWriteBuildLab, writeBuildLab],
  )

  const handleAddMaterial = useCallback(() => {
    if (!weekPlan) return
    const trimmed = newMaterial.trim()
    if (!trimmed) return
    const updatedMaterials = [...weekPlan.buildLab.materials, trimmed]
    setNewMaterial('')
    updateBuildLab('materials', updatedMaterials)
  }, [newMaterial, updateBuildLab, weekPlan])

  const handleRemoveMaterial = useCallback(
    (index: number) => {
      if (!weekPlan) return
      const updatedMaterials = weekPlan.buildLab.materials.filter(
        (_, itemIndex) => itemIndex !== index,
      )
      updateBuildLab('materials', updatedMaterials)
    },
    [updateBuildLab, weekPlan],
  )

  const handleAddStep = useCallback(() => {
    if (!weekPlan) return
    const trimmed = newStep.trim()
    if (!trimmed) return
    const updatedSteps = [...weekPlan.buildLab.steps, trimmed]
    setNewStep('')
    updateBuildLab('steps', updatedSteps)
  }, [newStep, updateBuildLab, weekPlan])

  const handleRemoveStep = useCallback(
    (index: number) => {
      if (!weekPlan) return
      const updatedSteps = weekPlan.buildLab.steps.filter(
        (_, itemIndex) => itemIndex !== index,
      )
      updateBuildLab('steps', updatedSteps)
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
      setSaveState('saving')
      try {
        await updateDoc(weekPlanRef, { childGoals: updatedChildGoals })
        setSaveState('saved')
      } catch (err) {
        console.error('Failed to save goal', err)
        setSaveState('error')
      }
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
      setSaveState('saving')
      try {
        await updateDoc(weekPlanRef, { childGoals: updatedChildGoals })
        setSaveState('saved')
      } catch (err) {
        console.error('Failed to remove goal', err)
        setSaveState('error')
      }
    },
    [weekPlan, weekPlanRef],
  )

  if (!weekPlan) {
    return (
      <Page>
        <SectionCard title="Week">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CircularProgress size={20} />
            <Typography color="text.secondary">Loading week plan...</Typography>
          </Box>
        </SectionCard>
      </Page>
    )
  }

  return (
    <Page>
      <SectionCard title={`Week Plan (${weekPlan.startDate})`}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Typography color="text.secondary" variant="body2">
              Review the week plan, then jump into quick capture mode when ready.
            </Typography>
            <SaveIndicator state={saveState} />
          </Stack>
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
