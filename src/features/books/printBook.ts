import { ref, getBlob } from 'firebase/storage'
import { jsPDF } from 'jspdf'
import type { Book, BookPage } from '../../core/types'
import { storage } from '../../core/firebase/storage'
import { startStep } from '../../core/utils/perf'
import type { PrintSettings } from './PrintSettingsDialog'

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

const DEFAULT_SETTINGS: PrintSettings = {
  pageSize: 'half-letter',
  background: 'white',
  sightWordStyle: 'highlighted',
  quality: 'standard',
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

/* ───────────────────── image pre-fetch (Firebase SDK) ───────────────────── */

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Fetch an image as a base64 data URI using Firebase Storage SDK (no CORS needed).
 * Falls back to browser fetch, then to original URL.
 */
async function fetchAsDataUri(url: string, storagePath?: string): Promise<string> {
  if (storagePath) {
    try {
      const storageRef = ref(storage, storagePath)
      const blob = await getBlob(storageRef)
      return await blobToDataUri(blob)
    } catch (err) {
      console.warn('Firebase SDK getBlob failed, trying fetch:', storagePath, err)
    }
  }

  try {
    const response = await fetch(url, { mode: 'cors' })
    if (response.ok) {
      const blob = await response.blob()
      return await blobToDataUri(blob)
    }
  } catch {
    console.warn('Fetch CORS failed for:', url.slice(0, 80))
  }

  return url
}

/**
 * Pre-fetch all unique images in a book as base64 data URIs.
 */
async function prefetchBookImages(book: Book): Promise<Map<string, string>> {
  const entries: Array<{ url: string; storagePath?: string }> = []
  const seen = new Set<string>()

  const coverUrl = book.coverImageUrl ?? book.pages.find((p) => p.images.length > 0)?.images[0]?.url
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

function fitInBox(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
): { w: number; h: number } {
  const scale = Math.min(boxW / imgW, boxH / imgH)
  return { w: imgW * scale, h: imgH * scale }
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

  // Simple path: no sight word highlighting
  if (sightWordSet.size === 0 || sightWordStyle === 'plain') {
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
  const coverUrl = book.coverImageUrl ?? book.pages.find((p) => p.images.length > 0)?.images[0]?.url
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

  // Render page images
  if (page.images.length > 0) {
    // Lock to the same 3:2 aspect ratio used in editor + reader containers.
    // Derive height from available width so the container always fits.
    const IMAGE_ASPECT_RATIO = 3 / 2
    const imgAreaW = area.w
    const imgAreaH = Math.min(area.w / IMAGE_ASPECT_RATIO, area.h * 0.55)
    const imgAreaX = area.x

    // Sort by zIndex for proper stacking
    const sortedImages = [...page.images].sort(
      (a, b) => (a.position?.zIndex ?? 0) - (b.position?.zIndex ?? 0),
    )

    // Draw container background
    pdf.setFillColor(...hexToRgb(colors.imgBg))
    pdf.roundedRect(imgAreaX - 1.5, curY - 1.5, imgAreaW + 3, imgAreaH + 3, 2, 2, 'F')

    for (const img of sortedImages) {
      let dataUri = resolveUrl(img.url)
      if (!dataUri.startsWith('data:')) continue
      try {
        const dims = await getImageDimensions(dataUri)
        const pos = img.position ?? { x: 0, y: 0, width: 100, height: 100 }

        // Convert percentage position to mm within the image area (using consistent aspect ratio)
        const imgX = imgAreaX + (pos.x / 100) * imgAreaW
        const imgY = curY + (pos.y / 100) * imgAreaH
        const imgW = (pos.width / 100) * imgAreaW
        const imgH = (pos.height / 100) * imgAreaH

        const rotation = pos.rotation ?? 0
        const flipH = pos.flipH ?? false
        const flipV = pos.flipV ?? false

        // Apply flip via canvas if needed
        if (flipH || flipV) {
          dataUri = await flipImageDataUri(dataUri, dims.width, dims.height, flipH, flipV)
        }

        // Stickers use contain-fit; scene/photo images use cover-fit (crop to fill box)
        if (img.type === 'sticker') {
          const fit = fitInBox(dims.width, dims.height, imgW, imgH)
          pdf.addImage({ imageData: dataUri, x: imgX, y: imgY, width: fit.w, height: fit.h, rotation })
        } else {
          // Cover-fit: crop image to match the box aspect ratio, then fill entire box
          const cropped = await cropToAspect(dataUri, dims.width, dims.height, imgW, imgH)
          pdf.addImage({ imageData: cropped, x: imgX, y: imgY, width: imgW, height: imgH, rotation })
        }
      } catch {
        // Skip image on failure
      }
    }

    curY += imgAreaH + 6
  }

  // Render text with dynamic font sizing to prevent overflow
  if (page.text) {
    const textLen = page.text.length
    const pageNumSpace = settings.includePageNumbers ? 6 : 0
    const maxTextY = area.y + area.h - pageNumSpace
    const availableTextH = maxTextY - curY

    // Scale font size and line height based on text length and available space
    let fontSize: number
    let lineHeight: number
    if (textLen > 400 || availableTextH < 40) {
      fontSize = 10; lineHeight = 1.35
    } else if (textLen > 300 || availableTextH < 50) {
      fontSize = 11; lineHeight = 1.4
    } else if (textLen > 200) {
      fontSize = 12; lineHeight = 1.45
    } else if (textLen > 120) {
      fontSize = 14; lineHeight = 1.5
    } else {
      fontSize = 16; lineHeight = 1.6
    }

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

  // Page number at bottom center
  if (settings.includePageNumbers) {
    pdf.setFont('times', 'normal')
    pdf.setFontSize(12)
    pdf.setTextColor(...textColor)
    pdf.text(String(pageIndex + 1), area.x + area.w / 2, area.y + area.h + 2, { align: 'center' })
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

type LogicalPage =
  | { type: 'cover' }
  | { type: 'content'; page: BookPage; index: number }
  | { type: 'back' }

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
): Promise<void> {
  switch (logicalPage.type) {
    case 'cover':
      await drawCover(pdf, book, childName, colors, settings, resolveUrl, area)
      break
    case 'content':
      await drawContentPage(pdf, logicalPage.page, logicalPage.index, colors, settings, sightWordSet, resolveUrl, area)
      break
    case 'back':
      drawBackCover(pdf, book, childName, colors, area)
      break
  }
}

async function renderBooklet(
  pdf: jsPDF,
  book: Book,
  childName: string,
  colors: Colors,
  settings: PrintSettings,
  sightWordSet: Set<string>,
  resolveUrl: (url: string) => string,
  bleedOffset: number,
): Promise<void> {
  const config = PAGE_CONFIGS.booklet
  const halfW = config.widthMM / 2

  // Build logical page sequence
  const logicalPages: LogicalPage[] = []
  if (settings.includeCover) logicalPages.push({ type: 'cover' })
  book.pages.forEach((page, i) => logicalPages.push({ type: 'content', page, index: i }))
  if (settings.includeBackCover) logicalPages.push({ type: 'back' })

  for (let i = 0; i < logicalPages.length; i += 2) {
    if (i > 0) pdf.addPage()

    // Draw full sheet background
    drawBackground(pdf, colors.bg, config.widthMM, config.heightMM, bleedOffset, bleedOffset)

    // Left half
    const leftArea: ContentArea = {
      x: MARGIN_MM + bleedOffset,
      y: MARGIN_MM + bleedOffset,
      w: halfW - MARGIN_MM * 2,
      h: config.heightMM - MARGIN_MM * 2,
    }
    await drawLogicalPage(pdf, logicalPages[i], book, childName, colors, settings, sightWordSet, resolveUrl, leftArea)

    // Right half
    if (i + 1 < logicalPages.length) {
      const rightArea: ContentArea = {
        x: halfW + MARGIN_MM + bleedOffset,
        y: MARGIN_MM + bleedOffset,
        w: halfW - MARGIN_MM * 2,
        h: config.heightMM - MARGIN_MM * 2,
      }
      await drawLogicalPage(pdf, logicalPages[i + 1], book, childName, colors, settings, sightWordSet, resolveUrl, rightArea)
    }

    // Fold line (dashed)
    const foldX = halfW + bleedOffset
    pdf.setDrawColor(200, 200, 200)
    pdf.setLineWidth(0.15)
    // Draw dashed line manually (small segments)
    const dashLen = 2
    const gapLen = 2
    const lineTop = bleedOffset
    const lineBottom = config.heightMM + bleedOffset
    let dashY = lineTop
    while (dashY < lineBottom) {
      const endY = Math.min(dashY + dashLen, lineBottom)
      pdf.line(foldX, dashY, foldX, endY)
      dashY = endY + gapLen
    }

    // Trim marks for booklet
    if (settings.trimMarks) {
      const pageW = config.widthMM + BLEED_MM * 2
      const pageH = config.heightMM + BLEED_MM * 2
      drawTrimMarks(pdf, pageW, pageH)
    }
  }
}

/* ───────────────────── main entry ───────────────────── */

export async function printBook(book: Book, opts: PrintBookOptions): Promise<void> {
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
    await renderBooklet(pdf, book, childName, colors, settings, sightWordSet, resolveUrl, bleedOffset)
  } else {
    let pageAdded = false

    // Cover page
    if (settings.includeCover) {
      drawBackground(pdf, colors.bg, config.widthMM, config.heightMM, bleedOffset, bleedOffset)
      await drawCover(pdf, book, childName, colors, settings, resolveUrl, contentArea)
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
