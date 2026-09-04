import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * FEAT-191 — what the Generate chat does with the parent's per-story stretch.
 *
 * Three things: it reaches `generateStory`, it is recorded ON the book (so a
 * resume and every later revise stay at the level the book was written at), and
 * a revise sends the book — never a level.
 */

const { chatMock, generateImageMock, addDocMock, getDocMock, setDocMock } = vi.hoisted(() => ({
  chatMock: vi.fn(),
  generateImageMock: vi.fn(),
  // Loosely typed on purpose: each test hands these a different document shape,
  // and inferring the signature from the default would pin the first one.
  addDocMock: vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(),
  getDocMock: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  setDocMock: vi.fn<(...args: unknown[]) => Promise<void>>(),
}))

vi.mock('../../../core/ai/useAI', () => ({
  useAI: () => ({ chat: chatMock, generateImage: generateImageMock, loading: false, error: null }),
  TaskType: { Chat: 'chat' },
}))

vi.mock('../../../core/firebase/firestore', () => ({
  booksCollection: () => ({ __collection: 'books' }),
}))

vi.mock('firebase/firestore', () => ({
  addDoc: addDocMock,
  doc: vi.fn(() => ({ __ref: true })),
  getDoc: getDocMock,
  setDoc: setDocMock,
}))

vi.mock('../bookThemeInference', () => ({ inferBookTheme: () => 'fantasy' }))
vi.mock('../bookTypes', () => ({
  generatePageId: () => 'page-id',
  generateImageId: () => 'image-id',
}))

vi.mock('../useSightWordProgress', () => ({
  useSightWordProgress: () => ({
    progressMap: new Map(),
    allProgress: [],
    loading: false,
    recordInteraction: vi.fn(),
    confirmMastery: vi.fn(),
    getWeakWords: () => [],
  }),
}))

vi.mock('../useBookArtQuota', () => ({
  useBookArtQuota: () => ({
    count: 0,
    limit: 25,
    remaining: Infinity,
    atLimit: false,
    recordGeneration: vi.fn(async () => undefined),
  }),
  recordBookArtGeneration: () => undefined,
}))

import { useBookGenerateChat } from '../useBookGenerateChat'

const baseOpts = {
  familyId: 'family-1',
  childId: 'child-1',
  childName: 'Lincoln',
  childAge: 10,
  initialPageCount: 6,
  defaultIllustrationStyle: 'minecraft',
}

const STORY = {
  title: 'The Ship',
  pages: [{ pageNumber: 1, text: 'The ship is black.', sceneDescription: 'a dock' }],
}

beforeEach(() => {
  chatMock.mockReset()
  generateImageMock.mockReset()
  addDocMock.mockReset().mockResolvedValue({ id: 'book-new' })
  getDocMock.mockReset().mockResolvedValue({ exists: () => false } as unknown)
  setDocMock.mockReset().mockResolvedValue(undefined)
})

/** The parsed JSON payload of the `n`-th `chat()` call. */
function payloadOf(n: number): Record<string, unknown> {
  return JSON.parse(chatMock.mock.calls[n][0].messages[0].content)
}

describe('useBookGenerateChat — the per-story stretch (FEAT-191)', () => {
  it('starts every fresh draft at the child’s own level', () => {
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))
    expect(result.current.levelStretch).toBe(0)
  })

  it('sends the picked stretch to generateStory', async () => {
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(STORY) })
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a ship')
    })
    act(() => {
      result.current.setLevelStretch(1)
    })
    await act(async () => {
      await result.current.confirmStartStory()
    })

    expect(payloadOf(0).levelStretch).toBe(1)
  })

  it('sends 0 when the parent picked nothing — the pre-FEAT-191 request', async () => {
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(STORY) })
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a ship')
    })
    await act(async () => {
      await result.current.confirmStartStory()
    })

    expect(payloadOf(0).levelStretch).toBe(0)
  })

  it('records the stretch on the book, so the book says what it was written as', async () => {
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(STORY) })
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    act(() => {
      result.current.setLevelStretch(2)
    })
    await act(async () => {
      await result.current.sendKidMessage('a ship')
    })

    const created = addDocMock.mock.calls[0][1] as {
      generationConfig?: { levelStretch?: number }
    }
    expect(created.generationConfig?.levelStretch).toBe(2)
  })

  it('WRITES a change once a draft exists — the dialog can close with no handler running', async () => {
    // Codex P2 on PR #1763. Sending the first message creates the draft at the
    // child's own level; picking "One step up" afterwards used to update React
    // state only, so dismissing the enclosing dialog by its backdrop or Escape
    // (neither of which runs a handler here) lost the choice, and resuming
    // generated at the wrong level.
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a ship')
    })
    setDocMock.mockClear()

    act(() => {
      result.current.setLevelStretch(1)
    })

    await waitFor(() => expect(setDocMock).toHaveBeenCalled())
    const [, payload, options] = setDocMock.mock.calls[0] as [
      unknown,
      { generationConfig?: { levelStretch?: number } },
      { merge?: boolean },
    ]
    expect(payload.generationConfig?.levelStretch).toBe(1)
    // Narrow: a merge write that touches this one field and leaves the words,
    // the page count and the idea alone.
    expect(options?.merge).toBe(true)
    expect(Object.keys(payload)).toEqual(['generationConfig'])
    expect(Object.keys(payload.generationConfig ?? {})).toEqual(['levelStretch'])
  })

  it('writes nothing before a draft exists — the first persist carries it', async () => {
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))
    act(() => {
      result.current.setLevelStretch(2)
    })
    expect(setDocMock).not.toHaveBeenCalled()
    expect(result.current.levelStretch).toBe(2)
  })

  it('restores the stretch a resumed draft was generated with', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({
        title: 'The Ship',
        pages: [],
        generationConfig: { words: [], pageCount: 6, levelStretch: 1 },
        reviewState: { chatHistory: [], clarificationPhase: 'clarifying', pendingIdea: 'a ship' },
      }),
    } as unknown)

    const { result } = renderHook(() =>
      useBookGenerateChat({ ...baseOpts, resumeBookId: 'book-1' }),
    )

    await waitFor(() => expect(result.current.levelStretch).toBe(1))
  })

  it('leaves a resumed draft with no stretch on record at the child’s own level', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({
        title: 'The Ship',
        pages: [],
        generationConfig: { words: ['cat'], pageCount: 6 },
        reviewState: { chatHistory: [], clarificationPhase: 'clarifying', pendingIdea: 'a ship' },
      }),
    } as unknown)

    const { result } = renderHook(() =>
      useBookGenerateChat({ ...baseOpts, resumeBookId: 'book-1' }),
    )

    await waitFor(() => expect(result.current.pendingIdea).toBe('a ship'))
    expect(result.current.levelStretch).toBe(0)
  })

  it('sends the BOOK to a revise, never a level — the server reads the record', async () => {
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(STORY) })
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    act(() => {
      result.current.setLevelStretch(1)
    })
    await act(async () => {
      await result.current.sendKidMessage('a ship')
    })
    await act(async () => {
      await result.current.confirmStartStory()
    })

    chatMock.mockResolvedValueOnce({
      message: JSON.stringify({ humanResponse: 'ok', storyUpdated: false }),
    })
    await act(async () => {
      await result.current.sendKidMessage('make it more exciting')
    })

    const revise = payloadOf(1)
    expect(revise.bookId).toBe('book-new')
    expect(revise).not.toHaveProperty('levelStretch')
  })
})
