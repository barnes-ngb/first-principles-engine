import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useScan } from './useScan'

/**
 * UX-277 / UX-278 — the format a scan DECLARES must be the format it SENDS.
 *
 * `compressImage` renders to a canvas and re-encodes to JPEG, so a compressed
 * PNG is JPEG bytes. The wrapper used to re-tag those bytes with the INPUT
 * file's type, and `inferMediaType` guessed `image/jpeg` for anything it did
 * not recognise — so a large PNG was sent as "PNG bytes that are really JPEG"
 * and a HEIC was sent as "JPEG" and both were refused by the vision API as
 * corrupt. These tests pin the declared type to the bytes actually uploaded.
 */

const uploadedBlobs: Blob[] = []

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(() => Promise.resolve({ id: 'scan-1' })),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}))

vi.mock('../firebase/firestore', () => ({
  scansCollection: vi.fn(() => ({ __key: 'scans' })),
}))

vi.mock('../firebase/storage', () => ({ storage: {} }))

vi.mock('firebase/storage', () => ({
  ref: vi.fn(() => ({})),
  uploadBytes: vi.fn((_ref: unknown, blob: Blob) => {
    uploadedBlobs.push(blob)
    return Promise.resolve()
  }),
  getDownloadURL: vi.fn(() => Promise.resolve('https://x/scan.jpg')),
}))

const compressIfNeededMock = vi.fn()
const compressImageMock = vi.fn()
vi.mock('../utils/compressImage', () => ({
  compressIfNeeded: (...args: unknown[]) => compressIfNeededMock(...args),
  compressImage: (...args: unknown[]) => compressImageMock(...args),
}))

const chatMock = vi.fn()
vi.mock('../ai/useAI', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ai/useAI')>()
  return { ...actual, useAI: () => ({ chat: chatMock }) }
})

const okResults = {
  pageType: 'worksheet',
  subject: 'math',
  specificTopic: '',
  skillsTargeted: [],
  estimatedDifficulty: 'appropriate',
  recommendation: 'do',
  recommendationReason: '',
  estimatedMinutes: 20,
  teacherNotes: '',
  curriculumDetected: null,
}

/** The mediaType the hook declared on the vision call. */
function declaredMediaType(): string | undefined {
  const payload = chatMock.mock.calls[0]?.[0] as
    | { messages: { content: string }[] }
    | undefined
  if (!payload) return undefined
  return (JSON.parse(payload.messages[0].content) as { mediaType?: string }).mediaType
}

beforeEach(() => {
  uploadedBlobs.length = 0
  chatMock.mockReset()
  chatMock.mockResolvedValue({ message: JSON.stringify(okResults) })
  compressIfNeededMock.mockReset()
  compressImageMock.mockReset()
})
afterEach(() => vi.clearAllMocks())

describe('useScan — UX-277: the compressed image is labelled as what it now is', () => {
  it('declares JPEG when a large PNG was re-encoded to JPEG', async () => {
    // compressIfNeeded returns a Blob (not a File) of JPEG bytes.
    compressIfNeededMock.mockResolvedValue(new Blob(['jpeg-bytes'], { type: 'image/jpeg' }))
    const { result } = renderHook(() => useScan())

    await act(async () => {
      await result.current.scan(
        new File(['png'], 'page.png', { type: 'image/png' }),
        'fam',
        'child-1',
      )
    })

    expect(declaredMediaType()).toBe('image/jpeg')
    expect(uploadedBlobs[0]?.type).toBe('image/jpeg')
    expect(result.current.error).toBeNull()
  })

  it('leaves a small PNG alone — bytes and label both stay PNG', async () => {
    const png = new File(['png'], 'page.png', { type: 'image/png' })
    compressIfNeededMock.mockResolvedValue(png) // under the threshold: unchanged
    const { result } = renderHook(() => useScan())

    await act(async () => {
      await result.current.scan(png, 'fam', 'child-1')
    })

    expect(declaredMediaType()).toBe('image/png')
    expect(compressImageMock).not.toHaveBeenCalled()
    expect(result.current.error).toBeNull()
  })

  it('a JPEG photo is unchanged end to end', async () => {
    const jpg = new File(['jpg'], 'page.jpg', { type: 'image/jpeg' })
    compressIfNeededMock.mockResolvedValue(jpg)
    const { result } = renderHook(() => useScan())

    await act(async () => {
      await result.current.scan(jpg, 'fam', 'child-1')
    })

    expect(declaredMediaType()).toBe('image/jpeg')
    expect(result.current.error).toBeNull()
  })
})
