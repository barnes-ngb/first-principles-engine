import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import SendIcon from '@mui/icons-material/Send'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import StopCircleIcon from '@mui/icons-material/StopCircle'

import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useTTS } from '../../core/hooks/useTTS'
import VoiceInput from '../../components/VoiceInput'
import { useProfile } from '../../core/profile/useProfile'
import { UserProfile } from '../../core/types/enums'
import type { ChatTurn } from '../../core/types'
import { useBookGenerateChat } from './useBookGenerateChat'
import StoryLengthSelector from './StoryLengthSelector'
import { DEFAULT_TARGET_PAGE_COUNT } from './storyPageTargets'

interface Props {
  /** Called after commitAndClose; parent dialog should close itself and navigate. */
  onCommit: (bookId: string) => void
  /** Called after abandonDraft (only available before any AI turn). */
  onAbandon: () => void
  /** When provided, the chat resumes an in-progress draft. */
  resumeBookId?: string
}

// ── Illustration style icons (emoji prefix + text; image assets TODO) ─

const STYLE_OPTIONS: Array<{ value: string; label: string; emoji: string }> = [
  { value: 'minecraft', label: 'Minecraft', emoji: '🟦' },
  { value: 'garden-warfare', label: 'Garden Battle', emoji: '🌸' },
  { value: 'storybook', label: 'Storybook', emoji: '📖' },
  { value: 'platformer', label: 'Platformer World', emoji: '🎮' },
  { value: 'comic', label: 'Comic Book', emoji: '💥' },
  { value: 'realistic', label: 'Realistic', emoji: '📷' },
]

// ── Age helper ────────────────────────────────────────────────────

function ageFromBirthdate(birthdate: string | undefined, fallback: number): number {
  if (!birthdate) return fallback
  try {
    const birth = new Date(birthdate)
    const now = new Date()
    let age = now.getFullYear() - birth.getFullYear()
    const m = now.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
    return age > 0 ? age : fallback
  } catch {
    return fallback
  }
}

// ── Component ─────────────────────────────────────────────────────

export default function BookGenerateChat({ onCommit, onAbandon, resumeBookId }: Props) {
  const familyId = useFamilyId()
  const { activeChild } = useActiveChild()
  const { profile } = useProfile()
  const isParent = profile === UserProfile.Parents
  const childName = activeChild?.name ?? 'kid'
  const childId = activeChild?.id ?? ''
  const isLincoln = childName.toLowerCase() === 'lincoln'
  const childAge = ageFromBirthdate(activeChild?.birthdate, isLincoln ? 10 : 6)
  const defaultStyle = isLincoln ? 'minecraft' : 'storybook'

  const attribution = isParent && childId
    ? { createdBy: 'parent' as const, createdFor: childId }
    : childId
      ? { createdBy: childId, createdFor: childId }
      : undefined

  const chat = useBookGenerateChat({
    familyId,
    childId,
    childName,
    childAge,
    // Fresh drafts start at the priced product size (FEAT-95); the hook owns the
    // live value from here and hydrates it when resuming a saved draft.
    initialPageCount: DEFAULT_TARGET_PAGE_COUNT,
    defaultIllustrationStyle: defaultStyle,
    attribution,
    resumeBookId,
  })

  const {
    chatHistory,
    currentStory,
    illustrationStyle,
    isLoading,
    error,
    clarificationPhase,
    pendingRefinement,
    canStartStory,
    pageCount,
    setPageCount,
    illustrationProgress,
    sendKidMessage,
    setIllustrationStyle,
    commitAndClose,
    abandonDraft,
    confirmStartStory,
    confirmAddRefinement,
    confirmChangeRefinement,
  } = chat

  const isIllustrating = illustrationProgress.phase === 'illustrating'

  // ── Composer state ────────────────────────────────────────────

  const [composerText, setComposerText] = useState('')
  const tts = useTTS()

  const composerDisabled =
    isLoading ||
    isIllustrating ||
    (clarificationPhase === 'clarifying' && pendingRefinement !== null)

  const handleSend = useCallback(async () => {
    const text = composerText.trim()
    if (!text || composerDisabled) return
    setComposerText('')
    await sendKidMessage(text)
  }, [composerText, composerDisabled, sendKidMessage])

  const handleVoiceTranscript = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || composerDisabled) return
      await sendKidMessage(trimmed)
    },
    [composerDisabled, sendKidMessage],
  )

  const voiceProfile = useMemo(
    () => ({
      id: childId,
      voiceInputEnhanced: activeChild?.voiceInputEnhanced === true,
    }),
    [childId, activeChild?.voiceInputEnhanced],
  )

  // ── TTS: auto-play templated turns + first story draft ────────

  const lastReadKeyRef = useRef<string>('')
  useEffect(() => {
    if (chatHistory.length === 0) return
    let lastAi: ChatTurn | undefined
    let lastAiIndex = -1
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      if (chatHistory[i].role === 'ai') {
        lastAi = chatHistory[i]
        lastAiIndex = i
        break
      }
    }
    if (!lastAi) return
    const key = `${lastAi.ts}:${lastAiIndex}`
    if (key === lastReadKeyRef.current) return

    if (lastAi.kind === 'echo' || lastAi.kind === 'add-or-change') {
      lastReadKeyRef.current = key
      tts.cancel()
      tts.speak(lastAi.content)
      return
    }

    if (lastAi.kind === 'story-draft' && currentStory) {
      lastReadKeyRef.current = key
      const isFirstStoryDraft =
        chatHistory.filter((t) => t.role === 'ai' && t.kind === 'story-draft')
          .length === 1
      if (isFirstStoryDraft) {
        const queue = [
          lastAi.content,
          ...currentStory.pages.map((p) => `Page ${p.pageNumber}: ${p.text}`),
        ]
        tts.speakQueue(queue)
      }
    }
  }, [chatHistory, currentStory, tts])

  const handleReadPageAloud = useCallback(
    (pageNumber: number, text: string) => {
      tts.cancel()
      tts.speak(`Page ${pageNumber}. ${text}`)
    },
    [tts],
  )

  // ── Scroll thread to bottom on update ─────────────────────────

  const threadRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [chatHistory, isLoading])

  // ── Commit / abandon ──────────────────────────────────────────

  const handleCommit = useCallback(async () => {
    tts.cancel()
    const id = await commitAndClose()
    if (id) onCommit(id)
  }, [commitAndClose, onCommit, tts])

  const handleAbandon = useCallback(async () => {
    tts.cancel()
    await abandonDraft()
    onAbandon()
  }, [abandonDraft, onAbandon, tts])

  // Abandon allowed any time before an AI story-draft turn exists.
  const canAbandon = currentStory === null
  const canCommit = currentStory !== null && !isLoading && !isIllustrating

  const lastAiKind = useMemo(() => {
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      if (chatHistory[i].role === 'ai') return chatHistory[i].kind
    }
    return undefined
  }, [chatHistory])

  const showYesStartButton =
    clarificationPhase === 'clarifying' &&
    pendingRefinement === null &&
    canStartStory &&
    lastAiKind === 'echo'

  const showAddOrChangeButtons =
    clarificationPhase === 'clarifying' &&
    pendingRefinement !== null &&
    lastAiKind === 'add-or-change'

  // ── Render ────────────────────────────────────────────────────

  const placeholder = useMemo(
    () =>
      isLincoln
        ? 'A Minecraft adventure with a cat and a dragon…'
        : 'A princess who finds a magic garden with talking animals…',
    [isLincoln],
  )

  return (
    <Stack spacing={2} sx={{ pt: 1 }}>
      {/* Chat thread */}
      <Box
        ref={threadRef}
        sx={{
          maxHeight: { xs: 280, sm: 360 },
          overflowY: 'auto',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          p: 1.5,
          bgcolor: 'background.default',
          minHeight: 120,
        }}
      >
        {chatHistory.length === 0 && !isLoading && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            {isLincoln
              ? 'Tell me what your story is about! Type or tap the mic.'
              : "Let's make a story! What's it about?"}
          </Typography>
        )}
        <Stack spacing={1.5}>
          {chatHistory.map((turn, idx) => {
            const isLastAi =
              turn.role === 'ai' && idx === chatHistory.length - 1
            const showYesHere =
              isLastAi && turn.kind === 'echo' && showYesStartButton
            const showAddChangeHere =
              isLastAi && turn.kind === 'add-or-change' && showAddOrChangeButtons
            return (
              <Box
                key={`${turn.ts}-${idx}`}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: turn.role === 'kid' ? 'flex-end' : 'flex-start',
                }}
              >
                <Box
                  sx={{
                    maxWidth: '85%',
                    px: 1.5,
                    py: 1,
                    borderRadius: 2,
                    bgcolor: turn.role === 'kid' ? 'primary.50' : 'grey.100',
                    border: '1px solid',
                    borderColor: turn.role === 'kid' ? 'primary.200' : 'divider',
                  }}
                >
                  <Typography variant="body2">{turn.content}</Typography>
                </Box>
                {showYesHere && (
                  <Button
                    variant="contained"
                    color="primary"
                    size="large"
                    fullWidth
                    onClick={() => void confirmStartStory()}
                    sx={{
                      mt: 1,
                      minHeight: 56,
                      textTransform: 'none',
                      fontWeight: 700,
                    }}
                  >
                    ✓ Yes, start my story!
                  </Button>
                )}
                {showAddChangeHere && (
                  <Stack direction="row" spacing={1} sx={{ mt: 1, width: '100%' }}>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={() => void confirmAddRefinement()}
                      sx={{ flex: 1, textTransform: 'none', fontWeight: 700 }}
                    >
                      + Add it
                    </Button>
                    <Button
                      variant="outlined"
                      color="primary"
                      onClick={() => void confirmChangeRefinement()}
                      sx={{ flex: 1, textTransform: 'none', fontWeight: 700 }}
                    >
                      ↺ Change it
                    </Button>
                  </Stack>
                )}
              </Box>
            )
          })}
          {currentStory && (
            <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                {currentStory.title}
              </Typography>
              {currentStory.pages.map((p) => (
                <Stack
                  key={p.pageNumber}
                  direction="row"
                  spacing={1}
                  alignItems="flex-start"
                  sx={{ mb: 0.75 }}
                >
                  <IconButton
                    size="small"
                    aria-label={`Read page ${p.pageNumber} aloud`}
                    onClick={() => handleReadPageAloud(p.pageNumber, p.text)}
                    sx={{ mt: 0.25 }}
                  >
                    {tts.isSpeaking ? (
                      <StopCircleIcon fontSize="small" />
                    ) : (
                      <VolumeUpIcon fontSize="small" />
                    )}
                  </IconButton>
                  <Typography variant="body2">
                    <strong>Page {p.pageNumber}:</strong> {p.text}
                  </Typography>
                </Stack>
              ))}
            </Box>
          )}
          {isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
              <Box
                sx={{
                  px: 1.5,
                  py: 1,
                  borderRadius: 2,
                  bgcolor: 'grey.100',
                  border: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <CircularProgress size={14} />
                <Typography variant="body2" color="text.secondary">
                  …
                </Typography>
              </Box>
            </Box>
          )}
        </Stack>
      </Box>

      {error && <Alert severity="warning">{error}</Alert>}

      {isIllustrating && (
        <Box
          aria-live="polite"
          role="status"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            p: 1.25,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'primary.200',
            bgcolor: 'primary.50',
          }}
        >
          <CircularProgress size={20} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Illustrating page {illustrationProgress.currentPage} of{' '}
              {illustrationProgress.totalPages}…
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Hang tight — this can take up to a minute.
            </Typography>
          </Box>
          {illustrationProgress.lastImageUrl && (
            <Box
              component="img"
              src={illustrationProgress.lastImageUrl}
              alt="Latest illustration preview"
              sx={{ width: 48, height: 48, borderRadius: 1, boxShadow: 1 }}
            />
          )}
        </Box>
      )}

      {/* Composer — typed input + VoiceInput module (replaces the prior
          ad-hoc mic + "Did I hear you right?" banner). */}
      <Stack direction="row" spacing={1} alignItems="flex-end">
        <TextField
          label="Type your message"
          placeholder={placeholder}
          value={composerText}
          onChange={(e) => setComposerText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void handleSend()
            }
          }}
          multiline
          minRows={1}
          maxRows={4}
          fullWidth
          disabled={composerDisabled}
          helperText={
            composerDisabled && !isLoading
              ? 'Tap Add or Change above to continue.'
              : undefined
          }
        />
        <IconButton
          color="primary"
          onClick={() => void handleSend()}
          disabled={!composerText.trim() || composerDisabled}
          aria-label="Send message"
          sx={{ mb: 0.5 }}
        >
          <SendIcon />
        </IconButton>
      </Stack>
      {childId && (
        <VoiceInput
          profile={voiceProfile}
          sourceSurface="generate-chat"
          mode="toggle"
          maxDurationSec={60}
          placeholder="Or tap the mic to speak"
          showConfirmation={true}
          disabled={composerDisabled}
          onTranscript={(text) => void handleVoiceTranscript(text)}
        />
      )}

      {/* Story length — choose before the story starts; locked once a draft exists */}
      {!currentStory && (
        <StoryLengthSelector
          value={pageCount}
          onChange={setPageCount}
          disabled={isLoading || isIllustrating}
        />
      )}

      {/* Illustration style strip */}
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          Illustration style
        </Typography>
        <ToggleButtonGroup
          value={illustrationStyle}
          exclusive
          onChange={(_, val) => {
            if (val) setIllustrationStyle(val)
          }}
          sx={{ flexWrap: 'wrap' }}
          size="small"
        >
          {STYLE_OPTIONS.map((opt) => (
            <ToggleButton
              key={opt.value}
              value={opt.value}
              aria-label={`Illustration style: ${opt.label}`}
              sx={{ textTransform: 'none', px: 1.5 }}
            >
              <span aria-hidden style={{ marginRight: 6 }}>{opt.emoji}</span>
              {opt.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {/* Commit + abandon */}
      <Stack spacing={1} alignItems="stretch">
        <Button
          variant="contained"
          size="large"
          disabled={!canCommit}
          onClick={() => void handleCommit()}
          sx={{ minHeight: 56, textTransform: 'none', fontWeight: 700 }}
        >
          ✓ I like the whole story!
        </Button>
        {canAbandon && (
          <Button
            variant="text"
            size="small"
            onClick={() => void handleAbandon()}
            sx={{ textTransform: 'none', color: 'text.secondary' }}
          >
            Cancel — start over
          </Button>
        )}
      </Stack>
    </Stack>
  )
}
