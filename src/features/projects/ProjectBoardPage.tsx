import { useCallback, useEffect, useState } from 'react'
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
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { addDoc, doc, getDocs, updateDoc } from 'firebase/firestore'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  childrenCollection,
  projectsCollection,
} from '../../core/firebase/firestore'
import type { Child, Project } from '../../core/types/domain'
import { ProjectPhase } from '../../core/types/enums'
import type { ProjectPhase as ProjectPhaseType } from '../../core/types/enums'

const phases: ProjectPhaseType[] = [
  ProjectPhase.Plan,
  ProjectPhase.Build,
  ProjectPhase.Test,
  ProjectPhase.Improve,
]

const phaseIndex = (phase: ProjectPhaseType): number =>
  phases.indexOf(phase)

export default function ProjectBoardPage() {
  const familyId = useFamilyId()
  const [children, setChildren] = useState<Child[]>([])
  const [selectedChildId, setSelectedChildId] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [isSaving, setIsSaving] = useState(false)

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

  return (
    <Page>
      <Typography variant="h4" component="h1">
        Dad Lab
      </Typography>

      <SectionCard title="Select Child">
        {isLoading ? (
          <Typography color="text.secondary">Loading...</Typography>
        ) : (
          <Tabs
            value={selectedChildId}
            onChange={(_, v) => setSelectedChildId(v)}
          >
            {children.map((child) => (
              <Tab key={child.id} value={child.id} label={child.name} />
            ))}
          </Tabs>
        )}
      </SectionCard>

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
            <Button
              variant="contained"
              onClick={() => setShowNewDialog(true)}
              sx={{ mt: 1 }}
            >
              New Project
            </Button>
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
                />
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedProject(null)}>Close</Button>
              {!selectedProject.completed && (
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
