import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import Fab from '@mui/material/Fab'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
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
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'

import ChildSelector from '../../components/ChildSelector'
import ContextBar from '../../components/ContextBar'
import HelpStrip from '../../components/HelpStrip'
import Page from '../../components/Page'
import PhotoCapture from '../../components/PhotoCapture'
import SaveIndicator from '../../components/SaveIndicator'
import SectionCard from '../../components/SectionCard'
import { formatDateYmd, parseDateYmd } from '../../core/utils/format'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useAI, TaskType } from '../../core/ai/useAI'
import {
  artifactsCollection,
  normalizeCurriculumKey,
  skillSnapshotsCollection,
  workbookConfigsCollection,
  workbookConfigDocId,
} from '../../core/firebase/firestore'
import {
  generateFilename,
  uploadArtifactFile,
} from '../../core/firebase/upload'
import { useProfile } from '../../core/profile/useProfile'
import type { Artifact, ChecklistItem as ChecklistItemType, CurriculumDetected, DraftDayPlan, DraftPlanItem, LadderCardDefinition, SkillSnapshot } from '../../core/types'
import { getLaddersForChild } from '../ladders/laddersCatalog'
import TeachHelperDialog from '../planner/TeachHelperDialog'
import {
  EnergyLevel,
  EnergyLevelLabel,
  EngineStage,
  EvidenceType,
  PlanType,
  PlanTypeLabel,
  SubjectBucket,
  UserProfile,
} from '../../core/types/enums'
import { getWeekRange } from '../../core/utils/time'
import { getTemplateForChild } from './dailyPlanTemplates'
import { buildMaterialsPrompt, openPrintWindow } from '../planner-chat/generateMaterials'
import ChapterQuestionCard from './ChapterQuestionCard'
import CreativeTimeLog from './CreativeTimeLog'
import HelperPanel from './HelperPanel'
import KidTodayView from './KidTodayView'
import QuickCaptureSection from './QuickCaptureSection'
import TeachBackSection from './TeachBackSection'
import TodayChecklist from './TodayChecklist'
import { useDailyPlan } from './useDailyPlan'
import { useDayLog } from './useDayLog'
import { useScan } from '../../core/hooks/useScan'
import QuickAddHours from '../records/QuickAddHours'
import SectionErrorBoundary from '../../components/SectionErrorBoundary'
import WeekFocusCard from './WeekFocusCard'
import WorkshopGameCards from './WorkshopGameCards'

export default function TodayPage() {
  const navigate = useNavigate()
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
    const range = getWeekRange(parsed, 1)
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
  const [energy, setEnergy] = useState<EnergyLevel>(EnergyLevel.Normal)
  const [planType, setPlanType] = useState<PlanType>(PlanType.Normal)
  const [teachHelperItem, setTeachHelperItem] = useState<ChecklistItemType | null>(null)
  const [teachHelperOpen, setTeachHelperOpen] = useState(false)
  const [printingMaterials, setPrintingMaterials] = useState(false)
  const [todaySnapshot, setTodaySnapshot] = useState<SkillSnapshot | null>(null)
  const { scan: runScan, recordAction: recordScanAction, scanResult, scanning: scanLoading, error: scanError, clearScan } = useScan()
  const [scanItemIndex, setScanItemIndex] = useState<number | null>(null)
  // Per-item capture state
  const [captureItemIndex, setCaptureItemIndex] = useState<number | null>(null)
  const [captureNote, setCaptureNote] = useState('')

  const selectableChildren = children
  const selectedChild = activeChild

  // TODO: Remove ladder references after disposition system is fully live
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

  // --- Scan handlers ---

  const handleScanCapture = useCallback(async (file: File, index: number) => {
    setScanItemIndex(index)
    await runScan(file, familyId, selectedChildId)
  }, [runScan, familyId, selectedChildId])

  const handleScanAddToPlan = useCallback(() => {
    if (!scanResult?.results || scanItemIndex == null || !dayLog?.checklist) return
    const r = scanResult.results
    // Only worksheet/workbook scans can be added to plan — skip certificates
    if (r.pageType === 'certificate') return
    const updatedChecklist = (dayLog.checklist ?? []).map((ci, i) =>
      i === scanItemIndex
        ? {
            ...ci,
            subjectBucket: (r.subject.charAt(0).toUpperCase() + r.subject.slice(1)) as SubjectBucket,
            estimatedMinutes: r.estimatedMinutes,
            plannedMinutes: r.estimatedMinutes,
            skillTags: r.skillsTargeted.map((s: { skill: string }) => s.skill),
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
  }, [scanResult, scanItemIndex, dayLog, familyId, persistDayLogImmediate, recordScanAction, clearScan])

  const handleScanSkip = useCallback(() => {
    if (scanResult) void recordScanAction(familyId, scanResult, 'skipped')
    clearScan()
    setScanItemIndex(null)
  }, [scanResult, familyId, recordScanAction, clearScan])

  const handleClearScan = useCallback(() => {
    clearScan()
    setScanItemIndex(null)
  }, [clearScan])

  const handleScanUpdatePosition = useCallback(
    async (curriculum: CurriculumDetected) => {
      if (!familyId || !selectedChildId || !curriculum.lessonNumber) return

      try {
        const name = curriculum.name || `${curriculum.provider ?? 'unknown'} curriculum`
        const colRef = workbookConfigsCollection(familyId)

        // Match by normalized curriculum key to find existing config
        const normalizedKey = normalizeCurriculumKey(name)
        const allSnap = await getDocs(query(colRef, where('childId', '==', selectedChildId)))
        const matchingDoc = allSnap.docs.find(d => normalizeCurriculumKey(d.data().name) === normalizedKey)

        if (matchingDoc) {
          const existing = matchingDoc.data()
          if (curriculum.lessonNumber > (existing.currentPosition ?? 0)) {
            await updateDoc(matchingDoc.ref, {
              currentPosition: curriculum.lessonNumber,
              updatedAt: serverTimestamp(),
            })
          }
        } else {
          const docId = workbookConfigDocId(selectedChildId, name)
          const docRef = doc(colRef, docId)
          const lower = (curriculum.name ?? '').toLowerCase()
          const subjectBucket: SubjectBucket =
            curriculum.provider === 'reading-eggs' || lower.includes('reading')
              ? SubjectBucket.Reading
              : lower.includes('language arts')
                ? SubjectBucket.LanguageArts
                : lower.includes('math')
                  ? SubjectBucket.Math
                  : SubjectBucket.Other

          await setDoc(docRef, {
            childId: selectedChildId,
            name,
            subjectBucket,
            totalUnits: curriculum.provider === 'gatb' ? 120 : 0,
            currentPosition: curriculum.lessonNumber,
            unitLabel: 'lesson',
            targetFinishDate: '',
            schoolDaysPerWeek: 4,
            curriculum: {
              provider: curriculum.provider ?? 'other',
              level: curriculum.levelDesignation ?? '',
            },
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        }

        setSnackMessage({ text: `Position updated to Lesson ${curriculum.lessonNumber}!`, severity: 'success' })
      } catch (err) {
        console.error('[TodayPage] Failed to update position', err)
        setSnackMessage({ text: 'Failed to update position', severity: 'error' })
      }
    },
    [familyId, selectedChildId, setSnackMessage],
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

  const handleSnackMessage = useCallback(
    (msg: { text: string; severity: 'success' | 'error' }) => setSnackMessage(msg),
    [setSnackMessage],
  )

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

      {/* --- Week Focus + Conundrum --- */}
      {weekFocus && (
        <SectionErrorBoundary section="week focus">
          <WeekFocusCard
            weekFocus={weekFocus}
            familyId={familyId}
            selectedChildId={selectedChildId}
            onSnackMessage={handleSnackMessage}
          />
        </SectionErrorBoundary>
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
      {selectedChild && (
        <SectionErrorBoundary section="checklist">
        <TodayChecklist
          dayLog={dayLog}
          selectedChild={selectedChild}
          selectedChildId={selectedChildId}
          familyId={familyId}
          today={today}
          planType={planType}
          todaySnapshot={todaySnapshot}
          activeRoutineItems={activeRoutineItems}
          persistDayLogImmediate={persistDayLogImmediate}
          onTeachHelperOpen={(item) => {
            setTeachHelperItem(item)
            setTeachHelperOpen(true)
          }}
          onCaptureOpen={(index) => {
            setCaptureItemIndex(index)
            setCaptureNote('')
          }}
          onScanCapture={handleScanCapture}
          scanLoading={scanLoading}
          scanItemIndex={scanItemIndex}
          scanResult={scanResult}
          scanError={scanError}
          onScanAddToPlan={handleScanAddToPlan}
          onScanSkip={handleScanSkip}
          onClearScan={handleClearScan}
          onUpdatePosition={handleScanUpdatePosition}
          onPrintMaterials={handlePrintTodayMaterials}
          printingMaterials={printingMaterials}
        />
        </SectionErrorBoundary>
      )}

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
      <SectionErrorBoundary section="chapter question">
        <ChapterQuestionCard
          dayLog={dayLog}
          persistDayLogImmediate={persistDayLogImmediate}
        />
      </SectionErrorBoundary>

      {/* --- Teach-Back (Lincoln only, after 50%+ must-do completion) --- */}
      {selectedChild && (
        <SectionErrorBoundary section="teach-back">
          <TeachBackSection
            dayLog={dayLog}
            selectedChild={selectedChild}
            familyId={familyId}
            selectedChildId={selectedChildId}
            today={today}
            persistDayLogImmediate={persistDayLogImmediate}
            onSnackMessage={handleSnackMessage}
          />
        </SectionErrorBoundary>
      )}

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

      {/* --- Quick Capture + Artifacts --- */}
      <div ref={artifactSectionRef} />
      <SectionErrorBoundary section="quick capture">
        <QuickCaptureSection
          familyId={familyId}
          selectedChildId={selectedChildId}
          today={today}
          weekPlanId={weekPlanId}
          selectableChildren={selectableChildren}
          todayArtifacts={todayArtifacts}
          setTodayArtifacts={setTodayArtifacts}
          onSnackMessage={handleSnackMessage}
        />
      </SectionErrorBoundary>

      {selectedChildId && (
        <TeachHelperDialog
          open={teachHelperOpen}
          onClose={() => { setTeachHelperOpen(false); setTeachHelperItem(null) }}
          familyId={familyId}
          childId={selectedChildId}
          childName={selectedChild?.name ?? ''}
          item={teachHelperItem}
          ladders={cardLadders}
          weekTheme={weekFocus?.theme}
        />
      )}

      <Fab
        color="primary"
        size="medium"
        sx={{ position: 'fixed', bottom: 80, right: 16, zIndex: 10 }}
        onClick={() => navigate('/chat')}
        aria-label="Ask AI"
      >
        <AutoAwesomeIcon />
      </Fab>

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
