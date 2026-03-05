import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import SendIcon from '@mui/icons-material/Send'
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
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { addDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore'

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
} from '../../core/types/domain'
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
import { defaultAppBlocks } from '../planner/planner.logic'
import {
  buildMinimumWinText,
  buildPlannerPrompt,
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
import PhotoLabelForm from './PhotoLabelForm'
import QuickSuggestionButtons from './QuickSuggestionButtons'


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
  const [snack, setSnack] = useState<{ text: string; severity: 'success' | 'error' | 'info' } | null>(null)

  // Week plan state (theme/virtue/scripture/heartQuestion)
  const [weekPlan, setWeekPlan] = useState<WeekPlan | null>(null)

  // Confirmation dialog state
  const [confirmNewPlan, setConfirmNewPlan] = useState(false)

  // Generate activity state
  const [generatingItemId, setGeneratingItemId] = useState<string | null>(null)
  const [generatedActivity, setGeneratedActivity] = useState<GeneratedActivity | null>(null)
  const [generatedPlanItem, setGeneratedPlanItem] = useState<DraftPlanItem | null>(null)
  const [lessonCardSaved, setLessonCardSaved] = useState(false)
  const [lessonCardSaving, setLessonCardSaving] = useState(false)

  // Workbook configs for active child (for photo label matching)
  const [workbookConfigs, setWorkbookConfigs] = useState<WorkbookConfig[]>([])

  // Setup wizard state
  const [conversationLoaded, setConversationLoaded] = useState(false)
  const [setupComplete, setSetupComplete] = useState(false)
  const [weekEnergy, setWeekEnergy] = useState<'full' | 'lighter' | 'mvd'>('full')
  const [readAloud, setReadAloud] = useState('')
  const [weekNotes, setWeekNotes] = useState('')
  const [selectedWorkbookIds, setSelectedWorkbookIds] = useState<Set<string>>(new Set())

  const conversationDocId = useMemo(
    () => (activeChildId ? plannerConversationDocId(weekRange.start, activeChildId) : ''),
    [weekRange.start, activeChildId],
  )

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
    const minimumWin = buildMinimumWinText(snapshot)
    const welcomeParts = [
      `Planning week of ${weekRange.start} for ${activeChild?.name ?? 'your child'}.`,
    ]
    if (snapshot && snapshot.prioritySkills.length > 0) {
      welcomeParts.push(
        `\nSkill focus: ${snapshot.prioritySkills.map((s) => `${s.label} (${s.level})`).join(', ')}.`,
      )
    }
    welcomeParts.push(`\nMinimum Win: ${minimumWin}`)
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

  // Photo upload handler
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

  // Extract photo content using AI (MVP: uses label + workbook config, not image analysis)
  const extractPhotoContent = useCallback(async (
    userLabel: string,
    subject: SubjectBucket,
  ): Promise<PhotoContentExtraction | null> => {
    if (!activeChildId) return null

    // Find matching workbook config for richer context
    const matchingConfig = workbookConfigs.find((c) => c.subjectBucket === subject)
    const configContext = matchingConfig
      ? `\nKnown workbook: "${matchingConfig.name}" (${matchingConfig.subjectBucket}), currently at ${matchingConfig.unitLabel} ${matchingConfig.currentPosition} of ${matchingConfig.totalUnits}, target finish: ${matchingConfig.targetFinishDate}.`
      : ''

    try {
      const response = await aiChat({
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
    if (isEnabled(AIFeatureFlag.AiPlanning) && activeChildId) {
      const enriched = await Promise.all(
        photoLabels.map(async (label) => {
          if (label.extractedContent || !label.lessonOrPages.trim()) return label
          const extracted = await extractPhotoContent(label.lessonOrPages, label.subjectBucket)
          if (extracted) return { ...label, extractedContent: extracted }
          return label
        }),
      )
      setPhotoLabels(enriched)
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

    const inputs = { snapshot, hoursPerDay, appBlocks, assignments, adjustments }
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

      const aiDraft = response ? parseAIResponse(response) : null
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
  }, [photoLabels, snapshot, hoursPerDay, appBlocks, adjustments, messages, persistConversation, isEnabled, activeChildId, familyId, aiChat, extractPhotoContent])

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

    const inputs = { snapshot, hoursPerDay, appBlocks, assignments, adjustments }
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
      const response = await aiChat({
        familyId,
        childId: activeChildId,
        taskType: TaskType.Plan,
        messages: aiMessages,
      })

      const aiDraft = response ? parseAIResponse(response) : null
      if (aiDraft) {
        draft = aiDraft
        usedAI = true
      } else {
        draft = generateDraftPlanFromInputs(inputs)
        setSnack({ text: 'AI planning unavailable — used local planner.', severity: 'info' })
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
  }, [photoLabels, snapshot, hoursPerDay, appBlocks, adjustments, messages, persistConversation, isEnabled, activeChildId, familyId, aiChat])

  // Handle text message send (AI path for free-form with local fallback)
  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? inputText).trim()
    if (!text) return

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
          `Apply the adjustment and return the COMPLETE updated plan as valid JSON with this schema:`,
          `{ "days": [{ "day": "Monday", "timeBudgetMinutes": 150, "items": [{ "title": "string", "subjectBucket": "Reading|Math|LanguageArts|Science|SocialStudies|Other", "estimatedMinutes": 15, "skillTags": [], "isAppBlock": false, "accepted": true }] }], "skipSuggestions": [], "minimumWin": "string" }`,
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
      } else {
        // Non-plan text response or failure — show as conversational reply
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
  }, [inputText, currentDraft, adjustments, photoLabels, snapshot, hoursPerDay, appBlocks, messages, persistConversation, isEnabled, activeChildId, aiChat, familyId, applied])

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

  // Setup wizard completion handler
  const handleSetupComplete = useCallback(() => {
    const energyLabel =
      weekEnergy === 'full'
        ? 'normal energy'
        : weekEnergy === 'lighter'
          ? 'lighter week, reduce load'
          : 'MVD week, minimum items only'

    const selectedConfigs = workbookConfigs.filter((wb) => selectedWorkbookIds.has(wb.id ?? ''))
    const workbookLines = selectedConfigs
      .map((wb) => `- ${wb.name}: ${wb.unitLabel} ${wb.currentPosition + 1} (${wb.subjectBucket})`)
      .join('\n')

    const contextMessage = `Plan ${activeChild?.name ?? 'my child'}'s week.

Energy: ${energyLabel}
Hours/day: ${hoursPerDay}

Workbooks:
${workbookLines || '(none configured)'}
${readAloud ? `Read-aloud: ${readAloud}` : ''}
${weekNotes ? `Notes: ${weekNotes}` : ''}

Generate a plan for Monday through Friday.`.trim()

    setSetupComplete(true)
    setInputText(contextMessage)
    setTimeout(() => {
      void handleSend(contextMessage)
    }, 100)
  }, [weekEnergy, hoursPerDay, workbookConfigs, selectedWorkbookIds, readAloud, weekNotes, activeChild, handleSend])

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
            updatedAt: new Date().toISOString(),
          })
        } else {
          const newDayLog: DayLog = {
            childId: activeChildId,
            date: dateKey,
            blocks,
            checklist,
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

  const minimumWin = buildMinimumWinText(snapshot)

  // Quick suggestion handler - sends the text as if the user typed it
  const handleQuickSuggestion = useCallback((text: string) => {
    setInputText(text)
    // Trigger send immediately
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
  }, [currentDraft, adjustments, photoLabels, snapshot, hoursPerDay, appBlocks, messages, persistConversation, applied])

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

  return (
    <Page>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="h4" component="h1">Planner Chat</Typography>
          <Typography color="text.secondary" variant="body2">
            Upload photos, chat to adjust, apply your week plan.
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

          {/* Week theme / virtue / scripture */}
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
              <Typography variant="subtitle2" gutterBottom>
                Week Focus
              </Typography>
              <Stack spacing={1.5}>
                <TextField
                  label="Theme"
                  size="small"
                  value={weekPlan.theme}
                  onChange={(e) => updateWeekField('theme', e.target.value)}
                />
                <TextField
                  label="Virtue"
                  size="small"
                  value={weekPlan.virtue}
                  onChange={(e) => updateWeekField('virtue', e.target.value)}
                />
                <TextField
                  label="Scripture reference"
                  size="small"
                  value={weekPlan.scriptureRef}
                  onChange={(e) => updateWeekField('scriptureRef', e.target.value)}
                />
                <TextField
                  label="Heart question"
                  size="small"
                  multiline
                  minRows={2}
                  value={weekPlan.heartQuestion}
                  onChange={(e) => updateWeekField('heartQuestion', e.target.value)}
                />
              </Stack>
            </Box>
          )}

          {/* Setup wizard — shown when no conversation exists for this week */}
          {messages.length === 0 && !setupComplete && !conversationLoaded && (
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

              {/* Step 2: Workbooks (pre-filled from workbookConfigs) */}
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  This week&apos;s workbooks
                </Typography>
                {workbookConfigs.length > 0 ? (
                  workbookConfigs.map((wb) => (
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
                  ))
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No workbooks configured yet. You can still generate a plan.
                  </Typography>
                )}
                <TextField
                  size="small"
                  placeholder="Read-aloud book + chapter (e.g., Charlotte's Web Ch 5)"
                  value={readAloud}
                  onChange={(e) => setReadAloud(e.target.value)}
                  fullWidth
                  sx={{ mt: 1 }}
                />
              </Box>

              {/* Step 3: Special notes */}
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

              {/* Generate button */}
              <Button
                variant="contained"
                size="large"
                onClick={handleSetupComplete}
                fullWidth
                startIcon={<AutoAwesomeIcon />}
              >
                Generate Plan
              </Button>

              {/* Repeat last week shortcut */}
              <Button variant="outlined" size="small" onClick={handleRepeatLastWeek}>
                Or repeat last week&apos;s plan
              </Button>
            </Stack>
          )}

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

          {/* Chat messages */}
          <Box
            sx={{
              flex: 1,
              overflowY: 'auto',
              maxHeight: { xs: '50vh', md: '60vh' },
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              p: 2,
              bgcolor: 'grey.50',
            }}
          >
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
                  {msg.draftPlan && (
                    <Box sx={{ mt: 1 }}>
                      <PlanPreviewCard
                        plan={msg.draftPlan}
                        hoursPerDay={hoursPerDay}
                        onToggleItem={msg === messages[messages.length - 1] ? handleToggleItem : undefined}
                        onGenerateActivity={msg === messages[messages.length - 1] && !applied ? handleGenerateActivity : undefined}
                        generatingItemId={generatingItemId ?? undefined}
                      />
                    </Box>
                  )}
                </Box>
              ))}
              <div ref={chatEndRef} />
            </Stack>
          </Box>

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

          {/* Input area */}
          <Stack direction="row" spacing={1} alignItems="flex-end">
            <Button
              variant="outlined"
              size="small"
              onClick={() => setShowPhotos(!showPhotos)}
              sx={{ whiteSpace: 'nowrap' }}
            >
              {showPhotos ? 'Hide Photos' : 'Add Photos'}
            </Button>
            <TextField
              fullWidth
              size="small"
              placeholder={
                currentDraft
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

          {/* Generate Plan button — visible after chat exchange or photo labels, before a draft exists */}
          {!currentDraft && !applied && (messages.length >= 2 || photoLabels.length > 0) && (
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

          {/* Quick suggestion buttons */}
          <QuickSuggestionButtons
            onSelect={handleQuickSuggestion}
            visible={currentDraft !== null && !applied}
          />

          {/* Suggestion chips for quick adjustments */}
          {currentDraft && !applied && (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
              <Chip label="Make Wednesday lighter" onClick={() => setInputText('Make Wednesday lighter')} clickable size="small" />
              <Chip label="Add more reading time" onClick={() => setInputText('Add more reading time')} clickable size="small" />
              <Chip label="Swap Thursday and Friday" onClick={() => setInputText('Swap Thursday and Friday')} clickable size="small" />
              <Chip label="Remove speech this week" onClick={() => setInputText('Remove speech this week')} clickable size="small" />
            </Stack>
          )}

          {/* Apply plan button */}
          {currentDraft && !applied && (
            <Button
              variant="contained"
              color="success"
              size="large"
              onClick={handleApplyPlan}
              fullWidth
            >
              Apply Plan to Week + Today
            </Button>
          )}

          {applied && (
            <>
              <Alert severity="success">
                Plan applied. Check This Week and Today pages for your generated
                checklists and day blocks.
              </Alert>
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
        minimumWin={minimumWin}
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
