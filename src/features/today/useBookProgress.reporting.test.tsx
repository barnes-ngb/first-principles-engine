import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BookProgress } from '../../core/types'
import { ChapterSaveRefusal } from './chapterSaveOutcome'

/**
 * UX-355 and UX-356(a) — the chapter pool's two silences.
 *
 * **UX-355:** `updateChapter` ended in a bare `await updateDoc(...)` with no
 * catch anywhere on the path, called as `void onChapterAnswered(...)` from three
 * places across the parent and kid surfaces. A rejected write was an unhandled
 * promise rejection: nothing on screen, and the answer a child had just recorded
 * gone on the next load.
 *
 * **UX-356(a):** the `onSnapshot` error handler set `bookProgress: null` and
 * `loading: false`, which is byte-identical to *this child has no progress on
 * this book*. The parent surface then offered to generate a pool that already
 * existed.
 *
 * POSITIVE CONTROL: remove the try/catch in `updateChapter` and the rejection
 * test below fails with an unhandled rejection; remove `setLoadFailed(true)`
 * from the error handler and the read test fails.
 */

let snapshotNext: ((snap: unknown) => void) | null = null
let snapshotError: ((err: Error) => void) | null = null
const updateDoc = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {})

vi.mock('firebase/firestore', () => ({
  deleteField: () => ({ __delete: true }),
  doc: (col: unknown, id: string) => ({ col, id }),
  onSnapshot: (
    _ref: unknown,
    next: (snap: unknown) => void,
    error: (err: Error) => void,
  ) => {
    snapshotNext = next
    snapshotError = error
    return () => {}
  },
  updateDoc: (...args: unknown[]) => updateDoc(...args),
}))

vi.mock('../../core/firebase/firestore', () => ({
  bookProgressCollection: () => ({ kind: 'bookProgress' }),
  bookProgressDocId: (childId: string, bookId: string) => `${childId}_${bookId}`,
  stripUndefined: (o: Record<string, unknown>) => o,
}))

const STORED: BookProgress = {
  bookId: 'book-1',
  childId: 'lincoln',
  migratedSkipModel: true,
  questionPool: [
    { chapter: 1, question: 'What did he want?', questionType: 'comprehension' },
    { chapter: 2, question: 'What changed?', questionType: 'connection' },
  ],
} as unknown as BookProgress

async function mount(bookId: string | undefined = 'book-1') {
  const { useBookProgress } = await import('./useBookProgress')
  return renderHook(() => useBookProgress('fam-1', 'lincoln', bookId))
}

beforeEach(() => {
  vi.clearAllMocks()
  snapshotNext = null
  snapshotError = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('a chapter answer answers back (UX-355)', () => {
  it('reports a rejected write instead of throwing into nothing', async () => {
    updateDoc.mockRejectedValueOnce(new Error('permission-denied'))
    const { result } = await mount()
    act(() => {
      snapshotNext?.({ exists: () => true, id: 'lincoln_book-1', data: () => STORED })
    })
    await waitFor(() => expect(result.current.bookProgress).not.toBeNull())

    const outcome = await result.current.updateChapter(1, { answered: true })

    expect(outcome).toEqual({ ok: false, reason: ChapterSaveRefusal.Rejected })
  })

  it('reports a REFUSED write — a guard is a failure, not a quiet no-op', async () => {
    // No book loaded: the hook used to `return` with no answer at all, so the
    // caller could not tell success from "there was nothing to write to".
    const { result } = await mount(undefined)

    const outcome = await result.current.updateChapter(1, { answered: true })

    expect(outcome).toEqual({ ok: false, reason: ChapterSaveRefusal.NoTarget })
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('answers ok — and writes exactly what it always wrote — when it lands', async () => {
    const { result } = await mount()
    act(() => {
      snapshotNext?.({ exists: () => true, id: 'lincoln_book-1', data: () => STORED })
    })
    await waitFor(() => expect(result.current.bookProgress).not.toBeNull())

    const outcome = await result.current.updateChapter(2, { answered: true })

    expect(outcome).toEqual({ ok: true })
    expect(updateDoc).toHaveBeenCalledTimes(1)
    const payload = updateDoc.mock.calls[0][1] as {
      questionPool: { chapter: number; answered?: boolean }[]
      lastChapterAnswered?: number
    }
    expect(payload.questionPool[1].answered).toBe(true)
    expect(payload.lastChapterAnswered).toBe(2)
  })
})

describe('a failed READ is not an empty book (UX-356a)', () => {
  it('says the read failed, distinctly from having no pool', async () => {
    const { result } = await mount()

    act(() => {
      snapshotError?.(new Error('unavailable'))
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.loadFailed).toBe(true)
    expect(result.current.bookProgress).toBeNull()
  })

  it('reports an ABSENT document as absent, not as a failure', async () => {
    const { result } = await mount()

    act(() => {
      snapshotNext?.({ exists: () => false, id: 'lincoln_book-1' })
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.loadFailed).toBe(false)
    expect(result.current.bookProgress).toBeNull()
  })

  it('clears the failure when the subscription recovers', async () => {
    const { result } = await mount()
    act(() => {
      snapshotError?.(new Error('unavailable'))
    })
    await waitFor(() => expect(result.current.loadFailed).toBe(true))

    act(() => {
      snapshotNext?.({ exists: () => true, id: 'lincoln_book-1', data: () => STORED })
    })

    await waitFor(() => expect(result.current.loadFailed).toBe(false))
    expect(result.current.bookProgress).not.toBeNull()
  })
})
