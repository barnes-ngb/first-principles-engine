import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import CloseIcon from '@mui/icons-material/Close'
import HistoryIcon from '@mui/icons-material/History'
import ImageIcon from '@mui/icons-material/Image'
import SendIcon from '@mui/icons-material/Send'
import VisibilityIcon from '@mui/icons-material/Visibility'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Alert from '@mui/material/Alert'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import { useAI } from '../../core/ai/useAI'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useChildSkillSnapshot } from '../../core/hooks/useChildSkillSnapshot'
import {
  activityConfigsToRoutineText,
  parseRoutineTotalMinutes,
} from '../planner-chat/chatPlanner.logic'
import { useProfile } from '../../core/profile/useProfile'
import type { ChatContext } from '../../core/types'
import { UserProfile } from '../../core/types/enums'
import ActionConfirmCard from './ActionConfirmCard'
import NextWeekDraftCard from './NextWeekDraftCard'
import { useChatActivityConfigs } from './useChatActivityConfigs'
import { useChatConceptArcs } from './useChatConceptArcs'
import { useChatPlannerDefaults } from './useChatPlannerDefaults'
import { useNextWeekDraft } from './useNextWeekDraft'
import { useChatWatchLibrary } from './useChatWatchLibrary'
import { plannableWatchDayKeys, useChatWeekDays } from './useChatWeekDays'
import ChatMessageBubble from './ChatMessageBubble'
import ChatThreadDrawer from './ChatThreadDrawer'
import { formatRelativeTime } from './formatRelativeTime'
import { useShellyChatActions } from './useShellyChatActions'
import { useShellyChatState } from './useShellyChatState'
import { useShellyChatFlows } from './useShellyChatFlows'

// UX-39: the assistant had three names, and one of them was the user's — the nav
// says "Ask AI", the input said "Ask Shelly's AI", and the General tab greeted the
// PARENT as "Hi Shelly", which is wrong for Dad on the shared profile and blurs
// who "Shelly" is. The greetings now say what the tab is for. The kid-dashboard
// register ("Learning Space 🎮" / "Creative Corner 🎨") also goes: this is a
// parent-only surface.
// UX-37: the General subtitle used to offer scheduling and curriculum changes,
// and every action proposed from this tab is dropped with a notice to go ask on a
// child tab. It now says that up front instead of inviting the refusal.
const SUGGESTIONS_BY_CONTEXT: Record<ChatContext, { greeting: string; subtitle: string; suggestions: ReadonlyArray<{ label: string; message: string }> }> = {
  lincoln: {
    greeting: 'Ask about Lincoln',
    subtitle: "Ask about Lincoln's reading progress, activity ideas, skill recommendations, or anything related to his learning.",
    suggestions: [
      { label: 'Reading progress check', message: "How is Lincoln doing with reading? What should we focus on this week based on his evaluations?" },
      { label: 'Sight word activities', message: 'What are some fun, hands-on ways to practice sight words with Lincoln?' },
      { label: 'What to work on next', message: "Based on Lincoln's skill snapshot and recent evaluations, what should be our priority this week?" },
    ],
  },
  london: {
    greeting: 'Ask about London',
    subtitle: "Ask about London's progress, story ideas, creative activities, or anything related to his learning.",
    suggestions: [
      { label: 'Story activity ideas', message: 'What are some creative story or drawing activities for London this week?' },
      { label: 'Learning through art', message: "How can I tie London's love of drawing into our academic goals?" },
      { label: 'Quick independent activity', message: 'I need a quick 10-minute activity for London while I work with Lincoln.' },
    ],
  },
  general: {
    greeting: 'Ask me anything',
    subtitle: "Teaching ideas, curriculum questions, or just vent about your day. To change a plan or a record, switch to Lincoln's or London's tab.",
    suggestions: [
      { label: 'Weekly planning help', message: "Help me think through this week's plan. What should I prioritize?" },
      { label: 'Low energy day ideas', message: "I'm having a low energy day. What's the most important thing to cover with the boys?" },
      { label: 'Curriculum question', message: 'I have a question about our curriculum approach.' },
    ],
  },
}

export default function ShellyChatPage() {
  const familyId = useFamilyId()
  const { activeChildId, children } = useActiveChild()
  const { chat, generateImage, lastErrorRef, imageFailureRef } = useAI()

  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  // Copy/.md-download toast (FEAT-59). Local Snackbar per the repo pattern.
  const [snack, setSnack] = useState<string | null>(null)

  // ── State + refs live in useShellyChatState; effects + handlers in
  //    useShellyChatFlows (ARCH-09). The page is a thin shell that composes
  //    both and wires the returned handlers into the JSX. No behavior or write
  //    surface changes here — see useShellyChatState.ts / useShellyChatFlows.ts.
  const state = useShellyChatState(searchParams.get('thread'))
  const {
    chatContext,
    threads,
    activeThreadId,
    messages,
    input, setInput,
    followUps, setFollowUps,
    reflectionSuggestions,
    sending,
    drawerOpen, setDrawerOpen,
    generatingImage,
    uploadPreviews,
    uploadFiles,
    uploading,
    uploadDialogOpen,
    pendingAttachments, setPendingAttachments,
    pendingReferenceImage,
    imageFlowOpen,
    imageFlowStep,
    imageIdea, setImageIdea,
    imageQuestions,
    imageAnswers, setImageAnswers,
    loadingQuestions,
    fileInputRef,
    chatInputRef,
    messagesEndRef,
  } = state

  // ── Portal write layer (Build Step 3b) — propose → confirm → write.
  //    The chat context's childId is the active-child binding actions validate
  //    against; map the selected tab to its childId so a confused model can't
  //    edit the wrong child.
  const contextChildId = chatContext === 'general'
    ? ''
    : children.find((c) => c.name.toLowerCase() === chatContext)?.id ?? ''

  // FEAT-135 — the child's live activity configs, read-only. They resolve a
  // proposed `setActivityMinutes` id to a real config before its confirm card
  // is offered, and give the card a name + a true old → new diff. Parent-only,
  // stated here at the component as well as in the write layer: `/chat` is
  // nav-gated, not route-gated, so neither layer assumes the other.
  const isParent = useProfile().profile === UserProfile.Parents
  const activityConfigs = useChatActivityConfigs(
    familyId,
    isParent ? contextChildId : '',
  )
  // FEAT-142 — this week's five weekdays for the active child, read-only. They
  // resolve a proposed live-day edit (remove / move / add) against a real day
  // and a real row before its card is offered, and give the card the row's title
  // and the weekday name instead of an id. Parent-gated the same way, and at the
  // same two layers, as the configs above — passing '' costs zero reads.
  const weekDays = useChatWeekDays(familyId, isParent ? contextChildId : '')
  // FEAT-149 — the child's curated Watch Library, read-only. It refuses a
  // duplicate vet-in with a reason, resolves a proposed `planVideoOnDay` to a
  // real ACTIVE entry before its card is offered, and gives the card the video's
  // title instead of a doc id. Parent-gated the same way, and at the same two
  // layers, as the two reads above — passing '' costs zero reads.
  const watchVideos = useChatWatchLibrary(familyId, isParent ? contextChildId : '')
  // FEAT-157 — the family's active concept arcs, read-only. They resolve a
  // proposed `planLab` arc link to a real arc and a real step before its
  // confirm card is offered, and give the card the arc's title instead of a
  // doc id. Parent-gated the same way, and at the same two layers, as the
  // reads above — passing '' costs zero reads.
  const conceptArcs = useChatConceptArcs(familyId, isParent ? contextChildId : '')
  // The ten weekdays a video may be planned onto — this week's and next week's.
  // Recomputed every render (five `Date` allocations) for the same reason
  // `useChatWeekDays` recomputes its week: pinning it at mount would let a page
  // left open across a rollover render "next Tuesday" for a day that is now this
  // week's. The card is a preview of a gate the write layer re-reads anyway.
  const plannableDays = plannableWatchDayKeys()
  // FEAT-150 — everything the planner's own generator needs to draft next week,
  // read the planner's own way so a week drafted here and a week drafted in Plan
  // My Week come out the same. The routine text and the day budget are DERIVED
  // from the configs above rather than read separately, which is exactly what
  // `PlannerChatPage` does — one source for "what does a normal day look like".
  const { snapshot } = useChildSkillSnapshot(familyId, isParent ? contextChildId : undefined)
  const subjectTimeDefaults = useChatPlannerDefaults(familyId, isParent ? contextChildId : '')
  const dailyRoutine = useMemo(
    () => activityConfigsToRoutineText(activityConfigs),
    [activityConfigs],
  )
  // The planner's 'full energy' branch, which is the right default here: the
  // parent's own words ("make it lighter") shape the week through the prompt,
  // so the budget should start from the real routine rather than pre-shrink it.
  // Unweighted, exactly as the planner's own budget still is — see UX-206 in
  // `routineDailyBudgetMinutes`. This surface must not weight it alone: a draft
  // generated here goes through the planner's `buildPlannerPrompt`, which
  // derives its own unweighted routine total regardless.
  const hoursPerDay = useMemo(() => {
    const routineTotal = parseRoutineTotalMinutes(dailyRoutine)
    return routineTotal > 0 ? Math.round((routineTotal / 60) * 10) / 10 : 3
  }, [dailyRoutine])
  // The same derivation the planner uses (FEAT-72): the snapshot's priority tags
  // target `parseAIResponse`'s parse-time catalog-tag backfill, so a week drafted
  // here lands on tags the FEAT-68/69 re-test bridge can map. Empty is fine.
  const prioritySkillTags = useMemo(
    () => snapshot?.prioritySkills.map((s) => s.tag) ?? [],
    [snapshot],
  )
  const {
    nextWeek,
    generateNextWeek,
    applyNextWeek,
    dismissNextWeek,
  } = useNextWeekDraft({
    familyId,
    activeChildId: contextChildId,
    children,
    activityConfigs,
    dailyRoutine,
    hoursPerDay,
    snapshot,
    subjectTimeDefaults,
    prioritySkillTags,
    canEdit: isParent,
    chat,
  })
  const {
    pending: pendingActions,
    suppressed: suppressedActionNotices,
    stagePendingActions,
    currentContextScope,
    dropPendingForContext,
    applyChatAction,
    dismissAction,
    confirmAll,
  } = useShellyChatActions({
    familyId,
    children,
    activeChildId: contextChildId,
    activityConfigs,
    weekDays,
    watchVideos,
    conceptArcs,
    canEditActivityConfigs: isParent,
    activeThreadId,
    // A confirmed proposePlanAdjustment HANDOFF stages its brief, then navigates
    // here to Plan My Week — the chat never writes the plan itself.
    navigateToPlanner: () => navigate('/planner'),
    // FEAT-150 — tap one of two. Confirming a `draftNextWeek` card spends a plan
    // generation and renders the week here; the write is a SECOND tap on the
    // draft card below, which has no `ChatAction` kind behind it.
    onDraftNextWeek: generateNextWeek,
  })

  const {
    handleContextChange,
    handleSend,
    handleImageFlowOpen,
    handleImageFlowClose,
    handleImageIdeaSubmit,
    handleImageRefinementGenerate,
    handleJustGenerate,
    handleFileSelect,
    handleUploadCancel,
    handleUploadContext,
    handleUploadAnalyze,
    handleUploadGenerate,
    handleNewThread,
    handleSelectThread,
    handleArchiveThread,
    handleRenameThread,
    handleKeyDown,
  } = useShellyChatFlows(state, {
    familyId,
    children,
    activeChildId,
    chat,
    generateImage,
    lastErrorRef,
    imageFailureRef,
    setSearchParams,
    stagePendingActions,
    dropPendingForContext,
    currentContextScope,
  })

  const activeThread = threads.find((t) => t.id === activeThreadId)
  const showEmpty = !activeThreadId && messages.length === 0
  const isBusy = sending || generatingImage || uploading

  return (
    <Box data-page="chat" sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, flex: 1 }}>
      {/* Slim toolbar row */}
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
        <IconButton size="small" onClick={() => setDrawerOpen(true)} aria-label="All conversations">
          <HistoryIcon />
        </IconButton>

        {activeThreadId ? (
          <>
            <IconButton size="small" onClick={handleNewThread} aria-label="Back">
              <ArrowBackIcon fontSize="small" />
            </IconButton>
            <Typography variant="body2" color="text.secondary" noWrap sx={{ flex: 1, ml: 0.5 }}>
              {activeThread?.title || 'Conversation'}
            </Typography>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1, ml: 1 }}>
            {chatContext === 'lincoln' ? "Lincoln's conversations" :
             chatContext === 'london' ? "London's conversations" :
             'Conversations'}
          </Typography>
        )}

        <Button size="small" startIcon={<AddIcon />} onClick={handleNewThread}>
          New
        </Button>
      </Box>

      {/* Context tabs */}
      <Tabs
        value={chatContext}
        onChange={handleContextChange}
        variant="fullWidth"
        sx={{
          minHeight: 36,
          '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none', fontSize: '0.875rem' },
        }}
      >
        <Tab value="lincoln" label="Lincoln" />
        <Tab value="london" label="London" />
        <Tab value="general" label="General" />
      </Tabs>

      {/* Thread drawer */}
      <ChatThreadDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        threads={threads}
        activeThreadId={activeThreadId}
        chatContext={chatContext}
        onSelectThread={handleSelectThread}
        onNewThread={handleNewThread}
        onArchiveThread={handleArchiveThread}
        onRenameThread={handleRenameThread}
      />

      {/* Messages area */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 2, minHeight: 0 }}>
        {showEmpty ? (
          <Box sx={{ px: 1, py: 3 }}>
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: 2,
              }}
            >
              <Typography variant="h5">{SUGGESTIONS_BY_CONTEXT[chatContext].greeting}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 320 }}>
                {SUGGESTIONS_BY_CONTEXT[chatContext].subtitle}
              </Typography>
              <Stack spacing={1} sx={{ mt: 1, width: '100%', maxWidth: 360 }}>
                {/* Data-driven reflection suggestions */}
                {reflectionSuggestions.length > 0 && (
                  <>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                      Based on recent data:
                    </Typography>
                    {reflectionSuggestions.map((s) => (
                      <Button
                        key={s.label}
                        variant="outlined"
                        size="small"
                        color="secondary"
                        onClick={() => setInput(s.message)}
                        sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
                      >
                        {s.label}
                      </Button>
                    ))}
                  </>
                )}
                {SUGGESTIONS_BY_CONTEXT[chatContext].suggestions.map((s) => (
                  <Button
                    key={s.label}
                    variant="outlined"
                    size="small"
                    onClick={() => setInput(s.message)}
                    sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
                  >
                    {s.label}
                  </Button>
                ))}
              </Stack>
            </Box>

            {threads.length > 0 && (
              <Box sx={{ mt: 4 }}>
                <Typography variant="overline" color="text.secondary" sx={{ px: 1 }}>
                  Recent conversations
                </Typography>
                <List dense disablePadding>
                  {threads.slice(0, 5).map((thread) => (
                    <ListItemButton
                      key={thread.id}
                      onClick={() => handleSelectThread(thread.id)}
                      sx={{ borderRadius: 1, mb: 0.5 }}
                    >
                      <ListItemText
                        primary={thread.title}
                        secondary={thread.lastMessagePreview}
                        primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                        secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 1, whiteSpace: 'nowrap' }}>
                        {formatRelativeTime(thread.updatedAt)}
                      </Typography>
                    </ListItemButton>
                  ))}
                </List>
                {threads.length > 5 && (
                  <Button
                    size="small"
                    onClick={() => setDrawerOpen(true)}
                    sx={{ mt: 0.5 }}
                  >
                    View all conversations
                  </Button>
                )}
              </Box>
            )}
          </Box>
        ) : (
          <>
            {messages.map((msg) => (
              <ChatMessageBubble
                key={msg.id}
                message={msg}
                chatContext={chatContext}
                onNotify={setSnack}
              />
            ))}
            {isBusy && (
              <Box sx={{ display: 'flex', mb: 1.5 }}>
                <Box
                  sx={{
                    px: 2,
                    py: 1,
                    borderRadius: '16px 16px 16px 4px',
                    bgcolor: 'grey.100',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                  }}
                >
                  <CircularProgress size={16} />
                  <Typography variant="body2" color="text.secondary">
                    {uploading ? 'Uploading image...' : generatingImage ? 'Generating image...' : 'Thinking...'}
                  </Typography>
                </Box>
              </Box>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </Box>

      {/* Image refinement panel (Prompt 9) */}
      {imageFlowOpen && (
        <Paper
          elevation={4}
          sx={{
            borderRadius: '16px 16px 0 0',
            p: 2,
            maxHeight: '60vh',
            overflow: 'auto',
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="subtitle2">Create an Image</Typography>
            <IconButton size="small" onClick={handleImageFlowClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {pendingReferenceImage && (
            <Box sx={{ textAlign: 'center', mb: 1.5 }}>
              <Box
                component="img"
                src={pendingReferenceImage.previewUrl}
                alt="Reference"
                sx={{ maxHeight: 120, borderRadius: 2, objectFit: 'contain' }}
              />
              <Typography variant="caption" display="block" color="text.secondary">
                Using as reference
              </Typography>
            </Box>
          )}

          {imageFlowStep === 'idea' && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                What would you like me to create?
              </Typography>
              <TextField
                fullWidth
                size="small"
                placeholder="e.g., something for our reading corner"
                value={imageIdea}
                onChange={(e) => setImageIdea(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleImageIdeaSubmit()
                  }
                }}
                autoFocus
                sx={{ mb: 1 }}
              />
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                <Button
                  size="small"
                  variant="text"
                  disabled={!imageIdea.trim()}
                  onClick={handleJustGenerate}
                >
                  Just generate
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  disabled={!imageIdea.trim()}
                  onClick={handleImageIdeaSubmit}
                >
                  Next
                </Button>
              </Box>
            </Box>
          )}

          {imageFlowStep === 'questions' && loadingQuestions && (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <CircularProgress size={24} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Getting suggestions...
              </Typography>
              <Button size="small" sx={{ mt: 1 }} onClick={handleJustGenerate}>
                Just generate with what I have
              </Button>
            </Box>
          )}

          {imageFlowStep === 'questions' && !loadingQuestions && imageQuestions.length > 0 && (
            <Box>
              {imageQuestions.map((q, qIdx) => (
                <Box key={qIdx} sx={{ mb: 2 }}>
                  <Typography variant="body2" fontWeight={500} sx={{ mb: 0.5 }}>
                    {q.question}
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {q.options.map((opt) => (
                      <Chip
                        key={opt}
                        label={opt}
                        size="small"
                        variant={imageAnswers[qIdx] === opt ? 'filled' : 'outlined'}
                        color={imageAnswers[qIdx] === opt ? 'primary' : 'default'}
                        onClick={() => setImageAnswers((prev) => ({ ...prev, [qIdx]: opt }))}
                      />
                    ))}
                  </Box>
                </Box>
              ))}
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                <Button size="small" variant="text" onClick={handleJustGenerate}>
                  Just generate
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleImageRefinementGenerate}
                >
                  Generate
                </Button>
              </Box>
            </Box>
          )}

          {imageFlowStep === 'generating' && (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <CircularProgress size={24} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Creating your image...
              </Typography>
            </Box>
          )}
        </Paper>
      )}

      {/* Proposed-action confirm cards (Build Step 3b) — propose → confirm → write */}
      {!sending && (
        <ActionConfirmCard
          pending={pendingActions}
          familyChildren={children}
          activityConfigs={activityConfigs}
          weekDays={weekDays}
          watchVideos={watchVideos}
          plannableDays={plannableDays}
          conceptArcs={conceptArcs}
          suppressed={suppressedActionNotices}
          onConfirm={applyChatAction}
          onDismiss={dismissAction}
          onConfirmAll={confirmAll}
        />
      )}

      {/* The drafted week, in full, plus its own separate Apply (FEAT-150).
          UX-34: no `??` on `childName` on purpose. The old fallback was
          `'this week'` — a week noun standing in for a child — and it fed every
          sentence on the card, including the apply button for the largest write
          in the app. An unresolved child passes through as undefined and the
          card drops the possessive rather than inventing a name. */}
      <NextWeekDraftCard
        view={nextWeek}
        childName={children.find((c) => c.id === contextChildId)?.name}
        hoursPerDay={hoursPerDay}
        onApply={() => void applyNextWeek()}
        onDismiss={dismissNextWeek}
      />

      {/* Follow-up suggestions */}
      {followUps.length > 0 && !sending && (
        <Box sx={{ px: 1, pb: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {followUps.map((q, i) => (
            <Chip
              key={i}
              label={q}
              size="small"
              variant="outlined"
              onClick={() => {
                setInput(q)
                setFollowUps([])
              }}
              sx={{ fontSize: '0.75rem' }}
            />
          ))}
        </Box>
      )}

      {/* Input area */}
      <Paper elevation={2} sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
        {uploading && <LinearProgress sx={{ mb: 1 }} />}
        {pendingAttachments.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, px: 0.5, flexWrap: 'wrap' }}>
            {pendingAttachments.map((att, i) => (
              <Box key={att.url} sx={{ position: 'relative' }}>
                <Box
                  component="img"
                  src={att.previewUrl}
                  alt={`Attached ${i + 1}`}
                  sx={{ width: 40, height: 40, borderRadius: 1, objectFit: 'cover', display: 'block' }}
                />
                <IconButton
                  size="small"
                  onClick={() => {
                    URL.revokeObjectURL(att.previewUrl)
                    setPendingAttachments((prev) => prev.filter((a) => a.url !== att.url))
                  }}
                  aria-label={`Remove attachment ${i + 1}`}
                  sx={{
                    position: 'absolute', top: -6, right: -6, p: 0,
                    bgcolor: 'background.paper', boxShadow: 1,
                    '&:hover': { bgcolor: 'grey.200' },
                  }}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
            ))}
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 120 }}>
              {pendingAttachments.length === 1
                ? 'Image attached — type your question'
                : `${pendingAttachments.length} images attached — type one question`}
            </Typography>
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5 }}>
          {/* Hidden file input for image upload (no capture attr — shows camera + gallery picker) */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <IconButton
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy}
            size="small"
            aria-label="Upload image"
          >
            <AddPhotoAlternateIcon />
          </IconButton>
          <IconButton
            onClick={handleImageFlowOpen}
            disabled={isBusy}
            size="small"
            aria-label="Generate image"
          >
            <ImageIcon />
          </IconButton>
          <TextField
            fullWidth
            multiline
            maxRows={4}
            size="small"
            placeholder="Ask AI…"
            inputRef={chatInputRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); if (followUps.length) setFollowUps([]) }}
            onKeyDown={handleKeyDown}
            disabled={isBusy}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
          />
          <IconButton
            onClick={handleSend}
            disabled={!input.trim() || isBusy}
            color="primary"
            size="small"
            aria-label="Send message"
          >
            <SendIcon />
          </IconButton>
        </Box>
      </Paper>

      {/* Image upload action dialog */}
      <Dialog
        open={uploadDialogOpen}
        onClose={handleUploadCancel}
        fullWidth
        maxWidth="xs"
      >
        <DialogContent sx={{ pt: 3 }}>
          {uploadPreviews.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center', mb: 2.5 }}>
              {uploadPreviews.map((src, i) => (
                <Box
                  key={src}
                  component="img"
                  src={src}
                  alt={`Selected ${i + 1}`}
                  sx={{
                    maxHeight: uploadPreviews.length === 1 ? 180 : 96,
                    maxWidth: '100%',
                    borderRadius: 2,
                    objectFit: 'contain',
                  }}
                />
              ))}
            </Box>
          )}
          <Typography variant="subtitle2" gutterBottom>What would you like to do?</Typography>
          <Stack spacing={1.5}>
            {/* Analyze + reference-generate are single-image; only when one file chosen. */}
            {uploadFiles.length === 1 && (
              <>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<VisibilityIcon />}
                  onClick={handleUploadAnalyze}
                  sx={{ justifyContent: 'flex-start', textTransform: 'none', py: 1.5 }}
                >
                  <Box sx={{ textAlign: 'left' }}>
                    <Typography variant="body2" fontWeight="medium">Analyze this image</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Ask questions about what's in the image
                    </Typography>
                  </Box>
                </Button>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<AutoFixHighIcon />}
                  onClick={handleUploadGenerate}
                  sx={{ justifyContent: 'flex-start', textTransform: 'none', py: 1.5 }}
                >
                  <Box sx={{ textAlign: 'left' }}>
                    <Typography variant="body2" fontWeight="medium">Use as reference for image creation</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Generate a new image inspired by this one
                    </Typography>
                  </Box>
                </Button>
              </>
            )}
            <Button
              fullWidth
              variant="outlined"
              startIcon={<ChatBubbleOutlineIcon />}
              onClick={handleUploadContext}
              sx={{ justifyContent: 'flex-start', textTransform: 'none', py: 1.5 }}
            >
              <Box sx={{ textAlign: 'left' }}>
                <Typography variant="body2" fontWeight="medium">
                  {uploadFiles.length > 1 ? `Attach ${uploadFiles.length} images to my message` : 'Attach to my message'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Send with a question like "what should Lincoln work on next?"
                </Typography>
              </Box>
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleUploadCancel}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* Copy / .md-download confirmation toast (FEAT-59) */}
      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={2000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnack(null)} severity="success" variant="filled" sx={{ width: '100%' }}>
          {snack}
        </Alert>
      </Snackbar>
    </Box>
  )
}
