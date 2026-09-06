import { describe, it, expect } from 'vitest'
import {
  BLANK_PAGE,
  duplexSides,
  imposeBooklet,
  padToSignature,
} from '../bookletImposition'
import type { LogicalPage } from '../bookletImposition'

const cover: LogicalPage = { type: 'cover' }
const back: LogicalPage = { type: 'back' }
const page = (n: number): LogicalPage => ({
  type: 'content',
  page: {
    id: `p${n}`,
    text: `Page ${n}`,
    images: [],
    pageNumber: n,
    layout: 'image-top' as const,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
  index: n,
})

// ── padToSignature ──────────────────────────────────────────────

describe('padToSignature', () => {
  it('returns a copy unchanged when already a multiple of 4', () => {
    const pages = [cover, page(1), page(2), back]
    const padded = padToSignature(pages)
    expect(padded).toEqual(pages)
    expect(padded).not.toBe(pages)
  })

  it('pads to the next multiple of 4 with blanks', () => {
    const pages = [cover, page(1)]
    const padded = padToSignature(pages)
    expect(padded).toHaveLength(4)
    expect(padded[2]).toEqual(BLANK_PAGE)
    expect(padded[3]).toEqual(BLANK_PAGE)
  })

  it('inserts blanks BEFORE the back cover when the last page is type back', () => {
    const pages = [cover, page(1), back]
    const padded = padToSignature(pages)
    expect(padded).toHaveLength(4)
    expect(padded[0]).toEqual(cover)
    expect(padded[1]).toEqual(page(1))
    expect(padded[2]).toEqual(BLANK_PAGE)
    expect(padded[3]).toEqual(back)
  })

  it('appends blanks at the end when the last page is NOT back', () => {
    const pages = [cover, page(1), page(2), page(3), page(4)]
    const padded = padToSignature(pages)
    expect(padded).toHaveLength(8)
    expect(padded[5]).toEqual(BLANK_PAGE)
    expect(padded[6]).toEqual(BLANK_PAGE)
    expect(padded[7]).toEqual(BLANK_PAGE)
  })

  it('handles an empty array', () => {
    expect(padToSignature([])).toEqual([])
  })

  it('pads a single page to 4', () => {
    const padded = padToSignature([cover])
    expect(padded).toHaveLength(4)
    expect(padded[0]).toEqual(cover)
  })
})

// ── imposeBooklet ───────────────────────────────────────────────

describe('imposeBooklet', () => {
  it('returns an empty array for an empty input', () => {
    expect(imposeBooklet([])).toEqual([])
  })

  it('produces one sheet for 4 pages', () => {
    const pages = [cover, page(1), page(2), back]
    const sheets = imposeBooklet(pages)
    expect(sheets).toHaveLength(1)
    const s = sheets[0]
    expect(s.sheet).toBe(1)
    // Front: [last, first] = [back, cover]
    expect(s.front[0]).toEqual(back)
    expect(s.front[1]).toEqual(cover)
    // Back: [second, second-to-last] = [page(1), page(2)]
    expect(s.back[0]).toEqual(page(1))
    expect(s.back[1]).toEqual(page(2))
  })

  it('produces two sheets for 8 pages', () => {
    const pages = [cover, page(1), page(2), page(3), page(4), page(5), page(6), back]
    const sheets = imposeBooklet(pages)
    expect(sheets).toHaveLength(2)

    // Sheet 1 (outermost): front = [page 8 (back), page 1 (cover)]
    expect(sheets[0].front[0]).toEqual(back)
    expect(sheets[0].front[1]).toEqual(cover)
    // Sheet 1 back = [page 2 (page(1)), page 7 (page(6))]
    expect(sheets[0].back[0]).toEqual(page(1))
    expect(sheets[0].back[1]).toEqual(page(6))

    // Sheet 2 (inner): front = [page 6 (page(5)), page 3 (page(2))]
    expect(sheets[1].front[0]).toEqual(page(5))
    expect(sheets[1].front[1]).toEqual(page(2))
    // Sheet 2 back = [page 4 (page(3)), page 5 (page(4))]
    expect(sheets[1].back[0]).toEqual(page(3))
    expect(sheets[1].back[1]).toEqual(page(4))
  })

  it('pads a non-multiple-of-4 input automatically', () => {
    const pages = [cover, page(1), page(2)]
    const sheets = imposeBooklet(pages)
    expect(sheets).toHaveLength(1)
    // padded = [cover, page(1), page(2), blank]
    // front = [page 4 (blank), page 1 (cover)]
    expect(sheets[0].front[1]).toEqual(cover)
    expect(sheets[0].front[0]).toEqual(BLANK_PAGE)
  })

  it('every logical page appears exactly once across all sheet faces', () => {
    const pages = [cover, page(1), page(2), page(3), page(4), page(5), page(6), back]
    const sheets = imposeBooklet(pages)
    const all: LogicalPage[] = sheets.flatMap((s) => [...s.front, ...s.back])
    expect(all).toHaveLength(8)
    for (const p of pages) {
      expect(all).toContainEqual(p)
    }
  })

  it('the cover is always on the right side of sheet 1 front', () => {
    for (const count of [4, 8, 12]) {
      const pages: LogicalPage[] = [cover]
      for (let i = 1; i < count - 1; i++) pages.push(page(i))
      pages.push(back)
      const sheets = imposeBooklet(pages)
      expect(sheets[0].front[1]).toEqual(cover)
    }
  })

  it('the back cover is always on the left side of sheet 1 front', () => {
    for (const count of [4, 8, 12]) {
      const pages: LogicalPage[] = [cover]
      for (let i = 1; i < count - 1; i++) pages.push(page(i))
      pages.push(back)
      const sheets = imposeBooklet(pages)
      expect(sheets[0].front[0]).toEqual(back)
    }
  })

  it('reading order is correct for 4, 8, 12, and padded 14-page signatures', () => {
    for (const count of [4, 8, 12, 14]) {
      const pages: LogicalPage[] = []
      for (let i = 0; i < count; i++) pages.push(page(i))
      const sheets = imposeBooklet(pages)
      const padded = padToSignature(pages)

      // Extract all pages from the imposed sheets in reading order:
      // reading a saddle-stitched book means walking the sheets from outermost
      // to innermost, and within each sheet: front-right, back-left, back-right,
      // front-left of the NEXT sheet ... all the way to the center.
      const readOrder: LogicalPage[] = []
      for (let k = 0; k < sheets.length; k++) {
        readOrder.push(sheets[k].front[1]) // right side of front (first page of pair)
        readOrder.push(sheets[k].back[0])  // left side of back
      }
      // Then read from center back out
      for (let k = sheets.length - 1; k >= 0; k--) {
        readOrder.push(sheets[k].back[1])  // right side of back
        readOrder.push(sheets[k].front[0]) // left side of front
      }

      // The reading order should be exactly the padded page sequence
      expect(readOrder).toEqual(padded)
    }
  })
})

// ── duplexSides ─────────────────────────────────────────────────

describe('duplexSides', () => {
  it('returns empty for no sheets', () => {
    expect(duplexSides([])).toEqual([])
  })

  it('interleaves front and back in duplex order', () => {
    const pages = [cover, page(1), page(2), page(3), page(4), page(5), page(6), back]
    const sheets = imposeBooklet(pages)
    const sides = duplexSides(sheets)
    expect(sides).toHaveLength(4)
    expect(sides[0].face).toBe('front')
    expect(sides[0].sheet).toBe(1)
    expect(sides[1].face).toBe('back')
    expect(sides[1].sheet).toBe(1)
    expect(sides[2].face).toBe('front')
    expect(sides[2].sheet).toBe(2)
    expect(sides[3].face).toBe('back')
    expect(sides[3].sheet).toBe(2)
  })

  it('each side carries the correct left/right pages', () => {
    const pages = [cover, page(1), page(2), back]
    const sheets = imposeBooklet(pages)
    const sides = duplexSides(sheets)
    expect(sides).toHaveLength(2)
    expect(sides[0].left).toEqual(back)
    expect(sides[0].right).toEqual(cover)
    expect(sides[1].left).toEqual(page(1))
    expect(sides[1].right).toEqual(page(2))
  })
})
