import { describe, expect, it } from 'vitest'
import type { Book, BookPage, PageImage } from '../../../core/types'
import {
  buildLogicalPages,
  contentImagesToDraw,
  resolveCoverImageUrl,
} from '../printBook'

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

describe('resolveCoverImageUrl (FEAT-98)', () => {
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

describe('buildLogicalPages emits exactly one cover (FEAT-98)', () => {
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

describe('contentImagesToDraw dedupes the cover image (FEAT-98 / FEAT-91)', () => {
  it('drops the page-1 image when it duplicates the fallback cover URL', () => {
    // No explicit cover → cover falls back to page 1 image 'scene-1.png'.
    const b = book()
    const dedupeUrl = resolveCoverImageUrl(b)
    const drawn = contentImagesToDraw(b.pages[0].images, dedupeUrl)
    expect(drawn).toHaveLength(0)
  })

  it('keeps non-duplicate images (stickers) on the deduped page', () => {
    const images = [image('scene-1.png'), image('sticker.png', { type: 'sticker' })]
    const drawn = contentImagesToDraw(images, 'scene-1.png')
    expect(drawn.map((i) => i.url)).toEqual(['sticker.png'])
  })

  it('keeps all images on later pages that do not match the cover', () => {
    const b = book()
    const drawn = contentImagesToDraw(b.pages[1].images, resolveCoverImageUrl(b))
    expect(drawn.map((i) => i.url)).toEqual(['scene-2.png'])
  })

  it('is a no-op when there is no cover to dedupe against', () => {
    const images = [image('scene-1.png')]
    expect(contentImagesToDraw(images, undefined)).toBe(images)
  })
})
