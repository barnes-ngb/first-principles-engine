import { describe, expect, it } from 'vitest'

import {
  BLANK_PAGE,
  duplexSides,
  imposeBooklet,
  padToSignature,
} from './bookletImposition'
import type { LogicalPage } from './bookletImposition'

function cover(): LogicalPage {
  return { type: 'cover' }
}
function back(): LogicalPage {
  return { type: 'back' }
}
function page(i: number): LogicalPage {
  return { type: 'content', page: {} as never, index: i }
}
function sightWords(): LogicalPage {
  return { type: 'sight-words' }
}

// --- padToSignature ---

describe('padToSignature', () => {
  it('returns unchanged copy when already a multiple of 4', () => {
    const pages = [cover(), page(1), page(2), back()]
    const result = padToSignature(pages)
    expect(result).toHaveLength(4)
    expect(result).not.toBe(pages)
  })

  it('pads to next multiple of 4', () => {
    const pages = [cover(), page(1)]
    const result = padToSignature(pages)
    expect(result).toHaveLength(4)
  })

  it('pads 5 pages to 8', () => {
    const pages = [cover(), page(1), page(2), page(3), page(4)]
    const result = padToSignature(pages)
    expect(result).toHaveLength(8)
  })

  it('pads 6 pages to 8', () => {
    const pages = Array.from({ length: 6 }, (_, i) => page(i))
    const result = padToSignature(pages)
    expect(result).toHaveLength(8)
  })

  it('inserts blanks BEFORE back cover when last page is back', () => {
    const pages = [cover(), page(1), back()]
    const result = padToSignature(pages)
    expect(result).toHaveLength(4)
    expect(result[0]).toEqual(cover())
    expect(result[1]).toEqual(page(1))
    expect(result[2]).toEqual(BLANK_PAGE)
    expect(result[3]).toEqual(back())
  })

  it('appends blanks at end when no back cover', () => {
    const pages = [cover(), page(1), page(2)]
    const result = padToSignature(pages)
    expect(result).toHaveLength(4)
    expect(result[3]).toEqual(BLANK_PAGE)
  })

  it('handles empty input', () => {
    expect(padToSignature([])).toEqual([])
  })

  it('handles single page', () => {
    const result = padToSignature([cover()])
    expect(result).toHaveLength(4)
    expect(result[0]).toEqual(cover())
    expect(result[1]).toEqual(BLANK_PAGE)
    expect(result[2]).toEqual(BLANK_PAGE)
    expect(result[3]).toEqual(BLANK_PAGE)
  })
})

// --- imposeBooklet ---

describe('imposeBooklet', () => {
  it('returns empty for empty input', () => {
    expect(imposeBooklet([])).toEqual([])
  })

  it('imposes a 4-page booklet correctly', () => {
    const pages = [cover(), page(1), page(2), back()]
    const sheets = imposeBooklet(pages)
    expect(sheets).toHaveLength(1)

    const s = sheets[0]
    expect(s.sheet).toBe(1)
    expect(s.front[0].type).toBe('back')
    expect(s.front[1].type).toBe('cover')
    expect(s.back[0].type).toBe('content')
    expect(s.back[1].type).toBe('content')
  })

  it('imposes an 8-page booklet onto 2 sheets', () => {
    const pages = [
      cover(),
      page(1),
      page(2),
      page(3),
      page(4),
      page(5),
      sightWords(),
      back(),
    ]
    const sheets = imposeBooklet(pages)
    expect(sheets).toHaveLength(2)

    expect(sheets[0].sheet).toBe(1)
    expect(sheets[1].sheet).toBe(2)

    expect(sheets[0].front[1].type).toBe('cover')
    expect(sheets[0].front[0].type).toBe('back')
  })

  it('pads non-multiple-of-4 inputs', () => {
    const pages = [cover(), page(1), back()]
    const sheets = imposeBooklet(pages)
    expect(sheets).toHaveLength(1)

    const s = sheets[0]
    expect(s.front[1].type).toBe('cover')
    expect(s.front[0].type).toBe('back')
  })

  it('the outermost sheet has cover on front-right and back-cover on front-left', () => {
    const pages = Array.from({ length: 12 }, (_, i) => {
      if (i === 0) return cover()
      if (i === 11) return back()
      return page(i)
    })
    const sheets = imposeBooklet(pages)
    expect(sheets[0].front[1].type).toBe('cover')
    expect(sheets[0].front[0].type).toBe('back')
  })

  it('all logical pages appear exactly once across all sheet sides', () => {
    const pages = [cover(), page(1), page(2), page(3), page(4), page(5), page(6), back()]
    const sheets = imposeBooklet(pages)

    const allPages: LogicalPage[] = []
    for (const s of sheets) {
      allPages.push(s.front[0], s.front[1], s.back[0], s.back[1])
    }

    expect(allPages).toHaveLength(8)

    const types = allPages.map((p) =>
      p.type === 'content' ? `content-${p.index}` : p.type,
    )
    const unique = new Set(types)
    expect(unique.size).toBe(8)
  })

  it('does not mutate input array', () => {
    const pages = [cover(), page(1), page(2), back()]
    const copy = [...pages]
    imposeBooklet(pages)
    expect(pages).toEqual(copy)
    expect(pages).toHaveLength(4)
  })
})

// --- duplexSides ---

describe('duplexSides', () => {
  it('returns empty for no sheets', () => {
    expect(duplexSides([])).toEqual([])
  })

  it('interleaves front and back for each sheet', () => {
    const pages = [cover(), page(1), page(2), back()]
    const sheets = imposeBooklet(pages)
    const sides = duplexSides(sheets)

    expect(sides).toHaveLength(2)
    expect(sides[0].face).toBe('front')
    expect(sides[0].sheet).toBe(1)
    expect(sides[1].face).toBe('back')
    expect(sides[1].sheet).toBe(1)
  })

  it('orders as front1, back1, front2, back2 for multi-sheet', () => {
    const pages = Array.from({ length: 8 }, (_, i) => page(i))
    const sheets = imposeBooklet(pages)
    const sides = duplexSides(sheets)

    expect(sides).toHaveLength(4)
    expect(sides[0]).toEqual(
      expect.objectContaining({ sheet: 1, face: 'front' }),
    )
    expect(sides[1]).toEqual(
      expect.objectContaining({ sheet: 1, face: 'back' }),
    )
    expect(sides[2]).toEqual(
      expect.objectContaining({ sheet: 2, face: 'front' }),
    )
    expect(sides[3]).toEqual(
      expect.objectContaining({ sheet: 2, face: 'back' }),
    )
  })

  it('each side carries left and right logical pages', () => {
    const pages = [cover(), page(1), page(2), back()]
    const sheets = imposeBooklet(pages)
    const sides = duplexSides(sheets)

    for (const side of sides) {
      expect(side.left).toBeDefined()
      expect(side.right).toBeDefined()
      expect(side.left.type).toBeTruthy()
      expect(side.right.type).toBeTruthy()
    }
  })
})
