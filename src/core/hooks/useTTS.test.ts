import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTTS } from './useTTS'

// ── Mock SpeechSynthesis ──────────────────────────────────────────

class MockUtterance {
  text: string
  rate = 1
  pitch = 1
  voice: SpeechSynthesisVoice | null = null
  private listeners: Record<string, Array<(e: unknown) => void>> = {}

  constructor(text: string) {
    this.text = text
  }

  addEventListener(event: string, handler: (e: unknown) => void) {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event].push(handler)
  }

  _fire(event: string, data?: unknown) {
    for (const handler of this.listeners[event] ?? []) {
      handler(data ?? {})
    }
  }
}

let mockUtterances: MockUtterance[] = []
const mockSpeak = vi.fn((u: MockUtterance) => {
  mockUtterances.push(u)
})
const mockCancel = vi.fn()
const mockGetVoices = vi.fn(() => [])

beforeEach(() => {
  mockUtterances = []
  mockSpeak.mockClear()
  mockCancel.mockClear()
  mockGetVoices.mockClear()

  Object.defineProperty(window, 'speechSynthesis', {
    value: {
      speak: mockSpeak,
      cancel: mockCancel,
      getVoices: mockGetVoices,
    },
    writable: true,
    configurable: true,
  })

  // @ts-expect-error — mock constructor
  window.SpeechSynthesisUtterance = MockUtterance
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────

describe('useTTS', () => {
  it('reports isSupported when SpeechSynthesis is available', () => {
    const { result } = renderHook(() => useTTS())
    expect(result.current.isSupported).toBe(true)
  })

  it('speaks a single text', () => {
    const { result } = renderHook(() => useTTS())

    act(() => {
      result.current.speak('Hello world')
    })

    expect(mockCancel).toHaveBeenCalled()
    expect(mockSpeak).toHaveBeenCalledTimes(1)
    expect(mockUtterances[0].text).toBe('Hello world')
    expect(mockUtterances[0].rate).toBe(0.75)
    expect(result.current.isSpeaking).toBe(true)
  })

  it('sets isSpeaking to false when utterance ends', () => {
    const { result } = renderHook(() => useTTS())

    act(() => {
      result.current.speak('Hello')
    })

    expect(result.current.isSpeaking).toBe(true)

    act(() => {
      mockUtterances[0]._fire('end')
    })

    expect(result.current.isSpeaking).toBe(false)
  })

  it('cancels current speech', () => {
    const { result } = renderHook(() => useTTS())

    act(() => {
      result.current.speak('Hello')
    })

    act(() => {
      result.current.cancel()
    })

    expect(mockCancel).toHaveBeenCalled()
    expect(result.current.isSpeaking).toBe(false)
  })

  it('speaks a queue of texts sequentially', () => {
    const { result } = renderHook(() => useTTS())

    act(() => {
      result.current.speakQueue(['First', 'Second', 'Third'])
    })

    expect(mockSpeak).toHaveBeenCalledTimes(1)
    expect(mockUtterances[0].text).toBe('First')

    // Finish first, should start second
    act(() => {
      mockUtterances[0]._fire('end')
    })

    expect(mockSpeak).toHaveBeenCalledTimes(2)
    expect(mockUtterances[1].text).toBe('Second')
    expect(result.current.isSpeaking).toBe(true)

    // Finish second, should start third
    act(() => {
      mockUtterances[1]._fire('end')
    })

    expect(mockSpeak).toHaveBeenCalledTimes(3)
    expect(mockUtterances[2].text).toBe('Third')

    // Finish third, should be done
    act(() => {
      mockUtterances[2]._fire('end')
    })

    expect(result.current.isSpeaking).toBe(false)
  })

  it('uses custom rate and pitch', () => {
    const { result } = renderHook(() => useTTS({ rate: 1.2, pitch: 0.8 }))

    act(() => {
      result.current.speak('Test')
    })

    expect(mockUtterances[0].rate).toBe(1.2)
    expect(mockUtterances[0].pitch).toBe(0.8)
  })

  it('calls onWordBoundary when word boundary fires', () => {
    const onWordBoundary = vi.fn()
    const { result } = renderHook(() => useTTS({ onWordBoundary }))

    act(() => {
      result.current.speak('Hello world')
    })

    act(() => {
      mockUtterances[0]._fire('boundary', { name: 'word', charIndex: 6 })
    })

    expect(onWordBoundary).toHaveBeenCalledWith(6)
  })

  it('cancels on unmount', () => {
    const { unmount } = renderHook(() => useTTS())
    unmount()
    expect(mockCancel).toHaveBeenCalled()
  })
})
