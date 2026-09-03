import { jsPDF } from 'jspdf'
import type { Book, BookPage } from '../../core/types'
import { startStep } from '../../core/utils/perf'
import { fetchAsDataUri } from './imageDataUri'
import { stackOrder } from './draggableImageUtils'
import { hasFitBackdrop, resolveImageFit } from './imageFit'
import { duplexSides, imposeBooklet, type LogicalPage } from './bookletImposition'
import type { PrintSettings } from './PrintSettingsDialog'

export type { LogicalPage } from './bookletImposition'

/**
 * Blur radius (source pixels) for the FEAT-177 backdrop copy in the PDF. Larger
 * than the CSS value because it is applied to the full-resolution source image,
 * not to the ~100mm box it ends up occupying on the page.
 */
const PRINT_BACKDROP_BLUR_PX = 40

/* ───────────────────── page size & color constants ───────────────────── */

const PAGE_CONFIGS = {
  letter: { widthMM: 215.9, heightMM: 279.4, orientation: 'portrait' as const },
  'half-letter': { widthMM: 139.7, heightMM: 215.9, orientation: 'portrait' as const },
  a4: { widthMM: 210, heightMM: 297, orientation: 'portrait' as const },
  booklet: { widthMM: 279.4, heightMM: 215.9, orientation: 'landscape' as const },
  'mini-5x7': { widthMM: 127, heightMM: 177.8, orientation: 'portrait' as const },
  'square-6': { widthMM: 152.4, heightMM: 152.4, orientation: 'portrait' as const },
} as const

const MARGIN_MM = 12.7 // 0.5 inch

const BG_COLORS = {
  white: { bg: '#ffffff', text: '#333333', imgBg: '#f5f5f5', sightWordBg: '#BBDEFB' },
  cream: { bg: '#faf5ef', text: '#333333', imgBg: '#f0ebe3', sightWordBg: '#BBDEFB' },
  dark: { bg: '#1a1a2e', text: '#e0e0e0', imgBg: '#2a2a3e', sightWordBg: '#42A5F5' },
} as const

type Colors = (typeof BG_COLORS)[keyof typeof BG_COLORS]

const TRIM_MARK_LENGTH_MM = 3
const BLEED_MM = 6

/**
 * The booklet's finished page (FEAT-185): each half of the landscape letter
 * sheet is laid out as a 5.5 × 7 in page — the `mini-5x7` size, so one shape
 * is shared — and a dashed trim line across the sheet at this height says
 * where to cut. The strip below it (1.5 in) is waste; nothing of the book is
 * drawn there.
 */
const BOOKLET_TRIM_HEIGHT_MM = PAGE_CONFIGS['mini-5x7'].heightMM

/**
 * How much of a content page's height the picture box may take. The box is
 * also capped by its 3:2 width-derived height (`drawContentPage`), which is
 * the binding limit on every current format — the fraction is the ceiling for
 * a page whose content area is narrower than it is tall. The trimmed booklet
 * page is short, so it is allowed a larger share (FEAT-185).
 */
const IMAGE_BOX_HEIGHT_FRACTION = 0.55
const BOOKLET_IMAGE_BOX_HEIGHT_FRACTION = 0.6

export function imageBoxHeightFraction(pageSize: PrintSettings['pageSize']): number {
  return pageSize === 'booklet' ? BOOKLET_IMAGE_BOX_HEIGHT_FRACTION : IMAGE_BOX_HEIGHT_FRACTION
}

const DEFAULT_SETTINGS: PrintSettings = {
  pageSize: 'half-letter',
  background: 'white',
  sightWordStyle: 'highlighted',
  trimMarks: false,
  includeCover: true,
  includePageNumbers: true,
  includeAuthor: true,
  includeBackCover: false,
}

export interface PrintBookOptions {
  childName: string
  isLincoln: boolean
  sightWords?: string[]
  settings?: PrintSettings
}

/* ───────────────────── cover URL (FEAT-99 / FEAT-91) ───────────────────── */

/**
 * The cover image URL: the explicit `coverImageUrl`, else the first page image
 * as a fallback. Single source of truth used by both the prefetch pass and
 * `drawCover` so they never disagree.
 *
 * A cover that reuses the first illustration is a picture-book convention. It
 * is NOT deduplicated off page 1 any more: FEAT-99's `contentImagesToDraw`
 * stripped the cover's fallback image from story page 1 so the cover would not
 * "read as two pages", and the owner's printed book (2026-09-03) showed the
 * cost — page 1 was a grey box with its stickers floating on nothing. Retired
 * by owner decision in FEAT-185; page 1 keeps its picture in every format.
 */
export function resolveCoverImageUrl(book: Book): string | undefined {
  return book.coverImageUrl ?? book.pages.find((p) => p.images.length > 0)?.images[0]?.url
}

/* ───────────────────── page-number placement (FEAT-99 / FEAT-185) ───────────────────── */

/**
 * Formats that keep printed page numbers. letter/a4 read as documents. The
 * booklet joined them in FEAT-185: its halves are now laid out as trimmed
 * 5.5 × 7 pages with the number bottom-centre INSIDE the trimmed page, above
 * the trim line — the reason it was suppressed (a number sitting in the
 * fold/trim zone) no longer holds. The single-page picture-book formats
 * (half-letter, mini-5x7, square-6) stay suppressed regardless of the
 * `includePageNumbers` toggle: a bottom-centre number on a small folded
 * storybook reads as clutter, and those pages have no trim line to sit above.
 */
const PAGE_NUMBER_FORMATS: ReadonlySet<PrintSettings['pageSize']> = new Set([
  'letter',
  'a4',
  'booklet',
])

export function shouldRenderPageNumbers(
  pageSize: PrintSettings['pageSize'],
  includePageNumbers: boolean,
): boolean {
  return includePageNumbers && PAGE_NUMBER_FORMATS.has(pageSize)
}

/**
 * The number printed on a logical page, or `null` for pages that carry none.
 * Only story pages are numbered, and the number is the story page number
 * (`index + 1`) — never the imposed sheet position. Cover, sight-words page,
 * back cover and imposition blanks are unnumbered (FEAT-185).
 */
export function pageNumberLabel(logicalPage: LogicalPage): string | null {
  return logicalPage.type === 'content' ? String(logicalPage.index + 1) : null
}

/* ───────────────────── text sizing ───────────────────── */

/**
 * Font size + line height for a content page's story text, by text length and
 * the height left under the picture. Narrower page formats (half-letter,
 * mini-5x7, booklet halves) take smaller base sizes so lines don't clip on the
 * right edge. Exported so the booklet's trimmed page (FEAT-185) can be checked
 * against the untrimmed one: with the shorter page the London six-page example
 * must land on the same size, not a smaller one.
 */
export function textSizeFor(
  textLen: number,
  availableTextH: number,
  isNarrowPage: boolean,
): { fontSize: number; lineHeight: number } {
  if (textLen > 400 || availableTextH < 40) {
    return { fontSize: isNarrowPage ? 9 : 10, lineHeight: 1.35 }
  }
  if (textLen > 300 || availableTextH < 50) {
    return { fontSize: isNarrowPage ? 10 : 11, lineHeight: 1.4 }
  }
  if (textLen > 200) {
    return { fontSize: isNarrowPage ? 11 : 12, lineHeight: 1.45 }
  }
  if (textLen > 120) {
    return { fontSize: isNarrowPage ? 12 : 14, lineHeight: 1.5 }
  }
  return { fontSize: isNarrowPage ? 14 : 16, lineHeight: 1.6 }
}

/* ───────────────────── image pre-fetch (Firebase SDK) ───────────────────── */

/**
 * Pre-fetch all unique images in a book as base64 data URIs.
 */
async function prefetchBookImages(book: Book): Promise<Map<string, string>> {
  const entries: Array<{ url: string; storagePath?: string }> = []
  const seen = new Set<string>()

  const coverUrl = resolveCoverImageUrl(book)
  if (coverUrl && !seen.has(coverUrl)) {
    seen.add(coverUrl)
    const coverImg = book.pages.flatMap((p) => p.images).find((img) => img.url === coverUrl)
    entries.push({ url: coverUrl, storagePath: coverImg?.storagePath })
  }

  for (const page of book.pages) {
    for (const img of page.images) {
      if (img.url && !seen.has(img.url)) {
        seen.add(img.url)
        entries.push({ url: img.url, storagePath: img.storagePath })
      }
    }
  }

  const results = await Promise.all(
    entries.map(async ({ url, storagePath }) => {
      const dataUri = await fetchAsDataUri(url, storagePath)
      return [url, dataUri] as [string, string]
    }),
  )

  return new Map(results)
}

/* ───────────────────── image dimension helpers ───────────────────── */

function getImageDimensions(dataUri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = reject
    img.src = dataUri
  })
}

/**
 * Contain-fit: the largest size that fits inside the box without cropping.
 * Exported for tests — it is the geometry behind both a printed sticker and a
 * FEAT-177 background shown whole.
 */
export function fitInBox(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
): { w: number; h: number } {
  const scale = Math.min(boxW / imgW, boxH / imgH)
  return { w: imgW * scale, h: imgH * scale }
}

/**
 * Centre a contain-fitted image inside its box — the PDF equivalent of CSS
 * `object-fit: contain`. Exported for tests.
 */
export function centerInBox(
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  fit: { w: number; h: number },
): { x: number; y: number } {
  return { x: boxX + (boxW - fit.w) / 2, y: boxY + (boxH - fit.h) / 2 }
}

/** Crop an image data URI to a target aspect ratio (cover-fit) via offscreen canvas. */
function cropToAspect(
  dataUri: string,
  imgW: number,
  imgH: number,
  targetW: number,
  targetH: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const targetRatio = targetW / targetH
      const imgRatio = imgW / imgH
      let sx = 0, sy = 0, sw = imgW, sh = imgH
      if (imgRatio > targetRatio) {
        // Image is wider — crop sides
        sw = imgH * targetRatio
        sx = (imgW - sw) / 2
      } else {
        // Image is taller — crop top/bottom
        sh = imgW / targetRatio
        sy = (imgH - sh) / 2
      }
      const canvas = document.createElement('canvas')
      canvas.width = sw
      canvas.height = sh
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(dataUri); return }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = dataUri
  })
}

/**
 * Blur a data URI via an offscreen canvas — the print-side equivalent of the
 * screen's `filter: blur()` backdrop (FEAT-177).
 *
 * `ctx.filter` is the good path. Where it is unsupported (older canvas
 * implementations, and jsdom in tests) we downscale hard and draw back up:
 * bilinear resampling of a tiny image IS a blur, and it costs nothing.
 * Either way this only ever runs on the copy that sits *behind* the picture, so
 * a slightly different blur never affects what the reader actually looks at.
 */
function blurImageDataUri(dataUri: string, blurPx: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(dataUri); return }
      // `filter` is always in the DOM lib type but not always in the runtime.
      const supportsFilter = typeof (ctx as { filter?: unknown }).filter === 'string'
      if (supportsFilter) {
        ctx.filter = `blur(${blurPx}px)`
        ctx.drawImage(img, 0, 0, w, h)
      } else {
        // Downscale-then-upscale fallback.
        const small = document.createElement('canvas')
        const shrink = Math.max(2, blurPx)
        small.width = Math.max(1, Math.round(w / shrink))
        small.height = Math.max(1, Math.round(h / shrink))
        const smallCtx = small.getContext('2d')
        if (!smallCtx) { resolve(dataUri); return }
        smallCtx.drawImage(img, 0, 0, small.width, small.height)
        ctx.drawImage(small, 0, 0, small.width, small.height, 0, 0, w, h)
      }
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = dataUri
  })
}

/* ───────────────────── flip helper for PDF ───────────────────── */

/** Flip an image data URI horizontally/vertically via an offscreen canvas. */
function flipImageDataUri(
  dataUri: string,
  width: number,
  height: number,
  flipH: boolean,
  flipV: boolean,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(dataUri); return }
      ctx.translate(flipH ? width : 0, flipV ? height : 0)
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1)
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = dataUri
  })
}

/* ───────────────────── color helpers ───────────────────── */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ]
}

/* ───────────────────── background & trim marks ───────────────────── */

function drawBackground(
  pdf: jsPDF,
  bgColor: string,
  width: number,
  height: number,
  offsetX = 0,
  offsetY = 0,
): void {
  pdf.setFillColor(...hexToRgb(bgColor))
  pdf.rect(offsetX, offsetY, width, height, 'F')
}

function drawTrimMarks(pdf: jsPDF, pageW: number, pageH: number): void {
  const left = BLEED_MM
  const top = BLEED_MM
  const right = pageW - BLEED_MM
  const bottom = pageH - BLEED_MM

  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.25)

  pdf.line(left - TRIM_MARK_LENGTH_MM, top, left, top)
  pdf.line(left, top - TRIM_MARK_LENGTH_MM, left, top)
  pdf.line(right, top, right + TRIM_MARK_LENGTH_MM, top)
  pdf.line(right, top - TRIM_MARK_LENGTH_MM, right, top)
  pdf.line(left - TRIM_MARK_LENGTH_MM, bottom, left, bottom)
  pdf.line(left, bottom, left, bottom + TRIM_MARK_LENGTH_MM)
  pdf.line(right, bottom, right + TRIM_MARK_LENGTH_MM, bottom)
  pdf.line(right, bottom, right, bottom + TRIM_MARK_LENGTH_MM)
}

/* ───────────────────── text rendering ───────────────────── */

/** Points to mm conversion factor */
const PT_TO_MM = 0.3528

export function shouldRenderPlainSightWordText(
  sightWordSet: Set<string>,
  sightWordStyle: PrintSettings['sightWordStyle'],
): boolean {
  return sightWordSet.size === 0 || sightWordStyle === 'plain'
}

export function getSightWordChipColors(isLincoln: boolean): { bg: string; text: string } {
  return isLincoln
    ? { bg: '#1a3a4a', text: '#ffffff' }
    : { bg: '#fce4ec', text: '#333333' }
}

/**
 * Render text with optional sight word highlighting using direct jsPDF calls.
 * Returns the Y position after the last line.
 */
function renderText(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSizePt: number,
  lineHeightRatio: number,
  textColor: [number, number, number],
  sightWordSet: Set<string>,
  sightWordStyle: PrintSettings['sightWordStyle'],
  sightWordBgColor: [number, number, number],
  maxY?: number,
): number {
  const lineSpacing = fontSizePt * lineHeightRatio * PT_TO_MM

  pdf.setFont('times', 'normal')
  pdf.setFontSize(fontSizePt)
  pdf.setTextColor(...textColor)

  // Simple path: no sight word highlighting (`plain` is the print "Off" state)
  if (shouldRenderPlainSightWordText(sightWordSet, sightWordStyle)) {
    const lines: string[] = pdf.splitTextToSize(text, maxWidth)
    for (const line of lines) {
      if (maxY && y > maxY) break
      pdf.text(line, x, y)
      y += lineSpacing
    }
    return y
  }

  // Word-by-word rendering for sight word highlighting
  const words = text.split(/\s+/).filter(Boolean)
  let curX = x

  for (const word of words) {
    if (maxY && y > maxY) break

    // Check if the core word (without punctuation) is a sight word
    const coreMatch = word.match(/^([^a-zA-Z]*)([a-zA-Z]+)([^a-zA-Z]*)$/)
    const coreWord = coreMatch ? coreMatch[2] : ''
    const isSightWord = coreWord.length > 0 && sightWordSet.has(coreWord.toLowerCase())

    // Measure with the appropriate font
    pdf.setFont('times', isSightWord ? 'bold' : 'normal')
    pdf.setFontSize(fontSizePt)
    const wordWidth = pdf.getTextWidth(word)

    // Wrap to next line if needed
    if (curX + wordWidth > x + maxWidth && curX > x) {
      curX = x
      y += lineSpacing
      if (maxY && y > maxY) break
    }

    // Draw highlight background for sight words
    if (isSightWord && sightWordStyle === 'highlighted') {
      const pad = 0.8
      const bgH = fontSizePt * PT_TO_MM * 1.1
      const bgY = y - fontSizePt * PT_TO_MM * 0.78
      pdf.setFillColor(...sightWordBgColor)
      pdf.roundedRect(curX - pad, bgY, wordWidth + pad * 2, bgH, 0.8, 0.8, 'F')
    }

    // Draw the word
    pdf.setTextColor(...textColor)
    pdf.text(word, curX, y)

    // Advance cursor
    pdf.setFont('times', 'normal')
    pdf.setFontSize(fontSizePt)
    const spaceWidth = pdf.getTextWidth(' ')
    curX += wordWidth + spaceWidth
  }

  // Reset font
  pdf.setFont('times', 'normal')
  return y + lineSpacing
}

/* ───────────────────── PDF clipping helper ───────────────────── */

/**
 * Begin a rectangular clip region in the PDF.
 * Call `pdf.saveGraphicsState()` before and `pdf.restoreGraphicsState()` after
 * to scope the clip. Uses raw PDF operators because jsPDF has no direct clip API.
 */
function beginClipRect(pdf: jsPDF, x: number, y: number, w: number, h: number): void {
  // jsPDF's internal scale factor converts user units (mm) to PDF points.
  // The PDF coordinate system has its origin at the bottom-left corner, so
  // the y-axis must be flipped relative to the top-left origin jsPDF exposes.
  const k = (pdf as unknown as { internal: { scaleFactor: number; pageSize: { getHeight: () => number } } }).internal.scaleFactor
  const pageH = (pdf as unknown as { internal: { scaleFactor: number; pageSize: { getHeight: () => number } } }).internal.pageSize.getHeight()
  const px = x * k
  const py = (pageH - y - h) * k // flip y: PDF origin is bottom-left
  const pw = w * k
  const ph = h * k
  // 're' draws a rectangle path; 'W n' sets it as a clipping path
  ;(pdf as unknown as { internal: { write: (s: string) => void } }).internal.write(
    `${toFixed(px)} ${toFixed(py)} ${toFixed(pw)} ${toFixed(ph)} re W n`,
  )
}

/** Format a number to 4 decimal places for PDF operators. */
function toFixed(n: number): string {
  return n.toFixed(4)
}

/* ───────────────────── rotation helper ───────────────────── */

/**
 * Adjust (x, y) so that a jsPDF image rotation pivots around the image center
 * instead of the default pivot point.
 *
 * jsPDF internally translates to the BOTTOM-LEFT of the image in user
 * coordinates (x, y + h) before applying the rotation matrix.  CSS
 * `transform-origin: center center` rotates around the element's center, so we
 * need to solve for the (x, y) that keeps the visual center at (cx, cy) after
 * jsPDF's bottom-left-pivot rotation.
 *
 * Derivation (PDF y-up coords, user y-down coords):
 *   center_x_user = adjX + cos·w/2 − sin·h/2
 *   center_y_user = adjY + h − sin·w/2 − cos·h/2
 * Setting these equal to the desired center (cx, cy):
 *   adjX = cx − cos·w/2 + sin·h/2
 *   adjY = cy − h + sin·w/2 + cos·h/2
 */
function adjustForCenterRotation(
  x: number,
  y: number,
  w: number,
  h: number,
  rotationDeg: number,
): [number, number] {
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const cx = x + w / 2
  const cy = y + h / 2
  const adjX = cx - (w / 2) * cos + (h / 2) * sin
  const adjY = cy - h + (w / 2) * sin + (h / 2) * cos
  return [adjX, adjY]
}

/* ───────────────────── page drawing functions ───────────────────── */

interface ContentArea {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Try to add an image to the PDF from a data URI. Returns true if successful.
 */
async function tryAddImage(
  pdf: jsPDF,
  dataUri: string,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
  centerH?: boolean,
): Promise<{ success: boolean; bottomY: number }> {
  if (!dataUri.startsWith('data:')) {
    return { success: false, bottomY: y }
  }
  try {
    const dims = await getImageDimensions(dataUri)
    const fit = fitInBox(dims.width, dims.height, maxW, maxH)
    const imgX = centerH ? x + (maxW - fit.w) / 2 : x
    pdf.addImage(dataUri, imgX, y, fit.w, fit.h)
    return { success: true, bottomY: y + fit.h }
  } catch {
    return { success: false, bottomY: y }
  }
}

async function drawCover(
  pdf: jsPDF,
  book: Book,
  childName: string,
  colors: Colors,
  settings: PrintSettings,
  resolveUrl: (url: string) => string,
  area: ContentArea,
): Promise<void> {
  const textColor = hexToRgb(colors.text)
  const centerX = area.x + area.w / 2

  // Cover image
  const coverUrl = resolveCoverImageUrl(book)
  let contentY = area.y + area.h * 0.1

  if (coverUrl) {
    const dataUri = resolveUrl(coverUrl)
    const maxImgW = area.w * 0.75
    const maxImgH = area.h * 0.5
    const result = await tryAddImage(pdf, dataUri, area.x + (area.w - maxImgW) / 2, area.y + area.h * 0.06, maxImgW, maxImgH, true)
    if (result.success) {
      contentY = result.bottomY + 8
    }
  }

  // Title
  pdf.setFont('times', 'bold')
  pdf.setFontSize(24)
  pdf.setTextColor(...textColor)
  const titleLines: string[] = pdf.splitTextToSize(book.title, area.w * 0.85)
  const titleLineSpacing = 24 * 1.3 * PT_TO_MM
  for (let i = 0; i < titleLines.length; i++) {
    pdf.text(titleLines[i], centerX, contentY + i * titleLineSpacing, { align: 'center' })
  }

  // Author line
  if (settings.includeAuthor) {
    const authorY = contentY + titleLines.length * titleLineSpacing + 4
    pdf.setFont('times', 'italic')
    pdf.setFontSize(14)
    pdf.text(`By ${childName}`, centerX, authorY, { align: 'center' })
  }
}

/* ───────────────────── sight-words page layout (FEAT-185, Codex P2 on PR #1744) ───────────────────── */

/** Chip geometry at one scale step, all in mm except `fontSize` (pt). */
export interface SightWordChipScale {
  fontSize: number
  chipH: number
  chipPadX: number
  chipGap: number
}

/**
 * The scale steps the sight-words page may take, largest first. The first is
 * the page's historical size; the page steps down only when the list would
 * not fit the content height it is given.
 */
export const SIGHT_WORD_CHIP_SCALES: readonly SightWordChipScale[] = [
  { fontSize: 12, chipH: 8, chipPadX: 4, chipGap: 3 },
  { fontSize: 10, chipH: 7, chipPadX: 3, chipGap: 2.5 },
  { fontSize: 8, chipH: 6, chipPadX: 2.5, chipGap: 2 },
]

/** Chips start this far below the top of the content area (the title sits above). */
const SIGHT_WORDS_CHIPS_TOP_MM = 35
/** The footer baseline sits this far below the bottom of the last chip row. */
const SIGHT_WORDS_FOOTER_GAP_MM = 15

export interface SightWordChipLayout extends SightWordChipScale {
  /** Chip rows in reading order; each entry is `[word, chipWidthMm]`. */
  rows: Array<Array<[word: string, chipW: number]>>
  /** Words that did not fit even at the smallest scale — named in the footer. */
  omitted: string[]
  /** Y offset (from the top of the content area) of the footer baseline. */
  footerY: number
}

/**
 * Bound the sight-words page to the content area it is drawn into. Before
 * FEAT-185 `drawSightWordsPage` added 11 mm rows without ever reading
 * `area.h`, which was survivable on an 8.5 in half and is not on the
 * trimmed 7 in booklet page — the lower rows and the footer would land below
 * the cut line and be thrown away. This picks the largest scale at which
 * every chip row plus the footer fits; if none does, it keeps the rows that
 * fit at the smallest scale and reports the rest as `omitted` so the footer
 * can say so instead of silently losing them. Pure: `measure` is the only
 * thing that knows a font.
 */
export function layoutSightWordChips(
  words: readonly string[],
  measure: (word: string, fontSize: number) => number,
  areaW: number,
  areaH: number,
): SightWordChipLayout {
  const wrap = (scale: SightWordChipScale) => {
    const rows: Array<Array<[string, number]>> = []
    let row: Array<[string, number]> = []
    let curX = 0
    for (const word of words) {
      const chipW = measure(word, scale.fontSize) + scale.chipPadX * 2
      if (row.length > 0 && curX + chipW > areaW) {
        rows.push(row)
        row = []
        curX = 0
      }
      row.push([word, chipW])
      curX += chipW + scale.chipGap
    }
    if (row.length > 0) rows.push(row)
    return rows
  }
  const footerYFor = (scale: SightWordChipScale, rowCount: number) =>
    SIGHT_WORDS_CHIPS_TOP_MM +
    Math.max(0, rowCount - 1) * (scale.chipH + scale.chipGap) +
    scale.chipH +
    SIGHT_WORDS_FOOTER_GAP_MM

  for (const scale of SIGHT_WORD_CHIP_SCALES) {
    const rows = wrap(scale)
    const footerY = footerYFor(scale, rows.length)
    if (footerY <= areaH) {
      return { ...scale, rows, omitted: [], footerY }
    }
  }

  // Nothing fits whole: keep the rows that do at the smallest scale.
  const scale = SIGHT_WORD_CHIP_SCALES[SIGHT_WORD_CHIP_SCALES.length - 1]
  const rows = wrap(scale)
  const rowPitch = scale.chipH + scale.chipGap
  const maxRows = Math.max(
    1,
    Math.floor((areaH - SIGHT_WORDS_CHIPS_TOP_MM - scale.chipH - SIGHT_WORDS_FOOTER_GAP_MM) / rowPitch) + 1,
  )
  const kept = rows.slice(0, maxRows)
  const omitted = rows.slice(maxRows).flat().map(([word]) => word)
  return { ...scale, rows: kept, omitted, footerY: footerYFor(scale, kept.length) }
}

/** The footer line under the chips — names how many words did not fit, if any. */
export function sightWordsFooterText(omittedCount: number): string {
  return omittedCount > 0
    ? `Look for these words as you read! (and ${omittedCount} more)`
    : 'Look for these words as you read!'
}

function drawSightWordsPage(
  pdf: jsPDF,
  sightWords: string[],
  colors: Colors,
  isLincoln: boolean,
  area: ContentArea,
): void {
  if (sightWords.length === 0) return
  const pageTextColor = hexToRgb(colors.text)
  const chipColors = getSightWordChipColors(isLincoln)
  const chipBgColor = hexToRgb(chipColors.bg)
  const chipTextColor = hexToRgb(chipColors.text)
  const centerX = area.x + area.w / 2

  // Title
  pdf.setFont('times', 'bold')
  pdf.setFontSize(20)
  pdf.setTextColor(...pageTextColor)
  const title = isLincoln ? 'Words to Mine' : 'Words to Watch For'
  pdf.text(title, centerX, area.y + 20, { align: 'center' })

  // Word chips as rounded rectangles with text, bounded to the area's height.
  pdf.setFont('times', 'bold')
  const layout = layoutSightWordChips(
    sightWords,
    (word, fontSize) => {
      pdf.setFontSize(fontSize)
      return pdf.getTextWidth(word)
    },
    area.w,
    area.h,
  )
  const { chipH, chipPadX, chipGap } = layout
  pdf.setFontSize(layout.fontSize)
  let curY = area.y + SIGHT_WORDS_CHIPS_TOP_MM
  for (const row of layout.rows) {
    let curX = area.x
    for (const [word, chipW] of row) {
      // Draw chip background
      pdf.setFillColor(...chipBgColor)
      pdf.roundedRect(curX, curY, chipW, chipH, 2, 2, 'F')
      // Draw word text centered in chip
      pdf.setTextColor(...chipTextColor)
      pdf.text(word, curX + chipPadX, curY + chipH * 0.7)
      curX += chipW + chipGap
    }
    curY += chipH + chipGap
  }

  // Footer hint
  pdf.setFont('times', 'italic')
  pdf.setFontSize(10)
  pdf.setTextColor(...pageTextColor)
  pdf.text(sightWordsFooterText(layout.omitted.length), centerX, area.y + layout.footerY, { align: 'center' })
}

async function drawContentPage(
  pdf: jsPDF,
  page: BookPage,
  pageIndex: number,
  colors: Colors,
  settings: PrintSettings,
  sightWordSet: Set<string>,
  resolveUrl: (url: string) => string,
  area: ContentArea,
): Promise<void> {
  const textColor = hexToRgb(colors.text)
  let curY = area.y

  // Every image the page holds — including one the cover reuses (FEAT-185
  // retired FEAT-99's dedupe; see `resolveCoverImageUrl`).
  const pageImages = page.images

  // Render page images
  if (pageImages.length > 0) {
    // Lock to the same 3:2 aspect ratio used in editor + reader containers.
    // Derive height from available width so the container always fits.
    const IMAGE_ASPECT_RATIO = 3 / 2
    const imgAreaW = area.w
    const imgAreaH = Math.min(
      area.w / IMAGE_ASPECT_RATIO,
      area.h * imageBoxHeightFraction(settings.pageSize),
    )
    const imgAreaX = area.x

    // Draw bottom → top in the same unified stacking order as the editor and
    // reader, so a cross-type reorder (e.g. a background lifted above a
    // sticker) prints exactly as composed. Legacy books (no stored zIndex)
    // fall back to backgrounds-below-stickers, preserving prior print output.
    const sortedImages = stackOrder(pageImages)

    // Draw container background
    pdf.setFillColor(...hexToRgb(colors.imgBg))
    pdf.roundedRect(imgAreaX - 1.5, curY - 1.5, imgAreaW + 3, imgAreaH + 3, 2, 2, 'F')

    // Set a clipping rectangle matching the image container bounds.
    // This replicates the CSS `overflow: hidden` in the BookReader so stickers
    // that extend past the container edge are cropped instead of floating
    // in the page margin.
    pdf.saveGraphicsState()
    beginClipRect(pdf, imgAreaX, curY, imgAreaW, imgAreaH)

    for (const img of sortedImages) {
      let dataUri = resolveUrl(img.url)
      if (!dataUri.startsWith('data:')) continue
      try {
        const dims = await getImageDimensions(dataUri)
        const pos = img.position ?? { x: 0, y: 0, width: 100, height: 100 }

        // Convert percentage position to mm within the image area (using consistent aspect ratio).
        // Clamp negative positions so stickers don't render outside the container
        // even if a PDF viewer doesn't honour the clip rectangle.
        const rawX = pos.x
        const rawY = pos.y
        const clampedX = Math.max(0, rawX)
        const clampedY = Math.max(0, rawY)
        const clampedW = Math.min(pos.width, 100 - clampedX)
        const clampedH = Math.min(pos.height, 100 - clampedY)

        const imgX = imgAreaX + (clampedX / 100) * imgAreaW
        const imgY = curY + (clampedY / 100) * imgAreaH
        const imgW = (clampedW / 100) * imgAreaW
        const imgH = (clampedH / 100) * imgAreaH

        // Negate rotation: CSS rotate() treats positive as clockwise, but
        // jsPDF follows the PDF spec where positive rotation is counterclockwise.
        const rotation = -(pos.rotation ?? 0)
        const flipH = pos.flipH ?? false
        const flipV = pos.flipV ?? false

        // Apply flip via canvas if needed
        if (flipH || flipV) {
          dataUri = await flipImageDataUri(dataUri, dims.width, dims.height, flipH, flipV)
        }

        // How the image sits in its box — the SAME rule the editor, the reader
        // and the drag layer read (FEAT-177). Stickers are always contain-fit;
        // a background is cover-fit unless the parent asked to see it whole.
        if (resolveImageFit(img) === 'contain') {
          // A fitted background leaves space — fill it with a blurred copy of
          // itself first, so the print matches the screen instead of showing
          // white bars. Stickers never get one.
          if (hasFitBackdrop(img)) {
            try {
              const cropped = await cropToAspect(dataUri, dims.width, dims.height, imgW, imgH)
              const blurred = await blurImageDataUri(cropped, PRINT_BACKDROP_BLUR_PX)
              let bgX = imgX
              let bgY = imgY
              if (rotation !== 0) {
                ;[bgX, bgY] = adjustForCenterRotation(bgX, bgY, imgW, imgH, rotation)
              }
              pdf.addImage({ imageData: blurred, x: bgX, y: bgY, width: imgW, height: imgH, rotation })
            } catch {
              // Backdrop is decoration — never lose the picture over it.
            }
          }
          const fit = fitInBox(dims.width, dims.height, imgW, imgH)
          // Center within bounding box to match CSS object-fit: contain
          const centered = centerInBox(imgX, imgY, imgW, imgH, fit)
          let drawX = centered.x
          let drawY = centered.y
          if (rotation !== 0) {
            // jsPDF rotates around the bottom-left corner. Adjust coordinates so
            // the rotation pivots around the center, matching CSS transform-origin: center.
            ;[drawX, drawY] = adjustForCenterRotation(drawX, drawY, fit.w, fit.h, rotation)
          }
          pdf.addImage({ imageData: dataUri, x: drawX, y: drawY, width: fit.w, height: fit.h, rotation })
        } else {
          // Cover-fit: crop image to match the box aspect ratio, then fill entire box
          const cropped = await cropToAspect(dataUri, dims.width, dims.height, imgW, imgH)
          let drawX = imgX
          let drawY = imgY
          if (rotation !== 0) {
            ;[drawX, drawY] = adjustForCenterRotation(drawX, drawY, imgW, imgH, rotation)
          }
          pdf.addImage({ imageData: cropped, x: drawX, y: drawY, width: imgW, height: imgH, rotation })
        }
      } catch {
        // Skip image on failure
      }
    }

    // Restore graphics state to remove the clipping rectangle
    pdf.restoreGraphicsState()

    curY += imgAreaH + 6
  }

  // Render text with dynamic font sizing to prevent overflow
  if (page.text) {
    const textLen = page.text.length
    // Only reserve the bottom strip when a number actually prints there, so the
    // picture-book formats reclaim it for the story text (FEAT-99).
    const pageNumSpace = shouldRenderPageNumbers(settings.pageSize, settings.includePageNumbers) ? 6 : 0
    const maxTextY = area.y + area.h - pageNumSpace
    const availableTextH = maxTextY - curY

    // Scale font size and line height based on text length and available space.
    const isNarrowPage = area.w < 120 // mm — letter content is ~190mm, half-letter ~114mm
    const { fontSize, lineHeight } = textSizeFor(textLen, availableTextH, isNarrowPage)

    curY = renderText(
      pdf,
      page.text,
      area.x,
      curY,
      area.w,
      fontSize,
      lineHeight,
      textColor,
      sightWordSet,
      settings.sightWordStyle,
      hexToRgb(colors.sightWordBg),
      maxTextY,
    )
  }

  // Page number at bottom center — document formats + the trimmed booklet
  // page (FEAT-99 / FEAT-185). Always the story page number.
  const numberLabel = pageNumberLabel({ type: 'content', page, index: pageIndex })
  if (numberLabel && shouldRenderPageNumbers(settings.pageSize, settings.includePageNumbers)) {
    pdf.setFont('times', 'normal')
    pdf.setFontSize(12)
    pdf.setTextColor(...textColor)
    pdf.text(numberLabel, area.x + area.w / 2, area.y + area.h + 2, { align: 'center' })
  }
}

function drawBackCover(
  pdf: jsPDF,
  book: Book,
  childName: string,
  colors: Colors,
  area: ContentArea,
): void {
  const textColor = hexToRgb(colors.text)
  const centerX = area.x + area.w / 2
  const centerY = area.y + area.h / 2

  // "Made by" line
  pdf.setFont('times', 'bold')
  pdf.setFontSize(16)
  pdf.setTextColor(...textColor)
  pdf.text(`Made by ${childName}`, centerX, centerY - 10, { align: 'center' })

  // Date
  const dateStr = formatDate(book.createdAt)
  if (dateStr) {
    pdf.setFont('times', 'normal')
    pdf.setFontSize(11)
    pdf.text(dateStr, centerX, centerY + 2, { align: 'center' })
  }

  // Branding
  pdf.setFont('times', 'italic')
  pdf.setFontSize(9)
  pdf.setTextColor(textColor[0], textColor[1], textColor[2])
  pdf.text('A Barnes Bros + Sunny Book', centerX, centerY + 16, { align: 'center' })
}

/* ───────────────────── booklet rendering ───────────────────── */

/**
 * Build the ordered logical-page sequence for a book: cover (once) → sight-words
 * (if any) → each content page → back cover. Pure and read-only — the single
 * source of truth shared by the flat and booklet render paths, so the cover is
 * emitted exactly once regardless of format. The booklet path imposes THIS
 * sequence (`bookletImposition.ts`); the imposition never builds its own.
 */
export function buildLogicalPages(
  book: Book,
  includeCover: boolean,
  hasSightWords: boolean,
  includeBackCover: boolean,
): LogicalPage[] {
  const pages: LogicalPage[] = []
  if (includeCover) pages.push({ type: 'cover' })
  if (hasSightWords) pages.push({ type: 'sight-words' })
  book.pages.forEach((page, index) => pages.push({ type: 'content', page, index }))
  if (includeBackCover) pages.push({ type: 'back' })
  return pages
}

async function drawLogicalPage(
  pdf: jsPDF,
  logicalPage: LogicalPage,
  book: Book,
  childName: string,
  colors: Colors,
  settings: PrintSettings,
  sightWordSet: Set<string>,
  resolveUrl: (url: string) => string,
  area: ContentArea,
  isLincoln: boolean,
): Promise<void> {
  switch (logicalPage.type) {
    case 'cover':
      await drawCover(pdf, book, childName, colors, settings, resolveUrl, area)
      break
    case 'sight-words':
      drawSightWordsPage(pdf, [...sightWordSet], colors, isLincoln, area)
      break
    case 'content':
      await drawContentPage(pdf, logicalPage.page, logicalPage.index, colors, settings, sightWordSet, resolveUrl, area)
      break
    case 'back':
      drawBackCover(pdf, book, childName, colors, area)
      break
    case 'blank':
      // Imposition padding: the sheet background is already drawn.
      break
  }
}

/** Draw a dashed line between two points, 2 mm dash / 2 mm gap. */
function drawDashedLine(pdf: jsPDF, x1: number, y1: number, x2: number, y2: number): void {
  const dashLen = 2
  const gapLen = 2
  const dx = x2 - x1
  const dy = y2 - y1
  const length = Math.hypot(dx, dy)
  if (length === 0) return
  const ux = dx / length
  const uy = dy / length
  let pos = 0
  while (pos < length) {
    const end = Math.min(pos + dashLen, length)
    pdf.line(x1 + ux * pos, y1 + uy * pos, x1 + ux * end, y1 + uy * end)
    pos = end + gapLen
  }
}

/**
 * The booklet (FEAT-185): a saddle-stitched, fold-in-half book. Each landscape
 * letter sheet carries two logical pages per face, placed by
 * `imposeBooklet` so the stack folds into reading order; each half is laid out
 * as a trimmed 5.5 × 7 in page; a dashed trim line across the sheet says where
 * to cut and nothing of the book is drawn below it; the fold line runs down
 * the centre and stops at the trim line.
 */
async function renderBooklet(
  pdf: jsPDF,
  book: Book,
  childName: string,
  colors: Colors,
  settings: PrintSettings,
  sightWordSet: Set<string>,
  resolveUrl: (url: string) => string,
  bleedOffset: number,
  isLincoln: boolean,
): Promise<void> {
  const config = PAGE_CONFIGS.booklet
  const halfW = config.widthMM / 2
  const trimY = BOOKLET_TRIM_HEIGHT_MM + bleedOffset

  // Build logical page sequence (cover emitted exactly once), then impose it.
  const logicalPages = buildLogicalPages(
    book,
    settings.includeCover,
    sightWordSet.size > 0,
    settings.includeBackCover,
  )
  const sides = duplexSides(imposeBooklet(logicalPages))

  // Each half is a trimmed page: content sits inside the 5.5 × 7 in page's
  // margins, never inside the sheet's full height.
  const halfArea = (left: boolean): ContentArea => ({
    x: (left ? 0 : halfW) + MARGIN_MM + bleedOffset,
    y: MARGIN_MM + bleedOffset,
    w: halfW - MARGIN_MM * 2,
    h: BOOKLET_TRIM_HEIGHT_MM - MARGIN_MM * 2,
  })

  for (let i = 0; i < sides.length; i++) {
    if (i > 0) pdf.addPage()
    const side = sides[i]

    // Draw full sheet background (the waste strip below the trim line too —
    // it is cut away, and a page-coloured strip is what a trimmed edge wants).
    drawBackground(pdf, colors.bg, config.widthMM, config.heightMM, bleedOffset, bleedOffset)

    await drawLogicalPage(pdf, side.left, book, childName, colors, settings, sightWordSet, resolveUrl, halfArea(true), isLincoln)
    await drawLogicalPage(pdf, side.right, book, childName, colors, settings, sightWordSet, resolveUrl, halfArea(false), isLincoln)

    pdf.setDrawColor(200, 200, 200)
    pdf.setLineWidth(0.15)

    // Fold line (dashed), down the centre, stopping at the trim line.
    const foldX = halfW + bleedOffset
    drawDashedLine(pdf, foldX, bleedOffset, foldX, trimY)

    // Trim line (dashed, same colour) across the full sheet width at the
    // trimmed page height, with a small "cut" label at each edge. The labels
    // sit in the waste strip, just under the line, so they leave with it.
    drawDashedLine(pdf, bleedOffset, trimY, config.widthMM + bleedOffset, trimY)
    pdf.setFont('times', 'italic')
    pdf.setFontSize(7)
    pdf.setTextColor(160, 160, 160)
    const cutLabelY = trimY + 3
    pdf.text('cut', bleedOffset + 2, cutLabelY)
    pdf.text('cut', config.widthMM + bleedOffset - 2, cutLabelY, { align: 'right' })

    // Trim marks for booklet
    if (settings.trimMarks) {
      const pageW = config.widthMM + BLEED_MM * 2
      const pageH = config.heightMM + BLEED_MM * 2
      drawTrimMarks(pdf, pageW, pageH)
    }
  }
}

/* ───────────────────── main entry ───────────────────── */

/** Result of a print run. `skippedImageCount` = images that couldn't be embedded
 * (Firebase SDK + CORS fetch both failed) and were left blank in the PDF. */
export interface PrintBookResult {
  skippedImageCount: number
}

export async function printBook(book: Book, opts: PrintBookOptions): Promise<PrintBookResult> {
  const endTotal = startStep('printBook')
  const { childName } = opts
  const settings: PrintSettings = { ...DEFAULT_SETTINGS, ...opts.settings }
  const colors = BG_COLORS[settings.background]
  const config = PAGE_CONFIGS[settings.pageSize]
  const sightWordSet = new Set((opts.sightWords ?? []).map((w) => w.toLowerCase()))
  const isBooklet = settings.pageSize === 'booklet'

  // Pre-fetch all images as base64 to avoid CORS issues
  const endPrefetch = startStep('printBook.prefetchImages')
  const imageMap = await prefetchBookImages(book)
  endPrefetch()
  // Any prefetched image that didn't resolve to a data: URI couldn't be embedded
  // (both getBlob and the CORS fetch fallback failed) — it renders blank.
  const skippedImageCount = [...imageMap.values()].filter((v) => !v.startsWith('data:')).length
  const resolveUrl = (url: string) => imageMap.get(url) ?? url

  // Calculate PDF page dimensions (with optional bleed for trim marks)
  const bleedOffset = settings.trimMarks ? BLEED_MM : 0
  const pdfW = config.widthMM + bleedOffset * 2
  const pdfH = config.heightMM + bleedOffset * 2

  const pdf = new jsPDF({
    orientation: config.orientation,
    unit: 'mm',
    format: [pdfW, pdfH],
  })

  // Content area within margins (and optional bleed offset)
  const contentArea: ContentArea = {
    x: MARGIN_MM + bleedOffset,
    y: MARGIN_MM + bleedOffset,
    w: config.widthMM - MARGIN_MM * 2,
    h: config.heightMM - MARGIN_MM * 2,
  }

  const endRender = startStep('printBook.renderPages')

  if (isBooklet) {
    await renderBooklet(pdf, book, childName, colors, settings, sightWordSet, resolveUrl, bleedOffset, opts.isLincoln)
  } else {
    let pageAdded = false

    // Cover page
    if (settings.includeCover) {
      drawBackground(pdf, colors.bg, config.widthMM, config.heightMM, bleedOffset, bleedOffset)
      await drawCover(pdf, book, childName, colors, settings, resolveUrl, contentArea)
      if (settings.trimMarks) drawTrimMarks(pdf, pdfW, pdfH)
      pageAdded = true
    }

    // Sight words page (after cover, before content)
    if (sightWordSet.size > 0) {
      if (pageAdded) pdf.addPage()
      drawBackground(pdf, colors.bg, config.widthMM, config.heightMM, bleedOffset, bleedOffset)
      drawSightWordsPage(pdf, [...sightWordSet], colors, opts.isLincoln ?? false, contentArea)
      if (settings.trimMarks) drawTrimMarks(pdf, pdfW, pdfH)
      pageAdded = true
    }

    // Content pages
    for (let i = 0; i < book.pages.length; i++) {
      if (pageAdded) pdf.addPage()
      drawBackground(pdf, colors.bg, config.widthMM, config.heightMM, bleedOffset, bleedOffset)
      await drawContentPage(pdf, book.pages[i], i, colors, settings, sightWordSet, resolveUrl, contentArea)
      if (settings.trimMarks) drawTrimMarks(pdf, pdfW, pdfH)
      pageAdded = true
    }

    // Back cover
    if (settings.includeBackCover) {
      if (pageAdded) pdf.addPage()
      drawBackground(pdf, colors.bg, config.widthMM, config.heightMM, bleedOffset, bleedOffset)
      drawBackCover(pdf, book, childName, colors, contentArea)
      if (settings.trimMarks) drawTrimMarks(pdf, pdfW, pdfH)
    }
  }

  endRender()

  // Download
  const slug = (book.title || 'Book')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  pdf.save(`${slug}.pdf`)
  endTotal()

  return { skippedImageCount }
}

/* ───────────────────── utilities ───────────────────── */

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}
