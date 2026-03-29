import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import CheckIcon from '@mui/icons-material/Check'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import PrintIcon from '@mui/icons-material/Print'
import SchoolIcon from '@mui/icons-material/School'
import Accordion from '@mui/material/Accordion'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import MenuItem from '@mui/material/MenuItem'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import {
  addDoc,
  doc,
  getDoc,
  getDocs,
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
import SaveIndicator from '../../components/SaveIndicator'
import ScanButton from '../../components/ScanButton'
import ScanResultsPanel from '../../components/ScanResultsPanel'
import SectionCard from '../../components/SectionCard'
import { formatDateYmd, parseDateYmd } from '../../core/utils/format'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useAI, TaskType } from '../../core/ai/useAI'
import {
  artifactsCollection,
  skillSnapshotsCollection,
} from '../../core/firebase/firestore'
import {
  generateFilename,
  uploadArtifactFile,
} from '../../core/firebase/upload'
import { useProfile } from '../../core/profile/useProfile'
import type { Artifact, ChecklistItem as ChecklistItemType, DraftDayPlan, DraftPlanItem, LadderCardDefinition, SkillSnapshot } from '../../core/types'
import { getLaddersForChild } from '../ladders/laddersCatalog'
import TeachHelperDialog from '../planner/TeachHelperDialog'
import {
  EnergyLevel,
  EnergyLevelLabel,
  EngineStage,
  EvidenceType,
  LearningLocation,
  PlanType,
  PlanTypeLabel,
  SubjectBucket,
  UserProfile,
} from '../../core/types/enums'
import { getWeekRange } from '../../core/utils/time'
import { getTemplateForChild } from './dailyPlanTemplates'
import { autoFillBlockMinutes } from './daylog.model'
import HelperPanel from './HelperPanel'
import KidTodayView from './KidTodayView'
import { buildMaterialsPrompt, openPrintWindow } from '../planner-chat/generateMaterials'
import { useDailyPlan } from './useDailyPlan'
import { useDayLog } from './useDayLog'
import QuickAddHours from '../records/QuickAddHours'
import CreativeTimeLog from './CreativeTimeLog'
import WorkshopGameCards from './WorkshopGameCards'
import { syncChecklistToRoutine } from './checklistRoutineSync'
import { useScan } from '../../core/hooks/useScan'
import { calculateXp } from './xp'

const subjectBucketColor: Record<string, string> = {
  Reading: '#3b82f6',
  LanguageArts: '#8b5cf6',
  Math: '#10b981',
  Science: '#06b6d4',
  History: '#f59e0b',
  Art: '#ec4899',
  Music: '#a855f7',
  PE: '#f97316',
  Other: '#6b7280',
}

/** Infer a subject bucket from the item label when subjectBucket is not set. */
function inferSubjectBucket(label: string): string | undefined {
  const lower = label.toLowerCase()
  if (/\bread|reading eggs|phonics|book\b/.test(lower)) return 'Reading'
  if (/\bmath|addition|subtraction|multiply|division|arithmetic\b/.test(lower)) return 'Math'
  if (/\blanguage|grammar|writing|spelling|handwriting\b/.test(lower)) return 'LanguageArts'
  if (/\bscience|experiment|nature|biology\b/.test(lower)) return 'Science'
  if (/\bhistory|social studies|geography\b/.test(lower)) return 'History'
  if (/\bart|draw|paint|craft\b/.test(lower)) return 'Art'
  if (/\bmusic|piano|sing\b/.test(lower)) return 'Music'
  if (/\bpe|exercise|movement|run\b/.test(lower)) return 'PE'
  return undefined
}

/** Get color for a checklist item, using subjectBucket or inferring from label. */
function getItemColor(item: ChecklistItemType): string | undefined {
  const bucket = item.subjectBucket ?? inferSubjectBucket(item.label)
  return bucket ? (subjectBucketColor[bucket] ?? '#6b7280') : undefined
}

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatTime12h(date: Date): string {
  const h = date.getHours()
  const m = date.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

export default function TodayPage() {
  const [searchParams] = useSearchParams()
  const dateParam = searchParams.get('date')
  const initialDate = useMemo(() => {
    if (dateParam && parseDateYmd(dateParam)) return dateParam
    return formatDateYmd(new Date())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const today = selectedDate
  const realToday = useMemo(() => formatDateYmd(new Date()), [])
  const isToday = selectedDate === realToday

  const handlePrevDay = useCallback(() => {
    setSelectedDate((prev) => {
      const d = new Date(prev + 'T00:00:00')
      d.setDate(d.getDate() - 1)
      return formatDateYmd(d)
    })
  }, [])

  const handleNextDay = useCallback(() => {
    setSelectedDate((prev) => {
      const d = new Date(prev + 'T00:00:00')
      d.setDate(d.getDate() + 1)
      return formatDateYmd(d)
    })
  }, [])

  const handleGoToToday = useCallback(() => {
    setSelectedDate(formatDateYmd(new Date()))
  }, [])

  const selectedDayName = useMemo(
    () =>
      new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }),
    [selectedDate],
  )

  // Compute Mon-Fri dates for the week containing selectedDate
  const weekDayDates = useMemo(() => {
    const parsed = new Date(selectedDate + 'T00:00:00')
    const range = getWeekRange(parsed)
    const monday = new Date(range.start + 'T00:00:00')
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const
    return labels.map((label, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      return { label, dateKey: formatDateYmd(d) }
    })
  }, [selectedDate])

  const familyId = useFamilyId()
  const { profile } = useProfile()
  const isKidProfile =
    profile === UserProfile.Lincoln || profile === UserProfile.London
  const {
    children,
    activeChildId: selectedChildId,
    activeChild,
    setActiveChildId: setSelectedChildId,
    isLoading: isLoadingChildren,
    addChild,
  } = useActiveChild()
  const artifactSectionRef = useRef<HTMLDivElement>(null)

  const [todayArtifacts, setTodayArtifacts] = useState<Artifact[]>([])
  const [mediaUploading, setMediaUploading] = useState(false)
  const [energy, setEnergy] = useState<EnergyLevel>(EnergyLevel.Normal)
  const [planType, setPlanType] = useState<PlanType>(PlanType.Normal)
  const [teachHelperItem, setTeachHelperItem] = useState<ChecklistItemType | null>(null)
  const [teachHelperOpen, setTeachHelperOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState(false)
  const [printingMaterials, setPrintingMaterials] = useState(false)
  const [todaySnapshot, setTodaySnapshot] = useState<SkillSnapshot | null>(null)
  const [addingItem, setAddingItem] = useState(false)
  const { scan: runScan, recordAction: recordScanAction, scanResult, scanning: scanLoading, error: scanError, clearScan } = useScan()
  const [scanItemIndex, setScanItemIndex] = useState<number | null>(null)
  const [newItemTitle, setNewItemTitle] = useState('')
  const [newItemMinutes, setNewItemMinutes] = useState(15)
  const [newItemSubject, setNewItemSubject] = useState<SubjectBucket>(SubjectBucket.Other)
  // Per-item capture state
  const [captureItemIndex, setCaptureItemIndex] = useState<number | null>(null)
  const [captureNote, setCaptureNote] = useState('')
  // Grade/review state (Approach A — manual input)
  const [gradeNote, setGradeNote] = useState<{ index: number; text: string } | null>(null)
  // Teach-back state
  const [teachBackText, setTeachBackText] = useState('')
  const [teachBackSaved, setTeachBackSaved] = useState(false)

  const [artifactForm, setArtifactForm] = useState({
    childId: selectedChildId,
    evidenceType: EvidenceType.Note as EvidenceType,
    subjectBucket: SubjectBucket.Reading,
    content: '',
  })

  // Keep artifact form childId in sync with active child
  useEffect(() => {
    setArtifactForm((prev) => ({ ...prev, childId: selectedChildId }))
  }, [selectedChildId])

  const selectableChildren = children
  const selectedChild = activeChild

  // Resolve card-based ladders from the catalog for the active child
  const cardLadders: LadderCardDefinition[] = useMemo(
    () => (selectedChild ? getLaddersForChild(selectedChild.name) ?? [] : []),
    [selectedChild],
  )

  // Resolve the active template and routine items for the selected child.
  // Priority: child.routineItems (Firestore) → template.routineItems → undefined (all).
  const activeTemplate = useMemo(
    () => (selectedChild ? getTemplateForChild(selectedChild.name) : undefined),
    [selectedChild],
  )
  const activeRoutineItems = useMemo(
    () => selectedChild?.routineItems ?? activeTemplate?.routineItems,
    [selectedChild?.routineItems, activeTemplate?.routineItems],
  )

  const {
    dayLog,
    saveState,
    lastSavedAt,
    weekPlanId,
    weekFocus,
    snackMessage,
    setSnackMessage,
    persistDayLogImmediate,
  } = useDayLog({
    familyId,
    selectedChildId,
    today,
    selectedChild,
    activeTemplate,
    activeRoutineItems,
  })

  // Load/persist daily plan (energy + planType) to Firestore
  const { dailyPlan, saveDailyPlan } = useDailyPlan({
    familyId,
    childId: selectedChildId,
    date: today,
  })

  // Restore energy + planType from saved dailyPlan on load
  useEffect(() => {
    if (dailyPlan) {
      setEnergy(dailyPlan.energy)
      setPlanType(dailyPlan.planType)
    }
  }, [dailyPlan])

  const { chat: aiChat } = useAI()

  // Sync teachBackSaved from dayLog on load
  useEffect(() => {
    if (dayLog?.teachBackDone) setTeachBackSaved(true)
    else setTeachBackSaved(false)
  }, [dayLog?.teachBackDone])

  // Load skill snapshot for print materials
  useEffect(() => {
    if (!selectedChildId) return
    const ref = doc(skillSnapshotsCollection(familyId), selectedChildId)
    getDoc(ref).then((snap) => {
      if (snap.exists()) setTodaySnapshot(snap.data() as SkillSnapshot)
    }).catch(() => { /* ignore */ })
  }, [familyId, selectedChildId])

  /** Map energy level to plan type: normal → Normal Day, low/overwhelmed → MVD. */
  const energyToPlanType = (level: EnergyLevel): PlanType =>
    level === EnergyLevel.Normal ? PlanType.Normal : PlanType.Mvd

  const handleEnergyChange = useCallback(
    (newEnergy: EnergyLevel) => {
      setEnergy(newEnergy)
      const newPlanType = energyToPlanType(newEnergy)
      setPlanType(newPlanType)
      void saveDailyPlan(newEnergy, newPlanType)
    },
    [saveDailyPlan],
  )

  // Load artifacts scoped to child + date (reload when child changes)
  useEffect(() => {
    if (!selectedChildId) {
      setTodayArtifacts([])
      return
    }
    let isMounted = true

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

    loadArtifacts()

    return () => {
      isMounted = false
    }
  }, [familyId, today, selectedChildId, setSnackMessage])

  // --- Print materials handler ---

  const handlePrintTodayMaterials = useCallback(async () => {
    if (!dayLog?.checklist || !selectedChildId) return
    setPrintingMaterials(true)

    try {
      const parseMinutes = (label: string): number => {
        const match = label.match(/\((\d+)m\)/)
        return match ? parseInt(match[1]) : 15
      }

      const todayPlan: DraftDayPlan = {
        day: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
        timeBudgetMinutes: 150,
        items: (dayLog.checklist ?? [])
          .filter((i) => !i.completed)
          .map((i) => ({
            id: i.id ?? '',
            title: i.label.replace(/\s*\(\d+m\)\s*$/, ''),
            subjectBucket: (i.subjectBucket ?? SubjectBucket.Other) as DraftPlanItem['subjectBucket'],
            estimatedMinutes: i.estimatedMinutes ?? i.plannedMinutes ?? parseMinutes(i.label),
            skillTags: i.skillTags ?? [],
            isAppBlock: false,
            accepted: true,
          })),
      }

      const prompt = buildMaterialsPrompt(
        todayPlan,
        activeChild?.name ?? 'Student',
        todaySnapshot,
        weekFocus?.theme,
      )

      const response = await aiChat({
        familyId,
        childId: selectedChildId,
        taskType: TaskType.Chat,
        messages: [{ role: 'user', content: prompt }],
      })

      if (response?.message) {
        openPrintWindow(response.message, `${activeChild?.name ?? 'Student'} - Today`)
      }
    } catch (err) {
      console.error('Material generation failed:', err)
      setSnackMessage({ text: 'Failed to generate materials. Try again.', severity: 'error' })
    } finally {
      setPrintingMaterials(false)
    }
  }, [dayLog, selectedChildId, activeChild, todaySnapshot, weekFocus, aiChat, familyId, setSnackMessage])

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
      return {
        title,
        type: evidenceType,
        createdAt,
        childId: artifactForm.childId,
        dayLogId: today,
        weekPlanId,
        tags: {
          engineStage: EngineStage.Build,
          domain: '',
          subjectBucket: artifactForm.subjectBucket,
          location: LearningLocation.Home,
        },
        notes: '',
      }
    },
    [artifactForm, today, weekPlanId],
  )

  const handleArtifactSave = useCallback(async () => {
    const content = artifactForm.content.trim()
    const title = content.slice(0, 60) || `Artifact for ${today}`

    const artifact = {
      ...buildArtifactBase(title, EvidenceType.Note),
      content: artifactForm.content,
    }

    try {
      const docRef = await addDoc(artifactsCollection(familyId), artifact)
      setTodayArtifacts((prev) => [{ ...artifact, id: docRef.id }, ...prev])
      setArtifactForm((prev) => ({ ...prev, content: '' }))
      setSnackMessage({ text: 'Note saved.', severity: 'success' })
    } catch (err) {
      console.error('Failed to save artifact', err)
      setSnackMessage({ text: 'Failed to save note.', severity: 'error' })
    }
  }, [artifactForm, buildArtifactBase, familyId, today, setSnackMessage])

  const handlePhotoCapture = useCallback(
    async (file: File) => {
      setMediaUploading(true)
      try {
        const title = `Photo ${today}`
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
        setSnackMessage({ text: 'Photo uploaded.', severity: 'success' })
      } catch (err) {
        console.error('Photo upload failed', err)
        setSnackMessage({ text: 'Photo upload failed.', severity: 'error' })
      } finally {
        setMediaUploading(false)
      }
    },
    [buildArtifactBase, familyId, today, setSnackMessage],
  )

  const handleAudioCapture = useCallback(
    async (blob: Blob) => {
      setMediaUploading(true)
      try {
        const title = `Audio ${today}`
        const artifact = buildArtifactBase(title, EvidenceType.Audio)
        const docRef = await addDoc(artifactsCollection(familyId), artifact)
        const filename = generateFilename('webm')
        const { downloadUrl } = await uploadArtifactFile(familyId, docRef.id, blob, filename)
        await updateDoc(doc(artifactsCollection(familyId), docRef.id), { uri: downloadUrl })
        setTodayArtifacts((prev) => [
          { ...artifact, id: docRef.id, uri: downloadUrl },
          ...prev,
        ])
        setSnackMessage({ text: 'Audio uploaded.', severity: 'success' })
      } catch (err) {
        console.error('Audio upload failed', err)
        setSnackMessage({ text: 'Audio upload failed.', severity: 'error' })
      } finally {
        setMediaUploading(false)
      }
    },
    [buildArtifactBase, familyId, today, setSnackMessage],
  )

  // --- Per-item capture handler (component-level for dialog access) ---

  const handleItemPhotoCapture = useCallback(
    async (file: File) => {
      if (captureItemIndex === null || !dayLog?.checklist) return
      const item = dayLog.checklist[captureItemIndex]
      try {
        const artifact = {
          childId: selectedChildId,
          title: `${item.label.replace(/\s*\(\d+m\)/, '')} — ${activeChild?.name ?? 'Student'}'s work`,
          type: EvidenceType.Photo,
          dayLogId: today,
          createdAt: new Date().toISOString(),
          tags: {
            engineStage: EngineStage.Build,
            domain: '',
            subjectBucket: item.subjectBucket ?? SubjectBucket.Other,
            location: 'Home',
            planItem: item.label,
            ...(captureNote ? { note: captureNote } : {}),
          },
        }
        const docRef = await addDoc(artifactsCollection(familyId), artifact)
        const ext = file.name.split('.').pop() ?? 'jpg'
        const filename = generateFilename(ext)
        const { downloadUrl } = await uploadArtifactFile(familyId, docRef.id, file, filename)
        await updateDoc(doc(artifactsCollection(familyId), docRef.id), { uri: downloadUrl })

        // Link artifact to checklist item
        const updatedChecklist = (dayLog.checklist ?? []).map((ci, i) =>
          i === captureItemIndex ? { ...ci, evidenceArtifactId: docRef.id } : ci
        )
        persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })
        setTodayArtifacts((prev) => [
          { ...artifact, id: docRef.id, uri: downloadUrl } as Artifact,
          ...prev,
        ])
        setCaptureItemIndex(null)
        setCaptureNote('')
        setSnackMessage({ text: 'Work captured!', severity: 'success' })
      } catch (err) {
        console.error('Item photo capture failed:', err)
        setSnackMessage({ text: 'Photo upload failed. Try again.', severity: 'error' })
      }
    },
    [captureItemIndex, captureNote, dayLog, selectedChildId, activeChild, today, familyId, persistDayLogImmediate, setSnackMessage],
  )

  // --- Loading state ---

  const scrollToArtifacts = useCallback(() => {
    artifactSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Compute Daily Log status label
  const dailyLogStatus = useMemo(() => {
    if (!dayLog) return null
    if (lastSavedAt) {
      try {
        const d = new Date(lastSavedAt)
        return `Saved at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      } catch {
        return 'Saved'
      }
    }
    if (dayLog.updatedAt) {
      try {
        const d = new Date(dayLog.updatedAt)
        return `Saved at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      } catch {
        return 'Saved'
      }
    }
    return 'Not saved yet'
  }, [dayLog, lastSavedAt])

  // Kid profile early return — render dedicated kid view
  if (isKidProfile && dayLog && activeChild) {
    const weekRange = getWeekRange(parseDateYmd(today) ?? new Date())
    return (
      <KidTodayView
        dayLog={dayLog}
        child={activeChild}
        persistDayLogImmediate={persistDayLogImmediate}
        familyId={familyId}
        today={today}
        weekStart={weekRange.start}
        isMvd={planType === PlanType.Mvd}
        weekFocus={weekFocus}
      />
    )
  }

  if (!dayLog) {
    return (
      <Page>
        <ContextBar
          page="today"
          activeChild={activeChild}
          dateKey={today}
        />
        <Typography variant="h4" component="h1">Today</Typography>
        <HelpStrip
          pageKey="today"
          text="This is today's checklist. Saving creates the Daily Log."
        />
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
      <ContextBar
        page="today"
        activeChild={activeChild}
        dateKey={today}
        onCaptureArtifact={scrollToArtifacts}
      />
      <Typography variant="h4" component="h1">Today</Typography>

      {/* Day Switcher */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <IconButton size="small" onClick={handlePrevDay} aria-label="Previous day">
          <ChevronLeftIcon />
        </IconButton>

        <Stack alignItems="center" spacing={0}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {selectedDayName}
          </Typography>
          {!isToday && (
            <Button size="small" variant="text" onClick={handleGoToToday} sx={{ py: 0, minHeight: 'auto' }}>
              Back to today
            </Button>
          )}
        </Stack>

        <IconButton size="small" onClick={handleNextDay} aria-label="Next day">
          <ChevronRightIcon />
        </IconButton>
      </Stack>

      {/* Week-at-a-glance day chips */}
      <Stack direction="row" spacing={0.5} justifyContent="center" sx={{ mb: 1 }}>
        {weekDayDates.map(({ label, dateKey }) => {
          const isSelected = dateKey === selectedDate
          const isRealToday = dateKey === realToday
          return (
            <Chip
              key={dateKey}
              label={label}
              size="small"
              onClick={() => setSelectedDate(dateKey)}
              color={isSelected ? 'primary' : 'default'}
              variant={isSelected ? 'filled' : 'outlined'}
              sx={{
                minWidth: 48,
                fontWeight: isSelected || isRealToday ? 700 : 400,
                ...(isRealToday && !isSelected ? { borderColor: 'primary.main', borderWidth: 2 } : {}),
              }}
            />
          )
        })}
      </Stack>

      {!isToday && (
        <Alert severity="info" sx={{ mb: 1 }}>
          {new Date(selectedDate + 'T00:00:00') < new Date(realToday + 'T00:00:00')
            ? `Viewing ${selectedDayName} (past). You can mark items complete or add notes.`
            : `Viewing ${selectedDayName} (upcoming). Items will appear on this day.`}
        </Alert>
      )}

      <HelpStrip
        pageKey="today"
        text="This is today's checklist. Saving creates the Daily Log."
      />
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

      {/* Daily Log status line */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          borderRadius: 1,
          bgcolor: lastSavedAt ? 'success.50' : 'action.hover',
          border: '1px solid',
          borderColor: lastSavedAt ? 'success.200' : 'divider',
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          Daily Log: {dailyLogStatus}
        </Typography>
        <SaveIndicator state={saveState} />
      </Box>

      <HelperPanel template={activeTemplate} />

      {/* --- Energy selector --- */}
      <SectionCard title={`DayLog (${dayLog.date})`}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography color="text.secondary" variant="body2">
            How&apos;s your energy today?
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <ToggleButtonGroup
              value={energy}
              exclusive
              size="small"
              onChange={(_e, value) => { if (value) handleEnergyChange(value as EnergyLevel) }}
            >
              {Object.values(EnergyLevel).map((level) => (
                <ToggleButton key={level} value={level}>
                  {EnergyLevelLabel[level]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Chip
              size="small"
              label={PlanTypeLabel[planType]}
              color={planType === PlanType.Normal ? 'success' : 'warning'}
              variant="outlined"
            />
            <SaveIndicator state={saveState} />
          </Stack>
        </Stack>
      </SectionCard>

      {/* --- Week Focus --- */}
      {weekFocus && (weekFocus.theme || weekFocus.scriptureRef) && (
        <Box sx={{
          p: 2, borderRadius: 2,
          bgcolor: 'primary.50',
          border: '1px solid',
          borderColor: 'primary.100',
        }}>
          {weekFocus.theme && (
            <Typography variant="subtitle2" color="primary.main">
              Theme: {weekFocus.theme}
            </Typography>
          )}
          {weekFocus.virtue && (
            <Typography variant="body2" color="text.secondary">
              Virtue: {weekFocus.virtue}
            </Typography>
          )}
          {weekFocus.scriptureRef && (
            <Typography variant="body2" sx={{ fontStyle: 'italic', mt: 0.5 }}>
              📖 {weekFocus.scriptureRef}
              {weekFocus.scriptureText && ` — "${weekFocus.scriptureText}"`}
            </Typography>
          )}
          {weekFocus.heartQuestion && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              ❤️ {weekFocus.heartQuestion}
            </Typography>
          )}
          {weekFocus.formationPrompt && (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mt: 1 }}>
              🙏 {weekFocus.formationPrompt}
            </Typography>
          )}
        </Box>
      )}

      {/* --- This Week's Conundrum --- */}
      {weekFocus?.conundrum && (
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">
              This Week&apos;s Conundrum: {weekFocus.conundrum.title}
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1.5}>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                {weekFocus.conundrum.scenario}
              </Typography>
              <Box sx={{ p: 1.5, bgcolor: 'primary.50', borderRadius: 1, border: '1px solid', borderColor: 'primary.100' }}>
                <Typography variant="subtitle2" color="primary.main">
                  {weekFocus.conundrum.question}
                </Typography>
              </Box>
              <Typography variant="body2"><strong>Lincoln:</strong> {weekFocus.conundrum.lincolnPrompt}</Typography>
              <Typography variant="body2"><strong>London:</strong> {weekFocus.conundrum.londonPrompt}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                {weekFocus.conundrum.virtueConnection}
              </Typography>
              {weekFocus.conundrum.readingTieIn && (
                <Typography variant="body2" color="text.secondary">
                  📖 <strong>Reading:</strong> {weekFocus.conundrum.readingTieIn}
                </Typography>
              )}
              {weekFocus.conundrum.mathContext && (
                <Typography variant="body2" color="text.secondary">
                  🔢 <strong>Math:</strong> {weekFocus.conundrum.mathContext}
                </Typography>
              )}
              {weekFocus.conundrum.londonDrawingPrompt && (
                <Typography variant="body2" color="text.secondary">
                  🎨 <strong>Drawing:</strong> {weekFocus.conundrum.londonDrawingPrompt}
                </Typography>
              )}
              {weekFocus.conundrum.dadLabSuggestion && (
                <Typography variant="body2" color="text.secondary">
                  🔬 <strong>Dad Lab:</strong> {weekFocus.conundrum.dadLabSuggestion}
                </Typography>
              )}
              <Button
                size="small"
                variant="outlined"
                onClick={async () => {
                  try {
                    await addDoc(artifactsCollection(familyId), {
                      childId: selectedChildId,
                      title: `Conundrum: ${weekFocus.conundrum!.title}`,
                      type: EvidenceType.Note,
                      tags: { engineStage: EngineStage.Wonder, subjectBucket: SubjectBucket.Other, domain: '', location: LearningLocation.Home },
                      content: `Discussed conundrum: ${weekFocus.conundrum!.title}`,
                      createdAt: new Date().toISOString(),
                    })
                    setSnackMessage({ text: 'Conundrum discussion recorded!', severity: 'success' })
                  } catch (err) {
                    console.error('Failed to record conundrum:', err)
                    setSnackMessage({ text: 'Failed to save.', severity: 'error' })
                  }
                }}
                sx={{ alignSelf: 'flex-start' }}
              >
                We discussed this!
              </Button>
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      {/* --- Workshop Game Cards --- */}
      {familyId && children.length > 0 && (
        <WorkshopGameCards familyId={familyId} children={children} />
      )}

      {/* --- Creative Time Log --- */}
      {familyId && selectedChild && (
        <CreativeTimeLog
          familyId={familyId}
          childId={selectedChild.id ?? ''}
          childName={selectedChild.name}
        />
      )}

      {/* --- Today's Plan checklist (PRIMARY) --- */}
      {(() => {
        const rawChecklist = dayLog.checklist ?? []
        const hasPlanItems = rawChecklist.length > 0
        const isMvd = planType === PlanType.Mvd
        // When no items are marked mvdEssential, default first 3 as essential
        const essentialCount = rawChecklist.filter(i => i.mvdEssential).length
        const checklist = essentialCount > 0
          ? rawChecklist
          : rawChecklist.map((item, i) => ({ ...item, mvdEssential: i < 3 }))
        const completedCount = checklist.filter((item) => item.completed).length
        const parseMinutesFromLabel = (label: string): number => {
          const match = label.match(/\((\d+)m\)/)
          return match ? parseInt(match[1]) : 0
        }
        const totalPlannedMinutes = checklist.reduce((sum, item) => {
          return sum + (item.plannedMinutes ?? item.estimatedMinutes ?? parseMinutesFromLabel(item.label))
        }, 0)
        const xp = calculateXp(dayLog, activeRoutineItems)
        const isLincoln = selectedChild?.name?.toLowerCase() === 'lincoln'

        // Engagement pattern insights
        const itemsWithEngagement = checklist.filter((ci) => ci.engagement)
        const engagementCounts = itemsWithEngagement.reduce((acc, ci) => {
          if (ci.engagement) acc[ci.engagement] = (acc[ci.engagement] ?? 0) + 1
          return acc
        }, {} as Record<string, number>)

        const handleReorder = (fromIndex: number, direction: 'up' | 'down') => {
          const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
          if (toIndex < 0 || toIndex >= rawChecklist.length) return
          const updated = [...rawChecklist]
          const temp = updated[fromIndex]
          updated[fromIndex] = updated[toIndex]
          updated[toIndex] = temp
          persistDayLogImmediate({ ...dayLog, checklist: updated })
        }

        const handleDeleteItem = (index: number) => {
          const item = rawChecklist[index]
          const updatedChecklist = rawChecklist.filter((_, i) => i !== index)
          // If planner-sourced, also remove matching block
          let updatedBlocks = dayLog.blocks ?? []
          if (item.source === 'planner') {
            updatedBlocks = (dayLog.blocks ?? []).filter((block) => {
              const matchesLabel = block.checklist?.some((ci) => ci.label === item.label)
              return !matchesLabel
            })
          }
          persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist, blocks: updatedBlocks })
        }

        const handleEditLabel = (index: number, newLabel: string) => {
          const updatedChecklist = rawChecklist.map((ci, i) =>
            i === index ? { ...ci, label: newLabel } : ci
          )
          persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })
        }

        const handleEditMinutes = (index: number, minutes: number) => {
          const item = rawChecklist[index]
          const updatedChecklist = rawChecklist.map((ci, i) =>
            i === index ? { ...ci, plannedMinutes: minutes } : ci
          )
          // Also update the corresponding block's plannedMinutes
          const updatedBlocks = (dayLog.blocks ?? []).map((block) => {
            const matchesLabel = block.checklist?.some((ci) => ci.label === item.label)
            if (matchesLabel) return { ...block, plannedMinutes: minutes }
            return block
          })
          persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist, blocks: updatedBlocks })
        }

        const handleAddItem = () => {
          if (!newItemTitle.trim()) return
          const newItem: ChecklistItemType = {
            label: newItemTitle.trim(),
            completed: false,
            plannedMinutes: newItemMinutes,
            subjectBucket: newItemSubject,
            source: 'manual',
          }
          const updatedChecklist = [...rawChecklist, newItem]
          persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })
          setNewItemTitle('')
          setNewItemMinutes(15)
          setNewItemSubject(SubjectBucket.Other)
          setAddingItem(false)
        }

        const handleEngagement = (index: number, engagement: ChecklistItemType['engagement']) => {
          const updatedChecklist = rawChecklist.map((ci, i) =>
            i === index ? { ...ci, engagement } : ci
          )
          persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })
        }

        const handleItemCapture = (index: number) => {
          setCaptureItemIndex(index)
          setCaptureNote('')
        }

        const handleSaveGradeNote = (index: number, text: string) => {
          if (!dayLog?.checklist || !text.trim()) return
          const updatedChecklist = (dayLog.checklist ?? []).map((ci, i) =>
            i === index ? { ...ci, gradeResult: text.trim() } : ci
          )
          persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })
          setGradeNote(null)
        }

        const handleScanCapture = async (file: File, index: number) => {
          setScanItemIndex(index)
          await runScan(file, familyId, selectedChildId)
        }

        const handleScanAddToPlan = () => {
          if (!scanResult?.results || scanItemIndex == null || !dayLog?.checklist) return
          const r = scanResult.results
          const updatedChecklist = (dayLog.checklist ?? []).map((ci, i) =>
            i === scanItemIndex
              ? {
                  ...ci,
                  subjectBucket: (r.subject.charAt(0).toUpperCase() + r.subject.slice(1)) as SubjectBucket,
                  estimatedMinutes: r.estimatedMinutes,
                  plannedMinutes: r.estimatedMinutes,
                  skillTags: r.skillsTargeted.map((s) => s.skill),
                  skipGuidance: r.recommendation === 'skip' || r.recommendation === 'quick-review'
                    ? `${r.recommendation}: ${r.recommendationReason}`
                    : undefined,
                }
              : ci,
          )
          persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })
          if (scanResult) void recordScanAction(familyId, scanResult, 'added')
          clearScan()
          setScanItemIndex(null)
        }

        const handleScanSkip = () => {
          if (scanResult) void recordScanAction(familyId, scanResult, 'skipped')
          clearScan()
          setScanItemIndex(null)
        }

        return (
          <SectionCard title="Today's Plan" action={
            hasPlanItems ? (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Button
                  size="small"
                  variant="text"
                  startIcon={printingMaterials ? <CircularProgress size={14} /> : <PrintIcon />}
                  onClick={handlePrintTodayMaterials}
                  disabled={printingMaterials}
                  sx={{ minWidth: 0, px: 1 }}
                >
                  {printingMaterials ? 'Generating...' : 'Print'}
                </Button>
                <IconButton size="small" onClick={() => { setEditingPlan(!editingPlan); setAddingItem(false) }}>
                  {editingPlan ? <CheckIcon /> : <EditIcon />}
                </IconButton>
              </Stack>
            ) : undefined
          }>
            {hasPlanItems ? (
              <Stack spacing={1.5}>
                {/* Summary line with XP */}
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    {formatMinutes(totalPlannedMinutes)} planned{' \u00B7 '}
                    {completedCount} of {checklist.length} done
                    {(() => {
                      const remainingMinutes = checklist
                        .filter((ci) => !ci.completed)
                        .reduce((sum, ci) => sum + (ci.plannedMinutes ?? ci.estimatedMinutes ?? parseMinutesFromLabel(ci.label)), 0)
                      if (remainingMinutes > 0 && completedCount < checklist.length) {
                        const est = new Date(Date.now() + remainingMinutes * 60_000)
                        return ` \u00B7 Est. finish: ${formatTime12h(est)}`
                      }
                      return ''
                    })()}
                  </Typography>
                  <Chip
                    label={`${xp} XP`}
                    size="small"
                    color={xp > 0 ? 'success' : 'default'}
                    variant={xp > 0 ? 'filled' : 'outlined'}
                    sx={isLincoln ? {
                      fontFamily: '"Press Start 2P", monospace',
                      fontSize: '0.45rem',
                      bgcolor: xp > 0 ? '#1A1A1A' : undefined,
                      color: xp > 0 ? '#7EFC20' : undefined,
                      border: xp > 0 ? '2px solid #3A3A3A' : undefined,
                      borderRadius: 0,
                    } : {}}
                  />
                </Stack>

                {/* Checklist items */}
                {checklist.map((item, index) => {
                  const isDimmed = isMvd && item.mvdEssential !== true
                  const dotColor = getItemColor(item)

                  if (editingPlan) {
                    return (
                      <Stack key={index} direction="row" spacing={0.5} alignItems="center">
                        {/* Reorder buttons */}
                        <Stack>
                          <IconButton
                            size="small"
                            disabled={index === 0}
                            onClick={() => handleReorder(index, 'up')}
                            sx={{ p: 0.25 }}
                          >
                            <ArrowUpwardIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                          <IconButton
                            size="small"
                            disabled={index === checklist.length - 1}
                            onClick={() => handleReorder(index, 'down')}
                            sx={{ p: 0.25 }}
                          >
                            <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Stack>
                        {/* Editable title */}
                        <TextField
                          size="small"
                          variant="standard"
                          value={item.label}
                          onChange={(e) => handleEditLabel(index, e.target.value)}
                          sx={{ flex: 1 }}
                          inputProps={{ style: { fontSize: '0.875rem' } }}
                        />
                        {/* Editable minutes */}
                        <TextField
                          size="small"
                          variant="standard"
                          type="number"
                          value={item.plannedMinutes ?? 0}
                          onChange={(e) => handleEditMinutes(index, Math.max(0, parseInt(e.target.value) || 0))}
                          sx={{ width: 48 }}
                          inputProps={{ min: 0, style: { fontSize: '0.875rem', textAlign: 'right' } }}
                        />
                        <Typography variant="caption" color="text.secondary">m</Typography>
                        {/* Delete button */}
                        <IconButton size="small" onClick={() => handleDeleteItem(index)} color="error">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    )
                  }

                  return (
                    <Box key={index}>
                      <Stack
                        direction="row"
                        spacing={0.5}
                        alignItems="center"
                        sx={{
                          ...(item.completed ? { textDecoration: 'line-through', opacity: 0.6 } : {}),
                          ...(isDimmed && !item.completed ? { opacity: 0.5 } : {}),
                        }}
                      >
                        {dotColor && (
                          <Box
                            sx={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              bgcolor: dotColor,
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <Checkbox
                          checked={item.completed}
                          onChange={() => {
                            const newCompleted = !item.completed
                            const updatedChecklist = (dayLog.checklist ?? []).map((ci, i) =>
                              i === index ? { ...ci, completed: newCompleted } : ci
                            )
                            // Auto-set actualMinutes on corresponding block when checking
                            const minutes = item.estimatedMinutes ?? item.plannedMinutes ?? 0
                            let updatedBlocks = dayLog.blocks ?? []
                            if (newCompleted && minutes > 0) {
                              updatedBlocks = (dayLog.blocks ?? []).map((block) => {
                                const matchesLabel = block.checklist?.some((ci) => ci.label === item.label)
                                const titleClean = item.label.replace(/\s*\(\d+m\)\s*$/, '')
                                const matchesTitle = block.title != null && (
                                  block.title === titleClean ||
                                  titleClean.toLowerCase().includes(block.title.toLowerCase())
                                )
                                if ((matchesLabel || matchesTitle) && (block.actualMinutes == null || block.actualMinutes === 0)) {
                                  return { ...block, actualMinutes: minutes }
                                }
                                return block
                              })
                            } else if (!newCompleted) {
                              // Clear auto-populated actualMinutes when unchecking
                              updatedBlocks = (dayLog.blocks ?? []).map((block) => {
                                const matchesLabel = block.checklist?.some((ci) => ci.label === item.label)
                                const titleClean = item.label.replace(/\s*\(\d+m\)\s*$/, '')
                                const matchesTitle = block.title != null && (
                                  block.title === titleClean ||
                                  titleClean.toLowerCase().includes(block.title.toLowerCase())
                                )
                                if ((matchesLabel || matchesTitle) && block.actualMinutes === minutes) {
                                  return { ...block, actualMinutes: undefined }
                                }
                                return block
                              })
                            }
                            // Sync checklist → routine fields → XP
                            const synced = syncChecklistToRoutine(
                              { ...dayLog, checklist: updatedChecklist, blocks: updatedBlocks },
                              item, newCompleted, activeRoutineItems,
                            )
                            const withMinutes = autoFillBlockMinutes(synced, activeRoutineItems)
                            const withXp = { ...withMinutes, xpTotal: calculateXp(withMinutes, activeRoutineItems) }
                            persistDayLogImmediate(withXp)
                          }}
                        />
                        <Typography variant="body2" sx={{ flex: 1 }}>
                          {item.label}
                        </Typography>
                        {item.plannedMinutes != null && item.plannedMinutes > 0 && (
                          <Typography variant="caption" color="text.secondary">
                            {item.plannedMinutes}m
                          </Typography>
                        )}
                        {isDimmed && !item.completed && (
                          <Chip label="(stretch)" size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
                        )}
                        {!item.completed && (
                          <Tooltip title={item.lessonCardId ? 'View lesson plan' : 'Help me teach this'}>
                            <IconButton
                              size="small"
                              onClick={() => {
                                setTeachHelperItem(item)
                                setTeachHelperOpen(true)
                              }}
                            >
                              <SchoolIcon
                                fontSize="small"
                                color={item.lessonCardId ? 'primary' : 'action'}
                                sx={item.lessonCardId ? undefined : { opacity: 0.5 }}
                              />
                            </IconButton>
                          </Tooltip>
                        )}
                        {!item.completed && (
                          <Tooltip title="Scan workbook page">
                            <span>
                              <ScanButton
                                variant="icon"
                                loading={scanLoading && scanItemIndex === index}
                                onCapture={(file) => handleScanCapture(file, index)}
                              />
                            </span>
                          </Tooltip>
                        )}
                      </Stack>
                      {/* Scan results panel */}
                      {scanItemIndex === index && scanResult?.results && (
                        <ScanResultsPanel
                          results={scanResult.results}
                          imageUrl={scanResult.imageUrl}
                          onAddToPlan={handleScanAddToPlan}
                          onSkip={handleScanSkip}
                          onScanAnother={() => { clearScan(); setScanItemIndex(null) }}
                        />
                      )}
                      {scanItemIndex === index && scanError && (
                        <Alert severity="error" sx={{ mt: 1 }} onClose={() => { clearScan(); setScanItemIndex(null) }}>
                          Scan failed: {scanError}
                        </Alert>
                      )}
                      {/* Engagement feedback: emoji row after completion */}
                      {item.completed && !item.engagement && (
                        <Stack direction="row" spacing={0.5} sx={{ ml: 5, mt: 0.5 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5, lineHeight: '24px' }}>
                            How&apos;d it go?
                          </Typography>
                          {([
                            { value: 'engaged' as const, emoji: '\u{1F60A}', label: 'Engaged' },
                            { value: 'okay' as const, emoji: '\u{1F610}', label: 'Okay' },
                            { value: 'struggled' as const, emoji: '\u{1F62B}', label: 'Struggled' },
                            { value: 'refused' as const, emoji: '\u{274C}', label: 'Refused' },
                          ]).map(opt => (
                            <IconButton
                              key={opt.value}
                              size="small"
                              onClick={() => handleEngagement(index, opt.value)}
                              title={opt.label}
                              sx={{ fontSize: '1.2rem', p: 0.5 }}
                            >
                              {opt.emoji}
                            </IconButton>
                          ))}
                        </Stack>
                      )}
                      {/* Show saved engagement as a small chip */}
                      {item.engagement && (
                        <Chip
                          size="small"
                          label={{
                            engaged: '\u{1F60A} Engaged',
                            okay: '\u{1F610} Okay',
                            struggled: '\u{1F62B} Struggled',
                            refused: '\u{274C} Refused',
                          }[item.engagement]}
                          sx={{ ml: 5, mt: 0.5, height: 22 }}
                          onDelete={() => handleEngagement(index, undefined)}
                          variant="outlined"
                        />
                      )}

                      {/* Per-item capture — appears after checking off */}
                      {item.completed && (
                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 5, mt: 0.5 }}>
                          {/* Capture button */}
                          {!item.evidenceArtifactId && (
                            <IconButton
                              size="small"
                              onClick={() => handleItemCapture(index)}
                              title="Capture work"
                            >
                              <CameraAltIcon fontSize="small" />
                            </IconButton>
                          )}
                          {/* Show if evidence already captured */}
                          {item.evidenceArtifactId && (
                            <Chip size="small" label="Captured" variant="outlined" color="success" sx={{ height: 22 }} />
                          )}
                        </Stack>
                      )}

                      {/* Scan & Review: manual quick-check after capture */}
                      {item.evidenceArtifactId && !item.gradeResult && gradeNote?.index !== index && (
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => setGradeNote({ index, text: '' })}
                          sx={{ ml: 5, mt: 0.5, textTransform: 'none' }}
                        >
                          Quick Review
                        </Button>
                      )}

                      {/* Grade note input (Approach A — manual) */}
                      {gradeNote?.index === index && (
                        <Stack spacing={1} sx={{ ml: 5, mt: 0.5 }}>
                          <Typography variant="body2">Quick check: how did it go?</Typography>
                          <TextField
                            size="small"
                            placeholder="e.g., 5/6 correct, missed regrouping on #4"
                            value={gradeNote.text}
                            onChange={(e) => setGradeNote({ index, text: e.target.value })}
                            multiline
                            rows={2}
                            autoFocus
                          />
                          <Stack direction="row" spacing={1}>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => handleSaveGradeNote(index, gradeNote.text)}
                              disabled={!gradeNote.text.trim()}
                            >
                              Save
                            </Button>
                            <Button size="small" onClick={() => setGradeNote(null)}>
                              Cancel
                            </Button>
                          </Stack>
                        </Stack>
                      )}

                      {/* Display saved grade result */}
                      {item.gradeResult && (
                        <Box sx={{ ml: 5, mt: 0.5, p: 1, bgcolor: 'grey.50', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                          <Typography variant="caption" color="text.secondary">Review:</Typography>
                          <Typography variant="body2">{item.gradeResult}</Typography>
                        </Box>
                      )}
                    </Box>
                  )
                })}

                {/* Engagement pattern insights */}
                {itemsWithEngagement.length >= 2 && (
                  <Box sx={{ px: 1, py: 1.5, bgcolor: 'grey.50', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                      Today&apos;s Engagement
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      {engagementCounts.engaged != null && engagementCounts.engaged > 0 && (
                        <Chip size="small" label={`\u{1F60A} ${engagementCounts.engaged} engaged`} color="success" variant="outlined" sx={{ height: 24 }} />
                      )}
                      {engagementCounts.okay != null && engagementCounts.okay > 0 && (
                        <Chip size="small" label={`\u{1F610} ${engagementCounts.okay} okay`} variant="outlined" sx={{ height: 24 }} />
                      )}
                      {engagementCounts.struggled != null && engagementCounts.struggled > 0 && (
                        <Chip size="small" label={`\u{1F62B} ${engagementCounts.struggled} struggled`} color="warning" variant="outlined" sx={{ height: 24 }} />
                      )}
                      {engagementCounts.refused != null && engagementCounts.refused > 0 && (
                        <Chip size="small" label={`\u{274C} ${engagementCounts.refused} refused`} color="error" variant="outlined" sx={{ height: 24 }} />
                      )}
                    </Stack>
                  </Box>
                )}

                {/* Add Item (edit mode only) */}
                {editingPlan && !addingItem && (
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => setAddingItem(true)}
                    sx={{ alignSelf: 'flex-start' }}
                  >
                    Add Item
                  </Button>
                )}
                {editingPlan && addingItem && (
                  <Stack spacing={1} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                    <TextField
                      size="small"
                      label="Title"
                      value={newItemTitle}
                      onChange={(e) => setNewItemTitle(e.target.value)}
                      autoFocus
                    />
                    <Stack direction="row" spacing={1}>
                      <TextField
                        size="small"
                        label="Minutes"
                        type="number"
                        value={newItemMinutes}
                        onChange={(e) => setNewItemMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                        sx={{ width: 100 }}
                        inputProps={{ min: 0 }}
                      />
                      <TextField
                        size="small"
                        label="Subject"
                        select
                        value={newItemSubject}
                        onChange={(e) => setNewItemSubject(e.target.value as SubjectBucket)}
                        sx={{ flex: 1 }}
                      >
                        {Object.values(SubjectBucket).map((sb) => (
                          <MenuItem key={sb} value={sb}>{sb}</MenuItem>
                        ))}
                      </TextField>
                    </Stack>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant="contained" onClick={handleAddItem} disabled={!newItemTitle.trim()}>
                        Add
                      </Button>
                      <Button size="small" onClick={() => setAddingItem(false)}>
                        Cancel
                      </Button>
                    </Stack>
                  </Stack>
                )}
              </Stack>
            ) : (
              <Stack spacing={1} sx={{ py: 1 }}>
                <Typography color="text.secondary">
                  No plan for today yet.{' '}
                  <RouterLink to="/planner" style={{ color: 'inherit' }}>
                    Go to Plan My Week
                  </RouterLink>{' '}
                  to create one, or use the routine below.
                </Typography>
              </Stack>
            )}
          </SectionCard>
        )
      })()}

      {/* --- Per-item capture dialog --- */}
      <Dialog open={captureItemIndex !== null} onClose={() => setCaptureItemIndex(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Capture: {captureItemIndex !== null ? dayLog.checklist?.[captureItemIndex]?.label?.replace(/\s*\(\d+m\)/, '') : ''}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <PhotoCapture onCapture={(file: File) => { void handleItemPhotoCapture(file) }} />
            <TextField
              label="Quick note (optional)"
              placeholder="What went well, what to work on..."
              value={captureNote}
              onChange={(e) => setCaptureNote(e.target.value)}
              size="small"
              multiline
              rows={2}
            />
          </Stack>
        </DialogContent>
      </Dialog>

      {/* --- Chapter Question (read-aloud discussion) --- */}
      {dayLog?.chapterQuestion && (
        <SectionCard title={`\u{1F4D6} Reading: ${dayLog.chapterQuestion.book}`}>
          <Stack spacing={1}>
            <Typography variant="subtitle2" color="text.secondary">
              {dayLog.chapterQuestion.chapter}
            </Typography>
            <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
              {dayLog.chapterQuestion.question}
            </Typography>
            {dayLog.chapterQuestion.responded ? (
              <Stack spacing={1}>
                <Chip label="Lincoln responded ✓" color="success" size="small" />
                {dayLog.chapterQuestion.responseUrl && (
                  <audio src={dayLog.chapterQuestion.responseUrl} controls style={{ width: '100%' }} />
                )}
              </Stack>
            ) : (
              <Typography variant="caption" color="text.secondary">
                Waiting for Lincoln&apos;s response on his view.
              </Typography>
            )}
            <TextField
              label="Shelly's note (optional)"
              placeholder="What did you notice about his response?"
              size="small"
              multiline
              rows={2}
              value={dayLog.chapterQuestion.responseNote ?? ''}
              onBlur={(e) => {
                if (e.target.value !== (dayLog.chapterQuestion?.responseNote ?? '')) {
                  persistDayLogImmediate({
                    ...dayLog,
                    chapterQuestion: { ...dayLog.chapterQuestion!, responseNote: e.target.value },
                  })
                }
              }}
            />
          </Stack>
        </SectionCard>
      )}

      {/* --- Teach-Back (Lincoln only, after 50%+ must-do completion) --- */}
      {(() => {
        const isLincolnChild = selectedChild?.name?.toLowerCase() === 'lincoln'
        const checklist = dayLog?.checklist ?? []
        const rawItems = dayLog?.checklist ?? []
        const essentialItems = rawItems.filter((i) => i.category === 'must-do' || i.mvdEssential)
        const mustDoItems = essentialItems.length > 0
          ? essentialItems
          : rawItems.slice(0, 3)
        const mustDoCompleted = mustDoItems.filter((i) => i.completed).length
        const totalCompleted = checklist.filter((i) => i.completed).length
        const halfMustDoDone = mustDoItems.length > 0 && mustDoCompleted >= Math.ceil(mustDoItems.length / 2)
        const enoughDone = totalCompleted >= 3 || halfMustDoDone
        console.log('[TeachBack] guard:', { childName: selectedChild?.name, isLincolnChild, checklistLen: checklist.length, totalCompleted, mustDoCompleted, halfMustDoDone, enoughDone, teachBackDone: dayLog?.teachBackDone, teachBackSaved })
        if (!isLincolnChild || checklist.length === 0 || !enoughDone || teachBackSaved) return null
        return (
          <SectionCard title="Teach London">
            <Stack spacing={1.5}>
              <Typography variant="body2" color="text.secondary">
                Tell London one thing you learned today!
              </Typography>
              <TextField
                multiline
                rows={2}
                placeholder="What did you explain to London?"
                value={teachBackText}
                onChange={(e) => setTeachBackText(e.target.value)}
                size="small"
              />
              <Button
                variant="contained"
                size="small"
                disabled={!teachBackText.trim()}
                onClick={async () => {
                  try {
                    await addDoc(artifactsCollection(familyId), {
                      childId: selectedChildId,
                      title: `Teach-back ${today}`,
                      type: EvidenceType.Note,
                      tags: { engineStage: EngineStage.Explain, subjectBucket: SubjectBucket.Other, domain: 'speech', location: LearningLocation.Home },
                      content: `Teach-back: ${teachBackText.trim()}`,
                      createdAt: new Date().toISOString(),
                    })
                    persistDayLogImmediate({ ...dayLog, teachBackDone: true })
                    setTeachBackSaved(true)
                    setSnackMessage({ text: 'Lincoln explained something to London!', severity: 'success' })
                  } catch (err) {
                    console.error('Teach-back save failed:', err)
                    setSnackMessage({ text: 'Failed to save. Try again.', severity: 'error' })
                  }
                }}
                sx={{ alignSelf: 'flex-start' }}
              >
                Save
              </Button>
            </Stack>
          </SectionCard>
        )
      })()}

      {/* Quick non-core hours — collapsed by default */}
      {selectedChildId && (
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1" color="text.secondary">
              ⚡ Log Extra Activity (PE, art, cooking...)
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <QuickAddHours
              familyId={familyId}
              childId={selectedChildId}
              childName={activeChild?.name ?? 'child'}
              date={today}
              onSaved={(msg) => setSnackMessage({ text: msg, severity: 'success' })}
            />
          </AccordionDetails>
        </Accordion>
      )}

      {/* --- Quick Capture --- */}
      <div ref={artifactSectionRef} />
      <SectionCard title="Quick Capture">
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
          <TextField
            label="Subject bucket"
            select
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
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2">
                        {artifact.title}
                      </Typography>
                      <Chip size="small" label={artifact.type} />
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
                  </Stack>
                </ListItem>
              ))}
            </List>
          )}
        </Stack>
      </SectionCard>

      {selectedChildId && (
        <TeachHelperDialog
          open={teachHelperOpen}
          onClose={() => { setTeachHelperOpen(false); setTeachHelperItem(null) }}
          familyId={familyId}
          childId={selectedChildId}
          childName={selectedChild?.name ?? ''}
          item={teachHelperItem}
          ladders={cardLadders}
        />
      )}

      <Snackbar
        open={snackMessage !== null}
        autoHideDuration={snackMessage?.text === 'Saved' ? 1500 : 4000}
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
