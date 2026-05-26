import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { generateImageMock } = vi.hoisted(() => ({
  generateImageMock: vi.fn(),
}))

vi.mock('../../core/ai/useAI', () => ({
  useAI: () => ({
    chat: vi.fn(),
    generateImage: generateImageMock,
    loading: false,
    error: null,
  }),
  TaskType: { Chat: 'chat' },
}))

vi.mock('../../core/firebase/firestore', () => ({
  booksCollection: () => ({ __collection: 'books' }),
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ __ref: true })),
  getDoc: vi.fn(),
  setDoc: vi.fn(async () => undefined),
}))

vi.mock('./bookTypes', () => ({
  generateImageId: () => 'image-id',
}))

import { useBookIllustrator } from './useBookIllustrator'
import type { IllustrationProgress } from './useBookIllustrator'

beforeEach(() => {
  generateImageMock.mockReset()
})

async function makeDocState(pageCount: number) {
  const firestore = await import('firebase/firestore')
  const setDoc = firestore.setDoc as ReturnType<typeof vi.fn>
  const getDoc = firestore.getDoc as ReturnType<typeof vi.fn>
  setDoc.mockReset()
  setDoc.mockResolvedValue(undefined)
  getDoc.mockReset()
  getDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({
      pages: Array.from({ length: pageCount }, () => ({
        images: [],
        layout: 'text-only',
      })),
    }),
  })
  return { setDoc, getDoc }
}

describe('useBookIllustrator', () => {
  it('calls generateImage once per page with a non-empty sceneDescription', async () => {
    await makeDocState(2)
    generateImageMock
      .mockResolvedValueOnce({ url: 'url-1', storagePath: 'p-1' })
      .mockResolvedValueOnce({ url: 'url-2', storagePath: 'p-2' })

    const { result } = renderHook(() => useBookIllustrator())

    await act(async () => {
      await result.current.illustrate({
        bookId: 'b1',
        familyId: 'f1',
        style: 'storybook',
        pages: [
          { pageNumber: 1, sceneDescription: 'a field' },
          { pageNumber: 2, sceneDescription: 'a tree' },
        ],
      })
    })

    expect(generateImageMock).toHaveBeenCalledTimes(2)
  })

  it('skips pages with empty sceneDescription (no generateImage call)', async () => {
    await makeDocState(3)
    generateImageMock.mockResolvedValue({ url: 'url', storagePath: 'p' })

    const { result } = renderHook(() => useBookIllustrator())

    await act(async () => {
      await result.current.illustrate({
        bookId: 'b1',
        familyId: 'f1',
        style: 'storybook',
        pages: [
          { pageNumber: 1, sceneDescription: 'a field' },
          { pageNumber: 2, sceneDescription: '' },
          { pageNumber: 3, sceneDescription: 'a hill' },
        ],
      })
    })

    expect(generateImageMock).toHaveBeenCalledTimes(2)
  })

  it("returns the first page's url as coverImageUrl", async () => {
    await makeDocState(2)
    generateImageMock
      .mockResolvedValueOnce({ url: 'cover-url', storagePath: 'p-1' })
      .mockResolvedValueOnce({ url: 'url-2', storagePath: 'p-2' })

    const { result } = renderHook(() => useBookIllustrator())

    let res: { coverImageUrl?: string; failedPages: number[] } | undefined
    await act(async () => {
      res = await result.current.illustrate({
        bookId: 'b1',
        familyId: 'f1',
        style: 'storybook',
        pages: [
          { pageNumber: 1, sceneDescription: 'a' },
          { pageNumber: 2, sceneDescription: 'b' },
        ],
      })
    })

    expect(res?.coverImageUrl).toBe('cover-url')
    expect(res?.failedPages).toEqual([])
  })

  it('records failedPages when generateImage rejects but continues with remaining pages', async () => {
    await makeDocState(2)
    generateImageMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ url: 'url-2', storagePath: 'p-2' })

    const { result } = renderHook(() => useBookIllustrator())

    let res: { failedPages: number[] } | undefined
    await act(async () => {
      res = await result.current.illustrate({
        bookId: 'b1',
        familyId: 'f1',
        style: 'storybook',
        pages: [
          { pageNumber: 1, sceneDescription: 'a' },
          { pageNumber: 2, sceneDescription: 'b' },
        ],
      })
    })

    expect(generateImageMock).toHaveBeenCalledTimes(2)
    expect(res?.failedPages).toEqual([1])
  })

  it('records failedPages when Firestore setDoc rejects but continues', async () => {
    const { setDoc } = await makeDocState(2)
    setDoc.mockRejectedValueOnce(new Error('write fail')).mockResolvedValue(undefined)
    generateImageMock
      .mockResolvedValueOnce({ url: 'url-1', storagePath: 'p-1' })
      .mockResolvedValueOnce({ url: 'url-2', storagePath: 'p-2' })

    const { result } = renderHook(() => useBookIllustrator())

    let res: { failedPages: number[] } | undefined
    await act(async () => {
      res = await result.current.illustrate({
        bookId: 'b1',
        familyId: 'f1',
        style: 'storybook',
        pages: [
          { pageNumber: 1, sceneDescription: 'a' },
          { pageNumber: 2, sceneDescription: 'b' },
        ],
      })
    })

    expect(generateImageMock).toHaveBeenCalledTimes(2)
    expect(res?.failedPages).toContain(1)
  })

  it('invokes onProgress for each page and once with phase=done', async () => {
    await makeDocState(2)
    generateImageMock.mockResolvedValue({ url: 'u', storagePath: 's' })

    const events: IllustrationProgress[] = []
    const { result } = renderHook(() => useBookIllustrator())

    await act(async () => {
      await result.current.illustrate({
        bookId: 'b1',
        familyId: 'f1',
        style: 'storybook',
        pages: [
          { pageNumber: 1, sceneDescription: 'a' },
          { pageNumber: 2, sceneDescription: 'b' },
        ],
        onProgress: (p) => events.push(p),
      })
    })

    const illustratingEvents = events.filter((e) => e.phase === 'illustrating')
    const doneEvents = events.filter((e) => e.phase === 'done')
    expect(illustratingEvents.length).toBeGreaterThanOrEqual(2)
    expect(illustratingEvents[0].currentPage).toBe(1)
    expect(doneEvents.length).toBe(1)
    expect(doneEvents[0].totalPages).toBe(0)
  })

  it('builds the book-illustration- style prefix from the raw style key', async () => {
    await makeDocState(1)
    generateImageMock.mockResolvedValue({ url: 'u', storagePath: 's' })

    const { result } = renderHook(() => useBookIllustrator())

    await act(async () => {
      await result.current.illustrate({
        bookId: 'b1',
        familyId: 'f1',
        style: 'minecraft',
        pages: [{ pageNumber: 1, sceneDescription: 'creeper' }],
      })
    })

    expect(generateImageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        style: 'book-illustration-minecraft',
      }),
    )
  })

  it('passes bookTheme through as themeId when provided', async () => {
    await makeDocState(1)
    generateImageMock.mockResolvedValue({ url: 'u', storagePath: 's' })

    const { result } = renderHook(() => useBookIllustrator())

    await act(async () => {
      await result.current.illustrate({
        bookId: 'b1',
        familyId: 'f1',
        style: 'storybook',
        bookTheme: 'fantasy',
        pages: [{ pageNumber: 1, sceneDescription: 'a' }],
      })
    })

    expect(generateImageMock.mock.calls[0][0]).toMatchObject({
      themeId: 'fantasy',
    })
  })

  it('omits themeId when bookTheme is not provided', async () => {
    await makeDocState(1)
    generateImageMock.mockResolvedValue({ url: 'u', storagePath: 's' })

    const { result } = renderHook(() => useBookIllustrator())

    await act(async () => {
      await result.current.illustrate({
        bookId: 'b1',
        familyId: 'f1',
        style: 'storybook',
        pages: [{ pageNumber: 1, sceneDescription: 'a' }],
      })
    })

    const arg = generateImageMock.mock.calls[0][0] as Record<string, unknown>
    expect(arg).not.toHaveProperty('themeId')
  })
})
