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

// The daily art budget (FEAT-168). Mocked so these tests can set a remaining
// balance without a ProfileProvider; `Infinity` is the uncapped (parent) value
// and the default here, so every pre-existing assertion is unchanged.
const { budget, recordGenerationMock } = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  return {
    budget: {
      remaining: Infinity as number,
      /** Stand-in for the counter's `onSnapshot` landing a new value. */
      set(next: number) {
        this.remaining = next
        listeners.forEach((fn) => fn())
      },
      subscribe(fn: () => void) {
        listeners.add(fn)
        return () => listeners.delete(fn)
      },
    },
    recordGenerationMock: vi.fn(async () => undefined),
  }
})
vi.mock('./useBookArtQuota', async () => {
  const { useSyncExternalStore } = await vi.importActual<typeof import('react')>('react')
  return {
    useBookArtQuota: () => ({
      count: 0,
      limit: 25,
      // Subscribed, not snapshotted, so a mid-loop `budget.set()` reaches the
      // hook the way the real counter's `onSnapshot` would.
      remaining: useSyncExternalStore(
        (fn: () => void) => budget.subscribe(fn),
        () => budget.remaining,
      ),
      atLimit: false,
      recordGeneration: recordGenerationMock,
    }),
    recordBookArtGeneration: (record?: () => Promise<void>) => {
      if (record) void record()
    },
  }
})

import { canAffordNextPage, pagesNeedingIllustration, useBookIllustrator } from './useBookIllustrator'
import type { IllustrationProgress } from './useBookIllustrator'

beforeEach(() => {
  generateImageMock.mockReset()
  recordGenerationMock.mockReset()
  recordGenerationMock.mockResolvedValue(undefined)
  budget.set(Infinity)
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

// ── The daily art budget (FEAT-168) ─────────────────────────────
//
// A book spends one paid call **per page**, so the batch is the one place in
// the app where "refuse before spending" is not a single check. These pin the
// two rules that follow from that: reserve the whole book up front, and count
// N, never 1.

describe('pagesNeedingIllustration', () => {
  it('counts only the pages that will actually cost a call', () => {
    expect(
      pagesNeedingIllustration([
        { pageNumber: 1, sceneDescription: 'a field' },
        { pageNumber: 2, sceneDescription: '' },
        { pageNumber: 3, sceneDescription: 'a hill' },
      ]),
    ).toEqual([1, 3])
  })

  it('a book with no scene descriptions costs nothing', () => {
    expect(
      pagesNeedingIllustration([
        { pageNumber: 1, sceneDescription: '' },
        { pageNumber: 2, sceneDescription: '' },
      ]),
    ).toEqual([])
  })
})

describe('canAffordNextPage', () => {
  it('spends down the reservation this book made', () => {
    expect(canAffordNextPage(6, 5, 6)).toBe(true)
    expect(canAffordNextPage(6, 6, 6)).toBe(false)
  })

  it('stops on the live counter when another device spends first', () => {
    // Reserved 6, spent 1 — but the counter says the day is gone.
    expect(canAffordNextPage(6, 1, 0)).toBe(false)
  })

  it('does not hold our own counted writes against us twice', () => {
    // Reserved 6, spent 2, and both writes have landed (live 4). Still 4 left.
    expect(canAffordNextPage(6, 2, 4)).toBe(true)
  })

  it('a parent is never stopped', () => {
    expect(canAffordNextPage(Infinity, 400, Infinity)).toBe(true)
  })
})

describe('useBookIllustrator — daily art budget (FEAT-168)', () => {
  /** A 6-page book where every page carries a scene. */
  const sixScenePages = Array.from({ length: 6 }, (_, i) => ({
    pageNumber: i + 1,
    sceneDescription: `scene ${i + 1}`,
  }))

  it('refuses the WHOLE book up front when the budget cannot cover its pages — and spends nothing', async () => {
    await makeDocState(6)
    generateImageMock.mockResolvedValue({ url: 'url', storagePath: 'p' })
    // Four left, six pages to illustrate.
    budget.set(4)

    const { result } = renderHook(() => useBookIllustrator())

    let res: Awaited<ReturnType<typeof result.current.illustrate>> | undefined
    await act(async () => {
      res = await result.current.illustrate({
        bookId: 'b1',
        familyId: 'f1',
        style: 'storybook',
        pages: sixScenePages,
      })
    })

    // Not one paid call, and not one counted — a book that stops half
    // illustrated is worse than one that never started.
    expect(generateImageMock).not.toHaveBeenCalled()
    expect(recordGenerationMock).not.toHaveBeenCalled()
    expect(res?.capReached).toBe(true)
    expect(res?.unillustratedPages).toEqual([1, 2, 3, 4, 5, 6])
    expect(res?.failedPages).toEqual([])
  })

  it('reports the refusal through the existing progress channel, so the caller can say so', async () => {
    await makeDocState(6)
    generateImageMock.mockResolvedValue({ url: 'url', storagePath: 'p' })
    budget.set(4)

    const { result } = renderHook(() => useBookIllustrator())
    const events: IllustrationProgress[] = []

    await act(async () => {
      await result.current.illustrate({
        bookId: 'b1',
        familyId: 'f1',
        style: 'storybook',
        pages: sixScenePages,
        onProgress: (p) => events.push(p),
      })
    })

    expect(events).toHaveLength(1)
    expect(events[0].phase).toBe('done')
    expect(events[0].capReached).toBe(true)
  })

  it('a book that fits counts exactly N — one per illustrated page, never 1 per book', async () => {
    await makeDocState(6)
    generateImageMock.mockResolvedValue({ url: 'url', storagePath: 'p' })
    budget.set(6)

    const { result } = renderHook(() => useBookIllustrator())

    let res: Awaited<ReturnType<typeof result.current.illustrate>> | undefined
    await act(async () => {
      res = await result.current.illustrate({
        bookId: 'b1',
        familyId: 'f1',
        style: 'storybook',
        pages: sixScenePages,
      })
    })

    expect(generateImageMock).toHaveBeenCalledTimes(6)
    expect(recordGenerationMock).toHaveBeenCalledTimes(6)
    expect(res?.capReached).toBe(false)
    expect(res?.unillustratedPages).toEqual([])
  })

  it('pages with no scene description are free — they neither cost nor reserve budget', async () => {
    await makeDocState(6)
    generateImageMock.mockResolvedValue({ url: 'url', storagePath: 'p' })
    // Only two of the six pages carry a scene, so a budget of 2 is enough.
    budget.set(2)

    const { result } = renderHook(() => useBookIllustrator())

    let res: Awaited<ReturnType<typeof result.current.illustrate>> | undefined
    await act(async () => {
      res = await result.current.illustrate({
        bookId: 'b1',
        familyId: 'f1',
        style: 'storybook',
        pages: [
          { pageNumber: 1, sceneDescription: '' },
          { pageNumber: 2, sceneDescription: 'a field' },
          { pageNumber: 3, sceneDescription: '' },
          { pageNumber: 4, sceneDescription: '' },
          { pageNumber: 5, sceneDescription: 'a hill' },
          { pageNumber: 6, sceneDescription: '' },
        ],
      })
    })

    expect(generateImageMock).toHaveBeenCalledTimes(2)
    expect(recordGenerationMock).toHaveBeenCalledTimes(2)
    expect(res?.capReached).toBe(false)
  })

  it('a page whose generation fails is not counted', async () => {
    await makeDocState(2)
    generateImageMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ url: 'url-2', storagePath: 'p-2' })
    budget.set(2)

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
      })
    })

    expect(generateImageMock).toHaveBeenCalledTimes(2)
    expect(recordGenerationMock).toHaveBeenCalledTimes(1)
  })

  it('stops the loop when the budget runs out mid-book — keeps what was made, reports the rest', async () => {
    await makeDocState(6)
    generateImageMock.mockResolvedValue({ url: 'url', storagePath: 'p' })
    // Fits at the start; a concurrent sticker on another device then eats the
    // budget, which the live counter reports back mid-loop.
    budget.set(6)

    const { result } = renderHook(() => useBookIllustrator())

    generateImageMock.mockImplementation(async () => {
      // The `onSnapshot` update landing mid-loop: another device spent the rest
      // of the day's budget while this book was being illustrated.
      budget.set(0)
      return { url: 'url', storagePath: 'p' }
    })

    let res: Awaited<ReturnType<typeof result.current.illustrate>> | undefined
    await act(async () => {
      res = await result.current.illustrate({
        bookId: 'b1',
        familyId: 'f1',
        style: 'storybook',
        pages: sixScenePages,
      })
    })

    // Page 1 was generated before the counter moved; the rest are reported,
    // never silently truncated.
    expect(generateImageMock).toHaveBeenCalledTimes(1)
    expect(res?.capReached).toBe(true)
    expect(res?.unillustratedPages).toEqual([2, 3, 4, 5, 6])
  })

  it('a parent is uncapped: a 14-page book runs in full', async () => {
    await makeDocState(14)
    generateImageMock.mockResolvedValue({ url: 'url', storagePath: 'p' })
    budget.set(Infinity)

    const { result } = renderHook(() => useBookIllustrator())

    let res: Awaited<ReturnType<typeof result.current.illustrate>> | undefined
    await act(async () => {
      res = await result.current.illustrate({
        bookId: 'b1',
        familyId: 'f1',
        style: 'storybook',
        pages: Array.from({ length: 14 }, (_, i) => ({
          pageNumber: i + 1,
          sceneDescription: `scene ${i + 1}`,
        })),
      })
    })

    expect(generateImageMock).toHaveBeenCalledTimes(14)
    expect(res?.capReached).toBe(false)
  })

  it('a counter that never settles does not wedge the book (FEAT-167 contract)', async () => {
    await makeDocState(2)
    generateImageMock.mockResolvedValue({ url: 'url', storagePath: 'p' })
    budget.set(2)
    // Offline: a Firestore write resolves only on server ack, so this never
    // settles. The book must finish anyway.
    recordGenerationMock.mockImplementation(() => new Promise<undefined>(() => {}))

    const { result } = renderHook(() => useBookIllustrator())

    let res: Awaited<ReturnType<typeof result.current.illustrate>> | undefined
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

    expect(res?.failedPages).toEqual([])
    expect(generateImageMock).toHaveBeenCalledTimes(2)
  })
})
