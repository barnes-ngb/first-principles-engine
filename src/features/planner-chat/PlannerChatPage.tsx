import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import DeleteIcon from '@mui/icons-material/Delete'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import PrintIcon from '@mui/icons-material/Print'
import SendIcon from '@mui/icons-material/Send'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { addDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore'

import { Link as RouterLink, useNavigate } from 'react-router-dom'
import ChildSelector from '../../components/ChildSelector'
import Page from '../../components/Page'
import { AIFeatureFlag, useAIFeatureFlags } from '../../core/ai/featureFlags'
import { useAI, TaskType, useGenerateActivity } from '../../core/ai/useAI'
import type { ChatMessage as AIChatMessage, GeneratedActivity } from '../../core/ai/useAI'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  artifactsCollection,
  daysCollection,
  lessonCardsCollection,
  plannerConversationDocId,
  plannerConversationsCollection,
  skillSnapshotsCollection,
  weeksCollection,
  workbookConfigsCollection,
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
  DraftDayPlan,
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
import { fixUnicodeEscapes, formatDateYmd } from '../../core/utils/format'
import { getWeekRange } from '../engine/engine.logic'
import { dayLogDocId } from '../today/daylog.model'
import { defaultAppBlocks, defaultDailyRoutine, parseRoutineTotalMinutes } from './chatPlanner.logic'
import {
  buildPlannerPrompt,
  fillMissingDaysFromRoutine,
  generateDraftPlanFromInputs,
  generateItemId,
  parseAIResponse,
  WEEK_DAYS,
} from './chatPlanner.logic'
import type { AdjustmentIntent } from './chatPlanner.logic'
import { describeAdjustment, parseAdjustmentIntent } from './intentParser'
import { formatCoverageSummaryText, buildCoverageSummary } from './coverageSummary'
import { clonePlanWithAdvancedLessons } from './repeatWeek.logic'
import ContextDrawer from './ContextDrawer'
import LessonCardPreview from './LessonCardPreview'
import PlanPreviewCard from './PlanPreviewCard'
import PlanSummaryPanel from './PlanSummaryPanel'
import { useScan } from '../../core/hooks/useScan'
import PhotoLabelForm from './PhotoLabelForm'
import QuickSuggestionButtons from './QuickSuggestionButtons'
import { buildMaterialsPrompt, openPrintWindow } from './generateMaterials'


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

export default function PlannerChatPage() {
  const familyId = useFamilyId()
  const { isEnabled } = useAIFeatureFlags()
  const { chat: aiChat, loading: aiLoading, error: aiError } = useAI()
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
  const [showPhotos, setShowPhotos] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [applied, setApplied] = useState(false)
  const [snack, setSnack] = useState<{ text: string; severity: 'success' | 'error' | 'info' | 'warning' } | null>(null)

  // Week plan state (theme/virtue/scripture/heartQuestion)
  const [weekPlan, setWeekPlan] = useState<WeekPlan | null>(null)

  // Confirmation dialog state
  const [confirmNewPlan, setConfirmNewPlan] = useState(false)

  // Print materials state
  const [generatingMaterials, setGeneratingMaterials] = useState<string | null>(null)

  // Generate activity state
  const [generatingItemId, setGeneratingItemId] = useState<string | null>(null)
  const [generatedActivity, setGeneratedActivity] = useState<GeneratedActivity | null>(null)
  const [generatedPlanItem, setGeneratedPlanItem] = useState<DraftPlanItem | null>(null)
  const [lessonCardSaved, setLessonCardSaved] = useState(false)
  const [lessonCardSaving, setLessonCardSaving] = useState(false)

  // Scan hook for workbook page analysis
  const {
    scan: runScan,
    recordAction: recordScanAction,
    scanResult: scanRecord,
    scanning: scanLoading,
    error: scanError,
    clearScan,
  } = useScan()

  // Workbook configs for active child (for photo label matching)
  const [workbookConfigs, setWorkbookConfigs] = useState<WorkbookConfig[]>([])

  // Setup wizard state
  const [conversationLoaded, setConversationLoaded] = useState(false)
  const [setupComplete, setSetupComplete] = useState(false)
  const [weekEnergy, setWeekEnergy] = useState<'full' | 'lighter' | 'mvd'>('full')
  const [readAloud, setReadAloud] = useState('')
  const [readAloudBook, setReadAloudBook] = useState('')
  const [readAloudChapters, setReadAloudChapters] = useState('')
  const [weekNotes, setWeekNotes] = useState('')
  const [selectedWorkbookIds, setSelectedWorkbookIds] = useState<Set<string>>(new Set())

  // Quick workbook add state (inline in setup wizard)
  const [quickWorkbooks, setQuickWorkbooks] = useState<Array<{ name: string; subject: string }>>([
    { name: '', subject: 'Reading' },
  ])

  // Per-subject default time overrides (minutes per day)
  const [subjectTimeDefaults, setSubjectTimeDefaults] = useState<SubjectTimeDefaults>({})

  // Returning-user compact setup toggles
  const [showRoutineEdit, setShowRoutineEdit] = useState(false)
  const [showWorkbookEdit, setShowWorkbookEdit] = useState(false)
  const [showTimeEdit, setShowTimeEdit] = useState(false)

  // Daily routine state — initialized with default template
  const [dailyRoutine, setDailyRoutine] = useState(defaultDailyRoutine)

  // Adjust hoursPerDay based on energy selection and routine total
  useEffect(() => {
    const routineTotal = parseRoutineTotalMinutes(dailyRoutine)
    if (weekEnergy === 'full') {
      setHoursPerDay(routineTotal > 0 ? Math.round((routineTotal / 60) * 10) / 10 : 3)
    } else if (weekEnergy === 'lighter') {
      setHoursPerDay(routineTotal > 0 ? Math.round((routineTotal * 0.65 / 60) * 10) / 10 : 2)
    } else {
      setHoursPerDay(1.5)
    }
  }, [weekEnergy, dailyRoutine])

  // Suggest focus state
  const [suggestingFocus, setSuggestingFocus] = useState(false)
  // Conundrum state
  const autoSuggestTriggered = useRef(false)

  const conversationDocId = useMemo(
    () => (activeChildId ? plannerConversationDocId(weekRange.start, activeChildId) : ''),
    [weekRange.start, activeChildId],
  )

  // Quick workbook handlers
  const updateQuickWorkbook = useCallback((i: number, field: string, value: string) => {
    setQuickWorkbooks(prev => prev.map((qw, idx) => idx === i ? { ...qw, [field]: value } : qw))
  }, [])
  const removeQuickWorkbook = useCallback((i: number) => {
    setQuickWorkbooks(prev => prev.filter((_, idx) => idx !== i))
  }, [])
  const addQuickWorkbook = useCallback(() => {
    setQuickWorkbooks(prev => [...prev, { name: '', subject: 'Reading' }])
  }, [])

  // Load planner defaults (hoursPerDay, readAloud — family-level)
  useEffect(() => {
    if (!familyId) return
    const settingsRef = doc(db, `families/${familyId}/settings/plannerDefaults`)
    void getDoc(settingsRef).then((snap) => {
      if (snap.exists()) {
        const data = snap.data()
        if (data.hoursPerDay) setHoursPerDay(data.hoursPerDay)
        if (data.readAloud) setReadAloud(data.readAloud)
        if (data.readAloudBook) setReadAloudBook(data.readAloudBook)
        if (data.readAloudChapters) setReadAloudChapters(data.readAloudChapters)
      }
    })
  }, [familyId])

  // Load per-child daily routine (falls back to default template)
  useEffect(() => {
    if (!familyId || !activeChildId) {
      setDailyRoutine(defaultDailyRoutine)
      return
    }
    const childSettingsRef = doc(db, `families/${familyId}/settings/plannerDefaults_${activeChildId}`)
    void getDoc(childSettingsRef).then((snap) => {
      if (snap.exists() && snap.data().dailyRoutine) {
        setDailyRoutine(snap.data().dailyRoutine)
      } else {
        setDailyRoutine(defaultDailyRoutine)
      }
    })
  }, [familyId, activeChildId])

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
          setConversationLoaded(true)
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

  // Load workbook configs for active child
  useEffect(() => {
    if (!activeChildId) {
      setWorkbookConfigs([])
      return
    }
    const col = workbookConfigsCollection(familyId)
    const q = query(col, where('childId', '==', activeChildId))
    void getDocs(q).then((snap) => {
      const configs = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
      setWorkbookConfigs(configs)
    })
  }, [familyId, activeChildId])

  // Initialize selected workbooks when configs load
  useEffect(() => {
    if (workbookConfigs.length > 0) {
      setSelectedWorkbookIds(new Set(workbookConfigs.map((c) => c.id ?? '')))
    }
  }, [workbookConfigs])

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
          appBlocks,
          assignments: [],
          createdAt: now,
          updatedAt: now,
          ...updates,
        }
        await setDoc(ref, conversation)
      }
    },
    [familyId, conversationDocId, activeChildId, weekRange.start, hoursPerDay, appBlocks],
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
    setPhotoLabels((prev) => [...prev, newLabel])
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
    const inputs = { snapshot, hoursPerDay, appBlocks, assignments, adjustments, dailyRoutine, subjectTimeDefaults: mergedPhotoDefaults }
    let draft: DraftWeeklyPlan
    let usedAI = false

    if (isEnabled(AIFeatureFlag.AiPlanning) && activeChildId) {
      // AI path: send context to Cloud Function
      const prompt = buildPlannerPrompt(inputs)
      const photoContext = buildPhotoContextSection(photoLabels)
      const fullPrompt = photoContext ? `${prompt}\n\n${photoContext}` : prompt
      const aiMessages: AIChatMessage[] = [{ role: 'user', content: fullPrompt }]
      const response = await aiChat({
        familyId,
        childId: activeChildId,
        taskType: TaskType.Plan,
        messages: aiMessages,
      })

      const rawAiDraft = response ? parseAIResponse(response) : null
      const aiDraft = rawAiDraft ? fillMissingDaysFromRoutine(rawAiDraft, dailyRoutine, hoursPerDay) : null
      if (aiDraft) {
        draft = aiDraft
        usedAI = true
      } else {
        // Fallback to local logic
        draft = generateDraftPlanFromInputs(inputs)
        setSnack({ text: 'AI planning unavailable — used local planner.', severity: 'info' })
      }
    } else {
      // Local path (flag off)
      draft = generateDraftPlanFromInputs(inputs)
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
    setShowPhotos(false)

    void persistConversation({
      messages: updatedMessages,
      currentDraft: draft,
      assignments,
    })
  }, [photoLabels, snapshot, hoursPerDay, appBlocks, adjustments, dailyRoutine, messages, persistConversation, isEnabled, activeChildId, familyId, aiChat, extractPhotoContent, subjectTimeDefaults])

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
    const inputs = { snapshot, hoursPerDay, appBlocks, assignments, adjustments, dailyRoutine, subjectTimeDefaults: mergedDefaults }
    let draft: DraftWeeklyPlan
    let usedAI = false

    if (isEnabled(AIFeatureFlag.AiPlanning) && activeChildId) {
      const prompt = buildPlannerPrompt(inputs)
      const photoContext = buildPhotoContextSection(photoLabels)
      const fullPrompt = photoContext ? `${prompt}\n\n${photoContext}` : prompt
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
      const aiDraft = rawAiDraft ? fillMissingDaysFromRoutine(rawAiDraft, dailyRoutine, hoursPerDay) : null
      if (aiDraft) {
        draft = aiDraft
        usedAI = true
      } else {
        draft = generateDraftPlanFromInputs(inputs)
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
      draft = generateDraftPlanFromInputs(inputs)
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
    setShowPhotos(false)

    void persistConversation({
      messages: updatedMessages,
      currentDraft: draft,
      assignments,
    })
  }, [photoLabels, snapshot, hoursPerDay, appBlocks, adjustments, dailyRoutine, messages, persistConversation, isEnabled, activeChildId, familyId, aiChat, subjectTimeDefaults])

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
      const aiDraft = response ? parseAIResponse(response) : null
      let assistantMsg: ChatMessage
      if (aiDraft) {
        setCurrentDraft(aiDraft)
        if (applied) setApplied(false)
        assistantMsg = {
          id: generateItemId(),
          role: ChatMessageRole.Assistant,
          text: 'Here\'s the updated plan based on your request:',
          draftPlan: aiDraft,
          createdAt: new Date().toISOString(),
        }
      } else if (response?.message && looksLikePlanJson(response.message)) {
        // AI returned plan-like JSON but parseAIResponse failed — try aggressive recovery
        let recovered: DraftWeeklyPlan | null = null
        try {
          const msg = response.message.trim()
          const stripped = msg.replace(/```(?:json)?\s*/g, '').replace(/\s*```/g, '').trim()
          const directParse = JSON.parse(stripped)
          if (directParse.days && Array.isArray(directParse.days)) {
            recovered = parseAIResponse({ ...response, message: JSON.stringify(directParse) })
          }
        } catch { /* fall through to local planner */ }

        if (recovered) {
          setCurrentDraft(recovered)
          if (applied) setApplied(false)
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
          const localDraft = generateDraftPlanFromInputs({
            snapshot, hoursPerDay, appBlocks, assignments, adjustments, dailyRoutine,
            subjectTimeDefaults: { ...DEFAULT_SUBJECT_MINUTES, ...subjectTimeDefaults },
          })
          setCurrentDraft(localDraft)
          if (applied) setApplied(false)
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
      const persistStatus = aiDraft && applied ? { status: PlannerConversationStatus.Draft } : {}
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
      const draft = generateDraftPlanFromInputs({
        snapshot,
        hoursPerDay,
        appBlocks,
        assignments,
        adjustments: newAdjustments,
        subjectTimeDefaults: { ...DEFAULT_SUBJECT_MINUTES, ...subjectTimeDefaults },
      })

      setCurrentDraft(draft)
      setAdjustments(newAdjustments)
      if (applied) setApplied(false)

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
      ...(applied ? { status: PlannerConversationStatus.Draft } : {}),
    })
  }, [inputText, currentDraft, adjustments, photoLabels, snapshot, hoursPerDay, appBlocks, messages, persistConversation, isEnabled, activeChildId, aiChat, familyId, applied, dailyRoutine, handleGeneratePlan, subjectTimeDefaults])

  // Toggle workbook selection in setup wizard
  const handleWorkbookToggle = useCallback((wbId: string, checked: boolean) => {
    setSelectedWorkbookIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(wbId)
      } else {
        next.delete(wbId)
      }
      return next
    })
  }, [])

  // Generate unified weekly focus (theme + story chapter + connections) via AI
  const handleGenerateWeekStory = useCallback(async () => {
    if (!activeChildId) return
    setSuggestingFocus(true)
    try {
      const contextParts: string[] = []
      if (readAloudBook) {
        contextParts.push(`Read-aloud book this week: ${readAloudBook}${readAloudChapters ? ` (${readAloudChapters})` : ''}. Connect the readingTieIn to this book's themes.`)
      }
      if (weekNotes) {
        contextParts.push(`Parent notes: ${weekNotes}`)
      }
      const subjects = selectedWorkbookIds.size > 0
        ? Array.from(selectedWorkbookIds).join(', ')
        : 'Reading, Math, Language Arts'
      contextParts.push(`Subjects this week: ${subjects}`)

      const response = await aiChat({
        familyId,
        childId: activeChildId,
        taskType: TaskType.WeeklyFocus,
        messages: [{
          role: 'user',
          content: contextParts.join('\n'),
        }],
      })

      if (!response) {
        const detail = aiError?.message || 'Unknown error'
        setSnack({
          text: `Failed to generate story: ${detail}`,
          severity: 'error',
        })
        return
      }

      if (response.message) {
        try {
          let json = response.message.trim()
          // Strip markdown fences if present
          const fenceMatch = json.match(/```(?:json)?\s*([\s\S]*?)```/)
          if (fenceMatch) json = fenceMatch[1].trim()
          const firstBrace = json.indexOf('{')
          const lastBrace = json.lastIndexOf('}')
          if (firstBrace >= 0 && lastBrace > firstBrace) json = json.slice(firstBrace, lastBrace + 1)

          const parsed = JSON.parse(json)

          // Validate required fields — don't set if empty
          if (parsed.theme) updateWeekField('theme', parsed.theme)
          if (parsed.virtue) updateWeekField('virtue', parsed.virtue)
          if (parsed.scriptureRef) updateWeekField('scriptureRef', parsed.scriptureRef)
          if (parsed.scriptureText) updateWeekField('scriptureText', parsed.scriptureText)
          if (parsed.heartQuestion) updateWeekField('heartQuestion', parsed.heartQuestion)
          if (parsed.formationPrompt) updateWeekField('formationPrompt', parsed.formationPrompt)

          // Set conundrum (the story chapter)
          if (parsed.conundrum && parsed.conundrum.title && parsed.conundrum.scenario) {
            updateWeekField('conundrum', parsed.conundrum)
          }

          // Log any missing fields for debugging
          const required = ['theme', 'virtue', 'scriptureRef', 'scriptureText', 'heartQuestion', 'formationPrompt']
          const missing = required.filter(f => !parsed[f])
          if (missing.length > 0) {
            console.warn('[WeeklyFocus] Missing fields:', missing)
            setSnack({
              text: `Week focus generated, but ${missing.join(', ')} couldn't be filled. Tap ✨ to retry.`,
              severity: 'warning',
            })
          } else {
            setSnack({
              text: 'This week\'s story has been generated!',
              severity: 'success',
            })
          }
        } catch (parseErr) {
          console.error('[WeeklyFocus] Failed to parse:', parseErr, '\nRaw response:', response.message)
          setSnack({
            text: 'Story generated but couldn\'t parse response — check console.',
            severity: 'error',
          })
        }
      } else {
        setSnack({
          text: 'Story generation returned an empty response. Tap ✨ to retry.',
          severity: 'warning',
        })
      }
    } catch (err) {
      console.error('[WeeklyFocus] Generation failed:', err)
      setSnack({
        text: `Story generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        severity: 'error',
      })
    } finally {
      setSuggestingFocus(false)
    }
  }, [activeChildId, familyId, aiChat, aiError, updateWeekField, readAloudBook, readAloudChapters, weekNotes, selectedWorkbookIds, setSnack])

  // Auto-generate week focus when fields are empty on first visit
  useEffect(() => {
    if (!weekPlan || !activeChildId || conversationLoaded || setupComplete) return
    if (autoSuggestTriggered.current) return
    const isEmpty = !weekPlan.theme && !weekPlan.virtue && !weekPlan.scriptureRef && !weekPlan.heartQuestion
    if (isEmpty) {
      autoSuggestTriggered.current = true
      const timer = setTimeout(() => {
        void handleGenerateWeekStory()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [weekPlan, activeChildId, conversationLoaded, setupComplete, handleGenerateWeekStory])

  // Setup wizard completion handler
  const handleSetupComplete = useCallback(async () => {
    const energyLabel =
      weekEnergy === 'full'
        ? 'normal energy'
        : weekEnergy === 'lighter'
          ? 'lighter week, reduce load'
          : 'MVD week, minimum items only'

    // Save quick workbooks to Firestore if any are filled in
    if (activeChildId) {
      for (const qw of quickWorkbooks) {
        if (!qw.name.trim()) continue
        await addDoc(workbookConfigsCollection(familyId), {
          childId: activeChildId,
          name: qw.name.trim(),
          subjectBucket: qw.subject as SubjectBucket,
          totalUnits: 100,
          currentPosition: 0,
          unitLabel: 'lesson',
          targetFinishDate: '2026-06-30',
          schoolDaysPerWeek: 5,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      }
    }

    // Build workbook lines including both existing selected and quick-added
    const allWorkbookLines = [
      ...workbookConfigs
        .filter((wb) => selectedWorkbookIds.has(wb.id ?? ''))
        .map((wb) => `- ${wb.name}: ${wb.unitLabel} ${wb.currentPosition + 1} (${wb.subjectBucket})`),
      ...quickWorkbooks
        .filter((qw) => qw.name.trim())
        .map((qw) => `- ${qw.name} (${qw.subject})`),
    ].join('\n')

    // Save family-level planner defaults (hoursPerDay, readAloud)
    void setDoc(doc(db, `families/${familyId}/settings/plannerDefaults`), {
      hoursPerDay,
      readAloud,
      readAloudBook,
      readAloudChapters,
      updatedAt: new Date().toISOString(),
    }, { merge: true })

    // Save per-child daily routine and subject time defaults
    if (activeChildId) {
      void setDoc(doc(db, `families/${familyId}/settings/plannerDefaults_${activeChildId}`), {
        dailyRoutine,
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
${readAloud ? `Read-aloud: ${readAloud}` : ''}
${readAloudBook ? `\nRead-aloud book: ${readAloudBook}${readAloudChapters ? ` (${readAloudChapters})` : ''}` : ''}
${readAloudBook && readAloudChapters ? `\nFor each day's chapter, generate ONE discussion question. Vary question types across the week:\n- Comprehension: "What happened? Why did the character do that?"\n- Application: "What would this look like in your life?"\n- Connection: "Does this remind you of anything?"\n- Opinion: "Do you agree with what the character did? Why?"\n- Prediction: "What do you think will happen next?"\nInclude the question in a "chapterQuestion" field on each day.` : ''}
${dailyRoutine ? `\nDaily routine (use this as the base template for each day — keep these activities and times, vary them across the week as appropriate):\n${dailyRoutine}` : ''}

Subject time defaults (use these as the baseline for estimatedMinutes per item):
${subjectDefaultsLines}
${weekNotes ? `\nNotes: ${weekNotes}` : ''}

Generate a plan for Monday through Friday.`.trim()

    setSetupComplete(true)

    // Add context message to chat for visual display
    const userMsg: ChatMessage = {
      id: generateItemId(),
      role: ChatMessageRole.User,
      text: contextMessage,
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])

    // Generate through the proper path with full context (not handleSend which lacks structured prompt)
    setTimeout(() => {
      void handleGeneratePlan()
    }, 100)
  }, [weekEnergy, hoursPerDay, workbookConfigs, selectedWorkbookIds, readAloud, readAloudBook, readAloudChapters, weekNotes, activeChild, handleGeneratePlan, quickWorkbooks, dailyRoutine, activeChildId, familyId, subjectTimeDefaults])

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

        const dayIndex = WEEK_DAYS.indexOf(dayPlan.day as typeof WEEK_DAYS[number])
        if (dayIndex < 0) continue

        const startDate = new Date(weekRange.start + 'T00:00:00')
        const targetDate = new Date(startDate)
        targetDate.setDate(startDate.getDate() + dayIndex)
        const dateKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`

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
      const draft = generateDraftPlanFromInputs({
        snapshot,
        hoursPerDay,
        appBlocks,
        assignments,
        adjustments: newAdjustments,
        subjectTimeDefaults: { ...DEFAULT_SUBJECT_MINUTES, ...subjectTimeDefaults },
      })
      setCurrentDraft(draft)
      setAdjustments(newAdjustments)
      if (applied) setApplied(false)
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
      ...(applied ? { status: PlannerConversationStatus.Draft } : {}),
    })
  }, [currentDraft, adjustments, photoLabels, snapshot, hoursPerDay, appBlocks, messages, persistConversation, applied, subjectTimeDefaults, isEnabled, activeChildId, handleSend])

  // Generate printable materials for a day
  const handleGenerateMaterials = useCallback(async (day: DraftDayPlan) => {
    if (!activeChildId) return
    setGeneratingMaterials(day.day)

    try {
      const prompt = buildMaterialsPrompt(
        day,
        activeChild?.name ?? 'Student',
        snapshot,
        weekPlan?.theme,
        weekPlan?.conundrum,
        weekPlan?.virtue,
        weekPlan?.scriptureRef,
        weekPlan?.scriptureText,
      )

      const response = await aiChat({
        familyId,
        childId: activeChildId,
        taskType: TaskType.Workshop,
        messages: [{ role: 'user', content: prompt }],
      })

      if (response?.message) {
        try {
          openPrintWindow(response.message, `${activeChild?.name ?? 'Student'} - ${day.day}`)
          setSnack({ text: 'Worksheet ready! Check your new tab or downloads.', severity: 'success' })
        } catch (err) {
          console.error('Print failed:', err)
          setSnack({ text: 'Print failed. Try again.', severity: 'error' })
        }
      }
    } catch (err) {
      console.error('Material generation failed:', err)
      setSnack({ text: 'Failed to generate materials. Try again.', severity: 'error' })
    } finally {
      setGeneratingMaterials(null)
    }
  }, [activeChildId, activeChild, snapshot, weekPlan, aiChat, familyId])

  const handleGenerateAllMaterials = useCallback(async () => {
    if (!currentDraft) return
    for (const day of currentDraft.days) {
      await handleGenerateMaterials(day)
      await new Promise((r) => setTimeout(r, 1000))
    }
  }, [currentDraft, handleGenerateMaterials])

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

  // Reset conversation state (shared by both Start New Plan and Clear Applied Plan)
  const resetConversationState = useCallback(async () => {
    setMessages([])
    setCurrentDraft(null)
    setApplied(false)
    setPhotoLabels([])
    setAdjustments([])
    setSetupComplete(false)
    setConversationLoaded(false)
    setWeekEnergy('full')
    setReadAloud('')
    setWeekNotes('')

    if (conversationDocId) {
      const ref = doc(plannerConversationsCollection(familyId), conversationDocId)
      await setDoc(ref, {
        childId: activeChildId,
        weekKey: weekRange.start,
        status: PlannerConversationStatus.Draft,
        messages: [],
        availableHoursPerDay: hoursPerDay,
        appBlocks,
        assignments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    }
  }, [conversationDocId, familyId, activeChildId, weekRange.start, hoursPerDay, appBlocks])

  // Repeat Last Week handler: clone previous week's plan with advanced lesson numbers
  const handleRepeatLastWeek = useCallback(async () => {
    if (!activeChildId) return
    try {
      // Compute previous week start by subtracting 7 days
      const startDate = new Date(weekRange.start + 'T00:00:00')
      startDate.setDate(startDate.getDate() - 7)
      const previousWeekStart = formatDateYmd(startDate)

      const prevDocId = plannerConversationDocId(previousWeekStart, activeChildId)
      const prevRef = doc(plannerConversationsCollection(familyId), prevDocId)
      const prevSnap = await getDoc(prevRef)

      if (!prevSnap.exists() || !prevSnap.data().currentDraft) {
        setSnack({ text: 'No plan found for last week. Try planning with AI instead.', severity: 'info' })
        return
      }

      const previousDraft = prevSnap.data().currentDraft!
      const clonedDraft = clonePlanWithAdvancedLessons(previousDraft)

      setCurrentDraft(clonedDraft)

      const assistantMsg: ChatMessage = {
        id: generateItemId(),
        role: ChatMessageRole.Assistant,
        text: "Here's last week's plan carried forward with workbook lessons advanced. Review and adjust, then Apply.",
        draftPlan: clonedDraft,
        createdAt: new Date().toISOString(),
      }

      const updatedMessages = [...messages, assistantMsg]
      setMessages(updatedMessages)

      void persistConversation({
        messages: updatedMessages,
        currentDraft: clonedDraft,
      })
    } catch (err) {
      console.error('Failed to repeat last week', err)
      setSnack({ text: 'Failed to load last week\'s plan.', severity: 'error' })
    }
  }, [activeChildId, weekRange.start, familyId, messages, persistConversation])

  // Redo Plan handler: clears applied plan from Today/Week AND resets conversation
  const handleRedoPlan = useCallback(async () => {
    setConfirmNewPlan(false)
    if (!activeChildId || !currentDraft) return
    try {
      // Remove planner-generated blocks and checklist from each day's DayLog
      for (const dayPlan of currentDraft.days) {
        const dayIndex = WEEK_DAYS.indexOf(dayPlan.day as typeof WEEK_DAYS[number])
        if (dayIndex < 0) continue

        const startDate = new Date(weekRange.start + 'T00:00:00')
        const targetDate = new Date(startDate)
        targetDate.setDate(startDate.getDate() + dayIndex)
        const dateKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`

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

  const isReviewPhase = Boolean(currentDraft) && !applied
  const isActivePhase = (setupComplete || conversationLoaded) && !isReviewPhase

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
            appBlocks={appBlocks}
            prioritySkills={snapshot?.prioritySkills ?? []}
            currentDraft={currentDraft}
          />

          {/* Week Focus — Story-driven unified generation */}
          {weekPlan && (
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                p: 2,
                bgcolor: 'background.paper',
              }}
            >
              <Stack spacing={2}>
                <Typography variant="subtitle2">This Week in Stonebridge</Typography>

                {/* Generate button */}
                <Button
                  variant="contained"
                  onClick={handleGenerateWeekStory}
                  disabled={suggestingFocus}
                  startIcon={suggestingFocus ? <CircularProgress size={16} /> : <AutoAwesomeIcon />}
                  fullWidth
                  size="large"
                >
                  {suggestingFocus
                    ? 'Writing this week\'s chapter...'
                    : weekPlan.theme
                      ? 'Generate New Story'
                      : 'Generate This Week\'s Story'}
                </Button>

                {/* Theme + Virtue + Scripture */}
                {weekPlan.theme && (
                  <Stack spacing={1.5}>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip label={weekPlan.theme} color="primary" />
                      {weekPlan.virtue && <Chip label={weekPlan.virtue} color="secondary" variant="outlined" />}
                    </Stack>

                    {weekPlan.scriptureRef && (
                      <Typography variant="body2">
                        <strong>{weekPlan.scriptureRef}</strong>
                        {weekPlan.scriptureText && (
                          <Typography component="span" variant="body2" sx={{ fontStyle: 'italic' }}>
                            {' — "'}{weekPlan.scriptureText}{'"'}
                          </Typography>
                        )}
                      </Typography>
                    )}

                    {weekPlan.heartQuestion && (
                      <Typography variant="body2" color="text.secondary">
                        {weekPlan.heartQuestion}
                      </Typography>
                    )}

                    {weekPlan.formationPrompt && (
                      <Typography variant="body2" color="text.secondary">
                        {weekPlan.formationPrompt}
                      </Typography>
                    )}
                  </Stack>
                )}

                {/* Story Chapter */}
                {weekPlan.conundrum && (
                  <Stack spacing={1.5} sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      {weekPlan.conundrum.title}
                    </Typography>

                    <Typography
                      variant="body1"
                      sx={{ lineHeight: 1.8, whiteSpace: 'pre-line' }}
                    >
                      {weekPlan.conundrum.scenario}
                    </Typography>

                    <Typography variant="body1" fontWeight={700} sx={{ mt: 1 }}>
                      {weekPlan.conundrum.question}
                    </Typography>

                    {/* Connection badges */}
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                      <Chip label={`Lincoln: ${weekPlan.conundrum.lincolnPrompt?.slice(0, 40)}...`} size="small" variant="outlined" color="primary" />
                      <Chip label={`London: ${weekPlan.conundrum.londonPrompt?.slice(0, 40)}...`} size="small" variant="outlined" color="secondary" />
                      {weekPlan.conundrum.readingTieIn && <Chip label="Reading" size="small" variant="outlined" />}
                      {weekPlan.conundrum.mathContext && <Chip label="Math" size="small" variant="outlined" />}
                      {weekPlan.conundrum.londonDrawingPrompt && <Chip label="Drawing" size="small" variant="outlined" />}
                      {weekPlan.conundrum.dadLabSuggestion && <Chip label="Dad Lab" size="small" variant="outlined" />}
                    </Stack>
                  </Stack>
                )}

                {/* Manual edit — collapsed */}
                {weekPlan.theme && (
                <Accordion>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="caption" color="text.secondary">
                      Edit fields manually
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Stack spacing={1}>
                      <TextField size="small" label="Theme" value={weekPlan.theme} onChange={(e) => updateWeekField('theme', e.target.value)} />
                      <TextField size="small" label="Virtue" value={weekPlan.virtue} onChange={(e) => updateWeekField('virtue', e.target.value)} />
                      <TextField size="small" label="Scripture Ref" value={weekPlan.scriptureRef} onChange={(e) => updateWeekField('scriptureRef', e.target.value)} />
                      <TextField size="small" label="Scripture Text" value={weekPlan.scriptureText ?? ''} onChange={(e) => updateWeekField('scriptureText', e.target.value)} multiline />
                      <TextField size="small" label="Heart Question" value={weekPlan.heartQuestion} onChange={(e) => updateWeekField('heartQuestion', e.target.value)} multiline />
                      <TextField size="small" label="Formation Prompt" value={weekPlan.formationPrompt ?? ''} onChange={(e) => updateWeekField('formationPrompt', e.target.value)} multiline />
                    </Stack>
                  </AccordionDetails>
                </Accordion>
                )}
              </Stack>
            </Box>
          )}

          {/* Setup wizard — shown when no conversation exists for this week */}
          {messages.length === 0 && !setupComplete && !conversationLoaded && (() => {
            const isReturningUser = workbookConfigs.length > 0 || dailyRoutine !== defaultDailyRoutine

            return isReturningUser ? (
              /* ── Compact returning-user setup ── */
              <Stack spacing={2} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
                <Typography variant="h6">Plan {activeChild?.name ?? 'your child'}&apos;s Week</Typography>

                {/* Energy — always show, it's the main weekly decision */}
                <Box>
                  <Typography variant="subtitle2" gutterBottom>How&apos;s your week looking?</Typography>
                  <ToggleButtonGroup value={weekEnergy} exclusive onChange={(_, v) => { if (v) setWeekEnergy(v) }} size="small">
                    <ToggleButton value="full">Full Week</ToggleButton>
                    <ToggleButton value="lighter">Lighter Week</ToggleButton>
                    <ToggleButton value="mvd">Tough Week (MVD)</ToggleButton>
                  </ToggleButtonGroup>
                </Box>

                {/* Routine — show as read-only summary with edit button */}
                <Box>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle2">Your usual routine</Typography>
                    <Button size="small" onClick={() => setShowRoutineEdit(!showRoutineEdit)}>
                      {showRoutineEdit ? 'Done' : 'Edit'}
                    </Button>
                  </Stack>
                  {dailyRoutine && (() => {
                    const routineTotal = parseRoutineTotalMinutes(dailyRoutine)
                    const target = Math.round(hoursPerDay * 60)
                    return routineTotal > 0 ? (
                      <Typography
                        variant="caption"
                        color={routineTotal > target ? 'error' : 'text.secondary'}
                        sx={{ mt: 0.25 }}
                      >
                        Total: {routineTotal} min/day (target: {target} min)
                      </Typography>
                    ) : null
                  })()}
                  {!showRoutineEdit ? (
                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line', mt: 0.5 }}>
                      {dailyRoutine || 'No routine saved yet'}
                    </Typography>
                  ) : (
                    <TextField
                      size="small"
                      value={dailyRoutine}
                      onChange={e => setDailyRoutine(e.target.value)}
                      fullWidth
                      multiline
                      rows={4}
                      sx={{ mt: 0.5 }}
                    />
                  )}
                </Box>

                {/* Workbooks — show as chips, not checkboxes */}
                <Box>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle2">Workbooks</Typography>
                    <Button size="small" onClick={() => setShowWorkbookEdit(!showWorkbookEdit)}>
                      {showWorkbookEdit ? 'Done' : 'Edit'}
                    </Button>
                  </Stack>
                  {!showWorkbookEdit ? (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                      {workbookConfigs.map(wb => (
                        <Chip key={wb.id} label={`${wb.name} — ${wb.unitLabel} ${wb.currentPosition + 1}`} size="small" />
                      ))}
                    </Stack>
                  ) : (
                    <Box sx={{ mt: 0.5 }}>
                      {workbookConfigs.map((wb) => (
                        <FormControlLabel
                          key={wb.id ?? wb.name}
                          control={
                            <Checkbox
                              checked={selectedWorkbookIds.has(wb.id ?? '')}
                              onChange={(e) => handleWorkbookToggle(wb.id ?? '', e.target.checked)}
                            />
                          }
                          label={`${wb.name} — next: ${wb.unitLabel} ${wb.currentPosition + 1}`}
                        />
                      ))}
                    </Box>
                  )}
                </Box>

                {/* Subject times — compact with edit toggle */}
                <Box>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle2">Subject times (per day)</Typography>
                    <Button size="small" onClick={() => setShowTimeEdit(!showTimeEdit)}>
                      {showTimeEdit ? 'Done' : 'Edit'}
                    </Button>
                  </Stack>
                  {showTimeEdit && (
                    <Stack spacing={1} sx={{ mt: 1 }}>
                      {Object.entries(DEFAULT_SUBJECT_MINUTES).map(([subject, fallback]) => {
                        const current = subjectTimeDefaults[subject] ?? fallback
                        return (
                          <Stack key={subject} direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2" sx={{ flex: 1 }}>
                              {subject === 'Other' ? 'Formation' : subject === 'LanguageArts' ? 'Language Arts' : subject === 'SocialStudies' ? 'Social Studies' : subject}
                            </Typography>
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              <IconButton size="small" onClick={() => setSubjectTimeDefaults(prev => ({ ...prev, [subject]: Math.max(5, (prev[subject] ?? fallback) - 5) }))}>
                                <Typography variant="body2">-</Typography>
                              </IconButton>
                              <Typography variant="body2" sx={{ minWidth: 40, textAlign: 'center' }}>{current}m</Typography>
                              <IconButton size="small" onClick={() => setSubjectTimeDefaults(prev => ({ ...prev, [subject]: Math.min(60, (prev[subject] ?? fallback) + 5) }))}>
                                <Typography variant="body2">+</Typography>
                              </IconButton>
                            </Stack>
                          </Stack>
                        )
                      })}
                    </Stack>
                  )}
                </Box>

                {/* Special notes — always show, it changes weekly */}
                <TextField
                  size="small"
                  label="Anything special this week?"
                  placeholder="Field trip Tuesday, appointment Thursday..."
                  value={weekNotes}
                  onChange={(e) => setWeekNotes(e.target.value)}
                  fullWidth
                  multiline
                  rows={2}
                />

                {(!snapshot || snapshot.prioritySkills.length === 0) && (
                  <Alert severity="info" sx={{ '& .MuiAlert-message': { fontSize: '0.85rem' } }}>
                    💡 Plans are better with evaluation data.{' '}
                    <RouterLink to="/evaluate" style={{ color: 'inherit', fontWeight: 600 }}>
                      Run a quick reading evaluation
                    </RouterLink>{' '}
                    first — it helps me know what to focus on and what to skip.
                  </Alert>
                )}

                {/* Generate button — big and primary */}
                <Button
                  variant="contained"
                  size="large"
                  onClick={handleSetupComplete}
                  fullWidth
                  startIcon={<AutoAwesomeIcon />}
                  sx={{ py: 1.5, fontWeight: 'bold', fontSize: '1rem' }}
                >
                  Generate Plan
                </Button>

                <Button variant="outlined" size="small" onClick={handleRepeatLastWeek}>
                  Or repeat last week&apos;s plan
                </Button>
              </Stack>
            ) : (
              /* ── Full first-time user setup ── */
              <Stack spacing={3} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
                <Typography variant="h6">Plan {activeChild?.name ?? 'your child'}&apos;s Week</Typography>

                {/* Step 1: Energy */}
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    How&apos;s your week looking?
                  </Typography>
                  <ToggleButtonGroup
                    value={weekEnergy}
                    exclusive
                    onChange={(_, v) => { if (v) setWeekEnergy(v) }}
                    size="small"
                  >
                    <ToggleButton value="full">Full Week</ToggleButton>
                    <ToggleButton value="lighter">Lighter Week</ToggleButton>
                    <ToggleButton value="mvd">Tough Week (MVD)</ToggleButton>
                  </ToggleButtonGroup>
                </Box>

                {/* Step 2: Workbooks */}
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    This week&apos;s workbooks
                  </Typography>
                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      No workbooks yet. Add your curricula:
                    </Typography>
                    <Stack spacing={1}>
                      {quickWorkbooks.map((qw, i) => (
                        <Stack key={i} direction="row" spacing={1} alignItems="center">
                          <TextField
                            size="small"
                            placeholder="Curriculum name (e.g., Good and the Beautiful)"
                            value={qw.name}
                            onChange={e => updateQuickWorkbook(i, 'name', e.target.value)}
                            sx={{ flex: 2 }}
                          />
                          <FormControl size="small" sx={{ flex: 1, minWidth: 100 }}>
                            <InputLabel>Subject</InputLabel>
                            <Select
                              value={qw.subject}
                              label="Subject"
                              onChange={e => updateQuickWorkbook(i, 'subject', e.target.value)}
                            >
                              <MenuItem value="Reading">Reading</MenuItem>
                              <MenuItem value="Math">Math</MenuItem>
                              <MenuItem value="LanguageArts">Language Arts</MenuItem>
                              <MenuItem value="Science">Science</MenuItem>
                              <MenuItem value="Other">Other</MenuItem>
                            </Select>
                          </FormControl>
                          <IconButton size="small" onClick={() => removeQuickWorkbook(i)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      ))}
                      <Button
                        size="small"
                        variant="text"
                        onClick={addQuickWorkbook}
                        startIcon={<AddIcon />}
                      >
                        Add curriculum
                      </Button>
                    </Stack>
                  </Box>
                  <TextField
                    size="small"
                    placeholder="Read-aloud book + chapter (e.g., Charlotte's Web Ch 5)"
                    value={readAloud}
                    onChange={(e) => setReadAloud(e.target.value)}
                    fullWidth
                    sx={{ mt: 1 }}
                  />
                  <TextField
                    label="Read-aloud book"
                    placeholder="e.g., Charlotte's Web"
                    value={readAloudBook}
                    onChange={(e) => setReadAloudBook(e.target.value)}
                    size="small"
                    fullWidth
                    sx={{ mt: 1 }}
                  />
                  <TextField
                    label="Chapters this week"
                    placeholder="e.g., Chapters 3-7 or Ch 3 Mon, Ch 4 Tue..."
                    value={readAloudChapters}
                    onChange={(e) => setReadAloudChapters(e.target.value)}
                    size="small"
                    fullWidth
                    helperText="The AI will generate a discussion question for each chapter"
                    sx={{ mt: 1 }}
                  />
                </Box>

                {/* Per-subject default times */}
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    How long does each subject usually take?
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Set per-day defaults so the AI knows your family&apos;s pace.
                  </Typography>
                  <Stack spacing={1}>
                    {Object.entries(DEFAULT_SUBJECT_MINUTES).map(([subject, fallback]) => {
                      const current = subjectTimeDefaults[subject] ?? fallback
                      return (
                        <Stack key={subject} direction="row" spacing={1} alignItems="center">
                          <Typography variant="body2" sx={{ width: 120 }}>
                            {subject === 'Other' ? 'Formation' : subject === 'LanguageArts' ? 'Language Arts' : subject === 'SocialStudies' ? 'Social Studies' : subject}
                          </Typography>
                          <Select
                            size="small"
                            value={current}
                            onChange={(e) => {
                              const val = Number(e.target.value)
                              setSubjectTimeDefaults((prev) => ({ ...prev, [subject]: val }))
                            }}
                            sx={{ minWidth: 90 }}
                          >
                            {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60].map((m) => (
                              <MenuItem key={m} value={m}>{m} min</MenuItem>
                            ))}
                          </Select>
                        </Stack>
                      )
                    })}
                  </Stack>
                </Box>

                {/* Daily Routine */}
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    What does a typical school day look like?
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    List the activities and approximate times. The AI will use this as the starting template.
                  </Typography>
                  <TextField
                    size="small"
                    placeholder={`Example:\nHandwriting while I read aloud (20 min)\nBooster cards (15 min)\nGood and the Beautiful reading (30 min)\nSight word games (15 min)\nReading Eggs on tablet (45 min)\nMath workbook (30 min)`}
                    value={dailyRoutine}
                    onChange={e => setDailyRoutine(e.target.value)}
                    fullWidth
                    multiline
                    rows={6}
                  />
                </Box>

                {/* Special notes */}
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Anything special this week?
                  </Typography>
                  <TextField
                    size="small"
                    placeholder="Field trip Tuesday, appointment Thursday, etc."
                    value={weekNotes}
                    onChange={(e) => setWeekNotes(e.target.value)}
                    fullWidth
                    multiline
                    rows={2}
                  />
                </Box>

                {(!snapshot || snapshot.prioritySkills.length === 0) && (
                  <Alert severity="info" sx={{ '& .MuiAlert-message': { fontSize: '0.85rem' } }}>
                    💡 Plans are better with evaluation data.{' '}
                    <RouterLink to="/evaluate" style={{ color: 'inherit', fontWeight: 600 }}>
                      Run a quick reading evaluation
                    </RouterLink>{' '}
                    first — it helps me know what to focus on and what to skip.
                  </Alert>
                )}

                {/* Generate button */}
                <Button
                  variant="contained"
                  size="large"
                  onClick={handleSetupComplete}
                  fullWidth
                  startIcon={<AutoAwesomeIcon />}
                  sx={{ py: 1.5, fontWeight: 'bold', fontSize: '1rem' }}
                >
                  Generate Plan
                </Button>

                {/* Repeat last week shortcut */}
                <Button variant="outlined" size="small" onClick={handleRepeatLastWeek}>
                  Or repeat last week&apos;s plan
                </Button>
              </Stack>
            )
          })()}

          {/* Quick Start buttons — shown when no conversation yet (only welcome message) */}
          {setupComplete && messages.length <= 1 && !currentDraft && !applied && (
            <Stack spacing={1.5} sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Quick Start
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Button variant="outlined" size="small" onClick={handleRepeatLastWeek}>
                  Repeat Last Week
                </Button>
                <Button variant="outlined" size="small" onClick={() => setInputText('Help me plan this week')}>
                  Plan with AI
                </Button>
              </Stack>
            </Stack>
          )}

          {/* Plan Preview — full width, outside chat */}
          {currentDraft && !applied && (
            <Box sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              bgcolor: 'background.paper',
              p: 2,
            }}>
              <Typography variant="h6" gutterBottom>Your Week Plan</Typography>
              <PlanPreviewCard
                plan={currentDraft}
                hoursPerDay={hoursPerDay}
                onToggleItem={handleToggleItem}
                onGenerateActivity={!applied ? handleGenerateActivity : undefined}
                generatingItemId={generatingItemId ?? undefined}
              />
            </Box>
          )}

          {/* Chat area — active phase only (planning + in-week adjustments after apply) */}
          {isActivePhase && (
            <Box
              sx={{
                overflowY: 'auto',
                maxHeight: currentDraft ? '30vh' : '50vh',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                p: 2,
                bgcolor: 'grey.50',
              }}
            >
              {/* Adjustment label when plan exists */}
              {currentDraft && !applied && (
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  Need changes? Type below or tap a quick tweak.
                </Typography>
              )}
              {currentDraft && applied && (
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  Need an in-week change? Try: &quot;cancel Wednesday&quot;, &quot;lighten Thursday&quot;, or &quot;swap Tue/Thu&quot;.
                </Typography>
              )}
              <Stack spacing={1.5}>
                {messages.map((msg) => (
                  <Box
                    key={msg.id}
                    sx={{
                      alignSelf: msg.role === ChatMessageRole.User ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                      bgcolor: msg.role === ChatMessageRole.User ? 'primary.main' : 'background.paper',
                      color: msg.role === ChatMessageRole.User ? 'primary.contrastText' : 'text.primary',
                      px: 2,
                      py: 1,
                      borderRadius: 2,
                      boxShadow: 1,
                    }}
                  >
                    {msg.text && (
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                        {fixUnicodeEscapes(msg.text)}
                      </Typography>
                    )}
                    {msg.photoLabels && msg.photoLabels.length > 0 && (
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                        {msg.photoLabels.map((label, i) => (
                          <Typography key={i} variant="caption">
                            {label.subjectBucket}: {label.lessonOrPages || 'page'} ({label.estimatedMinutes}m)
                          </Typography>
                        ))}
                      </Stack>
                    )}
                  </Box>
                ))}
                <div ref={chatEndRef} />
              </Stack>
            </Box>
          )}

          {/* Photo upload area */}
          {showPhotos && (
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                p: 2,
                bgcolor: 'background.paper',
              }}
            >
              <Typography variant="subtitle2" gutterBottom>
                Upload & Label Photos
              </Typography>
              <PhotoLabelForm
                labels={photoLabels}
                onLabelsChange={setPhotoLabels}
                onPhotoCapture={handlePhotoCapture}
                uploading={uploading}
                workbookConfigs={workbookConfigs}
                onScanCapture={handleScanCapture}
                scanLoading={scanLoading}
                scanResult={scanRecord?.results ?? null}
                scanError={scanError}
                onScanClear={clearScan}
                onScanAccept={handleScanAccept}
              />
              {photoLabels.length > 0 && (
                <Button
                  variant="contained"
                  onClick={handleSubmitPhotos}
                  sx={{ mt: 1.5 }}
                  fullWidth
                >
                  Generate Plan ({photoLabels.length} photo{photoLabels.length > 1 ? 's' : ''})
                </Button>
              )}
            </Box>
          )}

          {/* Input area — active phase only */}
          {isActivePhase && (
            <Stack direction="row" spacing={1} alignItems="flex-end">
              {!currentDraft && !applied && (
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setShowPhotos(!showPhotos)}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  {showPhotos ? 'Hide Photos' : 'Add Photos'}
                </Button>
              )}
              <TextField
                fullWidth
                size="small"
                placeholder={
                  applied
                    ? 'Type an in-week change (e.g. "cancel Wednesday")...'
                    : currentDraft
                      ? 'Type an adjustment (e.g. "make Wed light")...'
                      : 'Upload photos first, or type a message...'
                }
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
          )}

          {/* Generate Plan button — active phase only, before a draft exists */}
          {isActivePhase && !currentDraft && !applied && (
            <Button
              variant="contained"
              color="primary"
              size="large"
              onClick={handleGeneratePlan}
              disabled={aiLoading}
              startIcon={aiLoading ? <CircularProgress size={20} color="inherit" /> : <AutoAwesomeIcon />}
              fullWidth
              sx={{ py: 1.5, fontWeight: 'bold', fontSize: '1rem' }}
            >
              {aiLoading ? 'Generating Plan...' : 'Generate Plan'}
            </Button>
          )}

          {/* Review phase actions */}
          {isReviewPhase && (
            <Typography variant="body2" color="text.secondary">
              Quick adjustments before applying:
            </Typography>
          )}
          <QuickSuggestionButtons
            onSelect={handleQuickSuggestion}
            visible={isReviewPhase}
          />

          {/* Apply plan button */}
          {isReviewPhase && (
            <Button
              variant="contained"
              color="success"
              size="large"
              onClick={handleApplyPlan}
              fullWidth
            >
              Lock In This Plan
            </Button>
          )}

          {applied && (
            <>
              <Alert severity="success" sx={{ display: 'flex', alignItems: 'center' }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" fontWeight={600}>Plan applied.</Typography>
                  <Typography variant="body2">Use the chat box below for in-week changes, or head to Today to start your week.</Typography>
                </Box>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => navigate('/today')}
                  sx={{ ml: 2, whiteSpace: 'nowrap' }}
                >
                  Go to Today →
                </Button>
              </Alert>

              {currentDraft && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle1" gutterBottom>Print Materials</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Generate printable worksheets for each day's activities.
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {currentDraft.days.map((day) => (
                      <Button
                        key={day.day}
                        variant="outlined"
                        size="small"
                        onClick={() => handleGenerateMaterials(day)}
                        disabled={generatingMaterials === day.day}
                        startIcon={generatingMaterials === day.day ? <CircularProgress size={16} /> : <PrintIcon />}
                      >
                        {generatingMaterials === day.day ? 'Generating...' : `Print ${day.day}`}
                      </Button>
                    ))}
                    <Button
                      variant="contained"
                      size="small"
                      onClick={handleGenerateAllMaterials}
                      disabled={!!generatingMaterials}
                      startIcon={<PrintIcon />}
                    >
                      Print All Week
                    </Button>
                  </Stack>
                </Box>
              )}

              <Button
                variant="contained"
                color="primary"
                onClick={() => setConfirmNewPlan(true)}
                fullWidth
              >
                Redo Plan
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
        appBlocks={appBlocks}
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
