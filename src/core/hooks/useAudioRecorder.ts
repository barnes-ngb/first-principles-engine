import { useCallback, useRef, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────

export interface UseAudioRecorderOpts {
  /** Override the default 10s max duration. Clamped to HARD_MAX_DURATION_MS. */
  maxDurationMs?: number
  /** Override preferred mime types (first supported wins). */
  mimeTypePreference?: string[]
}

export interface UseAudioRecorder {
  /** Whether the browser supports MediaRecorder + getUserMedia */
  isSupported: boolean
  /** Whether we're currently recording */
  isRecording: boolean
  /** Whether we're currently playing back audio */
  isPlaying: boolean
  /** Object URL for the last recording (for local preview before upload) */
  recordingUrl: string | null
  /** Duration of the last recording in milliseconds */
  durationMs: number
  /** Start recording from the microphone */
  startRecording: () => Promise<void>
  /** Stop recording and return the audio Blob */
  stopRecording: () => Promise<Blob | null>
  /** Discard the active recording without returning a blob. */
  cancelRecording: () => void
  /** Play an audio URL (local blob URL or remote URL) */
  playRecording: (url: string) => void
  /** Stop any current playback */
  stopPlayback: () => void
  /** Clear the current recording URL */
  clearRecording: () => void
  /** Last error message, if any */
  error: string | null
}

/** Default max recording duration. Existing call sites rely on this 10s cap. */
const DEFAULT_MAX_DURATION_MS = 10_000

/** Absolute ceiling enforced regardless of caller-provided override. */
export const HARD_MAX_DURATION_MS = 120_000

const DEFAULT_MIME_PREFERENCE = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
]

/** Preferred MIME type for MediaRecorder */
function getPreferredMimeType(preference?: string[]): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm'
  const candidates = preference ?? DEFAULT_MIME_PREFERENCE
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate
  }
  return 'audio/webm'
}

// ── Hook ──────────────────────────────────────────────────────────

export function useAudioRecorder(opts?: UseAudioRecorderOpts): UseAudioRecorder {
  const requestedMax = opts?.maxDurationMs ?? DEFAULT_MAX_DURATION_MS
  const maxDurationMs = Math.min(
    Math.max(requestedMax, 0),
    HARD_MAX_DURATION_MS,
  )
  const mimePreference = opts?.mimeTypePreference
  const [isRecording, setIsRecording] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null)
  const [durationMs, setDurationMs] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobResolveRef = useRef<((blob: Blob | null) => void) | null>(null)

  const isSupported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'

  const cleanup = useCallback(() => {
    // Stop all tracks on the media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current)
      autoStopRef.current = null
    }
    recorderRef.current = null
  }, [])

  const startRecording = useCallback(async () => {
    setError(null)

    if (!isSupported) {
      setError('Audio recording is not supported in this browser.')
      return
    }

    // Revoke previous blob URL
    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl)
      setRecordingUrl(null)
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = getPreferredMimeType(mimePreference)
      const recorder = new MediaRecorder(stream, { mimeType })
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        const elapsed = Date.now() - startTimeRef.current
        setDurationMs(elapsed)

        const url = URL.createObjectURL(blob)
        setRecordingUrl(url)
        setIsRecording(false)
        cleanup()

        // Resolve the promise from stopRecording if waiting
        if (blobResolveRef.current) {
          blobResolveRef.current(blob)
          blobResolveRef.current = null
        }
      }

      recorder.onerror = () => {
        setError('Recording failed. Please try again.')
        setIsRecording(false)
        cleanup()
        if (blobResolveRef.current) {
          blobResolveRef.current(null)
          blobResolveRef.current = null
        }
      }

      startTimeRef.current = Date.now()
      recorder.start()
      setIsRecording(true)

      // Auto-stop after maxDurationMs
      autoStopRef.current = setTimeout(() => {
        if (recorderRef.current?.state === 'recording') {
          recorderRef.current.stop()
        }
      }, maxDurationMs)
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone permission was denied.'
          : 'Could not access the microphone.'
      setError(message)
      cleanup()
    }
  }, [isSupported, recordingUrl, cleanup, maxDurationMs, mimePreference])

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!recorderRef.current || recorderRef.current.state !== 'recording') {
        resolve(null)
        return
      }
      blobResolveRef.current = resolve
      recorderRef.current.stop()
    })
  }, [])

  const cancelRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      // Pre-empt onstop so we don't resolve a blob.
      recorderRef.current.onstop = null
      try {
        recorderRef.current.stop()
      } catch {
        // ignore
      }
    }
    chunksRef.current = []
    cleanup()
    setIsRecording(false)
    setDurationMs(0)
    if (blobResolveRef.current) {
      blobResolveRef.current(null)
      blobResolveRef.current = null
    }
  }, [cleanup])

  const playRecording = useCallback((url: string) => {
    // Stop any current playback first
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    const audio = new Audio(url)
    audioRef.current = audio

    audio.onplay = () => setIsPlaying(true)
    audio.onended = () => {
      setIsPlaying(false)
      audioRef.current = null
    }
    audio.onerror = () => {
      setIsPlaying(false)
      audioRef.current = null
    }

    audio.play().catch(() => {
      setIsPlaying(false)
      audioRef.current = null
    })
  }, [])

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setIsPlaying(false)
      audioRef.current = null
    }
  }, [])

  const clearRecording = useCallback(() => {
    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl)
      setRecordingUrl(null)
    }
    setDurationMs(0)
    setError(null)
  }, [recordingUrl])

  return {
    isSupported,
    isRecording,
    isPlaying,
    recordingUrl,
    durationMs,
    startRecording,
    stopRecording,
    cancelRecording,
    playRecording,
    stopPlayback,
    clearRecording,
    error,
  }
}
