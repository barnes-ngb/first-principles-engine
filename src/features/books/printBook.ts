import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import type { Book, BookPage } from '../../core/types/domain'
import { TEXT_SIZE_STYLES, TEXT_FONT_FAMILIES } from './bookTypes'

// Portrait mobile-ish page size (px for rendering, mm for PDF)
const PAGE_PX_W = 375
const PAGE_PX_H = 667
const PAGE_MM_W = 99.2 // 375px at 96dpi ≈ 99.2mm
const PAGE_MM_H = 176.6 // 667px at 96dpi ≈ 176.6mm

/** Mastery-level highlight colors matching SightWordChip.tsx */
const SIGHT_WORD_BG: Record<string, string> = {
  new: 'rgba(33, 150, 243, 0.25)',
  practicing: 'rgba(255, 193, 7, 0.3)',
  familiar: 'rgba(76, 175, 80, 0.2)',
  mastered: 'rgba(76, 175, 80, 0.08)',
}

export interface PrintBookOptions {
  /** Child name — used for "By" line and filename */
  childName: string
  /** True for Lincoln's Minecraft theme, false for London's storybook theme */
  isLincoln: boolean
  /** Sight words to highlight (from book.sightWords) */
  sightWords?: string[]
}

/**
 * Generate and download a PDF booklet that matches the in-app BookReaderPage
 * view 1:1 — same dark/light theme, fonts, sight-word highlights, and images.
 */
export async function printBook(book: Book, opts: PrintBookOptions): Promise<void> {
  const { childName, isLincoln, sightWords } = opts
  const bgColor = isLincoln ? '#1a1a2e' : '#faf5ef'
  const textColor = isLincoln ? '#e0e0e0' : '#333'
  const titleFont = isLincoln
    ? '"Press Start 2P", monospace'
    : '"Fredoka", cursive'
  const sightWordSet = new Set((sightWords ?? []).map((w) => w.toLowerCase()))

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [PAGE_MM_W, PAGE_MM_H],
  })

  // ── Cover page ──────────────────────────────────────────────────
  const coverDiv = createHiddenDiv(bgColor)
  coverDiv.innerHTML = buildCoverHtml(book, childName, bgColor, textColor, titleFont)
  document.body.appendChild(coverDiv)
  await renderDivToPage(coverDiv, pdf)
  document.body.removeChild(coverDiv)

  // ── Content pages ───────────────────────────────────────────────
  for (const page of book.pages) {
    pdf.addPage()
    const div = createHiddenDiv(bgColor)
    div.innerHTML = buildPageHtml(page, isLincoln, bgColor, textColor, sightWordSet)
    document.body.appendChild(div)
    await renderDivToPage(div, pdf)
    document.body.removeChild(div)
  }

  // ── Back cover ──────────────────────────────────────────────────
  pdf.addPage()
  const backDiv = createHiddenDiv(bgColor)
  backDiv.innerHTML = buildBackCoverHtml(book, childName, isLincoln, bgColor, textColor, titleFont, sightWordSet.size > 0)
  document.body.appendChild(backDiv)
  await renderDivToPage(backDiv, pdf)
  document.body.removeChild(backDiv)

  // Download
  const slug = (book.title || 'Book').replace(/[^a-zA-Z0-9]+/g, '-')
  const date = new Date().toISOString().split('T')[0]
  pdf.save(`${slug}-${date}.pdf`)
}

/* ───────────────────── helpers ───────────────────── */

function createHiddenDiv(bgColor: string): HTMLDivElement {
  const div = document.createElement('div')
  div.style.cssText = `position:fixed;left:-9999px;top:0;width:${PAGE_PX_W}px;height:${PAGE_PX_H}px;background:${bgColor};overflow:hidden;`
  return div
}

async function renderDivToPage(div: HTMLDivElement, pdf: jsPDF): Promise<void> {
  const canvas = await html2canvas(div, {
    width: PAGE_PX_W,
    height: PAGE_PX_H,
    scale: 2, // 2× for sharp print
    useCORS: true,
    allowTaint: true,
    backgroundColor: null, // preserve themed background
    logging: false,
  })
  const imgData = canvas.toDataURL('image/jpeg', 0.95)
  pdf.addImage(imgData, 'JPEG', 0, 0, PAGE_MM_W, PAGE_MM_H)
}

/* ───────────────────── cover ───────────────────── */

function buildCoverHtml(
  book: Book,
  childName: string,
  bgColor: string,
  textColor: string,
  titleFont: string,
): string {
  const coverUrl =
    book.coverImageUrl ??
    book.pages.find((p) => p.images.length > 0)?.images[0]?.url

  const coverImg = coverUrl
    ? `<img src="${escapeHtml(coverUrl)}" crossorigin="anonymous"
        style="max-width:80%;max-height:300px;border-radius:12px;object-fit:contain;box-shadow:0 4px 12px rgba(0,0,0,0.3);" />`
    : ''

  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                height:100%;padding:24px;text-align:center;background:${bgColor};color:${textColor};">
      ${coverImg}
      <h1 style="font-family:${titleFont};font-size:${titleFont.includes('Press Start') ? '14px' : '28px'};
                  margin:24px 0 8px;color:${textColor};font-weight:700;">
        ${escapeHtml(book.title)}
      </h1>
      <p style="font-family:${titleFont};font-size:${titleFont.includes('Press Start') ? '9px' : '18px'};
                color:${textColor};opacity:0.7;margin:0;">
        By ${escapeHtml(childName)}
      </p>
    </div>
  `
}

/* ───────────────────── content page ───────────────────── */

function buildPageHtml(
  page: BookPage,
  isLincoln: boolean,
  bgColor: string,
  textColor: string,
  sightWordSet: Set<string>,
): string {
  const imgBg = isLincoln ? 'rgba(255,255,255,0.05)' : '#f5f5f5'

  // Images
  const imagesHtml =
    page.images.length > 0
      ? `<div style="position:relative;width:100%;height:280px;border-radius:8px;overflow:hidden;background:${imgBg};">
          ${page.images
            .map((img) => {
              const pos = img.position ?? { x: 0, y: 0, width: 100, height: 100 }
              const fit = img.type === 'sticker' ? 'contain' : 'cover'
              return `<img src="${escapeHtml(img.url)}" crossorigin="anonymous"
                style="position:absolute;left:${pos.x}%;top:${pos.y}%;width:${pos.width}%;height:${pos.height}%;
                       object-fit:${fit};border-radius:4px;" />`
            })
            .join('')}
        </div>`
      : ''

  // Text (with sight-word highlighting)
  const textCss = getTextCssForPage(page)
  const textContent = page.text
    ? highlightSightWordsHtml(page.text, sightWordSet)
    : ''
  const textHtml = textContent
    ? `<div style="padding:8px 4px;font-size:${textCss.fontSize};line-height:${textCss.lineHeight};
                   font-family:${textCss.fontFamily};color:${textColor};">
        ${textContent}
      </div>`
    : ''

  // Audio note
  const audioNote = page.audioUrl
    ? `<p style="font-size:10px;color:${textColor};opacity:0.4;text-align:center;margin:4px 0 0;">
        This page has audio narration — listen in the app.
      </p>`
    : ''

  return `
    <div style="display:flex;flex-direction:column;gap:8px;height:100%;padding:16px;
                background:${bgColor};box-sizing:border-box;">
      ${imagesHtml}
      ${textHtml}
      ${audioNote}
      <p style="font-size:9px;color:${textColor};opacity:0.3;text-align:right;margin-top:auto;">
        ${page.pageNumber}
      </p>
    </div>
  `
}

/* ───────────────────── back cover ───────────────────── */

function buildBackCoverHtml(
  book: Book,
  childName: string,
  isLincoln: boolean,
  bgColor: string,
  textColor: string,
  titleFont: string,
  isSightWordBook: boolean,
): string {
  const headingFontSize = titleFont.includes('Press Start') ? '11px' : '22px'

  const mainContent = isSightWordBook
    ? `<p style="font-family:${titleFont};font-size:${headingFontSize};color:${textColor};font-weight:700;margin:0 0 12px;">
        Great reading!
      </p>`
    : `<p style="font-family:${titleFont};font-size:${headingFontSize};color:${textColor};font-weight:700;margin:0 0 12px;">
        Made by ${escapeHtml(childName)}
      </p>`

  const dateStr = formatDate(book.createdAt)
  const fpeLine = isLincoln
    ? `<p style="font-family:'Press Start 2P',monospace;font-size:7px;color:${textColor};opacity:0.3;margin-top:32px;">
        First Principles Engine
      </p>`
    : ''

  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                height:100%;padding:40px;text-align:center;background:${bgColor};color:${textColor};">
      ${mainContent}
      <p style="font-size:13px;color:${textColor};opacity:0.5;margin:0;">${dateStr}</p>
      ${fpeLine}
    </div>
  `
}

/* ───────────────────── text utilities ───────────────────── */

function getTextCssForPage(page: BookPage): { fontSize: string; lineHeight: number; fontFamily: string } {
  const sizeKey = page.textSize ?? 'medium'
  const fontKey = page.textFont ?? 'print'
  const sizeStyles = TEXT_SIZE_STYLES[sizeKey]
  const fontFamily = TEXT_FONT_FAMILIES[fontKey]
  return {
    fontSize: sizeStyles.fontSize,
    lineHeight: sizeStyles.lineHeight,
    fontFamily: fontFamily === 'inherit' ? 'Georgia, serif' : fontFamily,
  }
}

/**
 * Convert plain text to HTML with sight-word spans highlighted using the same
 * colors as SightWordChip in the app. For print we just apply the background
 * color — no interactive popover needed.
 */
function highlightSightWordsHtml(text: string, sightWordSet: Set<string>): string {
  if (sightWordSet.size === 0) return escapeHtml(text)

  const tokens = text.split(/(\s+)/)
  return tokens
    .map((token) => {
      if (/^\s+$/.test(token)) return token

      const match = token.match(/^([^a-zA-Z]*)([a-zA-Z]+)([^a-zA-Z]*)$/)
      if (!match) return escapeHtml(token)

      const [, prefix, word, suffix] = match
      const lower = word.toLowerCase()
      if (sightWordSet.has(lower)) {
        const bg = SIGHT_WORD_BG['new'] // default highlight for print
        return `${escapeHtml(prefix)}<span style="padding:1px 3px;border-radius:3px;background:${bg};font-weight:700;">${escapeHtml(word)}</span>${escapeHtml(suffix)}`
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
