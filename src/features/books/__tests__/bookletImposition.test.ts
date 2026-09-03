import { describe, expect, it } from 'vitest'
import type { Book, BookPage } from '../../../core/types'
import {
  duplexSides,
  imposeBooklet,
  padToSignature,
  type ImposedSheet,
  type LogicalPage,
} from '../bookletImposition'
import { buildLogicalPages } from '../printBook'

/**
 * FEAT-185 — the saddle-stitch maths. jsPDF is never touched here; this is
 * only "which page lands on which half of which side", the thing that was
 * wrong (a plain 2-up) in the book the owner printed.
 */

function page(pageNumber: number): BookPage {
  return {
    id: `p${pageNumber}`,
    pageNumber,
    text: `page ${pageNumber}`,
    images: [],
    layout: 'image-top',
    createdAt: '2026-09-03',
    updatedAt: '2026-09-03',
  }
}

/** A sequence of N content pages, story indices 0..N-1. No cover. */
function contentSeq(n: number): LogicalPage[] {
  return Array.from({ length: n }, (_, index) => ({ type: 'content' as const, page: page(index + 1), index }))
}

/** cover → N content pages (→ back). Story page k is logical page k+1. */
function bookSeq(contentCount: number, opts: { back?: boolean; sightWords?: boolean } = {}): LogicalPage[] {
  const b = { id: 'b', title: 'T', pages: Array.from({ length: contentCount }, (_, i) => page(i + 1)), createdAt: '2026-09-03' } as Book
  return buildLogicalPages(b, true, opts.sightWords ?? false, opts.back ?? false)
}

/** A stable label for a logical page so orderings can be compared as strings. */
function label(p: LogicalPage): string {
  switch (p.type) {
    case 'content':
      return `p${p.index + 1}`
    default:
      return p.type
  }
}

function sideLabels(sheets: ImposedSheet[]): string[][] {
  return sheets.flatMap((s) => [s.front.map(label), s.back.map(label)])
}

/**
 * Decode the sheets back into logical slot order (1-based slot s → index s-1)
 * by inverting the saddle-stitch positions. Used to prove the imposition is a
 * permutation: decoding it must give back the input sequence.
 */
function readingOrder(sheets: ImposedSheet[]): LogicalPage[] {
  const n = sheets.length * 4
  const slots: LogicalPage[] = new Array(n)
  for (const s of sheets) {
    const k = s.sheet
    const outerRight = n - 2 * (k - 1)
    slots[outerRight - 1] = s.front[0]
    slots[2 * k - 2] = s.front[1]
    slots[2 * k - 1] = s.back[0]
    slots[outerRight - 2] = s.back[1]
  }
  return slots
}

describe('padToSignature (FEAT-185)', () => {
  it('leaves a multiple of four alone', () => {
    const seq = contentSeq(8)
    const padded = padToSignature(seq)
    expect(padded).toHaveLength(8)
    expect(padded.map(label)).toEqual(seq.map(label))
  })

  it('pads 5 pages to 8 with three blanks at the end when there is no back cover', () => {
    const padded = padToSignature(contentSeq(5))
    expect(padded).toHaveLength(8)
    expect(padded.slice(5).every((p) => p.type === 'blank')).toBe(true)
  })

  it('puts the blanks BEFORE the back cover so it stays on the outside', () => {
    // cover + 6 story + sight-words + back = 9 → 12
    const seq = bookSeq(6, { back: true, sightWords: true })
    expect(seq).toHaveLength(9)
    const padded = padToSignature(seq)
    expect(padded).toHaveLength(12)
    expect(padded[padded.length - 1].type).toBe('back')
    expect(padded.slice(8, 11).every((p) => p.type === 'blank')).toBe(true)
    expect(padded.slice(0, 8).map(label)).toEqual(seq.slice(0, 8).map(label))
  })

  it('does not mutate its input', () => {
    const seq = contentSeq(5)
    const frozen = Object.freeze([...seq])
    expect(() => padToSignature(frozen)).not.toThrow()
    expect(frozen).toHaveLength(5)
  })
})

describe('imposeBooklet — the saddle-stitch formula (FEAT-185)', () => {
  it('4 pages: one sheet, front = [last | cover], back = [page 1 | second-to-last]', () => {
    const sheets = imposeBooklet(bookSeq(3)) // cover, p1, p2, p3
    expect(sheets).toHaveLength(1)
    expect(sideLabels(sheets)).toEqual([
      ['p3', 'cover'],
      ['p1', 'p2'],
    ])
  })

  it('8 pages: two nested sheets in the textbook order', () => {
    // cover, p1..p6, back → logical 1..8
    const sheets = imposeBooklet(bookSeq(6, { back: true }))
    expect(sheets).toHaveLength(2)
    expect(sideLabels(sheets)).toEqual([
      ['back', 'cover'], // sheet 1 front: [8 | 1]
      ['p1', 'p6'], //      sheet 1 back:  [2 | 7]
      ['p5', 'p2'], //      sheet 2 front: [6 | 3]
      ['p3', 'p4'], //      sheet 2 back:  [4 | 5]
    ])
  })

  it('12 pages: three sheets, cover right of side 1, pages nesting inward', () => {
    const sheets = imposeBooklet(contentSeq(12))
    expect(sheets).toHaveLength(3)
    // 1-based content page numbers: front k = [N-2(k-1), 2k-1], back k = [2k, N-2(k-1)-1]
    expect(sideLabels(sheets)).toEqual([
      ['p12', 'p1'],
      ['p2', 'p11'],
      ['p10', 'p3'],
      ['p4', 'p9'],
      ['p8', 'p5'],
      ['p6', 'p7'],
    ])
  })

  it('14 pages pad to 16 (two blanks) and impose on four sheets', () => {
    const sheets = imposeBooklet(contentSeq(14))
    expect(sheets).toHaveLength(4)
    const all = sheets.flatMap((s) => [...s.front, ...s.back])
    expect(all.filter((p) => p.type === 'blank')).toHaveLength(2)
    // The blanks are the last two logical slots (no back cover): sheet 1
    // front-left and sheet 1 back-right.
    expect(sheets[0].front[0].type).toBe('blank')
    expect(sheets[0].back[1].type).toBe('blank')
    expect(label(sheets[0].front[1])).toBe('p1')
  })

  it('5 pages become 8 with three blanks, and every real page still appears exactly once', () => {
    const seq = contentSeq(5)
    const sheets = imposeBooklet(seq)
    expect(sheets).toHaveLength(2)
    const all = sheets.flatMap((s) => [...s.front, ...s.back])
    expect(all).toHaveLength(8)
    expect(all.filter((p) => p.type === 'blank')).toHaveLength(3)
    const real = all.filter((p) => p.type !== 'blank').map(label).sort()
    expect(real).toEqual(seq.map(label).sort())
  })

  it.each([4, 5, 8, 9, 12, 14])('%i pages: every page appears exactly once and reading order is preserved', (n) => {
    const seq = contentSeq(n)
    const sheets = imposeBooklet(seq)
    const all = sheets.flatMap((s) => [...s.front, ...s.back])
    expect(all).toHaveLength(Math.ceil(n / 4) * 4)
    const counts = new Map<string, number>()
    for (const p of all) {
      if (p.type === 'blank') continue
      counts.set(label(p), (counts.get(label(p)) ?? 0) + 1)
    }
    expect([...counts.values()].every((c) => c === 1)).toBe(true)
    expect(counts.size).toBe(n)
    // Recovering the slot order from the sheets gives back the padded sequence.
    const recovered = readingOrder(sheets).filter((p) => p.type !== 'blank')
    expect(recovered.map(label)).toEqual(seq.map(label))
  })

  it('the cover is always on the RIGHT of side 1 — what the owner asked for', () => {
    for (const n of [1, 2, 3, 5, 6, 7, 10, 13]) {
      const sheets = imposeBooklet(bookSeq(n))
      expect(sheets[0].front[1].type).toBe('cover')
    }
  })

  it('blanks never split the back cover from the outside: with a back cover it is always side 1 left', () => {
    for (const n of [1, 2, 3, 5, 6, 7, 10, 13]) {
      const sheets = imposeBooklet(bookSeq(n, { back: true }))
      expect(sheets[0].front[0].type).toBe('back')
      expect(sheets[0].front[1].type).toBe('cover')
    }
  })

  it('the owner example — 6-page story + cover + sight-words page + back cover = 9 → 12, three sheets', () => {
    const seq = bookSeq(6, { back: true, sightWords: true })
    expect(seq.map(label)).toEqual(['cover', 'sight-words', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'back'])
    const sheets = imposeBooklet(seq)
    expect(sheets).toHaveLength(3)
    expect(sideLabels(sheets)).toEqual([
      ['back', 'cover'], //         sheet 1 front [12 | 1]
      ['sight-words', 'blank'], //  sheet 1 back  [2 | 11]
      ['blank', 'p1'], //           sheet 2 front [10 | 3]
      ['p2', 'blank'], //           sheet 2 back  [4 | 9]
      ['p6', 'p3'], //              sheet 3 front [8 | 5]
      ['p4', 'p5'], //              sheet 3 back  [6 | 7]
    ])
  })

  it('an empty sequence imposes to no sheets', () => {
    expect(imposeBooklet([])).toEqual([])
  })
})

describe('duplexSides (FEAT-185)', () => {
  it('emits front 1, back 1, front 2, back 2 … so a short-edge duplex print needs no collation', () => {
    const sides = duplexSides(imposeBooklet(contentSeq(8)))
    expect(sides.map((s) => `${s.sheet}-${s.face}`)).toEqual(['1-front', '1-back', '2-front', '2-back'])
    expect(sides.map((s) => [label(s.left), label(s.right)])).toEqual([
      ['p8', 'p1'],
      ['p2', 'p7'],
      ['p6', 'p3'],
      ['p4', 'p5'],
    ])
  })
})
