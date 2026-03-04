import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
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
import { addDoc, doc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'

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
} from '../../core/firebase/firestore'
import { generateFilename, uploadArtifactFile } from '../../core/firebase/upload'
import { useActiveChild } from '../../core/hooks/useActiveChild'
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
  SkillSnapshot,
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
  return labels.map((label) => ({
    id: generateItemId(),
    subjectBucket: label.subjectBucket,
    workbookName: label.subjectBucket,
    lessonName: label.lessonOrPages || 'Workbook page',
    estimatedMinutes: label.estimatedMinutes,
    difficultyCues: [],
    sourcePhotoId: label.artifactId,
    action: AssignmentAction.Keep,
  }))
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

  // Confirmation dialog state
  const [confirmNewPlan, setConfirmNewPlan] = useState(false)
  const [confirmClearPlan, setConfirmClearPlan] = useState(false)

  // Generate activity state
  const [generatingItemId, setGeneratingItemId] = useState<string | null>(null)
  const [generatedActivity, setGeneratedActivity] = useState<GeneratedActivity | null>(null)
  const [generatedPlanItem, setGeneratedPlanItem] = useState<DraftPlanItem | null>(null)
  const [lessonCardSaved, setLessonCardSaved] = useState(false)
  const [lessonCardSaving, setLessonCardSaving] = useState(false)

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

  // Add welcome message on first load when child is selected
  useEffect(() => {
    if (!activeChildId || messages.length > 0) return
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
  }, [activeChildId, snapshot, weekRange.start, activeChild?.name, messages.length])

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

  // Submit photos and generate plan (AI path with local fallback)
  const handleSubmitPhotos = useCallback(async () => {
    if (photoLabels.length === 0) return
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
      const aiMessages: AIChatMessage[] = [{ role: 'user', content: prompt }]
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
  }, [photoLabels, snapshot, hoursPerDay, appBlocks, adjustments, messages, persistConversation, isEnabled, activeChildId, familyId, aiChat])

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
      const aiMessages: AIChatMessage[] = [
        ...messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.text ?? '',
        })),
        { role: 'user' as const, content: prompt },
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
  const handleSend = useCallback(async () => {
    const text = inputText.trim()
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

      const aiMessages: AIChatMessage[] = updatedWithUser.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.text ?? '',
      }))
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

  // Apply plan to WeekPlan + DayLogs
  const handleApplyPlan = useCallback(async () => {
    if (!activeChildId || !currentDraft) return
    try {
      // Write WeekPlan update
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
          }))

        if (dayLogSnap.exists()) {
          const existing = dayLogSnap.data()
          await setDoc(dayLogRef, {
            ...existing,
            checklist: [...(existing.checklist ?? []), ...checklist],
            blocks: [...(existing.blocks ?? []), ...blocks],
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
  }, [activeChildId, familyId, weekRange.start, currentDraft, messages, persistConversation])

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

  // Map SubjectBucket to activity type for the generate Cloud Function
  const subjectToActivityType = useCallback((subject: SubjectBucket): string => {
    switch (subject) {
      case SubjectBucket.Reading: return 'reading'
      case SubjectBucket.LanguageArts: return 'phonics'
      case SubjectBucket.Math: return 'math'
      default: return 'other'
    }
  }, [])

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

  // Start New Plan handler
  const handleStartNewPlan = useCallback(async () => {
    setConfirmNewPlan(false)
    try {
      await resetConversationState()
      setSnack({ text: 'Conversation reset. Start a new plan!', severity: 'success' })
    } catch (err) {
      console.error('Failed to reset conversation', err)
      setSnack({ text: 'Failed to reset conversation.', severity: 'error' })
    }
  }, [resetConversationState])

  // Clear Applied Plan handler
  const handleClearAppliedPlan = useCallback(async () => {
    setConfirmClearPlan(false)
    if (!activeChildId || !currentDraft) return
    try {
      // Remove blocks and checklist from each day's DayLog
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
          await updateDoc(dayLogRef, { blocks: [], checklist: [] })
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

      await resetConversationState()
      setSnack({ text: 'Applied plan cleared from Week and Today.', severity: 'success' })
    } catch (err) {
      console.error('Failed to clear applied plan', err)
      setSnack({ text: 'Failed to clear applied plan.', severity: 'error' })
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
                      {msg.text}
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
            <IconButton onClick={handleSend} color="primary" disabled={!inputText.trim() || aiLoading}>
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
              <Stack direction="row" spacing={2}>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => setConfirmNewPlan(true)}
                >
                  Start New Plan
                </Button>
                <Button
                  variant="outlined"
                  color="warning"
                  onClick={() => setConfirmClearPlan(true)}
                >
                  Clear Applied Plan
                </Button>
              </Stack>

              <Dialog open={confirmNewPlan} onClose={() => setConfirmNewPlan(false)}>
                <DialogTitle>Start New Plan?</DialogTitle>
                <DialogContent>
                  <DialogContentText>
                    Start a fresh plan for this week? Your applied checklist items on the Today page will remain.
                  </DialogContentText>
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => setConfirmNewPlan(false)}>Cancel</Button>
                  <Button onClick={handleStartNewPlan} variant="contained">Start New Plan</Button>
                </DialogActions>
              </Dialog>

              <Dialog open={confirmClearPlan} onClose={() => setConfirmClearPlan(false)}>
                <DialogTitle>Clear Applied Plan?</DialogTitle>
                <DialogContent>
                  <DialogContentText>
                    Remove generated blocks and checklists from This Week and Today? This cannot be undone.
                  </DialogContentText>
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => setConfirmClearPlan(false)}>Cancel</Button>
                  <Button onClick={handleClearAppliedPlan} variant="contained" color="warning">Clear Plan</Button>
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
