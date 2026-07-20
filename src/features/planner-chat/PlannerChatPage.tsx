import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { addDoc, deleteField, doc, getDoc, getDocs, limit as fsLimit, onSnapshot, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore'

import { useNavigate } from 'react-router-dom'
import ChildSelector from '../../components/ChildSelector'
import Page from '../../components/Page'
import { LoadingState } from '../../components/states'
import { AIFeatureFlag, useAIFeatureFlags } from '../../core/ai/featureFlags'
import { useAI, TaskType, useGenerateActivity } from '../../core/ai/useAI'
import { deriveChildAge } from '../../core/profile/childAge'
import { useProfile } from '../../core/profile/useProfile'
import type { ChatMessage as AIChatMessage, GeneratedActivity } from '../../core/ai/useAI'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  artifactsCollection,
  bookProgressCollection,
  bookProgressDocId,
  chapterBooksCollection,
  daysCollection,
  evaluationSessionsCollection,
  lessonCardsCollection,
  plannerConversationDocId,
  plannerConversationsCollection,
  skillSnapshotsCollection,
  weeksCollection,
  db,
} from '../../core/firebase/firestore'
import { generateFilename, uploadArtifactFile } from '../../core/firebase/upload'
import { TransientConnectivityError, withTransientRetry } from '../../core/firebase/transientRetry'
import { generateHelpCardsForPlan } from './generateHelpCards'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useDebounce } from '../../core/hooks/useDebounce'
import type {
  AppBlock,
  AssignmentCandidate,
  BookLookupResult,
  BookProgress,
  ChapterBook,
  ChapterQuestionPoolItem,
  ChatMessage,
  ChecklistItem,
  DayBlock,
  DayLog,
  DraftPlanItem,
  DraftWeeklyPlan,
  LessonCard,
  PendingPlanAdjustment,
  PlannerConversation,
  PhotoLabel,
  PhotoContentExtraction,
  SkillSnapshot,
  WatchVideo,
  WeekPlan,
  WorkbookConfig,
} from '../../core/types'
import { DEFAULT_SUBJECT_MINUTES } from '../../core/types/planning'
import type { SubjectTimeDefaults } from '../../core/types/planning'
import {
  AssignmentAction,
  ChatMessageRole,
  DayBlockType,
  EngineStage,
  EvidenceType,
  PlannerConversationStatus,
  SubjectBucket,
  UserProfile,
} from '../../core/types/enums'
import { SKILL_TAG_MAP } from '../../core/types/skillTags'
import { formatDateYmd, parseDateYmd } from '../../core/utils/format'
import { findWorkbookConfigId } from '../../core/utils/workbookMatching'
import { getPlanningWeekRange } from '../../core/utils/time'
import { todayKey } from '../../core/utils/dateKey'
import { useTodayKey } from '../../core/hooks/useTodayKey'
import { buildChapterPoolItem } from '../today/chapterPool.logic'
import {
  applyChapterPoolToAll,
  collectExistingChapterPool,
} from '../today/applyChapterPoolForChild'
import { dayLogDocId } from '../today/daylog.model'
import { retainBlocksForApply, retainChecklistForApply } from '../today/applyReset'
import { setDayLogGuarded, updateDayLogGuarded } from '../today/dayWriteGuard'
import { useActivityConfigs } from '../../core/hooks/useActivityConfigs'
import { activityConfigsToRoutineText, defaultAppBlocks, parseRoutineTotalMinutes } from './chatPlanner.logic'
import {
  buildPlannerPrompt,
  buildShiftedWeekPlan,
  dateKeyForDayPlan,
  ensureEvaluationItems,
  formatPlanningWeekLabel,
  isPlanningWeekPast,
  fillMissingDaysFromRoutine,
  generateDraftPlanFromInputs,
  generateItemId,
  parseAIResponse,
  WEEK_DAYS,
} from './chatPlanner.logic'
import type { AdjustmentIntent } from './chatPlanner.logic'
import { describeAdjustment, parseAdjustmentIntent } from './intentParser'
import { formatCoverageSummaryText, buildCoverageSummary } from './coverageSummary'
import ContextDrawer from './ContextDrawer'
import FoundationsFocusLine from './FoundationsFocusLine'
import LessonCardPreview from './LessonCardPreview'
import PlanSummaryPanel from './PlanSummaryPanel'
import { useScan } from '../../core/hooks/useScan'
import QuickSuggestionButtons from './QuickSuggestionButtons'
import { buildMaterialsPrompt, openPrintWindow } from './generateMaterials'
import ChapterBookPicker from './ChapterBookPicker'
import PlannerSetupWizard from './PlannerSetupWizard'
import PlannerCompactSetup from './PlannerCompactSetup'
import PlannerChatDrawer from './PlannerChatDrawer'
import WeekFocusPanel from './WeekFocusPanel'
import PlanDayCards from './PlanDayCards'
import StickyApplyBar from './StickyApplyBar'
import WatchLibraryPicker from '../watch/WatchLibraryPicker'
import { useWatchLibrary } from '../watch/useWatchLibrary'
import { clonePlanWithAdvancedLessons } from './repeatWeek.logic'
import { consumePlanAdjustment } from '../shelly-chat/stagePlanAdjustment'


/** Detect if an AI response looks like it was trying to return plan JSON (contains days/items structure). */
function looksLikePlanJson(text: string): boolean {
  return /["']days["']\s*:/.test(text) && /["']items["']\s*:/.test(text)
}

function subjectToDayBlockType(subject: SubjectBucket): DayBlockType {
  switch (subject) {
    case SubjectBucket.Reading: return DayBlockType.Reading
    case SubjectBucket.Math: return DayBlockType.Math
    case SubjectBucket.LanguageArts: return DayBlockType.Reading
    case SubjectBucket.Science: return DayBlockType.Project
    case SubjectBucket.SocialStudies: return DayBlockType.Together
    default: return DayBlockType.Other
  }
}

function photoLabelsToAssignments(labels: PhotoLabel[]): AssignmentCandidate[] {
  return labels.map((label) => {
    const extracted = label.extractedContent
    const workbookName = extracted?.workbookMatch?.workbookName ?? label.subjectBucket
    const lessonName = extracted
      ? `${extracted.lessonNumber ? `${extracted.workbookMatch?.unitLabel ?? 'lesson'} ${extracted.lessonNumber}` : label.lessonOrPages || 'Workbook page'}${extracted.topic && extracted.topic !== workbookName ? ` (${extracted.topic})` : ''}`
      : label.lessonOrPages || 'Workbook page'

    return {
      id: generateItemId(),
      subjectBucket: label.subjectBucket,
      workbookName,
      lessonName,
      estimatedMinutes: extracted?.estimatedMinutes || label.estimatedMinutes,
      difficultyCues: extracted?.difficulty ? [extracted.difficulty] : [],
      sourcePhotoId: label.artifactId,
      action: AssignmentAction.Keep,
    }
  })
}

/** Build a text description of photo context for inclusion in AI plan prompts. */
function buildPhotoContextSection(labels: PhotoLabel[]): string {
  const labelsWithContent = labels.filter((l) => l.extractedContent || l.lessonOrPages)
  if (labelsWithContent.length === 0) return ''

  const lines = ['Photos uploaded this session:']
  for (const label of labelsWithContent) {
    const ex = label.extractedContent
    if (ex?.workbookMatch) {
      const parts = [
        ex.workbookMatch.workbookName,
        ex.lessonNumber ? `${ex.workbookMatch.unitLabel} ${ex.lessonNumber} of ${ex.workbookMatch.totalUnits}` : null,
        ex.topic && ex.topic !== ex.workbookMatch.workbookName ? ex.topic : null,
        `~${ex.estimatedMinutes || label.estimatedMinutes} min`,
      ].filter(Boolean)
      lines.push(`- ${parts.join(', ')}`)
      if (ex.difficulty) {
        lines.push(`  Difficulty note: ${ex.difficulty}`)
      }
      if (ex.modifications) {
        lines.push(`  Suggested modification: ${ex.modifications}`)
      }
    } else {
      lines.push(`- ${label.subjectBucket}: ${label.lessonOrPages || 'workbook page'} (~${label.estimatedMinutes} min)`)
    }
  }
  lines.push('Please incorporate these specific materials into the plan.')
  return lines.join('\n')
}

const LIGHTER_WEEK_BUDGET_MULTIPLIER = 0.7
const TOUGH_WEEK_FIXED_MINUTES = 90

function formatSkillLabel(tag: string): string {
  const mapped = SKILL_TAG_MAP[tag]?.label
  if (mapped) return mapped
  const fallback = tag.split('.').pop() ?? tag
  return fallback
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

type MasteryCounts = { gotIt: number; working: number; stuck: number }
type PlannerMasterySummary = {
  rangeStart: string
  rangeEnd: string
  gotIt: string[]
  stillWorking: string[]
  needsFocus: string[]
  bySkillTag: Record<string, MasteryCounts>
}

export default function PlannerChatPage() {
  const familyId = useFamilyId()
  const { isEnabled } = useAIFeatureFlags()
  const { chat: aiChat, loading: aiLoading } = useAI()
  const { generate: generateActivity, loading: generateLoading } = useGenerateActivity()
  const {
    children,
    activeChildId,
    activeChild,
    setActiveChildId,
    isLoading: isLoadingChildren,
    addChild,
  } = useActiveChild()

  const navigate = useNavigate()
  const { profile } = useProfile()
  // Curation is a parent job — the inline vet-in + "Manage library" affordances
  // are gated to parents, exactly like the Settings Watch Library tab (FEAT-107).
  const isParent = profile === UserProfile.Parents
  // Keyed to the live day (FEAT-112): a phone-first tab is rarely closed, so the
  // planning week must not freeze at mount. `useTodayKey` refreshes on focus /
  // visibility / minute-tick, and `getPlanningWeekRange` rolls a Saturday
  // forward so weekend planning always targets the UPCOMING Mon–Fri, not the
  // week that already passed.
  const [todayKeyLive, refreshTodayKey] = useTodayKey()
  const weekRange = useMemo(
    () => getPlanningWeekRange(parseDateYmd(todayKeyLive) ?? new Date()),
    [todayKeyLive],
  )
  const chatEndRef = useRef<HTMLDivElement>(null)
  const autoSuggestTriggered = useRef(false)

  // State
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [snapshot, setSnapshot] = useState<SkillSnapshot | null>(null)
  const [hoursPerDay, setHoursPerDay] = useState(2.5)
  const [appBlocks] = useState<AppBlock[]>(defaultAppBlocks)
  const [photoLabels, setPhotoLabels] = useState<PhotoLabel[]>([])
  const [uploading, setUploading] = useState(false)
  const [currentDraft, setCurrentDraft] = useState<DraftWeeklyPlan | null>(null)
  const [adjustments, setAdjustments] = useState<AdjustmentIntent[]>([])
  // showPhotos state removed — photo upload now lives in setup phase accordion
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [applied, setApplied] = useState(false)
  // FEAT-111 P3: true once the parent edits the draft after generation (add a
  // video, remove/move an item, retime) — drives the "Plan changed — apply to
  // save" hint in the sticky apply bar. Cleared on (re)generate and on apply.
  const [planDirty, setPlanDirty] = useState(false)
  // FEAT-112 P4: set when Apply is blocked because the target week is entirely
  // in the past; drives the non-blaming "week already passed" dialog + the
  // one-tap forward-shift. `attempted` = the past week key, `shifted` = the
  // correct upcoming planning-week start to apply to instead.
  const [pastWeekBlock, setPastWeekBlock] = useState<{ attempted: string; shifted: string } | null>(null)
  const [snack, setSnack] = useState<{ text: string; severity: 'success' | 'error' | 'info' | 'warning'; action?: { label: string; onClick: () => void } } | null>(null)

  // Week plan state (theme/virtue/scripture/heartQuestion)
  const [weekPlan, setWeekPlan] = useState<WeekPlan | null>(null)
  // When true, render the setup card even if a draft exists (used by "← Edit setup")
  const [forceSetup, setForceSetup] = useState(false)
  const phase = useMemo<'setup' | 'review' | 'active'>(() => {
    if (applied) return 'active'
    if (forceSetup) return 'setup'
    if (weekPlan && currentDraft) return 'review'
    return 'setup'
  }, [weekPlan, currentDraft, applied, forceSetup])
  // Confirmation dialog state
  const [confirmNewPlan, setConfirmNewPlan] = useState(false)

  // Prior-plan detection: distinguishes first-visit user (full wizard) from returning user (compact setup)
  const [hasPriorPlan, setHasPriorPlan] = useState<boolean | null>(null)
  const [lastPlanDraft, setLastPlanDraft] = useState<DraftWeeklyPlan | null>(null)
  const [repeatingWeek, setRepeatingWeek] = useState(false)
  // Workbook chips: workbooks the user has toggled OFF for this week.
  const [excludedWorkbookIds, setExcludedWorkbookIds] = useState<Set<string>>(new Set())


  // Generate activity state
  const [generatingItemId, setGeneratingItemId] = useState<string | null>(null)
  const [generatedActivity, setGeneratedActivity] = useState<GeneratedActivity | null>(null)
  const [generatedPlanItem, setGeneratedPlanItem] = useState<DraftPlanItem | null>(null)
  const [lessonCardSaved, setLessonCardSaved] = useState(false)
  const [lessonCardSaving, setLessonCardSaving] = useState(false)
  const [printingMaterials, setPrintingMaterials] = useState(false)

  // Scan hook for workbook page analysis
  const {
    scan: runScan,
    recordAction: recordScanAction,
    scanResult: scanRecord,
    scanning: scanLoading,
    error: scanError,
    clearScan,
  } = useScan()

  // Setup wizard state
  const [setupComplete, setSetupComplete] = useState(false)
  const [weekEnergy, setWeekEnergy] = useState<'full' | 'lighter' | 'mvd'>('full')
  const [readAloudBook, setReadAloudBook] = useState('')
  const [readAloudChapters, setReadAloudChapters] = useState('')
  const [weekNotes, setWeekNotes] = useState('')

  // Pending plan adjustment handed off from Shelly chat (chunk 2A/2). Consumed
  // once per child on load: preloaded into the generation context (weekNotes) +
  // surfaced as a banner, then the inbox doc is cleared. The chat stages it; the
  // planner still requires Shelly to review + lock in via the existing flow —
  // nothing here auto-applies, and the planner never reads back a stale brief.
  const [pendingAdjustment, setPendingAdjustment] = useState<PendingPlanAdjustment | null>(null)
  const consumedAdjustmentChildIds = useRef<Set<string>>(new Set())

  // Chapter book library + selection
  const [chapterBooks, setChapterBooks] = useState<ChapterBook[]>([])
  const [chapterBooksLoading, setChapterBooksLoading] = useState(true)
  const [chapterBooksLoadError, setChapterBooksLoadError] = useState(false)
  const [selectedBook, setSelectedBook] = useState<ChapterBook | null>(null)
  const [bookProgress, setBookProgress] = useState<BookProgress | null>(null)

  // Per-subject default time overrides (minutes per day)
  const [subjectTimeDefaults, setSubjectTimeDefaults] = useState<SubjectTimeDefaults>({})
  const [generatingWeek, setGeneratingWeek] = useState(false)
  const [masterySummary, setMasterySummary] = useState<PlannerMasterySummary | null>(null)

  // Activity configs → routine text (replaces old free-text dailyRoutine)
  const { configs: activityConfigs } = useActivityConfigs(activeChildId ?? '')
  const dailyRoutine = useMemo(
    () => activityConfigsToRoutineText(activityConfigs),
    [activityConfigs],
  )
  const workbookConfigs = useMemo<WorkbookConfig[]>(
    () =>
      activityConfigs
        .filter((cfg) => cfg.type === 'workbook' && !cfg.completed)
        .map((cfg) => ({
          id: cfg.id,
          childId: cfg.childId === 'both' ? activeChildId ?? '' : cfg.childId,
          name: cfg.name,
          subjectBucket: cfg.subjectBucket,
          totalUnits: cfg.totalUnits ?? 0,
          currentPosition: cfg.currentPosition ?? 0,
          unitLabel: cfg.unitLabel ?? 'lesson',
          targetFinishDate: '',
          schoolDaysPerWeek: 5,
          defaultMinutes: cfg.defaultMinutes,
          curriculum: cfg.curriculumMeta,
          completed: cfg.completed,
          completedDate: cfg.completedDate,
          createdAt: cfg.createdAt,
          updatedAt: cfg.updatedAt,
        })),
    [activityConfigs, activeChildId],
  )

  // Adjust hoursPerDay based on energy selection and routine total
  useEffect(() => {
    const routineTotal = parseRoutineTotalMinutes(dailyRoutine)
    if (weekEnergy === 'full') {
      setHoursPerDay(routineTotal > 0 ? Math.round((routineTotal / 60) * 10) / 10 : 3)
    } else if (weekEnergy === 'lighter') {
      setHoursPerDay(routineTotal > 0 ? Math.round((routineTotal * LIGHTER_WEEK_BUDGET_MULTIPLIER / 60) * 10) / 10 : 2)
    } else {
      setHoursPerDay(TOUGH_WEEK_FIXED_MINUTES / 60)
    }
  }, [weekEnergy, dailyRoutine])

  const conversationDocId = useMemo(
    () => (activeChildId ? plannerConversationDocId(weekRange.start, activeChildId) : ''),
    [weekRange.start, activeChildId],
  )

  // Load chapter book library
  useEffect(() => {
    setChapterBooksLoading(true)
    setChapterBooksLoadError(false)
    void getDocs(chapterBooksCollection()).then((snap) => {
      const books = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
      books.sort((a, b) => a.title.localeCompare(b.title))
      setChapterBooks(books)
    }).catch((err) => {
      console.warn('Failed to load chapter book library:', err)
      setChapterBooksLoadError(true)
    }).finally(() => {
      setChapterBooksLoading(false)
    })
  }, [])

  // Load planner defaults (family-level) and initialize selectedBook from readAloudBookId
  const plannerDefaultsBookIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!familyId) return
    const settingsRef = doc(db, `families/${familyId}/settings/plannerDefaults`)
    void getDoc(settingsRef).then((snap) => {
      if (snap.exists()) {
        const data = snap.data()
        if (data.weekEnergy) setWeekEnergy(data.weekEnergy)
        if (data.readAloudBook) setReadAloudBook(data.readAloudBook)
        if (data.readAloudChapters) setReadAloudChapters(data.readAloudChapters)
        if (data.readAloudBookId) plannerDefaultsBookIdRef.current = data.readAloudBookId as string
      }
    })
  }, [familyId])

  // Initialize selectedBook once chapterBooks are loaded and plannerDefaults has been read
  useEffect(() => {
    if (chapterBooks.length === 0 || !plannerDefaultsBookIdRef.current) return
    const match = chapterBooks.find((b) => b.id === plannerDefaultsBookIdRef.current)
    if (match) {
      setSelectedBook(match)
      setReadAloudBook(match.title)
      plannerDefaultsBookIdRef.current = null // Only initialize once
    }
  }, [chapterBooks])

  // Load BookProgress for selected book + active child
  useEffect(() => {
    if (!familyId || !activeChildId || !selectedBook) {
      setBookProgress(null)
      return
    }
    const progressId = bookProgressDocId(activeChildId, selectedBook.id)
    const progressRef = doc(bookProgressCollection(familyId), progressId)
    void getDoc(progressRef).then((snap) => {
      if (snap.exists()) {
        setBookProgress({ ...snap.data(), id: snap.id })
      } else {
        setBookProgress(null)
      }
    })
  }, [familyId, activeChildId, selectedBook])

  // When selectedBook changes, sync legacy readAloudBook field and clear chapters
  const handleSelectedBookChange = useCallback((book: ChapterBook | null) => {
    setSelectedBook(book)
    if (book) {
      setReadAloudBook(book.title)
      setReadAloudChapters('')
    } else {
      setReadAloudBook('')
      setReadAloudChapters('')
    }
  }, [])

  // When a new book is added via ChapterBookPicker, include it in the local library list
  const handleBookAdded = useCallback((book: ChapterBook) => {
    setChapterBooks((prev) => {
      if (prev.some((b) => b.id === book.id)) return prev
      const next = [...prev, book]
      next.sort((a, b) => a.title.localeCompare(b.title))
      return next
    })
  }, [])

  // AI title lookup for the "Add a new book" form — pre-fills the form fields.
  const handleLookupBook = useCallback(
    async (title: string): Promise<BookLookupResult | null> => {
      if (!activeChildId) return null
      const age = activeChild ? deriveChildAge(activeChild) : null
      const result = await aiChat({
        familyId,
        childId: activeChildId,
        taskType: TaskType.BookLookup,
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              title,
              childName: activeChild?.name,
              ...(age != null ? { childAge: age } : {}),
            }),
          },
        ],
      })
      if (!result?.message) return null
      try {
        return JSON.parse(result.message) as BookLookupResult
      } catch {
        return null
      }
    },
    [aiChat, familyId, activeChildId, activeChild],
  )

  // dailyRoutine is now derived from activity configs (already filtered for completed)
  // No need to filter for completed programs — activity configs handle that via `completed` flag
  const filteredDailyRoutine = dailyRoutine
  const filteredAppBlocks = useMemo(
    () => {
      const completed = snapshot?.completedPrograms ?? []
      if (!completed.length) return appBlocks
      return appBlocks.filter(block => {
        const blockLower = block.label.toLowerCase().replace(/[^a-z0-9]/g, '')
        return !completed.some(prog => {
          const progLower = prog.toLowerCase().replace(/[^a-z0-9]/g, '')
          return blockLower.includes(progLower)
        })
      })
    },
    [appBlocks, snapshot?.completedPrograms],
  )

  // Load per-child subject time defaults
  useEffect(() => {
    if (!familyId || !activeChildId) {
      setSubjectTimeDefaults({})
      return
    }
    const childSettingsRef = doc(db, `families/${familyId}/settings/plannerDefaults_${activeChildId}`)
    void getDoc(childSettingsRef).then((snap) => {
      if (snap.exists() && snap.data().subjectTimeDefaults) {
        setSubjectTimeDefaults(snap.data().subjectTimeDefaults as SubjectTimeDefaults)
      } else {
        setSubjectTimeDefaults({})
      }
    })
  }, [familyId, activeChildId])

  // Consume a pending plan-adjustment brief handed off from Shelly chat (chunk
  // 2A/2). Apply-once per child: a ref guard makes the StrictMode double-invoke a
  // no-op, and `consumePlanAdjustment` deletes the inbox doc so a refresh or
  // child-switch can't replay it. The brief is folded into weekNotes (so it
  // flows into the AI generation context) and surfaced as a banner + snack; the
  // planner never writes the plan from this — Shelly reviews and locks in via
  // the existing flow.
  useEffect(() => {
    if (!familyId || !activeChildId) return
    if (consumedAdjustmentChildIds.current.has(activeChildId)) return
    consumedAdjustmentChildIds.current.add(activeChildId)
    const childId = activeChildId
    void consumePlanAdjustment(familyId, childId).then((adj) => {
      if (!adj) return
      setPendingAdjustment(adj)
      setWeekNotes((prev) => {
        const line = `Proposed adjustment from Shelly chat: ${adj.summary}${
          adj.rationale ? ` — because ${adj.rationale}` : ''
        }`
        return prev ? `${prev}\n${line}` : line
      })
      setSnack({ text: 'Loaded a proposed adjustment from your chat', severity: 'info' })
    })
  }, [familyId, activeChildId])

  // Detect whether this child has any prior planner conversation (drives compact vs full setup).
  // Also fetch the most recent prior week's draft so "Repeat Last Week" can clone it.
  useEffect(() => {
    if (!familyId || !activeChildId) {
      setHasPriorPlan(null)
      setLastPlanDraft(null)
      return
    }
    setHasPriorPlan(null)
    setLastPlanDraft(null)
    const q = query(
      plannerConversationsCollection(familyId),
      where('childId', '==', activeChildId),
      orderBy('weekKey', 'desc'),
      fsLimit(5),
    )
    void getDocs(q).then((snap) => {
      const priorDocs = snap.docs.filter((d) => d.data().weekKey !== weekRange.start)
      setHasPriorPlan(priorDocs.length > 0)
      const withDraft = priorDocs.find((d) => {
        const data = d.data() as PlannerConversation
        return !!data.currentDraft && (data.currentDraft.days?.length ?? 0) > 0
      })
      setLastPlanDraft(withDraft ? ((withDraft.data() as PlannerConversation).currentDraft ?? null) : null)
    }).catch(() => {
      setHasPriorPlan(false)
      setLastPlanDraft(null)
    })
  }, [familyId, activeChildId, weekRange.start])

  // Load existing conversation
  useEffect(() => {
    if (!conversationDocId || !activeChildId) return
    // FEAT-112 follow-up: the planning week (or child) changed, so `weekRange`
    // and `conversationDocId` re-keyed. Clear the previous context's week-scoped
    // state before (re)subscribing — otherwise, when the new week's doc is absent
    // (the common "haven't planned next week yet" case), the snapshot handler's
    // `exists()` guard does nothing and the old week's draft/applied plan lingers,
    // relabeled with the new week's dates or falsely reported as already active.
    // The snapshot repopulates from the doc when it exists. (On first mount these
    // already hold their initial values, so this is a no-op there.)
    setMessages([])
    setCurrentDraft(null)
    setApplied(false)
    setSetupComplete(false)
    const ref = doc(plannerConversationsCollection(familyId), conversationDocId)
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setMessages(data.messages)
        setHoursPerDay(data.availableHoursPerDay)
        if (data.currentDraft) setCurrentDraft(data.currentDraft)
        if (data.status === PlannerConversationStatus.Applied) setApplied(true)
        if (data.messages.length > 0) {
          setSetupComplete(true)
        }
      }
    })
    return unsubscribe
  }, [familyId, conversationDocId, activeChildId])

  // Load skill snapshot
  useEffect(() => {
    if (!activeChildId) return
    const ref = doc(skillSnapshotsCollection(familyId), activeChildId)
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setSnapshot({ ...snap.data(), id: snap.id })
      }
    })
    return unsubscribe
  }, [familyId, activeChildId])

  // Check for recent evaluation sessions (for nudge suppression)
  const [recentEvalDate, setRecentEvalDate] = useState<string | null>(null)
  useEffect(() => {
    if (!activeChildId) {
      setRecentEvalDate(null)
      return
    }
    const q = query(
      evaluationSessionsCollection(familyId),
      where('childId', '==', activeChildId),
      orderBy('evaluatedAt', 'desc'),
      fsLimit(1),
    )
    void getDocs(q).then((snap) => {
      if (!snap.empty) {
        const latest = snap.docs[0].data()
        setRecentEvalDate(latest.evaluatedAt)
      } else {
        setRecentEvalDate(null)
      }
    })
  }, [familyId, activeChildId])

  // Load recent mastery states from last 2 weeks of day logs for active child
  useEffect(() => {
    if (!activeChildId) {
      setMasterySummary(null)
      return
    }

    const end = new Date()
    const start = new Date(end)
    start.setDate(end.getDate() - 13)
    const rangeStart = formatDateYmd(start)
    const rangeEnd = formatDateYmd(end)
    const daysQuery = query(
      daysCollection(familyId),
      where('date', '>=', rangeStart),
      where('date', '<=', rangeEnd),
    )

    void getDocs(daysQuery).then((snap) => {
      const bySkillTag: Record<string, MasteryCounts> = {}
      for (const docSnap of snap.docs) {
        const day = docSnap.data() as DayLog
        if (day.childId !== activeChildId) continue
        for (const item of day.checklist ?? []) {
          if (!item.mastery || !item.skillTags || item.skillTags.length === 0) continue
          for (const tag of item.skillTags) {
            const counts = bySkillTag[tag] ?? { gotIt: 0, working: 0, stuck: 0 }
            if (item.mastery === 'got-it') counts.gotIt += 1
            else if (item.mastery === 'working') counts.working += 1
            else if (item.mastery === 'stuck') counts.stuck += 1
            bySkillTag[tag] = counts
          }
        }
      }

      const gotIt: string[] = []
      const stillWorking: string[] = []
      const needsFocus: string[] = []
      for (const [tag, counts] of Object.entries(bySkillTag)) {
        if (counts.gotIt >= 3) gotIt.push(tag)
        else if (counts.stuck >= 2) needsFocus.push(tag)
        else stillWorking.push(tag)
      }

      setMasterySummary({
        rangeStart,
        rangeEnd,
        gotIt: gotIt.sort(),
        stillWorking: stillWorking.sort(),
        needsFocus: needsFocus.sort(),
        bySkillTag,
      })
    }).catch(() => {
      setMasterySummary(null)
    })
  }, [familyId, activeChildId])

  const masteryPromptContext = useMemo(() => {
    if (!masterySummary) return ''
    const formatSkillLabel = (tag: string) => {
      const mapped = SKILL_TAG_MAP[tag]?.label
      if (mapped) return mapped
      const fallback = tag.split('.').pop() ?? tag
      return fallback
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())
    }
    const formatTags = (tags: string[]) =>
      tags
        .slice(0, 8)
        .map((tag) => formatSkillLabel(tag))
        .join(', ') || 'none'

    return [
      `Recent checklist mastery summary (${masterySummary.rangeStart} to ${masterySummary.rangeEnd}):`,
      `- Needs focus (stuck >=2): ${formatTags(masterySummary.needsFocus)}`,
      `- Still working: ${formatTags(masterySummary.stillWorking)}`,
      `- Got it / skip candidates (got-it >=3): ${formatTags(masterySummary.gotIt)}`,
      'Use this to prioritize "needs focus", keep "still working" in rotation, and reduce or review-only "got it" skills.',
    ].join('\n')
  }, [masterySummary])

  const masteryReviewLine = useMemo(() => {
    if (!masterySummary) return ''
    const formatSkillLabel = (tag: string) => {
      const mapped = SKILL_TAG_MAP[tag]?.label
      if (mapped) return mapped
      const fallback = tag.split('.').pop() ?? tag
      return fallback
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())
    }
    const short = (tags: string[]) =>
      tags.slice(0, 2).map((tag) => formatSkillLabel(tag)).join(', ')
    const hasFocus = masterySummary.needsFocus.length > 0
    const hasSkip = masterySummary.gotIt.length > 0
    if (!hasFocus && !hasSkip) return ''
    const parts: string[] = []
    if (hasFocus) parts.push(`Focus: ${short(masterySummary.needsFocus)}`)
    if (hasSkip) parts.push(`Skip candidates: ${short(masterySummary.gotIt)}`)
    return parts.join(' · ')
  }, [masterySummary])

  // FEAT-72: snapshot priority tags target the parse-time catalog-tag backfill
  // (parseAIResponse) so AI-plan items land on tags the FEAT-68/69 re-test bridge
  // can map. Empty is fine — the backfill still stamps subject-default tags.
  const prioritySkillTags = useMemo(
    () => snapshot?.prioritySkills.map((s) => s.tag) ?? [],
    [snapshot],
  )

  // Load week plan (theme/virtue/scripture/heartQuestion)
  const weekPlanRef = useMemo(
    () => doc(weeksCollection(familyId), weekRange.start),
    [familyId, weekRange.start],
  )

  useEffect(() => {
    const unsubscribe = onSnapshot(weekPlanRef, async (snap) => {
      if (snap.exists()) {
        setWeekPlan(snap.data() as WeekPlan)
      } else {
        const defaultPlan: WeekPlan = {
          startDate: weekRange.start,
          endDate: weekRange.end,
          theme: '',
          virtue: '',
          scriptureRef: '',
          heartQuestion: '',
          tracks: [],
          flywheelPlan: '',
          buildLab: { title: '', materials: [], steps: [] },
          childGoals: children.map((c) => ({ childId: c.id, goals: [] })),
        }
        await setDoc(weekPlanRef, defaultPlan)
      }
    })
    return unsubscribe
  }, [weekPlanRef, weekRange.start, weekRange.end, children])

  const debouncedWriteWeekField = useDebounce(
    (field: string, value: string) => {
      void updateDoc(weekPlanRef, { [field]: value })
    },
    800,
  )

  const updateWeekField = useCallback(
    (field: keyof WeekPlan, value: string) => {
      if (!weekPlan) return
      setWeekPlan({ ...weekPlan, [field]: value })
      debouncedWriteWeekField(field, value)
    },
    [weekPlan, debouncedWriteWeekField],
  )

  // Persist book change to plannerDefaults + weekPlan (used in review/active phases)
  const handleBookChangeAndPersist = useCallback((book: ChapterBook | null) => {
    handleSelectedBookChange(book)
    // Persist to plannerDefaults
    void setDoc(doc(db, `families/${familyId}/settings/plannerDefaults`), {
      readAloudBook: book?.title ?? '',
      readAloudBookId: book?.id ?? null,
      updatedAt: new Date().toISOString(),
    }, { merge: true })
    // If plan is already applied, also update the week document
    if (applied) {
      void updateDoc(weekPlanRef, {
        ...(book ? { readAloudBookId: book.id } : { readAloudBookId: null }),
      })
    }
  }, [handleSelectedBookChange, familyId, applied, weekPlanRef])

  // Add welcome message on first load when child is selected (only after setup wizard is complete)
  useEffect(() => {
    if (!activeChildId || messages.length > 0 || !setupComplete) return
    const welcomeParts = [
      `Planning week of ${weekRange.start} for ${activeChild?.name ?? 'your child'}.`,
    ]
    if (snapshot && snapshot.prioritySkills.length > 0) {
      welcomeParts.push(
        `\nSkill focus: ${snapshot.prioritySkills.map((s) => `${s.label} (${s.level})`).join(', ')}.`,
      )
    }
    welcomeParts.push('\nUpload workbook photos and label them, or type assignments. I\'ll build your week plan.')

    const welcomeMsg: ChatMessage = {
      id: generateItemId(),
      role: ChatMessageRole.Assistant,
      text: welcomeParts.join(''),
      createdAt: new Date().toISOString(),
    }
    setMessages([welcomeMsg])
  }, [activeChildId, snapshot, weekRange.start, activeChild?.name, messages.length, setupComplete])

  // Auto-scroll on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-suggest weekly focus: skip regeneration if focus was generated this week
  useEffect(() => {
    if (!weekPlan || !activeChildId || setupComplete) return
    if (autoSuggestTriggered.current) return

    const isEmpty = !weekPlan.theme && !weekPlan.virtue && !weekPlan.scriptureRef && !weekPlan.heartQuestion
    const focusAge = weekPlan.focusGeneratedAt
      ? Date.now() - new Date(weekPlan.focusGeneratedAt).getTime()
      : Infinity
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
    const isStale = focusAge > SEVEN_DAYS

    // If focus already exists and is fresh, no auto-trigger needed — wizard will reuse it
    if (!isEmpty && !isStale) {
      autoSuggestTriggered.current = true
      return
    }
  }, [weekPlan, activeChildId, setupComplete])

  // Persist conversation (draft is saved server-side to plannerConversations and
  // restored on reload). FEAT-110: every caller invokes this fire-and-forget
  // (`void persistConversation(...)`), so a rejecting read here would reach the
  // app-root ErrorBoundary's global unhandledrejection listener and crash the
  // page. Mobile backgrounds the tab mid-generation → the socket drops → the
  // pre-write `getDoc` rejects with the transient offline code. We retry that
  // read through a reconnect, and on exhaustion swallow it with an honest,
  // non-crashing notice (the draft stays in client state and re-persists on the
  // next turn). Genuine faults (permission-denied, etc.) still rethrow → boundary.
  const persistConversation = useCallback(
    // FEAT-112 follow-up: `target` overrides the doc id + weekKey so a
    // forward-shifted apply persists the applied conversation under the SHIFTED
    // week (not the stale one it was drafted in). Omitted everywhere else → the
    // live `conversationDocId` / `weekRange.start`, unchanged.
    async (updates: Partial<PlannerConversation>, target?: { docId: string; weekKey: string }) => {
      const docId = target?.docId ?? conversationDocId
      const weekKey = target?.weekKey ?? weekRange.start
      if (!activeChildId || !docId) return
      const ref = doc(plannerConversationsCollection(familyId), docId)
      try {
        const snap = await withTransientRetry(() => getDoc(ref))
        const now = new Date().toISOString()
        if (snap.exists()) {
          await setDoc(ref, { ...snap.data(), ...updates, updatedAt: now })
        } else {
          const conversation: PlannerConversation = {
            childId: activeChildId,
            weekKey,
            status: PlannerConversationStatus.Draft,
            messages: [],
            availableHoursPerDay: hoursPerDay,
            appBlocks: filteredAppBlocks,
            assignments: [],
            createdAt: now,
            updatedAt: now,
            ...updates,
          }
          await setDoc(ref, conversation)
        }
      } catch (err) {
        if (err instanceof TransientConnectivityError) {
          // The read-modify-write's pre-read can't complete offline (reads reject;
          // they don't queue). But a merge WRITE still enters the Firestore SDK's
          // in-memory mutation queue and flushes on the next reconnect — so we
          // don't drop the draft, we queue it, honoring the "will sync" notice.
          // (This app uses the default in-memory cache, so a same-session reconnect
          // syncs; surviving a hard reload/eviction before reconnect is the deferred
          // durable-draft work — the draft also stays in React state meanwhile.)
          const now = new Date().toISOString()
          void setDoc(ref, { ...updates, updatedAt: now }, { merge: true }).catch(
            (writeErr) => console.warn('[Planner] Queued conversation save failed', writeErr),
          )
          console.warn('[Planner] Conversation read offline — queued a merge write to sync on reconnect', err)
          setSnack({
            text: 'You went offline — your draft is saved here and will sync when you reconnect.',
            severity: 'info',
          })
          return
        }
        throw err
      }
    },
    [familyId, conversationDocId, activeChildId, weekRange.start, hoursPerDay, filteredAppBlocks],
  )

  // Cached base64 images for vision API (cleared after plan generation)
  const photoBase64Cache = useRef<Map<string, { data: string; mediaType: string }>>(new Map())

  // Photo upload handler — also caches base64 for vision analysis
  const handlePhotoCapture = useCallback(
    async (file: File): Promise<string | null> => {
      if (!activeChildId) return null
      setUploading(true)
      try {
        const artifact = {
          title: `Workbook page`,
          type: EvidenceType.Photo,
          createdAt: new Date().toISOString(),
          childId: activeChildId,
          tags: {
            engineStage: EngineStage.Wonder,
            domain: 'planner',
            subjectBucket: SubjectBucket.Other,
            location: 'Home',
          },
          notes: 'Uploaded for chat planner',
        }
        const docRef = await addDoc(artifactsCollection(familyId), artifact)
        const ext = file.name.split('.').pop() ?? 'jpg'
        const filename = generateFilename(ext)
        await uploadArtifactFile(familyId, docRef.id, file, filename)

        // Cache base64 for vision API analysis (read file once)
        try {
          const reader = new FileReader()
          const base64Promise = new Promise<string>((resolve) => {
            reader.onload = () => {
              const result = reader.result as string
              // Strip data URL prefix to get raw base64
              const base64 = result.split(',')[1] ?? ''
              resolve(base64)
            }
          })
          reader.readAsDataURL(file)
          const base64Data = await base64Promise
          if (base64Data) {
            photoBase64Cache.current.set(docRef.id, {
              data: base64Data,
              mediaType: file.type || 'image/jpeg',
            })
          }
        } catch {
          // Non-fatal: vision analysis will fall back to text-only
        }

        return docRef.id
      } catch (err) {
        console.error('Photo upload failed', err)
        setSnack({ text: 'Photo upload failed.', severity: 'error' })
        return null
      } finally {
        setUploading(false)
      }
    },
    [activeChildId, familyId],
  )

  // Scan a workbook page (upload + AI skill analysis)
  const handleScanCapture = useCallback(
    async (file: File) => {
      if (!activeChildId) return
      await runScan(file, familyId, activeChildId)
    },
    [activeChildId, familyId, runScan],
  )

  // Accept a scan result — add as a photo label with auto-filled fields
  const handleScanAccept = useCallback(() => {
    if (!scanRecord?.results) return
    const r = scanRecord.results
    // Only worksheet/workbook scans can become photo labels — skip certificates
    if (r.pageType === 'certificate') return
    // Map scan subject to SubjectBucket
    const subjectMap: Record<string, SubjectBucket> = {
      math: SubjectBucket.Math,
      reading: SubjectBucket.Reading,
      writing: SubjectBucket.LanguageArts,
      spelling: SubjectBucket.LanguageArts,
      phonics: SubjectBucket.Reading,
      science: SubjectBucket.Science,
    }
    const subject = subjectMap[r.subject] ?? SubjectBucket.Other
    const newLabel: PhotoLabel = {
      artifactId: scanRecord.id ?? `scan-${Date.now()}`,
      subjectBucket: subject,
      lessonOrPages: r.specificTopic,
      estimatedMinutes: r.estimatedMinutes,
      extractedContent: {
        subject: r.subject,
        lessonNumber: '',
        topic: r.specificTopic,
        estimatedMinutes: r.estimatedMinutes,
        difficulty: r.estimatedDifficulty,
        modifications: r.teacherNotes,
        rawDescription: `${r.specificTopic} (${r.recommendation}: ${r.recommendationReason})`,
      },
    }
    setPhotoLabels((prev) => {
      // Deduplicate by artifactId
      if (prev.some((l) => l.artifactId === newLabel.artifactId)) {
        return prev
      }
      return [...prev, newLabel]
    })
    void recordScanAction(familyId, scanRecord, 'added')
    clearScan()
  }, [scanRecord, familyId, recordScanAction, clearScan])

  // Extract photo content using AI vision (analyzes actual image) with text-only fallback
  const extractPhotoContent = useCallback(async (
    userLabel: string,
    subject: SubjectBucket,
    imageBase64?: string,
    imageMediaType?: string,
  ): Promise<PhotoContentExtraction | null> => {
    if (!activeChildId) return null

    // Find matching workbook config for richer context
    const matchingConfig = workbookConfigs.find((c) => c.subjectBucket === subject)
    const configContext = matchingConfig
      ? `\nKnown workbook: "${matchingConfig.name}" (${matchingConfig.subjectBucket}), currently at ${matchingConfig.unitLabel} ${matchingConfig.currentPosition} of ${matchingConfig.totalUnits}, target finish: ${matchingConfig.targetFinishDate}.`
      : ''

    try {
      let response: { message: string } | null = null

      // Vision path: send actual image to Claude for analysis
      if (imageBase64) {
        response = await aiChat({
          familyId,
          childId: activeChildId,
          taskType: TaskType.AnalyzeWorkbook,
          messages: [{
            role: 'user',
            content: JSON.stringify({
              imageBase64,
              mediaType: imageMediaType || 'image/jpeg',
              textLabel: `${userLabel} (subject: ${subject})${configContext}`,
            }),
          }],
        })
      }

      // Text-only fallback when no image or vision call failed
      if (!response?.message) {
        response = await aiChat({
          familyId,
          childId: activeChildId,
          taskType: TaskType.Generate,
          messages: [{
            role: 'user',
            content: `I'm uploading a photo of homeschool materials labeled "${userLabel}" (subject: ${subject}).${configContext}

Please extract:
1. Subject (math, reading, phonics, science, etc.)
2. Specific lesson/chapter number if visible
3. Topic or skill covered
4. Estimated time to complete
5. Difficulty observations (too many problems? needs modification?)
6. Any specific instructions visible on the page

Return as JSON:
{
  "subject": "...",
  "lessonNumber": "...",
  "topic": "...",
  "estimatedMinutes": 0,
  "difficulty": "...",
  "modifications": "...",
  "rawDescription": "..."
}`,
          }],
        })
      }

      if (!response?.message) return null

      // Try to parse the JSON from the response
      const jsonMatch = response.message.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return null

      const parsed = JSON.parse(jsonMatch[0]) as PhotoContentExtraction

      // Attach workbook match if found
      if (matchingConfig) {
        parsed.workbookMatch = {
          workbookName: matchingConfig.name,
          totalUnits: matchingConfig.totalUnits,
          currentPosition: matchingConfig.currentPosition,
          unitLabel: matchingConfig.unitLabel,
        }
      }

      return parsed
    } catch (err) {
      console.error('Photo content extraction failed', err)
      return null
    }
  }, [aiChat, familyId, activeChildId, workbookConfigs])

  // Submit photos and generate plan (AI path with local fallback)
  const handleSubmitPhotos = useCallback(async () => {
    if (photoLabels.length === 0) return

    // Attempt AI-based content extraction for labels without existing extracted content
    // Uses vision API when base64 image data is cached, otherwise falls back to text analysis
    if (isEnabled(AIFeatureFlag.AiPlanning) && activeChildId) {
      const enriched = await Promise.all(
        photoLabels.map(async (label) => {
          if (label.extractedContent || !label.lessonOrPages.trim()) return label
          const cached = photoBase64Cache.current.get(label.artifactId)
          const extracted = await extractPhotoContent(
            label.lessonOrPages,
            label.subjectBucket,
            cached?.data,
            cached?.mediaType,
          )
          if (extracted) return { ...label, extractedContent: extracted }
          return label
        }),
      )
      setPhotoLabels(enriched)
      // Clear base64 cache after extraction to free memory
      photoBase64Cache.current.clear()
    }

    const assignments = photoLabelsToAssignments(photoLabels)

    // Add user message with photo labels
    const userMsg: ChatMessage = {
      id: generateItemId(),
      role: ChatMessageRole.User,
      text: `Uploaded ${photoLabels.length} workbook photo${photoLabels.length > 1 ? 's' : ''}.`,
      photoLabels,
      createdAt: new Date().toISOString(),
    }

    const mergedPhotoDefaults = { ...DEFAULT_SUBJECT_MINUTES, ...subjectTimeDefaults }
    const inputs = { snapshot, hoursPerDay, appBlocks: filteredAppBlocks, assignments, adjustments, dailyRoutine: filteredDailyRoutine, subjectTimeDefaults: mergedPhotoDefaults }
    let draft: DraftWeeklyPlan
    let usedAI = false

    if (isEnabled(AIFeatureFlag.AiPlanning) && activeChildId) {
      // AI path: send context to Cloud Function
      const prompt = buildPlannerPrompt(inputs)
      const photoContext = buildPhotoContextSection(photoLabels)
      const fullPrompt = [prompt, masteryPromptContext, photoContext].filter(Boolean).join('\n\n')
      const aiMessages: AIChatMessage[] = [{ role: 'user', content: fullPrompt }]
      const response = await aiChat({
        familyId,
        childId: activeChildId,
        taskType: TaskType.Plan,
        messages: aiMessages,
      })

      const rawAiDraft = response ? parseAIResponse(response, prioritySkillTags) : null
      if (rawAiDraft) {
        const fillResult = fillMissingDaysFromRoutine(rawAiDraft, filteredDailyRoutine, hoursPerDay)
        draft = ensureEvaluationItems(fillResult.plan)
        usedAI = true
        if (fillResult.filledDays.length > 0) {
          setSnack({
            text: `AI plan was incomplete — ${fillResult.filledDays.join(', ')} filled from routine. Consider regenerating.`,
            severity: 'warning',
          })
        }
      } else {
        // Fallback to local logic
        draft = ensureEvaluationItems(generateDraftPlanFromInputs(inputs))
        setSnack({ text: 'AI planning unavailable — used local planner.', severity: 'info' })
      }
    } else {
      // Local path (flag off)
      draft = ensureEvaluationItems(generateDraftPlanFromInputs(inputs))
    }

    setCurrentDraft(draft)

    // Assistant response with draft
    const aiLabel = usedAI ? ' (AI-powered)' : ''
    const assistantMsg: ChatMessage = {
      id: generateItemId(),
      role: ChatMessageRole.Assistant,
      text: `Here's your draft plan${aiLabel} based on ${photoLabels.length} workbook page${photoLabels.length > 1 ? 's' : ''}. ${draft.skipSuggestions.length > 0 ? `I have ${draft.skipSuggestions.length} suggestion${draft.skipSuggestions.length > 1 ? 's' : ''} based on the skill snapshot.` : ''} You can adjust by saying things like "make Wed light" or "move math to Tue/Thu".`,
      draftPlan: draft,
      createdAt: new Date().toISOString(),
    }

    const updatedMessages = [...messages, userMsg, assistantMsg]
    setMessages(updatedMessages)

    void persistConversation({
      messages: updatedMessages,
      currentDraft: draft,
      assignments,
    })
  }, [photoLabels, snapshot, prioritySkillTags, hoursPerDay, filteredAppBlocks, adjustments, filteredDailyRoutine, messages, persistConversation, isEnabled, activeChildId, familyId, aiChat, extractPhotoContent, subjectTimeDefaults, masteryPromptContext])

  // Generate Plan button handler (AI path with local fallback)
  const handleGeneratePlan = useCallback(async () => {
    const assignments = photoLabelsToAssignments(photoLabels)

    const userMsg: ChatMessage = {
      id: generateItemId(),
      role: ChatMessageRole.User,
      text: photoLabels.length > 0
        ? `Generate a plan with ${photoLabels.length} assignment${photoLabels.length > 1 ? 's' : ''}.`
        : 'Generate a plan for this week.',
      photoLabels: photoLabels.length > 0 ? photoLabels : undefined,
      createdAt: new Date().toISOString(),
    }

    const mergedDefaults = { ...DEFAULT_SUBJECT_MINUTES, ...subjectTimeDefaults }
    const inputs = { snapshot, hoursPerDay, appBlocks: filteredAppBlocks, assignments, adjustments, dailyRoutine: filteredDailyRoutine, subjectTimeDefaults: mergedDefaults }
    let draft: DraftWeeklyPlan
    let usedAI = false

    if (isEnabled(AIFeatureFlag.AiPlanning) && activeChildId) {
      const prompt = buildPlannerPrompt(inputs)
      const photoContext = buildPhotoContextSection(photoLabels)
      const fullPrompt = [prompt, masteryPromptContext, photoContext].filter(Boolean).join('\n\n')
      const aiMessages: AIChatMessage[] = [
        ...messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.text ?? '',
        })),
        { role: 'user' as const, content: fullPrompt },
      ]
      let response: Awaited<ReturnType<typeof aiChat>> | null = null
      try {
        response = await aiChat({
          familyId,
          childId: activeChildId,
          taskType: TaskType.Plan,
          messages: aiMessages,
        })
      } catch (err) {
        console.error('[handleGeneratePlan] AI call failed:', err)
        setSnack({
          text: `AI planning error: ${err instanceof Error ? err.message : 'Unknown error'}. Using local planner.`,
          severity: 'warning' as const,
        })
      }

      const rawAiDraft = response ? parseAIResponse(response, prioritySkillTags) : null
      if (rawAiDraft) {
        const fillResult = fillMissingDaysFromRoutine(rawAiDraft, filteredDailyRoutine, hoursPerDay)
        draft = ensureEvaluationItems(fillResult.plan)
        usedAI = true
        if (fillResult.filledDays.length > 0) {
          setSnack({
            text: `AI plan was incomplete — ${fillResult.filledDays.join(', ')} filled from routine. Consider regenerating.`,
            severity: 'warning',
          })
        }
      } else {
        draft = ensureEvaluationItems(generateDraftPlanFromInputs(inputs))
        if (!response) {
          // AI call threw — snack already set above
        } else {
          console.warn('[handleGeneratePlan] AI response unparseable:', response.message.substring(0, 500))
          setSnack({
            text: 'AI plan could not be read — using your routine as the base. You can try "Generate Plan" again or adjust the plan below.',
            severity: 'info',
          })
        }
      }
    } else {
      draft = ensureEvaluationItems(generateDraftPlanFromInputs(inputs))
    }

    setCurrentDraft(draft)

    const aiLabel = usedAI ? ' (AI-powered)' : ''
    const assistantMsg: ChatMessage = {
      id: generateItemId(),
      role: ChatMessageRole.Assistant,
      text: `Here's your draft plan${aiLabel}. ${draft.skipSuggestions.length > 0 ? `I have ${draft.skipSuggestions.length} suggestion${draft.skipSuggestions.length > 1 ? 's' : ''} based on the skill snapshot. ` : ''}You can adjust by saying things like "make Wed light" or "move math to Tue/Thu".`,
      draftPlan: draft,
      createdAt: new Date().toISOString(),
    }

    const updatedMessages = [...messages, userMsg, assistantMsg]
    setMessages(updatedMessages)

    void persistConversation({
      messages: updatedMessages,
      currentDraft: draft,
      assignments,
    })
  }, [photoLabels, snapshot, prioritySkillTags, hoursPerDay, filteredAppBlocks, adjustments, filteredDailyRoutine, messages, persistConversation, isEnabled, activeChildId, familyId, aiChat, subjectTimeDefaults, masteryPromptContext])

  // Handle text message send (AI path for free-form with local fallback)
  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? inputText).trim()
    if (!text) return

    // ── Detect plan-generation intent and redirect ──
    // If the user types something like "generate a plan" or "build my schedule"
    // and no draft exists yet, route through handleGeneratePlan for full context.
    const isPlanRequest = /\b(generate|create|build|make)\b.*\b(plan|schedule|week)\b/i.test(text)
    if (isPlanRequest && !currentDraft) {
      setInputText('')
      // Add the user message to chat for visual continuity
      const userMsg: ChatMessage = {
        id: generateItemId(),
        role: ChatMessageRole.User,
        text,
        createdAt: new Date().toISOString(),
      }
      setMessages(prev => [...prev, userMsg])
      // Trigger the real plan generation flow with full context
      await handleGeneratePlan()
      return
    }

    const userMsg: ChatMessage = {
      id: generateItemId(),
      role: ChatMessageRole.User,
      text,
      createdAt: new Date().toISOString(),
    }

    // ── AI-powered path ──────────────────────────────────────────
    if (isEnabled(AIFeatureFlag.AiPlanning) && activeChildId) {
      const updatedWithUser = [...messages, userMsg]
      setMessages(updatedWithUser)
      setInputText('')

      // When a draft already exists, include it + JSON schema so the AI returns structured JSON
      let adjustmentContent: string | null = null
      if (currentDraft) {
        adjustmentContent = [
          'Current plan:',
          JSON.stringify(currentDraft, null, 2),
          `User adjustment: "${text}"`,
          '',
          'IMPORTANT: When removing items from one day, redistribute those minutes to other days.',
          'Move the removed activities to Tue-Fri so the weekly total stays the same.',
          'Do NOT just delete activities — move them to days with remaining capacity.',
          '',
          `Apply the adjustment and return the COMPLETE updated plan as valid JSON with this schema:`,
          `{ "days": [{ "day": "Monday", "timeBudgetMinutes": ${Math.round(hoursPerDay * 60)}, "items": [{ "title": "string", "subjectBucket": "Reading|Math|LanguageArts|Science|SocialStudies|Other", "estimatedMinutes": 15, "skillTags": [], "isAppBlock": false, "accepted": true }] }], "skipSuggestions": [], "minimumWin": "string" }`,
          `Respect hours budget of ${hoursPerDay} hours/day. No markdown, no preamble — only valid JSON.`,
        ].join('\n')
      }

      const aiMessages: AIChatMessage[] = [
        ...updatedWithUser.slice(0, -1).map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.text ?? '',
        })),
        { role: 'user' as const, content: adjustmentContent ?? text },
      ]
      const response = await aiChat({
        familyId,
        childId: activeChildId,
        taskType: TaskType.Plan,
        messages: aiMessages,
      })

      // Try to parse as structured DraftWeeklyPlan JSON
      const rawAiDraft = response ? parseAIResponse(response, prioritySkillTags) : null
      const aiDraft = rawAiDraft ? ensureEvaluationItems(rawAiDraft) : null
      let assistantMsg: ChatMessage
      if (aiDraft) {
        setCurrentDraft(aiDraft)
        assistantMsg = {
          id: generateItemId(),
          role: ChatMessageRole.Assistant,
          text: 'Here\'s the updated plan based on your request:',
          draftPlan: aiDraft,
          createdAt: new Date().toISOString(),
        }
      } else if (response?.message && looksLikePlanJson(response.message)) {
        // AI returned plan-like JSON but parseAIResponse failed — try aggressive recovery
        let rawRecovered: DraftWeeklyPlan | null = null
        try {
          const msg = response.message.trim()
          const stripped = msg.replace(/```(?:json)?\s*/g, '').replace(/\s*```/g, '').trim()
          const directParse = JSON.parse(stripped)
          if (directParse.days && Array.isArray(directParse.days)) {
            rawRecovered = parseAIResponse({ ...response, message: JSON.stringify(directParse) }, prioritySkillTags)
          }
        } catch { /* fall through to local planner */ }

        const recovered = rawRecovered ? ensureEvaluationItems(rawRecovered) : null
        if (recovered) {
          setCurrentDraft(recovered)
          assistantMsg = {
            id: generateItemId(),
            role: ChatMessageRole.Assistant,
            text: 'Here\'s your draft plan. You can adjust by saying things like "make Wed light" or "move math to Tue/Thu".',
            draftPlan: recovered,
            createdAt: new Date().toISOString(),
          }
        } else {
          // Recovery failed — fall back to local planner
          const assignments = photoLabelsToAssignments(photoLabels)
          const localDraft = ensureEvaluationItems(generateDraftPlanFromInputs({
            snapshot, hoursPerDay, appBlocks: filteredAppBlocks, assignments, adjustments, dailyRoutine: filteredDailyRoutine,
            subjectTimeDefaults: { ...DEFAULT_SUBJECT_MINUTES, ...subjectTimeDefaults },
          }))
          setCurrentDraft(localDraft)
          assistantMsg = {
            id: generateItemId(),
            role: ChatMessageRole.Assistant,
            text: 'The AI plan had formatting issues — here\'s a plan from the local planner instead. You can adjust it or try "Generate Plan" again.',
            draftPlan: localDraft,
            createdAt: new Date().toISOString(),
          }
          setSnack({ text: 'AI response had formatting issues — used local planner.', severity: 'info' })
        }
      } else {
        // Non-plan text response (conversational reply) or service unavailable
        assistantMsg = {
          id: generateItemId(),
          role: ChatMessageRole.Assistant,
          text: response?.message ?? 'Sorry, the AI service is unavailable right now. Try again or disable AI planning in Settings.',
          createdAt: new Date().toISOString(),
        }
      }

      const final = [...updatedWithUser, assistantMsg]
      setMessages(final)
      const persistStatus = applied ? { status: PlannerConversationStatus.Applied } : {}
      void persistConversation({ messages: final, currentDraft: aiDraft ?? currentDraft ?? undefined, ...persistStatus })
      return
    }

    // ── Local logic path ─────────────────────────────────────────

    // Check for coverage question first
    const isCoverageQuestion = /what.*(cover|topic|schedul|plan)|cover.*week|summary/i.test(text)

    // Try to parse as adjustment intent
    const intent = parseAdjustmentIntent(text)
    let assistantMsg: ChatMessage

    if (isCoverageQuestion && currentDraft) {
      // Answer coverage question with summary
      const prioritySkills = snapshot?.prioritySkills ?? []
      const entries = buildCoverageSummary(currentDraft, prioritySkills)
      const summaryText = formatCoverageSummaryText(entries, prioritySkills)
      assistantMsg = {
        id: generateItemId(),
        role: ChatMessageRole.Assistant,
        text: summaryText,
        createdAt: new Date().toISOString(),
      }
    } else if (intent && currentDraft) {
      // Apply adjustment and regenerate
      const newAdjustments = [...adjustments, intent]
      const assignments = photoLabelsToAssignments(photoLabels)
      const draft = ensureEvaluationItems(generateDraftPlanFromInputs({
        snapshot,
        hoursPerDay,
        appBlocks: filteredAppBlocks,
        assignments,
        adjustments: newAdjustments,
        subjectTimeDefaults: { ...DEFAULT_SUBJECT_MINUTES, ...subjectTimeDefaults },
      }))

      setCurrentDraft(draft)
      setAdjustments(newAdjustments)
      assistantMsg = {
        id: generateItemId(),
        role: ChatMessageRole.Assistant,
        text: describeAdjustment(intent) + ' Here\'s the updated plan:',
        draftPlan: draft,
        createdAt: new Date().toISOString(),
      }
    } else if (!currentDraft && photoLabels.length === 0) {
      // No plan yet, suggest uploading photos
      assistantMsg = {
        id: generateItemId(),
        role: ChatMessageRole.Assistant,
        text: 'Upload some workbook photos first, or tap the camera button to get started. Label each photo with the subject and estimated time, then I\'ll generate your plan.',
        createdAt: new Date().toISOString(),
      }
    } else if (!currentDraft) {
      // Photos uploaded but not submitted
      assistantMsg = {
        id: generateItemId(),
        role: ChatMessageRole.Assistant,
        text: 'Looks like you have photos ready. Tap "Generate Plan" to see your draft week plan.',
        createdAt: new Date().toISOString(),
      }
    } else {
      // Unrecognized intent with existing plan (no AI)
      assistantMsg = {
        id: generateItemId(),
        role: ChatMessageRole.Assistant,
        text: 'I didn\'t catch that adjustment. Try something like:\n- "Make Wed light"\n- "Move math to Tue/Thu"\n- "Reduce writing"\n- "Cap math at 15 min"\n- "What\'s covered this week?"\n\nOr tap a quick adjustment below, or "Apply Plan" when you\'re happy.',
        createdAt: new Date().toISOString(),
      }
    }

    const updatedMessages = [...messages, userMsg, assistantMsg]
    setMessages(updatedMessages)
    setInputText('')

    void persistConversation({
      messages: updatedMessages,
      currentDraft: currentDraft ?? undefined,
      ...(applied ? { status: PlannerConversationStatus.Applied } : {}),
    })
  }, [inputText, currentDraft, adjustments, photoLabels, snapshot, prioritySkillTags, hoursPerDay, filteredAppBlocks, messages, persistConversation, isEnabled, activeChildId, aiChat, familyId, applied, filteredDailyRoutine, handleGeneratePlan, subjectTimeDefaults])

  const buildWeekFocusContext = useCallback(() => {
    const contextParts: string[] = []
    if (readAloudBook) {
      contextParts.push(`Read-aloud book this week: ${readAloudBook}${readAloudChapters ? ` (${readAloudChapters})` : ''}. Connect the readingTieIn to this book's themes.`)
    }
    if (weekNotes) {
      contextParts.push(`Parent notes: ${weekNotes}`)
    }
    if (workbookConfigs.length > 0) {
      contextParts.push('Configured workbooks this week:')
      contextParts.push(...workbookConfigs.map((wb) => `- ${wb.name}: ${wb.unitLabel} ${wb.currentPosition + 1} (${wb.subjectBucket})`))
    }
    return contextParts.join('\n')
  }, [readAloudBook, readAloudChapters, weekNotes, workbookConfigs])

  const parsePlanThemeFields = useCallback((message: string): Partial<WeekPlan> | null => {
    try {
      let json = message.trim()
      const fenceMatch = json.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (fenceMatch) json = fenceMatch[1].trim()
      const firstBrace = json.indexOf('{')
      const lastBrace = json.lastIndexOf('}')
      if (firstBrace >= 0 && lastBrace > firstBrace) json = json.slice(firstBrace, lastBrace + 1)
      const parsed = JSON.parse(json)
      const payload = parsed?.plan && typeof parsed.plan === 'object' ? parsed.plan : parsed
      return {
        ...(payload.theme ? { theme: payload.theme } : {}),
        ...(payload.virtue ? { virtue: payload.virtue } : {}),
        ...(payload.scriptureRef ? { scriptureRef: payload.scriptureRef } : {}),
        ...(payload.scriptureText ? { scriptureText: payload.scriptureText } : {}),
        ...(payload.heartQuestion ? { heartQuestion: payload.heartQuestion } : {}),
        ...(payload.formationPrompt ? { formationPrompt: payload.formationPrompt } : {}),
        ...(payload.conundrum?.title && payload.conundrum?.scenario ? { conundrum: payload.conundrum } : {}),
      }
    } catch (parseErr) {
      console.error('[PlanTheme] Failed to parse:', parseErr, '\nRaw response:', message)
      return null
    }
  }, [])

  const handleGenerateWeek = useCallback(async (kickoffText?: string, forceRefreshFocus?: boolean) => {
    if (!activeChildId || !weekPlan) return
    setGeneratingWeek(true)

    // Check if weekly focus (theme/virtue/scripture) is still fresh
    const hasFocus = !!(weekPlan.theme && weekPlan.virtue && weekPlan.scriptureRef)
    const focusAge = weekPlan.focusGeneratedAt
      ? Date.now() - new Date(weekPlan.focusGeneratedAt).getTime()
      : Infinity
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
    const focusIsFresh = hasFocus && focusAge < SEVEN_DAYS
    const skipFocusGeneration = focusIsFresh && !forceRefreshFocus

    try {
      const assignments = photoLabelsToAssignments(photoLabels)
      const userMsg: ChatMessage = {
        id: generateItemId(),
        role: ChatMessageRole.User,
        text: kickoffText ?? '✨ Generate this week\'s focus and plan.',
        createdAt: new Date().toISOString(),
      }
      const mergedDefaults = { ...DEFAULT_SUBJECT_MINUTES, ...subjectTimeDefaults }
      const inputs = { snapshot, hoursPerDay, appBlocks: filteredAppBlocks, assignments, adjustments, dailyRoutine: filteredDailyRoutine, subjectTimeDefaults: mergedDefaults }
      let draft: DraftWeeklyPlan
      let usedAI = false

      if (isEnabled(AIFeatureFlag.AiPlanning)) {
        const prompt = buildPlannerPrompt(inputs)
        const focusInstruction = skipFocusGeneration
          ? `Reuse this existing weekly focus (do NOT regenerate theme fields):\ntheme: ${weekPlan.theme}\nvirtue: ${weekPlan.virtue}\nscriptureRef: ${weekPlan.scriptureRef}\nheartQuestion: ${weekPlan.heartQuestion}\nGenerate ONLY the daily plan schedule (days[].items[]).`
          : 'Return one JSON payload that includes BOTH weekly themed content and the complete daily plan.\nInclude fields: theme, virtue, scriptureRef, scriptureText, heartQuestion, formationPrompt, conundrum, weekSkipSummary, days[].items[].'
        const fullPrompt = [
          prompt,
          masteryPromptContext,
          `Weekly focus context:\n${buildWeekFocusContext()}`,
          `Daily routine context:\n${filteredDailyRoutine}`,
          focusInstruction,
        ].filter(Boolean).join('\n\n')
        const response = await aiChat({
          familyId,
          childId: activeChildId,
          taskType: TaskType.Plan,
          messages: [{ role: 'user', content: fullPrompt }],
        })
        const rawAiDraft = response ? parseAIResponse(response, prioritySkillTags) : null
        if (rawAiDraft) {
          const fillResult = fillMissingDaysFromRoutine(rawAiDraft, filteredDailyRoutine, hoursPerDay)
          draft = ensureEvaluationItems(fillResult.plan)
          usedAI = true
          if (fillResult.filledDays.length > 0) {
            setSnack({
              text: `AI plan was incomplete — ${fillResult.filledDays.join(', ')} filled from routine. Consider regenerating.`,
              severity: 'warning',
            })
          }
          if (!skipFocusGeneration) {
            const themedFields = response ? parsePlanThemeFields(response.message) : null
            if (themedFields) {
              const withTimestamp = { ...themedFields, focusGeneratedAt: new Date().toISOString() }
              const nextWeekPlan = { ...weekPlan, ...withTimestamp }
              setWeekPlan(nextWeekPlan)
              await setDoc(weekPlanRef, withTimestamp, { merge: true })
            }
          }
        } else {
          draft = ensureEvaluationItems(generateDraftPlanFromInputs(inputs))
        }
      } else {
        draft = ensureEvaluationItems(generateDraftPlanFromInputs(inputs))
      }

      setCurrentDraft(draft)
      setSetupComplete(true)
      const assistantMsg: ChatMessage = {
        id: generateItemId(),
        role: ChatMessageRole.Assistant,
        text: `Here's your draft plan${usedAI ? ' (AI-powered)' : ''}.`,
        draftPlan: draft,
        createdAt: new Date().toISOString(),
      }
      const updatedMessages = [...messages, userMsg, assistantMsg]
      setMessages(updatedMessages)
      await persistConversation({ messages: updatedMessages, currentDraft: draft, assignments })
    } finally {
      setGeneratingWeek(false)
    }
  }, [activeChildId, weekPlan, photoLabels, subjectTimeDefaults, snapshot, prioritySkillTags, hoursPerDay, filteredAppBlocks, adjustments, filteredDailyRoutine, isEnabled, aiChat, familyId, messages, persistConversation, masteryPromptContext, buildWeekFocusContext, parsePlanThemeFields, weekPlanRef])

  // Setup wizard completion handler
  const handleSetupComplete = useCallback(async () => {
    const energyLabel =
      weekEnergy === 'full'
        ? 'normal energy'
        : weekEnergy === 'lighter'
          ? 'lighter week, reduce load'
          : 'MVD week, minimum items only'

    // Build workbook lines from configured existing workbooks (respect any chip exclusions)
    const includedWorkbooks = workbookConfigs.filter((wb) => !excludedWorkbookIds.has(wb.id ?? wb.name))
    const allWorkbookLines = [
      ...includedWorkbooks
        .map((wb) => `- ${wb.name}: ${wb.unitLabel} ${wb.currentPosition + 1} (${wb.subjectBucket})`),
    ].join('\n')

    // Save family-level planner defaults (weekEnergy drives hoursPerDay via useEffect)
    void setDoc(doc(db, `families/${familyId}/settings/plannerDefaults`), {
      weekEnergy,
      readAloudBook,
      readAloudChapters,
      readAloudBookId: selectedBook?.id ?? null,
      updatedAt: new Date().toISOString(),
    }, { merge: true })

    // Save per-child subject time defaults (dailyRoutine no longer saved — activity configs are the source of truth)
    if (activeChildId) {
      void setDoc(doc(db, `families/${familyId}/settings/plannerDefaults_${activeChildId}`), {
        subjectTimeDefaults,
        updatedAt: new Date().toISOString(),
      }, { merge: true })
    }

    // Build subject time defaults section for AI prompt
    const mergedDefaults = { ...DEFAULT_SUBJECT_MINUTES, ...subjectTimeDefaults }
    const subjectDefaultsLines = Object.entries(mergedDefaults)
      .map(([subject, minutes]) => {
        const label = subject === 'Other' ? 'Formation/Prayer' : subject === 'LanguageArts' ? 'Language Arts' : subject === 'SocialStudies' ? 'Social Studies' : subject
        return `- ${label}: ${minutes} min/day`
      })
      .join('\n')

    const contextMessage = `Plan ${activeChild?.name ?? 'my child'}'s week.

Energy: ${energyLabel}
Hours/day: ${hoursPerDay}

Workbooks:
${allWorkbookLines || '(none configured)'}
${readAloudBook ? `\nRead-aloud book: ${readAloudBook}${readAloudChapters ? ` (${readAloudChapters})` : ''}` : ''}

Subject time defaults (use these as the baseline for estimatedMinutes per item):
${subjectDefaultsLines}
${weekNotes ? `\nNotes: ${weekNotes}` : ''}

Generate a plan for Monday through Friday.`.trim()

    setForceSetup(false)
    await handleGenerateWeek(contextMessage, true)
  }, [weekEnergy, hoursPerDay, workbookConfigs, excludedWorkbookIds, readAloudBook, readAloudChapters, weekNotes, activeChild, activeChildId, familyId, subjectTimeDefaults, handleGenerateWeek, selectedBook])

  // "Repeat Last Week" — clone the most recent prior plan with advanced lesson numbers
  const handleRepeatLastWeek = useCallback(async () => {
    if (!lastPlanDraft) return
    setRepeatingWeek(true)
    try {
      const cloned = ensureEvaluationItems(clonePlanWithAdvancedLessons(lastPlanDraft))
      setCurrentDraft(cloned)
      setSetupComplete(true)
      setForceSetup(false)
      const repeatMsg: ChatMessage = {
        id: generateItemId(),
        role: ChatMessageRole.Assistant,
        text: 'Repeated last week’s plan with lesson numbers advanced. Review and apply, or adjust via chat below.',
        draftPlan: cloned,
        createdAt: new Date().toISOString(),
      }
      const updatedMessages = [...messages, repeatMsg]
      setMessages(updatedMessages)
      await persistConversation({
        messages: updatedMessages,
        currentDraft: cloned,
      })
    } finally {
      setRepeatingWeek(false)
    }
  }, [lastPlanDraft, messages, persistConversation])

  const handleEditSetup = useCallback(() => {
    setForceSetup(true)
  }, [])

  // Toggle plan item
  const handleToggleItem = useCallback((dayIndex: number, itemId: string) => {
    if (!currentDraft) return
    const updated: DraftWeeklyPlan = {
      ...currentDraft,
      days: currentDraft.days.map((day, i) => {
        if (i !== dayIndex) return day
        return {
          ...day,
          items: day.items.map((item) =>
            item.id === itemId ? { ...item, accepted: !item.accepted } : item,
          ),
        }
      }),
    }
    setCurrentDraft(updated)
    setPlanDirty(true)
  }, [currentDraft])

  const handleMoveItem = useCallback((dayIndex: number, itemIndex: number, direction: -1 | 1) => {
    if (!currentDraft) return
    const newIndex = itemIndex + direction
    const items = currentDraft.days[dayIndex].items
    if (newIndex < 0 || newIndex >= items.length) return
    const updated: DraftWeeklyPlan = {
      ...currentDraft,
      days: currentDraft.days.map((day, i) => {
        if (i !== dayIndex) return day
        const newItems = [...day.items]
        ;[newItems[itemIndex], newItems[newIndex]] = [newItems[newIndex], newItems[itemIndex]]
        return { ...day, items: newItems }
      }),
    }
    setCurrentDraft(updated)
    setPlanDirty(true)
  }, [currentDraft])

  // Watch Vehicle (FEAT-104): plan a curated video onto a day by picking from
  // the vetted library, scoped to this child (D7). The picker + append are the
  // manual "a parent plans a watch item" path; lock-in threads watchVideoId onto
  // the ChecklistItem exactly like bookId.
  const {
    videos: watchVideos,
    loading: watchLoading,
    error: watchError,
    addVideo: addWatchVideo,
  } = useWatchLibrary(activeChildId)
  const [watchPickerDay, setWatchPickerDay] = useState<number | null>(null)

  const handleAddWatchItem = useCallback((dayIndex: number, video: WatchVideo) => {
    if (!currentDraft) return
    const newItem: DraftPlanItem = {
      id: generateItemId(),
      title: `Watch: ${video.title}`,
      subjectBucket: video.subjectBucket,
      estimatedMinutes: video.plannedMinutes, // planned = actual (D3)
      skillTags: [], // non-curriculum — never a concept-graph input (C2/§6)
      accepted: true,
      category: 'choose',
      itemType: 'watch',
      watchVideoId: video.id,
    }
    setCurrentDraft({
      ...currentDraft,
      days: currentDraft.days.map((day, i) =>
        i === dayIndex ? { ...day, items: [...day.items, newItem] } : day,
      ),
    })
    setPlanDirty(true)
  }, [currentDraft])

  const handleRemoveItem = useCallback((dayIndex: number, itemIndex: number) => {
    if (!currentDraft) return
    const updated: DraftWeeklyPlan = {
      ...currentDraft,
      days: currentDraft.days.map((day, i) => {
        if (i !== dayIndex) return day
        const newItems = day.items.filter((_, idx) => idx !== itemIndex)
        return { ...day, items: newItems }
      }),
    }
    setCurrentDraft(updated)
    setPlanDirty(true)
  }, [currentDraft])

  const handleUpdateTime = useCallback((dayIndex: number, itemIndex: number, newMinutes: number) => {
    if (!currentDraft) return
    const clamped = Math.max(5, Math.min(120, newMinutes))
    const updated: DraftWeeklyPlan = {
      ...currentDraft,
      days: currentDraft.days.map((day, i) => {
        if (i !== dayIndex) return day
        const newItems = day.items.map((item, idx) =>
          idx === itemIndex ? { ...item, estimatedMinutes: clamped } : item,
        )
        return { ...day, items: newItems }
      }),
    }
    setCurrentDraft(updated)
    setPlanDirty(true)
  }, [currentDraft])

  // Map SubjectBucket to activity type for the generate Cloud Function
  const subjectToActivityType = useCallback((subject: SubjectBucket): string => {
    switch (subject) {
      case SubjectBucket.Reading: return 'reading'
      case SubjectBucket.LanguageArts: return 'phonics'
      case SubjectBucket.Math: return 'math'
      default: return 'other'
    }
  }, [])

  // Apply plan to WeekPlan + DayLogs
  const handleApplyPlan = useCallback(async (overrideWeekStart?: string) => {
    if (!activeChildId || !currentDraft) return

    // FEAT-112 backstop: never silently write a plan to a week that's already
    // passed. The live weekRange memo should already target the upcoming week,
    // but a stale tab (or a focus event that never fired) could still carry a
    // past week key here. If the whole Mon–Fri body is behind us, stop and offer
    // a one-tap forward-shift to the correct upcoming week instead of writing to
    // dead dates. An explicit override (the forward-shift itself) skips the guard.
    const effectiveWeekStart = overrideWeekStart ?? weekRange.start
    if (!overrideWeekStart && isPlanningWeekPast(effectiveWeekStart, todayKey())) {
      const shifted = getPlanningWeekRange(new Date()).start
      setPastWeekBlock({ attempted: effectiveWeekStart, shifted })
      return
    }
    setPastWeekBlock(null)

    try {
      // Step 1: Auto-generate lesson cards for non-app-block accepted items
      // Note: category is optional and often unset, so we include items that are
      // either explicitly 'must-do', have no category set, or are mvdEssential.
      const itemsNeedingCards = currentDraft.days
        .flatMap((d) => d.items)
        .filter((item) => item.accepted && !item.isAppBlock && item.category !== 'choose')
        // Deduplicate by title (same activity across days only needs one card)
        .filter((item, i, arr) => arr.findIndex((x) => x.title === item.title) === i)

      const lessonCardMap = new Map<string, string>() // title → lessonCardDocId

      if (itemsNeedingCards.length > 0) {
        setSnack({ text: `Preparing lesson cards... (0 of ${itemsNeedingCards.length})`, severity: 'info' })
        let completedCount = 0

        const batchSize = 3
        for (let i = 0; i < itemsNeedingCards.length; i += batchSize) {
          const batch = itemsNeedingCards.slice(i, i + batchSize)
          await Promise.allSettled(
            batch.map(async (item) => {
              try {
                console.log(`[LessonCards] Generating card for: "${item.title}" (${item.subjectBucket})`)
                const activityType = subjectToActivityType(item.subjectBucket)
                // Transient generation hint for the lesson-card CF only — NOT a persisted tag.
                // Persisted item tags come from the FEAT-72 parse-time catalog backfill
                // (parseAIResponse), so don't reintroduce `subject.general` onto skillTags.
                const skillTag = item.skillTags[0] || `${item.subjectBucket.toLowerCase()}.general`
                const response = await generateActivity({
                  familyId,
                  childId: activeChildId,
                  activityType,
                  skillTag,
                  estimatedMinutes: item.estimatedMinutes,
                })

                if (response?.activity) {
                  console.log(`[LessonCards] Generated card for: "${item.title}"`, response.activity.title)
                  const card: Omit<LessonCard, 'id'> = {
                    childId: activeChildId,
                    planItemId: item.id,
                    title: response.activity.title,
                    durationMinutes: item.estimatedMinutes,
                    objective: response.activity.objective,
                    materials: response.activity.materials,
                    steps: response.activity.steps,
                    supports: [],
                    evidenceChecks: response.activity.successCriteria,
                    skillTags: item.skillTags,
                    ...(item.ladderRef ? { ladderRef: item.ladderRef } : {}),
                    createdAt: new Date().toISOString(),
                  }
                  const docRef = await addDoc(lessonCardsCollection(familyId), card)
                  lessonCardMap.set(item.title, docRef.id)
                }
              } catch (err) {
                console.error(`[LessonCards] FAILED to generate card for "${item.title}":`, err)
                // Non-fatal — continue without card
              } finally {
                completedCount++
                setSnack({
                  text: `Preparing lesson cards... (${completedCount} of ${itemsNeedingCards.length})`,
                  severity: 'info',
                })
              }
            }),
          )
        }
        console.log(`[LessonCards] Generated ${lessonCardMap.size} of ${itemsNeedingCards.length} cards`, Object.fromEntries(lessonCardMap))
      }

      setSnack({ text: 'Applying plan...', severity: 'info' })

      // Step 2: Write WeekPlan update (upsert). A forward-shifted apply can
      // target a week whose WeekPlan doc the page never created (only the live
      // `weekRange.start` doc is auto-seeded), so childGoals must land even when
      // the doc is absent — otherwise the plan's days land on the shifted week
      // while its WeekPlan summary is missing (FEAT-112 follow-up).
      const weekRef = doc(weeksCollection(familyId), effectiveWeekStart)
      const weekSnap = await getDoc(weekRef)
      const planGoals = currentDraft.days
        .flatMap((d) => d.items)
        .filter((item) => item.accepted && !item.isAppBlock)
        .map((item) => item.title)
      if (weekSnap.exists()) {
        const existing = weekSnap.data()
        const existingGoals = existing.childGoals ?? []
        const childGoalIndex = existingGoals.findIndex(
          (g: { childId: string }) => g.childId === activeChildId,
        )
        const updatedGoals = [...existingGoals]
        if (childGoalIndex >= 0) {
          updatedGoals[childGoalIndex] = {
            ...updatedGoals[childGoalIndex],
            goals: [...updatedGoals[childGoalIndex].goals, ...planGoals],
          }
        } else {
          updatedGoals.push({ childId: activeChildId, goals: planGoals })
        }
        const { readAloudBookId: _existingReadAloudBookId, ...existingWithoutBook } = existing
        void _existingReadAloudBookId
        await setDoc(weekRef, {
          ...existingWithoutBook,
          childGoals: updatedGoals,
          ...(selectedBook ? { readAloudBookId: selectedBook.id } : {}),
        })
      } else {
        // Absent — typically the forward-shift target. Create the WeekPlan with
        // this child's goals, mirroring the default shape the weekPlanRef effect
        // seeds for the live week.
        await setDoc(
          weekRef,
          buildShiftedWeekPlan(effectiveWeekStart, children, activeChildId, planGoals, selectedBook?.id),
        )
      }

      // Persist readAloudBookId to plannerDefaults so it carries to the next week
      void setDoc(doc(db, `families/${familyId}/settings/plannerDefaults`), {
        readAloudBook: selectedBook?.title ?? '',
        ...(selectedBook
          ? { readAloudBookId: selectedBook.id }
          : { readAloudBookId: deleteField() }),
        updatedAt: new Date().toISOString(),
      }, { merge: true })

      // Write DayLog checklist items for each day
      for (const dayPlan of currentDraft.days) {
        const dayItems = dayPlan.items.filter((item) => item.accepted)
        if (dayItems.length === 0) continue
        if (!WEEK_DAYS.includes(dayPlan.day as typeof WEEK_DAYS[number])) continue

        const dateKey = dateKeyForDayPlan(effectiveWeekStart, dayPlan.day as typeof WEEK_DAYS[number])

        const docId = dayLogDocId(dateKey, activeChildId)
        const dayLogRef = doc(daysCollection(familyId), docId)
        const dayLogSnap = await getDoc(dayLogRef)

        const checklist: ChecklistItem[] = dayItems.map((item) => {
          // FEAT-62 join: stamp the scannable workbook config id while the config
          // identity is still recoverable (name/subject match). This is the only
          // point the item can know its workbook — the routine→item pipeline
          // round-trips through free text and drops the config id.
          const workbookConfigId = findWorkbookConfigId(
            { label: item.title, subjectBucket: item.subjectBucket },
            activityConfigs,
          )
          return {
            label: `${item.title} (${item.estimatedMinutes}m)`,
            completed: false,
            skillTags: item.skillTags,
            ladderRef: item.ladderRef,
            source: 'planner' as const,
            mvdEssential: item.mvdEssential ?? item.category === 'must-do',
            category: item.category ?? 'must-do',
            estimatedMinutes: item.estimatedMinutes,
            subjectBucket: item.subjectBucket,
            ...(lessonCardMap.get(item.title) ? { lessonCardId: lessonCardMap.get(item.title) } : {}),
            ...(item.skipGuidance ? { skipGuidance: item.skipGuidance } : {}),
            ...(item.itemType ? { itemType: item.itemType } : {}),
            ...(item.evaluationMode ? { evaluationMode: item.evaluationMode } : {}),
            ...(item.link ? { link: item.link } : {}),
            ...(item.bookId ? { bookId: item.bookId } : {}),
            ...(item.watchVideoId ? { watchVideoId: item.watchVideoId } : {}),
            ...(workbookConfigId ? { workbookConfigId } : {}),
          }
        })

        const blocks: DayBlock[] = dayItems
          .filter((item) => !item.isAppBlock)
          .map((item) => ({
            type: subjectToDayBlockType(item.subjectBucket),
            title: item.title,
            subjectBucket: item.subjectBucket,
            plannedMinutes: item.estimatedMinutes,
            skillTags: item.skillTags,
            ladderRef: item.ladderRef,
            source: 'planner' as const,
          }))

        // Persist the day's time budget so rollover/budget enforcement can trim overflow.
        const dailyBudgetMinutes = Math.round(dayPlan.timeBudgetMinutes)

        if (dayLogSnap.exists()) {
          const existing = dayLogSnap.data()
          // Applied plan is authoritative for the days it covers (owner decision
          // 2026-07-19). Keep completed work (+ its minutes/evidence) and manual
          // items, DROP stale incomplete rolled-over residue, then append the
          // fresh planned items. The reset never touches completed work or logged
          // minutes — see `applyReset.ts` (HARD CONSTRAINT).
          const existingChecklist = retainChecklistForApply(existing.checklist ?? [])
          const existingBlocks = retainBlocksForApply(existing.blocks ?? [])
          await setDayLogGuarded(
            dayLogRef,
            {
              ...existing,
              checklist: [...existingChecklist, ...checklist],
              blocks: [...existingBlocks, ...blocks],
              dailyBudgetMinutes,
              updatedAt: new Date().toISOString(),
            },
            'apply-plan',
          )
        } else {
          const newDayLog: DayLog = {
            childId: activeChildId,
            date: dateKey,
            blocks,
            checklist,
            dailyBudgetMinutes,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          await setDayLogGuarded(dayLogRef, newDayLog, 'apply-plan-new')
        }
      }

      // Add "applied" message
      const appliedMsg: ChatMessage = {
        id: generateItemId(),
        role: ChatMessageRole.Assistant,
        text: 'Plan applied! Your weekly plan and daily checklists have been updated. Check the Week and Today pages.',
        createdAt: new Date().toISOString(),
      }
      const updatedMessages = [...messages, appliedMsg]
      setMessages(updatedMessages)
      setApplied(true)
      setPlanDirty(false) // the plan is now saved to the days — no pending edits

      // Persist the applied conversation under the week actually written — for a
      // forward-shift that's the shifted week, not the stale one it was drafted
      // in, so reopening the upcoming week restores the applied plan (FEAT-112
      // follow-up). For a normal apply this resolves to the live conversationDocId.
      const persistPromise = persistConversation(
        {
          status: PlannerConversationStatus.Applied,
          messages: updatedMessages,
          currentDraft,
        },
        { docId: plannerConversationDocId(effectiveWeekStart, activeChildId), weekKey: effectiveWeekStart },
      )

      if (overrideWeekStart) {
        // Forward-shift: catch the page's live week up to the shifted week so
        // `weekRange` / `conversationDocId` (and every read/write derived from
        // them — the drawer's later `persistConversation`, the WeekPlan/day-doc
        // reads) re-key onto the week we just wrote to, instead of lingering on
        // the stale week until the next focus/tick (FEAT-112 follow-up: keeps
        // post-shift edits on the shifted conversation). Await the applied-
        // conversation write first so the re-keyed subscription finds it.
        await persistPromise.catch(() => {})
        refreshTodayKey()
      } else {
        void persistPromise
      }

      setSnack({ text: 'Plan applied! Check This Week and Today.', severity: 'success' })

      // Non-blocking (FEAT-43): batch-generate inline Help Card bodies for the
      // must-do Reading/Math items. Fire-and-forget — lock-in already succeeded;
      // any generation failure just leaves a card slot absent. The video half is
      // lazy-fetched later, on first card expand.
      if (activeChildId) {
        void generateHelpCardsForPlan({
          familyId,
          childId: activeChildId,
          days: currentDraft.days,
          aiChat,
        }).catch((err) => {
          console.warn('[HelpCards] Batch generation failed (non-blocking):', err)
        })
      }

      // Non-blocking: generate chapter question pool for selected library book
      if (selectedBook && activeChildId) {
        const generatePool = async () => {
          try {
            setSnack({ text: `Generating chapter questions for ${selectedBook.title}...`, severity: 'info' })

            const progressId = bookProgressDocId(activeChildId, selectedBook.id)
            const progressRef = doc(bookProgressCollection(familyId), progressId)

            // Collect the family's existing pool across EVERY learner (canonical
            // "same questions"), then copy it to every kid — siblings who already
            // have a chapter no-op, kids missing it get the exact item. Backfills
            // London from Lincoln WITHOUT regenerating (FEAT-19).
            const existingMap = await collectExistingChapterPool(familyId, children, selectedBook.id)
            const backfilled = await applyChapterPoolToAll(
              familyId, children, selectedBook, [...existingMap.values()],
            )

            // AI-generate ONLY chapters no kid has yet.
            const missingChapters = selectedBook.chapters?.filter(
              (c) => !existingMap.has(c.number),
            ) ?? []

            if (missingChapters.length === 0) {
              setSnack({
                text: backfilled > 0
                  ? `Chapter questions ready for ${selectedBook.title}!`
                  : 'Chapter questions already generated.',
                severity: backfilled > 0 ? 'success' : 'info',
              })
              // A backfill may have populated the active child too — refresh.
              if (backfilled > 0) {
                const refreshed = await getDoc(progressRef)
                if (refreshed.exists()) {
                  setBookProgress({ ...refreshed.data() as BookProgress, id: refreshed.id })
                }
              }
              return
            }

            const result = await aiChat({
              familyId,
              childId: activeChildId,
              taskType: TaskType.ChapterQuestions,
              messages: [{
                role: 'user',
                content: JSON.stringify({
                  bookTitle: selectedBook.title,
                  author: selectedBook.author,
                  chapters: missingChapters,
                  childName: activeChild?.name,
                  weekTheme: weekPlan?.theme,
                  weekVirtue: weekPlan?.virtue,
                }),
              }],
            })

            if (!result?.message) {
              setSnack({
                text: "Couldn't generate chapter questions.",
                severity: 'warning',
                action: { label: 'Retry', onClick: () => void generatePool() },
              })
              return
            }

            let questions: Array<{ chapter: number; questionType: string; question: string }> = []
            try {
              const parsed = JSON.parse(result.message) as unknown
              questions = Array.isArray(parsed) ? parsed as typeof questions : []
            } catch {
              setSnack({
                text: "Couldn't parse chapter questions.",
                severity: 'warning',
                action: { label: 'Retry', onClick: () => void generatePool() },
              })
              return
            }

            const newPoolItems: ChapterQuestionPoolItem[] = questions
              .map((q) =>
                buildChapterPoolItem(q, selectedBook.chapters?.find((c) => c.number === q.chapter)?.title),
              )
              .filter((item): item is ChapterQuestionPoolItem => item !== null)

            // The read-aloud is a family book: write the SAME newly-generated pool
            // to every learner so each kid (Lincoln + London) gets the questions on
            // their Today and records their own answers (FEAT-17). Deduped by chapter.
            await applyChapterPoolToAll(familyId, children, selectedBook, newPoolItems)

            setSnack({ text: `Chapter questions ready for ${selectedBook.title}!`, severity: 'success' })

            // Refresh bookProgress state for the active child (the one viewing this page).
            const refreshed = await getDoc(progressRef)
            if (refreshed.exists()) {
              setBookProgress({ ...refreshed.data() as BookProgress, id: refreshed.id })
            }
          } catch (err) {
            console.error('Failed to generate chapter questions', err)
            setSnack({
              text: "Couldn't generate chapter questions.",
              severity: 'warning',
              action: { label: 'Retry', onClick: () => void generatePool() },
            })
          }
        }
        void generatePool()
      }
    } catch (err) {
      console.error('Failed to apply plan', err)
      setSnack({ text: 'Failed to apply plan.', severity: 'error' })
    }
  }, [activeChildId, familyId, weekRange.start, currentDraft, messages, persistConversation, generateActivity, subjectToActivityType, selectedBook, activeChild, weekPlan, aiChat, children, activityConfigs, refreshTodayKey])

  // Quick suggestion handler - sends the text immediately
  const handleQuickSuggestion = useCallback((text: string) => {
    // If AI is enabled, route through handleSend for full AI support
    if (isEnabled(AIFeatureFlag.AiPlanning) && activeChildId) {
      void handleSend(text)
      return
    }

    // Local logic path: apply adjustment immediately
    const userMsg: ChatMessage = {
      id: generateItemId(),
      role: ChatMessageRole.User,
      text,
      createdAt: new Date().toISOString(),
    }
    const intent = parseAdjustmentIntent(text)
    let assistantReply: ChatMessage

    if (intent && currentDraft) {
      const newAdjustments = [...adjustments, intent]
      const assignments = photoLabelsToAssignments(photoLabels)
      const draft = ensureEvaluationItems(generateDraftPlanFromInputs({
        snapshot,
        hoursPerDay,
        appBlocks: filteredAppBlocks,
        assignments,
        adjustments: newAdjustments,
        subjectTimeDefaults: { ...DEFAULT_SUBJECT_MINUTES, ...subjectTimeDefaults },
      }))
      setCurrentDraft(draft)
      setAdjustments(newAdjustments)
      assistantReply = {
        id: generateItemId(),
        role: ChatMessageRole.Assistant,
        text: describeAdjustment(intent) + ' Here\'s the updated plan:',
        draftPlan: draft,
        createdAt: new Date().toISOString(),
      }
    } else {
      assistantReply = {
        id: generateItemId(),
        role: ChatMessageRole.Assistant,
        text: 'Could not parse that adjustment.',
        createdAt: new Date().toISOString(),
      }
    }

    const updatedMessages = [...messages, userMsg, assistantReply]
    setMessages(updatedMessages)
    setInputText('')
    void persistConversation({
      messages: updatedMessages,
      currentDraft: currentDraft ?? undefined,
      ...(applied ? { status: PlannerConversationStatus.Applied } : {}),
    })
  }, [currentDraft, adjustments, photoLabels, snapshot, hoursPerDay, filteredAppBlocks, messages, persistConversation, applied, subjectTimeDefaults, isEnabled, activeChildId, handleSend])

  // Generate activity for a plan item
  const handleGenerateActivity = useCallback(async (item: DraftPlanItem) => {
    if (!activeChildId) return
    setGeneratingItemId(item.id)
    setGeneratedActivity(null)
    setGeneratedPlanItem(null)
    setLessonCardSaved(false)

    const activityType = subjectToActivityType(item.subjectBucket)
    // Transient generation hint for the lesson-card CF only — NOT a persisted tag.
    // Persisted item tags come from the FEAT-72 parse-time catalog backfill.
    const skillTag = item.skillTags[0] || `${item.subjectBucket.toLowerCase()}.general`

    try {
      const response = await generateActivity({
        familyId,
        childId: activeChildId,
        activityType,
        skillTag,
        estimatedMinutes: item.estimatedMinutes,
      })

      setGeneratedActivity(response.activity)
      setGeneratedPlanItem(item)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to generate activity.'
      setSnack({ text: `${errMsg} Try again.`, severity: 'error' })
    } finally {
      setGeneratingItemId(null)
    }
  }, [activeChildId, familyId, generateActivity, subjectToActivityType])

  // Save generated activity as a LessonCard in Firestore
  const handleSaveLessonCard = useCallback(async () => {
    if (!activeChildId || !generatedActivity || !generatedPlanItem) return
    setLessonCardSaving(true)
    try {
      const lessonCard: Omit<LessonCard, 'id'> = {
        childId: activeChildId,
        planItemId: generatedPlanItem.id,
        title: generatedActivity.title,
        durationMinutes: generatedPlanItem.estimatedMinutes,
        objective: generatedActivity.objective,
        materials: generatedActivity.materials,
        steps: generatedActivity.steps,
        supports: [],
        evidenceChecks: generatedActivity.successCriteria,
        skillTags: generatedPlanItem.skillTags,
        ...(generatedPlanItem.ladderRef ? { ladderRef: generatedPlanItem.ladderRef } : {}),
        createdAt: new Date().toISOString(),
      }
      await addDoc(lessonCardsCollection(familyId), lessonCard)
      setLessonCardSaved(true)
      setSnack({ text: 'Lesson card saved!', severity: 'success' })
    } catch (err) {
      console.error('Failed to save lesson card', err)
      setSnack({ text: 'Failed to save lesson card.', severity: 'error' })
    } finally {
      setLessonCardSaving(false)
    }
  }, [activeChildId, familyId, generatedActivity, generatedPlanItem])

  const handleClosePreview = useCallback(() => {
    setGeneratedActivity(null)
    setGeneratedPlanItem(null)
    setLessonCardSaved(false)
  }, [])

  const handlePrintWeekMaterials = useCallback(async () => {
    if (!activeChildId || !currentDraft) return

    const routineWorkbookPattern = /(workbook|practice page|lesson\s*\d+|daily review|drill)/i
    const printableDays = currentDraft.days
      .map((day) => {
        const focusItems = day.items.filter((item) => (
          item.accepted
          && !item.isAppBlock
          && !routineWorkbookPattern.test(item.title)
        ))
        return { ...day, items: focusItems }
      })
      .filter((day) => day.items.length > 0)

    if (printableDays.length === 0) {
      setSnack({
        text: 'No themed/focus activities found to print yet. Try accepting a few focus items first.',
        severity: 'warning',
      })
      return
    }

    const childName = activeChild?.name ?? 'Student'
    const dayPrompts = printableDays.map((day) => {
      return `===== ${day.day} =====
${buildMaterialsPrompt(
  day,
  {
    name: childName,
    birthdate: activeChild?.birthdate,
    grade: activeChild?.grade,
    motivators: activeChild?.motivators,
    interests: activeChild?.interests,
    strengths: activeChild?.strengths,
  },
  snapshot,
  weekPlan?.theme,
  weekPlan?.conundrum,
  weekPlan?.virtue,
  weekPlan?.scriptureRef,
  weekPlan?.scriptureText,
)}
`
    }).join('\n\n')

    const packetPrompt = `Create ONE weekly printable packet in valid HTML (single <html> document) using the day-by-day prompts below.

PACKET REQUIREMENTS:
- Focus on themed/focus work (Stonebridge theme, conundrum tie-ins, reflection/discussion prompts).
- Do NOT generate routine workbook blocks or repetitive daily drill sheets.
- Keep each day in its own section with clear ${childName}-friendly headings.
- Include concise answer keys where appropriate.
- Return ONLY HTML.

${dayPrompts}`

    try {
      setPrintingMaterials(true)
      setSnack({ text: 'Generating print packet...', severity: 'info' })
      const response = await aiChat({
        familyId,
        childId: activeChildId,
        taskType: TaskType.Generate,
        messages: [{ role: 'user', content: packetPrompt }],
      })
      if (!response?.message) {
        setSnack({ text: 'Could not generate print packet. Please try again.', severity: 'error' })
        return
      }
      openPrintWindow(response.message, `${childName} Week Materials`)
      setSnack({ text: 'Print packet ready.', severity: 'success' })
    } catch (err) {
      console.error('Failed to print week materials', err)
      setSnack({ text: 'Failed to generate print packet.', severity: 'error' })
    } finally {
      setPrintingMaterials(false)
    }
  }, [activeChildId, currentDraft, activeChild, snapshot, weekPlan, aiChat, familyId])

  // Reset conversation state (shared by both Start New Plan and Clear Applied Plan)
  const resetConversationState = useCallback(async () => {
    setMessages([])
    setCurrentDraft(null)
    setApplied(false)
    setPhotoLabels([])
    setAdjustments([])
    setSetupComplete(false)
    autoSuggestTriggered.current = false
    setWeekEnergy('full')
    setWeekNotes('')
    setForceSetup(false)
    setExcludedWorkbookIds(new Set())

    if (conversationDocId) {
      const ref = doc(plannerConversationsCollection(familyId), conversationDocId)
      await setDoc(ref, {
        childId: activeChildId,
        weekKey: weekRange.start,
        status: PlannerConversationStatus.Draft,
        messages: [],
        availableHoursPerDay: hoursPerDay,
        appBlocks: filteredAppBlocks,
        assignments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    }
  }, [conversationDocId, familyId, activeChildId, weekRange.start, hoursPerDay, filteredAppBlocks])

  // Redo Plan handler: clears applied plan from Today/Week AND resets conversation
  const handleRedoPlan = useCallback(async () => {
    setConfirmNewPlan(false)
    if (!activeChildId || !currentDraft) return

    // Past-week backstop (mirrors handleApplyPlan's FEAT-112 guard, which this
    // sibling path lacked): never run the destructive clear against a week that
    // has already passed. A stale tab could carry a past week key here, and
    // clearing dead dates would attack the historical record. Redo has no
    // forward-shift, so warn and stop rather than offering to retarget.
    if (isPlanningWeekPast(weekRange.start, todayKey())) {
      setSnack({
        text: 'That week has already passed — nothing was cleared. Completed work and logged time stay put.',
        severity: 'info',
      })
      return
    }

    try {
      // Remove planner-generated blocks and checklist from each day's DayLog
      for (const dayPlan of currentDraft.days) {
        if (!WEEK_DAYS.includes(dayPlan.day as typeof WEEK_DAYS[number])) continue

        const dateKey = dateKeyForDayPlan(weekRange.start, dayPlan.day as typeof WEEK_DAYS[number])

        const docId = dayLogDocId(dateKey, activeChildId)
        const dayLogRef = doc(daysCollection(familyId), docId)
        const dayLogSnap = await getDoc(dayLogRef)
        if (dayLogSnap.exists()) {
          const existing = dayLogSnap.data()
          // Reuse the FEAT-111 apply-reset guards instead of a raw
          // `source === 'manual'` filter (which destroyed completed planner work
          // and its logged minutes — the FEAT-113 P0 hotfix). Keep completed
          // items (+ their minutes / evidence) and manual items; keep any block
          // carrying logged actualMinutes. Only un-started planner residue is
          // cleared — the feature's actual purpose. Routed through the FEAT-114
          // preservation guard so a regression can't silently ship the old
          // "manual-only" filter again — see `applyReset.ts` (HARD CONSTRAINT).
          const retainedChecklist = retainChecklistForApply(existing.checklist ?? [])
          const retainedBlocks = retainBlocksForApply(existing.blocks ?? [])
          await updateDayLogGuarded(
            dayLogRef,
            { checklist: retainedChecklist, blocks: retainedBlocks },
            'redo-plan',
          )
        }
      }

      // Remove childGoals from week doc
      const weekRef = doc(weeksCollection(familyId), weekRange.start)
      const weekSnap = await getDoc(weekRef)
      if (weekSnap.exists()) {
        const existing = weekSnap.data()
        const updatedGoals = (existing.childGoals ?? []).filter(
          (g: { childId: string }) => g.childId !== activeChildId,
        )
        await setDoc(weekRef, { ...existing, childGoals: updatedGoals })
      }

      // Reset conversation state to start fresh
      await resetConversationState()
      setSnack({ text: 'Plan cleared and conversation reset. Start fresh!', severity: 'success' })
    } catch (err) {
      console.error('Failed to redo plan', err)
      setSnack({ text: 'Failed to redo plan.', severity: 'error' })
    }
  }, [activeChildId, currentDraft, familyId, weekRange.start, resetConversationState])

  return (
    <Page>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="h4" component="h1">Plan My Week</Typography>
          <Typography color="text.secondary" variant="body2">
            Set up your week, review the plan, and you&apos;re done.
          </Typography>
        </Box>
        <IconButton onClick={() => setDrawerOpen(true)} title="View context">
          <InfoOutlinedIcon />
        </IconButton>
      </Stack>

      <ChildSelector
        children={children}
        selectedChildId={activeChildId}
        onSelect={setActiveChildId}
        onChildAdded={addChild}
        isLoading={isLoadingChildren}
        emptyMessage="Add a child to start planning."
      />

      {activeChildId && (
        <>
          {/* One-line ambient foundation focus (FEAT-65, §7.3) — sourced from the
              learner model's synthesis; taps through to the Foundations tab.
              Renders nothing when the model is empty / no-data. */}
          <FoundationsFocusLine childId={activeChildId} />

          {/* Proposed adjustment handed off from Shelly chat (chunk 2A/2).
              Surfaced for review — it's already folded into the week notes /
              generation context. Shelly still reviews + locks in below; this
              banner never writes the plan. */}
          {pendingAdjustment && pendingAdjustment.childId === activeChildId && (
            <Alert
              severity="info"
              icon={<InfoOutlinedIcon fontSize="inherit" />}
              onClose={() => setPendingAdjustment(null)}
              sx={{ mb: 1 }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Proposed adjustment from your chat: {pendingAdjustment.summary}
              </Typography>
              {pendingAdjustment.rationale && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Why: {pendingAdjustment.rationale}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                It's added to your week notes below — review and generate or lock in your plan as usual.
              </Typography>
            </Alert>
          )}

          {/* Plan Summary Panel (pinned above chat) */}
          <PlanSummaryPanel
            hoursPerDay={hoursPerDay}
            appBlocks={filteredAppBlocks}
            prioritySkills={snapshot?.prioritySkills ?? []}
            currentDraft={currentDraft}
            masteryReviewLine={masteryReviewLine}
          />

          {phase === 'setup' && (!snapshot || snapshot.prioritySkills.length === 0) && (() => {
            const hasRecentEval = recentEvalDate &&
              (Date.now() - new Date(recentEvalDate).getTime()) < 7 * 24 * 60 * 60 * 1000
            return !hasRecentEval ? (
              <Alert severity="info" sx={{ mb: 1 }}>
                No skill snapshot yet for {activeChild?.name ?? 'this child'}. Run a Knowledge Mine evaluation first for better plan personalization.
              </Alert>
            ) : null
          })()}

          {phase === 'setup' && hasPriorPlan === null && (
            <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', display: 'flex', justifyContent: 'center' }}>
              <LoadingState size={24} />
            </Box>
          )}

          {phase === 'setup' && hasPriorPlan === false && (
            <PlannerSetupWizard
              childName={activeChild?.name ?? 'your child'}
              weekEnergy={weekEnergy}
              onWeekEnergyChange={setWeekEnergy}
              hoursPerDay={hoursPerDay}
              chapterBooks={chapterBooks}
              selectedBook={selectedBook}
              onSelectedBookChange={handleSelectedBookChange}
              onBookAdded={handleBookAdded}
              onLookupBook={handleLookupBook}
              bookProgress={bookProgress}
              chapterBooksLoading={chapterBooksLoading}
              chapterBooksLoadError={chapterBooksLoadError}
              weekNotes={weekNotes}
              onWeekNotesChange={setWeekNotes}
              masterySummary={masterySummary}
              formatSkillLabel={formatSkillLabel}
              photoLabels={photoLabels}
              onLabelsChange={setPhotoLabels}
              onPhotoCapture={handlePhotoCapture}
              uploading={uploading}
              workbookConfigs={workbookConfigs}
              onScanCapture={handleScanCapture}
              scanLoading={scanLoading}
              scanResult={scanRecord?.results ?? null}
              scanError={scanError ?? null}
              onScanClear={clearScan}
              onScanAccept={handleScanAccept}
              activityConfigs={activityConfigs}
              onSubmitPhotos={handleSubmitPhotos}
              onSetupComplete={handleSetupComplete}
              generatingWeek={generatingWeek}
            />
          )}

          {phase === 'setup' && hasPriorPlan === true && (
            <PlannerCompactSetup
              childName={activeChild?.name ?? 'your child'}
              weekRangeLabel={`Planning ${formatPlanningWeekLabel(weekRange.start)}`}
              weekEnergy={weekEnergy}
              onWeekEnergyChange={setWeekEnergy}
              hoursPerDay={hoursPerDay}
              chapterBooks={chapterBooks}
              selectedBook={selectedBook}
              onSelectedBookChange={handleSelectedBookChange}
              onBookAdded={handleBookAdded}
              onLookupBook={handleLookupBook}
              bookProgress={bookProgress}
              chapterBooksLoading={chapterBooksLoading}
              chapterBooksLoadError={chapterBooksLoadError}
              workbookConfigs={workbookConfigs}
              excludedWorkbookIds={excludedWorkbookIds}
              onToggleWorkbook={(id) => {
                setExcludedWorkbookIds((prev) => {
                  const next = new Set(prev)
                  if (next.has(id)) next.delete(id)
                  else next.add(id)
                  return next
                })
              }}
              onAddWorkbook={() => navigate('/progress?tab=curriculum')}
              weekNotes={weekNotes}
              onWeekNotesChange={setWeekNotes}
              onGenerate={handleSetupComplete}
              onRepeatLastWeek={handleRepeatLastWeek}
              generatingWeek={generatingWeek}
              repeatingWeek={repeatingWeek}
              canRepeatLastWeek={!!lastPlanDraft}
            />
          )}

          {phase === 'review' && (
            <Box>
              <Button
                size="small"
                variant="text"
                onClick={handleEditSetup}
                sx={{ textTransform: 'none', p: 0, minWidth: 0 }}
              >
                ← Edit setup
              </Button>
            </Box>
          )}

          {phase === 'review' && weekPlan && (
            <WeekFocusPanel weekPlan={weekPlan} onUpdateField={updateWeekField} />
          )}

          {phase === 'review' && (
            <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
              <Typography variant="subtitle2" gutterBottom>Read-Aloud Book</Typography>
              <ChapterBookPicker
                chapterBooks={chapterBooks}
                selectedBook={selectedBook}
                onSelectedBookChange={handleBookChangeAndPersist}
                onBookAdded={handleBookAdded}
                bookProgress={bookProgress}
                variant="compact"
                loading={chapterBooksLoading}
                loadError={chapterBooksLoadError}
                onLookup={handleLookupBook}
              />
            </Box>
          )}

          {phase === 'review' && currentDraft && (
            <Box>
              <PlanDayCards
                draft={currentDraft}
                hoursPerDay={hoursPerDay}
                masteryReviewLine={masteryReviewLine}
                readAloudBook={readAloudBook}
                weekStart={weekRange.start}
                snapshot={snapshot}
                onToggleItem={handleToggleItem}
                onGenerateActivity={handleGenerateActivity}
                generatingItemId={generatingItemId}
                applied={applied}
                onMoveItem={handleMoveItem}
                onRemoveItem={handleRemoveItem}
                onUpdateTime={handleUpdateTime}
                onAddWatchItem={(dayIndex) => setWatchPickerDay(dayIndex)}
              />

              {/* FEAT-111 P3: sticky/floating Apply bar — pinned to the viewport
                  bottom while the seven day cards scroll above it, so Apply is
                  reachable on a phone without scrolling past every card. */}
              <StickyApplyBar planDirty={planDirty} onApply={() => handleApplyPlan()} />
            </Box>
          )}

          {phase === 'active' && (
            <>
              {/* Applied plan alert + navigation */}
              <Alert severity="success" sx={{ display: 'flex', alignItems: 'center' }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" fontWeight={600}>Plan applied!</Typography>
                  <Typography variant="body2">{activeChild?.name ?? 'Your child'}&apos;s week is ready.</Typography>
                </Box>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => navigate('/today')}
                  sx={{ ml: 2, whiteSpace: 'nowrap' }}
                >
                  Go to Today
                </Button>
              </Alert>

              {/* Read-aloud book picker (active phase) */}
              <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
                <Typography variant="subtitle2" gutterBottom>Read-Aloud Book</Typography>
                <ChapterBookPicker
                  chapterBooks={chapterBooks}
                  selectedBook={selectedBook}
                  onSelectedBookChange={handleBookChangeAndPersist}
                  onBookAdded={handleBookAdded}
                  bookProgress={bookProgress}
                  variant="compact"
                  loading={chapterBooksLoading}
                  loadError={chapterBooksLoadError}
                  onLookup={handleLookupBook}
                />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Today&apos;s chapter question won&apos;t regenerate automatically — open the Today page and tap Refresh on the chapter question card.
                </Typography>
              </Box>

            </>
          )}

          {/* Global chat drawer — collapsed by default, available across all phases as the power-user escape hatch */}
          <PlannerChatDrawer
            messages={messages}
            inputText={inputText}
            onInputChange={setInputText}
            onSend={() => handleSend()}
            loading={aiLoading}
            messagesEndRef={chatEndRef}
          />

          {phase === 'review' && currentDraft && (
            <>
              <Typography variant="caption" color="text.secondary">
                Want to adjust anything?
              </Typography>
              <QuickSuggestionButtons onSelect={handleQuickSuggestion} visible />

              {/* Apply now lives in the sticky bar above the day cards (FEAT-111
                  P3); this row keeps the secondary Print action. */}
              <Button
                variant="outlined"
                size="large"
                onClick={handlePrintWeekMaterials}
                disabled={printingMaterials || aiLoading}
                fullWidth
              >
                {printingMaterials ? 'Generating print packet...' : 'Print Week Materials'}
              </Button>
            </>
          )}

          {phase === 'active' && (
            <>
              <Button
                variant="outlined"
                color="primary"
                onClick={() => setConfirmNewPlan(true)}
                fullWidth
                size="small"
              >
                Start Over (Redo Plan)
              </Button>

              <Dialog open={confirmNewPlan} onClose={() => setConfirmNewPlan(false)}>
                <DialogTitle>Redo Plan?</DialogTitle>
                <DialogContent>
                  <DialogContentText>
                    This clears the planned items from your days so you can start fresh.
                    Anything already completed, and the time already logged, stays. Continue?
                  </DialogContentText>
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => setConfirmNewPlan(false)}>Cancel</Button>
                  <Button onClick={handleRedoPlan} variant="contained">Redo Plan</Button>
                </DialogActions>
              </Dialog>
            </>
          )}
        </>
      )}

      <ContextDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        child={activeChild ?? null}
        weekKey={weekRange.start}
        hoursPerDay={hoursPerDay}
        appBlocks={filteredAppBlocks}
        snapshot={snapshot}
      />

      {/* FEAT-112 P4: past-week apply backstop. Non-blaming; offers a one-tap
          forward-shift to the correct upcoming week rather than writing to
          dates that have already passed. */}
      <Dialog open={pastWeekBlock !== null} onClose={() => setPastWeekBlock(null)}>
        <DialogTitle>Plan the upcoming week?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {pastWeekBlock
              ? `This plan targets ${formatPlanningWeekLabel(pastWeekBlock.attempted)}, which has already passed. Want to apply it to ${formatPlanningWeekLabel(pastWeekBlock.shifted)} instead?`
              : ''}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPastWeekBlock(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              const shifted = pastWeekBlock?.shifted
              setPastWeekBlock(null)
              if (shifted) void handleApplyPlan(shifted)
            }}
          >
            {pastWeekBlock ? `Apply to ${formatPlanningWeekLabel(pastWeekBlock.shifted)}` : 'Apply to upcoming week'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snack !== null}
        autoHideDuration={snack?.action ? 10000 : 4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnack(null)}
          severity={snack?.severity ?? 'error'}
          variant="filled"
          sx={{ width: '100%' }}
          action={snack?.action ? (
            <Button color="inherit" size="small" onClick={() => { snack.action!.onClick(); setSnack(null) }}>
              {snack.action.label}
            </Button>
          ) : undefined}
        >
          {snack?.text}
        </Alert>
      </Snackbar>

      {/* Generate activity loading overlay */}
      {generateLoading && (
        <Box
          sx={{
            position: 'fixed',
            bottom: 80,
            right: 24,
            bgcolor: 'background.paper',
            borderRadius: 2,
            boxShadow: 3,
            px: 2,
            py: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <LoadingState size={20} />
          <Typography variant="body2">Generating activity...</Typography>
        </Box>
      )}

      {/* Lesson card preview dialog */}
      {generatedActivity && generatedPlanItem && (
        <LessonCardPreview
          open
          onClose={handleClosePreview}
          activity={generatedActivity}
          planItem={generatedPlanItem}
          saved={lessonCardSaved}
          saving={lessonCardSaving}
          onSave={handleSaveLessonCard}
        />
      )}

      {/* Watch Vehicle — pick a vetted video to plan onto the chosen day (FEAT-104).
          FEAT-107: parents can vet a new video in inline (no trip to Settings) and
          jump to the full library for bulk curation. Both affordances are gated to
          parents — omitting the handlers hides them for kids. */}
      <WatchLibraryPicker
        open={watchPickerDay !== null}
        onClose={() => setWatchPickerDay(null)}
        videos={watchVideos}
        loading={watchLoading}
        error={watchError}
        onSelect={(video) => {
          if (watchPickerDay !== null) handleAddWatchItem(watchPickerDay, video)
          setWatchPickerDay(null)
        }}
        onAddVideo={isParent ? async (video) => { await addWatchVideo(video) } : undefined}
        onManageLibrary={isParent ? () => navigate('/settings') : undefined}
      />
    </Page>
  )
}
