import type { BookPage } from '../../core/types'

/**
 * Saddle-stitch imposition for the "Booklet (fold & staple)" print format
 * (FEAT-185). Pure: no jsPDF, no I/O — it only decides which logical page
 * lands on which half of which sheet side. `printBook.ts` draws what it says.
 *
 * Why it exists: before FEAT-185 the booklet was a plain 2-up — sheet 1 was
 * `[cover | page 1]`, sheet 2 `[page 2 | page 3]` — which scrambles the moment
 * the stack is folded in half and stapled at the fold. A real fold-in-half
 * book needs the OUTERMOST sheet to carry the cover and the back cover on one
 * face, and the pages to nest inward from there.
 *
 * The formula, for N logical pages (N a multiple of 4), sheet k (1-based),
 * page numbers 1-based:
 *
 *   front = [ N − 2(k−1) , 2k − 1 ]     sheet 1 front = [ last | cover ]
 *   back  = [ 2k , N − 2(k−1) − 1 ]     sheet 1 back  = [ page 1 | second-to-last ]
 *
 * ("page 1" here is the SECOND logical page — the first story page when a
 * cover is on — so the cover is on the right of side 1, exactly as the owner
 * described the printed book.) Sides come out in duplex order — front 1,
 * back 1, front 2, back 2 … — so "print double-sided, flip on the short edge"
 * works with no collation: the back of each landscape sheet is laid out for a
 * turn about the sheet's vertical axis, which is what keeps the reverse of the
 * cover half (page 2) on the left when the book is opened.
 */

/** One entry in the print sequence — `printBook.buildLogicalPages` is the only builder. */
export type LogicalPage =
  | { type: 'cover' }
  | { type: 'sight-words' }
  | { type: 'content'; page: BookPage; index: number }
  | { type: 'back' }
  /** Imposition padding: draws the background only. Never numbered. */
  | { type: 'blank' }

/** A `[left, right]` pair of logical pages on one face of one sheet. */
export type SheetSide = readonly [left: LogicalPage, right: LogicalPage]

export interface ImposedSheet {
  /** 1-based sheet number, outermost first. */
  sheet: number
  front: SheetSide
  back: SheetSide
}

/** One printable PDF page: a sheet face, in duplex order. */
export interface BookletSide {
  sheet: number
  face: 'front' | 'back'
  left: LogicalPage
  right: LogicalPage
}

export const BLANK_PAGE: LogicalPage = { type: 'blank' }

/**
 * Pad the sequence with blanks to a multiple of 4 — one sheet carries four
 * pages, so anything else leaves a face empty. Padding goes BEFORE the back
 * cover when the sequence ends with one, so the back cover stays on the
 * outside of the folded book; otherwise the blanks go at the end.
 */
export function padToSignature(pages: readonly LogicalPage[]): LogicalPage[] {
  const remainder = pages.length % 4
  const padCount = remainder === 0 ? 0 : 4 - remainder
  if (padCount === 0) return [...pages]
  const blanks: LogicalPage[] = Array.from({ length: padCount }, () => BLANK_PAGE)
  const last = pages[pages.length - 1]
  if (last && last.type === 'back') {
    return [...pages.slice(0, -1), ...blanks, last]
  }
  return [...pages, ...blanks]
}

/**
 * Impose a logical-page sequence onto saddle-stitched sheets. An empty
 * sequence yields no sheets. Pure and read-only on its input.
 */
export function imposeBooklet(pages: readonly LogicalPage[]): ImposedSheet[] {
  if (pages.length === 0) return []
  const padded = padToSignature(pages)
  const n = padded.length
  const sheetCount = n / 4
  const at = (oneBased: number): LogicalPage => padded[oneBased - 1]
  const sheets: ImposedSheet[] = []
  for (let k = 1; k <= sheetCount; k++) {
    const outerRight = n - 2 * (k - 1)
    sheets.push({
      sheet: k,
      front: [at(outerRight), at(2 * k - 1)],
      back: [at(2 * k), at(outerRight - 1)],
    })
  }
  return sheets
}

/**
 * Flatten sheets into the PDF page order a duplex printer expects: front 1,
 * back 1, front 2, back 2 … (flip on the short edge of the landscape sheet).
 */
export function duplexSides(sheets: readonly ImposedSheet[]): BookletSide[] {
  return sheets.flatMap((s) => [
    { sheet: s.sheet, face: 'front' as const, left: s.front[0], right: s.front[1] },
    { sheet: s.sheet, face: 'back' as const, left: s.back[0], right: s.back[1] },
  ])
}
