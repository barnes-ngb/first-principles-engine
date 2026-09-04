import { describe, expect, it } from 'vitest'
import type { BookPage } from '../../../core/types'
import {
  imageBoxHeightFraction,
  pageNumberLabel,
  shouldRenderPageNumbers,
  textSizeFor,
} from '../printBook'

describe('shouldRenderPageNumbers (FEAT-99 / FEAT-185)', () => {
  it('keeps page numbers on full-document formats when enabled (characterization)', () => {
    expect(shouldRenderPageNumbers('letter', true)).toBe(true)
    expect(shouldRenderPageNumbers('a4', true)).toBe(true)
  })

  it('renders page numbers on the booklet — its halves are trimmed pages with the number above the trim line (FEAT-185)', () => {
    expect(shouldRenderPageNumbers('booklet', true)).toBe(true)
  })

  it('still suppresses page numbers on the single-page picture-book formats even when enabled', () => {
    expect(shouldRenderPageNumbers('half-letter', true)).toBe(false)
    expect(shouldRenderPageNumbers('mini-5x7', true)).toBe(false)
    expect(shouldRenderPageNumbers('square-6', true)).toBe(false)
  })

  it('honors the toggle: never renders when includePageNumbers is off', () => {
    expect(shouldRenderPageNumbers('letter', false)).toBe(false)
    expect(shouldRenderPageNumbers('a4', false)).toBe(false)
    expect(shouldRenderPageNumbers('half-letter', false)).toBe(false)
    expect(shouldRenderPageNumbers('booklet', false)).toBe(false)
  })
})

describe('pageNumberLabel — content pages only, story numbering (FEAT-185)', () => {
  const page: BookPage = {
    id: 'p',
    pageNumber: 1,
    text: 't',
    images: [],
    layout: 'image-top',
    createdAt: '2026-09-03',
    updatedAt: '2026-09-03',
  }

  it('numbers a story page by its story index, not its imposed position', () => {
    expect(pageNumberLabel({ type: 'content', page, index: 0 })).toBe('1')
    expect(pageNumberLabel({ type: 'content', page, index: 5 })).toBe('6')
  })

  it('cover, sight-words, back cover and blanks carry no number', () => {
    expect(pageNumberLabel({ type: 'cover' })).toBeNull()
    expect(pageNumberLabel({ type: 'sight-words' })).toBeNull()
    expect(pageNumberLabel({ type: 'back' })).toBeNull()
    expect(pageNumberLabel({ type: 'blank' })).toBeNull()
  })
})

describe('the trimmed booklet page (FEAT-185)', () => {
  it('lets the picture box take up to 0.6 of the content height; other formats keep 0.55', () => {
    expect(imageBoxHeightFraction('booklet')).toBe(0.6)
    expect(imageBoxHeightFraction('half-letter')).toBe(0.55)
    expect(imageBoxHeightFraction('letter')).toBe(0.55)
    expect(imageBoxHeightFraction('mini-5x7')).toBe(0.55)
  })

  /*
   * Booklet half geometry: content width 114.3 mm (139.7 − 2·12.7). The 3:2
   * picture box is 76.2 mm tall by width, plus a 6 mm gap. Untrimmed page:
   * content height 190.5 → ~108 mm left for text. Trimmed 5.5 × 7 page:
   * content height 152.4, minus the 6 mm number strip → ~64 mm left.
   */
  const UNTRIMMED_TEXT_H = 190.5 - 76.2 - 6
  const TRIMMED_TEXT_H = 152.4 - 6 - 76.2 - 6

  it('the six-page London example (short lines) reads at the same 14 pt on the trimmed page as it did untrimmed', () => {
    const londonLine = 'The fox ran to the big red barn. He sat in the sun.'.length // < 120 chars
    const before = textSizeFor(londonLine, UNTRIMMED_TEXT_H, true)
    const after = textSizeFor(londonLine, TRIMMED_TEXT_H, true)
    expect(after).toEqual(before)
    expect(after).toEqual({ fontSize: 14, lineHeight: 1.6 })
  })

  it.each([60, 150, 250, 350, 450])('a %i-character page does not shrink when the page is trimmed', (len) => {
    expect(textSizeFor(len, TRIMMED_TEXT_H, true)).toEqual(textSizeFor(len, UNTRIMMED_TEXT_H, true))
  })

  it('the height floors still bite when a page is genuinely cramped', () => {
    expect(textSizeFor(50, 45, true).fontSize).toBe(10)
    expect(textSizeFor(50, 30, true).fontSize).toBe(9)
  })
})
