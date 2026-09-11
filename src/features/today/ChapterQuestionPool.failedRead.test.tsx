import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ChapterQuestionPool from './ChapterQuestionPool'
import type { ChapterBook } from '../../core/types'

/**
 * UX-356(a) — a failed read is not a book with no questions.
 *
 * `useBookProgress`'s error handler set `bookProgress: null` and
 * `loading: false`, which is byte-identical to an affirmative empty result. This
 * surface then rendered *"Chapter questions haven't been generated yet"* over a
 * pool that exists, and offered a button that would generate a second one — on
 * the strength of a dropped subscription.
 *
 * POSITIVE CONTROL: delete the `bookProgressFailed` branch from
 * `ChapterQuestionPool` and the first test fails (the generate button comes
 * back).
 */

const BOOK = {
  id: 'book-1',
  title: 'The Wind in the Willows',
  author: 'Kenneth Grahame',
  chapters: [{ number: 1, title: 'The River Bank' }],
} as unknown as ChapterBook

describe('the chapter pool over a read that did not land', () => {
  it('says the read failed, and does NOT offer to generate a pool', () => {
    render(
      <ChapterQuestionPool
        book={BOOK}
        bookProgress={null}
        bookProgressLoading={false}
        bookProgressFailed
        onChapterAnswered={vi.fn()}
        onRetryGeneration={vi.fn()}
      />,
    )

    expect(screen.getByText(/Couldn't read this book's chapter questions/)).toBeTruthy()
    expect(screen.queryByText('Generate chapter questions')).toBeNull()
    // And it does not claim the questions are gone.
    expect(screen.getByText(/haven't been lost/)).toBeTruthy()
  })

  it('still offers to generate when the pool genuinely does not exist', () => {
    render(
      <ChapterQuestionPool
        book={BOOK}
        bookProgress={null}
        bookProgressLoading={false}
        onChapterAnswered={vi.fn()}
        onRetryGeneration={vi.fn()}
      />,
    )

    expect(screen.getByText('Generate chapter questions')).toBeTruthy()
    expect(screen.queryByText(/Couldn't read/)).toBeNull()
  })

  it('shows the spinner while the read is still open, not the failure', () => {
    render(
      <ChapterQuestionPool
        book={BOOK}
        bookProgress={null}
        bookProgressLoading
        onChapterAnswered={vi.fn()}
      />,
    )

    expect(screen.getByText('Preparing chapter questions...')).toBeTruthy()
    expect(screen.queryByText(/Couldn't read/)).toBeNull()
  })
})
