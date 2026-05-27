import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const { mockCallable, mockUpdateDoc, mockDocRef, mockDoc } = vi.hoisted(() => {
  const ref = { __ref: true }
  return {
    mockCallable: vi.fn(),
    mockUpdateDoc: vi.fn<(...args: unknown[]) => Promise<undefined>>(
      async () => undefined,
    ),
    mockDocRef: ref,
    mockDoc: vi.fn<(...args: unknown[]) => typeof ref>(() => ref),
  }
})

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => mockCallable),
}))

vi.mock('firebase/firestore', () => ({
  doc: (db: unknown, path: string) => mockDoc(db, path),
  updateDoc: (ref: unknown, data: unknown) => mockUpdateDoc(ref, data),
}))

vi.mock('../firebase/firebase', () => ({
  app: {},
}))

vi.mock('../firebase/firestore', () => ({
  db: { __db: true },
}))

vi.mock('../auth/useAuth', () => ({
  useFamilyId: () => 'fam-1',
}))

import { useTranscription } from './useTranscription'

function makeBlob(): Blob {
  const bytes = new TextEncoder().encode('hello-bytes')
  return {
    type: 'audio/webm',
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer,
  } as unknown as Blob
}

const happyResult = {
  eventId: 'event-1',
  text: 'Once upon a time.',
  durationSec: 5,
  language: 'en',
  segments: [{ start: 0, end: 5, text: 'Once upon a time.', avg_logprob: -0.2 }],
}

describe('useTranscription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the transcript on successful transcribe()', async () => {
    mockCallable.mockResolvedValueOnce({ data: happyResult })

    const { result } = renderHook(() => useTranscription())

    let value: unknown
    await act(async () => {
      value = await result.current.transcribe(makeBlob(), {
        sourceSurface: 'generate-chat',
        childId: 'child-1',
      })
    })

    expect(value).toEqual(happyResult)
    expect(result.current.lastResult).toEqual(happyResult)
    expect(result.current.error).toBeNull()
    // Verify the request shape included our metadata
    const req = mockCallable.mock.calls[0][0] as Record<string, unknown>
    expect(req.familyId).toBe('fam-1')
    expect(req.childId).toBe('child-1')
    expect(req.sourceSurface).toBe('generate-chat')
    expect(req.mimeType).toBe('audio/webm')
    expect(typeof req.audioBase64).toBe('string')
  })

  it('retries once on a transient functions/unavailable error and returns the result', async () => {
    const transientErr = Object.assign(new Error('boom'), {
      code: 'functions/unavailable',
    })
    mockCallable
      .mockRejectedValueOnce(transientErr)
      .mockResolvedValueOnce({ data: happyResult })

    const { result } = renderHook(() => useTranscription())

    let value: unknown
    await act(async () => {
      value = await result.current.transcribe(makeBlob(), {
        sourceSurface: 'generate-chat',
        childId: 'child-1',
      })
    })

    expect(value).toEqual(happyResult)
    expect(mockCallable).toHaveBeenCalledTimes(2)
  })

  it('returns null and sets error on persistent failure (non-transient)', async () => {
    const fatalErr = Object.assign(new Error('nope'), {
      code: 'functions/permission-denied',
      message: 'Not allowed',
    })
    mockCallable.mockRejectedValueOnce(fatalErr)

    const { result } = renderHook(() => useTranscription())

    let value: unknown
    await act(async () => {
      value = await result.current.transcribe(makeBlob(), {
        sourceSurface: 'generate-chat',
        childId: 'child-1',
      })
    })

    expect(value).toBeNull()
    expect(result.current.error).toBe('Not allowed')
    expect(mockCallable).toHaveBeenCalledTimes(1)
  })

  it('updateFinalText writes to the correct Firestore path', async () => {
    mockCallable.mockResolvedValueOnce({ data: happyResult })

    const { result } = renderHook(() => useTranscription())

    await act(async () => {
      await result.current.transcribe(makeBlob(), {
        sourceSurface: 'generate-chat',
        childId: 'child-1',
      })
    })

    await act(async () => {
      await result.current.updateFinalText('event-1', 'Edited final text')
    })

    expect(mockDoc).toHaveBeenCalledWith(
      { __db: true },
      'families/fam-1/children/child-1/transcriptionEvents/event-1',
    )
    expect(mockUpdateDoc).toHaveBeenCalledWith(mockDocRef, {
      finalText: 'Edited final text',
    })
    void mockDocRef
  })

  it('passes replacesEventId through to the callable when provided', async () => {
    mockCallable.mockResolvedValueOnce({ data: happyResult })
    const { result } = renderHook(() => useTranscription())

    await act(async () => {
      await result.current.transcribe(makeBlob(), {
        sourceSurface: 'generate-chat',
        childId: 'child-1',
        replacesEventId: 'prior-event',
      })
    })

    const req = mockCallable.mock.calls[0][0] as Record<string, unknown>
    expect(req.replacesEventId).toBe('prior-event')
  })
})
