import { describe, expect, it } from 'vitest'

import type { Book, BookPage } from '../../core/types'
import type { CatalogProduct } from '../../core/types/business'
import {
  buildBookPreview,
  clampPreviewPageCount,
  PREVIEW_DEFAULT_PAGES,
  PREVIEW_MAX_PAGES,
  productWantsPreview,
} from './catalogPreview'

const page = (over: Partial<BookPage>): BookPage => ({
  id: 'pg',
  pageNumber: 1,
  images: [],
  layout: 'image-top',
  createdAt: '',
  updatedAt: '',
  ...over,
})

const book = (over: Partial<Book>): Book => ({
  id: 'b1',
  childId: 'lincoln',
  title: 'Tom Tom',
  pages: [],
  status: 'complete',
  createdAt: '',
  updatedAt: '',
  subjectBuckets: [],
  ...over,
})

const product = (over: Partial<CatalogProduct>): CatalogProduct => ({
  id: 'p1',
  title: 'A Book',
  type: 'Book',
  description: '',
  priceCents: 0,
  images: [],
  madeBy: [],
  status: 'listed',
  createdAt: '',
  updatedAt: '',
  ...over,
})

describe('clampPreviewPageCount', () => {
  it('defaults when unset/invalid', () => {
    expect(clampPreviewPageCount(undefined)).toBe(PREVIEW_DEFAULT_PAGES)
    expect(clampPreviewPageCount(NaN)).toBe(PREVIEW_DEFAULT_PAGES)
  })
  it('caps at the max and floors at 1', () => {
    expect(clampPreviewPageCount(99)).toBe(PREVIEW_MAX_PAGES)
    expect(clampPreviewPageCount(0)).toBe(1)
    expect(clampPreviewPageCount(2.9)).toBe(2)
  })
})

describe('productWantsPreview', () => {
  it('is true only for an opted-in, book-sourced product', () => {
    expect(
      productWantsPreview(product({ includePreview: true, sourceRef: { kind: 'book', id: 'b1' } })),
    ).toBe(true)
    // Off by default.
    expect(productWantsPreview(product({ sourceRef: { kind: 'book', id: 'b1' } }))).toBe(false)
    // Opted in but not book-sourced — nothing to page through.
    expect(
      productWantsPreview(
        product({ includePreview: true, sourceRef: { kind: 'sticker', id: 's1' } }),
      ),
    ).toBe(false)
    expect(productWantsPreview(product({ includePreview: true }))).toBe(false)
  })
})

describe('buildBookPreview', () => {
  it('takes the cover + first N pages in order, capped', () => {
    const preview = buildBookPreview(
      book({
        coverImageUrl: 'https://cdn/cover.png',
        pages: [
          page({ pageNumber: 2, text: 'two', images: [{ ...img('p2') }] }),
          page({ pageNumber: 1, text: 'one', images: [{ ...img('p1') }] }),
          page({ pageNumber: 3, text: 'three', images: [{ ...img('p3') }] }),
        ],
      }),
      2,
    )
    expect(preview.coverUrl).toBe('https://cdn/cover.png')
    expect(preview.pages).toHaveLength(2)
    expect(preview.pages[0]).toEqual({ imageUrl: 'https://cdn/p1.png', text: 'one' })
    expect(preview.pages[1]).toEqual({ imageUrl: 'https://cdn/p2.png', text: 'two' })
  })

  it('falls back to the first page image for the cover when none is set', () => {
    const preview = buildBookPreview(
      book({ pages: [page({ pageNumber: 1, images: [{ ...img('first') }] })] }),
      3,
    )
    expect(preview.coverUrl).toBe('https://cdn/first.png')
  })

  it('drops empty pages (no image, no text)', () => {
    const preview = buildBookPreview(
      book({
        pages: [
          page({ pageNumber: 1, images: [], text: '  ' }),
          page({ pageNumber: 2, text: 'real', images: [] }),
        ],
      }),
      5,
    )
    expect(preview.pages).toEqual([{ imageUrl: undefined, text: 'real' }])
  })

  it('dedups the cover image so it never repeats as page 1 (FEAT-91)', () => {
    // No explicit cover → coverUrl falls back to page 1's image, which is ALSO
    // page 1 in the pages list. The page image must be dropped as a duplicate.
    const preview = buildBookPreview(
      book({
        pages: [
          page({ pageNumber: 1, text: 'one', images: [{ ...img('shared') }] }),
          page({ pageNumber: 2, text: 'two', images: [{ ...img('p2') }] }),
        ],
      }),
      3,
    )
    expect(preview.coverUrl).toBe('https://cdn/shared.png')
    // Page 1 keeps its text but drops the image that duplicates the cover.
    expect(preview.pages).toEqual([
      { imageUrl: undefined, text: 'one' },
      { imageUrl: 'https://cdn/p2.png', text: 'two' },
    ])
    // The shared URL appears exactly once across cover + pages.
    const all = [preview.coverUrl, ...preview.pages.map((p) => p.imageUrl)]
    expect(all.filter((u) => u === 'https://cdn/shared.png')).toHaveLength(1)
  })

  it('caps at N real pages AFTER dedup', () => {
    const preview = buildBookPreview(
      book({
        coverImageUrl: 'https://cdn/dup.png',
        pages: [
          page({ pageNumber: 1, text: 'one', images: [{ ...img('dup') }] }), // image deduped
          page({ pageNumber: 2, text: 'two', images: [{ ...img('p2') }] }),
          page({ pageNumber: 3, text: 'three', images: [{ ...img('p3') }] }),
        ],
      }),
      2,
    )
    // Page 1 survives (has text), image deduped; cap of 2 still holds.
    expect(preview.pages).toEqual([
      { imageUrl: undefined, text: 'one' },
      { imageUrl: 'https://cdn/p2.png', text: 'two' },
    ])
  })

  it('collects distinct sticker URLs across pages (FEAT-91)', () => {
    const preview = buildBookPreview(
      book({
        coverImageUrl: 'https://cdn/cover.png',
        pages: [
          page({
            pageNumber: 1,
            images: [{ ...img('scene1') }, { ...sticker('star') }, { ...sticker('heart') }],
          }),
          page({
            pageNumber: 2,
            images: [{ ...img('scene2') }, { ...sticker('star') }], // 'star' repeats → deduped
          }),
        ],
      }),
      5,
    )
    expect(preview.stickers).toEqual(['https://cdn/star.png', 'https://cdn/heart.png'])
  })

  it('omits stickers entirely when the book has none', () => {
    const preview = buildBookPreview(
      book({ pages: [page({ pageNumber: 1, images: [{ ...img('scene') }] })] }),
      3,
    )
    expect(preview.stickers).toBeUndefined()
  })
})

/** Minimal PageImage helper. */
function img(name: string) {
  return { id: name, url: `https://cdn/${name}.png`, type: 'ai-generated' as const }
}

/** Minimal sticker PageImage helper. */
function sticker(name: string) {
  return { id: name, url: `https://cdn/${name}.png`, type: 'sticker' as const }
}
