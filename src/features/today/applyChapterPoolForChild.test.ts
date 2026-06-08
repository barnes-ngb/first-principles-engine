import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BookProgress, ChapterQuestionPoolItem } from '../../core/types'

// ── Mocks ────────────────────────────────────────────────────────
// Mock Firestore + the collection/docId helpers so the create-or-append
// contract is testable without touching real Firebase (per CLAUDE.md).
const doc = vi.fn((...a: unknown[]) => ({ __doc: a }))
const getDoc = vi.fn()
const setDoc = vi.fn()
const updateDoc = vi.fn()
vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => doc(...args),
  getDoc: (...args: unknown[]) => getDoc(...args),
  setDoc: (...args: unknown[]) => setDoc(...args),
  updateDoc: (...args: unknown[]) => updateDoc(...args),
}))

vi.mock('../../core/firebase/firestore', () => ({
  bookProgressCollection: vi.fn(() => ({ __collection: true })),
  bookProgressDocId: (childId: string, bookId: string) => `${childId}_${bookId}`,
}))

import { applyChapterPoolForChild } from './applyChapterPoolForChild'

const book = {
  id: 'lion-witch-wardrobe',
  title: 'The Lion, the Witch and the Wardrobe',
  author: 'C.S. Lewis',
  totalChapters: 17,
}

const item = (chapter: number): ChapterQuestionPoolItem => ({
  chapter,
  questionType: 'comprehension',
  question: `What happens in chapter ${chapter}?`,
  answered: false,
})

beforeEach(() => {
  vi.clearAllMocks()
  setDoc.mockResolvedValue(undefined)
  updateDoc.mockResolvedValue(undefined)
})

describe('applyChapterPoolForChild', () => {
  it('creates a fresh BookProgress when none exists', async () => {
    getDoc.mockResolvedValue({ exists: () => false })

    await applyChapterPoolForChild('fam1', 'london1', book, [item(1), item(2)])

    expect(updateDoc).not.toHaveBeenCalled()
    expect(setDoc).toHaveBeenCalledTimes(1)
    const written = setDoc.mock.calls[0][1] as BookProgress
    expect(written.bookId).toBe(book.id)
    expect(written.childId).toBe('london1')
    expect(written.bookTitle).toBe(book.title)
    expect(written.author).toBe(book.author)
    expect(written.totalChapters).toBe(book.totalChapters)
    expect(written.questionPool.map((q) => q.chapter)).toEqual([1, 2])
    expect(typeof written.startedAt).toBe('string')
  })

  it('appends only chapters not already in the existing pool', async () => {
    const existing: BookProgress = {
      bookId: book.id,
      childId: 'lincoln1',
      bookTitle: book.title,
      author: book.author,
      totalChapters: book.totalChapters,
      questionPool: [item(1), item(2)],
      startedAt: '2026-06-01',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    }
    getDoc.mockResolvedValue({ exists: () => true, data: () => existing })

    // Pool covers chapters 2 and 3; only 3 is new.
    await applyChapterPoolForChild('fam1', 'lincoln1', book, [item(2), item(3)])

    expect(setDoc).not.toHaveBeenCalled()
    expect(updateDoc).toHaveBeenCalledTimes(1)
    const update = updateDoc.mock.calls[0][1] as { questionPool: ChapterQuestionPoolItem[] }
    expect(update.questionPool.map((q) => q.chapter)).toEqual([1, 2, 3])
  })

  it('never clobbers a recorded answer on an already-present chapter', async () => {
    const answered: ChapterQuestionPoolItem = {
      ...item(1),
      answered: true,
      answeredDate: '2026-06-02',
      audioUrl: 'https://example.com/a.webm',
    }
    const existing: BookProgress = {
      bookId: book.id,
      childId: 'lincoln1',
      bookTitle: book.title,
      author: book.author,
      totalChapters: book.totalChapters,
      questionPool: [answered],
      startedAt: '2026-06-01',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    }
    getDoc.mockResolvedValue({ exists: () => true, data: () => existing })

    // Regenerating chapter 1 (fresh, unanswered) must not overwrite the answer.
    await applyChapterPoolForChild('fam1', 'lincoln1', book, [item(1), item(2)])

    const update = updateDoc.mock.calls[0][1] as { questionPool: ChapterQuestionPoolItem[] }
    const ch1 = update.questionPool.find((q) => q.chapter === 1)
    expect(ch1?.answered).toBe(true)
    expect(ch1?.audioUrl).toBe('https://example.com/a.webm')
    expect(update.questionPool.map((q) => q.chapter)).toEqual([1, 2])
  })

  it('writes nothing when every chapter is already present (no-op)', async () => {
    const existing: BookProgress = {
      bookId: book.id,
      childId: 'lincoln1',
      bookTitle: book.title,
      author: book.author,
      totalChapters: book.totalChapters,
      questionPool: [item(1), item(2)],
      startedAt: '2026-06-01',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    }
    getDoc.mockResolvedValue({ exists: () => true, data: () => existing })

    await applyChapterPoolForChild('fam1', 'lincoln1', book, [item(1), item(2)])

    expect(setDoc).not.toHaveBeenCalled()
    expect(updateDoc).not.toHaveBeenCalled()
  })
})
