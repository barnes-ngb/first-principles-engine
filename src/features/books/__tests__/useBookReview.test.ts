import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────

const { chatMock, illustrateMock, speakMock, cancelMock, getDocMock, setDocMock } =
  vi.hoisted(() => ({
    chatMock: vi.fn(),
    illustrateMock: vi.fn(async () => ({ failedPages: [] })),
    speakMock: vi.fn(),
    cancelMock: vi.fn(),
    getDocMock: vi.fn(),
    setDocMock: vi.fn(),
  }))

// Mutable TTS speaking flag the tests can flip + rerender to drive end-detection.
let ttsSpeaking = false

// In-memory persisted book doc so getDoc reflects setDoc writes (the hook
// re-reads the doc after a background image regen).
let persisted: Record<string, unknown> | null = null

vi.mock('../../../core/ai/useAI', () => ({
  useAI: () => ({ chat: chatMock, generateImage: vi.fn(), loading: false, error: null }),
  TaskType: { RevisePage: 'revisePage' },
}))

vi.mock('../useBookIllustrator', () => ({
  useBookIllustrator: () => ({ illustrate: illustrateMock }),
}))

vi.mock('../../../core/hooks/useTTS', () => ({
  useTTS: () => ({
    speak: (t: string) => {
      ttsSpeaking = true
      speakMock(t)
    },
    speakQueue: vi.fn(),
    cancel: () => {
      ttsSpeaking = false
      cancelMock()
    },
    isSpeaking: ttsSpeaking,
    isSupported: true,
  }),
}))

vi.mock('../../../core/firebase/firestore', () => ({
  booksCollection: () => ({ __collection: 'books' }),
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ __ref: true })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
}))

// ── Subject under test ──────────────────────────────────────────

import { useBookReview, firstUnreviewedIndex, parseRevisePageResult } from '../useBookReview'
import type { Book } from '../../../core/types'

// ── Fixtures ─────────────────────────────────────────────────────

function makeBook(overrides?: Partial<Book>): Book {
  const now = '2026-05-29T00:00:00.000Z'
  return {
    id: 'book-1',
    childId: 'child-1',
    title: 'Ember the Dragon',
    coverStyle: 'storybook',
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    subjectBuckets: ['LanguageArts'],
    source: 'ai-generated',
    bookType: 'generated',
    theme: 'fantasy',
    pages: [
      {
        id: 'p1',
        pageNumber: 1,
        text: 'Ember could not fly.',
        images: [{ id: 'i1', url: 'u1', type: 'ai-generated', prompt: 'scene 1' }],
        layout: 'image-top',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'p2',
        pageNumber: 2,
        text: 'She flapped her wings.',
        images: [{ id: 'i2', url: 'u2', type: 'ai-generated', prompt: 'scene 2' }],
        layout: 'image-top',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'p3',
        pageNumber: 3,
        text: 'A wise owl helped her.',
        images: [{ id: 'i3', url: 'u3', type: 'ai-generated', prompt: 'scene 3' }],
        layout: 'image-top',
        createdAt: now,
        updatedAt: now,
      },
    ],
    ...overrides,
  }
}

function mockBookDoc(book: Book) {
  persisted = book as unknown as Record<string, unknown>
  getDocMock.mockImplementation(async () => ({
    exists: () => persisted !== null,
    id: book.id,
    data: () => persisted,
  }))
  // Merge writes into the in-memory doc so reloads see the latest state.
  setDocMock.mockImplementation(async (_ref: unknown, data: Record<string, unknown>) => {
    persisted = { ...(persisted ?? {}), ...data }
    return undefined
  })
}

const baseOpts = {
  familyId: 'family-1',
  bookId: 'book-1',
  childName: 'London',
  childAge: 6,
}

async function renderLoaded(book: Book) {
  mockBookDoc(book)
  const hook = renderHook(() => useBookReview(baseOpts))
  // Flush the async load effect.
  await act(async () => {
    await Promise.resolve()
  })
  return hook
}

beforeEach(() => {
  vi.clearAllMocks()
  ttsSpeaking = false
  persisted = null
  illustrateMock.mockResolvedValue({ failedPages: [] })
})

// ── Pure helpers ─────────────────────────────────────────────────

describe('firstUnreviewedIndex', () => {
  it('returns the first index whose pageNumber is not reviewed', () => {
    const pages = [{ pageNumber: 1 }, { pageNumber: 2 }, { pageNumber: 3 }]
    expect(firstUnreviewedIndex(pages, [])).toBe(0)
    expect(firstUnreviewedIndex(pages, [1, 2])).toBe(2)
    expect(firstUnreviewedIndex(pages, [1, 2, 3])).toBe(-1)
  })
})

describe('parseRevisePageResult', () => {
  it('parses clean JSON and defaults bad regenerateImage to "no"', () => {
    const out = parseRevisePageResult(
      JSON.stringify({ newText: 'hi', newSceneDescription: 's', regenerateImage: 'maybe' }),
    )
    expect(out?.newText).toBe('hi')
    expect(out?.regenerateImage).toBe('no')
  })
  it('returns null on malformed JSON', () => {
    expect(parseRevisePageResult('not json')).toBeNull()
  })
})

// ── Hook behavior ────────────────────────────────────────────────

describe('useBookReview', () => {
  it('initial load: phase idle, currentPage = first unreviewed page', async () => {
    const { result } = await renderLoaded(makeBook())
    expect(result.current.book?.id).toBe('book-1')
    expect(result.current.phase).toBe('idle')
    expect(result.current.currentPageIndex).toBe(0)
    expect(result.current.currentPage?.pageNumber).toBe(1)
    expect(result.current.totalPages).toBe(3)
  })

  it('resumes at the first unreviewed page when some are reviewed', async () => {
    const { result } = await renderLoaded(
      makeBook({ reviewState: { reviewedPages: [1, 2] } }),
    )
    expect(result.current.currentPageIndex).toBe(2)
    expect(result.current.currentPage?.pageNumber).toBe(3)
    expect(result.current.reviewedCount).toBe(2)
  })

  it('a book with completedAt set loads straight into the completed phase', async () => {
    const { result } = await renderLoaded(
      makeBook({ reviewState: { completedAt: '2026-05-28T00:00:00.000Z' } }),
    )
    expect(result.current.phase).toBe('completed')
  })

  it('playCurrentPage transitions idle → playing → awaiting', async () => {
    const { result, rerender } = await renderLoaded(makeBook())
    await act(async () => {
      await result.current.playCurrentPage()
    })
    expect(result.current.phase).toBe('playing')
    expect(speakMock).toHaveBeenCalled()
    // Simulate TTS finishing.
    await act(async () => {
      ttsSpeaking = false
      rerender()
    })
    expect(result.current.phase).toBe('awaiting')
  })

  it('approveCurrentPage adds the page to reviewedPages, advances, and persists', async () => {
    const { result } = await renderLoaded(makeBook())
    await act(async () => {
      await result.current.approveCurrentPage()
    })
    expect(result.current.book?.reviewState?.reviewedPages).toEqual([1])
    expect(result.current.currentPageIndex).toBe(1)
    expect(setDocMock).toHaveBeenCalled()
  })

  it('approveCurrentPage on the last page completes the review and sets completedAt', async () => {
    const { result } = await renderLoaded(
      makeBook({ reviewState: { reviewedPages: [1, 2] } }),
    )
    expect(result.current.currentPageIndex).toBe(2)
    await act(async () => {
      await result.current.approveCurrentPage()
    })
    expect(result.current.phase).toBe('completed')
    expect(result.current.book?.reviewState?.completedAt).toBeTruthy()
  })

  it('reviseCurrentPage (regenerateImage=no): updates text, no image regen, returns to playing', async () => {
    chatMock.mockResolvedValue({
      message: JSON.stringify({
        newText: 'Ember could not fly yet.',
        newSceneDescription: 'scene 1',
        wordsOnPage: ['could', 'not'],
        regenerateImage: 'no',
      }),
    })
    const { result } = await renderLoaded(makeBook())
    await act(async () => {
      await result.current.reviseCurrentPage('fix the typo')
    })
    // revisePage was called with the right task + payload shape.
    expect(chatMock).toHaveBeenCalledTimes(1)
    const arg = chatMock.mock.calls[0][0] as { taskType: string; messages: { content: string }[] }
    expect(arg.taskType).toBe('revisePage')
    const payload = JSON.parse(arg.messages[0].content)
    expect(payload.pageNumber).toBe(1)
    expect(payload.fullStoryContext.allPages).toHaveLength(3)
    expect(payload.childCalibration.childName).toBe('London')
    // Text updated; no illustrate; back to playing.
    expect(result.current.book?.pages[0].text).toBe('Ember could not fly yet.')
    expect(illustrateMock).not.toHaveBeenCalled()
    expect(result.current.book?.reviewState?.revisedPages).toEqual([1])
    expect(result.current.phase).toBe('playing')
  })

  it('reviseCurrentPage (regenerateImage=yes): updates text AND triggers image regen', async () => {
    chatMock.mockResolvedValue({
      message: JSON.stringify({
        newText: 'Sparkle could not fly.',
        newSceneDescription: 'a sparkly girl dragon',
        wordsOnPage: ['could', 'not'],
        regenerateImage: 'yes',
      }),
    })
    const { result } = await renderLoaded(makeBook())
    await act(async () => {
      await result.current.reviseCurrentPage('make the dragon a girl named Sparkle')
    })
    expect(result.current.book?.pages[0].text).toBe('Sparkle could not fly.')
    expect(illustrateMock).toHaveBeenCalledTimes(1)
    const illustrateArg = (illustrateMock.mock.calls[0] as unknown as unknown[])[0] as {
      pages: { pageNumber: number; sceneDescription: string }[]
    }
    // Only the target page (index 0) carries a scene description.
    expect(illustrateArg.pages[0].sceneDescription).toBe('a sparkly girl dragon')
    expect(illustrateArg.pages[1].sceneDescription).toBe('')
  })

  it('reviseCurrentPage failure: phase returns to awaiting and error is set', async () => {
    chatMock.mockResolvedValue({ message: 'totally not json' })
    const { result } = await renderLoaded(makeBook())
    await act(async () => {
      await result.current.reviseCurrentPage('change something')
    })
    expect(result.current.phase).toBe('awaiting')
    expect(result.current.error).toBeTruthy()
    expect(illustrateMock).not.toHaveBeenCalled()
  })

  it('skipRemaining sets completedAt without modifying reviewedPages', async () => {
    const { result } = await renderLoaded(makeBook())
    await act(async () => {
      await result.current.skipRemaining()
    })
    expect(result.current.phase).toBe('completed')
    expect(result.current.book?.reviewState?.completedAt).toBeTruthy()
    expect(result.current.book?.reviewState?.reviewedPages ?? []).toEqual([])
  })

  it('gotoPage jumps to the given page', async () => {
    const { result } = await renderLoaded(makeBook())
    await act(async () => {
      await result.current.gotoPage(2)
    })
    expect(result.current.currentPageIndex).toBe(2)
    expect(result.current.currentPage?.pageNumber).toBe(3)
  })
})
