import { useCallback, useRef, useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'

import { app } from '../firebase/firebase'
import { db } from '../firebase/firestore'
import { useFamilyId } from '../auth/useAuth'

/**
 * Hook that wraps the `transcribeAudio` Firebase callable. Used by the
 * VoiceInput component when a child's `voiceInputEnhanced` flag is true.
 *
 * See docs/DESIGN_VOICE_INPUT_MODULE.md §4.2.
 */

export interface TranscriptSegment {
  start: number
  end: number
  text: string
  avg_logprob: number
}

export interface TranscriptResult {
  eventId: string
  text: string
  durationSec: number
  language: string
  segments?: TranscriptSegment[]
}

export interface TranscribeOpts {
  sourceSurface: string
  childId: string
  language?: string
  /** If this transcription is a retry, the prior event's id. */
  replacesEventId?: string
}

interface TranscribeAudioRequest {
  audioBase64: string
  mimeType: string
  familyId: string
  childId: string
  durationMs: number
  sourceSurface: string
  language?: string
  replacesEventId?: string
}

export interface UseTranscription {
  transcribe: (
    blob: Blob,
    opts: TranscribeOpts,
  ) => Promise<TranscriptResult | null>
  isTranscribing: boolean
  error: string | null
  lastResult: TranscriptResult | null
  /** Update the `finalText` field on the transcriptionEvents doc. */
  updateFinalText: (eventId: string, finalText: string) => Promise<void>
}

const functions = getFunctions(app)
const transcribeAudioFn = httpsCallable<
  TranscribeAudioRequest,
  TranscriptResult
>(functions, 'transcribeAudio', { timeout: 60_000 })

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  // Chunked to avoid call-stack overflow on large blobs.
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)),
    )
  }
  return btoa(binary)
}

function isTransientError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = (err as { code?: string }).code
  if (!code) return false
  return (
    code === 'functions/unavailable' ||
    code === 'functions/internal' ||
    code === 'functions/deadline-exceeded'
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function useTranscription(): UseTranscription {
  const familyId = useFamilyId()
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<TranscriptResult | null>(null)
  /** Last childId seen by transcribe(); used by updateFinalText to find the doc. */
  const lastChildIdRef = useRef<string | null>(null)

  const transcribe = useCallback(
    async (
      blob: Blob,
      opts: TranscribeOpts,
    ): Promise<TranscriptResult | null> => {
      lastChildIdRef.current = opts.childId
      setIsTranscribing(true)
      setError(null)
      try {
        const audioBase64 = await blobToBase64(blob)
        const mimeType = blob.type || 'audio/webm'
        const request: TranscribeAudioRequest = {
          audioBase64,
          mimeType,
          familyId,
          childId: opts.childId,
          durationMs: 0,
          sourceSurface: opts.sourceSurface,
          ...(opts.language ? { language: opts.language } : {}),
          ...(opts.replacesEventId
            ? { replacesEventId: opts.replacesEventId }
            : {}),
        }

        let response
        try {
          response = await transcribeAudioFn(request)
        } catch (err) {
          if (isTransientError(err)) {
            await delay(1000)
            response = await transcribeAudioFn(request)
          } else {
            throw err
          }
        }

        const result = response.data
        setLastResult(result)
        return result
      } catch (err) {
        const fireErr = err as {
          code?: string
          message?: string
          details?: string
        }
        const message =
          fireErr.details ||
          fireErr.message ||
          (err instanceof Error ? err.message : String(err))
        setError(message)
        return null
      } finally {
        setIsTranscribing(false)
      }
    },
    [familyId],
  )

  const updateFinalText = useCallback(
    async (eventId: string, finalText: string): Promise<void> => {
      if (!eventId) return
      const childId = lastChildIdRef.current
      if (!childId) return
      const ref = doc(
        db,
        `families/${familyId}/children/${childId}/transcriptionEvents/${eventId}`,
      )
      await updateDoc(ref, { finalText })
    },
    [familyId],
  )

  return {
    transcribe,
    isTranscribing,
    error,
    lastResult,
    updateFinalText,
  }
}
