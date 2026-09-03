import { describe, expect, it } from 'vitest'
import type { Book, BookPage, PageImage } from '../../../core/types'
import * as printBookModule from '../printBook'
import { buildLogicalPages, resolveCoverImageUrl } from '../printBook'
import { stackOrder } from '../draggableImageUtils'

/* Minimal fixtures — only the fields the pure builders read. */

function image(url: string, over: Partial<PageImage> = {}): PageImage {
  return { id: url, url, type: 'ai-generated', ...over }
}

function page(pageNumber: number, images: PageImage[], text = 'text'): BookPage {
  return {
    id: `p${pageNumber}`,
    pageNumber,
    text,
    images,
    layout: 'image-top',
    createdAt: '2026-07-18',
    updatedAt: '2026-07-18',
  }
}

function book(over: Partial<Book> = {}): Book {
  return {
    id: 'b1',
    title: 'My Book',
    pages: [page(1, [image('scene-1.png')]), page(2, [image('scene-2.png')])],
    createdAt: '2026-07-18',
    ...over,
  } as Book
}

describe('resolveCoverImageUrl (FEAT-99)', () => {
  it('prefers the explicit coverImageUrl', () => {
    expect(resolveCoverImageUrl(book({ coverImageUrl: 'cover.png' }))).toBe('cover.png')
  })

  it('falls back to the first page image when no explicit cover', () => {
    expect(resolveCoverImageUrl(book())).toBe('scene-1.png')
  })

  it('is undefined when there are no images anywhere', () => {
    expect(resolveCoverImageUrl(book({ pages: [page(1, [])] }))).toBeUndefined()
  })
})

describe('buildLogicalPages emits exactly one cover (FEAT-99)', () => {
  it('emits the cover once, in front, then content pages', () => {
    const seq = buildLogicalPages(book(), true, false, false)
    expect(seq.filter((p) => p.type === 'cover')).toHaveLength(1)
    expect(seq[0].type).toBe('cover')
    expect(seq.filter((p) => p.type === 'content')).toHaveLength(2)
  })

  it('omits the cover when includeCover is false', () => {
    const seq = buildLogicalPages(book(), false, false, false)
    expect(seq.some((p) => p.type === 'cover')).toBe(false)
  })

  it('orders cover → sight-words → content → back', () => {
    const seq = buildLogicalPages(book(), true, true, true)
    expect(seq.map((p) => p.type)).toEqual(['cover', 'sight-words', 'content', 'content', 'back'])
  })

  it('does not mutate the source book (read-only)', () => {
    const b = book()
    const frozenPages = Object.freeze([...b.pages])
    Object.defineProperty(b, 'pages', { value: frozenPages, writable: false })
    expect(() => buildLogicalPages(b, true, false, false)).not.toThrow()
    expect(b.pages).toHaveLength(2)
  })
})

describe('page 1 keeps its picture (FEAT-185 retires the FEAT-99 dedupe)', () => {
  /*
   * FEAT-99 stripped the cover's fallback image from story page 1 so the cover
   * would not "read as two pages". The owner's printed book (2026-09-03)
   * showed the cost: page 1 was a grey box with three stickers floating on it
   * and no forest. A cover reusing the first illustration is a picture-book
   * convention; a page stripped of its scene under its stickers is a defect.
   * Retired by owner decision — in every format.
   */
  it('the dedupe seam is gone: printBook no longer exports contentImagesToDraw', () => {
    expect('contentImagesToDraw' in printBookModule).toBe(false)
  })

  it('the cover still falls back to page 1 image — and page 1 still carries that image', () => {
    const b = book()
    const coverUrl = resolveCoverImageUrl(b)
    expect(coverUrl).toBe('scene-1.png')
    const seq = buildLogicalPages(b, true, false, false)
    const first = seq.find((p) => p.type === 'content')
    expect(first?.type).toBe('content')
    if (first?.type !== 'content') return
    expect(first.page.images.map((i) => i.url)).toContain(coverUrl)
  })

  it('the only transform left before drawing (stack order) keeps the scene under its stickers', () => {
    const images = [image('scene-1.png'), image('sticker.png', { type: 'sticker' })]
    const drawn = stackOrder(images)
    expect(drawn.map((i) => i.url).sort()).toEqual(['scene-1.png', 'sticker.png'])
  })
})
