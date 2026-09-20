import { describe, expect, it } from 'vitest'
import {
  padToSignature,
  imposeBooklet,
  duplexSides,
  BLANK_PAGE,
} from './bookletImposition'
import type { LogicalPage, ImposedSheet } from './bookletImposition'

// ── Helpers ───────────────────────────────────────────────────────────

function makePage(label: string): LogicalPage {
  return { type: 'content', page: { text: label } as never, index: 0 }
}

const cover: LogicalPage = { type: 'cover' }
const back: LogicalPage = { type: 'back' }
const sightWords: LogicalPage = { type: 'sight-words' }

function labeledPages(count: number): LogicalPage[] {
  return Array.from({ length: count }, (_, i) => makePage(`p${i + 1}`))
}

// ── padToSignature ────────────────────────────────────────────────────

describe('padToSignature', () => {
  it('does not pad a sequence already a multiple of 4', () => {
    const pages = [cover, makePage('1'), makePage('2'), back]
    const result = padToSignature(pages)
    expect(result).toHaveLength(4)
    expect(result.every((p) => p.type !== 'blank')).toBe(true)
  })

  it('pads a 5-page sequence to 8 with blanks before the back cover', () => {
    const pages = [cover, ...labeledPages(3), back]
    expect(pages).toHaveLength(5)
    const result = padToSignature(pages)
    expect(result).toHaveLength(8)
    expect(result[result.length - 1]).toEqual(back)
    expect(result.filter((p) => p.type === 'blank')).toHaveLength(3)
  })

  it('pads a 6-page sequence to 8 with blanks before the back cover', () => {
    const pages = [cover, ...labeledPages(4), back]
    const result = padToSignature(pages)
    expect(result).toHaveLength(8)
    expect(result[result.length - 1]).toEqual(back)
  })

  it('pads a 7-page sequence to 8 with one blank before the back cover', () => {
    const pages = [cover, ...labeledPages(5), back]
    const result = padToSignature(pages)
    expect(result).toHaveLength(8)
    expect(result[result.length - 1]).toEqual(back)
    expect(result.filter((p) => p.type === 'blank')).toHaveLength(1)
  })

  it('pads at the end when last page is not a back cover', () => {
    const pages = [cover, ...labeledPages(2)]
    expect(pages).toHaveLength(3)
    const result = padToSignature(pages)
    expect(result).toHaveLength(4)
    expect(result[result.length - 1]).toEqual(BLANK_PAGE)
  })

  it('returns a copy even when no padding is needed', () => {
    const pages = [cover, makePage('1'), makePage('2'), back]
    const result = padToSignature(pages)
    expect(result).not.toBe(pages)
    expect(result).toEqual(pages)
  })

  it('handles an empty sequence', () => {
    expect(padToSignature([])).toEqual([])
  })

  it('pads a single page to 4', () => {
    const result = padToSignature([cover])
    expect(result).toHaveLength(4)
    expect(result[0]).toEqual(cover)
    expect(result.filter((p) => p.type === 'blank')).toHaveLength(3)
  })
})

// ── imposeBooklet ─────────────────────────────────────────────────────

describe('imposeBooklet', () => {
  it('returns no sheets for an empty sequence', () => {
    expect(imposeBooklet([])).toEqual([])
  })

  it('imposes a 4-page booklet onto one sheet', () => {
    const pages: LogicalPage[] = [cover, makePage('1'), makePage('2'), back]
    const sheets = imposeBooklet(pages)
    expect(sheets).toHaveLength(1)

    const s = sheets[0]
    expect(s.sheet).toBe(1)
    // Front: [last, first] = [back, cover]
    expect(s.front[0].type).toBe('back')
    expect(s.front[1].type).toBe('cover')
    // Back: [page1, page2] = [p1, p2]
    expect(s.back[0].type).toBe('content')
    expect(s.back[1].type).toBe('content')
  })

  it('imposes an 8-page booklet onto two sheets', () => {
    const pages: LogicalPage[] = [
      cover,
      makePage('1'),
      makePage('2'),
      makePage('3'),
      makePage('4'),
      makePage('5'),
      makePage('6'),
      back,
    ]
    const sheets = imposeBooklet(pages)
    expect(sheets).toHaveLength(2)
    expect(sheets[0].sheet).toBe(1)
    expect(sheets[1].sheet).toBe(2)

    // Outermost sheet (1): front = [page8(back), page1(cover)]
    expect(sheets[0].front[0].type).toBe('back')
    expect(sheets[0].front[1].type).toBe('cover')
  })

  it('every page appears exactly once across all sheet sides', () => {
    const content = labeledPages(10)
    const pages: LogicalPage[] = [cover, ...content, back]
    const sheets = imposeBooklet(pages)
    const allPlaced: LogicalPage[] = sheets.flatMap((s) => [
      s.front[0],
      s.front[1],
      s.back[0],
      s.back[1],
    ])
    const nonBlank = allPlaced.filter((p) => p.type !== 'blank')
    expect(nonBlank).toHaveLength(pages.length)
  })

  it('pads to a multiple of 4 internally', () => {
    const pages: LogicalPage[] = [cover, makePage('1'), makePage('2')]
    const sheets = imposeBooklet(pages)
    const allPlaced = sheets.flatMap((s) => [
      s.front[0],
      s.front[1],
      s.back[0],
      s.back[1],
    ])
    expect(allPlaced).toHaveLength(4)
  })

  it('sight-words page type is handled like any content', () => {
    const pages: LogicalPage[] = [cover, sightWords, makePage('1'), back]
    const sheets = imposeBooklet(pages)
    expect(sheets).toHaveLength(1)
    const allPlaced = sheets.flatMap((s) => [
      s.front[0],
      s.front[1],
      s.back[0],
      s.back[1],
    ])
    expect(allPlaced.some((p) => p.type === 'sight-words')).toBe(true)
  })
})

// ── duplexSides ───────────────────────────────────────────────────────

describe('duplexSides', () => {
  it('returns sides in duplex order: front 1, back 1, front 2, back 2', () => {
    const pages: LogicalPage[] = [
      cover,
      makePage('1'),
      makePage('2'),
      makePage('3'),
      makePage('4'),
      makePage('5'),
      makePage('6'),
      back,
    ]
    const sheets = imposeBooklet(pages)
    const sides = duplexSides(sheets)

    expect(sides).toHaveLength(4)
    expect(sides[0].sheet).toBe(1)
    expect(sides[0].face).toBe('front')
    expect(sides[1].sheet).toBe(1)
    expect(sides[1].face).toBe('back')
    expect(sides[2].sheet).toBe(2)
    expect(sides[2].face).toBe('front')
    expect(sides[3].sheet).toBe(2)
    expect(sides[3].face).toBe('back')
  })

  it('each side carries its left and right pages', () => {
    const pages: LogicalPage[] = [cover, makePage('1'), makePage('2'), back]
    const sheets = imposeBooklet(pages)
    const sides = duplexSides(sheets)

    expect(sides).toHaveLength(2)
    expect(sides[0].left).toEqual(sheets[0].front[0])
    expect(sides[0].right).toEqual(sheets[0].front[1])
    expect(sides[1].left).toEqual(sheets[0].back[0])
    expect(sides[1].right).toEqual(sheets[0].back[1])
  })

  it('returns empty for no sheets', () => {
    expect(duplexSides([])).toEqual([])
  })
})

// ── Integration: 4-page booklet saddle-stitch correctness ─────────────

describe('saddle-stitch correctness (4 pages)', () => {
  it('when folded, pages read in order: cover, p1, p2, back', () => {
    const pages: LogicalPage[] = [cover, makePage('p1'), makePage('p2'), back]
    const sheets = imposeBooklet(pages)
    expect(sheets).toHaveLength(1)
    const s = sheets[0]

    // Physical folding: the front-right is the cover (page you see first when
    // the folded sheet is closed). Opening it, front-left is the back cover
    // (wraps around). The inside (back side of the sheet) has p1 on the left
    // and p2 on the right, reading in order.
    expect(s.front[1].type).toBe('cover')
    expect(s.front[0].type).toBe('back')
    expect(s.back[0].type).toBe('content')
    expect(s.back[1].type).toBe('content')
  })
})

// ── Integration: 8-page booklet page ordering ─────────────────────────

describe('saddle-stitch correctness (8 pages)', () => {
  it('places cover on outermost front-right and back cover on outermost front-left', () => {
    const p = labeledPages(6)
    const pages: LogicalPage[] = [cover, ...p, back]
    const sheets = imposeBooklet(pages)

    expect(sheets[0].front[1].type).toBe('cover')
    expect(sheets[0].front[0].type).toBe('back')
  })
})
