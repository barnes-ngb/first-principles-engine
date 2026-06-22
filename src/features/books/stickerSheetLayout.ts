/**
 * Pure grid-layout math for the sticker sheet PDF (FEAT-33). Kept separate from
 * `printStickerSheet.ts` (which owns image loading + jsPDF) so the packing math
 * is unit-testable without a DOM or jsPDF.
 */

/** Page sizes for the sticker sheet, in millimetres (portrait). */
export const STICKER_PAGE_SIZES = {
  letter: { label: 'Letter', widthMM: 215.9, heightMM: 279.4 },
  a4: { label: 'A4', widthMM: 210, heightMM: 297 },
} as const

export type StickerPageSize = keyof typeof STICKER_PAGE_SIZES

/** Sticker box sizes (the square cell each sticker is cut from), in millimetres. */
export const STICKER_SIZES = {
  small: { label: 'Small', cellMM: 38 }, // ~1.5"
  medium: { label: 'Medium', cellMM: 51 }, // ~2"
  large: { label: 'Large', cellMM: 76 }, // ~3"
} as const

export type StickerSizeId = keyof typeof STICKER_SIZES

/** Outer page margin (mm) and gap between sticker cells (mm). */
export const SHEET_MARGIN_MM = 10
export const SHEET_GAP_MM = 4

export interface StickerSheetLayout {
  /** Stickers per row. */
  cols: number
  /** Rows that fit on one page. */
  rowsPerPage: number
  /** Stickers per page (cols × rowsPerPage). */
  perPage: number
  /** Square cell size (mm). */
  cellMM: number
  /** Left edge of the first column (mm) — the grid is horizontally centered. */
  startXMM: number
  /** Top edge of the first row (mm). */
  startYMM: number
  /** Total pages needed for `count` stickers (>= 1). */
  pageCount: number
}

/**
 * Compute the sticker grid for a page size + sticker size. The grid is centered
 * horizontally and top-aligned (so partial last rows still cut cleanly).
 */
export function computeStickerSheetLayout(
  count: number,
  pageSize: StickerPageSize,
  stickerSize: StickerSizeId,
  marginMM: number = SHEET_MARGIN_MM,
  gapMM: number = SHEET_GAP_MM,
): StickerSheetLayout {
  const page = STICKER_PAGE_SIZES[pageSize]
  const cellMM = STICKER_SIZES[stickerSize].cellMM

  const usableW = page.widthMM - marginMM * 2
  const usableH = page.heightMM - marginMM * 2

  // A row of n cells spans n*cell + (n-1)*gap. Solve for the largest n that fits.
  const cols = Math.max(1, Math.floor((usableW + gapMM) / (cellMM + gapMM)))
  const rowsPerPage = Math.max(1, Math.floor((usableH + gapMM) / (cellMM + gapMM)))
  const perPage = cols * rowsPerPage

  // Center the columns horizontally; top-align the rows.
  const gridW = cols * cellMM + (cols - 1) * gapMM
  const startXMM = (page.widthMM - gridW) / 2
  const startYMM = marginMM

  const pageCount = Math.max(1, Math.ceil(Math.max(0, count) / perPage))

  return { cols, rowsPerPage, perPage, cellMM, startXMM, startYMM, pageCount }
}

/**
 * Top-left (x, y) in mm of the cell at `indexOnPage` (0-based, < perPage) for a
 * given layout, plus gap.
 */
export function cellPosition(
  layout: StickerSheetLayout,
  indexOnPage: number,
  gapMM: number = SHEET_GAP_MM,
): { xMM: number; yMM: number } {
  const col = indexOnPage % layout.cols
  const row = Math.floor(indexOnPage / layout.cols)
  return {
    xMM: layout.startXMM + col * (layout.cellMM + gapMM),
    yMM: layout.startYMM + row * (layout.cellMM + gapMM),
  }
}
