import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import ComprehensionQuestions from '../ComprehensionQuestions'
import PageEditor from '../PageEditor'
import type { BookPage, PageImage } from '../../../core/types'

// ── UX-135 — "Show answer" is not an answer ─────────────────────
//
// `toggleAnswer` increments the counter on first reveal, and that counter drove
// the ✅ "Great job!" / "Quest complete!". The celebration fired for a child who
// read every answer and answered nothing — the August audit's pattern #3 in a
// new coat. This is a talk-it-over surface, so it now says what it knows.

const QUESTIONS = [
  { question: 'Where did the cat go?', answer: 'To the barn.', type: 'recall' as const },
  { question: 'Why did he run?', answer: 'He was scared.', type: 'inference' as const },
]

function renderQuestions(isLincoln = false) {
  render(
    <ComprehensionQuestions
      questions={QUESTIONS}
      loading={false}
      error={null}
      onGenerate={vi.fn()}
      isLincoln={isLincoln}
    />,
  )
}

describe('UX-135 — no celebration for having peeked', () => {
  it('does not say "Great job!" when every answer was merely revealed', async () => {
    const user = userEvent.setup()
    renderQuestions()
    for (const btn of screen.getAllByRole('button', { name: 'Show answer' })) {
      await user.click(btn)
    }
    expect(screen.queryByText('Great job!')).toBeNull()
    expect(screen.queryByText('Quest complete!')).toBeNull()
  })

  it('says what it actually knows instead', async () => {
    const user = userEvent.setup()
    renderQuestions()
    for (const btn of screen.getAllByRole('button', { name: 'Show answer' })) {
      await user.click(btn)
    }
    expect(screen.getByText('You looked at all the answers')).toBeTruthy()
  })

  it('says nothing at all until every answer has been seen', async () => {
    const user = userEvent.setup()
    renderQuestions()
    await user.click(screen.getAllByRole('button', { name: 'Show answer' })[0])
    expect(screen.queryByText('You looked at all the answers')).toBeNull()
  })

  it('gives Lincoln the same honest line, not a quest celebration', async () => {
    const user = userEvent.setup()
    renderQuestions(true)
    for (const btn of screen.getAllByRole('button', { name: 'Show answer' })) {
      await user.click(btn)
    }
    expect(screen.queryByText('Quest complete!')).toBeNull()
    expect(screen.getByText('You looked at all the answers')).toBeTruthy()
  })
})

// ── UX-129 — one "Remove picture" behaviour ─────────────────────
//
// The action-bar chip removed the SELECTED background, undoably and without
// asking; the menu item with the same words confirmed and then removed EVERY
// background on the page, untracked by Undo. Two behaviours, one label, and the
// confirmed plural was the surprising one. Both go through the editor's tracked
// remover, so the house rule applies: undoable → don't ask.

function image(id: string, over: Partial<PageImage> = {}): PageImage {
  return { id, url: `https://img/${id}.png`, type: 'ai-generated', ...over }
}

function page(images: PageImage[]): BookPage {
  return {
    id: 'p1',
    pageNumber: 1,
    text: 'The dog ran.',
    images,
    layout: 'image-top',
    createdAt: '2026-09-03',
    updatedAt: '2026-09-03',
  }
}

function renderEditor(images: PageImage[]) {
  const onRemoveImage = vi.fn()
  render(
    <PageEditor
      page={page(images)}
      onUpdate={vi.fn()}
      onAddImage={vi.fn()}
      onRemoveImage={onRemoveImage}
      onChangeBackground={vi.fn()}
      childName="London"
    />,
  )
  return { onRemoveImage }
}

describe('UX-129 — the background menu removes one picture, and does not ask', () => {
  it('removes without a confirm dialog — it is undoable', () => {
    const { onRemoveImage } = renderEditor([image('a')])
    fireEvent.click(screen.getByRole('button', { name: /change picture/i }))
    fireEvent.click(screen.getByText('Remove picture'))

    expect(onRemoveImage).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Remove the picture?')).toBeNull()
  })

  it('removes exactly ONE background, never every background on the page', () => {
    const { onRemoveImage } = renderEditor([image('a'), image('b'), image('c')])
    fireEvent.click(screen.getByRole('button', { name: /change picture/i }))
    fireEvent.click(screen.getByText('Remove picture'))

    expect(onRemoveImage).toHaveBeenCalledTimes(1)
  })

  it('leaves stickers alone', () => {
    const { onRemoveImage } = renderEditor([image('a'), image('s', { type: 'sticker' })])
    fireEvent.click(screen.getByRole('button', { name: /change picture/i }))
    fireEvent.click(screen.getByText('Remove picture'))

    expect(onRemoveImage).toHaveBeenCalledTimes(1)
    expect(onRemoveImage).not.toHaveBeenCalledWith('s')
  })
})
