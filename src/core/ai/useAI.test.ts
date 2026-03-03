import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ChatRequest, ChatResponse } from './useAI'

// ── Mocks ───────────────────────────────────────────────────────

const { mockCallable } = vi.hoisted(() => ({
  mockCallable: vi.fn(),
}))

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => mockCallable),
}))

vi.mock('../firebase/firebase', () => ({
  app: {},
}))

// ── Tests ───────────────────────────────────────────────────────

import { useAI, TaskType } from './useAI'

const baseRequest: ChatRequest = {
  familyId: 'family-1',
  childId: 'child-1',
  taskType: TaskType.Chat,
  messages: [{ role: 'user', content: 'Hello' }],
}

const mockResponse: ChatResponse = {
  message: 'Hi there!',
  model: 'claude-haiku-4-5-20251001',
  usage: { inputTokens: 10, outputTokens: 5 },
}

describe('useAI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns initial state with loading false and no error', () => {
    const { result } = renderHook(() => useAI())

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(typeof result.current.chat).toBe('function')
  })

  it('returns response data on successful chat call', async () => {
    mockCallable.mockResolvedValueOnce({ data: mockResponse })

    const { result } = renderHook(() => useAI())

    let response: ChatResponse | null = null
    await act(async () => {
      response = await result.current.chat(baseRequest)
    })

    expect(response).toEqual(mockResponse)
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(mockCallable).toHaveBeenCalledWith(baseRequest)
  })

  it('sets error state on failure and returns null', async () => {
    mockCallable.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useAI())

    let response: ChatResponse | null = null
    await act(async () => {
      response = await result.current.chat(baseRequest)
    })

    expect(response).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('Network error')
  })

  it('clears previous error on new call', async () => {
    mockCallable
      .mockRejectedValueOnce(new Error('First error'))
      .mockResolvedValueOnce({ data: mockResponse })

    const { result } = renderHook(() => useAI())

    await act(async () => {
      await result.current.chat(baseRequest)
    })
    expect(result.current.error).not.toBeNull()

    await act(async () => {
      await result.current.chat(baseRequest)
    })
    expect(result.current.error).toBeNull()
  })

  it('handles non-Error thrown values', async () => {
    mockCallable.mockRejectedValueOnce('string error')

    const { result } = renderHook(() => useAI())

    await act(async () => {
      await result.current.chat(baseRequest)
    })

    expect(result.current.error?.message).toBe('string error')
  })
})
