import { describe, it, expect } from 'vitest'

import {
  imageBoxHeightFraction,
  resolveCoverImageUrl,
  shouldRenderPageNumbers,
  pageNumberLabel,
  textSizeFor,
  fitInBox,
  centerInBox,
  shouldRenderPlainSightWordText,
  getSightWordChipColors,
  sightWordsFooterText,
  buildLogicalPages,
} from './printBook'
import type { LogicalPage } from './bookletImposition'
import type { Book } from '../../core/types'

describe('imageBoxHeightFraction', () => {
  it('returns the booklet fraction for booklet size', () => {
    expect(imageBoxHeightFraction('booklet')).toBe(0.6)
  })

  it('returns the standard fraction for other sizes', () => {
    expect(imageBoxHeightFraction('letter')).toBe(0.55)
    expect(imageBoxHeightFraction('half-letter')).toBe(0.55)
    expect(imageBoxHeightFraction('a4')).toBe(0.55)
    expect(imageBoxHeightFraction('mini-5x7')).toBe(0.55)
    expect(imageBoxHeightFraction('square-6')).toBe(0.55)
  })
})

describe('resolveCoverImageUrl', () => {
  it('returns explicit coverImageUrl when present', () => {
    const book = {
      coverImageUrl: 'https://example.test/cover.jpg',
      pages: [{ images: [{ url: 'https://example.test/page1.jpg' }] }],
    } as unknown as Book
    expect(resolveCoverImageUrl(book)).toBe('https://example.test/cover.jpg')
  })

  it('falls back to first page image when no coverImageUrl', () => {
    const book = {
      pages: [{ images: [{ url: 'https://example.test/page1.jpg' }] }],
    } as unknown as Book
    expect(resolveCoverImageUrl(book)).toBe('https://example.test/page1.jpg')
  })

  it('skips pages with no images in the fallback', () => {
    const book = {
      pages: [
        { images: [] },
        { images: [{ url: 'https://example.test/page2.jpg' }] },
      ],
    } as unknown as Book
    expect(resolveCoverImageUrl(book)).toBe('https://example.test/page2.jpg')
  })

  it('returns undefined when no coverImageUrl and no page images', () => {
    const book = { pages: [{ images: [] }] } as unknown as Book
    expect(resolveCoverImageUrl(book)).toBeUndefined()
  })
})

describe('shouldRenderPageNumbers', () => {
  it('shows numbers on letter when enabled', () => {
    expect(shouldRenderPageNumbers('letter', true)).toBe(true)
  })

  it('shows numbers on a4 when enabled', () => {
    expect(shouldRenderPageNumbers('a4', true)).toBe(true)
  })

  it('shows numbers on booklet when enabled', () => {
    expect(shouldRenderPageNumbers('booklet', true)).toBe(true)
  })

  it('suppresses numbers on picture-book formats even when enabled', () => {
    expect(shouldRenderPageNumbers('half-letter', true)).toBe(false)
    expect(shouldRenderPageNumbers('mini-5x7', true)).toBe(false)
    expect(shouldRenderPageNumbers('square-6', true)).toBe(false)
  })

  it('suppresses numbers on document formats when disabled', () => {
    expect(shouldRenderPageNumbers('letter', false)).toBe(false)
    expect(shouldRenderPageNumbers('a4', false)).toBe(false)
    expect(shouldRenderPageNumbers('booklet', false)).toBe(false)
  })
})

describe('pageNumberLabel', () => {
  it('returns 1-based index string for content pages', () => {
    const page: LogicalPage = { type: 'content', page: {} as never, index: 0 }
    expect(pageNumberLabel(page)).toBe('1')
  })

  it('returns correct number for later pages', () => {
    const page: LogicalPage = { type: 'content', page: {} as never, index: 4 }
    expect(pageNumberLabel(page)).toBe('5')
  })

  it('returns null for cover', () => {
    expect(pageNumberLabel({ type: 'cover' })).toBeNull()
  })

  it('returns null for back', () => {
    expect(pageNumberLabel({ type: 'back' })).toBeNull()
  })

  it('returns null for sight-words', () => {
    expect(pageNumberLabel({ type: 'sight-words' })).toBeNull()
  })

  it('returns null for blank', () => {
    expect(pageNumberLabel({ type: 'blank' })).toBeNull()
  })
})

describe('textSizeFor', () => {
  it('returns largest size for short text with plenty of space', () => {
    const result = textSizeFor(50, 200, false)
    expect(result.fontSize).toBe(16)
    expect(result.lineHeight).toBe(1.6)
  })

  it('returns smaller size for narrow pages', () => {
    const narrow = textSizeFor(50, 200, true)
    const wide = textSizeFor(50, 200, false)
    expect(narrow.fontSize).toBeLessThan(wide.fontSize)
  })

  it('shrinks for very long text', () => {
    const result = textSizeFor(500, 200, false)
    expect(result.fontSize).toBe(10)
  })

  it('shrinks for very short available height', () => {
    const result = textSizeFor(100, 30, false)
    expect(result.fontSize).toBe(10)
  })

  it('progresses through sizes as text gets longer', () => {
    const sizes = [50, 150, 250, 350, 450].map(
      (len) => textSizeFor(len, 200, false).fontSize,
    )
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1])
    }
  })
})

describe('fitInBox', () => {
  it('scales image down to fit the box', () => {
    const result = fitInBox(200, 100, 100, 100)
    expect(result.w).toBe(100)
    expect(result.h).toBe(50)
  })

  it('scales by height when image is taller than wide', () => {
    const result = fitInBox(100, 200, 100, 100)
    expect(result.w).toBe(50)
    expect(result.h).toBe(100)
  })

  it('returns exact box size for matching aspect ratio', () => {
    const result = fitInBox(200, 100, 100, 50)
    expect(result.w).toBe(100)
    expect(result.h).toBe(50)
  })

  it('does not enlarge beyond box size', () => {
    const result = fitInBox(50, 25, 100, 100)
    expect(result.w).toBe(100)
    expect(result.h).toBe(50)
  })
})

describe('centerInBox', () => {
  it('centers a smaller image in a larger box', () => {
    const result = centerInBox(0, 0, 100, 100, { w: 50, h: 50 })
    expect(result.x).toBe(25)
    expect(result.y).toBe(25)
  })

  it('returns box origin when fit matches box exactly', () => {
    const result = centerInBox(10, 20, 100, 50, { w: 100, h: 50 })
    expect(result.x).toBe(10)
    expect(result.y).toBe(20)
  })

  it('offsets from box origin, not from 0', () => {
    const result = centerInBox(50, 50, 100, 100, { w: 60, h: 40 })
    expect(result.x).toBe(70) // 50 + (100-60)/2
    expect(result.y).toBe(80) // 50 + (100-40)/2
  })
})

describe('shouldRenderPlainSightWordText', () => {
  it('returns true when no sight words', () => {
    expect(shouldRenderPlainSightWordText(new Set(), 'highlighted')).toBe(true)
  })

  it('returns true when style is plain', () => {
    expect(shouldRenderPlainSightWordText(new Set(['the', 'and']), 'plain')).toBe(true)
  })

  it('returns false when words exist and style is highlighted', () => {
    expect(shouldRenderPlainSightWordText(new Set(['the']), 'highlighted')).toBe(false)
  })
})

describe('getSightWordChipColors', () => {
  it('returns dark colors for Lincoln', () => {
    const colors = getSightWordChipColors(true)
    expect(colors.bg).toBe('#1a3a4a')
    expect(colors.text).toBe('#ffffff')
  })

  it('returns light colors for non-Lincoln', () => {
    const colors = getSightWordChipColors(false)
    expect(colors.bg).toBe('#fce4ec')
    expect(colors.text).toBe('#333333')
  })
})

describe('sightWordsFooterText', () => {
  it('says just "look for these words" with no omissions', () => {
    expect(sightWordsFooterText(0)).toBe('Look for these words as you read!')
  })

  it('mentions the omitted count', () => {
    expect(sightWordsFooterText(5)).toBe(
      'Look for these words as you read! (and 5 more)',
    )
  })
})

describe('buildLogicalPages', () => {
  const book = {
    pages: [
      { id: 'p1', images: [] },
      { id: 'p2', images: [] },
    ],
  } as unknown as Book

  it('builds content pages for all book pages', () => {
    const pages = buildLogicalPages(book, false, false, false)
    expect(pages).toHaveLength(2)
    expect(pages[0].type).toBe('content')
    expect(pages[1].type).toBe('content')
  })

  it('prepends cover when includeCover is true', () => {
    const pages = buildLogicalPages(book, true, false, false)
    expect(pages[0].type).toBe('cover')
    expect(pages).toHaveLength(3)
  })

  it('includes sight-words page after cover', () => {
    const pages = buildLogicalPages(book, true, true, false)
    expect(pages[0].type).toBe('cover')
    expect(pages[1].type).toBe('sight-words')
    expect(pages).toHaveLength(4)
  })

  it('appends back cover when includeBackCover is true', () => {
    const pages = buildLogicalPages(book, false, false, true)
    expect(pages[pages.length - 1].type).toBe('back')
    expect(pages).toHaveLength(3)
  })

  it('builds full sequence: cover, sight-words, content, back', () => {
    const pages = buildLogicalPages(book, true, true, true)
    expect(pages.map((p) => p.type)).toEqual([
      'cover',
      'sight-words',
      'content',
      'content',
      'back',
    ])
  })

  it('indexes content pages from 0', () => {
    const pages = buildLogicalPages(book, true, true, false)
    const content = pages.filter((p) => p.type === 'content')
    expect(content[0]).toEqual(expect.objectContaining({ type: 'content', index: 0 }))
    expect(content[1]).toEqual(expect.objectContaining({ type: 'content', index: 1 }))
  })
})
