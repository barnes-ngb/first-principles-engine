import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useAudioRecording } from './useAudioRecording'

// ── Mock MediaRecorder + getUserMedia ─────────────────────────────

class MockMediaRecorder {
  static lastInstance: MockMediaRecorder | null = null
  static isTypeSupported = vi.fn(() => true)

  state: 'inactive' | 'recording' = 'inactive'
  mimeType: string
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: ((e: unknown) => void) | null = null

  constructor(_stream: unknown, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType ?? 'audio/webm'
    MockMediaRecorder.lastInstance = this
  }

  start = vi.fn(() => {
    this.state = 'recording'
  })

  stop = vi.fn(() => {
    this.state = 'inactive'
    // Simulate async onstop firing (microtask)
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(['x'], { type: this.mimeType }) })
      this.onstop?.()
    })
  })
}

const mockGetUserMedia = vi.fn(async () => ({
  getTracks: () => [{ stop: vi.fn() }],
}))

beforeEach(() => {
  vi.useFakeTimers()
  MockMediaRecorder.lastInstance = null
  ;(globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder =
    MockMediaRecorder
  ;(MockMediaRecorder as unknown as { isTypeSupported: unknown }).isTypeSupported =
    vi.fn(() => true)
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices: { getUserMedia: mockGetUserMedia } },
    configurable: true,
  })
  ;(globalThis as unknown as { URL: unknown }).URL = {
    createObjectURL: vi.fn(() => 'blob:fake'),
    revokeObjectURL: vi.fn(),
  }
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useAudioRecording', () => {
  it('uses the default 10s max duration when no opts are passed', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const { result } = renderHook(() => useAudioRecording())

    await act(async () => {
      await result.current.startRecording()
    })

    const tenSecondCall = setTimeoutSpy.mock.calls.find(
      ([, delay]) => delay === 10_000,
    )
    expect(tenSecondCall).toBeDefined()
  })

  it('respects a custom maxDurationMs', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const { result } = renderHook(() =>
      useAudioRecording({ maxDurationMs: 60_000 }),
    )

    await act(async () => {
      await result.current.startRecording()
    })

    const sixtySecondCall = setTimeoutSpy.mock.calls.find(
      ([, delay]) => delay === 60_000,
    )
    expect(sixtySecondCall).toBeDefined()
  })

  it('clamps maxDurationMs > 120_000 to 120_000', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const { result } = renderHook(() =>
      useAudioRecording({ maxDurationMs: 600_000 }),
    )

    await act(async () => {
      await result.current.startRecording()
    })

    const clampedCall = setTimeoutSpy.mock.calls.find(
      ([, delay]) => delay === 120_000,
    )
    const oversized = setTimeoutSpy.mock.calls.find(
      ([, delay]) => typeof delay === 'number' && delay > 120_000,
    )
    expect(clampedCall).toBeDefined()
    expect(oversized).toBeUndefined()
  })

  it('cancelRecording discards without returning a blob', async () => {
    const { result } = renderHook(() => useAudioRecording())

    await act(async () => {
      await result.current.startRecording()
    })
    expect(result.current.isRecording).toBe(true)

    act(() => {
      result.current.cancelRecording()
    })

    expect(result.current.isRecording).toBe(false)
    expect(result.current.durationMs).toBe(0)
  })

  it('reset clears state after a recording is captured', async () => {
    const { result } = renderHook(() => useAudioRecording())

    await act(async () => {
      await result.current.startRecording()
    })

    act(() => {
      result.current.reset()
    })

    expect(result.current.isRecording).toBe(false)
    expect(result.current.durationMs).toBe(0)
    expect(result.current.error).toBeNull()
  })
})
