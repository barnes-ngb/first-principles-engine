import { useSearchParams } from 'react-router-dom'
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
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import { useAI } from '../../core/ai/useAI'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { ChatContext } from '../../core/types'
import ActionConfirmCard from './ActionConfirmCard'
import ChatMessageBubble from './ChatMessageBubble'
import ChatThreadDrawer from './ChatThreadDrawer'
import { formatRelativeTime } from './formatRelativeTime'
import { useShellyChatActions } from './useShellyChatActions'
import { useShellyChatState } from './useShellyChatState'
import { useShellyChatFlows } from './useShellyChatFlows'

const SUGGESTIONS_BY_CONTEXT: Record<ChatContext, { greeting: string; subtitle: string; suggestions: ReadonlyArray<{ label: string; message: string }> }> = {
  lincoln: {
    greeting: "Lincoln's Learning Space \u{1F3AE}",
    subtitle: "Ask about Lincoln's reading progress, activity ideas, skill recommendations, or anything related to his learning.",
    suggestions: [
      { label: 'Reading progress check', message: "How is Lincoln doing with reading? What should we focus on this week based on his evaluations?" },
      { label: 'Sight word activities', message: 'What are some fun, hands-on ways to practice sight words with Lincoln?' },
      { label: 'What to work on next', message: "Based on Lincoln's skill snapshot and recent evaluations, what should be our priority this week?" },
    ],
  },
  london: {
    greeting: "London's Creative Corner \u{1F3A8}",
    subtitle: "Ask about London's progress, story ideas, creative activities, or anything related to his learning.",
    suggestions: [
      { label: 'Story activity ideas', message: 'What are some creative story or drawing activities for London this week?' },
      { label: 'Learning through art', message: "How can I tie London's love of drawing into our academic goals?" },
      { label: 'Quick independent activity', message: 'I need a quick 10-minute activity for London while I work with Lincoln.' },
    ],
  },
  general: {
    greeting: "Hi Shelly \u{1F44B}",
    subtitle: "Ask me anything — teaching ideas, curriculum questions, scheduling, or just vent about your day.",
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
  const { chat, generateImage, lastErrorRef } = useAI()

  const [searchParams, setSearchParams] = useSearchParams()

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
    uploadPreview,
    uploading,
    uploadDialogOpen,
    pendingAttachment, setPendingAttachment,
    pendingReferenceImage,
    imageFlowOpen,
    imageFlowStep,
    imageIdea, setImageIdea,
    imageQuestions,
    imageAnswers, setImageAnswers,
    loadingQuestions,
    fileInputRef,
    messagesEndRef,
  } = state

  // ── Portal write layer (Build Step 3b) — propose → confirm → write.
  //    The chat context's childId is the active-child binding actions validate
  //    against; map the selected tab to its childId so a confused model can't
  //    edit the wrong child.
  const contextChildId = chatContext === 'general'
    ? ''
    : children.find((c) => c.name.toLowerCase() === chatContext)?.id ?? ''
  const {
    pending: pendingActions,
    stagePendingActions,
    applyChatAction,
    dismissAction,
    confirmAll,
  } = useShellyChatActions({
    familyId,
    children,
    activeChildId: contextChildId,
    activeThreadId,
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
    setSearchParams,
    stagePendingActions,
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
              <ChatMessageBubble key={msg.id} message={msg} />
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
          onConfirm={applyChatAction}
          onDismiss={dismissAction}
          onConfirmAll={confirmAll}
        />
      )}

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
        {pendingAttachment && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, px: 0.5 }}>
            <Box
              component="img"
              src={pendingAttachment.previewUrl}
              alt="Attached"
              sx={{ width: 36, height: 36, borderRadius: 1, objectFit: 'cover' }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
              Image attached — type your question
            </Typography>
            <IconButton size="small" onClick={() => {
              URL.revokeObjectURL(pendingAttachment.previewUrl)
              setPendingAttachment(null)
            }} aria-label="Remove attachment">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5 }}>
          {/* Hidden file input for image upload (no capture attr — shows camera + gallery picker) */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
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
            placeholder="Ask Shelly's AI..."
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
          {uploadPreview && (
            <Box sx={{ textAlign: 'center', mb: 2.5 }}>
              <Box
                component="img"
                src={uploadPreview}
                alt="Selected"
                sx={{ maxHeight: 180, maxWidth: '100%', borderRadius: 2, objectFit: 'contain' }}
              />
            </Box>
          )}
          <Typography variant="subtitle2" gutterBottom>What would you like to do?</Typography>
          <Stack spacing={1.5}>
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
            <Button
              fullWidth
              variant="outlined"
              startIcon={<ChatBubbleOutlineIcon />}
              onClick={handleUploadContext}
              sx={{ justifyContent: 'flex-start', textTransform: 'none', py: 1.5 }}
            >
              <Box sx={{ textAlign: 'left' }}>
                <Typography variant="body2" fontWeight="medium">Attach to my message</Typography>
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
    </Box>
  )
}
