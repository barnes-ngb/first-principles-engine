import { useCallback, useEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import MicIcon from '@mui/icons-material/Mic'
import StopIcon from '@mui/icons-material/Stop'
import SendIcon from '@mui/icons-material/Send'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'

import { useAudioRecording } from '../../core/hooks/useAudioRecording'
import { useSpeechRecognition } from '../../core/hooks/useSpeechRecognition'
import { useTTS } from '../../core/hooks/useTTS'
import {
  useTranscription,
  type TranscriptResult,
} from '../../core/hooks/useTranscription'

/**
 * Reusable voice-input component. Routes to Whisper (server) or Web Speech
 * (browser) based on `profile.voiceInputEnhanced`.
 *
 * See docs/DESIGN_VOICE_INPUT_MODULE.md §4.1 for the design.
 *
 * @example
 * <VoiceInput
 *   profile={activeChild}
 *   sourceSurface="generate-chat"
 *   onTranscript={(text) => sendMessage(text)}
 * />
 */
export interface VoiceInputProps {
  /** Called with the final accepted transcript. */
  onTranscript: (text: string, meta?: { eventId: string }) => void
  /** Called when the kid cancels (closes the recording). */
  onCancel?: () => void
  /** Web Speech path only: continuous interim transcript callback. */
  onInterim?: (text: string) => void
  /** Capture mode. Default 'toggle'. */
  mode?: 'toggle' | 'hold-to-talk'
  /** Max recording duration in seconds. Default 60. Clamped to 120. */
  maxDurationSec?: number
  /** Profile of the user speaking; routes engine selection. */
  profile: { id: string; voiceInputEnhanced?: boolean }
  /** Surface identifier (for trouble-word attribution). */
  sourceSurface: string
  placeholder?: string
  /** Show the "Did I hear you right?" banner before firing onTranscript. */
  showConfirmation?: boolean
  size?: 'small' | 'medium' | 'large'
  disabled?: boolean
}

const HARD_MAX_DURATION_SEC = 120

type Phase =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'confirmation'
  | 'error'
  | 'type-instead'

const SIZE_TO_BUTTON: Record<NonNullable<VoiceInputProps['size']>, number> = {
  small: 40,
  medium: 48,
  large: 56,
}

export default function VoiceInput({
  onTranscript,
  onCancel,
  onInterim,
  mode = 'toggle',
  maxDurationSec = 60,
  profile,
  sourceSurface,
  placeholder,
  showConfirmation = true,
  size = 'medium',
  disabled = false,
}: VoiceInputProps) {
  const useWhisper = profile.voiceInputEnhanced === true
  const clampedSec = Math.min(Math.max(maxDurationSec, 1), HARD_MAX_DURATION_SEC)
  const maxDurationMs = clampedSec * 1000
  const buttonSize = SIZE_TO_BUTTON[size]

  return useWhisper ? (
    <WhisperPath
      onTranscript={onTranscript}
      onCancel={onCancel}
      mode={mode}
      maxDurationMs={maxDurationMs}
      profile={profile}
      sourceSurface={sourceSurface}
      placeholder={placeholder}
      showConfirmation={showConfirmation}
      buttonSize={buttonSize}
      disabled={disabled}
    />
  ) : (
    <WebSpeechPath
      onTranscript={onTranscript}
      onCancel={onCancel}
      onInterim={onInterim}
      placeholder={placeholder}
      showConfirmation={showConfirmation}
      buttonSize={buttonSize}
      disabled={disabled}
    />
  )
}

// ── Whisper path ──────────────────────────────────────────────────

interface WhisperPathProps {
  onTranscript: (text: string, meta?: { eventId: string }) => void
  onCancel?: () => void
  mode: 'toggle' | 'hold-to-talk'
  maxDurationMs: number
  profile: { id: string; voiceInputEnhanced?: boolean }
  sourceSurface: string
  placeholder?: string
  showConfirmation: boolean
  buttonSize: number
  disabled: boolean
}

function WhisperPath({
  onTranscript,
  onCancel,
  mode,
  maxDurationMs,
  profile,
  sourceSurface,
  placeholder,
  showConfirmation,
  buttonSize,
  disabled,
}: WhisperPathProps) {
  const recorder = useAudioRecording({ maxDurationMs })
  const transcription = useTranscription()
  const tts = useTTS()

  const [phase, setPhase] = useState<Phase>('idle')
  const [confirmText, setConfirmText] = useState('')
  const [originalText, setOriginalText] = useState('')
  const [lastResult, setLastResult] = useState<TranscriptResult | null>(null)
  /** If a previous transcript was rejected, carry its eventId forward. */
  const replacesEventIdRef = useRef<string | null>(null)
  const [typeText, setTypeText] = useState('')

  const handleStart = useCallback(async () => {
    if (disabled || !recorder.isSupported) return
    setPhase('recording')
    await recorder.startRecording()
  }, [disabled, recorder])

  const finalize = useCallback(
    async (blob: Blob | null) => {
      if (!blob) {
        setPhase('idle')
        return
      }
      setPhase('transcribing')
      const result = await transcription.transcribe(blob, {
        sourceSurface,
        childId: profile.id,
        replacesEventId: replacesEventIdRef.current ?? undefined,
      })
      if (!result) {
        setPhase('error')
        return
      }
      setLastResult(result)
      setOriginalText(result.text)
      setConfirmText(result.text)
      if (showConfirmation) {
        setPhase('confirmation')
      } else {
        onTranscript(result.text, { eventId: result.eventId })
        replacesEventIdRef.current = null
        setPhase('idle')
      }
    },
    [transcription, sourceSurface, profile.id, showConfirmation, onTranscript],
  )

  const handleStop = useCallback(async () => {
    const blob = await recorder.stopRecording()
    await finalize(blob)
  }, [recorder, finalize])

  const handleCancelRecording = useCallback(() => {
    recorder.cancelRecording()
    setPhase('idle')
    onCancel?.()
  }, [recorder, onCancel])

  const handleAccept = useCallback(() => {
    const text = confirmText.trim()
    if (!text) return
    const eventId = lastResult?.eventId ?? ''
    if (eventId && text !== originalText) {
      // Persist the kid's edit; fire and forget.
      void transcription.updateFinalText(eventId, text)
    }
    onTranscript(text, eventId ? { eventId } : undefined)
    replacesEventIdRef.current = null
    setLastResult(null)
    setConfirmText('')
    setOriginalText('')
    setPhase('idle')
  }, [confirmText, originalText, lastResult, transcription, onTranscript])

  const handleTryAgain = useCallback(() => {
    if (lastResult?.eventId) {
      replacesEventIdRef.current = lastResult.eventId
    }
    setLastResult(null)
    setConfirmText('')
    setOriginalText('')
    setPhase('idle')
  }, [lastResult])

  const handlePlayback = useCallback(() => {
    if (confirmText) tts.speak(confirmText)
  }, [confirmText, tts])

  const handleRetryFromError = useCallback(() => {
    setPhase('idle')
  }, [])

  const handleTypeInstead = useCallback(() => {
    setPhase('type-instead')
  }, [])

  const handleSendTyped = useCallback(() => {
    const text = typeText.trim()
    if (!text) return
    onTranscript(text)
    setTypeText('')
    setPhase('idle')
  }, [typeText, onTranscript])

  // hold-to-talk auto-stop when pressed -> released; for toggle mode we just
  // use the button click handlers.
  const holdToTalkPress =
    mode === 'hold-to-talk' ? () => void handleStart() : undefined
  const holdToTalkRelease =
    mode === 'hold-to-talk' ? () => void handleStop() : undefined

  if (phase === 'error') {
    return (
      <VoiceInputError
        message={transcription.error ?? 'Transcription failed.'}
        onRetry={handleRetryFromError}
        onTypeInstead={handleTypeInstead}
      />
    )
  }

  if (phase === 'type-instead') {
    return (
      <TypeInsteadComposer
        value={typeText}
        onChange={setTypeText}
        placeholder={placeholder}
        onSend={handleSendTyped}
        disabled={disabled}
      />
    )
  }

  if (phase === 'confirmation') {
    return (
      <TranscriptConfirmation
        value={confirmText}
        onChange={setConfirmText}
        onAccept={handleAccept}
        onTryAgain={handleTryAgain}
        onPlayback={handlePlayback}
        isPlaying={tts.isSpeaking}
      />
    )
  }

  if (phase === 'transcribing') {
    return (
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{ py: 1 }}
        role="status"
        aria-live="polite"
      >
        <CircularProgress size={20} />
        <Typography variant="body2" color="text.secondary">
          Got it, let me hear what you said…
        </Typography>
      </Stack>
    )
  }

  // Idle + recording
  return (
    <RecordingButton
      isRecording={phase === 'recording'}
      disabled={disabled || !recorder.isSupported}
      size={buttonSize}
      placeholder={placeholder}
      mode={mode}
      onClick={
        mode === 'toggle'
          ? phase === 'recording'
            ? () => void handleStop()
            : () => void handleStart()
          : undefined
      }
      onPointerDown={holdToTalkPress}
      onPointerUp={holdToTalkRelease}
      onCancel={phase === 'recording' ? handleCancelRecording : undefined}
      onStop={phase === 'recording' ? () => void handleStop() : undefined}
    />
  )
}

// ── Web Speech path ──────────────────────────────────────────────

interface WebSpeechPathProps {
  onTranscript: (text: string, meta?: { eventId: string }) => void
  onCancel?: () => void
  onInterim?: (text: string) => void
  placeholder?: string
  showConfirmation: boolean
  buttonSize: number
  disabled: boolean
}

function WebSpeechPath({
  onTranscript,
  onCancel,
  onInterim,
  placeholder,
  showConfirmation,
  buttonSize,
  disabled,
}: WebSpeechPathProps) {
  const stt = useSpeechRecognition()
  const tts = useTTS()
  const [phase, setPhase] = useState<Phase>('idle')
  const [confirmText, setConfirmText] = useState('')
  const lastConsumedRef = useRef('')

  useEffect(() => {
    if (onInterim) onInterim(stt.interimTranscript)
  }, [stt.interimTranscript, onInterim])

  // When STT finalizes, advance to confirmation (or fire immediately).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (stt.isListening) return
    const text = stt.transcript
    if (!text || text === lastConsumedRef.current) return
    lastConsumedRef.current = text
    stt.reset()
    if (showConfirmation) {
      setConfirmText(text)
      setPhase('confirmation')
    } else {
      onTranscript(text)
      setPhase('idle')
    }
  }, [stt.isListening, stt.transcript, stt, showConfirmation, onTranscript])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleStart = useCallback(() => {
    if (disabled) return
    setPhase('recording')
    stt.reset()
    stt.start()
  }, [disabled, stt])

  const handleStop = useCallback(() => {
    stt.stop()
  }, [stt])

  const handleAccept = useCallback(() => {
    const text = confirmText.trim()
    if (!text) return
    onTranscript(text)
    setConfirmText('')
    setPhase('idle')
  }, [confirmText, onTranscript])

  const handleTryAgain = useCallback(() => {
    setConfirmText('')
    setPhase('idle')
  }, [])

  const handlePlayback = useCallback(() => {
    if (confirmText) tts.speak(confirmText)
  }, [confirmText, tts])

  if (phase === 'confirmation') {
    return (
      <TranscriptConfirmation
        value={confirmText}
        onChange={setConfirmText}
        onAccept={handleAccept}
        onTryAgain={handleTryAgain}
        onPlayback={handlePlayback}
        isPlaying={tts.isSpeaking}
      />
    )
  }

  return (
    <RecordingButton
      isRecording={stt.isListening}
      disabled={disabled || !stt.isSupported}
      size={buttonSize}
      placeholder={placeholder}
      mode="toggle"
      onClick={
        stt.isListening
          ? handleStop
          : phase === 'idle'
            ? handleStart
            : undefined
      }
      onCancel={
        stt.isListening
          ? () => {
              stt.stop()
              onCancel?.()
              setPhase('idle')
            }
          : undefined
      }
      onStop={stt.isListening ? handleStop : undefined}
    />
  )
}

// ── Sub-components (NOT exported) ────────────────────────────────

interface RecordingButtonProps {
  isRecording: boolean
  disabled: boolean
  size: number
  placeholder?: string
  mode: 'toggle' | 'hold-to-talk'
  onClick?: () => void
  onPointerDown?: () => void
  onPointerUp?: () => void
  onCancel?: () => void
  onStop?: () => void
}

function RecordingButton({
  isRecording,
  disabled,
  size,
  placeholder,
  mode,
  onClick,
  onPointerDown,
  onPointerUp,
  onCancel,
  onStop,
}: RecordingButtonProps) {
  const showDone = isRecording && mode === 'toggle' && Boolean(onStop)
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      flexWrap="wrap"
      rowGap={1}
    >
      <IconButton
        color={isRecording ? 'error' : 'primary'}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        disabled={disabled}
        aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        aria-pressed={isRecording}
        sx={{
          width: size,
          height: size,
          bgcolor: isRecording ? 'error.50' : 'primary.50',
          '&:hover': { bgcolor: isRecording ? 'error.100' : 'primary.100' },
        }}
      >
        {isRecording ? <StopIcon /> : <MicIcon />}
      </IconButton>
      {placeholder && !isRecording && (
        <Typography variant="body2" color="text.secondary">
          {placeholder}
        </Typography>
      )}
      {isRecording && (
        <Typography variant="body2" color="error.main">
          Recording…
        </Typography>
      )}
      {showDone && (
        <Button
          variant="contained"
          color="success"
          size="medium"
          onClick={onStop}
          aria-label="Done recording — submit for transcription"
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          ✓ Done
        </Button>
      )}
      {isRecording && onCancel && (
        <Button
          size="small"
          onClick={onCancel}
          sx={{ textTransform: 'none' }}
        >
          Cancel
        </Button>
      )}
    </Stack>
  )
}

interface TranscriptConfirmationProps {
  value: string
  onChange: (v: string) => void
  onAccept: () => void
  onTryAgain: () => void
  onPlayback: () => void
  isPlaying: boolean
}

function TranscriptConfirmation({
  value,
  onChange,
  onAccept,
  onTryAgain,
  onPlayback,
  isPlaying,
}: TranscriptConfirmationProps) {
  return (
    <Stack spacing={1}>
      <Alert severity="info" sx={{ alignItems: 'center' }}>
        Did I hear you right? You can edit before sending.
      </Alert>
      <TextField
        value={value}
        onChange={(e) => onChange(e.target.value)}
        multiline
        minRows={1}
        maxRows={4}
        fullWidth
        autoFocus
        inputProps={{ 'aria-label': 'Edit transcript' }}
      />
      <Stack direction="row" spacing={1}>
        <Button
          variant="contained"
          onClick={onAccept}
          disabled={!value.trim()}
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          Sounds right!
        </Button>
        <Button
          variant="outlined"
          onClick={onTryAgain}
          sx={{ textTransform: 'none' }}
        >
          Try again
        </Button>
        <IconButton
          color={isPlaying ? 'primary' : 'default'}
          onClick={onPlayback}
          aria-label="Play transcript aloud"
        >
          <VolumeUpIcon />
        </IconButton>
      </Stack>
    </Stack>
  )
}

interface VoiceInputErrorProps {
  message: string
  onRetry: () => void
  onTypeInstead: () => void
}

function VoiceInputError({
  message,
  onRetry,
  onTypeInstead,
}: VoiceInputErrorProps) {
  return (
    <Stack spacing={1}>
      <Alert severity="warning">
        Couldn't transcribe that. {message ? `(${message})` : null}
      </Alert>
      <Stack direction="row" spacing={1}>
        <Button
          variant="contained"
          onClick={onRetry}
          sx={{ textTransform: 'none' }}
        >
          Try again
        </Button>
        <Button
          variant="text"
          onClick={onTypeInstead}
          sx={{ textTransform: 'none' }}
        >
          Type instead
        </Button>
      </Stack>
    </Stack>
  )
}

interface TypeInsteadComposerProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  onSend: () => void
  disabled: boolean
}

function TypeInsteadComposer({
  value,
  onChange,
  placeholder,
  onSend,
  disabled,
}: TypeInsteadComposerProps) {
  return (
    <Stack direction="row" spacing={1} alignItems="flex-end">
      <TextField
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        multiline
        minRows={1}
        maxRows={4}
        fullWidth
        disabled={disabled}
        inputProps={{ 'aria-label': 'Type message instead' }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSend()
          }
        }}
      />
      <IconButton
        color="primary"
        onClick={onSend}
        disabled={!value.trim() || disabled}
        aria-label="Send message"
      >
        <SendIcon />
      </IconButton>
    </Stack>
  )
}

