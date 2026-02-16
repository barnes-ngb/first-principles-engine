import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import ChatIcon from '@mui/icons-material/Chat'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import DeleteIcon from '@mui/icons-material/Delete'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'
import Stepper from '@mui/material/Stepper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { addDoc, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'

import ChildSelector from '../../components/ChildSelector'
import Page from '../../components/Page'
import PhotoCapture from '../../components/PhotoCapture'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  artifactsCollection,
  daysCollection,
  plannerSessionDocId,
  plannerSessionsCollection,
  skillSnapshotsCollection,
  weeksCollection,
} from '../../core/firebase/firestore'
import { generateFilename, uploadArtifactFile } from '../../core/firebase/upload'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type {
  AppBlock,
  AssignmentCandidate,
  ChecklistItem,
  DayBlock,
  DayLog,
  PlannerSession,
  SkillSnapshot,
  WeeklyPlanItem,
} from '../../core/types/domain'
import {
  AssignmentAction,
  DayBlockType,
  EngineStage,
  EvidenceType,
  PlannerSessionStatus,
  SubjectBucket,
} from '../../core/types/enums'
import { getWeekRange } from '../engine/engine.logic'
import { dayLogDocId } from '../today/daylog.model'
import {
  applySnapshotToAssignments,
  defaultAppBlocks,
  dayTotalMinutes,
  generateDraftPlan,
  generateId,
  weekDays,
} from './planner.logic'

const stepLabels = [
  'Setup',
  'Upload Photos',
  'Review Assignments',
  'Preview Plan',
  'Apply',
]

const subjectBucketMap: Record<string, SubjectBucket> = {
  reading: SubjectBucket.Reading,
  math: SubjectBucket.Math,
  language: SubjectBucket.LanguageArts,
  la: SubjectBucket.LanguageArts,
  science: SubjectBucket.Science,
  social: SubjectBucket.SocialStudies,
}

function guessSubjectBucket(text: string): SubjectBucket {
  const lower = text.toLowerCase()
  for (const [key, value] of Object.entries(subjectBucketMap)) {
    if (lower.includes(key)) return value
  }
  return SubjectBucket.Other
}

export default function PlannerPage() {
  const navigate = useNavigate()
  const familyId = useFamilyId()
  const {
    children,
    activeChildId,
    activeChild,
    setActiveChildId,
    isLoading: isLoadingChildren,
    addChild,
  } = useActiveChild()

  const weekRange = useMemo(() => getWeekRange(new Date()), [])

  const [step, setStep] = useState(0)
  const [hoursPerDay, setHoursPerDay] = useState(2.5)
  const [appBlocks, setAppBlocks] = useState<AppBlock[]>(defaultAppBlocks)
  const [photoIds, setPhotoIds] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [assignments, setAssignments] = useState<AssignmentCandidate[]>([])
  const [draftPlan, setDraftPlan] = useState<WeeklyPlanItem[]>([])
  const [snapshot, setSnapshot] = useState<SkillSnapshot | null>(null)
  const [applied, setApplied] = useState(false)
  const [snack, setSnack] = useState<{ text: string; severity: 'success' | 'error' } | null>(null)

  // Load existing planner session if any
  const sessionDocId = useMemo(
    () => (activeChildId ? plannerSessionDocId(weekRange.start, activeChildId) : ''),
    [weekRange.start, activeChildId],
  )

  useEffect(() => {
    if (!sessionDocId || !activeChildId) return
    const ref = doc(plannerSessionsCollection(familyId), sessionDocId)
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setHoursPerDay(data.availableHoursPerDay)
        setAppBlocks(data.appBlocks)
        setPhotoIds(data.photoIds)
        setAssignments(data.assignments)
        setDraftPlan(data.draftPlan)
        if (data.status === PlannerSessionStatus.Applied) {
          setApplied(true)
          setStep(4)
        } else if (data.status === PlannerSessionStatus.DraftReview) {
          setStep(3)
        } else if (data.assignments.length > 0) {
          setStep(2)
        } else if (data.photoIds.length > 0) {
          setStep(1)
        }
      }
    })
    return unsubscribe
  }, [familyId, sessionDocId, activeChildId])

  // Load skill snapshot for the child
  useEffect(() => {
    if (!activeChildId) return
    const ref = doc(skillSnapshotsCollection(familyId), activeChildId)
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setSnapshot({ ...snap.data(), id: snap.id })
      }
    })
    return unsubscribe
  }, [familyId, activeChildId])

  const persistSession = useCallback(
    async (updates: Partial<PlannerSession>) => {
      if (!activeChildId || !sessionDocId) return
      const ref = doc(plannerSessionsCollection(familyId), sessionDocId)
      const snap = await getDoc(ref)
      const now = new Date().toISOString()
      if (snap.exists()) {
        await setDoc(ref, { ...snap.data(), ...updates, updatedAt: now })
      } else {
        const session: PlannerSession = {
          childId: activeChildId,
          weekKey: weekRange.start,
          status: PlannerSessionStatus.Setup,
          availableHoursPerDay: hoursPerDay,
          appBlocks,
          photoIds: [],
          assignments: [],
          draftPlan: [],
          createdAt: now,
          updatedAt: now,
          ...updates,
        }
        await setDoc(ref, session)
      }
    },
    [familyId, sessionDocId, activeChildId, weekRange.start, hoursPerDay, appBlocks],
  )

  // Step 1: Setup — confirm child, week, hours, app blocks
  const handleSetupNext = useCallback(() => {
    void persistSession({
      status: PlannerSessionStatus.Uploading,
      availableHoursPerDay: hoursPerDay,
      appBlocks,
    })
    setStep(1)
  }, [persistSession, hoursPerDay, appBlocks])

  // Step 2: Upload photos
  const handlePhotoCapture = useCallback(
    async (file: File) => {
      if (!activeChildId) return
      setUploading(true)
      try {
        const artifact = {
          title: `Workbook page ${photoIds.length + 1}`,
          type: EvidenceType.Photo,
          createdAt: new Date().toISOString(),
          childId: activeChildId,
          tags: {
            engineStage: EngineStage.Wonder,
            domain: 'planner',
            subjectBucket: SubjectBucket.Other,
            location: 'Home',
          },
          notes: 'Uploaded for weekly planning',
        }
        const docRef = await addDoc(artifactsCollection(familyId), artifact)
        const ext = file.name.split('.').pop() ?? 'jpg'
        const filename = generateFilename(ext)
        await uploadArtifactFile(familyId, docRef.id, file, filename)
        const newPhotoIds = [...photoIds, docRef.id]
        setPhotoIds(newPhotoIds)
        void persistSession({ photoIds: newPhotoIds })
        setSnack({ text: 'Photo uploaded.', severity: 'success' })
      } catch (err) {
        console.error('Photo upload failed', err)
        setSnack({ text: 'Photo upload failed.', severity: 'error' })
      } finally {
        setUploading(false)
      }
    },
    [activeChildId, familyId, photoIds, persistSession],
  )

  const handleUploadNext = useCallback(() => {
    setStep(2)
  }, [])

  // Step 3: Manual assignment entry (MVP — no OCR)
  const handleAddAssignment = useCallback(() => {
    const newAssignment: AssignmentCandidate = {
      id: generateId(),
      subjectBucket: SubjectBucket.Other,
      workbookName: '',
      lessonName: '',
      pageRange: '',
      estimatedMinutes: 15,
      difficultyCues: [],
      action: AssignmentAction.Keep,
    }
    setAssignments((prev) => [...prev, newAssignment])
  }, [])

  const handleUpdateAssignment = useCallback(
    (index: number, field: keyof AssignmentCandidate, value: string | number) => {
      setAssignments((prev) =>
        prev.map((a, i) => {
          if (i !== index) return a
          if (field === 'workbookName') {
            const guessed = guessSubjectBucket(value as string)
            return { ...a, [field]: value as string, subjectBucket: guessed }
          }
          return { ...a, [field]: value }
        }),
      )
    },
    [],
  )

  const handleRemoveAssignment = useCallback((index: number) => {
    setAssignments((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleAssignmentsNext = useCallback(() => {
    // Apply skill snapshot suggestions
    const processed = applySnapshotToAssignments(assignments, snapshot)
    setAssignments(processed)

    // Generate draft plan
    const plan = generateDraftPlan(processed, appBlocks, hoursPerDay * 60)
    setDraftPlan(plan)

    void persistSession({
      status: PlannerSessionStatus.DraftReview,
      assignments: processed,
      draftPlan: plan,
    })
    setStep(3)
  }, [assignments, snapshot, appBlocks, hoursPerDay, persistSession])

  // Step 4: Preview plan
  const handleToggleItem = useCallback((itemId: string) => {
    setDraftPlan((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, accepted: !item.accepted } : item,
      ),
    )
  }, [])

  const handleMoveItem = useCallback((itemId: string, newDay: string) => {
    setDraftPlan((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, day: newDay } : item,
      ),
    )
  }, [])

  const handleChangeMinutes = useCallback((itemId: string, minutes: number) => {
    setDraftPlan((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, estimatedMinutes: minutes } : item,
      ),
    )
  }, [])

  // Step 5: Apply plan
  const handleApplyPlan = useCallback(async () => {
    if (!activeChildId) return
    try {
      // Write WeekPlan update
      const weekRef = doc(weeksCollection(familyId), weekRange.start)
      const weekSnap = await getDoc(weekRef)
      if (weekSnap.exists()) {
        // Update existing week plan with planner-generated data
        const existing = weekSnap.data()
        const existingGoals = existing.childGoals ?? []
        const childGoalIndex = existingGoals.findIndex(
          (g: { childId: string }) => g.childId === activeChildId,
        )
        const planGoals = draftPlan
          .filter((item) => item.accepted && !item.isAppBlock)
          .map((item) => item.title)
        const updatedGoals = [...existingGoals]
        if (childGoalIndex >= 0) {
          updatedGoals[childGoalIndex] = {
            ...updatedGoals[childGoalIndex],
            goals: [...updatedGoals[childGoalIndex].goals, ...planGoals],
          }
        } else {
          updatedGoals.push({ childId: activeChildId, goals: planGoals })
        }
        await setDoc(weekRef, { ...existing, childGoals: updatedGoals })
      }

      // Write DailyPlan checklist items for each day
      for (const day of weekDays) {
        const dayItems = draftPlan.filter(
          (item) => item.day === day && item.accepted,
        )
        if (dayItems.length === 0) continue

        // Calculate date from weekRange.start + day index
        const startDate = new Date(weekRange.start + 'T00:00:00')
        const dayIndex = weekDays.indexOf(day)
        const targetDate = new Date(startDate)
        // weekRange.start is Sunday-based; Monday = +1
        targetDate.setDate(startDate.getDate() + dayIndex + 1)
        const dateKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`

        const docId = dayLogDocId(dateKey, activeChildId)
        const dayLogRef = doc(daysCollection(familyId), docId)
        const dayLogSnap = await getDoc(dayLogRef)

        const checklist: ChecklistItem[] = dayItems.map((item) => ({
          label: `${item.title} (${item.estimatedMinutes}m)`,
          completed: false,
          skillTags: item.skillTags,
          ladderRef: item.ladderRef,
        }))

        const blocks: DayBlock[] = dayItems
          .filter((item) => !item.isAppBlock)
          .map((item) => ({
            type: subjectToDayBlockType(item.subjectBucket),
            title: item.title,
            subjectBucket: item.subjectBucket,
            plannedMinutes: item.estimatedMinutes,
            skillTags: item.skillTags,
            ladderRef: item.ladderRef,
          }))

        if (dayLogSnap.exists()) {
          const existing = dayLogSnap.data()
          await setDoc(dayLogRef, {
            ...existing,
            checklist: [...(existing.checklist ?? []), ...checklist],
            blocks: [...(existing.blocks ?? []), ...blocks],
            updatedAt: new Date().toISOString(),
          })
        } else {
          const newDayLog: DayLog = {
            childId: activeChildId,
            date: dateKey,
            blocks,
            checklist,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          await setDoc(dayLogRef, newDayLog)
        }
      }

      // Mark session as applied
      void persistSession({
        status: PlannerSessionStatus.Applied,
        draftPlan,
        assignments,
      })

      setApplied(true)
      setStep(4)
      setSnack({ text: 'Plan applied! Check This Week and Today.', severity: 'success' })
    } catch (err) {
      console.error('Failed to apply plan', err)
      setSnack({ text: 'Failed to apply plan.', severity: 'error' })
    }
  }, [activeChildId, familyId, weekRange.start, draftPlan, assignments, persistSession])

  return (
    <Page>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" useFlexGap>
        <Box>
          <Typography variant="h4" component="h1">Plan My Week</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Upload workbook photos, review assignments, and generate a weekly plan.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<ChatIcon />}
          onClick={() => navigate('/planner/chat')}
        >
          Planner Chat (Recommended)
        </Button>
      </Stack>

      <ChildSelector
        children={children}
        selectedChildId={activeChildId}
        onSelect={setActiveChildId}
        onChildAdded={addChild}
        isLoading={isLoadingChildren}
        emptyMessage="Add a child to start planning."
      />

      {activeChildId && (
        <>
          <Stepper activeStep={step} alternativeLabel sx={{ my: 2 }}>
            {stepLabels.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {snapshot && snapshot.prioritySkills.length > 0 && (
            <SectionCard title="Skill Snapshot Active">
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {snapshot.prioritySkills.map((skill) => (
                  <Chip
                    key={skill.tag}
                    label={`${skill.label} (${skill.level})`}
                    size="small"
                    color="info"
                    variant="outlined"
                  />
                ))}
              </Stack>
            </SectionCard>
          )}

          {/* Step 0: Setup */}
          {step === 0 && (
            <SectionCard title="Planning Setup">
              <Stack spacing={2}>
                <Typography variant="body2" color="text.secondary">
                  Week of {weekRange.start} \u2014 {activeChild?.name}
                </Typography>
                <TextField
                  label="Available hours per day"
                  type="number"
                  value={hoursPerDay}
                  onChange={(e) => setHoursPerDay(Number(e.target.value) || 2)}
                  inputProps={{ min: 0.5, max: 8, step: 0.5 }}
                  helperText="Default: 2\u20133 hours"
                />
                <Typography variant="subtitle2">App Blocks (run on rails)</Typography>
                {appBlocks.map((block, index) => (
                  <Stack key={index} direction="row" spacing={1} alignItems="center">
                    <TextField
                      label="App name"
                      size="small"
                      value={block.label}
                      onChange={(e) => {
                        const updated = [...appBlocks]
                        updated[index] = { ...block, label: e.target.value }
                        setAppBlocks(updated)
                      }}
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      label="Minutes"
                      type="number"
                      size="small"
                      value={block.defaultMinutes}
                      onChange={(e) => {
                        const updated = [...appBlocks]
                        updated[index] = { ...block, defaultMinutes: Number(e.target.value) || 15 }
                        setAppBlocks(updated)
                      }}
                      sx={{ width: 100 }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => setAppBlocks(appBlocks.filter((_, i) => i !== index))}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() =>
                    setAppBlocks([...appBlocks, { label: '', defaultMinutes: 15 }])
                  }
                >
                  Add App Block
                </Button>
                <Button variant="contained" onClick={handleSetupNext}>
                  Next: Upload Photos
                </Button>
              </Stack>
            </SectionCard>
          )}

          {/* Step 1: Upload Photos */}
          {step === 1 && (
            <SectionCard title="Upload Workbook Photos">
              <Stack spacing={2}>
                <Typography variant="body2" color="text.secondary">
                  Take photos of workbook pages for the week (3\u201310 photos).
                  You can also skip this step and add assignments manually.
                </Typography>
                <PhotoCapture onCapture={handlePhotoCapture} uploading={uploading} />
                {photoIds.length > 0 && (
                  <Typography variant="body2">
                    {photoIds.length} photo{photoIds.length > 1 ? 's' : ''} uploaded
                  </Typography>
                )}
                <Stack direction="row" spacing={1}>
                  <Button variant="outlined" onClick={() => setStep(0)}>
                    Back
                  </Button>
                  <Button variant="contained" onClick={handleUploadNext}>
                    Next: Add Assignments
                  </Button>
                </Stack>
              </Stack>
            </SectionCard>
          )}

          {/* Step 2: Review / Add Assignments */}
          {step === 2 && (
            <SectionCard title="Assignments">
              <Stack spacing={2}>
                <Typography variant="body2" color="text.secondary">
                  Add assignments from the workbook pages. The planner will apply the skill
                  snapshot to suggest modifications.
                </Typography>
                {assignments.map((assignment, index) => (
                  <Box
                    key={assignment.id}
                    sx={{
                      p: 1.5,
                      border: '1px solid',
                      borderColor:
                        assignment.action === AssignmentAction.Skip
                          ? 'error.main'
                          : assignment.action === AssignmentAction.Modify
                            ? 'warning.main'
                            : 'divider',
                      borderRadius: 1,
                    }}
                  >
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <TextField
                          label="Workbook"
                          size="small"
                          fullWidth
                          value={assignment.workbookName}
                          onChange={(e) =>
                            handleUpdateAssignment(index, 'workbookName', e.target.value)
                          }
                        />
                        <TextField
                          label="Lesson"
                          size="small"
                          fullWidth
                          value={assignment.lessonName}
                          onChange={(e) =>
                            handleUpdateAssignment(index, 'lessonName', e.target.value)
                          }
                        />
                        <IconButton
                          size="small"
                          onClick={() => handleRemoveAssignment(index)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <TextField
                          label="Pages"
                          size="small"
                          value={assignment.pageRange ?? ''}
                          onChange={(e) =>
                            handleUpdateAssignment(index, 'pageRange', e.target.value)
                          }
                          sx={{ width: 120 }}
                        />
                        <TextField
                          label="Minutes"
                          type="number"
                          size="small"
                          value={assignment.estimatedMinutes}
                          onChange={(e) =>
                            handleUpdateAssignment(
                              index,
                              'estimatedMinutes',
                              Number(e.target.value) || 15,
                            )
                          }
                          sx={{ width: 100 }}
                        />
                        <TextField
                          label="Subject"
                          select
                          size="small"
                          value={assignment.subjectBucket}
                          onChange={(e) =>
                            handleUpdateAssignment(index, 'subjectBucket', e.target.value)
                          }
                          sx={{ minWidth: 130 }}
                        >
                          {Object.values(SubjectBucket).map((bucket) => (
                            <MenuItem key={bucket} value={bucket}>
                              {bucket}
                            </MenuItem>
                          ))}
                        </TextField>
                        <TextField
                          label="Action"
                          select
                          size="small"
                          value={assignment.action}
                          onChange={(e) =>
                            handleUpdateAssignment(index, 'action', e.target.value)
                          }
                          sx={{ minWidth: 100 }}
                        >
                          {Object.values(AssignmentAction).map((action) => (
                            <MenuItem key={action} value={action}>
                              {action}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Stack>
                      {assignment.skipSuggestion && (
                        <Alert severity={assignment.skipSuggestion.action === 'skip' ? 'error' : 'warning'}>
                          <Typography variant="body2">
                            <strong>{assignment.skipSuggestion.action === 'skip' ? 'Skip' : 'Modify'}:</strong>{' '}
                            {assignment.skipSuggestion.reason}
                          </Typography>
                          <Typography variant="body2">
                            <strong>Instead:</strong> {assignment.skipSuggestion.replacement}
                          </Typography>
                          <Typography variant="body2">
                            <strong>Evidence:</strong> {assignment.skipSuggestion.evidence}
                          </Typography>
                        </Alert>
                      )}
                    </Stack>
                  </Box>
                ))}
                <Button startIcon={<AddIcon />} onClick={handleAddAssignment}>
                  Add Assignment
                </Button>
                <Stack direction="row" spacing={1}>
                  <Button variant="outlined" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleAssignmentsNext}
                    disabled={assignments.length === 0}
                  >
                    Generate Plan
                  </Button>
                </Stack>
              </Stack>
            </SectionCard>
          )}

          {/* Step 3: Preview Plan */}
          {step === 3 && (
            <SectionCard title="Draft Weekly Plan">
              <Stack spacing={2}>
                <Typography variant="body2" color="text.secondary">
                  Review and adjust the plan. Drag items between days or toggle them on/off.
                </Typography>
                {weekDays.map((day) => {
                  const dayItems = draftPlan.filter((item) => item.day === day)
                  const totalMin = dayTotalMinutes(draftPlan, day)
                  const overBudget = totalMin > hoursPerDay * 60
                  return (
                    <Box key={day}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          {day}
                        </Typography>
                        <Chip
                          label={`${totalMin}m / ${Math.round(hoursPerDay * 60)}m`}
                          size="small"
                          color={overBudget ? 'error' : 'default'}
                          variant="outlined"
                        />
                      </Stack>
                      <Stack spacing={0.5} sx={{ pl: 1 }}>
                        {dayItems.length === 0 ? (
                          <Typography variant="body2" color="text.secondary">
                            No items
                          </Typography>
                        ) : (
                          dayItems.map((item) => (
                            <Stack
                              key={item.id}
                              direction="row"
                              spacing={1}
                              alignItems="center"
                              sx={{
                                p: 0.75,
                                borderRadius: 1,
                                bgcolor: item.accepted ? 'action.hover' : 'action.disabledBackground',
                                opacity: item.accepted ? 1 : 0.5,
                              }}
                            >
                              <Button
                                size="small"
                                variant={item.accepted ? 'contained' : 'outlined'}
                                color={item.accepted ? 'success' : 'inherit'}
                                onClick={() => handleToggleItem(item.id)}
                                sx={{ minWidth: 32, px: 0.5 }}
                              >
                                {item.accepted ? <CheckCircleIcon fontSize="small" /> : 'Off'}
                              </Button>
                              <Typography variant="body2" sx={{ flex: 1 }}>
                                {item.title}
                              </Typography>
                              {item.isAppBlock && (
                                <Chip label="App" size="small" variant="outlined" />
                              )}
                              {item.skipSuggestion && (
                                <Chip
                                  label={item.skipSuggestion.action}
                                  size="small"
                                  color={item.skipSuggestion.action === 'skip' ? 'error' : 'warning'}
                                />
                              )}
                              <TextField
                                type="number"
                                size="small"
                                value={item.estimatedMinutes}
                                onChange={(e) =>
                                  handleChangeMinutes(item.id, Number(e.target.value) || 5)
                                }
                                sx={{ width: 70 }}
                                inputProps={{ min: 5, step: 5 }}
                              />
                              <Typography variant="caption">min</Typography>
                              <TextField
                                select
                                size="small"
                                value={item.day}
                                onChange={(e) => handleMoveItem(item.id, e.target.value)}
                                sx={{ width: 110 }}
                              >
                                {weekDays.map((d) => (
                                  <MenuItem key={d} value={d}>{d}</MenuItem>
                                ))}
                              </TextField>
                            </Stack>
                          ))
                        )}
                      </Stack>
                    </Box>
                  )
                })}
                <Stack direction="row" spacing={1}>
                  <Button variant="outlined" onClick={() => setStep(2)}>
                    Back
                  </Button>
                  <Button variant="contained" onClick={handleApplyPlan}>
                    Apply Plan
                  </Button>
                </Stack>
              </Stack>
            </SectionCard>
          )}

          {/* Step 4: Applied */}
          {step === 4 && applied && (
            <SectionCard title="Plan Applied">
              <Stack spacing={2}>
                <Alert severity="success">
                  Weekly plan has been applied. Check This Week and Today pages for your
                  generated checklists and day blocks.
                </Alert>
                <Button variant="outlined" onClick={() => { setApplied(false); setStep(0) }}>
                  Start New Plan
                </Button>
              </Stack>
            </SectionCard>
          )}
        </>
      )}

      <Snackbar
        open={snack !== null}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnack(null)}
          severity={snack?.severity ?? 'error'}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snack?.text}
        </Alert>
      </Snackbar>
    </Page>
  )
}

function subjectToDayBlockType(subject: SubjectBucket): DayBlockType {
  switch (subject) {
    case SubjectBucket.Reading:
      return DayBlockType.Reading
    case SubjectBucket.Math:
      return DayBlockType.Math
    case SubjectBucket.LanguageArts:
      return DayBlockType.Reading
    case SubjectBucket.Science:
      return DayBlockType.Project
    case SubjectBucket.SocialStudies:
      return DayBlockType.Together
    default:
      return DayBlockType.Other
  }
}
