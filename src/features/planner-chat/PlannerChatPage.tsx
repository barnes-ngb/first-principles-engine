import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import SendIcon from '@mui/icons-material/Send'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { addDoc, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'

import ChildSelector from '../../components/ChildSelector'
import Page from '../../components/Page'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  artifactsCollection,
  daysCollection,
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
  DraftWeeklyPlan,
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
  generateDraftPlanFromInputs,
  generateItemId,
  WEEK_DAYS,
} from './chatPlanner.logic'
import type { AdjustmentIntent } from './chatPlanner.logic'
import { describeAdjustment, parseAdjustmentIntent } from './intentParser'
import { formatCoverageSummaryText, buildCoverageSummary } from './coverageSummary'
import ContextDrawer from './ContextDrawer'
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
  const [snack, setSnack] = useState<{ text: string; severity: 'success' | 'error' } | null>(null)

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

  // Submit photos and generate plan
  const handleSubmitPhotos = useCallback(() => {
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

    // Generate draft
    const draft = generateDraftPlanFromInputs({
      snapshot,
      hoursPerDay,
      appBlocks,
      assignments,
      adjustments,
    })
    setCurrentDraft(draft)

    // Assistant response with draft
    const assistantMsg: ChatMessage = {
      id: generateItemId(),
      role: ChatMessageRole.Assistant,
      text: `Here's your draft plan based on ${photoLabels.length} workbook page${photoLabels.length > 1 ? 's' : ''}. ${draft.skipSuggestions.length > 0 ? `I have ${draft.skipSuggestions.length} suggestion${draft.skipSuggestions.length > 1 ? 's' : ''} based on the skill snapshot.` : ''} You can adjust by saying things like "make Wed light" or "move math to Tue/Thu".`,
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
  }, [photoLabels, snapshot, hoursPerDay, appBlocks, adjustments, messages, persistConversation])

  // Handle text message send
  const handleSend = useCallback(() => {
    const text = inputText.trim()
    if (!text) return

    const userMsg: ChatMessage = {
      id: generateItemId(),
      role: ChatMessageRole.User,
      text,
      createdAt: new Date().toISOString(),
    }

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
      // Unrecognized intent with existing plan
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
    })
  }, [inputText, currentDraft, adjustments, photoLabels, snapshot, hoursPerDay, appBlocks, messages, persistConversation])

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
        targetDate.setDate(startDate.getDate() + dayIndex + 1)
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
    })
  }, [currentDraft, adjustments, photoLabels, snapshot, hoursPerDay, appBlocks, messages, persistConversation])

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
            <IconButton onClick={handleSend} color="primary" disabled={!inputText.trim()}>
              <SendIcon />
            </IconButton>
          </Stack>

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
            <Alert severity="success">
              Plan applied. Check This Week and Today pages for your generated
              checklists and day blocks.
            </Alert>
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
    </Page>
  )
}
