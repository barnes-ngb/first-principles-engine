import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import type { Book } from '../../core/types/domain'

// Letter landscape dimensions in mm
const PAGE_W = 279.4
const PAGE_H = 215.9

/**
 * Generate and open a printable PDF booklet from a saved book.
 * Uses html2canvas to render each page as an image, then jsPDF to assemble.
 */
export async function printBook(book: Book, childName: string): Promise<void> {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })

  // ── Cover page ──────────────────────────────────────────────────
  const coverDiv = createHiddenDiv()
  coverDiv.innerHTML = buildCoverHtml(book, childName)
  document.body.appendChild(coverDiv)
  await renderDivToPage(coverDiv, pdf)
  document.body.removeChild(coverDiv)

  // ── Content pages ───────────────────────────────────────────────
  for (const page of book.pages) {
    pdf.addPage()
    const div = createHiddenDiv()
    div.innerHTML = buildPageHtml(page)
    document.body.appendChild(div)
    await renderDivToPage(div, pdf)
    document.body.removeChild(div)
  }

  // ── Back cover ──────────────────────────────────────────────────
  pdf.addPage()
  const backDiv = createHiddenDiv()
  backDiv.innerHTML = buildBackCoverHtml(book, childName)
  document.body.appendChild(backDiv)
  await renderDivToPage(backDiv, pdf)
  document.body.removeChild(backDiv)

  // Open in new tab and trigger download
  const blobUrl = pdf.output('bloburl')
  window.open(String(blobUrl), '_blank')
}

function createHiddenDiv(): HTMLDivElement {
  const div = document.createElement('div')
  div.style.cssText =
    'position:fixed;left:-9999px;top:0;width:1056px;height:816px;background:white;font-family:Georgia,serif;'
  return div
}

async function renderDivToPage(div: HTMLDivElement, pdf: jsPDF): Promise<void> {
  const canvas = await html2canvas(div, {
    width: 1056,
    height: 816,
    scale: 2,
    useCORS: true,
    allowTaint: true,
  })
  const imgData = canvas.toDataURL('image/jpeg', 0.92)
  pdf.addImage(imgData, 'JPEG', 0, 0, PAGE_W, PAGE_H)
}

function buildCoverHtml(book: Book, childName: string): string {
  const coverImg = book.coverImageUrl
    ? `<img src="${escapeHtml(book.coverImageUrl)}" style="max-width:400px;max-height:350px;border-radius:12px;margin-bottom:24px;object-fit:contain;" crossorigin="anonymous" />`
    : book.pages[0]?.images[0]?.url
      ? `<img src="${escapeHtml(book.pages[0].images[0].url)}" style="max-width:400px;max-height:350px;border-radius:12px;margin-bottom:24px;object-fit:contain;" crossorigin="anonymous" />`
      : ''

  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center;">
      ${coverImg}
      <h1 style="font-size:48px;margin:0 0 16px 0;color:#333;">${escapeHtml(book.title)}</h1>
      <p style="font-size:24px;color:#666;margin:0;">By ${escapeHtml(childName)}</p>
      <p style="font-size:14px;color:#999;margin-top:24px;">${formatDate(book.createdAt)}</p>
    </div>
  `
}

function buildPageHtml(page: { text?: string; images: { url: string }[]; audioUrl?: string; pageNumber: number }): string {
  const image = page.images[0]
  const imageHtml = image
    ? `<div style="flex:6;display:flex;align-items:center;justify-content:center;overflow:hidden;">
        <img src="${escapeHtml(image.url)}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;" crossorigin="anonymous" />
      </div>`
    : ''

  const textHtml = page.text
    ? `<div style="flex:4;padding:24px 40px;font-size:22px;line-height:1.7;color:#333;">
        ${escapeHtml(page.text)}
      </div>`
    : ''

  const audioNote = page.audioUrl
    ? '<p style="font-size:11px;color:#aaa;text-align:center;margin:4px 0 0;">This page has audio narration — listen in the app.</p>'
    : ''

  return `
    <div style="display:flex;flex-direction:column;height:100%;padding:20px;">
      ${imageHtml}
      ${textHtml}
      ${audioNote}
      <p style="font-size:10px;color:#ccc;text-align:right;margin-top:auto;">${page.pageNumber}</p>
    </div>
  `
}

function buildBackCoverHtml(book: Book, childName: string): string {
  const hasAudio = book.pages.some((p) => !!p.audioUrl)
  const audioMsg = hasAudio
    ? '<p style="font-size:14px;color:#888;margin-top:16px;">This book has audio narration! Listen in the app.</p>'
    : ''

  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center;">
      <p style="font-size:28px;color:#555;">Made by ${escapeHtml(childName)}</p>
      <p style="font-size:14px;color:#999;margin-top:8px;">${formatDate(book.createdAt)}</p>
      ${audioMsg}
      <p style="font-size:11px;color:#bbb;margin-top:40px;">First Principles Engine</p>
    </div>
  `
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
