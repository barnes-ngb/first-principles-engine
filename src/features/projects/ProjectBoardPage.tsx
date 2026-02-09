import { useCallback, useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'
import Stepper from '@mui/material/Stepper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import MenuItem from '@mui/material/MenuItem'
import { addDoc, doc, getDocs, getDoc, setDoc, updateDoc } from 'firebase/firestore'

import ChildSelector from '../../components/ChildSelector'
import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import { useProfile } from '../../core/profile/useProfile'
import {
  childrenCollection,
  dadLabCollection,
  labSessionsCollection,
  projectsCollection,
} from '../../core/firebase/firestore'
import type { Child, DadDailyReport, DadLabWeek, LabSession, LabStageCapture, Project, WeeklyExperiment } from '../../core/types/domain'
import { EngineStage, ProjectPhase } from '../../core/types/enums'
import type { EngineStage as EngineStageType, ProjectPhase as ProjectPhaseType } from '../../core/types/enums'
import { getWeekRange } from '../engine/engine.logic'

const phases: ProjectPhaseType[] = [
  ProjectPhase.Plan,
  ProjectPhase.Build,
  ProjectPhase.Test,
  ProjectPhase.Improve,
]

const phaseIndex = (phase: ProjectPhaseType): number =>
  phases.indexOf(phase)

const labStages: EngineStageType[] = [
  EngineStage.Wonder,
  EngineStage.Build,
  EngineStage.Explain,
  EngineStage.Reflect,
  EngineStage.Share,
]

const stageIcon: Record<EngineStageType, string> = {
  [EngineStage.Wonder]: '\uD83E\uDD14',
  [EngineStage.Build]: '\uD83D\uDD28',
  [EngineStage.Explain]: '\uD83D\uDDE3\uFE0F',
  [EngineStage.Reflect]: '\uD83D\uDCAD',
  [EngineStage.Share]: '\uD83C\uDF1F',
}

const stagePrompt: Record<EngineStageType, string> = {
  [EngineStage.Wonder]: 'What are you wondering about? What question are you exploring?',
  [EngineStage.Build]: 'What did you build, make, or try?',
  [EngineStage.Explain]: 'Explain what happened. What did you discover?',
  [EngineStage.Reflect]: 'What would you change next time? What surprised you?',
  [EngineStage.Share]: 'Share your result. Who would want to see this?',
}

function emptyStages(): LabStageCapture[] {
  return labStages.map((stage) => ({ stage }))
}

const emptyDadReport = (): DadDailyReport => ({
  win: '',
  hardThing: '',
  whatHeTried: '',
  energy: 'medium',
  adjustmentForTomorrow: '',
})

export default function ProjectBoardPage() {
  const familyId = useFamilyId()
  const { canEdit } = useProfile()
  const weekRange = useMemo(() => getWeekRange(new Date()), [])
  const weekKey = weekRange.start
  const today = new Date().toISOString().slice(0, 10)
  const [children, setChildren] = useState<Child[]>([])
  const [selectedChildId, setSelectedChildId] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Lab Session capture state
  const [labActive, setLabActive] = useState(false)
  const [labMission, setLabMission] = useState('')
  const [labConstraints, setLabConstraints] = useState('')
  const [labRoles, setLabRoles] = useState('')
  const [labStageCaptures, setLabStageCaptures] = useState<LabStageCapture[]>(emptyStages())
  const [labStory, setLabStory] = useState('')
  const [labSaved, setLabSaved] = useState(false)

  // Dad Lab: Weekly experiment + daily report
  const [dadLabWeek, setDadLabWeek] = useState<DadLabWeek | null>(null)
  const [experimentForm, setExperimentForm] = useState<Partial<WeeklyExperiment>>({})
  const [todayReport, setTodayReport] = useState<DadDailyReport>(emptyDadReport())
  const [dadLabSaving, setDadLabSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const [childrenSnap, projectsSnap] = await Promise.all([
        getDocs(childrenCollection(familyId)),
        getDocs(projectsCollection(familyId)),
      ])
      if (cancelled) return
      setChildren(
        childrenSnap.docs.map((d) => ({
          ...(d.data() as Child),
          id: d.id,
        })),
      )
      setProjects(
        projectsSnap.docs.map((d) => ({
          ...(d.data() as Project),
          id: d.id,
        })),
      )
      setSelectedChildId((cur) => cur || childrenSnap.docs[0]?.id || '')
      setIsLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [familyId])

  // Load Dad Lab week data for selected child
  useEffect(() => {
    if (!selectedChildId) return
    let cancelled = false
    const docId = `${selectedChildId}_${weekKey}`
    const loadDadLab = async () => {
      const snap = await getDoc(doc(dadLabCollection(familyId), docId))
      if (cancelled) return
      if (snap.exists()) {
        const data = snap.data() as DadLabWeek
        setDadLabWeek({ ...data, id: snap.id })
        setExperimentForm(data.experiment ?? {})
        setTodayReport(data.dailyReports?.[today] ?? emptyDadReport())
      } else {
        setDadLabWeek(null)
        setExperimentForm({})
        setTodayReport(emptyDadReport())
      }
    }
    loadDadLab()
    return () => { cancelled = true }
  }, [familyId, selectedChildId, weekKey, today])

  const saveDadLabWeek = useCallback(
    async (experiment: Partial<WeeklyExperiment>, report: DadDailyReport) => {
      if (!selectedChildId) return
      setDadLabSaving(true)
      const docId = `${selectedChildId}_${weekKey}`
      const existing = dadLabWeek ?? {
        childId: selectedChildId,
        weekKey,
        dailyReports: {},
        createdAt: new Date().toISOString(),
      }
      const updated: DadLabWeek = {
        ...existing,
        childId: selectedChildId,
        weekKey,
        experiment: {
          childId: selectedChildId,
          weekKey,
          hypothesis: experiment.hypothesis ?? '',
          intervention: experiment.intervention ?? '',
          measurement: experiment.measurement ?? '',
          startDate: experiment.startDate,
          endDate: experiment.endDate,
          result: experiment.result,
          updatedAt: new Date().toISOString(),
        },
        dailyReports: {
          ...(existing.dailyReports ?? {}),
          [today]: report,
        },
        updatedAt: new Date().toISOString(),
      }
      await setDoc(doc(dadLabCollection(familyId), docId), updated)
      setDadLabWeek({ ...updated, id: docId })
      setDadLabSaving(false)
    },
    [dadLabWeek, familyId, selectedChildId, today, weekKey],
  )

  const childProjects = projects.filter(
    (p) => p.childId === selectedChildId,
  )
  const activeProjects = childProjects.filter((p) => !p.completed)
  const completedProjects = childProjects.filter((p) => p.completed)

  const handleCreateProject = useCallback(async () => {
    if (!newTitle.trim() || !selectedChildId) return
    setIsSaving(true)

    const project: Omit<Project, 'id'> = {
      childId: selectedChildId,
      title: newTitle.trim(),
      phase: ProjectPhase.Plan,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completed: false,
    }

    const ref = await addDoc(projectsCollection(familyId), project)
    setProjects((prev) => [...prev, { ...project, id: ref.id }])
    setNewTitle('')
    setShowNewDialog(false)
    setIsSaving(false)
  }, [familyId, newTitle, selectedChildId])

  const handleAdvancePhase = useCallback(async () => {
    if (!selectedProject?.id) return
    setIsSaving(true)

    const currentIdx = phaseIndex(selectedProject.phase)
    const nextPhase = currentIdx < phases.length - 1
      ? phases[currentIdx + 1]
      : selectedProject.phase

    await updateDoc(doc(projectsCollection(familyId), selectedProject.id), {
      phase: nextPhase,
      updatedAt: new Date().toISOString(),
    })

    const updated = { ...selectedProject, phase: nextPhase }
    setProjects((prev) =>
      prev.map((p) => (p.id === selectedProject.id ? updated : p)),
    )
    setSelectedProject(updated)
    setIsSaving(false)
  }, [familyId, selectedProject])

  const handleCompleteProject = useCallback(async () => {
    if (!selectedProject?.id) return
    setIsSaving(true)

    await updateDoc(doc(projectsCollection(familyId), selectedProject.id), {
      completed: true,
      updatedAt: new Date().toISOString(),
    })

    const updated = { ...selectedProject, completed: true }
    setProjects((prev) =>
      prev.map((p) => (p.id === selectedProject.id ? updated : p)),
    )
    setSelectedProject(null)
    setIsSaving(false)
  }, [familyId, selectedProject])

  const handleProjectFieldSave = useCallback(
    async (field: keyof Project, value: string) => {
      if (!selectedProject?.id) return
      await updateDoc(doc(projectsCollection(familyId), selectedProject.id), {
        [field]: value,
        updatedAt: new Date().toISOString(),
      })
      const updated = { ...selectedProject, [field]: value }
      setProjects((prev) =>
        prev.map((p) => (p.id === selectedProject.id ? updated : p)),
      )
      setSelectedProject(updated)
    },
    [familyId, selectedProject],
  )

  const handleStartLab = useCallback(() => {
    setLabActive(true)
    setLabMission('')
    setLabConstraints('')
    setLabRoles('')
    setLabStageCaptures(emptyStages())
    setLabStory('')
    setLabSaved(false)
  }, [])

  const handleLabStageNote = useCallback(
    (stageIdx: number, notes: string) => {
      setLabStageCaptures((prev) =>
        prev.map((s, i) => (i === stageIdx ? { ...s, notes } : s)),
      )
    },
    [],
  )

  const handleLabStageComplete = useCallback(
    (stageIdx: number) => {
      setLabStageCaptures((prev) =>
        prev.map((s, i) =>
          i === stageIdx ? { ...s, completedAt: new Date().toISOString() } : s,
        ),
      )
    },
    [],
  )

  const handleSaveLabSession = useCallback(async () => {
    if (!selectedChildId) return
    setIsSaving(true)

    try {
      const session: Omit<LabSession, 'id'> = {
        childId: selectedChildId,
        date: new Date().toISOString().slice(0, 10),
        mission: labMission.trim() || undefined,
        constraints: labConstraints.trim() || undefined,
        roles: labRoles.trim() || undefined,
        stages: labStageCaptures,
        story: labStory.trim() || undefined,
        createdAt: new Date().toISOString(),
      }

      await addDoc(labSessionsCollection(familyId), session)
      setLabSaved(true)
    } catch {
      // Error handled by setting isSaving false
    }
    setIsSaving(false)
  }, [familyId, labConstraints, labMission, labRoles, labStageCaptures, labStory, selectedChildId])

  return (
    <Page>
      <Typography variant="h4" component="h1">
        Dad Lab
      </Typography>

      <ChildSelector
        children={children}
        selectedChildId={selectedChildId}
        onSelect={setSelectedChildId}
        onChildAdded={(child) => {
          setChildren((prev) => [...prev, child])
          setSelectedChildId(child.id)
        }}
        isLoading={isLoading}
      />

      {!isLoading && selectedChildId && (
        <>
          <SectionCard title="Active Projects">
            {activeProjects.length === 0 ? (
              <Typography color="text.secondary">
                No active projects. Start one below.
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                {activeProjects.map((project) => (
                  <Card
                    key={project.id}
                    variant="outlined"
                    sx={{ cursor: 'pointer' }}
                    onClick={() => setSelectedProject(project)}
                  >
                    <CardContent>
                      <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                      >
                        <Stack>
                          <Typography variant="subtitle1">
                            {project.title}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Started{' '}
                            {project.createdAt
                              ? new Date(project.createdAt).toLocaleDateString()
                              : ''}
                          </Typography>
                        </Stack>
                        <Chip
                          label={project.phase}
                          color="primary"
                          size="small"
                        />
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
            {canEdit && (
              <Button
                variant="contained"
                onClick={() => setShowNewDialog(true)}
                sx={{ mt: 1 }}
              >
                New Project
              </Button>
            )}
          </SectionCard>

          {completedProjects.length > 0 && (
            <SectionCard title="Completed Projects">
              <Stack spacing={1}>
                {completedProjects.map((project) => (
                  <Stack
                    key={project.id}
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    onClick={() => setSelectedProject(project)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <Typography variant="body2">{project.title}</Typography>
                    <Chip
                      size="small"
                      label="Complete"
                      color="success"
                      variant="outlined"
                    />
                  </Stack>
                ))}
              </Stack>
            </SectionCard>
          )}

          {/* Lab Session Capture */}
          {!labActive ? (
            <SectionCard title="Lab Session">
              <Stack spacing={1.5} alignItems="flex-start">
                <Typography variant="body2" color="text.secondary">
                  Run a hands-on lab session with 5 stages: Wonder, Build, Explain, Reflect, Share.
                </Typography>
                <Button variant="contained" onClick={handleStartLab}>
                  Start Lab Session
                </Button>
              </Stack>
            </SectionCard>
          ) : labSaved ? (
            <SectionCard title="Lab Session">
              <Alert severity="success" sx={{ mb: 1 }}>
                Lab session saved!
              </Alert>
              <Button variant="outlined" onClick={() => setLabActive(false)}>
                Done
              </Button>
            </SectionCard>
          ) : (
            <SectionCard title="Lab Session">
              <Stack spacing={3}>
                <Stack spacing={2}>
                  <TextField
                    label="Mission"
                    placeholder="What are we exploring today?"
                    value={labMission}
                    onChange={(e) => setLabMission(e.target.value)}
                    fullWidth
                  />
                  <TextField
                    label="Constraints"
                    placeholder="Rules or limits for today"
                    value={labConstraints}
                    onChange={(e) => setLabConstraints(e.target.value)}
                    fullWidth
                  />
                  <TextField
                    label="Roles"
                    placeholder="Who does what?"
                    value={labRoles}
                    onChange={(e) => setLabRoles(e.target.value)}
                    fullWidth
                  />
                </Stack>

                <Typography variant="subtitle2">Stage Capture</Typography>
                <Stack spacing={2}>
                  {labStageCaptures.map((capture, idx) => (
                    <Card
                      key={capture.stage}
                      variant="outlined"
                      sx={{
                        borderColor: capture.completedAt ? 'success.main' : undefined,
                        borderWidth: capture.completedAt ? 2 : 1,
                      }}
                    >
                      <CardContent>
                        <Stack spacing={1.5}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="h6">
                              {stageIcon[capture.stage]}
                            </Typography>
                            <Typography variant="subtitle1">
                              {capture.stage}
                            </Typography>
                            {capture.completedAt && (
                              <Chip label="Done" color="success" size="small" />
                            )}
                          </Stack>
                          <TextField
                            placeholder={stagePrompt[capture.stage]}
                            multiline
                            minRows={2}
                            value={capture.notes ?? ''}
                            onChange={(e) => handleLabStageNote(idx, e.target.value)}
                            fullWidth
                            size="small"
                          />
                          {!capture.completedAt && (
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => handleLabStageComplete(idx)}
                            >
                              Mark Done
                            </Button>
                          )}
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>

                <TextField
                  label="Tell the story"
                  placeholder="In 3 sentences, what happened today in the lab?"
                  multiline
                  minRows={3}
                  value={labStory}
                  onChange={(e) => setLabStory(e.target.value)}
                  fullWidth
                />

                <Stack direction="row" spacing={2}>
                  <Button
                    variant="outlined"
                    onClick={() => setLabActive(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleSaveLabSession}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save Lab Session'}
                  </Button>
                </Stack>
              </Stack>
            </SectionCard>
          )}

          {/* Weekly Experiment */}
          <SectionCard title={`Weekly Experiment (${weekKey})`}>
            <Stack spacing={2}>
              <TextField
                label="Hypothesis"
                placeholder="If I change X, then Y will happen because..."
                value={experimentForm.hypothesis ?? ''}
                onChange={(e) =>
                  setExperimentForm((prev) => ({ ...prev, hypothesis: e.target.value }))
                }
                fullWidth
                multiline
                minRows={2}
                size="small"
                slotProps={{ input: { readOnly: !canEdit } }}
              />
              <TextField
                label="Intervention"
                placeholder="What will you change this week?"
                value={experimentForm.intervention ?? ''}
                onChange={(e) =>
                  setExperimentForm((prev) => ({ ...prev, intervention: e.target.value }))
                }
                fullWidth
                size="small"
                slotProps={{ input: { readOnly: !canEdit } }}
              />
              <TextField
                label="Measurement"
                placeholder="How will you know it worked?"
                value={experimentForm.measurement ?? ''}
                onChange={(e) =>
                  setExperimentForm((prev) => ({ ...prev, measurement: e.target.value }))
                }
                fullWidth
                size="small"
                slotProps={{ input: { readOnly: !canEdit } }}
              />
              <Stack direction="row" spacing={2}>
                <TextField
                  label="Start date"
                  type="date"
                  value={experimentForm.startDate ?? weekKey}
                  onChange={(e) =>
                    setExperimentForm((prev) => ({ ...prev, startDate: e.target.value }))
                  }
                  size="small"
                  slotProps={{ inputLabel: { shrink: true }, input: { readOnly: !canEdit } }}
                />
                <TextField
                  label="End date"
                  type="date"
                  value={experimentForm.endDate ?? ''}
                  onChange={(e) =>
                    setExperimentForm((prev) => ({ ...prev, endDate: e.target.value }))
                  }
                  size="small"
                  slotProps={{ inputLabel: { shrink: true }, input: { readOnly: !canEdit } }}
                />
              </Stack>
              <TextField
                label="Result (fill at end of week)"
                placeholder="What actually happened?"
                value={experimentForm.result ?? ''}
                onChange={(e) =>
                  setExperimentForm((prev) => ({ ...prev, result: e.target.value }))
                }
                fullWidth
                multiline
                minRows={2}
                size="small"
                slotProps={{ input: { readOnly: !canEdit } }}
              />
            </Stack>
          </SectionCard>

          {/* Daily Dad Report */}
          <SectionCard title={`Daily Dad Report (${today})`}>
            <Stack spacing={2}>
              <TextField
                label="Win"
                placeholder="What went well today?"
                value={todayReport.win}
                onChange={(e) =>
                  setTodayReport((prev) => ({ ...prev, win: e.target.value }))
                }
                fullWidth
                size="small"
                slotProps={{ input: { readOnly: !canEdit } }}
              />
              <TextField
                label="Hard thing"
                placeholder="What was hard today?"
                value={todayReport.hardThing}
                onChange={(e) =>
                  setTodayReport((prev) => ({ ...prev, hardThing: e.target.value }))
                }
                fullWidth
                size="small"
                slotProps={{ input: { readOnly: !canEdit } }}
              />
              <TextField
                label="What he tried"
                placeholder="What did he attempt or explore?"
                value={todayReport.whatHeTried}
                onChange={(e) =>
                  setTodayReport((prev) => ({ ...prev, whatHeTried: e.target.value }))
                }
                fullWidth
                size="small"
                slotProps={{ input: { readOnly: !canEdit } }}
              />
              <TextField
                label="Energy level"
                select
                value={todayReport.energy}
                onChange={(e) =>
                  setTodayReport((prev) => ({
                    ...prev,
                    energy: e.target.value as DadDailyReport['energy'],
                  }))
                }
                size="small"
                sx={{ maxWidth: 200 }}
                slotProps={{ input: { readOnly: !canEdit } }}
              >
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="low">Low</MenuItem>
              </TextField>
              <TextField
                label="Adjustment for tomorrow"
                placeholder="What will you try differently tomorrow?"
                value={todayReport.adjustmentForTomorrow}
                onChange={(e) =>
                  setTodayReport((prev) => ({ ...prev, adjustmentForTomorrow: e.target.value }))
                }
                fullWidth
                multiline
                minRows={2}
                size="small"
                slotProps={{ input: { readOnly: !canEdit } }}
              />
              {canEdit && (
                <Button
                  variant="contained"
                  onClick={() => saveDadLabWeek(experimentForm, todayReport)}
                  disabled={dadLabSaving}
                >
                  {dadLabSaving ? 'Saving...' : 'Save Experiment & Report'}
                </Button>
              )}
            </Stack>
          </SectionCard>
        </>
      )}

      {/* New Project Dialog */}
      <Dialog
        open={showNewDialog}
        onClose={() => setShowNewDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>New Dad Lab Project</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Project title"
            fullWidth
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowNewDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateProject}
            disabled={!newTitle.trim() || isSaving}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Project Detail Dialog */}
      <Dialog
        open={Boolean(selectedProject)}
        onClose={() => setSelectedProject(null)}
        maxWidth="md"
        fullWidth
      >
        {selectedProject && (
          <>
            <DialogTitle>{selectedProject.title}</DialogTitle>
            <DialogContent>
              <Stack spacing={3}>
                <Stepper
                  activeStep={phaseIndex(selectedProject.phase)}
                  alternativeLabel
                >
                  {phases.map((phase) => (
                    <Step key={phase}>
                      <StepLabel>{phase}</StepLabel>
                    </Step>
                  ))}
                </Stepper>

                <TextField
                  label="Plan notes"
                  multiline
                  minRows={2}
                  value={selectedProject.planNotes ?? ''}
                  onChange={(e) =>
                    setSelectedProject((prev) =>
                      prev ? { ...prev, planNotes: e.target.value } : null,
                    )
                  }
                  onBlur={(e) =>
                    handleProjectFieldSave('planNotes', e.target.value)
                  }
                  fullWidth
                  slotProps={{ input: { readOnly: !canEdit } }}
                />

                <TextField
                  label="Build notes"
                  multiline
                  minRows={2}
                  value={selectedProject.buildNotes ?? ''}
                  onChange={(e) =>
                    setSelectedProject((prev) =>
                      prev ? { ...prev, buildNotes: e.target.value } : null,
                    )
                  }
                  onBlur={(e) =>
                    handleProjectFieldSave('buildNotes', e.target.value)
                  }
                  fullWidth
                  slotProps={{ input: { readOnly: !canEdit } }}
                />

                <TextField
                  label="Test notes"
                  multiline
                  minRows={2}
                  value={selectedProject.testNotes ?? ''}
                  onChange={(e) =>
                    setSelectedProject((prev) =>
                      prev ? { ...prev, testNotes: e.target.value } : null,
                    )
                  }
                  onBlur={(e) =>
                    handleProjectFieldSave('testNotes', e.target.value)
                  }
                  fullWidth
                  slotProps={{ input: { readOnly: !canEdit } }}
                />

                <TextField
                  label="Improve notes"
                  multiline
                  minRows={2}
                  value={selectedProject.improveNotes ?? ''}
                  onChange={(e) =>
                    setSelectedProject((prev) =>
                      prev ? { ...prev, improveNotes: e.target.value } : null,
                    )
                  }
                  onBlur={(e) =>
                    handleProjectFieldSave('improveNotes', e.target.value)
                  }
                  fullWidth
                  slotProps={{ input: { readOnly: !canEdit } }}
                />

                <TextField
                  label="What changed?"
                  multiline
                  minRows={2}
                  placeholder="What did you change between versions?"
                  value={selectedProject.whatChanged ?? ''}
                  onChange={(e) =>
                    setSelectedProject((prev) =>
                      prev ? { ...prev, whatChanged: e.target.value } : null,
                    )
                  }
                  onBlur={(e) =>
                    handleProjectFieldSave('whatChanged', e.target.value)
                  }
                  fullWidth
                  slotProps={{ input: { readOnly: !canEdit } }}
                />

                <TextField
                  label="Teach-back"
                  multiline
                  minRows={2}
                  placeholder="Explain the project to someone else. What would they need to know?"
                  value={selectedProject.teachBack ?? ''}
                  onChange={(e) =>
                    setSelectedProject((prev) =>
                      prev ? { ...prev, teachBack: e.target.value } : null,
                    )
                  }
                  onBlur={(e) =>
                    handleProjectFieldSave('teachBack', e.target.value)
                  }
                  fullWidth
                  slotProps={{ input: { readOnly: !canEdit } }}
                />
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedProject(null)}>Close</Button>
              {canEdit && !selectedProject.completed && (
                <>
                  {phaseIndex(selectedProject.phase) < phases.length - 1 && (
                    <Button
                      variant="outlined"
                      onClick={handleAdvancePhase}
                      disabled={isSaving}
                    >
                      Next Phase: {phases[phaseIndex(selectedProject.phase) + 1]}
                    </Button>
                  )}
                  <Button
                    variant="contained"
                    color="success"
                    onClick={handleCompleteProject}
                    disabled={isSaving}
                  >
                    Mark Complete
                  </Button>
                </>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </Page>
  )
}
