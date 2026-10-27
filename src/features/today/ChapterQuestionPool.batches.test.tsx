import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ChapterQuestionPool from './ChapterQuestionPool'
import type { BookProgress, ChapterBook, ChapterQuestionPoolItem } from '../../core/types'

/**
 * UX-464 — the card while a book's questions are written a batch at a time.
 */

const BOOK = {
  id: 'dark-sea',
  title: 'On the Edge of the Dark Sea of Darkness',
  author: 'Andrew Peterson',
  totalChapters: 4,
  chapters: [1, 2, 3, 4].map((n) => ({ number: n, title: `Chapter ${n}` })),
} as unknown as ChapterBook

const item = (chapter: number, extra: Partial<ChapterQuestionPoolItem> = {}): ChapterQuestionPoolItem => ({
  chapter, questionType: 'opinion', question: `What happened in chapter ${chapter}?`, answered: false, ...extra,
})

const progress = (pool: ChapterQuestionPoolItem[]) =>
  ({ bookId: 'dark-sea', childId: 'lincoln', bookTitle: BOOK.title, author: BOOK.author,
    totalChapters: 4, questionPool: pool, startedAt: '2026-10-27', createdAt: '', updatedAt: '' }) as BookProgress

describe('ChapterQuestionPool during a batch run (UX-464)', () => {
  it('shows which batch is running and disables the button so a double tap cannot start two', () => {
    const onRetry = vi.fn()
    render(
      <ChapterQuestionPool
        book={BOOK} bookProgress={null} bookProgressLoading={false}
        onChapterAnswered={vi.fn()} onRetryGeneration={onRetry}
        generation={{ bookId: 'dark-sea', running: true, line: 'Writing questions… chapters 13–24 of 58' }}
      />,
    )
    expect(screen.getByText('Writing questions… chapters 13–24 of 58')).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Generate chapter questions' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('a book with no chapter list says so and offers no generate button', () => {
    render(
      <ChapterQuestionPool
        book={{ ...BOOK, chapters: [] }} bookProgress={null} bookProgressLoading={false}
        onChapterAnswered={vi.fn()} onRetryGeneration={vi.fn()}
      />,
    )
    expect(screen.getByText(/no chapter list saved/)).toBeTruthy()
    expect(screen.queryByText('Generate chapter questions')).toBeNull()
  })

  it('a partial pool says how many chapters are ready and offers the rest', () => {
    const onRetry = vi.fn()
    render(
      <ChapterQuestionPool
        book={BOOK} bookProgress={progress([item(1), item(2)])} bookProgressLoading={false}
        onChapterAnswered={vi.fn()} onRetryGeneration={onRetry}
      />,
    )
    expect(screen.getByText('Questions ready for 2 of 4 chapters.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Write the rest' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('every pooled chapter done is NOT "you finished" while chapters have no question', () => {
    render(
      <ChapterQuestionPool
        book={BOOK} bookProgress={progress([item(1, { answered: true }), item(2, { answered: true })])}
        bookProgressLoading={false} onChapterAnswered={vi.fn()} onRetryGeneration={vi.fn()}
      />,
    )
    expect(screen.queryByText(/You finished/)).toBeNull()
    expect(screen.getByText('Questions ready for 2 of 4 chapters.')).toBeTruthy()
  })

  it('a whole pool renders exactly as before: no count line, no extra button', () => {
    render(
      <ChapterQuestionPool
        book={BOOK} bookProgress={progress([1, 2, 3, 4].map((n) => item(n)))} bookProgressLoading={false}
        onChapterAnswered={vi.fn()} onRetryGeneration={vi.fn()}
      />,
    )
    expect(screen.queryByText(/Questions ready for/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Write the rest' })).toBeNull()
  })
})
