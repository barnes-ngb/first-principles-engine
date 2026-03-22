import { useCallback, useRef, useState } from 'react'
import { useTTS } from '../../core/hooks/useTTS'

/**
 * Hook that implements the tap-to-hear pattern for selectable tiles.
 *
 * First tap → highlight tile + TTS reads label. Second tap → confirm selection.
 * Tapping a different tile switches highlight. Speaker icon replays TTS.
 * When "Next" is pressed, a highlighted-but-unconfirmed tile is auto-confirmed.
 */
export function useTapToHear<T extends string>(
  /** Currently confirmed selection (from parent state) */
  confirmedValue: T | '',
  /** Callback to confirm a selection */
  onConfirm: (value: T) => void,
) {
  const [highlightedValue, setHighlightedValue] = useState<T | ''>('')
  const tts = useTTS({ rate: 0.85 })
  const lastTapRef = useRef<{ value: T; time: number } | null>(null)

  /** The value to treat as "active" — confirmed takes priority, then highlighted */
  const activeValue = confirmedValue || highlightedValue

  const handleTileTap = useCallback(
    (value: T, label: string) => {
      const now = Date.now()
      const lastTap = lastTapRef.current

      // If tapping the already-confirmed value, replay TTS
      if (value === confirmedValue) {
        tts.speak(label)
        return
      }

      // Second tap on the same highlighted tile → confirm
      if (
        lastTap &&
        lastTap.value === value &&
        value === highlightedValue &&
        now - lastTap.time < 3000
      ) {
        tts.cancel()
        setHighlightedValue('')
        onConfirm(value)
        lastTapRef.current = null
        return
      }

      // First tap (or tap on a different tile) → highlight + speak
      tts.cancel()
      setHighlightedValue(value)
      tts.speak(label)
      lastTapRef.current = { value, time: now }
    },
    [confirmedValue, highlightedValue, onConfirm, tts],
  )

  /** Replay TTS for the currently highlighted tile */
  const replayTTS = useCallback(
    (label: string) => {
      tts.cancel()
      tts.speak(label)
    },
    [tts],
  )

  /**
   * Call this before advancing to the next step.
   * If a tile is highlighted but not confirmed, auto-confirm it.
   */
  const confirmHighlighted = useCallback(() => {
    if (highlightedValue && !confirmedValue) {
      onConfirm(highlightedValue)
      setHighlightedValue('')
    }
  }, [highlightedValue, confirmedValue, onConfirm])

  /** Get the visual state for a tile */
  const getTileState = useCallback(
    (value: T): 'confirmed' | 'highlighted' | 'idle' => {
      if (value === confirmedValue) return 'confirmed'
      if (value === highlightedValue) return 'highlighted'
      return 'idle'
    },
    [confirmedValue, highlightedValue],
  )

  return {
    activeValue,
    highlightedValue,
    handleTileTap,
    replayTTS,
    confirmHighlighted,
    getTileState,
    isSpeaking: tts.isSpeaking,
    cancelTTS: tts.cancel,
  }
}

/**
 * Multi-select version of useTapToHear.
 *
 * First tap → highlight + TTS. Second tap → toggle selection (add/remove).
 * Tapping a different tile switches highlight.
 */
export function useTapToHearMulti<T extends string>(
  /** Currently selected values */
  selectedValues: T[],
  /** Callback to toggle a value */
  onToggle: (value: T) => void,
) {
  const [highlightedValue, setHighlightedValue] = useState<T | ''>('')
  const tts = useTTS({ rate: 0.85 })
  const lastTapRef = useRef<{ value: T; time: number } | null>(null)

  const handleTileTap = useCallback(
    (value: T, label: string) => {
      const now = Date.now()
      const lastTap = lastTapRef.current

      // Second tap on the same highlighted tile → toggle selection
      if (
        lastTap &&
        lastTap.value === value &&
        value === highlightedValue &&
        now - lastTap.time < 3000
      ) {
        tts.cancel()
        onToggle(value)
        setHighlightedValue('')
        lastTapRef.current = null
        return
      }

      // First tap → highlight + speak
      tts.cancel()
      setHighlightedValue(value)
      tts.speak(label)
      lastTapRef.current = { value, time: now }
    },
    [highlightedValue, onToggle, tts],
  )

  const replayTTS = useCallback(
    (label: string) => {
      tts.cancel()
      tts.speak(label)
    },
    [tts],
  )

  /**
   * If a tile is highlighted but not yet toggled, toggle it before advancing.
   */
  const confirmHighlighted = useCallback(() => {
    if (highlightedValue && !selectedValues.includes(highlightedValue)) {
      onToggle(highlightedValue)
      setHighlightedValue('')
    }
  }, [highlightedValue, selectedValues, onToggle])

  const getTileState = useCallback(
    (value: T): 'selected' | 'highlighted' | 'idle' => {
      if (selectedValues.includes(value)) return 'selected'
      if (value === highlightedValue) return 'highlighted'
      return 'idle'
    },
    [selectedValues, highlightedValue],
  )

  return {
    highlightedValue,
    handleTileTap,
    replayTTS,
    confirmHighlighted,
    getTileState,
    isSpeaking: tts.isSpeaking,
    cancelTTS: tts.cancel,
  }
}
