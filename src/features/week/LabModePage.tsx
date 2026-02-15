import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'
import Stepper from '@mui/material/Stepper'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import BrokenImageIcon from '@mui/icons-material/BrokenImage'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import {
  addDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { getDownloadURL, ref } from 'firebase/storage'

import AudioRecorder from '../../components/AudioRecorder'
import ChildSelector from '../../components/ChildSelector'
import ContextBar from '../../components/ContextBar'
import HelpStrip from '../../components/HelpStrip'
import Page from '../../components/Page'
import PhotoCapture from '../../components/PhotoCapture'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  artifactsCollection,
  labSessionDocId,
  labSessionsCollection,
  ladderProgressCollection,
  ladderProgressDocId,
  projectsCollection,
} from '../../core/firebase/firestore'
import { storage } from '../../core/firebase/storage'
import {
  generateFilename,
  uploadArtifactFile,
} from '../../core/firebase/upload'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useProfile } from '../../core/profile/useProfile'
import type { Artifact, LadderCardDefinition, LabSession, Project } from '../../core/types/domain'
import {
  EngineStage,
  EvidenceType,
  LabSessionStatus,
  LearningLocation,
  ProjectPhase,
  SessionSymbol,
  SubjectBucket,
  SupportLevel,
} from '../../core/types/enums'
import type { EngineStage as EngineStageType, ProjectPhase as ProjectPhaseType } from '../../core/types/enums'
import { formatDateShort, formatWeekShort } from '../../core/utils/dateKey'
import { parseDateYmd } from '../../lib/format'
import { getWeekRange } from '../engine/engine.logic'
import {
  applySession,
  createInitialProgress,
} from '../ladders/ladderProgress'
import { getLaddersForChild } from '../ladders/laddersCatalog'
import { LAB_STAGES, labStageIndex } from './labSession.logic'
import { useLabSession } from './useLabSession'

// ── Constants ──────────────────────────────────────────────────

type ArtifactFormState = {
  childId: string
  evidenceType: EvidenceType
  engineStage: EngineStage
  subjectBucket: SubjectBucket
  location: LearningLocation
  domain: string
  content: string
  ladderKey: string
  rungId: string
}

const defaultFormState = (
  engineStage: EngineStage,
  childId = '',
): ArtifactFormState => ({
  childId,
  evidenceType: EvidenceType.Note,
  engineStage,
  subjectBucket: SubjectBucket.Science,
  location: LearningLocation.Home,
  domain: '',
  content: '',
  ladderKey: '',
  rungId: '',
})

const statusLabel: Record<string, string> = {
  [LabSessionStatus.NotStarted]: 'Not Started',
  [LabSessionStatus.InProgress]: 'In Progress',
  [LabSessionStatus.Complete]: 'Complete',
}

const statusColor: Record<string, 'default' | 'warning' | 'success'> = {
  [LabSessionStatus.NotStarted]: 'default',
  [LabSessionStatus.InProgress]: 'warning',
  [LabSessionStatus.Complete]: 'success',
}

const phases: ProjectPhaseType[] = [
  ProjectPhase.Plan,
  ProjectPhase.Build,
  ProjectPhase.Test,
  ProjectPhase.Improve,
]

const phaseIndex = (phase: ProjectPhaseType): number => phases.indexOf(phase)

const stagePrompt: Record<EngineStageType, string> = {
  [EngineStage.Wonder]: 'What are you wondering about?',
  [EngineStage.Build]: 'What did you build or try?',
  [EngineStage.Explain]: 'What did you discover?',
  [EngineStage.Reflect]: 'What would you change?',
  [EngineStage.Share]: 'Who should see this?',
}

// ── Helpers ────────────────────────────────────────────────────

/** Resolve a photo artifact URL defensively. */
async function resolvePhotoUrl(artifact: Artifact, familyId: string): Promise<string | null> {
  if (artifact.uri) return artifact.uri
  if (artifact.storagePath) {
    try {
      return await getDownloadURL(ref(storage, artifact.storagePath))
    } catch {
      return null
    }
  }
  if (artifact.id) {
    try {
      const guessPath = `families/${familyId}/artifacts/${artifact.id}`
      const dirRef = ref(storage, guessPath)
      return await getDownloadURL(dirRef)
    } catch {
      return null
    }
  }
  return null
}

/** Calculate completion percentage for a lab session. */
function sessionCompletion(session: LabSession): number {
  if (session.status === LabSessionStatus.Complete) return 100
  const done = session.stageDone ?? {}
  const count = LAB_STAGES.filter((s) => done[s]).length
  return Math.round((count / LAB_STAGES.length) * 100)
}

// ── Component ──────────────────────────────────────────────────

export default function LabModePage() {
  const [searchParams] = useSearchParams()
  const weekParam = searchParams.get('week')
  const weekRange = useMemo(() => {
    if (weekParam && parseDateYmd(weekParam)) return getWeekRange(parseDateYmd(weekParam)!)
    return getWeekRange(new Date())
  }, [weekParam])
  const weekKey = weekRange.start

  const familyId = useFamilyId()
  const { canEdit } = useProfile()
  const {
    children,
    activeChildId: selectedChildId,
    setActiveChildId,
    activeChild,
    isLoading: childrenLoading,
    addChild,
  } = useActiveChild()

  // ── Project state ──────────────────────────────────────────
  const [projects, setProjects] = useState<Project[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false)
  const [newProjectTitle, setNewProjectTitle] = useState('')
  const [projectSaving, setProjectSaving] = useState(false)
  const [showProjectNotesDialog, setShowProjectNotesDialog] = useState(false)

  // Load projects for the selected child
  useEffect(() => {
    if (!familyId || !selectedChildId) {
      setProjects([])
      setProjectsLoading(false)
      return
    }
    let cancelled = false
    setProjectsLoading(true)
    const load = async () => {
      try {
        const snap = await getDocs(projectsCollection(familyId))
        if (cancelled) return
        const all = snap.docs.map((d) => ({
          ...(d.data() as Project),
          id: d.id,
        }))
        setProjects(all)
      } catch (err) {
        console.error('Failed to load projects', err)
        if (!cancelled) setProjects([])
      }
      if (!cancelled) setProjectsLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [familyId, selectedChildId])

  const childProjects = useMemo(
    () => projects.filter((p) => p.childId === selectedChildId && !p.completed),
    [projects, selectedChildId],
  )

  // Auto-select first active project when child or projects change
  useEffect(() => {
    if (childProjects.length > 0) {
      setSelectedProjectId((prev) => {
        if (prev && childProjects.some((p) => p.id === prev)) return prev
        return childProjects[0].id!
      })
    } else {
      setSelectedProjectId(null)
    }
  }, [childProjects])

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  // ── Lab session hook — scoped to child + week + project ────
  const { labSession, isLoading: labLoading, startOrContinue, updateSession } =
    useLabSession(selectedChildId, weekKey, selectedProjectId ?? undefined)

  const labSectionRef = useRef<HTMLDivElement>(null)

  // Ladder definitions for artifact → ladder linking
  const childLadders: LadderCardDefinition[] = useMemo(
    () => activeChild ? getLaddersForChild(activeChild.name) ?? [] : [],
    [activeChild],
  )

  // ── Session artifacts (all types, grouped by stage) ────────
  const sessionDocId = labSession?.id ?? (selectedChildId && weekKey && selectedProjectId
    ? labSessionDocId(weekKey, selectedChildId, selectedProjectId)
    : null)

  const [sessionArtifacts, setSessionArtifacts] = useState<Artifact[]>([])
  const [artifactUrls, setArtifactUrls] = useState<Record<string, string | null>>({})

  useEffect(() => {
    if (!familyId || !selectedChildId || !sessionDocId) {
      setSessionArtifacts([])
      setArtifactUrls({})
      return
    }

    let cancelled = false
    const load = async () => {
      try {
        const q = query(
          artifactsCollection(familyId),
          where('childId', '==', selectedChildId),
          where('labSessionId', '==', sessionDocId),
          orderBy('createdAt', 'desc'),
        )
        const snap = await getDocs(q)
        if (cancelled) return

        const arts = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
        setSessionArtifacts(arts)

        // Resolve photo URLs
        const urls: Record<string, string | null> = {}
        await Promise.all(
          arts
            .filter((a) => a.type === EvidenceType.Photo)
            .map(async (a) => {
              urls[a.id!] = await resolvePhotoUrl(a, familyId)
            }),
        )
        if (!cancelled) setArtifactUrls(urls)
      } catch (err) {
        console.error('Failed to load session artifacts', err)
        if (!cancelled) {
          setSessionArtifacts([])
          setArtifactUrls({})
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [familyId, selectedChildId, sessionDocId])

  // Group artifacts by stage
  const artifactsByStage = useMemo(() => {
    const map: Partial<Record<EngineStageType, Artifact[]>> = {}
    for (const art of sessionArtifacts) {
      const stage = art.labStage
      if (!stage) continue
      if (!map[stage]) map[stage] = []
      map[stage]!.push(art)
    }
    return map
  }, [sessionArtifacts])

  // ── Recent sessions for selected project ───────────────────
  const [recentSessions, setRecentSessions] = useState<LabSession[]>([])

  useEffect(() => {
    if (!familyId || !selectedChildId || !selectedProjectId) {
      setRecentSessions([])
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const q = query(
          labSessionsCollection(familyId),
          where('childId', '==', selectedChildId),
          where('projectId', '==', selectedProjectId),
          orderBy('weekKey', 'desc'),
          limit(6),
        )
        const snap = await getDocs(q)
        if (cancelled) return
        setRecentSessions(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
      } catch (err) {
        console.error('Failed to load recent sessions', err)
        if (!cancelled) setRecentSessions([])
      }
    }
    load()
    return () => { cancelled = true }
  }, [familyId, selectedChildId, selectedProjectId, labSession])

  // ── Artifact capture state ─────────────────────────────────
  const [captureStage, setCaptureStage] = useState<EngineStage | null>(null)
  const [mediaUploading, setMediaUploading] = useState(false)
  const [artifactForm, setArtifactForm] = useState<ArtifactFormState>(() =>
    defaultFormState(EngineStage.Wonder, selectedChildId),
  )

  // Photo viewer dialog
  const [viewPhotoUrl, setViewPhotoUrl] = useState<string | null>(null)

  // Inline photo capture per stage (no form overlay, just camera inline)
  const [inlinePhotoStage, setInlinePhotoStage] = useState<EngineStage | null>(null)

  const handleStageSelect = useCallback((stage: EngineStage) => {
    setCaptureStage(stage)
    setArtifactForm((prev) => defaultFormState(stage, prev.childId))
    setInlinePhotoStage(null)
  }, [])

  const handleFormChange = useCallback(
    (
      field: keyof ArtifactFormState,
      value: ArtifactFormState[keyof ArtifactFormState],
    ) => {
      setArtifactForm((prev) => ({ ...prev, [field]: value }))
    },
    [],
  )

  const handleChildSelect = useCallback(
    (childId: string) => {
      setActiveChildId(childId)
      setArtifactForm((prev) => ({ ...prev, childId }))
      setCaptureStage(null)
      setInlinePhotoStage(null)
    },
    [setActiveChildId],
  )

  const buildBase = useCallback(
    (title: string, evidenceType: EvidenceType, stage: EngineStage) => {
      const createdAt = new Date().toISOString()
      const dayLogId = createdAt.slice(0, 10)
      return {
        title,
        type: evidenceType,
        createdAt,
        childId: artifactForm.childId || selectedChildId,
        dayLogId,
        tags: {
          engineStage: stage,
          domain: artifactForm.domain,
          subjectBucket: artifactForm.subjectBucket,
          location: artifactForm.location,
          ...(artifactForm.ladderKey && artifactForm.rungId ? {
            ladderRef: { ladderId: artifactForm.ladderKey, rungId: artifactForm.rungId },
          } : {}),
        },
        notes: '',
        // Always link to session + project + stage + week
        ...(sessionDocId ? {
          labSessionId: sessionDocId,
          labStage: stage,
        } : {}),
        ...(selectedProjectId ? { projectId: selectedProjectId } : {}),
        weekKey,
      }
    },
    [artifactForm, selectedChildId, sessionDocId, selectedProjectId, weekKey],
  )

  /** After saving an artifact with a ladder selection, also log a ladder session. */
  const logLadderSessionForArtifact = useCallback(
    async (artifactId: string) => {
      if (!artifactForm.ladderKey || !artifactForm.rungId || !selectedChildId || !familyId) return
      const ladder = childLadders.find((l) => l.ladderKey === artifactForm.ladderKey)
      if (!ladder) return

      const progressDocIdStr = ladderProgressDocId(selectedChildId, artifactForm.ladderKey)
      const progressRef = doc(ladderProgressCollection(familyId), progressDocIdStr)
      let progress = createInitialProgress(selectedChildId, ladder)
      try {
        const snap = await getDocs(query(
          ladderProgressCollection(familyId),
          where('childId', '==', selectedChildId),
        ))
        for (const d of snap.docs) {
          const data = d.data()
          if (data.ladderKey === artifactForm.ladderKey) {
            progress = data
            break
          }
        }
      } catch { /* use initial */ }

      const dateKey = new Date().toISOString().slice(0, 10)
      const result = applySession(progress, {
        dateKey,
        result: SessionSymbol.Pass,
        supportLevel: progress.lastSupportLevel ?? SupportLevel.None,
        note: `Artifact: ${artifactId}`,
      }, ladder)

      await setDoc(progressRef, result.progress)
    },
    [artifactForm.ladderKey, artifactForm.rungId, selectedChildId, familyId, childLadders],
  )

  const handleSave = useCallback(async () => {
    if (!captureStage) return
    const content = artifactForm.content.trim()
    const domain = artifactForm.domain.trim()
    const title =
      content.slice(0, 60) ||
      domain ||
      `${captureStage} Lab Note`

    const docRef = await addDoc(artifactsCollection(familyId), {
      ...buildBase(title, EvidenceType.Note, captureStage),
      content: artifactForm.content,
    })

    await logLadderSessionForArtifact(docRef.id)

    // Update local artifacts list
    const newArt: Artifact = {
      ...buildBase(title, EvidenceType.Note, captureStage),
      content: artifactForm.content,
      id: docRef.id,
    }
    setSessionArtifacts((prev) => [newArt, ...prev])

    setCaptureStage(null)
    setArtifactForm((prev) => defaultFormState(EngineStage.Wonder, prev.childId))
  }, [artifactForm, buildBase, captureStage, familyId, logLadderSessionForArtifact])

  const handlePhotoCapture = useCallback(
    async (file: File, stage: EngineStage) => {
      setMediaUploading(true)
      try {
        const domain = artifactForm.domain.trim()
        const title = domain || `${stage} Lab Photo`
        const artifact = buildBase(title, EvidenceType.Photo, stage)
        const docRef = await addDoc(artifactsCollection(familyId), artifact)
        const ext = file.name.split('.').pop() ?? 'jpg'
        const filename = generateFilename(ext)
        const { downloadUrl, storagePath } = await uploadArtifactFile(familyId, docRef.id, file, filename)
        await updateDoc(doc(artifactsCollection(familyId), docRef.id), {
          uri: downloadUrl,
          storagePath,
        })
        await logLadderSessionForArtifact(docRef.id)

        // Update local state
        const newArt: Artifact = { ...artifact, id: docRef.id, uri: downloadUrl, storagePath }
        setSessionArtifacts((prev) => [newArt, ...prev])
        setArtifactUrls((prev) => ({ ...prev, [docRef.id]: downloadUrl }))

        setCaptureStage(null)
        setInlinePhotoStage(null)
        setArtifactForm((prev) => defaultFormState(EngineStage.Wonder, prev.childId))
      } finally {
        setMediaUploading(false)
      }
    },
    [artifactForm, buildBase, familyId, logLadderSessionForArtifact],
  )

  const handleAudioCapture = useCallback(
    async (blob: Blob) => {
      if (!captureStage) return
      setMediaUploading(true)
      try {
        const domain = artifactForm.domain.trim()
        const title = domain || `${captureStage} Lab Audio`
        const artifact = buildBase(title, EvidenceType.Audio, captureStage)
        const docRef = await addDoc(artifactsCollection(familyId), artifact)
        const filename = generateFilename('webm')
        const { downloadUrl, storagePath } = await uploadArtifactFile(familyId, docRef.id, blob, filename)
        await updateDoc(doc(artifactsCollection(familyId), docRef.id), {
          uri: downloadUrl,
          storagePath,
        })
        await logLadderSessionForArtifact(docRef.id)

        const newArt: Artifact = { ...artifact, id: docRef.id, uri: downloadUrl, storagePath }
        setSessionArtifacts((prev) => [newArt, ...prev])

        setCaptureStage(null)
        setArtifactForm((prev) => defaultFormState(EngineStage.Wonder, prev.childId))
      } finally {
        setMediaUploading(false)
      }
    },
    [artifactForm, buildBase, captureStage, familyId, logLadderSessionForArtifact],
  )

  const handleStartOrContinue = useCallback(async () => {
    await startOrContinue()
    setTimeout(() => {
      labSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }, [startOrContinue])

  const handleStageAdvance = useCallback(
    async (stage: EngineStage) => {
      await updateSession({ stage })
    },
    [updateSession],
  )

  const handleStageNotes = useCallback(
    async (stage: EngineStage, notes: string) => {
      const current = labSession?.stageNotes ?? {}
      await updateSession({ stageNotes: { ...current, [stage]: notes } })
    },
    [updateSession, labSession],
  )

  const handleStageDone = useCallback(
    async (stage: EngineStage, done: boolean) => {
      const current = labSession?.stageDone ?? {}
      await updateSession({ stageDone: { ...current, [stage]: done } })
    },
    [updateSession, labSession],
  )

  const handleMarkComplete = useCallback(async () => {
    await updateSession({ status: LabSessionStatus.Complete })
  }, [updateSession])

  const handleMissionSave = useCallback(
    async (mission: string) => { await updateSession({ mission }) },
    [updateSession],
  )

  const handleConstraintsSave = useCallback(
    async (constraints: string) => { await updateSession({ constraints }) },
    [updateSession],
  )

  const handleRolesSave = useCallback(
    async (roles: string) => { await updateSession({ roles }) },
    [updateSession],
  )

  // ── Project management ─────────────────────────────────────
  const handleCreateProject = useCallback(async () => {
    if (!newProjectTitle.trim() || !selectedChildId) return
    setProjectSaving(true)
    const project: Omit<Project, 'id'> = {
      childId: selectedChildId,
      title: newProjectTitle.trim(),
      phase: ProjectPhase.Plan,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completed: false,
    }
    const docRef = await addDoc(projectsCollection(familyId), project)
    const created = { ...project, id: docRef.id }
    setProjects((prev) => [...prev, created])
    setSelectedProjectId(docRef.id)
    setNewProjectTitle('')
    setShowNewProjectDialog(false)
    setProjectSaving(false)
  }, [familyId, newProjectTitle, selectedChildId])

  const handleProjectFieldSave = useCallback(
    async (field: keyof Project, value: string) => {
      if (!selectedProject?.id) return
      await updateDoc(doc(projectsCollection(familyId), selectedProject.id), {
        [field]: value,
        updatedAt: new Date().toISOString(),
      })
      setProjects((prev) =>
        prev.map((p) => (p.id === selectedProject.id ? { ...p, [field]: value } : p)),
      )
    },
    [familyId, selectedProject],
  )

  const handleAdvancePhase = useCallback(async () => {
    if (!selectedProject?.id) return
    const currentIdx = phaseIndex(selectedProject.phase)
    const nextPhase = currentIdx < phases.length - 1
      ? phases[currentIdx + 1]
      : selectedProject.phase
    await updateDoc(doc(projectsCollection(familyId), selectedProject.id), {
      phase: nextPhase,
      updatedAt: new Date().toISOString(),
    })
    setProjects((prev) =>
      prev.map((p) => (p.id === selectedProject.id ? { ...p, phase: nextPhase } : p)),
    )
  }, [familyId, selectedProject])

  // ── Render flags ───────────────────────────────────────────
  const isReady = !childrenLoading && !projectsLoading && selectedChildId
  const hasProjects = childProjects.length > 0

  return (
    <Page>
      <ContextBar
        page="dadLab"
        activeChild={activeChild}
        weekStart={weekRange.start}
      />
      <HelpStrip
        pageKey="dadLab"
        text="Projects are ongoing. Each week you run a Lab Session inside a project. Photos attach to a session stage."
      />
      <Stack spacing={2}>
        <ChildSelector
          children={children}
          selectedChildId={selectedChildId}
          onSelect={handleChildSelect}
          onChildAdded={addChild}
          isLoading={childrenLoading}
        />

        {isReady && !hasProjects && (
          /* Empty state — no active projects */
          <SectionCard title="Dad Lab">
            <Stack spacing={2} alignItems="flex-start">
              <Typography color="text.secondary">
                No active projects yet. Create a project to get started.
              </Typography>
              {canEdit && (
                <Button
                  variant="contained"
                  onClick={() => setShowNewProjectDialog(true)}
                >
                  New Project
                </Button>
              )}
            </Stack>
          </SectionCard>
        )}

        {isReady && hasProjects && (
          <div key={`${selectedChildId}_${weekKey}_${selectedProjectId}`}>
            {/* ── Project selector + actions ───────────────── */}
            <SectionCard title="Current Project">
              <Stack spacing={1.5}>
                <TextField
                  select
                  label="Project"
                  value={selectedProjectId ?? ''}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  fullWidth
                  size="small"
                >
                  {childProjects.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.title}
                    </MenuItem>
                  ))}
                </TextField>

                {selectedProject && (
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Chip
                      label={selectedProject.phase}
                      color="primary"
                      size="small"
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => setShowProjectNotesDialog(true)}
                    >
                      Open Project Notes
                    </Button>
                    {canEdit && (
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => setShowNewProjectDialog(true)}
                      >
                        New Project
                      </Button>
                    )}
                  </Stack>
                )}
              </Stack>
            </SectionCard>

            {/* ── This Week's Session ──────────────────────── */}
            {selectedProject && (
              <div style={{ marginTop: 16 }}>
                <SectionCard title={`This Week's Session`}>
                  {labLoading ? (
                    <Typography color="text.secondary">Loading...</Typography>
                  ) : labSession ? (
                    <Stack spacing={1.5}>
                      <Card variant="outlined">
                        <CardContent>
                          <Stack spacing={1}>
                            <Stack
                              direction="row"
                              alignItems="center"
                              justifyContent="space-between"
                              flexWrap="wrap"
                              spacing={1}
                            >
                              <Typography variant="subtitle1">
                                {selectedProject.title} — Week of {formatWeekShort(weekKey)}
                              </Typography>
                              <Stack direction="row" spacing={0.5}>
                                <Chip
                                  label={statusLabel[labSession.status] ?? labSession.status}
                                  color={statusColor[labSession.status] ?? 'default'}
                                  size="small"
                                />
                                <Chip
                                  label={labSession.stage}
                                  variant="outlined"
                                  size="small"
                                />
                              </Stack>
                            </Stack>

                            {labSession.createdAt && (
                              <Typography variant="caption" color="text.secondary">
                                Started {formatDateShort(labSession.createdAt.slice(0, 10))}
                              </Typography>
                            )}

                            <Typography variant="body2" color="text.secondary">
                              {labSession.mission || '(no mission yet)'}
                            </Typography>
                          </Stack>
                        </CardContent>
                      </Card>

                      <Stack direction="row" spacing={1}>
                        <Button variant="contained" onClick={handleStartOrContinue}>
                          Continue Lab
                        </Button>
                        {labSession.status === LabSessionStatus.InProgress && (
                          <Button
                            variant="outlined"
                            color="success"
                            onClick={handleMarkComplete}
                          >
                            Complete
                          </Button>
                        )}
                      </Stack>
                    </Stack>
                  ) : (
                    <Stack spacing={1.5} alignItems="flex-start">
                      <Typography variant="subtitle2">
                        Week of {formatWeekShort(weekKey)}
                      </Typography>
                      <Typography color="text.secondary">
                        No session yet this week.
                      </Typography>
                      <Button variant="contained" size="large" onClick={handleStartOrContinue}>
                        Start Session for {selectedProject.title} (This Week)
                      </Button>
                    </Stack>
                  )}
                </SectionCard>
              </div>
            )}

            {/* ── Lab Session Detail — stage cards ────────── */}
            {labSession && (
              <div ref={labSectionRef} style={{ marginTop: 16 }}>
                <SectionCard title="Lab Session">
                  <Stack spacing={2}>
                    <TextField
                      label="Mission"
                      placeholder="What are we exploring this week?"
                      value={labSession.mission ?? ''}
                      onChange={(e) => handleMissionSave(e.target.value)}
                      fullWidth
                      size="small"
                    />
                    <TextField
                      label="Constraints"
                      placeholder="Any rules or limits for this session?"
                      value={labSession.constraints ?? ''}
                      onChange={(e) => handleConstraintsSave(e.target.value)}
                      fullWidth
                      size="small"
                    />
                    <TextField
                      label="Roles"
                      placeholder="Who does what?"
                      value={labSession.roles ?? ''}
                      onChange={(e) => handleRolesSave(e.target.value)}
                      fullWidth
                      size="small"
                    />

                    <Typography variant="subtitle2">Stages</Typography>
                    <Stack spacing={1.5}>
                      {LAB_STAGES.map((stage, idx) => {
                        const currentIdx = labStageIndex(labSession.stage)
                        const isActive = idx === currentIdx
                        const isDone = labSession.stageDone?.[stage] ?? false
                        const notes = labSession.stageNotes?.[stage] ?? ''
                        const stageArts = artifactsByStage[stage] ?? []
                        const stagePhotos = stageArts.filter((a) => a.type === EvidenceType.Photo)

                        return (
                          <Card
                            key={stage}
                            variant="outlined"
                            sx={{
                              borderColor: isDone
                                ? 'success.main'
                                : isActive
                                  ? 'primary.main'
                                  : undefined,
                              borderWidth: isActive || isDone ? 2 : 1,
                            }}
                          >
                            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                              <Stack spacing={1}>
                                <Stack direction="row" spacing={1} alignItems="center">
                                  <Typography variant="subtitle2">{stage}</Typography>
                                  {isDone && <Chip label="Done" color="success" size="small" />}
                                  {isActive && !isDone && <Chip label="Current" color="primary" size="small" />}
                                </Stack>

                                <Typography variant="caption" color="text.secondary">
                                  {stagePrompt[stage]}
                                </Typography>

                                {/* Notes */}
                                <TextField
                                  placeholder={`Notes for ${stage}...`}
                                  multiline
                                  minRows={2}
                                  value={notes}
                                  onChange={(e) => handleStageNotes(stage, e.target.value)}
                                  fullWidth
                                  size="small"
                                />

                                {/* Photo thumbnails for this stage */}
                                {stagePhotos.length > 0 && (
                                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                    {stagePhotos.map((photo) => {
                                      const url = artifactUrls[photo.id!]
                                      return url ? (
                                        <Box
                                          key={photo.id}
                                          component="img"
                                          src={url}
                                          alt={`${stage} photo`}
                                          onClick={() => setViewPhotoUrl(url)}
                                          sx={{
                                            width: 56,
                                            height: 56,
                                            objectFit: 'cover',
                                            borderRadius: 1,
                                            border: '1px solid',
                                            borderColor: 'divider',
                                            cursor: 'pointer',
                                          }}
                                        />
                                      ) : (
                                        <Box
                                          key={photo.id}
                                          sx={{
                                            width: 56,
                                            height: 56,
                                            borderRadius: 1,
                                            border: '1px solid',
                                            borderColor: 'divider',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            bgcolor: 'action.hover',
                                          }}
                                        >
                                          <BrokenImageIcon fontSize="small" color="disabled" />
                                        </Box>
                                      )
                                    })}
                                    <Typography variant="caption" color="text.secondary">
                                      {stagePhotos.length} photo{stagePhotos.length !== 1 ? 's' : ''}
                                    </Typography>
                                  </Stack>
                                )}

                                {/* Inline photo capture for this stage */}
                                {inlinePhotoStage === stage && (
                                  <Box sx={{ mt: 1 }}>
                                    <PhotoCapture
                                      onCapture={(file) => handlePhotoCapture(file, stage)}
                                      uploading={mediaUploading}
                                    />
                                    <Button
                                      variant="text"
                                      size="small"
                                      onClick={() => setInlinePhotoStage(null)}
                                      sx={{ mt: 1 }}
                                    >
                                      Cancel photo
                                    </Button>
                                  </Box>
                                )}

                                {/* Action buttons */}
                                <Stack direction="row" spacing={1} flexWrap="wrap">
                                  {!isDone && (
                                    <Button
                                      variant="outlined"
                                      size="small"
                                      onClick={() => handleStageDone(stage, true)}
                                    >
                                      Mark Done
                                    </Button>
                                  )}
                                  {isDone && (
                                    <Button
                                      variant="text"
                                      size="small"
                                      onClick={() => handleStageDone(stage, false)}
                                    >
                                      Undo Done
                                    </Button>
                                  )}
                                  {inlinePhotoStage !== stage && (
                                    <Button
                                      variant="outlined"
                                      size="small"
                                      startIcon={<PhotoCameraIcon />}
                                      onClick={() => {
                                        setInlinePhotoStage(stage)
                                        setCaptureStage(null)
                                      }}
                                    >
                                      Add Photo
                                    </Button>
                                  )}
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={() => handleStageSelect(stage)}
                                  >
                                    Capture Artifact
                                  </Button>
                                  {isActive && idx < LAB_STAGES.length - 1 && (
                                    <Button
                                      variant="outlined"
                                      size="small"
                                      onClick={() => handleStageAdvance(LAB_STAGES[idx + 1])}
                                    >
                                      Advance to {LAB_STAGES[idx + 1]}
                                    </Button>
                                  )}
                                </Stack>
                              </Stack>
                            </CardContent>
                          </Card>
                        )
                      })}
                    </Stack>

                    {labSession.status !== LabSessionStatus.Complete && (
                      <Button
                        variant="contained"
                        color="success"
                        onClick={handleMarkComplete}
                      >
                        Mark Lab Complete
                      </Button>
                    )}
                  </Stack>
                </SectionCard>
              </div>
            )}

            {/* ── Artifact Capture Form ───────────────────── */}
            {captureStage && (
              <div style={{ marginTop: 16 }}>
                <SectionCard title={`Capture ${captureStage} Artifact`}>
                  <Stack spacing={2}>
                    <ToggleButtonGroup
                      value={artifactForm.evidenceType}
                      exclusive
                      onChange={(_event, value) => {
                        if (value) handleFormChange('evidenceType', value)
                      }}
                      fullWidth
                      size="large"
                    >
                      <ToggleButton value={EvidenceType.Note}>Note</ToggleButton>
                      <ToggleButton value={EvidenceType.Photo}>Photo</ToggleButton>
                      <ToggleButton value={EvidenceType.Audio}>Audio</ToggleButton>
                    </ToggleButtonGroup>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                      <TextField
                        label="Subject bucket"
                        select
                        fullWidth
                        value={artifactForm.subjectBucket}
                        onChange={(event) =>
                          handleFormChange(
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
                          handleFormChange(
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
                      onChange={(event) => handleFormChange('domain', event.target.value)}
                    />
                    {childLadders.length > 0 && (
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                        <TextField
                          label="Ladder (optional)"
                          select
                          fullWidth
                          size="small"
                          value={artifactForm.ladderKey}
                          onChange={(event) => {
                            const key = event.target.value
                            handleFormChange('ladderKey', key)
                            const ladder = childLadders.find((l) => l.ladderKey === key)
                            if (ladder && ladder.rungs.length > 0) {
                              handleFormChange('rungId', ladder.rungs[0].rungId)
                            } else {
                              handleFormChange('rungId', '')
                            }
                          }}
                        >
                          <MenuItem value="">None</MenuItem>
                          {childLadders.map((l) => (
                            <MenuItem key={l.ladderKey} value={l.ladderKey}>
                              {l.title}
                            </MenuItem>
                          ))}
                        </TextField>
                        {artifactForm.ladderKey && (() => {
                          const ladder = childLadders.find((l) => l.ladderKey === artifactForm.ladderKey)
                          if (!ladder) return null
                          return (
                            <TextField
                              label="Rung"
                              select
                              fullWidth
                              size="small"
                              value={artifactForm.rungId}
                              onChange={(event) => handleFormChange('rungId', event.target.value)}
                            >
                              {ladder.rungs.map((r) => (
                                <MenuItem key={r.rungId} value={r.rungId}>
                                  {r.rungId}: {r.name}
                                </MenuItem>
                              ))}
                            </TextField>
                          )
                        })()}
                      </Stack>
                    )}
                    {artifactForm.evidenceType === EvidenceType.Note && (
                      <>
                        <TextField
                          label="Note"
                          multiline
                          minRows={3}
                          value={artifactForm.content}
                          onChange={(event) =>
                            handleFormChange('content', event.target.value)
                          }
                        />
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                          <Button variant="contained" onClick={handleSave}>
                            Save Note
                          </Button>
                          <Button variant="outlined" onClick={() => setCaptureStage(null)}>
                            Cancel
                          </Button>
                        </Stack>
                      </>
                    )}
                    {artifactForm.evidenceType === EvidenceType.Photo && (
                      <Stack spacing={2}>
                        <PhotoCapture
                          onCapture={(file) => handlePhotoCapture(file, captureStage)}
                          uploading={mediaUploading}
                        />
                        <Button variant="outlined" onClick={() => setCaptureStage(null)}>
                          Cancel
                        </Button>
                      </Stack>
                    )}
                    {artifactForm.evidenceType === EvidenceType.Audio && (
                      <Stack spacing={2}>
                        <AudioRecorder onCapture={handleAudioCapture} uploading={mediaUploading} />
                        <Button variant="outlined" onClick={() => setCaptureStage(null)}>
                          Cancel
                        </Button>
                      </Stack>
                    )}
                  </Stack>
                </SectionCard>
              </div>
            )}

            {/* ── Recent Sessions ──────────────────────────── */}
            {selectedProject && recentSessions.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <SectionCard title="Recent Sessions">
                  <Stack spacing={1}>
                    {recentSessions.map((s) => (
                      <Stack
                        key={s.id}
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        justifyContent="space-between"
                      >
                        <Typography variant="body2">
                          Week of {formatWeekShort(s.weekKey)}
                        </Typography>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Chip
                            label={statusLabel[s.status] ?? s.status}
                            color={statusColor[s.status] ?? 'default'}
                            size="small"
                            variant="outlined"
                          />
                          <Typography variant="caption" color="text.secondary">
                            {sessionCompletion(s)}%
                          </Typography>
                        </Stack>
                      </Stack>
                    ))}
                  </Stack>
                </SectionCard>
              </div>
            )}
          </div>
        )}
      </Stack>

      {/* ── New Project Dialog ───────────────────────────────── */}
      <Dialog
        open={showNewProjectDialog}
        onClose={() => setShowNewProjectDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>New Dad Lab Project</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Project title"
            fullWidth
            value={newProjectTitle}
            onChange={(e) => setNewProjectTitle(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowNewProjectDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateProject}
            disabled={!newProjectTitle.trim() || projectSaving}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Project Notes Dialog ─────────────────────────────── */}
      <Dialog
        open={showProjectNotesDialog}
        onClose={() => setShowProjectNotesDialog(false)}
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
                  onChange={(e) => {
                    const val = e.target.value
                    setProjects((prev) =>
                      prev.map((p) => (p.id === selectedProject.id ? { ...p, planNotes: val } : p)),
                    )
                  }}
                  onBlur={(e) => handleProjectFieldSave('planNotes', e.target.value)}
                  fullWidth
                  slotProps={{ input: { readOnly: !canEdit } }}
                />
                <TextField
                  label="Build notes"
                  multiline
                  minRows={2}
                  value={selectedProject.buildNotes ?? ''}
                  onChange={(e) => {
                    const val = e.target.value
                    setProjects((prev) =>
                      prev.map((p) => (p.id === selectedProject.id ? { ...p, buildNotes: val } : p)),
                    )
                  }}
                  onBlur={(e) => handleProjectFieldSave('buildNotes', e.target.value)}
                  fullWidth
                  slotProps={{ input: { readOnly: !canEdit } }}
                />
                <TextField
                  label="Test notes"
                  multiline
                  minRows={2}
                  value={selectedProject.testNotes ?? ''}
                  onChange={(e) => {
                    const val = e.target.value
                    setProjects((prev) =>
                      prev.map((p) => (p.id === selectedProject.id ? { ...p, testNotes: val } : p)),
                    )
                  }}
                  onBlur={(e) => handleProjectFieldSave('testNotes', e.target.value)}
                  fullWidth
                  slotProps={{ input: { readOnly: !canEdit } }}
                />
                <TextField
                  label="Improve notes"
                  multiline
                  minRows={2}
                  value={selectedProject.improveNotes ?? ''}
                  onChange={(e) => {
                    const val = e.target.value
                    setProjects((prev) =>
                      prev.map((p) => (p.id === selectedProject.id ? { ...p, improveNotes: val } : p)),
                    )
                  }}
                  onBlur={(e) => handleProjectFieldSave('improveNotes', e.target.value)}
                  fullWidth
                  slotProps={{ input: { readOnly: !canEdit } }}
                />
                <TextField
                  label="What changed?"
                  multiline
                  minRows={2}
                  placeholder="What did you change between versions?"
                  value={selectedProject.whatChanged ?? ''}
                  onChange={(e) => {
                    const val = e.target.value
                    setProjects((prev) =>
                      prev.map((p) => (p.id === selectedProject.id ? { ...p, whatChanged: val } : p)),
                    )
                  }}
                  onBlur={(e) => handleProjectFieldSave('whatChanged', e.target.value)}
                  fullWidth
                  slotProps={{ input: { readOnly: !canEdit } }}
                />
                <TextField
                  label="Teach-back"
                  multiline
                  minRows={2}
                  placeholder="Explain the project to someone else."
                  value={selectedProject.teachBack ?? ''}
                  onChange={(e) => {
                    const val = e.target.value
                    setProjects((prev) =>
                      prev.map((p) => (p.id === selectedProject.id ? { ...p, teachBack: val } : p)),
                    )
                  }}
                  onBlur={(e) => handleProjectFieldSave('teachBack', e.target.value)}
                  fullWidth
                  slotProps={{ input: { readOnly: !canEdit } }}
                />
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setShowProjectNotesDialog(false)}>Close</Button>
              {canEdit && phaseIndex(selectedProject.phase) < phases.length - 1 && (
                <Button variant="outlined" onClick={handleAdvancePhase}>
                  Next Phase: {phases[phaseIndex(selectedProject.phase) + 1]}
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* ── Photo viewer dialog ──────────────────────────────── */}
      <Dialog
        open={Boolean(viewPhotoUrl)}
        onClose={() => setViewPhotoUrl(null)}
        maxWidth="md"
      >
        {viewPhotoUrl && (
          <Box
            component="img"
            src={viewPhotoUrl}
            alt="Artifact photo"
            sx={{ width: '100%', maxHeight: '80vh', objectFit: 'contain' }}
          />
        )}
      </Dialog>
    </Page>
  )
}
