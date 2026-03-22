import { useCallback, useEffect, useRef, useState } from 'react'

// ── Web Speech API type shim (not in default DOM lib) ─────────────

interface SpeechRecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  readonly [index: number]: { readonly transcript: string }
}

interface SpeechRecognitionResultList {
  readonly length: number
  readonly [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionEvent {
  readonly results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent {
  readonly error: string
}

interface SpeechRecognitionInstance {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

// ── Types ─────────────────────────────────────────────────────────

export interface SpeechRecognitionControls {
  /** Accumulated final transcript text */
  transcript: string
  /** Currently being spoken (interim result, not yet final) */
  interimTranscript: string
  /** Whether the recognizer is actively listening */
  isListening: boolean
  /** Whether SpeechRecognition is supported in this browser */
  isSupported: boolean
  /** Start listening */
  start: () => void
  /** Stop listening */
  stop: () => void
  /** Clear the accumulated transcript */
  reset: () => void
  /** Last error message, if any */
  error: string | null
}

// Browser-prefixed SpeechRecognition
function getSpeechRecognitionClass(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

// ── Hook ──────────────────────────────────────────────────────────

export function useSpeechRecognition(): SpeechRecognitionControls {
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  const SpeechRecognitionClass = getSpeechRecognitionClass()
  const isSupported = SpeechRecognitionClass !== null

  const start = useCallback(() => {
    if (!SpeechRecognitionClass) {
      setError('Speech recognition is not supported in this browser')
      return
    }

    // Stop existing instance if any
    if (recognitionRef.current) {
      recognitionRef.current.abort()
    }

    setError(null)
    const recognition = new SpeechRecognitionClass()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalText += result[0].transcript
        } else {
          interimText += result[0].transcript
        }
      }
      if (finalText) {
        setTranscript((prev) => (prev ? prev + ' ' + finalText.trim() : finalText.trim()))
      }
      setInterimTranscript(interimText)
    }

    recognition.onerror = (event) => {
      // 'no-speech' and 'aborted' are expected during normal operation
      if (event.error === 'no-speech' || event.error === 'aborted') return
      setError(event.error)
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
      setInterimTranscript('')
    }

    recognition.start()
    recognitionRef.current = recognition
    setIsListening(true)
  }, [SpeechRecognitionClass])

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
    setInterimTranscript('')
  }, [])

  const reset = useCallback(() => {
    setTranscript('')
    setInterimTranscript('')
    setError(null)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
    }
  }, [])

  return {
    transcript,
    interimTranscript,
    isListening,
    isSupported,
    start,
    stop,
    reset,
    error,
  }
}
