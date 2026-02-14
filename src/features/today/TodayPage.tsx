import { useCallback, useEffect, useMemo, useState } from 'react'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import ChecklistIcon from '@mui/icons-material/Checklist'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import FormControlLabel from '@mui/material/FormControlLabel'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import MenuItem from '@mui/material/MenuItem'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import {
  addDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'

import AudioRecorder from '../../components/AudioRecorder'
import ChildSelector from '../../components/ChildSelector'
import Page from '../../components/Page'
import PhotoCapture from '../../components/PhotoCapture'
import SaveIndicator from '../../components/SaveIndicator'
import type { SaveState } from '../../components/SaveIndicator'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import {
  artifactsCollection,
  daysCollection,
  laddersCollection,
  weeksCollection,
} from '../../core/firebase/firestore'
import {
  generateFilename,
  uploadArtifactFile,
} from '../../core/firebase/upload'
import { useProfile } from '../../core/profile/useProfile'
import type { Artifact, DayLog, Ladder } from '../../core/types/domain'
import {
  DayBlockType,
  EngineStage,
  EvidenceType,
  LearningLocation,
  SubjectBucket,
  UserProfile,
} from '../../core/types/enums'
import { useDebounce } from '../../lib/useDebounce'
import { getWeekRange } from '../engine/engine.logic'
import { blockMeta } from './blockMeta'
import { getTemplateForChild } from './dailyPlanTemplates'
import { createDefaultDayLog, dayLogDocId, legacyDayLogDocId } from './daylog.model'
import HelperPanel from './HelperPanel'
import RoutineSection from './RoutineSection'
import { calculateXp } from './xp'

export default function TodayPage() {
  const today = new Date().toISOString().slice(0, 10)
  const familyId = useFamilyId()
  const { profile } = useProfile()
  const isKidProfile =
    profile === UserProfile.Lincoln || profile === UserProfile.London
  const {
    children,
    activeChildId: selectedChildId,
    setActiveChildId: setSelectedChildId,
    isLoading: isLoadingChildren,
    addChild,
  } = useActiveChild()
  const currentDocId = useMemo(
    () => (selectedChildId ? dayLogDocId(today, selectedChildId) : ''),
    [selectedChildId, today],
  )
  const dayLogRef = useMemo(
    () => (currentDocId ? doc(daysCollection(familyId), currentDocId) : null),
    [familyId, currentDocId],
  )
  const [dayLog, setDayLog] = useState<DayLog | null>(null)
  const [todayArtifacts, setTodayArtifacts] = useState<Artifact[]>([])
  // Track which child the current dayLog belongs to; clear stale data on switch
  const [dayLogChildId, setDayLogChildId] = useState(selectedChildId)
  if (dayLogChildId !== selectedChildId) {
    setDayLogChildId(selectedChildId)
    setDayLog(null)
    setTodayArtifacts([])
  }
  const [ladders, setLadders] = useState<Ladder[]>([])
  const [weekPlanId, setWeekPlanId] = useState<string | undefined>()
  const [linkingArtifactId, setLinkingArtifactId] = useState<string | null>(null)
  const [linkingLadderId, setLinkingLadderId] = useState('')
  const [linkingRungId, setLinkingRungId] = useState('')
  const [mediaUploading, setMediaUploading] = useState(false)
  const [planType, setPlanType] = useState<'A' | 'B'>('A')
  const [showAllBlocks, setShowAllBlocks] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [snackMessage, setSnackMessage] = useState<{ text: string; severity: 'success' | 'error' } | null>(null)
  const [artifactForm, setArtifactForm] = useState({
    childId: selectedChildId,
    evidenceType: EvidenceType.Note as EvidenceType,
    engineStage: EngineStage.Wonder,
    subjectBucket: SubjectBucket.Reading,
    location: LearningLocation.Home,
    domain: '',
    content: '',
    ladderId: '',
    rungId: '',
  })

  // Keep artifact form childId in sync with active child
  useEffect(() => {
    setArtifactForm((prev) => ({ ...prev, childId: selectedChildId }))
  }, [selectedChildId])

  // Show a brief "Saved" snackbar on mobile after successful save
  useEffect(() => {
    if (saveState === 'saved') {
      setSnackMessage({ text: 'Saved', severity: 'success' })
      const timer = setTimeout(() => setSaveState('idle'), 2000)
      return () => clearTimeout(timer)
    }
  }, [saveState])

  const selectableChildren = children
  const selectedChild = useMemo(
    () => children.find((c) => c.id === selectedChildId),
    [children, selectedChildId],
  )

  // --- Persist helpers with save-state tracking ---

  const writeDayLog = useCallback(
    async (updated: DayLog) => {
      if (!dayLogRef || !selectedChildId) return
      // Ensure childId is always correct (defense in depth)
      const safeLog = updated.childId === selectedChildId
        ? updated
        : { ...updated, childId: selectedChildId }
      setSaveState('saving')
      try {
        await setDoc(dayLogRef, { ...safeLog, updatedAt: new Date().toISOString() })
        setSaveState('saved')
      } catch (err) {
        console.error('Failed to save day log', err)
        setSaveState('error')
      }
    },
    [dayLogRef, selectedChildId],
  )

  const debouncedWrite = useDebounce(writeDayLog, 800)

  const persistDayLog = useCallback(
    (updated: DayLog) => {
      setDayLog(updated)
      debouncedWrite(updated)
    },
    [debouncedWrite],
  )

  const persistDayLogImmediate = useCallback(
    (updated: DayLog) => {
      setDayLog(updated)
      void writeDayLog(updated)
    },
    [writeDayLog],
  )

  // --- Data loading ---

  // Load DayLog for selected child + date (real-time, with legacy migration)
  useEffect(() => {
    if (!selectedChildId || !dayLogRef) {
      setDayLog(null)
      return
    }
    let migratedOrCreated = false

    const unsubscribe = onSnapshot(
      dayLogRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          setDayLog(snapshot.data())
          return
        }

        // Doc doesn't exist — try legacy fallback / create default (once)
        if (migratedOrCreated) return
        migratedOrCreated = true

        try {
          // Backward compat: try legacy format {childId}_{date}
          const legacyId = legacyDayLogDocId(selectedChildId, today)
          const legacyRef = doc(daysCollection(familyId), legacyId)
          const legacySnap = await getDoc(legacyRef)
          if (legacySnap.exists()) {
            const legacyData = legacySnap.data()
            await setDoc(dayLogRef, { ...legacyData, updatedAt: new Date().toISOString() })
            // onSnapshot will fire again with the migrated doc
            return
          }

          // Also check bare date doc (oldest legacy — no childId in ID)
          const bareDateRef = doc(daysCollection(familyId), today)
          const bareDateSnap = await getDoc(bareDateRef)
          if (bareDateSnap.exists()) {
            const bareData = bareDateSnap.data()
            if (!bareData.childId || bareData.childId === selectedChildId) {
              const migrated = { ...bareData, childId: selectedChildId, updatedAt: new Date().toISOString() }
              await setDoc(dayLogRef, migrated)
              // onSnapshot will fire again
              return
            }
          }

          // No existing doc — create fresh
          const defaultLog = createDefaultDayLog(
            selectedChildId,
            today,
            selectedChild?.dayBlocks,
            selectedChild?.routineItems,
          )
          await setDoc(dayLogRef, defaultLog)
          // onSnapshot will fire again with the new doc
        } catch (err) {
          console.error('Failed to load day log', err)
          migratedOrCreated = false
          setSnackMessage({ text: 'Could not load today\u2019s log.', severity: 'error' })
        }
      },
      (err) => {
        console.error('Failed to load day log', err)
        setSnackMessage({ text: 'Could not load today\u2019s log.', severity: 'error' })
      },
    )

    return unsubscribe
  }, [dayLogRef, today, selectedChildId, selectedChild, familyId])

  // Load WeekPlan ID for current week (real-time)
  const weekRange = useMemo(() => getWeekRange(new Date()), [])

  useEffect(() => {
    const ref = doc(weeksCollection(familyId), weekRange.start)
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setWeekPlanId(snap.exists() ? snap.id : undefined)
      },
      (err) => {
        console.error('Failed to load week plan', err)
        setSnackMessage({ text: 'Could not load week plan.', severity: 'error' })
      },
    )
    return unsubscribe
  }, [familyId, weekRange.start])

  // Load ladders and artifacts (one-shot, non-plan data)
  useEffect(() => {
    let isMounted = true

    const loadLadders = async () => {
      try {
        const snapshot = await getDocs(laddersCollection(familyId))
        if (!isMounted) return
        const loadedLadders = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...(docSnapshot.data() as Ladder),
        }))
        setLadders(loadedLadders)
      } catch (err) {
        console.error('Failed to load ladders', err)
        if (isMounted) {
          setSnackMessage({ text: 'Could not load ladders.', severity: 'error' })
        }
      }
    }

    const loadArtifacts = async () => {
      try {
        const q = query(
          artifactsCollection(familyId),
          where('dayLogId', '==', today),
          where('childId', '==', selectedChildId),
        )
        const snapshot = await getDocs(q)
        if (!isMounted) return
        const loadedArtifacts = snapshot.docs
          .map((docSnapshot) => docSnapshot.data())
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        setTodayArtifacts(loadedArtifacts)
      } catch (err) {
        console.error('Failed to load artifacts', err)
        if (isMounted) {
          setSnackMessage({ text: 'Could not load artifacts.', severity: 'error' })
        }
      }
    }

    loadLadders()
    if (selectedChildId) loadArtifacts()

    return () => {
      isMounted = false
    }
  }, [familyId, today, selectedChildId])

  const selectedLadder = useMemo(
    () => ladders.find((ladder) => ladder.id === artifactForm.ladderId),
    [artifactForm.ladderId, ladders],
  )

  const linkingLadder = useMemo(
    () => ladders.find((ladder) => ladder.id === linkingLadderId),
    [ladders, linkingLadderId],
  )

  // --- Block field handlers ---

  const handleBlockFieldChange = useCallback(
    (index: number, field: keyof DayLog['blocks'][number], value: unknown) => {
      if (!dayLog) return
      const updatedBlocks = dayLog.blocks.map((block, blockIndex) =>
        blockIndex === index ? { ...block, [field]: value } : block,
      )
      const updated = { ...dayLog, blocks: updatedBlocks }
      // Debounce text fields; persist selects/numbers immediately
      if (field === 'notes') {
        persistDayLog(updated)
      } else {
        persistDayLogImmediate(updated)
      }
    },
    [dayLog, persistDayLog, persistDayLogImmediate],
  )

  const handleChecklistToggle = useCallback(
    (blockIndex: number, itemIndex: number) => {
      if (!dayLog) return
      const updatedBlocks = dayLog.blocks.map((block, currentIndex) => {
        if (currentIndex !== blockIndex || !block.checklist) {
          return block
        }
        const updatedChecklist = block.checklist.map((item, checklistIndex) =>
          checklistIndex === itemIndex
            ? { ...item, completed: !item.completed }
            : item,
        )
        return { ...block, checklist: updatedChecklist }
      })
      persistDayLogImmediate({ ...dayLog, blocks: updatedBlocks })
    },
    [dayLog, persistDayLogImmediate],
  )

  // --- Artifact handlers ---

  const handleArtifactChange = useCallback(
    (
      field: keyof typeof artifactForm,
      value: (typeof artifactForm)[keyof typeof artifactForm],
    ) => {
      setArtifactForm((prev) => ({ ...prev, [field]: value }))
    },
    [],
  )

  const buildArtifactBase = useCallback(
    (title: string, evidenceType: EvidenceType) => {
      const createdAt = new Date().toISOString()
      const ladderRef =
        artifactForm.ladderId && artifactForm.rungId
          ? { ladderId: artifactForm.ladderId, rungId: artifactForm.rungId }
          : undefined
      return {
        title,
        type: evidenceType,
        createdAt,
        childId: artifactForm.childId,
        dayLogId: today,
        weekPlanId,
        tags: {
          engineStage: artifactForm.engineStage,
          domain: artifactForm.domain,
          subjectBucket: artifactForm.subjectBucket,
          location: artifactForm.location,
          ...(ladderRef ? { ladderRef } : {}),
        },
        notes: '',
      }
    },
    [artifactForm, today, weekPlanId],
  )

  const handleArtifactSave = useCallback(async () => {
    const content = artifactForm.content.trim()
    const domain = artifactForm.domain.trim()
    const title =
      content.slice(0, 60) || domain || `Artifact for ${today}`

    const artifact = {
      ...buildArtifactBase(title, EvidenceType.Note),
      content: artifactForm.content,
    }

    try {
      const docRef = await addDoc(artifactsCollection(familyId), artifact)
      setTodayArtifacts((prev) => [{ ...artifact, id: docRef.id }, ...prev])
      setArtifactForm((prev) => ({ ...prev, domain: '', content: '' }))
      setSnackMessage({ text: 'Note saved.', severity: 'success' })
    } catch (err) {
      console.error('Failed to save artifact', err)
      setSnackMessage({ text: 'Failed to save note.', severity: 'error' })
    }
  }, [artifactForm, buildArtifactBase, familyId, today])

  const handlePhotoCapture = useCallback(
    async (file: File) => {
      setMediaUploading(true)
      try {
        const domain = artifactForm.domain.trim()
        const title = domain || `Photo ${today}`
        const artifact = buildArtifactBase(title, EvidenceType.Photo)
        const docRef = await addDoc(artifactsCollection(familyId), artifact)
        const ext = file.name.split('.').pop() ?? 'jpg'
        const filename = generateFilename(ext)
        const { downloadUrl } = await uploadArtifactFile(familyId, docRef.id, file, filename)
        await updateDoc(doc(artifactsCollection(familyId), docRef.id), { uri: downloadUrl })
        setTodayArtifacts((prev) => [
          { ...artifact, id: docRef.id, uri: downloadUrl },
          ...prev,
        ])
        setArtifactForm((prev) => ({ ...prev, domain: '' }))
        setSnackMessage({ text: 'Photo uploaded.', severity: 'success' })
      } catch (err) {
        console.error('Photo upload failed', err)
        setSnackMessage({ text: 'Photo upload failed.', severity: 'error' })
      } finally {
        setMediaUploading(false)
      }
    },
    [artifactForm, buildArtifactBase, familyId, today],
  )

  const handleAudioCapture = useCallback(
    async (blob: Blob) => {
      setMediaUploading(true)
      try {
        const domain = artifactForm.domain.trim()
        const title = domain || `Audio ${today}`
        const artifact = buildArtifactBase(title, EvidenceType.Audio)
        const docRef = await addDoc(artifactsCollection(familyId), artifact)
        const filename = generateFilename('webm')
        const { downloadUrl } = await uploadArtifactFile(familyId, docRef.id, blob, filename)
        await updateDoc(doc(artifactsCollection(familyId), docRef.id), { uri: downloadUrl })
        setTodayArtifacts((prev) => [
          { ...artifact, id: docRef.id, uri: downloadUrl },
          ...prev,
        ])
        setArtifactForm((prev) => ({ ...prev, domain: '' }))
        setSnackMessage({ text: 'Audio uploaded.', severity: 'success' })
      } catch (err) {
        console.error('Audio upload failed', err)
        setSnackMessage({ text: 'Audio upload failed.', severity: 'error' })
      } finally {
        setMediaUploading(false)
      }
    },
    [artifactForm, buildArtifactBase, familyId, today],
  )

  const handleStartLinking = useCallback((artifact: Artifact) => {
    setLinkingArtifactId(artifact.id ?? null)
    setLinkingLadderId(artifact.tags.ladderRef?.ladderId ?? '')
    setLinkingRungId(artifact.tags.ladderRef?.rungId ?? '')
  }, [])

  const handleLinkingLadderChange = useCallback((value: string) => {
    setLinkingLadderId(value)
    setLinkingRungId('')
  }, [])

  const handleLinkingRungChange = useCallback(
    async (value: string) => {
      setLinkingRungId(value)
      if (!linkingArtifactId || !linkingLadderId || !value) return
      try {
        await updateDoc(doc(artifactsCollection(familyId), linkingArtifactId), {
          'tags.ladderRef': { ladderId: linkingLadderId, rungId: value },
        })
        setTodayArtifacts((prev) =>
          prev.map((artifact) =>
            artifact.id === linkingArtifactId
              ? {
                  ...artifact,
                  tags: {
                    ...artifact.tags,
                    ladderRef: { ladderId: linkingLadderId, rungId: value },
                  },
                }
              : artifact,
          ),
        )
        setLinkingArtifactId(null)
        setLinkingLadderId('')
        setLinkingRungId('')
      } catch (err) {
        console.error('Failed to link artifact', err)
        setSnackMessage({ text: 'Failed to link artifact.', severity: 'error' })
      }
    },
    [familyId, linkingArtifactId, linkingLadderId],
  )

  const getArtifactLinkLabel = useCallback(
    (artifact: Artifact) => {
      const ladderRef = artifact.tags?.ladderRef
      if (!ladderRef) return 'Unlinked'
      const ladder = ladders.find((item) => item.id === ladderRef.ladderId)
      const rung = ladder?.rungs.find((item) => item.id === ladderRef.rungId)
      return `${ladder?.title ?? 'Ladder'} \u00b7 ${rung?.title ?? 'Rung'}`
    },
    [ladders],
  )

  // --- Loading state ---

  const handleRoutineUpdate = useCallback(
    (updated: DayLog) => {
      const withXp = { ...updated, xpTotal: calculateXp(updated) }
      persistDayLog(withXp)
    },
    [persistDayLog],
  )

  const handleRoutineUpdateImmediate = useCallback(
    (updated: DayLog) => {
      const withXp = { ...updated, xpTotal: calculateXp(updated) }
      persistDayLogImmediate(withXp)
    },
    [persistDayLogImmediate],
  )

  if (!dayLog) {
    return (
      <Page>
        <Typography variant="h4" component="h1">Today</Typography>
        {isKidProfile ? (
          <Typography variant="subtitle1" color="text.secondary">
            {selectedChild?.name ?? 'Loading...'}
          </Typography>
        ) : (
          <ChildSelector
            children={children}
            selectedChildId={selectedChildId}
            onSelect={setSelectedChildId}
            onChildAdded={addChild}
            isLoading={isLoadingChildren}
            emptyMessage="Add a child to start logging."
          />
        )}
        {selectedChildId && (
          <SectionCard title="DayLog">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <CircularProgress size={20} />
              <Typography color="text.secondary">Loading today&apos;s log...</Typography>
            </Box>
          </SectionCard>
        )}
      </Page>
    )
  }

  return (
    <Page>
      <Typography variant="h4" component="h1">Today</Typography>
      {isKidProfile ? (
        <Typography variant="subtitle1" color="text.secondary">
          {selectedChild?.name}
        </Typography>
      ) : (
        <ChildSelector
          children={children}
          selectedChildId={selectedChildId}
          onSelect={setSelectedChildId}
          onChildAdded={addChild}
          isLoading={isLoadingChildren}
          emptyMessage="Add a child to start logging."
        />
      )}

      <HelperPanel template={selectedChild ? getTemplateForChild(selectedChild.name) : undefined} />

      <RoutineSection
        key={`${selectedChildId}_${today}`}
        dayLog={dayLog}
        onUpdate={handleRoutineUpdate}
        onUpdateImmediate={handleRoutineUpdateImmediate}
        routineItems={selectedChild?.routineItems}
      />

      <SectionCard title={`DayLog (${dayLog.date})`}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography color="text.secondary" variant="body2">
            Capture today&apos;s highlights and reflections.
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <ToggleButtonGroup
              value={planType}
              exclusive
              size="small"
              onChange={(_e, value) => { if (value) setPlanType(value) }}
            >
              <ToggleButton value="A">Plan A</ToggleButton>
              <ToggleButton value="B">Plan B</ToggleButton>
            </ToggleButtonGroup>
            <SaveIndicator state={saveState} />
          </Stack>
        </Stack>
        <Stack spacing={1}>
          {dayLog.blocks
          .map((block, originalIndex) => ({ block, originalIndex }))
          .filter(({ block }) =>
            planType === 'B'
              ? block.type === DayBlockType.Reading || block.type === DayBlockType.Math
              : true,
          )
          .filter((_entry, filteredIndex) =>
            planType === 'A' ? showAllBlocks || filteredIndex < 4 : true,
          )
          .map(({ block, originalIndex: index }) => {
            const meta = blockMeta[block.type]
            const checklistDone = block.checklist?.filter((i) => i.completed).length ?? 0
            const checklistTotal = block.checklist?.length ?? 0
            const hasTime = block.actualMinutes != null || block.plannedMinutes != null
            return (
              <Accordion
                key={`${block.type}-${index}`}
                disableGutters
                sx={{
                  '&::before': { display: 'none' },
                  borderLeft: `4px solid ${meta.color}`,
                  borderRadius: 1,
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{ px: 2, py: 0.5 }}
                >
                  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: '100%' }}>
                    <Avatar
                      sx={{
                        bgcolor: `${meta.color}20`,
                        color: meta.color,
                        width: 40,
                        height: 40,
                      }}
                    >
                      {meta.icon}
                    </Avatar>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>
                      {meta.label}
                    </Typography>
                    {hasTime && (
                      <Chip
                        icon={<AccessTimeIcon />}
                        size="small"
                        label={
                          block.actualMinutes != null
                            ? `${block.actualMinutes}m`
                            : `${block.plannedMinutes ?? 0}m planned`
                        }
                        variant="outlined"
                        sx={{ borderColor: meta.color, color: meta.color }}
                      />
                    )}
                    {checklistTotal > 0 && (
                      <Chip
                        icon={<ChecklistIcon />}
                        size="small"
                        label={`${checklistDone}/${checklistTotal}`}
                        variant="outlined"
                        color={checklistDone === checklistTotal ? 'success' : 'default'}
                      />
                    )}
                  </Stack>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 2, pb: 2 }}>
                  <Stack spacing={2}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                      <TextField
                        label="Subject bucket"
                        select
                        fullWidth
                        size="small"
                        value={block.subjectBucket ?? ''}
                        onChange={(event) =>
                          handleBlockFieldChange(
                            index,
                            'subjectBucket',
                            event.target.value || undefined,
                          )
                        }
                      >
                        <MenuItem value="">Unassigned</MenuItem>
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
                        size="small"
                        value={block.location ?? ''}
                        onChange={(event) =>
                          handleBlockFieldChange(
                            index,
                            'location',
                            event.target.value || undefined,
                          )
                        }
                      >
                        <MenuItem value="">Unassigned</MenuItem>
                        {Object.values(LearningLocation).map((location) => (
                          <MenuItem key={location} value={location}>
                            {location}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Stack>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                      <TextField
                        label="Planned minutes"
                        type="number"
                        size="small"
                        value={block.plannedMinutes ?? ''}
                        onChange={(event) =>
                          handleBlockFieldChange(
                            index,
                            'plannedMinutes',
                            event.target.value === ''
                              ? undefined
                              : Number(event.target.value),
                          )
                        }
                      />
                      <TextField
                        label="Actual minutes"
                        type="number"
                        size="small"
                        value={block.actualMinutes ?? ''}
                        onChange={(event) =>
                          handleBlockFieldChange(
                            index,
                            'actualMinutes',
                            event.target.value === ''
                              ? undefined
                              : Number(event.target.value),
                          )
                        }
                      />
                    </Stack>
                    <TextField
                      label="Quick note"
                      multiline
                      minRows={2}
                      size="small"
                      value={block.notes ?? ''}
                      onChange={(event) =>
                        handleBlockFieldChange(index, 'notes', event.target.value)
                      }
                    />
                    {block.checklist && block.checklist.length > 0 ? (
                      <Stack spacing={0.5}>
                        {block.checklist.map((item, itemIndex) => (
                          <FormControlLabel
                            key={`${item.label}-${itemIndex}`}
                            control={
                              <Checkbox
                                checked={item.completed}
                                size="small"
                                onChange={() =>
                                  handleChecklistToggle(index, itemIndex)
                                }
                              />
                            }
                            label={
                              <Typography variant="body2">{item.label}</Typography>
                            }
                          />
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        No checklist items yet.
                      </Typography>
                    )}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            )
          })}
          {planType === 'A' && !showAllBlocks && dayLog.blocks.length > 4 && (
            <Button
              size="small"
              onClick={() => setShowAllBlocks(true)}
              sx={{ alignSelf: 'flex-start' }}
            >
              Show more ({dayLog.blocks.length - 4} more)
            </Button>
          )}
          {planType === 'A' && showAllBlocks && dayLog.blocks.length > 4 && (
            <Button
              size="small"
              onClick={() => setShowAllBlocks(false)}
              sx={{ alignSelf: 'flex-start' }}
            >
              Show less
            </Button>
          )}
        </Stack>
      </SectionCard>
      <SectionCard title="Capture Artifact">
        <Stack spacing={2}>
          <ToggleButtonGroup
            value={artifactForm.evidenceType}
            exclusive
            onChange={(_event, value) => {
              if (value) handleArtifactChange('evidenceType', value)
            }}
            fullWidth
            size="large"
          >
            <ToggleButton value={EvidenceType.Note}>Note</ToggleButton>
            <ToggleButton value={EvidenceType.Photo}>Photo</ToggleButton>
            <ToggleButton value={EvidenceType.Audio}>Audio</ToggleButton>
          </ToggleButtonGroup>
          <TextField
            label="Child"
            select
            value={artifactForm.childId}
            onChange={(event) => handleArtifactChange('childId', event.target.value)}
          >
            <MenuItem value="" disabled>
              Select child
            </MenuItem>
            {selectableChildren.map((child) => (
              <MenuItem key={child.id} value={child.id}>
                {child.name}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="Engine stage"
              select
              fullWidth
              value={artifactForm.engineStage}
              onChange={(event) =>
                handleArtifactChange('engineStage', event.target.value as EngineStage)
              }
            >
              {Object.values(EngineStage).map((stage) => (
                <MenuItem key={stage} value={stage}>
                  {stage}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Subject bucket"
              select
              fullWidth
              value={artifactForm.subjectBucket}
              onChange={(event) =>
                handleArtifactChange(
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
                handleArtifactChange(
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
            onChange={(event) => handleArtifactChange('domain', event.target.value)}
          />
          <TextField
            label="Ladder"
            select
            value={artifactForm.ladderId}
            onChange={(event) => {
              const ladderId = event.target.value
              setArtifactForm((prev) => ({
                ...prev,
                ladderId,
                rungId: '',
              }))
            }}
          >
            <MenuItem value="">No ladder</MenuItem>
            {ladders.map((ladder) => (
              <MenuItem key={ladder.id} value={ladder.id}>
                {ladder.title}
              </MenuItem>
            ))}
          </TextField>
          {selectedLadder && selectedLadder.rungs.length > 0 && (
            <TextField
              label="Rung"
              select
              value={artifactForm.rungId}
              onChange={(event) =>
                handleArtifactChange('rungId', event.target.value)
              }
            >
              <MenuItem value="">Select rung</MenuItem>
              {selectedLadder.rungs
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((rung) => (
                  <MenuItem
                    key={rung.id ?? rung.title}
                    value={rung.id ?? rung.title}
                  >
                    {rung.title}
                  </MenuItem>
                ))}
            </TextField>
          )}
          {artifactForm.evidenceType === EvidenceType.Note && (
            <>
              <TextField
                label="Content"
                multiline
                minRows={3}
                value={artifactForm.content}
                onChange={(event) => handleArtifactChange('content', event.target.value)}
              />
              <Button variant="contained" onClick={handleArtifactSave}>
                Save Note
              </Button>
            </>
          )}
          {artifactForm.evidenceType === EvidenceType.Photo && (
            <PhotoCapture onCapture={handlePhotoCapture} uploading={mediaUploading} />
          )}
          {artifactForm.evidenceType === EvidenceType.Audio && (
            <AudioRecorder onCapture={handleAudioCapture} uploading={mediaUploading} />
          )}
        </Stack>
      </SectionCard>
      <SectionCard title="Artifacts">
        <Stack spacing={2}>
          {todayArtifacts.length === 0 ? (
            <Typography color="text.secondary">
              No artifacts logged yet today.
            </Typography>
          ) : (
            <List dense>
              {todayArtifacts.map((artifact) => (
                <ListItem key={artifact.id ?? artifact.title} disableGutters>
                  <Stack spacing={1} sx={{ width: '100%' }}>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      justifyContent="space-between"
                    >
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1 }}>
                        <Typography variant="body2">
                          {artifact.title}
                        </Typography>
                        <Chip size="small" label={artifact.type} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {getArtifactLinkLabel(artifact)}
                      </Typography>
                    </Stack>
                    {artifact.type === EvidenceType.Photo && artifact.uri && (
                      <Box
                        component="img"
                        src={artifact.uri}
                        alt={artifact.title}
                        sx={{
                          width: '100%',
                          maxHeight: 180,
                          objectFit: 'contain',
                          borderRadius: 1,
                          border: '1px solid',
                          borderColor: 'divider',
                        }}
                      />
                    )}
                    {artifact.type === EvidenceType.Audio && artifact.uri && (
                      <Box component="audio" controls src={artifact.uri} sx={{ width: '100%' }} />
                    )}
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleStartLinking(artifact)}
                      disabled={!artifact.id}
                      sx={{ alignSelf: 'flex-start' }}
                    >
                      Link to rung
                    </Button>
                    {linkingArtifactId === artifact.id && (
                      <Stack spacing={1}>
                        <TextField
                          label="Ladder"
                          select
                          size="small"
                          value={linkingLadderId}
                          onChange={(event) =>
                            handleLinkingLadderChange(event.target.value)
                          }
                        >
                          <MenuItem value="">Select ladder</MenuItem>
                          {ladders.map((ladder) => (
                            <MenuItem key={ladder.id} value={ladder.id}>
                              {ladder.title}
                            </MenuItem>
                          ))}
                        </TextField>
                        <TextField
                          label="Rung"
                          select
                          size="small"
                          disabled={!linkingLadder || linkingLadder.rungs.length === 0}
                          value={linkingRungId}
                          onChange={(event) =>
                            void handleLinkingRungChange(event.target.value)
                          }
                        >
                          <MenuItem value="">Select rung</MenuItem>
                          {linkingLadder?.rungs
                            .slice()
                            .sort((a, b) => a.order - b.order)
                            .map((rung) => (
                              <MenuItem
                                key={rung.id ?? rung.title}
                                value={rung.id ?? rung.title}
                              >
                                {rung.title}
                              </MenuItem>
                            ))}
                        </TextField>
                      </Stack>
                    )}
                  </Stack>
                </ListItem>
              ))}
            </List>
          )}
        </Stack>
      </SectionCard>

      <Snackbar
        open={snackMessage !== null}
        autoHideDuration={4000}
        onClose={() => setSnackMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackMessage(null)}
          severity={snackMessage?.severity ?? 'success'}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackMessage?.text}
        </Alert>
      </Snackbar>
    </Page>
  )
}
