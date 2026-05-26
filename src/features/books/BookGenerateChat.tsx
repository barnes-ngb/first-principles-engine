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
import MicIcon from '@mui/icons-material/Mic'
import StopIcon from '@mui/icons-material/Stop'
import SendIcon from '@mui/icons-material/Send'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import StopCircleIcon from '@mui/icons-material/StopCircle'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'

import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useSpeechRecognition } from '../../core/hooks/useSpeechRecognition'
import { useTTS } from '../../core/hooks/useTTS'
import { useProfile } from '../../core/profile/useProfile'
import { UserProfile } from '../../core/types/enums'
import { useBookGenerateChat } from './useBookGenerateChat'

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
  const pageCount = isLincoln ? 10 : 6
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
    pageCount,
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
    sendKidMessage,
    setIllustrationStyle,
    commitAndClose,
    abandonDraft,
  } = chat

  // ── Composer state ────────────────────────────────────────────

  const [composerText, setComposerText] = useState('')
  const [pendingTranscript, setPendingTranscript] = useState<string | null>(null)
  const stt = useSpeechRecognition()
  const tts = useTTS()

  // Mirror STT's terminal transcript into the composer + confirmation
  // banner. STT is an external subscription whose lifecycle we don't own,
  // so syncing its terminal output here is a valid one-shot effect.
  // ("Did I hear you right?" confirmation — critical for Lincoln per
  // design doc §5.A.4 / §5.B.4.)
  const lastConsumedTranscriptRef = useRef<string>('')
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (stt.isListening) return
    const t = stt.transcript
    if (!t || t === lastConsumedTranscriptRef.current) return
    lastConsumedTranscriptRef.current = t
    setPendingTranscript(t)
    setComposerText(t)
    stt.reset()
  }, [stt.isListening, stt.transcript, stt])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleMicToggle = useCallback(() => {
    if (stt.isListening) {
      stt.stop()
    } else {
      setPendingTranscript(null)
      stt.reset()
      stt.start()
    }
  }, [stt])

  const handleSend = useCallback(async () => {
    const text = composerText.trim()
    if (!text || isLoading) return
    setComposerText('')
    setPendingTranscript(null)
    await sendKidMessage(text)
  }, [composerText, isLoading, sendKidMessage])

  // ── TTS: read first AI story-draft message once it lands ──────

  const lastReadIndexRef = useRef<number>(-1)
  useEffect(() => {
    if (chatHistory.length === 0) return
    // Find the most recent AI message index.
    let lastAiIndex = -1
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      if (chatHistory[i].role === 'ai') {
        lastAiIndex = i
        break
      }
    }
    if (lastAiIndex < 0) return
    // Only auto-play the first AI draft (index where we transitioned from no
    // story to having one). Subsequent AI messages need an explicit tap.
    if (lastAiIndex !== lastReadIndexRef.current && currentStory) {
      lastReadIndexRef.current = lastAiIndex
      const isFirstAiMessage =
        chatHistory.filter((t) => t.role === 'ai').length === 1
      if (isFirstAiMessage) {
        const queue = [
          chatHistory[lastAiIndex].content,
          ...currentStory.pages.map(
            (p) => `Page ${p.pageNumber}: ${p.text}`,
          ),
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

  const canAbandon = chatHistory.length === 0
  const canCommit = currentStory !== null && !isLoading

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
          {chatHistory.map((turn, idx) => (
            <Box
              key={`${turn.ts}-${idx}`}
              sx={{
                display: 'flex',
                justifyContent: turn.role === 'kid' ? 'flex-end' : 'flex-start',
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
            </Box>
          ))}
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

      {/* Voice transcript confirmation banner (critical for Lincoln) */}
      {pendingTranscript && (
        <Alert
          severity="info"
          icon={<CheckCircleIcon fontSize="small" />}
          sx={{ alignItems: 'center' }}
        >
          Did I hear you right? You can edit before sending.
        </Alert>
      )}

      {/* Composer */}
      <Stack direction="row" spacing={1} alignItems="flex-end">
        <TextField
          label={pendingTranscript ? 'Edit, then tap Send' : 'Type or tap mic'}
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
          disabled={isLoading}
        />
        {stt.isSupported && (
          <IconButton
            color={stt.isListening ? 'error' : 'default'}
            onClick={handleMicToggle}
            disabled={isLoading}
            aria-label={stt.isListening ? 'Stop recording' : 'Start recording'}
            sx={{ mb: 0.5 }}
          >
            {stt.isListening ? <StopIcon /> : <MicIcon />}
          </IconButton>
        )}
        <IconButton
          color="primary"
          onClick={() => void handleSend()}
          disabled={!composerText.trim() || isLoading}
          aria-label="Send message"
          sx={{ mb: 0.5 }}
        >
          <SendIcon />
        </IconButton>
      </Stack>

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
