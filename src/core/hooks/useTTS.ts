import { useCallback, useEffect, useRef, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────

export interface TTSOptions {
  /** Speech rate (default 0.75 — slower for kids) */
  rate?: number
  /** Speech pitch (default 1.0) */
  pitch?: number
  /** Preferred voice names to search for (default: Samantha, Karen, Moira) */
  preferredVoices?: string[]
  /** Called when a word boundary event fires during speech */
  onWordBoundary?: (charIndex: number) => void
}

export interface TTSControls {
  /** Speak a single text. Cancels any current speech first. */
  speak: (text: string) => void
  /** Queue multiple texts to be spoken sequentially. */
  speakQueue: (texts: string[]) => void
  /** Cancel current speech and clear the queue. */
  cancel: () => void
  /** Whether speech is currently playing. */
  isSpeaking: boolean
  /** Whether SpeechSynthesis is supported in this browser. */
  isSupported: boolean
}

const DEFAULT_PREFERRED_VOICES = ['Samantha', 'Karen', 'Moira']

/** Find a preferred voice from the available voices list. */
function findPreferredVoice(preferredNames: string[]): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  const voices = window.speechSynthesis.getVoices()
  for (const name of preferredNames) {
    const match = voices.find((v) => v.name.includes(name))
    if (match) return match
  }
  return null
}

// ── Hook ──────────────────────────────────────────────────────────

export function useTTS(options: TTSOptions = {}): TTSControls {
  const {
    rate = 0.75,
    pitch = 1.0,
    preferredVoices = DEFAULT_PREFERRED_VOICES,
    onWordBoundary,
  } = options

  const [isSpeaking, setIsSpeaking] = useState(false)
  const queueRef = useRef<string[]>([])
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const onWordBoundaryRef = useRef(onWordBoundary)
  useEffect(() => {
    onWordBoundaryRef.current = onWordBoundary
  }, [onWordBoundary])

  const isSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window

  const speakNextRef = useRef<() => void>(() => {})

  const cancel = useCallback(() => {
    queueRef.current = []
    if (isSupported) window.speechSynthesis.cancel()
    utteranceRef.current = null
    setIsSpeaking(false)
  }, [isSupported])

  const speakNext = useCallback(() => {
    if (!isSupported) return
    const text = queueRef.current.shift()
    if (!text) {
      setIsSpeaking(false)
      utteranceRef.current = null
      return
    }

    setIsSpeaking(true)
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = rate
    utterance.pitch = pitch

    const voice = findPreferredVoice(preferredVoices)
    if (voice) utterance.voice = voice

    utterance.addEventListener('boundary', (event) => {
      if (event.name === 'word' && onWordBoundaryRef.current) {
        onWordBoundaryRef.current(event.charIndex)
      }
    })

    utterance.addEventListener('end', () => {
      // Speak next in queue, or finish
      if (queueRef.current.length > 0) {
        speakNextRef.current()
      } else {
        setIsSpeaking(false)
        utteranceRef.current = null
      }
    })

    utterance.addEventListener('error', () => {
      // On error, try next in queue or finish
      if (queueRef.current.length > 0) {
        speakNextRef.current()
      } else {
        setIsSpeaking(false)
        utteranceRef.current = null
      }
    })

    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }, [isSupported, rate, pitch, preferredVoices])

  useEffect(() => {
    speakNextRef.current = speakNext
  }, [speakNext])

  const speak = useCallback(
    (text: string) => {
      if (!isSupported) return
      window.speechSynthesis.cancel()
      queueRef.current = [text]
      speakNext()
    },
    [isSupported, speakNext],
  )

  const speakQueue = useCallback(
    (texts: string[]) => {
      if (!isSupported) return
      window.speechSynthesis.cancel()
      queueRef.current = [...texts]
      speakNext()
    },
    [isSupported, speakNext],
  )

  // Cancel on unmount
  useEffect(() => {
    return () => {
      if (isSupported) window.speechSynthesis.cancel()
    }
  }, [isSupported])

  return { speak, speakQueue, cancel, isSpeaking, isSupported }
}
