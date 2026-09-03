import { describe, expect, it } from 'vitest'

import type { PageImage } from '../../core/types'
import {
  applyBackgroundFit,
  backgroundFitOf,
  hasFitBackdrop,
  hasFittableBackground,
  resolveImageFit,
} from './imageFit'

function image(id: string, over: Partial<PageImage> = {}): PageImage {
  return { id, url: `${id}.png`, type: 'ai-generated', ...over }
}

/**
 * A photo dropped over an existing image — FEAT-116 stores it as `type: 'photo'`
 * with `layerType: 'element'` at a 40x40 overlay position (`useBook.ts`). It is a
 * composed overlay, NOT a page canvas, and `fit` must never reach it.
 */
function placedElement(id: string, over: Partial<PageImage> = {}): PageImage {
  return image(id, { type: 'photo', layerType: 'element', ...over })
}

describe('resolveImageFit (FEAT-177)', () => {
  it('shows a sticker whole regardless of fit — the field is not theirs', () => {
    expect(resolveImageFit(image('s', { type: 'sticker' }))).toBe('contain')
    expect(resolveImageFit(image('s', { type: 'sticker', fit: 'fill' }))).toBe('contain')
    expect(resolveImageFit(image('s', { type: 'sticker', fit: 'fit' }))).toBe('contain')
  })

  it('fills the box for a legacy background with no fit field', () => {
    expect(resolveImageFit(image('a'))).toBe('cover')
    expect(resolveImageFit(image('p', { type: 'photo' }))).toBe('cover')
    expect(resolveImageFit(image('k', { type: 'sketch' }))).toBe('cover')
  })

  it("fills the box when the parent chose 'fill'", () => {
    expect(resolveImageFit(image('a', { fit: 'fill' }))).toBe('cover')
  })

  it("shows the whole picture when the parent chose 'fit'", () => {
    expect(resolveImageFit(image('a', { fit: 'fit' }))).toBe('contain')
    expect(resolveImageFit(image('p', { type: 'photo', fit: 'fit' }))).toBe('contain')
  })
})

describe('hasFitBackdrop (FEAT-177)', () => {
  it('is true only for a fitted background', () => {
    expect(hasFitBackdrop(image('a', { fit: 'fit' }))).toBe(true)
  })

  it('is false for a filled or legacy background — nothing is left to fill', () => {
    expect(hasFitBackdrop(image('a'))).toBe(false)
    expect(hasFitBackdrop(image('a', { fit: 'fill' }))).toBe(false)
  })

  it('is false for stickers even though they are contain-fit', () => {
    expect(hasFitBackdrop(image('s', { type: 'sticker' }))).toBe(false)
    expect(hasFitBackdrop(image('s', { type: 'sticker', fit: 'fit' }))).toBe(false)
  })
})

describe('backgroundFitOf (FEAT-177)', () => {
  it("reads 'fill' for a page with no images at all", () => {
    expect(backgroundFitOf([])).toBe('fill')
  })

  it("reads 'fill' for a page whose only images are stickers", () => {
    expect(backgroundFitOf([image('s', { type: 'sticker', fit: 'fit' })])).toBe('fill')
  })

  it("reads 'fill' for legacy backgrounds with no field", () => {
    expect(backgroundFitOf([image('a'), image('b')])).toBe('fill')
  })

  it("reads 'fit' only when every background is fitted", () => {
    expect(backgroundFitOf([image('a', { fit: 'fit' }), image('b', { fit: 'fit' })])).toBe('fit')
    expect(backgroundFitOf([image('a', { fit: 'fit' }), image('b')])).toBe('fill')
  })

  it('ignores stickers when reading the page state', () => {
    expect(
      backgroundFitOf([image('a', { fit: 'fit' }), image('s', { type: 'sticker' })]),
    ).toBe('fit')
  })
})

describe('applyBackgroundFit (FEAT-177)', () => {
  it('stamps every background and leaves stickers untouched', () => {
    const images = [
      image('a'),
      image('s', { type: 'sticker' }),
      image('p', { type: 'photo', fit: 'fill' }),
    ]
    const next = applyBackgroundFit(images, 'fit')
    expect(next.map((i) => i.fit)).toEqual(['fit', undefined, 'fit'])
    expect(next[1]).toBe(images[1]) // sticker object passed through unchanged
  })

  it('writes an explicit fill rather than deleting the field', () => {
    const next = applyBackgroundFit([image('a', { fit: 'fit' })], 'fill')
    expect(next[0].fit).toBe('fill')
  })

  it('does not mutate the input array', () => {
    const images = [image('a')]
    applyBackgroundFit(images, 'fit')
    expect(images[0].fit).toBeUndefined()
  })
})

describe('placed elements are out of scope (FEAT-177 / FEAT-116)', () => {
  it('keeps a placed element cover-fit even when a stray fit says otherwise', () => {
    expect(resolveImageFit(placedElement('e', { fit: 'fit' }))).toBe('cover')
    expect(resolveImageFit(placedElement('e'))).toBe('cover')
  })

  it('never puts a blurred backdrop behind a placed element', () => {
    expect(hasFitBackdrop(placedElement('e', { fit: 'fit' }))).toBe(false)
  })

  it('never stamps fit on a placed element', () => {
    const images = [image('bg'), placedElement('e'), image('s', { type: 'sticker' })]
    const next = applyBackgroundFit(images, 'fit')
    expect(next.map((i) => [i.id, i.fit])).toEqual([
      ['bg', 'fit'],
      ['e', undefined],
      ['s', undefined],
    ])
    expect(next[1]).toBe(images[1])
  })

  it('ignores placed elements when reading the page state', () => {
    expect(backgroundFitOf([image('bg', { fit: 'fit' }), placedElement('e')])).toBe('fit')
  })

  it('offers the toggle only when a real background plane image exists', () => {
    expect(hasFittableBackground([])).toBe(false)
    expect(hasFittableBackground([image('s', { type: 'sticker' })])).toBe(false)
    expect(hasFittableBackground([placedElement('e')])).toBe(false)
    expect(hasFittableBackground([image('bg')])).toBe(true)
    // Legacy images carry no layerType — the heuristic still calls them backgrounds.
    expect(hasFittableBackground([image('legacy', { type: 'sketch' })])).toBe(true)
  })

  it('honours an explicit background layerType on an image typed photo', () => {
    const bg = image('bg', { type: 'photo', layerType: 'background', fit: 'fit' })
    expect(resolveImageFit(bg)).toBe('contain')
    expect(hasFitBackdrop(bg)).toBe(true)
  })
})
