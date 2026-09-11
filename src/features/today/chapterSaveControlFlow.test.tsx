import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import ChapterQuestionPool from './ChapterQuestionPool'
import { ChapterSaveRefusal } from './chapterSaveOutcome'
import { TodayDecision } from './todayScope'
import type { BookProgress, ChapterBook } from '../../core/types'

/**
 * UX-355, Codex round 1 (P1) — **the outcome must reach the caller, not stop at
 * a wrapper.**
 *
 * The first cut of this fix reported the failure from a wrapper on the page and
 * then **resolved normally**. That silently disarmed the `catch` blocks in both
 * chapter pools, which were the only thing keeping the user's staged input:
 * `ChapterQuestionPool.handleSaveNote` clears the typed note after its `await`,
 * the skip handler drops the chapter from the selection, and
 * `KidChapterPool.handleSaveResponse` deletes the recorded audio blob. So adding
 * the reporting would have **destroyed the work on exactly the failure the
 * reporting was added for**.
 *
 * The fix is that `onChapterAnswered` answers a `ChapterSaveOutcome` all the way
 * up to the components, and each one reads it before discarding anything.
 *
 * POSITIVE CONTROL: delete the `if (!outcome.ok)` guard in `handleSaveNote` and
 * the first test fails — the note is cleared over a write that never landed.
 */

const BOOK = {
  id: 'book-1',
  title: 'The Wind in the Willows',
  author: 'Kenneth Grahame',
  chapters: [{ number: 1, title: 'The River Bank' }],
} as unknown as ChapterBook

const PROGRESS = {
  bookId: 'book-1',
  childId: 'lincoln',
  questionPool: [
    { chapter: 1, question: 'What did Mole want?', questionType: 'comprehension' },
    { chapter: 2, question: 'What changed?', questionType: 'connection' },
  ],
} as unknown as BookProgress

describe('a failed chapter write never discards what was staged', () => {
  it("keeps the parent's typed note and says it did not save", async () => {
    const user = userEvent.setup()
    const onChapterAnswered = vi.fn(async () => ({
      ok: false as const,
      reason: ChapterSaveRefusal.Rejected,
    }))
    render(
      <ChapterQuestionPool
        book={BOOK}
        bookProgress={PROGRESS}
        bookProgressLoading={false}
        onChapterAnswered={onChapterAnswered}
      />,
    )

    const note = screen.getAllByPlaceholderText(/What did you notice/i)[0]
    await user.type(note, 'He said the river was alive')
    await user.click(screen.getAllByRole('button', { name: /save note/i })[0])

    await waitFor(() => expect(onChapterAnswered).toHaveBeenCalled())
    // The sentence...
    expect(await screen.findByText(/didn't save/)).toBeTruthy()
    // ...and, the part that matters, the note is still in the box.
    await waitFor(() =>
      expect((note as HTMLTextAreaElement).value).toBe('He said the river was alive'),
    )
  })

  it('clears the note when the write does land', async () => {
    const user = userEvent.setup()
    const onChapterAnswered = vi.fn(async () => ({ ok: true as const }))
    render(
      <ChapterQuestionPool
        book={BOOK}
        bookProgress={PROGRESS}
        bookProgressLoading={false}
        onChapterAnswered={onChapterAnswered}
      />,
    )

    const note = screen.getAllByPlaceholderText(/What did you notice/i)[0]
    await user.type(note, 'He said the river was alive')
    await user.click(screen.getAllByRole('button', { name: /save note/i })[0])

    await waitFor(() => expect((note as HTMLTextAreaElement).value).toBe(''))
    expect(screen.queryByText(/didn't save/)).toBeNull()
  })
})

describe('the chapter pool reports its own open draft (UX-343, round 2)', () => {
  it('says nothing is open on a clean card', () => {
    const onOpenDecisionsChange = vi.fn()
    render(
      <ChapterQuestionPool
        book={BOOK}
        bookProgress={PROGRESS}
        bookProgressLoading={false}
        onChapterAnswered={vi.fn(async () => ({ ok: true as const }))}
        onOpenDecisionsChange={onOpenDecisionsChange}
      />,
    )
    expect(onOpenDecisionsChange).toHaveBeenLastCalledWith([])
  })

  it('reports a typed note, so the reset notice can name it', async () => {
    const user = userEvent.setup()
    const onOpenDecisionsChange = vi.fn()
    render(
      <ChapterQuestionPool
        book={BOOK}
        bookProgress={PROGRESS}
        bookProgressLoading={false}
        onChapterAnswered={vi.fn(async () => ({ ok: true as const }))}
        onOpenDecisionsChange={onOpenDecisionsChange}
      />,
    )

    await user.type(screen.getAllByPlaceholderText(/What did you notice/i)[0], 'He liked it')

    await waitFor(() =>
      expect(onOpenDecisionsChange).toHaveBeenLastCalledWith([TodayDecision.ChapterNote]),
    )
  })

  it('treats whitespace as nothing open', async () => {
    const user = userEvent.setup()
    const onOpenDecisionsChange = vi.fn()
    render(
      <ChapterQuestionPool
        book={BOOK}
        bookProgress={PROGRESS}
        bookProgressLoading={false}
        onChapterAnswered={vi.fn(async () => ({ ok: true as const }))}
        onOpenDecisionsChange={onOpenDecisionsChange}
      />,
    )

    await user.type(screen.getAllByPlaceholderText(/What did you notice/i)[0], '   ')

    await waitFor(() => expect(onOpenDecisionsChange).toHaveBeenLastCalledWith([]))
  })
})

/**
 * The structural half. A render test proves it for the paths it exercises; what
 * has to hold is a property of every CALL SITE, and the defect above was
 * precisely that one call site's contract changed under callers that could not
 * see it.
 */
describe('every onChapterAnswered call site reads its outcome', () => {
  const files = [
    'ChapterQuestionPool.tsx',
    'KidChapterPool.tsx',
  ] as const

  it.each(files)('%s', (file) => {
    const source = readFileSync(resolve(__dirname, `./${file}`), 'utf8')
    const calls = source.match(/(?:const \w+ = )?await onChapterAnswered\(/g) ?? []
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call, `unread outcome in ${file}: ${call}`).toMatch(/const \w+ = await/)
    }
    // And each one is actually checked.
    expect(source).toMatch(/if \(!outcome\.ok\)/)
  })

  it('the pages hand the hook straight down — no wrapper may swallow it', () => {
    for (const page of ['TodayPage.tsx', 'KidTodayView.tsx']) {
      const source = readFileSync(resolve(__dirname, `./${page}`), 'utf8')
      expect(source, page).toMatch(/onChapterAnswered=\{updateChapter\}/)
    }
  })
})
