import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import BrokenImageIcon from '@mui/icons-material/BrokenImage'
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
  ladderProgressCollection,
  ladderProgressDocId,
} from '../../core/firebase/firestore'
import { storage } from '../../core/firebase/storage'
import {
  generateFilename,
  uploadArtifactFile,
} from '../../core/firebase/upload'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { Artifact, LadderCardDefinition } from '../../core/types/domain'
import {
  EngineStage,
  EvidenceType,
  LabSessionStatus,
  LearningLocation,
  SessionSymbol,
  SubjectBucket,
  SupportLevel,
} from '../../core/types/enums'
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
  // Try default path pattern
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

export default function LabModePage() {
  const [searchParams] = useSearchParams()
  const weekParam = searchParams.get('week')
  const weekRange = useMemo(() => {
    if (weekParam && parseDateYmd(weekParam)) return getWeekRange(parseDateYmd(weekParam)!)
    return getWeekRange(new Date())
  }, [weekParam])
  const weekKey = weekRange.start

  const familyId = useFamilyId()
  const {
    children,
    activeChildId: selectedChildId,
    setActiveChildId,
    activeChild,
    isLoading: childrenLoading,
    addChild,
  } = useActiveChild()

  // Lab session hook — re-subscribes on child/week change
  const { labSession, isLoading: labLoading, startOrContinue, updateSession } =
    useLabSession(selectedChildId, weekKey)

  // Ref for scrolling to the lab session section
  const labSectionRef = useRef<HTMLDivElement>(null)

  // Ladder definitions for the active child (for artifact → ladder linking)
  const childLadders: LadderCardDefinition[] = useMemo(
    () => activeChild ? getLaddersForChild(activeChild.name) ?? [] : [],
    [activeChild],
  )

  // Session photo artifacts
  const [sessionPhotos, setSessionPhotos] = useState<Array<{ url: string | null; id: string }>>([])
  const [photoCount, setPhotoCount] = useState(0)

  // Load photo artifacts linked to the active lab session
  const sessionDocId = labSession?.id ?? (selectedChildId && weekKey
    ? labSessionDocId(weekKey, selectedChildId)
    : null)

  useEffect(() => {
    if (!familyId || !selectedChildId || !sessionDocId) {
      setSessionPhotos([])
      setPhotoCount(0)
      return
    }

    let cancelled = false
    const load = async () => {
      try {
        // Query artifacts linked to this lab session
        const q = query(
          artifactsCollection(familyId),
          where('childId', '==', selectedChildId),
          where('labSessionId', '==', sessionDocId),
          where('type', '==', EvidenceType.Photo),
          orderBy('createdAt', 'desc'),
          limit(3),
        )
        const snap = await getDocs(q)
        if (cancelled) return

        const photos = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
        setPhotoCount(snap.size)

        // Resolve URLs defensively
        const resolved = await Promise.all(
          photos.map(async (p) => ({
            id: p.id,
            url: await resolvePhotoUrl(p, familyId),
          })),
        )
        if (!cancelled) setSessionPhotos(resolved)
      } catch (err) {
        console.error('Failed to load session photos', err)
        if (!cancelled) {
          setSessionPhotos([])
          setPhotoCount(0)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [familyId, selectedChildId, sessionDocId])

  // Artifact capture state — keyed by child+week to reset on switch
  const [selectedStage, setSelectedStage] = useState<EngineStage | null>(null)
  const [mediaUploading, setMediaUploading] = useState(false)
  const [artifactForm, setArtifactForm] = useState<ArtifactFormState>(() =>
    defaultFormState(EngineStage.Wonder, selectedChildId),
  )

  const handleStageSelect = useCallback((stage: EngineStage) => {
    setSelectedStage(stage)
    setArtifactForm((prev) => defaultFormState(stage, prev.childId))
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
      setSelectedStage(null)
    },
    [setActiveChildId],
  )

  const buildBase = useCallback(
    (title: string, evidenceType: EvidenceType) => {
      const createdAt = new Date().toISOString()
      const dayLogId = createdAt.slice(0, 10)
      return {
        title,
        type: evidenceType,
        createdAt,
        childId: artifactForm.childId || selectedChildId,
        dayLogId,
        tags: {
          engineStage: artifactForm.engineStage,
          domain: artifactForm.domain,
          subjectBucket: artifactForm.subjectBucket,
          location: artifactForm.location,
          ...(artifactForm.ladderKey && artifactForm.rungId ? {
            ladderRef: { ladderId: artifactForm.ladderKey, rungId: artifactForm.rungId },
          } : {}),
        },
        notes: '',
        // Link to active lab session if present
        ...(sessionDocId ? {
          labSessionId: sessionDocId,
          labStage: artifactForm.engineStage,
        } : {}),
      }
    },
    [artifactForm, selectedChildId, sessionDocId],
  )

  /** After saving an artifact with a ladder selection, also log a ladder session. */
  const logLadderSessionForArtifact = useCallback(
    async (artifactId: string) => {
      if (!artifactForm.ladderKey || !artifactForm.rungId || !selectedChildId || !familyId) return
      const ladder = childLadders.find((l) => l.ladderKey === artifactForm.ladderKey)
      if (!ladder) return

      // Load or create progress
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

      // Apply a Pass session at current support level
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
    const content = artifactForm.content.trim()
    const domain = artifactForm.domain.trim()
    const title =
      content.slice(0, 60) ||
      domain ||
      `${artifactForm.engineStage} Lab Note`

    const docRef = await addDoc(artifactsCollection(familyId), {
      ...buildBase(title, EvidenceType.Note),
      content: artifactForm.content,
    })

    await logLadderSessionForArtifact(docRef.id)

    setSelectedStage(null)
    setArtifactForm((prev) => defaultFormState(EngineStage.Wonder, prev.childId))
  }, [artifactForm, buildBase, familyId, logLadderSessionForArtifact])

  const handlePhotoCapture = useCallback(
    async (file: File) => {
      setMediaUploading(true)
      try {
        const domain = artifactForm.domain.trim()
        const title = domain || `${artifactForm.engineStage} Lab Photo`
        const artifact = buildBase(title, EvidenceType.Photo)
        const docRef = await addDoc(artifactsCollection(familyId), artifact)
        const ext = file.name.split('.').pop() ?? 'jpg'
        const filename = generateFilename(ext)
        const { downloadUrl, storagePath } = await uploadArtifactFile(familyId, docRef.id, file, filename)
        await updateDoc(doc(artifactsCollection(familyId), docRef.id), {
          uri: downloadUrl,
          storagePath,
        })
        await logLadderSessionForArtifact(docRef.id)
        setSelectedStage(null)
        setArtifactForm((prev) => defaultFormState(EngineStage.Wonder, prev.childId))
        // Refresh photo strip
        if (sessionDocId) {
          setSessionPhotos((prev) => [{ url: downloadUrl, id: docRef.id }, ...prev.slice(0, 2)])
          setPhotoCount((prev) => prev + 1)
        }
      } finally {
        setMediaUploading(false)
      }
    },
    [artifactForm, buildBase, familyId, sessionDocId, logLadderSessionForArtifact],
  )

  const handleAudioCapture = useCallback(
    async (blob: Blob) => {
      setMediaUploading(true)
      try {
        const domain = artifactForm.domain.trim()
        const title = domain || `${artifactForm.engineStage} Lab Audio`
        const artifact = buildBase(title, EvidenceType.Audio)
        const docRef = await addDoc(artifactsCollection(familyId), artifact)
        const filename = generateFilename('webm')
        const { downloadUrl, storagePath } = await uploadArtifactFile(familyId, docRef.id, blob, filename)
        await updateDoc(doc(artifactsCollection(familyId), docRef.id), {
          uri: downloadUrl,
          storagePath,
        })
        await logLadderSessionForArtifact(docRef.id)
        setSelectedStage(null)
        setArtifactForm((prev) => defaultFormState(EngineStage.Wonder, prev.childId))
      } finally {
        setMediaUploading(false)
      }
    },
    [artifactForm, buildBase, familyId, logLadderSessionForArtifact],
  )

  const handleStartOrContinue = useCallback(async () => {
    await startOrContinue()
    // Scroll to the lab session section after a short delay for DOM update
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

  const handleMarkComplete = useCallback(async () => {
    await updateSession({ status: LabSessionStatus.Complete })
  }, [updateSession])

  const handleMissionSave = useCallback(
    async (mission: string) => {
      await updateSession({ mission })
    },
    [updateSession],
  )

  const handleConstraintsSave = useCallback(
    async (constraints: string) => {
      await updateSession({ constraints })
    },
    [updateSession],
  )

  const handleRolesSave = useCallback(
    async (roles: string) => {
      await updateSession({ roles })
    },
    [updateSession],
  )

  const stageButtons = useMemo(
    () =>
      Object.values(EngineStage).map((stage) => (
        <Button
          key={stage}
          variant="contained"
          size="large"
          onClick={() => handleStageSelect(stage)}
          sx={{ height: 72, fontSize: '1.2rem' }}
        >
          {stage}
        </Button>
      )),
    [handleStageSelect],
  )

  const isReady = !childrenLoading && !labLoading && selectedChildId

  return (
    <Page>
      <ContextBar
        page="dadLab"
        activeChild={activeChild}
        weekStart={weekRange.start}
      />
      <HelpStrip
        pageKey="dadLab"
        text="Weekly experiment + reflection. Uses Daily Logs + Artifacts."
      />
      <Stack spacing={2}>
        <ChildSelector
          children={children}
          selectedChildId={selectedChildId}
          onSelect={handleChildSelect}
          onChildAdded={addChild}
          isLoading={childrenLoading}
        />

        {/* Active Labs (This Week) — keyed by child+week for clean remount */}
        {isReady && (
          <div key={`${selectedChildId}_${weekKey}`}>
            <SectionCard title="This Week's Lab Sessions">
              {labSession ? (
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
                            Lab Session — Week of {formatWeekShort(weekKey)}
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

                        {/* Created date */}
                        {labSession.createdAt && (
                          <Typography variant="caption" color="text.secondary">
                            Started {formatDateShort(labSession.createdAt.slice(0, 10))}
                          </Typography>
                        )}

                        {/* Mission */}
                        <Typography variant="body2" color="text.secondary">
                          {labSession.mission || '(no mission yet)'}
                        </Typography>

                        {/* Photo strip */}
                        {(sessionPhotos.length > 0 || photoCount > 0) && (
                          <Stack direction="row" spacing={1} alignItems="center">
                            {sessionPhotos.map((photo) => (
                              photo.url ? (
                                <Box
                                  key={photo.id}
                                  component="img"
                                  src={photo.url}
                                  alt="Lab photo"
                                  sx={{
                                    width: 48,
                                    height: 48,
                                    objectFit: 'cover',
                                    borderRadius: 1,
                                    border: '1px solid',
                                    borderColor: 'divider',
                                  }}
                                />
                              ) : (
                                <Box
                                  key={photo.id}
                                  sx={{
                                    width: 48,
                                    height: 48,
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
                            ))}
                            {photoCount > 0 && (
                              <Typography variant="caption" color="text.secondary">
                                {photoCount} photo{photoCount !== 1 ? 's' : ''}
                              </Typography>
                            )}
                          </Stack>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>

                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="contained"
                      onClick={handleStartOrContinue}
                    >
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
                    No lab sessions yet. Start one below.
                  </Typography>
                  <Button variant="contained" size="large" onClick={handleStartOrContinue}>
                    Start Lab Session
                  </Button>
                </Stack>
              )}
            </SectionCard>

            {/* Lab Session Detail — shown when session exists */}
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
                        const isDone = idx < currentIdx
                        const notes = labSession.stageNotes?.[stage] ?? ''
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
                                  {isActive && <Chip label="Current" color="primary" size="small" />}
                                </Stack>
                                {(isActive || isDone) && (
                                  <TextField
                                    placeholder={`Notes for ${stage}...`}
                                    multiline
                                    minRows={2}
                                    value={notes}
                                    onChange={(e) => handleStageNotes(stage, e.target.value)}
                                    fullWidth
                                    size="small"
                                  />
                                )}
                                {isActive && (
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={() => handleStageSelect(stage)}
                                  >
                                    Capture {stage} Artifact
                                  </Button>
                                )}
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

            {/* Artifact Capture */}
            {selectedStage ? (
              <div style={{ marginTop: 16 }}>
                <SectionCard title={`Capture ${selectedStage} Artifact`}>
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
                            // Default rung to ladder's R0
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
                          <Button variant="outlined" onClick={() => setSelectedStage(null)}>
                            Cancel
                          </Button>
                        </Stack>
                      </>
                    )}
                    {artifactForm.evidenceType === EvidenceType.Photo && (
                      <Stack spacing={2}>
                        <PhotoCapture onCapture={handlePhotoCapture} uploading={mediaUploading} />
                        <Button variant="outlined" onClick={() => setSelectedStage(null)}>
                          Cancel
                        </Button>
                      </Stack>
                    )}
                    {artifactForm.evidenceType === EvidenceType.Audio && (
                      <Stack spacing={2}>
                        <AudioRecorder onCapture={handleAudioCapture} uploading={mediaUploading} />
                        <Button variant="outlined" onClick={() => setSelectedStage(null)}>
                          Cancel
                        </Button>
                      </Stack>
                    )}
                  </Stack>
                </SectionCard>
              </div>
            ) : (
              <div style={{ marginTop: 16 }}>
                <SectionCard title="Capture Artifact">
                  <Stack spacing={2}>
                    <Typography color="text.secondary">
                      Tap a stage to capture a quick artifact.
                    </Typography>
                    <Stack spacing={2}>{stageButtons}</Stack>
                  </Stack>
                </SectionCard>
              </div>
            )}
          </div>
        )}
      </Stack>
    </Page>
  )
}
