import { describe, expect, it } from 'vitest'

import type { BookPage, PageImage } from '../../core/types'
import type { BackgroundReplacementTarget } from './backgroundReplacement'
import { replacePageBackground } from './backgroundReplacement'

const makeImage = (overrides: Partial<PageImage> = {}): PageImage => ({
  id: 'img-1',
  url: 'https://storage.example.com/old.jpg',
  storagePath: 'families/f1/books/b1/old.jpg',
  type: 'ai-generated',
  ...overrides,
})

const makePage = (overrides: Partial<BookPage> = {}): BookPage => ({
  id: 'page-1',
  pageNumber: 1,
  images: [makeImage()],
  layout: 'full-image',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  ...overrides,
})

const makeTarget = (
  overrides: Partial<BackgroundReplacementTarget> = {},
): BackgroundReplacementTarget => ({
  familyId: 'f1',
  bookId: 'b1',
  pageId: 'page-1',
  imageId: 'img-1',
  url: 'https://storage.example.com/old.jpg',
  storagePath: 'families/f1/books/b1/old.jpg',
  type: 'ai-generated',
  ...overrides,
})

const candidate: PageImage = {
  id: 'candidate-1',
  url: 'https://storage.example.com/new.jpg',
  storagePath: 'families/f1/books/b1/new.jpg',
  type: 'ai-generated',
}

describe('replacePageBackground', () => {
  it('replaces the background image with the candidate', () => {
    const page = makePage()
    const target = makeTarget()
    const result = replacePageBackground(page, target, candidate)

    expect(result).toBeDefined()
    expect(result!.images).toHaveLength(1)
    expect(result!.images[0].url).toBe(candidate.url)
    expect(result!.images[0].storagePath).toBe(candidate.storagePath)
  })

  it('preserves the original image id', () => {
    const page = makePage()
    const target = makeTarget()
    const result = replacePageBackground(page, target, candidate)

    expect(result!.images[0].id).toBe('img-1')
  })

  it('sets layerType to background on the replacement', () => {
    const page = makePage()
    const target = makeTarget()
    const result = replacePageBackground(page, target, candidate)

    expect(result!.images[0].layerType).toBe('background')
  })

  it('preserves position from the old image', () => {
    const position = { x: 10, y: 20, width: 80, height: 60 }
    const page = makePage({ images: [makeImage({ position })] })
    const target = makeTarget()
    const result = replacePageBackground(page, target, candidate)

    expect(result!.images[0].position).toEqual(position)
  })

  it('preserves fit from the old image', () => {
    const page = makePage({ images: [makeImage({ fit: 'fit' })] })
    const target = makeTarget()
    const result = replacePageBackground(page, target, candidate)

    expect(result!.images[0].fit).toBe('fit')
  })

  it('preserves label from the old image', () => {
    const page = makePage({ images: [makeImage({ label: 'A castle' })] })
    const target = makeTarget()
    const result = replacePageBackground(page, target, candidate)

    expect(result!.images[0].label).toBe('A castle')
  })

  it('preserves previousVersions from the old image', () => {
    const versions = [{ url: 'https://old.com/v1.jpg', style: 'comic' }]
    const page = makePage({
      images: [makeImage({ previousVersions: versions } as Partial<PageImage>)],
    })
    const target = makeTarget()
    const result = replacePageBackground(page, target, candidate)

    expect((result!.images[0] as Record<string, unknown>).previousVersions).toEqual(versions)
  })

  it('returns undefined if page id does not match', () => {
    const page = makePage({ id: 'page-2' })
    const target = makeTarget({ pageId: 'page-1' })
    const result = replacePageBackground(page, target, candidate)

    expect(result).toBeUndefined()
  })

  it('returns undefined if image id not found on page', () => {
    const page = makePage()
    const target = makeTarget({ imageId: 'nonexistent' })
    const result = replacePageBackground(page, target, candidate)

    expect(result).toBeUndefined()
  })

  it('returns undefined if url changed since target was captured', () => {
    const page = makePage()
    const target = makeTarget({ url: 'https://storage.example.com/different.jpg' })
    const result = replacePageBackground(page, target, candidate)

    expect(result).toBeUndefined()
  })

  it('returns undefined if storagePath changed since target was captured', () => {
    const page = makePage()
    const target = makeTarget({ storagePath: 'different/path.jpg' })
    const result = replacePageBackground(page, target, candidate)

    expect(result).toBeUndefined()
  })

  it('returns undefined if type changed since target was captured', () => {
    const page = makePage()
    const target = makeTarget({ type: 'photo' })
    const result = replacePageBackground(page, target, candidate)

    expect(result).toBeUndefined()
  })

  it('returns undefined if the image is an element, not a background', () => {
    const page = makePage({
      images: [makeImage({ type: 'sticker', layerType: 'element' })],
    })
    const target = makeTarget({ type: 'sticker' })
    const result = replacePageBackground(page, target, candidate)

    expect(result).toBeUndefined()
  })

  it('does not modify other images on the page', () => {
    const sticker: PageImage = {
      id: 'sticker-1',
      url: 'https://sticker.com/s.png',
      type: 'sticker',
      layerType: 'element',
    }
    const page = makePage({ images: [makeImage(), sticker] })
    const target = makeTarget()
    const result = replacePageBackground(page, target, candidate)

    expect(result!.images).toHaveLength(2)
    expect(result!.images[1]).toBe(sticker)
  })

  it('preserves page fields other than images', () => {
    const page = makePage({ text: 'Once upon a time', pageNumber: 3 })
    const target = makeTarget()
    const result = replacePageBackground(page, target, candidate)

    expect(result!.text).toBe('Once upon a time')
    expect(result!.pageNumber).toBe(3)
    expect(result!.id).toBe('page-1')
  })
})
