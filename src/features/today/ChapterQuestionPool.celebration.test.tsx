// ── FEAT-161 (UX-11): a celebration for answering nothing ───────────────────
//
// The pool's end state fires when nothing is left *to go*, and `answered.length`
// rendered unconditionally underneath it. A book skipped chapter by chapter
// therefore got "🎉 You finished {title}!" over "0 answered · 17 skipped" — the
// happiest possible way to say nothing was discussed.
//
// Skipping is a real choice and the fix is not a scolding: the book IS wrapped
// up, so that is what the heading says, and the count that would have been zero
// simply isn't there.

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ChapterQuestionPool from './ChapterQuestionPool'
import type { BookProgress, ChapterBook, ChapterQuestionPoolItem } from '../../core/types'

const book = { id: 'b1', title: 'Prince Caspian', totalChapters: 3 } as unknown as ChapterBook

const item = (chapter: number, over: Partial<ChapterQuestionPoolItem> = {}) =>
  ({
    chapter,
    question: `Chapter ${chapter} question`,
    questionType: 'comprehension',
    answered: false,
    skipped: false,
    ...over,
  }) as unknown as ChapterQuestionPoolItem

function renderPool(pool: ChapterQuestionPoolItem[]) {
  const progress = { bookId: 'b1', questionPool: pool } as unknown as BookProgress
  render(
    <ChapterQuestionPool
      book={book}
      bookProgress={progress}
      bookProgressLoading={false}
      onChapterAnswered={vi.fn()}
    />,
  )
}

describe('ChapterQuestionPool end state — UX-11', () => {
  it('does NOT celebrate a book that was skipped end to end', () => {
    renderPool([1, 2, 3].map((c) => item(c, { skipped: true })))

    expect(screen.queryByText(/You finished/)).toBeNull()
    expect(screen.queryByText(/🎉/)).toBeNull()
    expect(screen.getByText('You wrapped up Prince Caspian')).toBeTruthy()
  })

  it('drops the "0 answered" clause instead of printing a zero', () => {
    renderPool([1, 2, 3].map((c) => item(c, { skipped: true })))

    expect(screen.queryByText(/0 answered/)).toBeNull()
    expect(screen.getByText(/3 skipped · 3 chapters total/)).toBeTruthy()
  })

  it('still celebrates — and still counts — a book that was actually discussed', () => {
    renderPool([
      item(1, { answered: true }),
      item(2, { answered: true }),
      item(3, { skipped: true }),
    ])

    expect(screen.getByText(/🎉 You finished Prince Caspian!/)).toBeTruthy()
    expect(screen.getByText(/2 answered · 1 skipped · 3 chapters total/)).toBeTruthy()
  })

  it('has a singular chapter noun for a one-chapter pool', () => {
    renderPool([item(1, { answered: true })])
    expect(screen.getByText(/1 answered · 1 chapter total/)).toBeTruthy()
  })
})
