import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import SendIcon from '@mui/icons-material/Send'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { addDoc, doc, getDoc, getDocs, limit as fsLimit, onSnapshot, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore'

import { useNavigate } from 'react-router-dom'
import ChildSelector from '../../components/ChildSelector'
import Page from '../../components/Page'
import { AIFeatureFlag, useAIFeatureFlags } from '../../core/ai/featureFlags'
import { useAI, TaskType, useGenerateActivity } from '../../core/ai/useAI'
import type { ChatMessage as AIChatMessage, GeneratedActivity } from '../../core/ai/useAI'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  artifactsCollection,
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
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useDebounce } from '../../core/hooks/useDebounce'
import type {
  AppBlock,
  AssignmentCandidate,
  ChatMessage,
  ChecklistItem,
  DayBlock,
  DayLog,
  DraftPlanItem,
  DraftWeeklyPlan,
  LessonCard,
  PlannerConversation,
  PhotoLabel,
  PhotoContentExtraction,
  SkillSnapshot,
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
} from '../../core/types/enums'
import { SKILL_TAG_MAP } from '../../core/types/skillTags'
import { formatDateYmd } from '../../core/utils/format'
import { getWeekRange } from '../engine/engine.logic'
import { dayLogDocId } from '../today/daylog.model'
import { useActivityConfigs } from '../../core/hooks/useActivityConfigs'
import { activityConfigsToRoutineText, defaultAppBlocks, parseRoutineTotalMinutes } from './chatPlanner.logic'
import {
  buildPlannerPrompt,
  dateKeyForDayPlan,
  ensureEvaluationItems,
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
import LessonCardPreview from './LessonCardPreview'
import PlanSummaryPanel from './PlanSummaryPanel'
import { useScan } from '../../core/hooks/useScan'
import QuickSuggestionButtons from './QuickSuggestionButtons'
import { buildMaterialsPrompt, openPrintWindow } from './generateMaterials'
import PlannerSetupWizard from './PlannerSetupWizard'
import WeekFocusPanel from './WeekFocusPanel'
import PlanDayCards from './PlanDayCards'
import PlannerChatMessages from './PlannerChatMessages'


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
  const weekRange = useMemo(() => getWeekRange(new Date()), [])
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
  const [snack, setSnack] = useState<{ text: string; severity: 'success' | 'error' | 'info' | 'warning' } | null>(null)

  // Week plan state (theme/virtue/scripture/heartQuestion)
  const [weekPlan, setWeekPlan] = useState<WeekPlan | null>(null)
  const phase = useMemo<'setup' | 'review' | 'active'>(() => {
    if (applied) return 'active'
    if (weekPlan && currentDraft) return 'review'
    return 'setup'
  }, [weekPlan, currentDraft, applied])
  const chapterQuestionsByDay = useMemo(() => {
    if (!currentDraft) return []
    return currentDraft.days
      .filter((day) => day.chapterQuestion)
      .map((day) => ({
        day: day.day,
        chapterQuestion: day.chapterQuestion!,
      }))
  }, [currentDraft])

  // Confirmation dialog state
  const [confirmNewPlan, setConfirmNewPlan] = useState(false)


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

  // Load planner defaults (family-level)
  useEffect(() => {
    if (!familyId) return
    const settingsRef = doc(db, `families/${familyId}/settings/plannerDefaults`)
    void getDoc(settingsRef).then((snap) => {
      if (snap.exists()) {
        const data = snap.data()
        if (data.weekEnergy) setWeekEnergy(data.weekEnergy)
        if (data.readAloudBook) setReadAloudBook(data.readAloudBook)
        if (data.readAloudChapters) setReadAloudChapters(data.readAloudChapters)
      }
    })
  }, [familyId])

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

  // Load existing conversation
  useEffect(() => {
    if (!conversationDocId || !activeChildId) return
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

  // Persist conversation
  const persistConversation = useCallback(
    async (updates: Partial<PlannerConversation>) => {
      if (!activeChildId || !conversationDocId) return
      const ref = doc(plannerConversationsCollection(familyId), conversationDocId)
      const snap = await getDoc(ref)
      const now = new Date().toISOString()
      if (snap.exists()) {
        await setDoc(ref, { ...snap.data(), ...updates, updatedAt: now })
      } else {
        const conversation: PlannerConversation = {
          childId: activeChildId,
          weekKey: weekRange.start,
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

      const rawAiDraft = response ? parseAIResponse(response) : null
      const aiDraft = rawAiDraft ? fillMissingDaysFromRoutine(rawAiDraft, filteredDailyRoutine, hoursPerDay) : null
      if (aiDraft) {
        draft = ensureEvaluationItems(aiDraft)
        usedAI = true
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
  }, [photoLabels, snapshot, hoursPerDay, filteredAppBlocks, adjustments, filteredDailyRoutine, messages, persistConversation, isEnabled, activeChildId, familyId, aiChat, extractPhotoContent, subjectTimeDefaults, masteryPromptContext])

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

      const rawAiDraft = response ? parseAIResponse(response) : null
      const aiDraft = rawAiDraft ? fillMissingDaysFromRoutine(rawAiDraft, filteredDailyRoutine, hoursPerDay) : null
      if (aiDraft) {
        draft = ensureEvaluationItems(aiDraft)
        usedAI = true
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
  }, [photoLabels, snapshot, hoursPerDay, filteredAppBlocks, adjustments, filteredDailyRoutine, messages, persistConversation, isEnabled, activeChildId, familyId, aiChat, subjectTimeDefaults, masteryPromptContext])

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
      const rawAiDraft = response ? parseAIResponse(response) : null
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
            rawRecovered = parseAIResponse({ ...response, message: JSON.stringify(directParse) })
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
  }, [inputText, currentDraft, adjustments, photoLabels, snapshot, hoursPerDay, filteredAppBlocks, messages, persistConversation, isEnabled, activeChildId, aiChat, familyId, applied, filteredDailyRoutine, handleGeneratePlan, subjectTimeDefaults])

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
          readAloudBook && readAloudChapters
            ? `Read-aloud: ${readAloudBook} (${readAloudChapters}). Generate ONE chapterQuestion per school day for these SPECIFIC chapters in order. Do NOT start from Chapter 1 unless the parent specified it. The "chapter" field must use the actual chapter numbers from the entered range.`
            : '',
        ].filter(Boolean).join('\n\n')
        const response = await aiChat({
          familyId,
          childId: activeChildId,
          taskType: TaskType.Plan,
          messages: [{ role: 'user', content: fullPrompt }],
        })
        const rawAiDraft = response ? parseAIResponse(response) : null
        const aiDraft = rawAiDraft ? fillMissingDaysFromRoutine(rawAiDraft, filteredDailyRoutine, hoursPerDay) : null
        if (aiDraft) {
          draft = ensureEvaluationItems(aiDraft)
          usedAI = true
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
  }, [activeChildId, weekPlan, photoLabels, subjectTimeDefaults, snapshot, hoursPerDay, filteredAppBlocks, adjustments, filteredDailyRoutine, isEnabled, aiChat, familyId, messages, persistConversation, masteryPromptContext, buildWeekFocusContext, parsePlanThemeFields, weekPlanRef, readAloudBook, readAloudChapters])

  // Setup wizard completion handler
  const handleSetupComplete = useCallback(async () => {
    const energyLabel =
      weekEnergy === 'full'
        ? 'normal energy'
        : weekEnergy === 'lighter'
          ? 'lighter week, reduce load'
          : 'MVD week, minimum items only'

    // Build workbook lines from configured existing workbooks
    const allWorkbookLines = [
      ...workbookConfigs
        .map((wb) => `- ${wb.name}: ${wb.unitLabel} ${wb.currentPosition + 1} (${wb.subjectBucket})`),
    ].join('\n')

    // Save family-level planner defaults (weekEnergy drives hoursPerDay via useEffect)
    void setDoc(doc(db, `families/${familyId}/settings/plannerDefaults`), {
      weekEnergy,
      readAloudBook,
      readAloudChapters,
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
${readAloudBook && readAloudChapters ? `\nThe parent specified these chapters for this week: ${readAloudChapters}
Generate ONE discussion question per school day (Monday–Friday) for these specific chapters IN ORDER.
Do NOT start from Chapter 1 unless the parent specified Chapter 1.
If the parent said "Ch 5-8", generate questions for Ch 5, Ch 6, Ch 7, Ch 8, and one review/prediction question for Friday.
Each question must have a questionType: comprehension, application, connection, opinion, or prediction.
Vary the question types across the week.
The "chapter" field in each chapterQuestion must match the actual chapter numbers from the entered range, not auto-numbered from 1.
Include the question in a "chapterQuestion" field on each day.` : ''}

Subject time defaults (use these as the baseline for estimatedMinutes per item):
${subjectDefaultsLines}
${weekNotes ? `\nNotes: ${weekNotes}` : ''}

Generate a plan for Monday through Friday.`.trim()

    await handleGenerateWeek(contextMessage, true)
  }, [weekEnergy, hoursPerDay, workbookConfigs, readAloudBook, readAloudChapters, weekNotes, activeChild, activeChildId, familyId, subjectTimeDefaults, handleGenerateWeek])

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
  const handleApplyPlan = useCallback(async () => {
    if (!activeChildId || !currentDraft) return
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

      // Step 2: Write WeekPlan update
      const weekRef = doc(weeksCollection(familyId), weekRange.start)
      const weekSnap = await getDoc(weekRef)
      if (weekSnap.exists()) {
        const existing = weekSnap.data()
        const existingGoals = existing.childGoals ?? []
        const childGoalIndex = existingGoals.findIndex(
          (g: { childId: string }) => g.childId === activeChildId,
        )
        const planGoals = currentDraft.days
          .flatMap((d) => d.items)
          .filter((item) => item.accepted && !item.isAppBlock)
          .map((item) => item.title)
        const updatedGoals = [...existingGoals]
        if (childGoalIndex >= 0) {
          updatedGoals[childGoalIndex] = {
            ...updatedGoals[childGoalIndex],
            goals: [...updatedGoals[childGoalIndex].goals, ...planGoals],
          }
        } else {
          updatedGoals.push({ childId: activeChildId, goals: planGoals })
        }
        await setDoc(weekRef, { ...existing, childGoals: updatedGoals })
      }

      // Write DayLog checklist items for each day
      for (const dayPlan of currentDraft.days) {
        const dayItems = dayPlan.items.filter((item) => item.accepted)
        if (dayItems.length === 0) continue
        if (!WEEK_DAYS.includes(dayPlan.day as typeof WEEK_DAYS[number])) continue

        const dateKey = dateKeyForDayPlan(weekRange.start, dayPlan.day as typeof WEEK_DAYS[number])

        const docId = dayLogDocId(dateKey, activeChildId)
        const dayLogRef = doc(daysCollection(familyId), docId)
        const dayLogSnap = await getDoc(dayLogRef)

        const checklist: ChecklistItem[] = dayItems.map((item) => ({
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
        }))

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

        if (dayLogSnap.exists()) {
          const existing = dayLogSnap.data()
          // Replace planner-generated items, keep manually-added ones
          const existingChecklist = (existing.checklist ?? []).filter(
            (item: ChecklistItem) => item.source === 'manual'
          )
          const existingBlocks = (existing.blocks ?? []).filter(
            (block: DayBlock) => block.source === 'manual'
          )
          await setDoc(dayLogRef, {
            ...existing,
            checklist: [...existingChecklist, ...checklist],
            blocks: [...existingBlocks, ...blocks],
            ...(dayPlan.chapterQuestion ? { chapterQuestion: dayPlan.chapterQuestion } : {}),
            updatedAt: new Date().toISOString(),
          })
        } else {
          const newDayLog: DayLog = {
            childId: activeChildId,
            date: dateKey,
            blocks,
            checklist,
            ...(dayPlan.chapterQuestion ? { chapterQuestion: dayPlan.chapterQuestion } : {}),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          await setDoc(dayLogRef, newDayLog)
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

      void persistConversation({
        status: PlannerConversationStatus.Applied,
        messages: updatedMessages,
        currentDraft,
      })

      setSnack({ text: 'Plan applied! Check This Week and Today.', severity: 'success' })
    } catch (err) {
      console.error('Failed to apply plan', err)
      setSnack({ text: 'Failed to apply plan.', severity: 'error' })
    }
  }, [activeChildId, familyId, weekRange.start, currentDraft, messages, persistConversation, generateActivity, subjectToActivityType])

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
      .filter((day) => day.items.length > 0 || day.chapterQuestion)

    if (printableDays.length === 0) {
      setSnack({
        text: 'No themed/focus activities found to print yet. Try accepting a few focus items first.',
        severity: 'warning',
      })
      return
    }

    const childName = activeChild?.name ?? 'Student'
    const dayPrompts = printableDays.map((day) => {
      const chapterPrompt = day.chapterQuestion
        ? `\nAdd a dedicated chapter-discussion page for ${day.day} using:
- Book: ${day.chapterQuestion.book}
- Chapter: ${day.chapterQuestion.chapter}
- Question type: ${day.chapterQuestion.questionType}
- Question: ${day.chapterQuestion.question}
`
        : ''
      return `===== ${day.day} =====
${buildMaterialsPrompt(
  day,
  childName,
  snapshot,
  weekPlan?.theme,
  weekPlan?.conundrum,
  weekPlan?.virtue,
  weekPlan?.scriptureRef,
  weekPlan?.scriptureText,
)}
${chapterPrompt}
`
    }).join('\n\n')

    const packetPrompt = `Create ONE weekly printable packet in valid HTML (single <html> document) using the day-by-day prompts below.

PACKET REQUIREMENTS:
- Focus on themed/focus work (Stonebridge theme, conundrum tie-ins, chapter questions, reflection/discussion prompts).
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
  }, [activeChildId, currentDraft, activeChild?.name, snapshot, weekPlan, aiChat, familyId])

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
          // Keep manually-added items, remove planner-generated ones
          const manualChecklist = (existing.checklist ?? []).filter(
            (item: ChecklistItem) => item.source === 'manual'
          )
          const manualBlocks = (existing.blocks ?? []).filter(
            (block: DayBlock) => block.source === 'manual'
          )
          await updateDoc(dayLogRef, { checklist: manualChecklist, blocks: manualBlocks })
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

          {phase === 'setup' && (
            <PlannerSetupWizard
              childName={activeChild?.name ?? 'your child'}
              weekEnergy={weekEnergy}
              onWeekEnergyChange={setWeekEnergy}
              hoursPerDay={hoursPerDay}
              readAloudBook={readAloudBook}
              onReadAloudBookChange={setReadAloudBook}
              readAloudChapters={readAloudChapters}
              onReadAloudChaptersChange={setReadAloudChapters}
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

          {phase === 'review' && weekPlan && (
            <WeekFocusPanel weekPlan={weekPlan} onUpdateField={updateWeekField} />
          )}

          {phase === 'review' && currentDraft && (
            <PlanDayCards
              draft={currentDraft}
              hoursPerDay={hoursPerDay}
              masteryReviewLine={masteryReviewLine}
              chapterQuestionsByDay={chapterQuestionsByDay}
              readAloudBook={readAloudBook}
              onToggleItem={handleToggleItem}
              onGenerateActivity={handleGenerateActivity}
              generatingItemId={generatingItemId}
              applied={applied}
              onMoveItem={handleMoveItem}
              onRemoveItem={handleRemoveItem}
              onUpdateTime={handleUpdateTime}
            />
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

              {/* Chat history (scrollable) */}
              <PlannerChatMessages messages={messages} messagesEndRef={chatEndRef} />

              {/* Chat input for in-week adjustments */}
              <Typography variant="caption" color="text.secondary">
                Need to make changes during the week?
              </Typography>
              <Stack direction="row" spacing={1} alignItems="flex-end">
                <TextField
                  fullWidth
                  size="small"
                  placeholder="e.g. &quot;Cancel Wednesday&quot;, &quot;make Thursday light&quot;, &quot;add extra reading Friday&quot;..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                />
                <IconButton onClick={() => handleSend()} color="primary" disabled={!inputText.trim() || aiLoading}>
                  {aiLoading ? <CircularProgress size={24} /> : <SendIcon />}
                </IconButton>
              </Stack>
            </>
          )}

          {phase === 'review' && currentDraft && (
            <>
              <Typography variant="caption" color="text.secondary">
                Want to adjust anything?
              </Typography>
              <QuickSuggestionButtons onSelect={handleQuickSuggestion} visible />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Button
                  variant="contained"
                  color="success"
                  size="large"
                  onClick={handleApplyPlan}
                  fullWidth
                >
                  Apply This Week&apos;s Plan
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  onClick={handlePrintWeekMaterials}
                  disabled={printingMaterials || aiLoading}
                  fullWidth
                >
                  {printingMaterials ? 'Generating print packet...' : 'Print Week Materials'}
                </Button>
              </Stack>
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
                    This will clear your current plan from Today and let you start fresh. Continue?
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

      <Snackbar
        open={snack !== null}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnack(null)}
          severity={snack?.severity ?? 'error'}
          variant="filled"
          sx={{ width: '100%' }}
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
          <CircularProgress size={20} />
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
    </Page>
  )
}
