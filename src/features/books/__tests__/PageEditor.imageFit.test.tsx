import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import PageEditor from '../PageEditor'
import { FIT_BACKDROP_TESTID } from '../imageFit'
import type { BookPage, PageImage } from '../../../core/types'

/**
 * FEAT-177 — the Book Editor's "Change background" menu can show a background
 * whole instead of cropping it to fill the page.
 */

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
  const onUpdate = vi.fn()
  render(
    <PageEditor
      page={page(images)}
      onUpdate={onUpdate}
      onAddImage={vi.fn()}
      onRemoveImage={vi.fn()}
      onChangeBackground={vi.fn()}
      childName="London"
    />,
  )
  return { onUpdate }
}

function openBackgroundMenu() {
  fireEvent.click(screen.getByRole('button', { name: /change background/i }))
}

/** The images handed to the page's update path by the most recent call. */
function updatedImages(onUpdate: ReturnType<typeof vi.fn>): PageImage[] {
  const last = onUpdate.mock.calls.at(-1)?.[0] as Partial<BookPage> | undefined
  return last?.images ?? []
}

describe('PageEditor background fit toggle (FEAT-177)', () => {
  it('offers no background menu at all when the page has no background', () => {
    renderEditor([{ ...image('s'), type: 'sticker' }])
    expect(screen.queryByRole('button', { name: /change background/i })).toBeNull()
  })

  it('offers "Show the whole picture" when a background is filling the page', () => {
    renderEditor([image('a')])
    openBackgroundMenu()
    expect(screen.getByText('Show the whole picture')).toBeTruthy()
    expect(screen.queryByText('Fill the page')).toBeNull()
  })

  it('offers "Fill the page" once the background is already shown whole', () => {
    renderEditor([image('a', { fit: 'fit' })])
    openBackgroundMenu()
    expect(screen.getByText('Fill the page')).toBeTruthy()
    expect(screen.queryByText('Show the whole picture')).toBeNull()
  })

  it('writes fit onto the backgrounds and never onto a sticker', () => {
    const { onUpdate } = renderEditor([
      image('a'),
      image('s', { type: 'sticker' }),
      image('p', { type: 'photo' }),
    ])
    openBackgroundMenu()
    fireEvent.click(screen.getByText('Show the whole picture'))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    const images = updatedImages(onUpdate)
    expect(images.map((i) => [i.id, i.fit])).toEqual([
      ['a', 'fit'],
      ['s', undefined],
      ['p', 'fit'],
    ])
  })

  it('toggles back to an explicit fill', () => {
    const { onUpdate } = renderEditor([image('a', { fit: 'fit' })])
    openBackgroundMenu()
    fireEvent.click(screen.getByText('Fill the page'))
    expect(updatedImages(onUpdate)[0].fit).toBe('fill')
  })

  it('renders a fitted background contain-fit, behind a blurred copy of itself', () => {
    renderEditor([image('a', { fit: 'fit' })])
    // The backdrop copy is aria-hidden, so the accessibility tree holds only
    // the sharp image the reader actually looks at.
    const sharp = screen.getByRole('img')
    expect(sharp.getAttribute('src')).toBe('https://img/a.png')
    expect(getComputedStyle(sharp).objectFit).toBe('contain')

    const backdrop = screen.getByTestId(FIT_BACKDROP_TESTID)
    expect(backdrop.querySelector('img')?.getAttribute('src')).toBe('https://img/a.png')
  })

  it('renders a legacy background cover-fit with no blurred copy', () => {
    renderEditor([image('a')])
    const sharp = screen.getByRole('img')
    expect(getComputedStyle(sharp).objectFit).toBe('cover')
    expect(screen.queryByTestId(FIT_BACKDROP_TESTID)).toBeNull()
  })

  it('offers no fit toggle when the only non-sticker is a FEAT-116 placed element', () => {
    // A placed element is a composed overlay, not a page canvas — the menu still
    // opens (Change/Remove background), but the fit row is not offered.
    renderEditor([image('e', { type: 'photo', layerType: 'element' })])
    openBackgroundMenu()
    expect(screen.getByText('Change background')).toBeTruthy()
    expect(screen.queryByText('Show the whole picture')).toBeNull()
    expect(screen.queryByText('Fill the page')).toBeNull()
  })

  it('never stamps fit on a placed element sitting over a background', () => {
    const { onUpdate } = renderEditor([
      image('bg'),
      image('e', { type: 'photo', layerType: 'element' }),
    ])
    openBackgroundMenu()
    fireEvent.click(screen.getByText('Show the whole picture'))
    expect(updatedImages(onUpdate).map((i) => [i.id, i.fit])).toEqual([
      ['bg', 'fit'],
      ['e', undefined],
    ])
  })
})
