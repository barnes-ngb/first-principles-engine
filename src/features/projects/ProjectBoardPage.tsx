import { useCallback, useEffect, useState } from 'react'
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
import { addDoc, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore'

import ChildSelector from '../../components/ChildSelector'
import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useProfile } from '../../core/profile/useProfile'
import {
  labSessionDocId,
  labSessionsCollection,
  projectsCollection,
} from '../../core/firebase/firestore'
import type { LabSession, LabStageCapture, Project } from '../../core/types/domain'
import { EngineStage, LabSessionStatus, ProjectPhase } from '../../core/types/enums'
import type { EngineStage as EngineStageType, ProjectPhase as ProjectPhaseType } from '../../core/types/enums'

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

export default function ProjectBoardPage() {
  const familyId = useFamilyId()
  const { canEdit } = useProfile()
  const {
    children,
    activeChildId: selectedChildId,
    setActiveChildId: setSelectedChildId,
    isLoading: childrenLoading,
    addChild,
  } = useActiveChild()
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
  const [labError, setLabError] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const projectsSnap = await getDocs(projectsCollection(familyId))
      if (cancelled) return
      setProjects(
        projectsSnap.docs.map((d) => ({
          ...(d.data() as Project),
          id: d.id,
        })),
      )
      setIsLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [familyId])


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
    setLabError(false)
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
    setLabError(false)

    try {
      const now = new Date().toISOString()
      const weekKey = now.slice(0, 10)
      const docId = labSessionDocId(weekKey, selectedChildId)
      const docRef = doc(labSessionsCollection(familyId), docId)

      // Build stageNotes from the captures
      const stageNotes: Partial<Record<EngineStageType, string>> = {}
      for (const capture of labStageCaptures) {
        if (capture.notes) {
          stageNotes[capture.stage] = capture.notes
        }
      }

      // Determine current stage (last completed + 1, or first)
      const lastCompleted = [...labStageCaptures].reverse().find((c) => c.completedAt)
      const lastIdx = lastCompleted ? labStages.indexOf(lastCompleted.stage) : -1
      const currentStage = lastIdx < labStages.length - 1
        ? labStages[lastIdx + 1]
        : labStages[labStages.length - 1]

      const allDone = labStageCaptures.every((c) => c.completedAt)

      const session: Omit<LabSession, 'id'> = {
        childId: selectedChildId,
        weekKey,
        status: allDone ? LabSessionStatus.Complete : LabSessionStatus.InProgress,
        stage: currentStage,
        mission: labMission.trim() || undefined,
        constraints: labConstraints.trim() || undefined,
        roles: labRoles.trim() || undefined,
        stageNotes: Object.keys(stageNotes).length > 0 ? stageNotes : undefined,
        createdAt: now,
        updatedAt: now,
      }

      await setDoc(docRef, session)
      setLabSaved(true)
    } catch {
      setLabError(true)
    }
    setIsSaving(false)
  }, [familyId, labConstraints, labMission, labRoles, labStageCaptures, selectedChildId])

  return (
    <Page>
      <Typography variant="h4" component="h1">
        Dad Lab
      </Typography>

      <ChildSelector
        children={children}
        selectedChildId={selectedChildId}
        onSelect={setSelectedChildId}
        onChildAdded={addChild}
        isLoading={childrenLoading}
      />

      {!childrenLoading && !isLoading && selectedChildId && (
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

                {labError && (
                  <Alert severity="error">
                    Failed to save lab session. Please try again.
                  </Alert>
                )}

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
