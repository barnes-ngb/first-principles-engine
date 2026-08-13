import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useScan } from './useScan'

// ── Boundary mocks ──────────────────────────────────────────────────────────
const addDocCalls: Record<string, unknown>[] = []

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn((_col: unknown, data: Record<string, unknown>) => {
    addDocCalls.push(data)
    return Promise.resolve({ id: 'scan-1' })
  }),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}))

vi.mock('../firebase/firestore', () => ({
  scansCollection: vi.fn(() => ({ __key: 'scans' })),
}))

vi.mock('../firebase/storage', () => ({ storage: {} }))

vi.mock('firebase/storage', () => ({
  ref: vi.fn(() => ({})),
  uploadBytes: vi.fn(() => Promise.resolve()),
  getDownloadURL: vi.fn(() => Promise.resolve('https://x/scan.jpg')),
}))

vi.mock('../utils/compressImage', () => ({
  compressIfNeeded: vi.fn((file: File) => Promise.resolve(file)),
}))

const chatMock = vi.fn()
vi.mock('../ai/useAI', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ai/useAI')>()
  return { ...actual, useAI: () => ({ chat: chatMock }) }
})

// jsdom's FileReader handles readAsDataURL, so `fileToBase64` works unmocked.
const file = () => new File(['x'], 'page.jpg', { type: 'image/jpeg' })

const worksheetResults = {
  pageType: 'worksheet',
  subject: 'math',
  specificTopic: 'elapsed time',
  skillsTargeted: [],
  estimatedDifficulty: 'appropriate',
  recommendation: 'do',
  recommendationReason: '',
  estimatedMinutes: 20,
  teacherNotes: '',
  curriculumDetected: {
    provider: 'gatb',
    name: 'GATB Math 3',
    lessonNumber: null,
    pageNumber: 73,
    levelDesignation: null,
  },
}

beforeEach(() => {
  addDocCalls.length = 0
  chatMock.mockReset()
})
afterEach(() => vi.clearAllMocks())

// FEAT-141: a scan's note is DERIVED from the analysis the scan already
// produced. No second AI call, ever — the assertions below pin the call count
// as tightly as they pin the note.
describe('useScan — FEAT-141 content note on the scan doc', () => {
  it('derives the note from the results it just stored, with one AI call', async () => {
    chatMock.mockResolvedValue({ message: JSON.stringify(worksheetResults) })

    const { result } = renderHook(() => useScan())
    await act(async () => {
      await result.current.scan(file(), 'fam-1', 'child-1')
    })

    expect(chatMock).toHaveBeenCalledTimes(1)
    expect(addDocCalls[0].contentNote).toBe('GATB Math 3 p.73 — elapsed time')
  })

  it('sends the capture context on the same call when the caller has one', async () => {
    chatMock.mockResolvedValue({ message: JSON.stringify(worksheetResults) })

    const { result } = renderHook(() => useScan())
    await act(async () => {
      await result.current.scan(file(), 'fam-1', 'child-1', {
        itemLabel: 'GATB Math',
        subjectBucket: 'Math',
      })
    })

    const sent = JSON.parse(chatMock.mock.calls[0][0].messages[0].content)
    expect(sent.captureContext).toEqual({ itemLabel: 'GATB Math', subjectBucket: 'Math' })
    expect(chatMock).toHaveBeenCalledTimes(1)
  })

  it('omits the capture context entirely when the caller has none', async () => {
    chatMock.mockResolvedValue({ message: JSON.stringify(worksheetResults) })

    const { result } = renderHook(() => useScan())
    await act(async () => {
      await result.current.scan(file(), 'fam-1', 'child-1')
    })

    const sent = JSON.parse(chatMock.mock.calls[0][0].messages[0].content)
    expect('captureContext' in sent).toBe(false)
  })

  it('writes no note field when the analysis identified nothing', async () => {
    chatMock.mockResolvedValue({
      message: JSON.stringify({ ...worksheetResults, subject: '', specificTopic: '', curriculumDetected: null }),
    })

    const { result } = renderHook(() => useScan())
    await act(async () => {
      await result.current.scan(file(), 'fam-1', 'child-1')
    })

    // The scan doc is still written — the note is the only thing missing.
    expect(addDocCalls).toHaveLength(1)
    expect('contentNote' in addDocCalls[0]).toBe(false)
  })

  it('writes no note field when the response was not parseable JSON', async () => {
    chatMock.mockResolvedValue({ message: 'the model said something else' })

    const { result } = renderHook(() => useScan())
    await act(async () => {
      await result.current.scan(file(), 'fam-1', 'child-1')
    })

    expect(addDocCalls).toHaveLength(1)
    expect('contentNote' in addDocCalls[0]).toBe(false)
    expect(addDocCalls[0].results).toBeNull()
  })
})
