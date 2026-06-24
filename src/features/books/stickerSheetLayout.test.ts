import { describe, expect, it } from 'vitest'

import {
  STICKER_PAGE_SIZES,
  STICKER_SIZES,
  SHEET_MARGIN_MM,
  SHEET_GAP_MM,
  computeStickerSheetLayout,
  cellPosition,
} from './stickerSheetLayout'

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
