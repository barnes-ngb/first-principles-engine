import { useCallback, useMemo, useRef, useState } from 'react'
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
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'
import Stepper from '@mui/material/Stepper'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import ArchiveIcon from '@mui/icons-material/Archive'

import AudioRecorder from '../../components/AudioRecorder'
import ChildSelector from '../../components/ChildSelector'
import ContextBar from '../../components/ContextBar'
import HelpStrip from '../../components/HelpStrip'
import Page from '../../components/Page'
import PhotoCapture from '../../components/PhotoCapture'
import SectionCard from '../../components/SectionCard'
import { labSessionDocId } from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useProfile } from '../../core/profile/useProfile'
import type { LadderCardDefinition, LabSession } from '../../core/types/domain'
import {
  EngineStage,
  EvidenceType,
  LabSessionStatus,
  LearningLocation,
  ProjectPhase,
  SubjectBucket,
} from '../../core/types/enums'
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

  const handleMarkComplete = useCallback(async () => {
    await updateSession({ status: LabSessionStatus.Complete })
    refreshWeekSessions()
  }, [updateSession, refreshWeekSessions])

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
          <SectionCard title={`This Week's Lab Sessions`}>
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

                          <Stack direction="row" spacing={0.5} flexWrap="wrap">
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
                          </Stack>

                          <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                            {s.status !== LabSessionStatus.Complete && (
                              <Button
                                variant="contained"
                                size="small"
                                onClick={() => handleContinueSession(s)}
                              >
                                Continue
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
            const canDeleteMenu = mp && mp.phase === ProjectPhase.Plan && !projectHasSessions(mp.id!)
            return [
              <MenuItem
                key="archive"
                onClick={() => { if (menuProjectId) handleArchive(menuProjectId) }}
              >
                <ArchiveIcon fontSize="small" sx={{ mr: 1 }} />
                Archive
              </MenuItem>,
              canDeleteMenu ? (
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
                    {mp && projectHasSessions(mp.id!) ? "Can't delete — sessions exist" : "Can't delete — not in Plan phase"}
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
                    <Typography variant="subtitle2">
                      Week of {formatWeekShort(weekKey)}
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

                  {labSession.status === LabSessionStatus.InProgress && (
                    <Button
                      variant="outlined"
                      color="success"
                      size="small"
                      onClick={handleMarkComplete}
                      sx={{ alignSelf: 'flex-start' }}
                    >
                      Mark Complete
                    </Button>
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
                    Start Lab Session
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
                        onClick={handleMarkComplete}
                      >
                        Mark Lab Complete
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
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setShowProjectNotesDialog(false)}>Close</Button>
              {canEdit && projectPhaseIndex(notesProject.phase) < PROJECT_PHASES.length - 1 && (
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
        <DialogTitle>Delete project?</DialogTitle>
        <DialogContent>
          <Typography>
            This removes the project and any notes. This action can be undone for a short time afterward.
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
    </Page>
  )
}
