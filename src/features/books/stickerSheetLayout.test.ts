import { describe, expect, it } from 'vitest'

import {
  STICKER_PAGE_SIZES,
  STICKER_SIZES,
  SHEET_MARGIN_MM,
  SHEET_GAP_MM,
  computeStickerSheetLayout,
  cellPosition,
  stickerSizeToken,
  stickerSheetFileName,
} from './stickerSheetLayout'
import type { StickerSizeId } from './stickerSheetLayout'

describe('computeStickerSheetLayout', () => {
  it('packs a centered grid that fits inside the page margins', () => {
    const layout = computeStickerSheetLayout(20, 'letter', 'medium')

    // Grid must physically fit within the usable area.
    const page = STICKER_PAGE_SIZES.letter
    const cell = STICKER_SIZES.medium.cellMM
    const gridW = layout.cols * cell + (layout.cols - 1) * SHEET_GAP_MM
    const gridH = layout.rowsPerPage * cell + (layout.rowsPerPage - 1) * SHEET_GAP_MM
    expect(gridW).toBeLessThanOrEqual(page.widthMM - SHEET_MARGIN_MM * 2 + 1e-9)
    expect(gridH).toBeLessThanOrEqual(page.heightMM - SHEET_MARGIN_MM * 2 + 1e-9)

    // Centered horizontally, top-aligned vertically.
    expect(layout.startXMM).toBeCloseTo((page.widthMM - gridW) / 2, 6)
    expect(layout.startYMM).toBe(SHEET_MARGIN_MM)
    expect(layout.perPage).toBe(layout.cols * layout.rowsPerPage)
  })

  it('fits more small stickers per page than large ones', () => {
    const small = computeStickerSheetLayout(1, 'letter', 'small')
    const large = computeStickerSheetLayout(1, 'letter', 'large')
    expect(small.perPage).toBeGreaterThan(large.perPage)
  })

  it('computes page count from the per-page capacity', () => {
    const layout = computeStickerSheetLayout(0, 'letter', 'medium')
    // Empty still yields one page; capacity-derived ceilings otherwise.
    expect(computeStickerSheetLayout(0, 'letter', 'medium').pageCount).toBe(1)
    expect(computeStickerSheetLayout(1, 'letter', 'medium').pageCount).toBe(1)
    expect(computeStickerSheetLayout(layout.perPage, 'letter', 'medium').pageCount).toBe(1)
    expect(computeStickerSheetLayout(layout.perPage + 1, 'letter', 'medium').pageCount).toBe(2)
  })

  it('always yields at least one column and row', () => {
    const layout = computeStickerSheetLayout(5, 'a4', 'large')
    expect(layout.cols).toBeGreaterThanOrEqual(1)
    expect(layout.rowsPerPage).toBeGreaterThanOrEqual(1)
  })

  it('places cells left-to-right, top-to-bottom with the configured gap', () => {
    const layout = computeStickerSheetLayout(10, 'letter', 'medium')

    const first = cellPosition(layout, 0)
    expect(first.xMM).toBeCloseTo(layout.startXMM, 6)
    expect(first.yMM).toBeCloseTo(layout.startYMM, 6)

    // Second cell in the same row is one (cell + gap) to the right.
    const second = cellPosition(layout, 1)
    expect(second.xMM).toBeCloseTo(layout.startXMM + layout.cellMM + SHEET_GAP_MM, 6)
    expect(second.yMM).toBeCloseTo(layout.startYMM, 6)

    // First cell of the next row wraps back to startX, one row down.
    const nextRow = cellPosition(layout, layout.cols)
    expect(nextRow.xMM).toBeCloseTo(layout.startXMM, 6)
    expect(nextRow.yMM).toBeCloseTo(layout.startYMM + layout.cellMM + SHEET_GAP_MM, 6)
  })
})

describe('stickerSizeToken', () => {
  const ALL_SIZES = Object.keys(STICKER_SIZES) as StickerSizeId[]

  it('names each configured size in inches', () => {
    expect(stickerSizeToken('small')).toBe('1.5in')
    expect(stickerSizeToken('medium')).toBe('2in')
    expect(stickerSizeToken('large')).toBe('3in')
  })

  it('derives the inch value from the same cellMM the sheet lays out with', () => {
    // The point of the token: it can never drift from the artwork. Recompute it
    // straight from the layout's cell size and it must match.
    for (const size of ALL_SIZES) {
      const cellMM = computeStickerSheetLayout(1, 'letter', size).cellMM
      expect(stickerSizeToken(size)).toBe(`${Math.round((cellMM / 25.4) * 10) / 10}in`)
    }
  })

  it('gives every size a distinct token', () => {
    const tokens = ALL_SIZES.map(stickerSizeToken)
    expect(new Set(tokens).size).toBe(ALL_SIZES.length)
  })

  it('never emits a trailing ".0"', () => {
    for (const size of ALL_SIZES) expect(stickerSizeToken(size)).not.toMatch(/\.0in$/)
  })
})

describe('stickerSheetFileName', () => {
  const ALL_SIZES = Object.keys(STICKER_SIZES) as StickerSizeId[]

  it('appends the print size to the stem', () => {
    expect(stickerSheetFileName('sticker-sheet', 'medium')).toBe('sticker-sheet-2in.pdf')
    expect(stickerSheetFileName('Green Dragon', 'small')).toBe('green-dragon-1.5in.pdf')
    expect(stickerSheetFileName('Lincoln Stickers', 'large')).toBe('lincoln-stickers-3in.pdf')
  })

  it('produces one distinct name per size for the same stem', () => {
    const names = ALL_SIZES.map((size) => stickerSheetFileName('sticker-sheet', size))
    expect(names).toEqual(['sticker-sheet-1.5in.pdf', 'sticker-sheet-2in.pdf', 'sticker-sheet-3in.pdf'])
    expect(new Set(names).size).toBe(ALL_SIZES.length)
  })

  it('slugs unsafe characters out of the stem', () => {
    expect(stickerSheetFileName("London's Dino!! 🦖", 'medium')).toBe('london-s-dino-2in.pdf')
    expect(stickerSheetFileName('  spaced  out  ', 'medium')).toBe('spaced-out-2in.pdf')
    for (const size of ALL_SIZES) {
      expect(stickerSheetFileName('a/b\\c:d*e?f"g<h>i|j', size)).toMatch(/^[a-z0-9.-]+\.pdf$/)
    }
  })

  it('falls back to "stickers" when the stem slugs away to nothing', () => {
    expect(stickerSheetFileName('', 'medium')).toBe('stickers-2in.pdf')
    expect(stickerSheetFileName('🦖✨', 'medium')).toBe('stickers-2in.pdf')
    expect(stickerSheetFileName('---', 'medium')).toBe('stickers-2in.pdf')
  })

  it('does not double the extension when the stem already carries one', () => {
    expect(stickerSheetFileName('sticker-sheet.pdf', 'medium')).toBe('sticker-sheet-2in.pdf')
    expect(stickerSheetFileName('dino.PNG', 'medium')).toBe('dino-2in.pdf')
    for (const size of ALL_SIZES) {
      expect(stickerSheetFileName('dino.jpeg', size).match(/\.pdf/g)).toHaveLength(1)
    }
  })

  it('is stable across repeated calls', () => {
    for (const size of ALL_SIZES) {
      const once = stickerSheetFileName('Green Dragon', size)
      expect(stickerSheetFileName('Green Dragon', size)).toBe(once)
      expect(stickerSheetFileName('Green Dragon', size)).toBe(once)
    }
  })
})
