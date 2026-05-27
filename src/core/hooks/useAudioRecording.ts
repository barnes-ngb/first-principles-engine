import { useCallback } from 'react'
import {
  HARD_MAX_DURATION_MS,
  useAudioRecorder,
  type UseAudioRecorderOpts,
} from './useAudioRecorder'

/**
 * Enhanced wrapper around {@link useAudioRecorder} used by the voice input
 * module. Adds configurable max duration (clamped to 120s) and a `reset`
 * method that the VoiceInput state machine uses between attempts.
 *
 * Existing callers of `useAudioRecorder` keep working without changes
 * (the underlying hook stays backward-compatible).
 */
export type UseAudioRecordingOpts = UseAudioRecorderOpts

export interface UseAudioRecording {
  isSupported: boolean
  isRecording: boolean
  durationMs: number
  startRecording: () => Promise<void>
  stopRecording: () => Promise<Blob | null>
  cancelRecording: () => void
  error: string | null
  reset: () => void
}

export function useAudioRecording(
  opts?: UseAudioRecordingOpts,
): UseAudioRecording {
  const recorder = useAudioRecorder({
    maxDurationMs: opts?.maxDurationMs,
    mimeTypePreference: opts?.mimeTypePreference,
  })

  const reset = useCallback(() => {
    recorder.cancelRecording()
    recorder.clearRecording()
  }, [recorder])

  return {
    isSupported: recorder.isSupported,
    isRecording: recorder.isRecording,
    durationMs: recorder.durationMs,
    startRecording: recorder.startRecording,
    stopRecording: recorder.stopRecording,
    cancelRecording: recorder.cancelRecording,
    error: recorder.error,
    reset,
  }
}

export { HARD_MAX_DURATION_MS }
