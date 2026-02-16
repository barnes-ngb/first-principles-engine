import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { getDownloadURL, ref } from 'firebase/storage'

import { useAuth, useFamilyId } from '../../core/auth/useAuth'
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
import {
  applySession,
  createInitialProgress,
} from '../ladders/ladderProgress'

// ── Types ──────────────────────────────────────────────────────

export type ArtifactFormState = {
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

export const defaultFormState = (
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

// ── Project phase ordering (module-level constants) ───────────

const phases: ProjectPhaseType[] = [
  ProjectPhase.Plan,
  ProjectPhase.Build,
  ProjectPhase.Test,
  ProjectPhase.Improve,
]

const phaseIndex = (phase: ProjectPhaseType): number => phases.indexOf(phase)

// ── Helpers ────────────────────────────────────────────────────

/** Resolve a photo artifact URL defensively. */
export async function resolvePhotoUrl(artifact: Artifact, familyId: string): Promise<string | null> {
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

// ── Lab Session Hook (core) ────────────────────────────────────

export interface UseLabSessionResult {
  /** The lab session for the current child + week + project, or null if none exists. */
  labSession: LabSession | null
  /** True while the initial snapshot is loading. */
  isLoading: boolean
  /** Start or continue a lab session (upsert). */
  startOrContinue: () => Promise<void>
  /** Update mutable fields on the lab session. */
  updateSession: (fields: Partial<Pick<LabSession, 'stage' | 'status' | 'mission' | 'constraints' | 'roles' | 'stageNotes' | 'stageDone' | 'finishWhatChanged' | 'finishNextStep' | 'finishSummary'>>) => Promise<void>
}

/**
 * Real-time listener for a single lab session doc keyed by weekKey + childId + projectId.
 * Re-subscribes whenever childId, weekKey, or projectId changes.
 */
export function useLabSession(childId: string, weekKey: string, projectId?: string): UseLabSessionResult {
  const familyId = useFamilyId()
  const [snapshot, setSnapshot] = useState<{ session: LabSession | null; loaded: boolean }>({
    session: null,
    loaded: false,
  })

  const canSubscribe = Boolean(childId && weekKey && familyId && projectId)

  useEffect(() => {
    if (!canSubscribe) return

    const docId = labSessionDocId(weekKey, childId, projectId)
    const docRef = doc(labSessionsCollection(familyId), docId)

    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          setSnapshot({ session: { ...snap.data(), id: snap.id }, loaded: true })
        } else {
          setSnapshot({ session: null, loaded: true })
        }
      },
      (err) => {
        console.error('Failed to load lab session', err)
        setSnapshot({ session: null, loaded: true })
      },
    )

    return () => {
      unsubscribe()
      setSnapshot({ session: null, loaded: false })
    }
  }, [familyId, childId, weekKey, projectId, canSubscribe])

  const labSession = canSubscribe ? snapshot.session : null
  const isLoading = canSubscribe ? !snapshot.loaded : false

  const startOrContinue = useCallback(async () => {
    if (!childId || !weekKey || !familyId || !projectId) return

    const docId = labSessionDocId(weekKey, childId, projectId)
    const docRef = doc(labSessionsCollection(familyId), docId)
    const now = new Date().toISOString()

    if (labSession) {
      const updates: Record<string, unknown> = { updatedAt: now }
      if (labSession.status === LabSessionStatus.NotStarted) {
        updates.status = LabSessionStatus.InProgress
      }
      await updateDoc(docRef, updates)
    } else {
      const newSession: Omit<LabSession, 'id'> = {
        childId,
        weekKey,
        dateKey: now.slice(0, 10),
        projectId,
        status: LabSessionStatus.InProgress,
        stage: EngineStage.Wonder,
        createdAt: now,
        updatedAt: now,
      }
      await setDoc(docRef, newSession)
    }

    // Update lastSessionAt on the project
    if (projectId) {
      const projRef = doc(projectsCollection(familyId), projectId)
      await updateDoc(projRef, { lastSessionAt: now, updatedAt: now }).catch(() => {
        // Project may not exist yet (race condition) — ignore
      })
    }
  }, [familyId, childId, weekKey, projectId, labSession])

  const updateSession = useCallback(
    async (fields: Partial<Pick<LabSession, 'stage' | 'status' | 'mission' | 'constraints' | 'roles' | 'stageNotes' | 'stageDone' | 'finishWhatChanged' | 'finishNextStep' | 'finishSummary'>>) => {
      if (!childId || !weekKey || !familyId || !projectId) return

      const docId = labSessionDocId(weekKey, childId, projectId)
      const docRef = doc(labSessionsCollection(familyId), docId)
      await updateDoc(docRef, {
        ...fields,
        updatedAt: new Date().toISOString(),
      })
    },
    [familyId, childId, weekKey, projectId],
  )

  return useMemo(
    () => ({ labSession, isLoading, startOrContinue, updateSession }),
    [labSession, isLoading, startOrContinue, updateSession],
  )
}

// ── Projects Hook ──────────────────────────────────────────────

export interface UseLabProjectsResult {
  projects: Project[]
  projectsLoading: boolean
  childProjects: Project[]
  archivedProjects: Project[]
  selectedProjectId: string | null
  setSelectedProjectId: (id: string | null) => void
  selectedProject: Project | null
  notesProject: Project | null
  notesProjectId: string | null
  setNotesProjectId: (id: string | null) => void
  projectById: Record<string, Project>
  projectHasSessions: (projectId: string) => boolean
  /** Local state setter — used by notes dialog for optimistic updates. */
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>

  // CRUD
  handleCreateProject: (title: string) => Promise<void>
  handleProjectFieldSave: (field: keyof Project, value: string, projectId?: string) => Promise<void>
  handleAdvancePhase: (projectId?: string) => Promise<void>

  // Archive / delete
  handleArchive: (projectId: string) => Promise<void>
  handleUnarchive: (projectId: string) => Promise<void>
  handleDeleteRequest: (projectId: string) => void
  handleDeleteConfirm: () => Promise<void>
  handleUndoDelete: () => Promise<void>
  showDeleteConfirm: boolean
  setShowDeleteConfirm: (show: boolean) => void
  deleteTargetId: string | null
  setDeleteTargetId: (id: string | null) => void
  undoProject: Project | null
  showUndoSnackbar: boolean
  setShowUndoSnackbar: (show: boolean) => void
  setUndoProject: (p: Project | null) => void

  // Rename
  handleRenameOpen: (projectId: string) => void
  handleRenameConfirm: () => Promise<void>
  showRenameDialog: boolean
  setShowRenameDialog: (show: boolean) => void
  renameTitle: string
  setRenameTitle: (title: string) => void

  // Menu
  menuAnchor: HTMLElement | null
  setMenuAnchor: (el: HTMLElement | null) => void
  menuProjectId: string | null
  setMenuProjectId: (id: string | null) => void

  projectSaving: boolean
}

export function useLabProjects(
  selectedChildId: string,
  weekSessions: LabSession[],
): UseLabProjectsResult {
  const familyId = useFamilyId()
  const { user } = useAuth()

  const [projects, setProjects] = useState<Project[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [projectSaving, setProjectSaving] = useState(false)
  const [notesProjectId, setNotesProjectId] = useState<string | null>(null)

  // Delete / archive state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [undoProject, setUndoProject] = useState<Project | null>(null)
  const [showUndoSnackbar, setShowUndoSnackbar] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null)

  // Rename state
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [renameProjectId, setRenameProjectId] = useState<string | null>(null)
  const [renameTitle, setRenameTitle] = useState('')

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
    () => projects.filter((p) => p.childId === selectedChildId && !p.completed && !p.deletedAt && !p.archivedAt),
    [projects, selectedChildId],
  )

  const archivedProjects = useMemo(
    () => projects.filter((p) => p.childId === selectedChildId && !p.deletedAt && !!p.archivedAt),
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

  const notesProject = useMemo(
    () => projects.find((p) => p.id === notesProjectId) ?? null,
    [projects, notesProjectId],
  )

  const projectById = useMemo(() => {
    const map: Record<string, Project> = {}
    for (const p of projects) {
      if (p.id) map[p.id] = p
    }
    return map
  }, [projects])

  const projectHasSessions = useMemo(() => {
    const sessionProjectIds = new Set(weekSessions.map((s) => s.projectId).filter(Boolean))
    return (projectId: string): boolean => {
      if (sessionProjectIds.has(projectId)) return true
      const proj = projectById[projectId]
      return Boolean(proj?.lastSessionAt)
    }
  }, [weekSessions, projectById])

  // ── CRUD ──────────────────────────────────────────────────────

  const handleCreateProject = useCallback(async (title: string) => {
    if (!title.trim() || !selectedChildId || projectSaving) return
    setProjectSaving(true)
    try {
      const project: Omit<Project, 'id'> = {
        childId: selectedChildId,
        title: title.trim(),
        phase: ProjectPhase.Plan,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completed: false,
      }
      const docRef = await addDoc(projectsCollection(familyId), project)
      const created = { ...project, id: docRef.id }
      setProjects((prev) => [...prev, created])
      setSelectedProjectId(docRef.id)
    } finally {
      setProjectSaving(false)
    }
  }, [familyId, selectedChildId, projectSaving])

  const handleProjectFieldSave = useCallback(
    async (field: keyof Project, value: string, projectId?: string) => {
      const targetId = projectId ?? selectedProject?.id
      if (!targetId) return
      await updateDoc(doc(projectsCollection(familyId), targetId), {
        [field]: value,
        updatedAt: new Date().toISOString(),
      })
      setProjects((prev) =>
        prev.map((p) => (p.id === targetId ? { ...p, [field]: value } : p)),
      )
    },
    [familyId, selectedProject],
  )

  const handleAdvancePhase = useCallback(async (projectId?: string) => {
    const targetId = projectId ?? selectedProject?.id
    const target = projects.find((p) => p.id === targetId)
    if (!targetId || !target) return
    const currentIdx = phaseIndex(target.phase)
    const nextPhase = currentIdx < phases.length - 1
      ? phases[currentIdx + 1]
      : target.phase
    await updateDoc(doc(projectsCollection(familyId), targetId), {
      phase: nextPhase,
      updatedAt: new Date().toISOString(),
    })
    setProjects((prev) =>
      prev.map((p) => (p.id === targetId ? { ...p, phase: nextPhase } : p)),
    )
  }, [familyId, selectedProject, projects])

  // ── Delete / archive ──────────────────────────────────────────

  const handleDeleteRequest = useCallback((projectId: string) => {
    setDeleteTargetId(projectId)
    setShowDeleteConfirm(true)
    setMenuAnchor(null)
    setMenuProjectId(null)
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTargetId) return
    const now = new Date().toISOString()
    await updateDoc(doc(projectsCollection(familyId), deleteTargetId), {
      deletedAt: now,
      deletedBy: user?.uid ?? null,
      updatedAt: now,
    })
    const deleted = projects.find((p) => p.id === deleteTargetId)
    if (deleted) {
      setUndoProject({ ...deleted, deletedAt: now, deletedBy: user?.uid ?? undefined })
      setShowUndoSnackbar(true)
    }
    setProjects((prev) =>
      prev.map((p) => (p.id === deleteTargetId ? { ...p, deletedAt: now, deletedBy: user?.uid ?? undefined } : p)),
    )
    if (selectedProjectId === deleteTargetId) setSelectedProjectId(null)
    setShowDeleteConfirm(false)
    setDeleteTargetId(null)
  }, [deleteTargetId, familyId, projects, selectedProjectId, user])

  const handleUndoDelete = useCallback(async () => {
    if (!undoProject?.id) return
    await updateDoc(doc(projectsCollection(familyId), undoProject.id), {
      deletedAt: null,
      deletedBy: null,
      updatedAt: new Date().toISOString(),
    })
    setProjects((prev) =>
      prev.map((p) =>
        p.id === undoProject.id
          ? { ...p, deletedAt: undefined, deletedBy: undefined }
          : p,
      ),
    )
    setShowUndoSnackbar(false)
    setUndoProject(null)
  }, [familyId, undoProject])

  const handleArchive = useCallback(async (projectId: string) => {
    const now = new Date().toISOString()
    await updateDoc(doc(projectsCollection(familyId), projectId), {
      archivedAt: now,
      updatedAt: now,
    })
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, archivedAt: now } : p)),
    )
    if (selectedProjectId === projectId) setSelectedProjectId(null)
    setMenuAnchor(null)
    setMenuProjectId(null)
  }, [familyId, selectedProjectId])

  const handleUnarchive = useCallback(async (projectId: string) => {
    await updateDoc(doc(projectsCollection(familyId), projectId), {
      archivedAt: null,
      updatedAt: new Date().toISOString(),
    })
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, archivedAt: undefined } : p)),
    )
  }, [familyId])

  // ── Rename ────────────────────────────────────────────────────

  const handleRenameOpen = useCallback((projectId: string) => {
    const proj = projects.find((p) => p.id === projectId)
    setRenameProjectId(projectId)
    setRenameTitle(proj?.title ?? '')
    setShowRenameDialog(true)
    setMenuAnchor(null)
    setMenuProjectId(null)
  }, [projects])

  const handleRenameConfirm = useCallback(async () => {
    if (!renameProjectId || !renameTitle.trim()) return
    await updateDoc(doc(projectsCollection(familyId), renameProjectId), {
      title: renameTitle.trim(),
      updatedAt: new Date().toISOString(),
    })
    setProjects((prev) =>
      prev.map((p) => (p.id === renameProjectId ? { ...p, title: renameTitle.trim() } : p)),
    )
    setShowRenameDialog(false)
    setRenameProjectId(null)
  }, [familyId, renameProjectId, renameTitle])

  return {
    projects,
    projectsLoading,
    childProjects,
    archivedProjects,
    selectedProjectId,
    setSelectedProjectId,
    selectedProject,
    notesProject,
    notesProjectId,
    setNotesProjectId,
    projectById,
    projectHasSessions,
    setProjects,

    handleCreateProject,
    handleProjectFieldSave,
    handleAdvancePhase,

    handleArchive,
    handleUnarchive,
    handleDeleteRequest,
    handleDeleteConfirm,
    handleUndoDelete,
    showDeleteConfirm,
    setShowDeleteConfirm,
    deleteTargetId,
    setDeleteTargetId,
    undoProject,
    showUndoSnackbar,
    setShowUndoSnackbar,
    setUndoProject,

    handleRenameOpen,
    handleRenameConfirm,
    showRenameDialog,
    setShowRenameDialog,
    renameTitle,
    setRenameTitle,

    menuAnchor,
    setMenuAnchor,
    menuProjectId,
    setMenuProjectId,

    projectSaving,
  }
}

// ── Session Artifacts Hook ─────────────────────────────────────

export interface UseSessionArtifactsResult {
  sessionArtifacts: Artifact[]
  setSessionArtifacts: React.Dispatch<React.SetStateAction<Artifact[]>>
  artifactUrls: Record<string, string | null>
  setArtifactUrls: React.Dispatch<React.SetStateAction<Record<string, string | null>>>
  artifactsByStage: Partial<Record<EngineStageType, Artifact[]>>
}

export function useSessionArtifacts(
  selectedChildId: string,
  sessionDocId: string | null,
): UseSessionArtifactsResult {
  const familyId = useFamilyId()

  const [sessionArtifacts, setSessionArtifacts] = useState<Artifact[]>([])
  const [artifactUrls, setArtifactUrls] = useState<Record<string, string | null>>({})

  // Reset stale artifact data when the load-key changes (render-time reset)
  const sessionArtifactKey = `${familyId}|${selectedChildId}|${sessionDocId ?? ''}`
  const [prevSessionArtifactKey, setPrevSessionArtifactKey] = useState(sessionArtifactKey)
  if (prevSessionArtifactKey !== sessionArtifactKey) {
    setPrevSessionArtifactKey(sessionArtifactKey)
    setSessionArtifacts([])
    setArtifactUrls({})
  }

  useEffect(() => {
    if (!familyId || !selectedChildId || !sessionDocId) return

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

  return { sessionArtifacts, setSessionArtifacts, artifactUrls, setArtifactUrls, artifactsByStage }
}

// ── Artifact Capture Hook ──────────────────────────────────────

export interface UseArtifactCaptureResult {
  captureStage: EngineStage | null
  setCaptureStage: (stage: EngineStage | null) => void
  mediaUploading: boolean
  artifactForm: ArtifactFormState
  inlinePhotoStage: EngineStage | null
  setInlinePhotoStage: (stage: EngineStage | null) => void
  handleStageSelect: (stage: EngineStage) => void
  handleFormChange: (field: keyof ArtifactFormState, value: ArtifactFormState[keyof ArtifactFormState]) => void
  handleSave: () => Promise<void>
  handlePhotoCapture: (file: File, stage: EngineStage) => Promise<void>
  handleAudioCapture: (blob: Blob) => Promise<void>
}

export function useArtifactCapture(
  selectedChildId: string,
  weekKey: string,
  sessionDocId: string | null,
  selectedProjectId: string | null,
  childLadders: LadderCardDefinition[],
  setSessionArtifacts: React.Dispatch<React.SetStateAction<Artifact[]>>,
  setArtifactUrls: React.Dispatch<React.SetStateAction<Record<string, string | null>>>,
): UseArtifactCaptureResult {
  const familyId = useFamilyId()

  const [captureStage, setCaptureStage] = useState<EngineStage | null>(null)
  const [mediaUploading, setMediaUploading] = useState(false)
  const [artifactForm, setArtifactForm] = useState<ArtifactFormState>(() =>
    defaultFormState(EngineStage.Wonder, selectedChildId),
  )
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

    const newArt: Artifact = {
      ...buildBase(title, EvidenceType.Note, captureStage),
      content: artifactForm.content,
      id: docRef.id,
    }
    setSessionArtifacts((prev) => [newArt, ...prev])

    setCaptureStage(null)
    setArtifactForm((prev) => defaultFormState(EngineStage.Wonder, prev.childId))
  }, [artifactForm, buildBase, captureStage, familyId, logLadderSessionForArtifact, setSessionArtifacts])

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
    [artifactForm, buildBase, familyId, logLadderSessionForArtifact, setSessionArtifacts, setArtifactUrls],
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
    [artifactForm, buildBase, captureStage, familyId, logLadderSessionForArtifact, setSessionArtifacts],
  )

  return {
    captureStage,
    setCaptureStage,
    mediaUploading,
    artifactForm,
    inlinePhotoStage,
    setInlinePhotoStage,
    handleStageSelect,
    handleFormChange,
    handleSave,
    handlePhotoCapture,
    handleAudioCapture,
  }
}

// ── Re-export ProjectPhase helpers for consumers ───────────────

export const PROJECT_PHASES: ProjectPhaseType[] = [
  ProjectPhase.Plan,
  ProjectPhase.Build,
  ProjectPhase.Test,
  ProjectPhase.Improve,
]

export const projectPhaseIndex = (phase: ProjectPhaseType): number =>
  PROJECT_PHASES.indexOf(phase)
