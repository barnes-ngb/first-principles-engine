import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'
import Stepper from '@mui/material/Stepper'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import ArchiveIcon from '@mui/icons-material/Archive'
import BrokenImageIcon from '@mui/icons-material/BrokenImage'
import EditIcon from '@mui/icons-material/Edit'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import {
  arrayUnion,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'

import AudioRecorder from '../../components/AudioRecorder'
import ChildSelector from '../../components/ChildSelector'
import ContextBar from '../../components/ContextBar'
import HelpStrip from '../../components/HelpStrip'
import Page from '../../components/Page'
import PhotoCapture from '../../components/PhotoCapture'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import { artifactsCollection, labSessionDocId, projectsCollection } from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useProfile } from '../../core/profile/useProfile'
import type { Artifact, LadderCardDefinition, LabSession, SessionLogEntry } from '../../core/types/domain'
import {
  EngineStage,
  EvidenceType,
  LabSessionStatus,
  LearningLocation,
  SubjectBucket,
} from '../../core/types/enums'
import type { ProjectPhase as ProjectPhaseType } from '../../core/types/enums'
import { formatDateShort, formatWeekShort } from '../../core/utils/dateKey'
import { parseDateYmd } from '../../core/utils/format'
import { getWeekRange } from '../../core/utils/time'
import { getLaddersForChild } from '../ladders/laddersCatalog'
import { LAB_STAGES } from './labSession.logic'
import ProjectCard from './ProjectCard'
import StagePanel from './StagePanel'
import {
  useArtifactCapture,
  useLabProjects,
  useLabSession,
  useSessionArtifacts,
  resolvePhotoUrl,
  PROJECT_PHASES,
  projectPhaseIndex,
} from './useLabSession'
import { useWeekSessions } from './useWeekSessions'

// ── Constants ──────────────────────────────────────────────────

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

  // ── Week sessions ──────────────────────────────────────────
  const { sessions: weekSessions, isLoading: weekSessionsLoading, refresh: refreshWeekSessions } =
    useWeekSessions(selectedChildId, weekKey)

  // ── Projects ───────────────────────────────────────────────
  const projectsHook = useLabProjects(selectedChildId, weekSessions)
  const {
    childProjects,
    archivedProjects,
    selectedProjectId,
    setSelectedProjectId,
    selectedProject,
    notesProject,
    setNotesProjectId,
    projectById,
    projectHasSessions,
    projectsLoading,
    projects,
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
    setDeleteTargetId,
    undoProject,
    showUndoSnackbar,
    setShowUndoSnackbar,
    setUndoProject,
    canDeleteProject,
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
  } = projectsHook

  // ── Lab session ────────────────────────────────────────────
  const { labSession, isLoading: labLoading, startOrContinue, updateSession } =
    useLabSession(selectedChildId, weekKey, selectedProjectId ?? undefined)

  const labSectionRef = useRef<HTMLDivElement>(null)

  // ── Ladder definitions ─────────────────────────────────────
  const childLadders: LadderCardDefinition[] = useMemo(
    () => activeChild ? getLaddersForChild(activeChild.name) ?? [] : [],
    [activeChild],
  )

  // ── Session artifacts ──────────────────────────────────────
  const sessionDocId = labSession?.id ?? (selectedChildId && weekKey && selectedProjectId
    ? labSessionDocId(weekKey, selectedChildId, selectedProjectId)
    : null)

  const { setSessionArtifacts, artifactUrls, setArtifactUrls, artifactsByStage } =
    useSessionArtifacts(selectedChildId, sessionDocId)

  // ── Artifact capture ───────────────────────────────────────
  const {
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
  } = useArtifactCapture(
    selectedChildId,
    weekKey,
    sessionDocId,
    selectedProjectId,
    childLadders,
    setSessionArtifacts,
    setArtifactUrls,
  )

  // ── Dialog state ───────────────────────────────────────────
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false)
  const [newProjectTitle, setNewProjectTitle] = useState('')
  const [showProjectNotesDialog, setShowProjectNotesDialog] = useState(false)
  const [viewPhotoUrl, setViewPhotoUrl] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  // ── Finish session dialog state ────────────────────────────
  const [showFinishDialog, setShowFinishDialog] = useState(false)
  const [finishWhatChanged, setFinishWhatChanged] = useState('')
  const [finishNextStep, setFinishNextStep] = useState('')
  const [finishPhaseUpdate, setFinishPhaseUpdate] = useState<ProjectPhaseType | ''>('')

  // ── Project notes dialog tab ───────────────────────────────
  const [notesTab, setNotesTab] = useState(0)

  // ── Week artifacts (for photo strip + photo counts) ────────
  const [weekArtifacts, setWeekArtifacts] = useState<Artifact[]>([])
  const [weekPhotoUrls, setWeekPhotoUrls] = useState<Record<string, string | null>>({})

  // Reset stale artifact data when the load-key changes (render-time reset)
  const artifactLoadKey = `${familyId}|${selectedChildId}|${weekKey}`
  const [prevArtifactLoadKey, setPrevArtifactLoadKey] = useState(artifactLoadKey)
  if (prevArtifactLoadKey !== artifactLoadKey) {
    setPrevArtifactLoadKey(artifactLoadKey)
    setWeekArtifacts([])
    setWeekPhotoUrls({})
  }

  // Load all artifacts for the selected child + week (for photo strip + session counts)
  useEffect(() => {
    if (!familyId || !selectedChildId || !weekKey) return
    let cancelled = false
    const load = async () => {
      try {
        const q = query(
          artifactsCollection(familyId),
          where('childId', '==', selectedChildId),
          where('weekKey', '==', weekKey),
          orderBy('createdAt', 'desc'),
        )
        const snap = await getDocs(q)
        if (cancelled) return
        const arts = snap.docs.map((d) => ({ ...d.data(), id: d.id })) as Artifact[]
        setWeekArtifacts(arts)

        // Resolve photo URLs
        const photos = arts.filter((a) => a.type === EvidenceType.Photo)
        const urls: Record<string, string | null> = {}
        await Promise.all(
          photos.map(async (a) => {
            urls[a.id!] = await resolvePhotoUrl(a, familyId)
          }),
        )
        if (!cancelled) setWeekPhotoUrls(urls)
      } catch (err) {
        console.error('Failed to load week artifacts', err)
      }
    }
    load()
    return () => { cancelled = true }
  }, [familyId, selectedChildId, weekKey])

  /** Week photos for the evidence strip. */
  const weekPhotos = useMemo(
    () => weekArtifacts.filter((a) => a.type === EvidenceType.Photo),
    [weekArtifacts],
  )

  /** Photo count per session (by labSessionId). */
  const sessionPhotoCount = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const art of weekArtifacts) {
      if (art.type === EvidenceType.Photo && art.labSessionId) {
        counts[art.labSessionId] = (counts[art.labSessionId] ?? 0) + 1
      }
    }
    return counts
  }, [weekArtifacts])

  // ── Child selection ────────────────────────────────────────
  const handleChildSelect = useCallback(
    (childId: string) => {
      setActiveChildId(childId)
      setCaptureStage(null)
      setInlinePhotoStage(null)
    },
    [setActiveChildId, setCaptureStage, setInlinePhotoStage],
  )

  // ── Session handlers ───────────────────────────────────────
  const handleStartSession = useCallback(async (projectId: string) => {
    setSelectedProjectId(projectId)
    setTimeout(async () => {
      await startOrContinue()
      refreshWeekSessions()
      setTimeout(() => {
        labSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }, 50)
  }, [startOrContinue, refreshWeekSessions, setSelectedProjectId])

  const handleContinueSession = useCallback(async (session: LabSession) => {
    if (session.projectId) {
      setSelectedProjectId(session.projectId)
    }
    setTimeout(async () => {
      await startOrContinue()
      setTimeout(() => {
        labSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }, 50)
  }, [startOrContinue, setSelectedProjectId])

  const handleStageAdvance = useCallback(
    async (stage: EngineStage) => { await updateSession({ stage }) },
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

  /** Open the Finish Session dialog. */
  const handleFinishSessionOpen = useCallback(() => {
    setFinishWhatChanged('')
    setFinishNextStep('')
    setFinishPhaseUpdate(selectedProject?.phase ?? '')
    setShowFinishDialog(true)
  }, [selectedProject])

  /** Confirm finish: save prompts, mark complete, append session log, optionally update phase. */
  const handleFinishSessionConfirm = useCallback(async () => {
    if (!labSession || !selectedProject?.id) return

    // Save finish fields on the session
    await updateSession({
      status: LabSessionStatus.Complete,
      finishWhatChanged: finishWhatChanged.trim() || undefined,
      finishNextStep: finishNextStep.trim() || undefined,
    })

    // Count artifacts for this session
    const sessionArtCount = weekArtifacts.filter(
      (a) => a.labSessionId === labSession.id,
    ).length

    // Append a SessionLogEntry to the project
    const logEntry: SessionLogEntry = {
      sessionId: labSession.id ?? '',
      dateKey: labSession.dateKey ?? new Date().toISOString().slice(0, 10),
      summary: finishNextStep.trim() || `Session completed`,
      artifactCount: sessionArtCount,
      whatChanged: finishWhatChanged.trim() || undefined,
    }
    const projRef = doc(projectsCollection(familyId), selectedProject.id)
    const projUpdates: Record<string, unknown> = {
      sessionLog: arrayUnion(logEntry),
      updatedAt: new Date().toISOString(),
    }

    // Optionally update the project phase
    if (finishPhaseUpdate && finishPhaseUpdate !== selectedProject.phase) {
      projUpdates.phase = finishPhaseUpdate
    }
    await updateDoc(projRef, projUpdates)

    // Update local project state
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== selectedProject.id) return p
        const updated = { ...p, sessionLog: [...(p.sessionLog ?? []), logEntry] }
        if (finishPhaseUpdate && finishPhaseUpdate !== p.phase) {
          updated.phase = finishPhaseUpdate
        }
        return updated
      }),
    )

    setShowFinishDialog(false)
    refreshWeekSessions()
  }, [labSession, selectedProject, updateSession, finishWhatChanged, finishNextStep, finishPhaseUpdate, weekArtifacts, familyId, refreshWeekSessions, setProjects])


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

  // ── Project dialog handlers ────────────────────────────────
  const handleCreateAndClose = useCallback(async () => {
    if (!newProjectTitle.trim() || projectSaving) return
    await handleCreateProject(newProjectTitle)
    setNewProjectTitle('')
    setShowNewProjectDialog(false)
  }, [handleCreateProject, newProjectTitle, projectSaving])

  const handleOpenNotes = useCallback((projectId: string) => {
    setNotesProjectId(projectId)
    setNotesTab(0)
    setShowProjectNotesDialog(true)
  }, [setNotesProjectId])

  const handleOpenMenu = useCallback((event: React.MouseEvent<HTMLElement>, projectId: string) => {
    setMenuAnchor(event.currentTarget)
    setMenuProjectId(projectId)
  }, [setMenuAnchor, setMenuProjectId])

  // ── Smart Start ────────────────────────────────────────────
  const projectsSectionRef = useRef<HTMLDivElement>(null)

  const handleSmartStart = useCallback(() => {
    if (childProjects.length === 0) {
      setShowNewProjectDialog(true)
    } else if (childProjects.length === 1) {
      handleStartSession(childProjects[0].id!)
    } else {
      projectsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [childProjects, handleStartSession])

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
        text="A Project is the ongoing thread. A Lab Session is a single run of that project. Photos are evidence captured during the session."
        maxShowCount={3}
        forceShow={weekSessions.length === 0 && !weekSessionsLoading}
      />
      <Stack spacing={2}>
        <ChildSelector
          children={children}
          selectedChildId={selectedChildId}
          onSelect={handleChildSelect}
          onChildAdded={addChild}
          isLoading={childrenLoading}
        />

        {/* ═══ Section 1: This Week's Lab Sessions ═══ */}
        {isReady && (
          <SectionCard title="This Week's Lab Sessions">
            {/* ── Evidence photo strip ──────────────────── */}
            {weekPhotos.length > 0 && (
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  Evidence this week
                </Typography>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ overflowX: 'auto', pb: 0.5 }}
                >
                  {weekPhotos.map((photo) => {
                    const url = weekPhotoUrls[photo.id!]
                    return url ? (
                      <Box
                        key={photo.id}
                        component="img"
                        src={url}
                        alt="Evidence"
                        onClick={() => setViewPhotoUrl(url)}
                        sx={{
                          width: 64,
                          height: 64,
                          objectFit: 'cover',
                          borderRadius: 1,
                          border: '1px solid',
                          borderColor: 'divider',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <Box
                        key={photo.id}
                        sx={{
                          width: 64,
                          height: 64,
                          borderRadius: 1,
                          border: '1px solid',
                          borderColor: 'divider',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: 'action.hover',
                          flexShrink: 0,
                        }}
                      >
                        <BrokenImageIcon fontSize="small" color="disabled" />
                      </Box>
                    )
                  })}
                </Stack>
              </Box>
            )}

            {weekSessionsLoading ? (
              <Typography color="text.secondary">Loading...</Typography>
            ) : weekSessions.length === 0 ? (
              <Stack spacing={1.5} alignItems="flex-start">
                <Typography color="text.secondary">
                  No sessions this week yet.{' '}
                  {hasProjects
                    ? 'Start a session from a project below.'
                    : 'Create a project to get started.'}
                </Typography>
                {canEdit && (
                  <Button variant="contained" size="small" onClick={handleSmartStart}>
                    Start Lab Session
                  </Button>
                )}
              </Stack>
            ) : (
              <Stack spacing={1}>
                {weekSessions.map((s) => {
                  const proj = s.projectId ? projectById[s.projectId] : null
                  const doneBits = s.stageDone ?? {}
                  const isCurrentProject = s.projectId === selectedProjectId

                  return (
                    <Card
                      key={s.id}
                      variant="outlined"
                      sx={{
                        borderColor: isCurrentProject ? 'primary.main' : undefined,
                        borderWidth: isCurrentProject ? 2 : 1,
                      }}
                    >
                      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Stack spacing={0.5}>
                          <Stack
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                            flexWrap="wrap"
                            spacing={1}
                          >
                            <Typography variant="subtitle2">
                              {proj?.title ?? 'Untitled Project'}
                            </Typography>
                            <Chip
                              label={statusLabel[s.status] ?? s.status}
                              color={statusColor[s.status] ?? 'default'}
                              size="small"
                            />
                          </Stack>

                          {s.dateKey && (
                            <Typography variant="caption" color="text.secondary">
                              {formatDateShort(s.dateKey)}
                            </Typography>
                          )}

                          {/* Stage completion chips + photo count */}
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" alignItems="center">
                            {LAB_STAGES.map((stage) => (
                              <Chip
                                key={stage}
                                label={stage}
                                size="small"
                                variant={doneBits[stage] ? 'filled' : 'outlined'}
                                color={doneBits[stage] ? 'success' : 'default'}
                                sx={{ fontSize: '0.7rem', height: 22 }}
                              />
                            ))}
                            {s.id && (sessionPhotoCount[s.id] ?? 0) > 0 && (
                              <Chip
                                icon={<PhotoCameraIcon sx={{ fontSize: 14 }} />}
                                label={sessionPhotoCount[s.id!]}
                                size="small"
                                variant="outlined"
                                sx={{ fontSize: '0.7rem', height: 22, ml: 0.5 }}
                              />
                            )}
                          </Stack>

                          <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                            {s.status !== LabSessionStatus.Complete && (
                              <Button
                                variant="contained"
                                size="small"
                                onClick={() => handleContinueSession(s)}
                              >
                                Continue Session
                              </Button>
                            )}
                            {s.status === LabSessionStatus.Complete && (
                              <Button
                                variant="outlined"
                                size="small"
                                onClick={() => {
                                  if (s.projectId) setSelectedProjectId(s.projectId)
                                }}
                              >
                                View
                              </Button>
                            )}
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  )
                })}
              </Stack>
            )}
          </SectionCard>
        )}

        {/* ═══ Section 2: Projects ═══ */}
        {isReady && (
          <div ref={projectsSectionRef}>
            <SectionCard title="Projects">
              {!hasProjects && !showArchived ? (
                <Stack spacing={2} alignItems="flex-start">
                  <Typography color="text.secondary">
                    No active projects yet. Create a project to get started.
                  </Typography>
                  <Button
                    variant="contained"
                    onClick={() => setShowNewProjectDialog(true)}
                  >
                    New Project
                  </Button>
                </Stack>
              ) : (
                <Stack spacing={1.5}>
                  {archivedProjects.length > 0 && (
                    <ToggleButtonGroup
                      value={showArchived ? 'archived' : 'active'}
                      exclusive
                      onChange={(_e, val) => { if (val) setShowArchived(val === 'archived') }}
                      size="small"
                    >
                      <ToggleButton value="active">Active ({childProjects.length})</ToggleButton>
                      <ToggleButton value="archived">Archived ({archivedProjects.length})</ToggleButton>
                    </ToggleButtonGroup>
                  )}

                  {!showArchived && childProjects.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      isSelected={p.id === selectedProjectId}
                      canEdit={canEdit}
                      onStartSession={handleStartSession}
                      onOpenNotes={handleOpenNotes}
                      onOpenMenu={handleOpenMenu}
                    />
                  ))}

                  {showArchived && archivedProjects.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      isSelected={false}
                      canEdit={canEdit}
                      archived
                      onStartSession={handleStartSession}
                      onOpenNotes={handleOpenNotes}
                      onOpenMenu={handleOpenMenu}
                      onUnarchive={handleUnarchive}
                    />
                  ))}

                  {showArchived && archivedProjects.length === 0 && (
                    <Typography color="text.secondary">No archived projects.</Typography>
                  )}

                  {!showArchived && (
                    <Button
                      variant="outlined"
                      onClick={() => setShowNewProjectDialog(true)}
                      sx={{ alignSelf: 'flex-start' }}
                    >
                      New Project
                    </Button>
                  )}
                </Stack>
              )}
            </SectionCard>
          </div>
        )}

        {/* ── Project overflow menu ──────────────────── */}
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => { setMenuAnchor(null); setMenuProjectId(null) }}
        >
          {(() => {
            const mp = menuProjectId ? projects.find((p) => p.id === menuProjectId) : null
            const eligible = mp ? canDeleteProject(mp.id!) : false
            const hasSessions = mp ? projectHasSessions(mp.id!) : false
            return [
              <MenuItem
                key="rename"
                onClick={() => { if (menuProjectId) handleRenameOpen(menuProjectId) }}
              >
                <EditIcon fontSize="small" sx={{ mr: 1 }} />
                Rename
              </MenuItem>,
              <MenuItem
                key="archive"
                onClick={() => { if (menuProjectId) handleArchive(menuProjectId) }}
              >
                <ArchiveIcon fontSize="small" sx={{ mr: 1 }} />
                Archive
              </MenuItem>,
              eligible ? (
                <MenuItem
                  key="delete"
                  onClick={() => { if (menuProjectId) handleDeleteRequest(menuProjectId) }}
                  sx={{ color: 'error.main' }}
                >
                  Delete
                </MenuItem>
              ) : (
                <MenuItem key="delete" disabled>
                  <Typography variant="body2" color="text.disabled">
                    {hasSessions
                      ? "Can't delete \u2014 sessions exist"
                      : mp?.phase !== 'Plan'
                        ? "Can't delete \u2014 not in Plan phase"
                        : "Can't delete"}
                  </Typography>
                </MenuItem>
              ),
            ]
          })()}
        </Menu>

        {/* ═══ Section 3: Active Lab Session Detail ═══ */}
        {isReady && hasProjects && selectedProject && (
          <div key={`${selectedChildId}_${weekKey}_${selectedProjectId}`}>
            <SectionCard title={`${selectedProject.title} — Session`}>
              {labLoading ? (
                <Typography color="text.secondary">Loading...</Typography>
              ) : labSession ? (
                <Stack spacing={1.5}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    flexWrap="wrap"
                    spacing={1}
                  >
                    <Stack spacing={0.25}>
                      <Typography variant="subtitle2">
                        {selectedProject.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Phase: {selectedProject.phase} &middot; {labSession.dateKey ? formatDateShort(labSession.dateKey) : formatWeekShort(weekKey)}
                      </Typography>
                    </Stack>
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

                  {labSession.status === LabSessionStatus.InProgress && (
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      <Button
                        variant="contained"
                        color="success"
                        size="small"
                        onClick={handleFinishSessionOpen}
                      >
                        Finish Session
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<PhotoCameraIcon />}
                        onClick={() => {
                          const currentStage = labSession.stage
                          setInlinePhotoStage(currentStage)
                          setCaptureStage(null)
                          labSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }}
                      >
                        Add Photo
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => {
                          const currentStage = labSession.stage
                          handleStageSelect(currentStage)
                          labSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }}
                      >
                        Quick Note
                      </Button>
                    </Stack>
                  )}
                </Stack>
              ) : (
                <Stack spacing={1.5} alignItems="flex-start">
                  <Typography color="text.secondary">
                    No session yet this week for {selectedProject.title}.
                  </Typography>
                  <Button
                    variant="contained"
                    size="large"
                    onClick={() => handleStartSession(selectedProject.id!)}
                  >
                    Start a Lab Session
                  </Button>
                </Stack>
              )}
            </SectionCard>

            {/* ── Lab Stage Cards ──────────────────────── */}
            {labSession && (
              <div ref={labSectionRef} style={{ marginTop: 16 }}>
                <SectionCard title="Lab Stages">
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
                        const stageArts = artifactsByStage[stage] ?? []
                        const stagePhotos = stageArts.filter((a) => a.type === EvidenceType.Photo)

                        return (
                          <StagePanel
                            key={stage}
                            stage={stage}
                            stageIndex={idx}
                            currentStage={labSession.stage}
                            isDone={labSession.stageDone?.[stage] ?? false}
                            notes={labSession.stageNotes?.[stage] ?? ''}
                            stagePhotos={stagePhotos}
                            artifactUrls={artifactUrls}
                            inlinePhotoActive={inlinePhotoStage === stage}
                            mediaUploading={mediaUploading}
                            onNotesChange={handleStageNotes}
                            onMarkDone={handleStageDone}
                            onAdvanceStage={handleStageAdvance}
                            onCaptureArtifact={handleStageSelect}
                            onInlinePhotoStart={(s) => {
                              setInlinePhotoStage(s)
                              setCaptureStage(null)
                            }}
                            onInlinePhotoCancel={() => setInlinePhotoStage(null)}
                            onPhotoCapture={handlePhotoCapture}
                            onViewPhoto={(url) => setViewPhotoUrl(url)}
                          />
                        )
                      })}
                    </Stack>

                    {labSession.status !== LabSessionStatus.Complete && (
                      <Button
                        variant="contained"
                        color="success"
                        onClick={handleFinishSessionOpen}
                      >
                        Finish Session
                      </Button>
                    )}
                  </Stack>
                </SectionCard>
              </div>
            )}

            {/* ── Artifact Capture Form ───────────────── */}
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
          </div>
        )}
      </Stack>

      {/* ── New Project Dialog ───────────────────────── */}
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
            onClick={handleCreateAndClose}
            disabled={!newProjectTitle.trim() || projectSaving}
          >
            {projectSaving ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Project Notes Dialog ─────────────────────── */}
      <Dialog
        open={showProjectNotesDialog}
        onClose={() => setShowProjectNotesDialog(false)}
        maxWidth="md"
        fullWidth
      >
        {notesProject && (
          <>
            <DialogTitle>{notesProject.title}</DialogTitle>
            <DialogContent>
              <Tabs value={notesTab} onChange={(_e, v) => setNotesTab(v)} sx={{ mb: 2 }}>
                <Tab label="Phase Notes" />
                <Tab label="Session Log" />
              </Tabs>

              {/* ── Tab 0: Phase Notes ────────────────── */}
              {notesTab === 0 && (
                <Stack spacing={3}>
                  <Stepper
                    activeStep={projectPhaseIndex(notesProject.phase)}
                    alternativeLabel
                  >
                    {PROJECT_PHASES.map((phase) => (
                      <Step key={phase}>
                        <StepLabel>{phase}</StepLabel>
                      </Step>
                    ))}
                  </Stepper>

                  <TextField
                    label="Plan notes"
                    multiline
                    minRows={2}
                    value={notesProject.planNotes ?? ''}
                    onChange={(e) => {
                      const val = e.target.value
                      setProjects((prev) =>
                        prev.map((p) => (p.id === notesProject.id ? { ...p, planNotes: val } : p)),
                      )
                    }}
                    onBlur={(e) => handleProjectFieldSave('planNotes', e.target.value, notesProject.id)}
                    fullWidth
                    slotProps={{ input: { readOnly: !canEdit } }}
                  />
                  <TextField
                    label="Build notes"
                    multiline
                    minRows={2}
                    value={notesProject.buildNotes ?? ''}
                    onChange={(e) => {
                      const val = e.target.value
                      setProjects((prev) =>
                        prev.map((p) => (p.id === notesProject.id ? { ...p, buildNotes: val } : p)),
                      )
                    }}
                    onBlur={(e) => handleProjectFieldSave('buildNotes', e.target.value, notesProject.id)}
                    fullWidth
                    slotProps={{ input: { readOnly: !canEdit } }}
                  />
                  <TextField
                    label="Test notes"
                    multiline
                    minRows={2}
                    value={notesProject.testNotes ?? ''}
                    onChange={(e) => {
                      const val = e.target.value
                      setProjects((prev) =>
                        prev.map((p) => (p.id === notesProject.id ? { ...p, testNotes: val } : p)),
                      )
                    }}
                    onBlur={(e) => handleProjectFieldSave('testNotes', e.target.value, notesProject.id)}
                    fullWidth
                    slotProps={{ input: { readOnly: !canEdit } }}
                  />
                  <TextField
                    label="Improve notes"
                    multiline
                    minRows={2}
                    value={notesProject.improveNotes ?? ''}
                    onChange={(e) => {
                      const val = e.target.value
                      setProjects((prev) =>
                        prev.map((p) => (p.id === notesProject.id ? { ...p, improveNotes: val } : p)),
                      )
                    }}
                    onBlur={(e) => handleProjectFieldSave('improveNotes', e.target.value, notesProject.id)}
                    fullWidth
                    slotProps={{ input: { readOnly: !canEdit } }}
                  />
                  <TextField
                    label="What changed?"
                    multiline
                    minRows={2}
                    placeholder="What did you change between versions?"
                    value={notesProject.whatChanged ?? ''}
                    onChange={(e) => {
                      const val = e.target.value
                      setProjects((prev) =>
                        prev.map((p) => (p.id === notesProject.id ? { ...p, whatChanged: val } : p)),
                      )
                    }}
                    onBlur={(e) => handleProjectFieldSave('whatChanged', e.target.value, notesProject.id)}
                    fullWidth
                    slotProps={{ input: { readOnly: !canEdit } }}
                  />
                  <TextField
                    label="Teach-back"
                    multiline
                    minRows={2}
                    placeholder="Explain the project to someone else."
                    value={notesProject.teachBack ?? ''}
                    onChange={(e) => {
                      const val = e.target.value
                      setProjects((prev) =>
                        prev.map((p) => (p.id === notesProject.id ? { ...p, teachBack: val } : p)),
                      )
                    }}
                    onBlur={(e) => handleProjectFieldSave('teachBack', e.target.value, notesProject.id)}
                    fullWidth
                    slotProps={{ input: { readOnly: !canEdit } }}
                  />
                </Stack>
              )}

              {/* ── Tab 1: Session Log ────────────────── */}
              {notesTab === 1 && (
                <Stack spacing={2}>
                  {(notesProject.sessionLog ?? []).length === 0 ? (
                    <Typography color="text.secondary">
                      No sessions completed yet. Complete a session to see entries here.
                    </Typography>
                  ) : (
                    (notesProject.sessionLog ?? []).map((entry, idx) => (
                      <Card key={idx} variant="outlined">
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                          <Stack spacing={0.5}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                              <Typography variant="subtitle2">
                                {formatDateShort(entry.dateKey)}
                              </Typography>
                              {entry.artifactCount > 0 && (
                                <Chip
                                  icon={<PhotoCameraIcon sx={{ fontSize: 14 }} />}
                                  label={entry.artifactCount}
                                  size="small"
                                  variant="outlined"
                                />
                              )}
                            </Stack>
                            <Typography variant="body2">{entry.summary}</Typography>
                            {entry.whatChanged && (
                              <>
                                <Divider />
                                <Typography variant="caption" color="text.secondary">
                                  What changed: {entry.whatChanged}
                                </Typography>
                              </>
                            )}
                          </Stack>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </Stack>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setShowProjectNotesDialog(false)}>Close</Button>
              {canEdit && notesTab === 0 && projectPhaseIndex(notesProject.phase) < PROJECT_PHASES.length - 1 && (
                <Button variant="outlined" onClick={() => handleAdvancePhase(notesProject.id)}>
                  Next Phase: {PROJECT_PHASES[projectPhaseIndex(notesProject.phase) + 1]}
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* ── Photo viewer dialog ──────────────────────── */}
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

      {/* ── Delete confirmation dialog ──────────────── */}
      <Dialog
        open={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setDeleteTargetId(null) }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          Delete &ldquo;{projects.find((p) => p.id === projectsHook.deleteTargetId)?.title ?? 'project'}&rdquo;?
        </DialogTitle>
        <DialogContent>
          <Typography>
            This cannot be undone. Delete is only available for projects in the Plan phase with no sessions.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setShowDeleteConfirm(false); setDeleteTargetId(null) }}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Undo delete snackbar ─────────────────────── */}
      <Snackbar
        open={showUndoSnackbar}
        autoHideDuration={10000}
        onClose={() => { setShowUndoSnackbar(false); setUndoProject(null) }}
        message={`Deleted "${undoProject?.title ?? 'project'}"`}
        action={
          <Button color="inherit" size="small" onClick={handleUndoDelete}>
            Undo
          </Button>
        }
      />

      {/* ── Finish Session Dialog ──────────────────────────── */}
      <Dialog
        open={showFinishDialog}
        onClose={() => setShowFinishDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Finish Session</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="What changed for next time?"
              multiline
              minRows={2}
              value={finishWhatChanged}
              onChange={(e) => setFinishWhatChanged(e.target.value)}
              fullWidth
            />
            <TextField
              label="Next step (Plan)?"
              multiline
              minRows={2}
              value={finishNextStep}
              onChange={(e) => setFinishNextStep(e.target.value)}
              fullWidth
            />
            <TextField
              label="Update project phase (optional)"
              select
              fullWidth
              size="small"
              value={finishPhaseUpdate}
              onChange={(e) => setFinishPhaseUpdate(e.target.value as ProjectPhaseType)}
            >
              {PROJECT_PHASES.map((phase) => (
                <MenuItem key={phase} value={phase}>{phase}</MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowFinishDialog(false)}>Cancel</Button>
          <Button variant="contained" color="success" onClick={handleFinishSessionConfirm}>
            Complete Session
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Rename Project Dialog ──────────────────────────── */}
      <Dialog
        open={showRenameDialog}
        onClose={() => setShowRenameDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Rename Project</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Project title"
            fullWidth
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowRenameDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleRenameConfirm}
            disabled={!renameTitle.trim()}
          >
            Rename
          </Button>
        </DialogActions>
      </Dialog>
    </Page>
  )
}
