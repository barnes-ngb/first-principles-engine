import { ref, getBlob } from 'firebase/storage'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import type { Book, BookPage } from '../../core/types'
import { storage } from '../../core/firebase/storage'
import type { PrintSettings } from './PrintSettingsDialog'
import { TEXT_SIZE_STYLES, TEXT_FONT_FAMILIES } from './bookTypes'

/* ───────────────────── page size & color constants ───────────────────── */

const PAGE_SIZES = {
  letter: { widthMM: 279.4, heightMM: 215.9, widthPx: 1056, heightPx: 816 },
  'half-letter': { widthMM: 139.7, heightMM: 215.9, widthPx: 528, heightPx: 816 },
  a4: { widthMM: 297, heightMM: 210, widthPx: 1122, heightPx: 794 },
  booklet: { widthMM: 279.4, heightMM: 215.9, widthPx: 1056, heightPx: 816 },
} as const

const BG_COLORS = {
  white: { bg: '#ffffff', text: '#333333', imgBg: '#f5f5f5', sightWordBg: 'rgba(33, 150, 243, 0.2)' },
  cream: { bg: '#faf5ef', text: '#333333', imgBg: '#f0ebe3', sightWordBg: 'rgba(33, 150, 243, 0.2)' },
  dark: { bg: '#1a1a2e', text: '#e0e0e0', imgBg: 'rgba(255,255,255,0.05)', sightWordBg: 'rgba(66, 165, 245, 0.25)' },
} as const

const DEFAULT_SETTINGS: PrintSettings = {
  pageSize: 'letter',
  background: 'white',
  sightWordStyle: 'highlighted',
}

export interface PrintBookOptions {
  childName: string
  isLincoln: boolean
  sightWords?: string[]
  settings?: PrintSettings
}

/* ───────────────────── image pre-fetch (Firebase SDK) ───────────────────── */

/**
 * Convert a Blob to a base64 data URI.
 */
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
  // Strategy 1: Use Firebase Storage SDK with storagePath (no CORS needed)
  if (storagePath) {
    try {
      const storageRef = ref(storage, storagePath)
      const blob = await getBlob(storageRef)
      return await blobToDataUri(blob)
    } catch (err) {
      console.warn('Firebase SDK getBlob failed, trying fetch:', storagePath, err)
    }
  }

  // Strategy 2: Direct fetch (works if CORS is configured on bucket)
  try {
    const response = await fetch(url, { mode: 'cors' })
    if (response.ok) {
      const blob = await response.blob()
      return await blobToDataUri(blob)
    }
  } catch {
    console.warn('Fetch CORS failed for:', url.slice(0, 80))
  }

  // Strategy 3: Return original URL (html2canvas will try its best)
  return url
}

/**
 * Pre-fetch all unique images in a book as base64 data URIs.
 * Uses Firebase Storage SDK when storagePath is available (bypasses CORS).
 */
async function prefetchBookImages(book: Book): Promise<Map<string, string>> {
  // Collect all unique images with their storage paths
  const imageEntries: Array<{ url: string; storagePath?: string }> = []
  const seen = new Set<string>()

  // Cover image
  const coverUrl = book.coverImageUrl ?? book.pages.find((p) => p.images.length > 0)?.images[0]?.url
  if (coverUrl && !seen.has(coverUrl)) {
    seen.add(coverUrl)
    // Find the storagePath for the cover URL
    const coverImg = book.pages.flatMap((p) => p.images).find((img) => img.url === coverUrl)
    imageEntries.push({ url: coverUrl, storagePath: coverImg?.storagePath })
  }

  // Page images
  for (const page of book.pages) {
    for (const img of page.images) {
      if (img.url && !seen.has(img.url)) {
        seen.add(img.url)
        imageEntries.push({ url: img.url, storagePath: img.storagePath })
      }
    }
  }

  // Fetch all in parallel
  const results = await Promise.all(
    imageEntries.map(async ({ url, storagePath }) => {
      const dataUri = await fetchAsDataUri(url, storagePath)
      return [url, dataUri] as [string, string]
    }),
  )

  return new Map(results)
}

/* ───────────────────── main entry ───────────────────── */

export async function printBook(book: Book, opts: PrintBookOptions): Promise<void> {
  const { childName, isLincoln, sightWords } = opts
  const settings = opts.settings ?? DEFAULT_SETTINGS
  const colors = BG_COLORS[settings.background]
  const size = PAGE_SIZES[settings.pageSize]
  const isLandscape = settings.pageSize !== 'half-letter'

  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'
  const sightWordSet = new Set((sightWords ?? []).map((w) => w.toLowerCase()))

  // Pre-fetch all images as base64 to avoid CORS issues
  const imageMap = await prefetchBookImages(book)
  const resolveUrl = (url: string) => imageMap.get(url) ?? url

  const isBooklet = settings.pageSize === 'booklet'

  const pdf = new jsPDF({
    orientation: isLandscape || isBooklet ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [size.widthMM, size.heightMM],
  })

  if (isBooklet) {
    await renderBooklet(pdf, book, childName, isLincoln, colors, titleFont, sightWordSet, settings.sightWordStyle, size, resolveUrl)
  } else {
    // Cover page
    const coverDiv = createHiddenDiv(colors.bg, size.widthPx, size.heightPx)
    coverDiv.innerHTML = buildCoverHtml(book, childName, colors, titleFont, size, resolveUrl)
    document.body.appendChild(coverDiv)
    await renderDivToPage(coverDiv, pdf, size)
    document.body.removeChild(coverDiv)

    // Content pages
    for (let i = 0; i < book.pages.length; i++) {
      const page = book.pages[i]
      pdf.addPage()
      const div = createHiddenDiv(colors.bg, size.widthPx, size.heightPx)
      div.innerHTML = buildPageHtml(page, colors, sightWordSet, settings.sightWordStyle, titleFont, size, isLandscape, resolveUrl)
      document.body.appendChild(div)
      await renderDivToPage(div, pdf, size)
      document.body.removeChild(div)
    }

    // Back cover
    pdf.addPage()
    const backDiv = createHiddenDiv(colors.bg, size.widthPx, size.heightPx)
    backDiv.innerHTML = buildBackCoverHtml(book, childName, isLincoln, colors, titleFont, sightWordSet.size > 0)
    document.body.appendChild(backDiv)
    await renderDivToPage(backDiv, pdf, size)
    document.body.removeChild(backDiv)
  }

  // Download
  const slug = (book.title || 'Book').replace(/[^a-zA-Z0-9]+/g, '-')
  const date = new Date().toISOString().split('T')[0]
  pdf.save(`${slug}-${date}.pdf`)
}

/* ───────────────────── booklet rendering ───────────────────── */

type BookletPage =
  | { type: 'cover'; book: Book; childName: string }
  | { type: 'content'; page: BookPage }
  | { type: 'back'; book: Book; childName: string; isLincoln: boolean; hasSightWords: boolean }

async function renderBooklet(
  pdf: jsPDF,
  book: Book,
  childName: string,
  isLincoln: boolean,
  colors: Colors,
  titleFont: string,
  sightWordSet: Set<string>,
  sightWordStyle: PrintSettings['sightWordStyle'],
  size: Size,
  resolveUrl: (url: string) => string,
): Promise<void> {
  const halfSize = PAGE_SIZES['half-letter']

  // Assemble all book pages in order: cover, content pages, back cover
  const allPages: BookletPage[] = [
    { type: 'cover', book, childName },
    ...book.pages.map((page): BookletPage => ({ type: 'content', page })),
    { type: 'back', book, childName, isLincoln, hasSightWords: sightWordSet.size > 0 },
  ]

  for (let i = 0; i < allPages.length; i += 2) {
    if (i > 0) pdf.addPage()

    const left = allPages[i]
    const right: BookletPage | undefined = allPages[i + 1]

    const leftHtml = buildBookletHalfHtml(left, colors, titleFont, halfSize, sightWordSet, sightWordStyle, resolveUrl)
    const rightHtml = right
      ? buildBookletHalfHtml(right, colors, titleFont, halfSize, sightWordSet, sightWordStyle, resolveUrl)
      : `<div style="flex:1;background:${colors.bg};"></div>`

    const foldLine = '<div style="width:1px;border-left:1px dashed rgba(0,0,0,0.15);height:100%;flex-shrink:0;"></div>'

    const sheetDiv = createHiddenDiv(colors.bg, size.widthPx, size.heightPx)
    sheetDiv.innerHTML = `
      <div style="display:flex;height:100%;width:100%;">
        <div style="flex:1;overflow:hidden;">${leftHtml}</div>
        ${foldLine}
        <div style="flex:1;overflow:hidden;">${rightHtml}</div>
      </div>
    `

    document.body.appendChild(sheetDiv)
    await renderDivToPage(sheetDiv, pdf, size)
    document.body.removeChild(sheetDiv)
  }
}

function buildBookletHalfHtml(
  item: BookletPage,
  colors: Colors,
  titleFont: string,
  halfSize: Size,
  sightWordSet: Set<string>,
  sightWordStyle: PrintSettings['sightWordStyle'],
  resolveUrl: (url: string) => string,
): string {
  switch (item.type) {
    case 'cover':
      return buildCoverHtml(item.book, item.childName, colors, titleFont, halfSize, resolveUrl)
    case 'content':
      return buildPageHtml(item.page, colors, sightWordSet, sightWordStyle, titleFont, halfSize, false, resolveUrl)
    case 'back':
      return buildBackCoverHtml(item.book, item.childName, item.isLincoln, colors, titleFont, item.hasSightWords)
  }
}

/* ───────────────────── helpers ───────────────────── */

type Colors = (typeof BG_COLORS)[keyof typeof BG_COLORS]
type Size = (typeof PAGE_SIZES)[keyof typeof PAGE_SIZES]

function createHiddenDiv(bgColor: string, widthPx: number, heightPx: number): HTMLDivElement {
  const div = document.createElement('div')
  div.style.cssText = `position:fixed;left:-9999px;top:0;width:${widthPx}px;height:${heightPx}px;background:${bgColor};overflow:hidden;`
  return div
}

async function renderDivToPage(div: HTMLDivElement, pdf: jsPDF, size: Size): Promise<void> {
  const canvas = await html2canvas(div, {
    width: size.widthPx,
    height: size.heightPx,
    scale: 2,
    backgroundColor: null,
    logging: false,
  })
  const imgData = canvas.toDataURL('image/png')
  pdf.addImage(imgData, 'PNG', 0, 0, size.widthMM, size.heightMM)
}

/* ───────────────────── cover ───────────────────── */

function buildCoverHtml(
  book: Book,
  childName: string,
  colors: Colors,
  titleFont: string,
  size: Size,
  resolveUrl: (url: string) => string,
): string {
  const coverUrl = book.coverImageUrl ?? book.pages.find((p) => p.images.length > 0)?.images[0]?.url
  const isPixel = titleFont.includes('Press Start')
  const maxImgHeight = Math.round(size.heightPx * 0.55)

  const coverImg = coverUrl
    ? `<img src="${escapeHtml(resolveUrl(coverUrl))}"
        style="max-width:70%;max-height:${maxImgHeight}px;border-radius:12px;object-fit:contain;box-shadow:0 4px 16px rgba(0,0,0,0.15);" />`
    : ''

  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                height:100%;padding:40px;text-align:center;background:${colors.bg};color:${colors.text};">
      ${coverImg}
      <h1 style="font-family:${titleFont};font-size:${isPixel ? '16px' : '36px'};
                  margin:32px 0 12px;color:${colors.text};font-weight:700;">
        ${escapeHtml(book.title)}
      </h1>
      <p style="font-family:${titleFont};font-size:${isPixel ? '10px' : '20px'};
                color:${colors.text};opacity:0.6;margin:0;">
        By ${escapeHtml(childName)}
      </p>
    </div>
  `
}

/* ───────────────────── content page ───────────────────── */

function buildPageHtml(
  page: BookPage,
  colors: Colors,
  sightWordSet: Set<string>,
  sightWordStyle: PrintSettings['sightWordStyle'],
  _titleFont: string,
  size: Size,
  isLandscape: boolean,
  resolveUrl: (url: string) => string,
): string {
  const hasImages = page.images.length > 0
  const textCss = getTextCssForPage(page, isLandscape)
  const textContent = page.text
    ? highlightSightWordsHtml(page.text, sightWordSet, sightWordStyle, colors)
    : ''

  const audioNote = page.audioUrl
    ? `<p style="font-size:10px;color:${colors.text};opacity:0.4;text-align:center;margin:4px 0 0;">
        This page has audio narration — listen in the app.
      </p>`
    : ''

  if (isLandscape && hasImages) {
    // Landscape: image left 55%, text right 40%
    const imgHeight = Math.round(size.heightPx * 0.75)
    const imagesHtml = buildImagesHtml(page, colors, imgHeight, resolveUrl)

    return `
      <div style="display:flex;flex-direction:row;align-items:stretch;height:100%;padding:32px;gap:32px;
                  background:${colors.bg};box-sizing:border-box;">
        <div style="flex:0 0 55%;display:flex;align-items:center;justify-content:center;">
          ${imagesHtml}
        </div>
        <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:16px 8px;">
          <div style="font-size:${textCss.fontSize};line-height:${textCss.lineHeight};
                      font-family:${textCss.fontFamily};color:${colors.text};">
            ${textContent}
          </div>
          ${audioNote}
          <p style="font-size:10px;color:${colors.text};opacity:0.25;text-align:right;margin-top:auto;">
            ${page.pageNumber}
          </p>
        </div>
      </div>
    `
  }

  // Portrait / half-letter: image top, text bottom
  const imagesHtml = hasImages
    ? buildImagesHtml(page, colors, Math.round(size.heightPx * 0.5), resolveUrl)
    : ''

  const textHtml = textContent
    ? `<div style="padding:12px 8px;font-size:${textCss.fontSize};line-height:${textCss.lineHeight};
                   font-family:${textCss.fontFamily};color:${colors.text};">
        ${textContent}
      </div>`
    : ''

  return `
    <div style="display:flex;flex-direction:column;gap:12px;height:100%;padding:24px;
                background:${colors.bg};box-sizing:border-box;">
      ${imagesHtml}
      ${textHtml}
      ${audioNote}
      <p style="font-size:10px;color:${colors.text};opacity:0.25;text-align:right;margin-top:auto;">
        ${page.pageNumber}
      </p>
    </div>
  `
}

function buildImagesHtml(
  page: BookPage,
  colors: Colors,
  containerHeight: number,
  resolveUrl: (url: string) => string,
): string {
  return `<div style="position:relative;width:100%;height:${containerHeight}px;border-radius:12px;overflow:hidden;background:${colors.imgBg};">
    ${page.images
      .map((img) => {
        const pos = img.position ?? { x: 0, y: 0, width: 100, height: 100 }
        const fit = img.type === 'sticker' ? 'contain' : 'cover'
        const rotation = pos.rotation ?? 0
        const zIndex = pos.zIndex ?? 1
        const transformStyle = rotation ? `transform:rotate(${rotation}deg);transform-origin:center center;` : ''
        return `<img src="${escapeHtml(resolveUrl(img.url))}"
          style="position:absolute;left:${pos.x}%;top:${pos.y}%;width:${pos.width}%;height:${pos.height}%;
                 object-fit:${fit};border-radius:4px;z-index:${zIndex};${transformStyle}" />`
      })
      .join('')}
  </div>`
}

/* ───────────────────── back cover ───────────────────── */

function buildBackCoverHtml(
  book: Book,
  childName: string,
  isLincoln: boolean,
  colors: Colors,
  titleFont: string,
  isSightWordBook: boolean,
): string {
  const isPixel = titleFont.includes('Press Start')
  const headingFontSize = isPixel ? '12px' : '24px'

  const mainContent = isSightWordBook
    ? `<p style="font-family:${titleFont};font-size:${headingFontSize};color:${colors.text};font-weight:700;margin:0 0 12px;">
        Great reading!
      </p>`
    : `<p style="font-family:${titleFont};font-size:${headingFontSize};color:${colors.text};font-weight:700;margin:0 0 12px;">
        Made by ${escapeHtml(childName)}
      </p>`

  const dateStr = formatDate(book.createdAt)
  const fpeLine = isLincoln
    ? `<p style="font-family:'Press Start 2P',monospace;font-size:7px;color:${colors.text};opacity:0.3;margin-top:32px;">
        First Principles Engine
      </p>`
    : ''

  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                height:100%;padding:40px;text-align:center;background:${colors.bg};color:${colors.text};">
      ${mainContent}
      <p style="font-size:14px;color:${colors.text};opacity:0.5;margin:0;">${dateStr}</p>
      ${fpeLine}
    </div>
  `
}

/* ───────────────────── text utilities ───────────────────── */

function getTextCssForPage(
  page: BookPage,
  isLandscape: boolean,
): { fontSize: string; lineHeight: number; fontFamily: string } {
  const sizeKey = page.textSize ?? 'medium'
  const fontKey = page.textFont ?? 'print'
  const sizeStyles = TEXT_SIZE_STYLES[sizeKey]
  const fontFamily = TEXT_FONT_FAMILIES[fontKey]

  // Scale up font for print (landscape pages are bigger)
  const basePx = parseFloat(sizeStyles.fontSize)
  const scaledPx = isLandscape ? basePx * 1.4 : basePx * 1.2

  return {
    fontSize: `${scaledPx}rem`,
    lineHeight: sizeStyles.lineHeight,
    fontFamily: fontFamily === 'inherit' ? 'Georgia, serif' : fontFamily,
  }
}

function renderSightWord(
  word: string,
  style: PrintSettings['sightWordStyle'],
  colors: Colors,
): string {
  switch (style) {
    case 'highlighted':
      return `<span style="padding:2px 6px;border-radius:4px;background:${colors.sightWordBg};font-weight:700;">${escapeHtml(word)}</span>`
    case 'bold':
      return `<span style="font-weight:700;text-decoration:underline;">${escapeHtml(word)}</span>`
    case 'plain':
      return escapeHtml(word)
  }
}

function highlightSightWordsHtml(
  text: string,
  sightWordSet: Set<string>,
  style: PrintSettings['sightWordStyle'],
  colors: Colors,
): string {
  if (sightWordSet.size === 0 || style === 'plain') return escapeHtml(text)

  const tokens = text.split(/(\s+)/)
  return tokens
    .map((token) => {
      if (/^\s+$/.test(token)) return token

      const match = token.match(/^([^a-zA-Z]*)([a-zA-Z]+)([^a-zA-Z]*)$/)
      if (!match) return escapeHtml(token)

      const [, prefix, word, suffix] = match
      const lower = word.toLowerCase()
      if (sightWordSet.has(lower)) {
        return `${escapeHtml(prefix)}${renderSightWord(word, style, colors)}${escapeHtml(suffix)}`
      }
      return escapeHtml(token)
    })
    .join('')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

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
