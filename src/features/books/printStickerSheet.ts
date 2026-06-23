import { jsPDF } from 'jspdf'
import type { Sticker } from '../../core/types'
import { fetchAsDataUri } from './imageDataUri'
import {
  STICKER_PAGE_SIZES,
  SHEET_GAP_MM,
  computeStickerSheetLayout,
  cellPosition,
} from './stickerSheetLayout'
import type { StickerPageSize, StickerSizeId } from './stickerSheetLayout'

/* ───────────────────── image helpers ───────────────────── */

function getImageDimensions(dataUri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = reject
    img.src = dataUri
  })
}

/** Contain-fit `imgW×imgH` inside `boxW×boxH`, preserving aspect ratio. */
function fitInBox(imgW: number, imgH: number, boxW: number, boxH: number): { w: number; h: number } {
  const scale = Math.min(boxW / imgW, boxH / imgH)
  return { w: imgW * scale, h: imgH * scale }
}

export interface PrintStickerSheetOptions {
  pageSize: StickerPageSize
  stickerSize: StickerSizeId
  /** Filename stem (no extension). Defaults to "stickers". */
  fileName?: string
}

/** Result of a sticker-sheet print run. `skippedImageCount` = stickers whose
 *  image couldn't be embedded (Firebase SDK + CORS fetch both failed). */
export interface PrintStickerSheetResult {
  skippedImageCount: number
  pageCount: number
}

/**
 * Render one or more stickers onto a printable PDF sheet (FEAT-33). Stickers are
 * laid out in a centered grid on a WHITE background (sticker paper / ink-saving),
 * each contained in a square cell sized for cutting. A single sticker uses the
 * same path with a one-cell grid. Reuses `printBook`'s CORS-safe image loader.
 */
export async function printStickerSheet(
  stickers: Sticker[],
  opts: PrintStickerSheetOptions,
): Promise<PrintStickerSheetResult> {
  const items = stickers.filter((s) => s.url || s.storagePath)
  const layout = computeStickerSheetLayout(items.length, opts.pageSize, opts.stickerSize)
  const page = STICKER_PAGE_SIZES[opts.pageSize]

  // Pre-fetch all images as base64 to dodge CORS (Firebase-SDK-first).
  const dataUris = await Promise.all(items.map((s) => fetchAsDataUri(s.url, s.storagePath)))
  const skippedImageCount = dataUris.filter((u) => !u.startsWith('data:')).length

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [page.widthMM, page.heightMM] })

  const fillWhite = () => {
    pdf.setFillColor(255, 255, 255)
    pdf.rect(0, 0, page.widthMM, page.heightMM, 'F')
  }
  fillWhite()

  for (let i = 0; i < items.length; i++) {
    const indexOnPage = i % layout.perPage
    if (i > 0 && indexOnPage === 0) {
      pdf.addPage([page.widthMM, page.heightMM], 'portrait')
      fillWhite()
    }

    const dataUri = dataUris[i]
    if (!dataUri.startsWith('data:')) continue // couldn't embed — leave the cell blank

    const { xMM, yMM } = cellPosition(layout, indexOnPage, SHEET_GAP_MM)
    try {
      const dims = await getImageDimensions(dataUri)
      const fit = fitInBox(dims.width, dims.height, layout.cellMM, layout.cellMM)
      // Center the sticker within its square cell (contain-fit).
      const drawX = xMM + (layout.cellMM - fit.w) / 2
      const drawY = yMM + (layout.cellMM - fit.h) / 2
      pdf.addImage(dataUri, drawX, drawY, fit.w, fit.h)
    } catch {
      // Skip on failure — the cell stays blank.
    }
  }

  const slug = (opts.fileName || 'stickers')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  pdf.save(`${slug || 'stickers'}.pdf`)

  return { skippedImageCount, pageCount: layout.pageCount }
}
