import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSpeechRecognition } from './useSpeechRecognition'

// ── Mock SpeechRecognition ────────────────────────────────────────

class MockSpeechRecognition {
  continuous = false
  interimResults = false
  lang = ''
  onresult: ((event: unknown) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onend: (() => void) | null = null

  start = vi.fn()
  stop = vi.fn(() => {
    this.onend?.()
  })
  abort = vi.fn()
}

let mockInstance: MockSpeechRecognition

beforeEach(() => {
  mockInstance = new MockSpeechRecognition()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).webkitSpeechRecognition = vi.fn(() => mockInstance)
})

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).webkitSpeechRecognition
  vi.restoreAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────

describe('useSpeechRecognition', () => {
  it('reports isSupported when webkitSpeechRecognition is available', () => {
    const { result } = renderHook(() => useSpeechRecognition())
    expect(result.current.isSupported).toBe(true)
  })

  it('reports not supported when no SpeechRecognition API', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).webkitSpeechRecognition
    const { result } = renderHook(() => useSpeechRecognition())
    expect(result.current.isSupported).toBe(false)
  })

  it('starts listening', () => {
    const { result } = renderHook(() => useSpeechRecognition())

    act(() => {
      result.current.start()
    })

    expect(mockInstance.start).toHaveBeenCalled()
    expect(result.current.isListening).toBe(true)
    expect(mockInstance.continuous).toBe(true)
    expect(mockInstance.interimResults).toBe(true)
  })

  it('stops listening', () => {
    const { result } = renderHook(() => useSpeechRecognition())

    act(() => {
      result.current.start()
    })

    act(() => {
      result.current.stop()
    })

    expect(result.current.isListening).toBe(false)
  })

  it('accumulates final transcript from speech results', () => {
    const { result } = renderHook(() => useSpeechRecognition())

    act(() => {
      result.current.start()
    })

    // Simulate a final speech result
    act(() => {
      mockInstance.onresult?.({
        results: [
          { 0: { transcript: 'Hello world' }, isFinal: true, length: 1 },
        ],
        length: 1,
      })
    })

    expect(result.current.transcript).toBe('Hello world')
  })

  it('captures interim transcript', () => {
    const { result } = renderHook(() => useSpeechRecognition())

    act(() => {
      result.current.start()
    })

    act(() => {
      mockInstance.onresult?.({
        results: [
          { 0: { transcript: 'Hel' }, isFinal: false, length: 1 },
        ],
        length: 1,
      })
    })

    expect(result.current.interimTranscript).toBe('Hel')
  })

  it('resets transcript', () => {
    const { result } = renderHook(() => useSpeechRecognition())

    act(() => {
      result.current.start()
    })

    act(() => {
      mockInstance.onresult?.({
        results: [
          { 0: { transcript: 'Hello' }, isFinal: true, length: 1 },
        ],
        length: 1,
      })
    })

    expect(result.current.transcript).toBe('Hello')

    act(() => {
      result.current.reset()
    })

    expect(result.current.transcript).toBe('')
    expect(result.current.interimTranscript).toBe('')
  })

  it('sets error on recognition error (non-trivial)', () => {
    const { result } = renderHook(() => useSpeechRecognition())

    act(() => {
      result.current.start()
    })

    act(() => {
      mockInstance.onerror?.({ error: 'not-allowed' })
    })

    expect(result.current.error).toBe('not-allowed')
    expect(result.current.isListening).toBe(false)
  })

  it('ignores no-speech and aborted errors', () => {
    const { result } = renderHook(() => useSpeechRecognition())

    act(() => {
      result.current.start()
    })

    act(() => {
      mockInstance.onerror?.({ error: 'no-speech' })
    })

    expect(result.current.error).toBeNull()
    expect(result.current.isListening).toBe(true)

    act(() => {
      mockInstance.onerror?.({ error: 'aborted' })
    })

    expect(result.current.error).toBeNull()
  })

  it('sets error when starting on unsupported browser', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).webkitSpeechRecognition
    const { result } = renderHook(() => useSpeechRecognition())

    act(() => {
      result.current.start()
    })

    expect(result.current.error).toBe('Speech recognition is not supported in this browser')
  })
})
