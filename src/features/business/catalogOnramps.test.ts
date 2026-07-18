import { describe, expect, it } from 'vitest'

import type { Book, Sticker } from '../../core/types'
import type { CatalogProduct } from '../../core/types/business'
import {
  bookToCatalogInitial,
  canPromoteBook,
  canPromoteSticker,
  catalogSourceKey,
  isSourceInCatalog,
  stickerToCatalogInitial,
} from './catalogOnramps'

const CHILDREN = [
  { id: 'lincoln', name: 'Lincoln' },
  { id: 'london', name: 'London' },
]

// Minimal fixtures (short strings — the FEAT-80 timeout lesson).
const book = (over: Partial<Book> = {}): Book => ({
  id: 'b1',
  childId: 'lincoln',
  title: 'My Book',
  coverImageUrl: 'cover.png',
  pages: [],
  status: 'complete',
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
  subjectBuckets: [],
  ...over,
})

const sticker = (over: Partial<Sticker> = {}): Sticker => ({
  id: 's1',
  url: 'sticker.png',
  storagePath: 'p/s1',
  label: 'Creeper',
  category: 'character' as Sticker['category'],
  childProfile: 'lincoln',
  createdAt: '2026-07-18T00:00:00.000Z',
  ...over,
})

describe('bookToCatalogInitial', () => {
  it('pre-fills title, real cover image, Book type, madeBy, and sourceRef{kind:book}', () => {
    const initial = bookToCatalogInitial(book(), CHILDREN)
    expect(initial.title).toBe('My Book')
    expect(initial.type).toBe('Book')
    expect(initial.images).toEqual([{ url: 'cover.png', alt: 'My Book' }])
    expect(initial.madeBy).toEqual(['Lincoln'])
    expect(initial.sourceRef).toEqual({ kind: 'book', id: 'b1' })
  })

  it('falls back to the first page image when there is no cover (never a placeholder)', () => {
    const b = book({
      coverImageUrl: undefined,
      pages: [{ id: 'p1', pageNumber: 1, images: [{ id: 'i1', url: 'page1.png', type: 'photo' }], layout: 'full-image', createdAt: '', updatedAt: '' }],
    })
    expect(bookToCatalogInitial(b, CHILDREN).images).toEqual([{ url: 'page1.png', alt: 'My Book' }])
  })

  it('emits empty images only when the book genuinely has no art', () => {
    expect(bookToCatalogInitial(book({ coverImageUrl: undefined, pages: [] }), CHILDREN).images).toEqual([])
  })

  it('credits all contributors on a Together book', () => {
    const b = book({ isTogetherBook: true, contributorIds: ['lincoln', 'london'] })
    expect(bookToCatalogInitial(b, CHILDREN).madeBy).toEqual(['Lincoln', 'London'])
  })

  it('does not mutate the source book (read-only promote)', () => {
    const b = book()
    const snapshot = JSON.parse(JSON.stringify(b))
    bookToCatalogInitial(b, CHILDREN)
    expect(b).toEqual(snapshot)
  })
})

describe('stickerToCatalogInitial', () => {
  it('pre-fills label→title, real image, StickerSheet type, and sourceRef{kind:sticker}', () => {
    const initial = stickerToCatalogInitial(sticker(), CHILDREN)
    expect(initial.title).toBe('Creeper')
    expect(initial.type).toBe('StickerSheet')
    expect(initial.images).toEqual([{ url: 'sticker.png', alt: 'Creeper' }])
    expect(initial.madeBy).toEqual(['Lincoln'])
    expect(initial.sourceRef).toEqual({ kind: 'sticker', id: 's1' })
  })

  it('leaves madeBy empty for a shared ("both") sticker', () => {
    expect(stickerToCatalogInitial(sticker({ childProfile: 'both' }), CHILDREN).madeBy).toEqual([])
  })

  it('does not mutate the source sticker (read-only promote)', () => {
    const s = sticker()
    const snapshot = JSON.parse(JSON.stringify(s))
    stickerToCatalogInitial(s, CHILDREN)
    expect(s).toEqual(snapshot)
  })
})

describe('dedup helpers', () => {
  const products: CatalogProduct[] = [
    {
      id: 'p1',
      title: 'My Book',
      type: 'Book',
      description: '',
      priceCents: 0,
      images: [],
      sourceRef: { kind: 'book', id: 'b1' },
      madeBy: [],
      status: 'draft',
      createdAt: '',
      updatedAt: '',
    },
  ]

  it('catalogSourceKey is stable per kind+id', () => {
    expect(catalogSourceKey({ kind: 'book', id: 'b1' })).toBe('book:b1')
    expect(catalogSourceKey({ kind: 'sticker', id: 'b1' })).not.toBe('book:b1')
  })

  it('isSourceInCatalog matches an already-promoted source, misses new ones', () => {
    expect(isSourceInCatalog(products, { kind: 'book', id: 'b1' })).toBe(true)
    expect(isSourceInCatalog(products, { kind: 'book', id: 'b2' })).toBe(false)
    expect(isSourceInCatalog(products, { kind: 'sticker', id: 'b1' })).toBe(false)
  })
})

describe('gating (parent-only, §6)', () => {
  it('canPromoteBook: parent + finished only — a kid profile never sees it', () => {
    expect(canPromoteBook(book({ status: 'complete' }), true)).toBe(true)
    expect(canPromoteBook(book({ status: 'complete' }), false)).toBe(false) // kid
    expect(canPromoteBook(book({ status: 'draft' }), true)).toBe(false) // unfinished
    expect(canPromoteBook(book({ id: undefined }), true)).toBe(false)
  })

  it('canPromoteSticker: parent only — a kid profile never sees it', () => {
    expect(canPromoteSticker(sticker(), true)).toBe(true)
    expect(canPromoteSticker(sticker(), false)).toBe(false) // kid
    expect(canPromoteSticker(sticker({ id: undefined }), true)).toBe(false)
  })
})
