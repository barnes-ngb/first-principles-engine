import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks: keep the upload flow in-process, drive only the two seams that
//    matter (Storage upload + the CF `chat` call). (FEAT-61) ────────────────

const chatMock = vi.fn()
const uploadBytesMock = vi.fn(async () => {})

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  setDoc: vi.fn(async () => {}),
}))
vi.mock('firebase/storage', () => ({
  getDownloadURL: vi.fn(async () => 'https://example.com/x.jpg'),
  ref: vi.fn(() => ({})),
  uploadBytes: (...args: unknown[]) => uploadBytesMock(...(args as [])),
}))
vi.mock('../../core/firebase/firestore', () => ({
  learnerModelsCollection: vi.fn(() => ({})),
  learnerReviewSessionsCollection: vi.fn(() => ({})),
}))
vi.mock('../../core/firebase/storage', () => ({ storage: {} }))
vi.mock('../../core/utils/downscaleImage', () => ({
  downscaleImage: vi.fn(async (f: unknown) => f),
}))
vi.mock('../../core/ai/useAI', () => ({
  TaskType: { FoundationsReview: 'foundationsReview' },
  useAI: () => ({ chat: chatMock }),
}))

import { useFoundationsReview } from './useFoundationsReview'
import { UploadTimeoutError } from './uploadTimeout'

const ARGS = { familyId: 'fam-1', childId: 'c1', childName: 'Lincoln', domain: 'reading' as const }
const photo = () => new File([new Uint8Array(8)], 'p.jpg', { type: 'image/jpeg' })

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})
beforeEach(() => {
  uploadBytesMock.mockImplementation(async () => {})
})

describe('useFoundationsReview.uploadImages', () => {
  it('clears the spinner and returns true on success', async () => {
    chatMock.mockResolvedValue({ message: 'Got it.' })
    const { result } = renderHook(() => useFoundationsReview(ARGS))

    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.uploadImages([photo()], 'these are Fast Phonics')
    })
    expect(ok).toBe(true)
    expect(result.current.uploading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('a Storage failure clears state with the prepare-class message (no CF call)', async () => {
    uploadBytesMock.mockRejectedValueOnce(new Error('storage down'))
    const { result } = renderHook(() => useFoundationsReview(ARGS))

    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.uploadImages([photo()], 'a spelling page')
    })
    expect(ok).toBe(false)
    expect(result.current.uploading).toBe(false)
    expect(chatMock).not.toHaveBeenCalled()
    expect(result.current.error).toMatch(/prepare those photos/i)
  })

  it('a server non-response clears state with the server-class message', async () => {
    chatMock.mockResolvedValue(null)
    const { result } = renderHook(() => useFoundationsReview(ARGS))

    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.uploadImages([photo()], 'these are Fast Phonics')
    })
    expect(ok).toBe(false)
    expect(result.current.uploading).toBe(false)
    expect(result.current.error).toMatch(/hit a problem/i)
  })

  it('a timed-out extraction clears state with the timeout message', async () => {
    // chat never settles → the 120s ceiling fires.
    chatMock.mockImplementation(() => new Promise(() => {}))
    vi.useFakeTimers()
    const { result } = renderHook(() => useFoundationsReview(ARGS))

    let done: Promise<boolean>
    await act(async () => {
      done = result.current.uploadImages([photo()], 'these are Fast Phonics')
      // let the Storage-upload microtasks flush before the timer advances
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(120_000)
    })
    await expect(done!).resolves.toBe(false)
    expect(result.current.uploading).toBe(false)
    expect(result.current.error).toMatch(/too long/i)
  })

  it('caps a large batch to at most MAX_UPLOAD_PHOTOS uploads', async () => {
    chatMock.mockResolvedValue({ message: 'ok' })
    const { result } = renderHook(() => useFoundationsReview(ARGS))
    await act(async () => {
      await result.current.uploadImages([photo(), photo(), photo(), photo(), photo(), photo()], 'ctx')
    })
    expect(uploadBytesMock).toHaveBeenCalledTimes(4)
  })
})

// A direct sanity check that the timeout error type is what runTurn catches.
describe('UploadTimeoutError', () => {
  it('is an Error subclass named UploadTimeoutError', () => {
    const e = new UploadTimeoutError()
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('UploadTimeoutError')
  })
})
