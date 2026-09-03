import { describe, expect, it } from 'vitest'
import {
  SIGHT_WORD_CHIP_SCALES,
  layoutSightWordChips,
  sightWordsFooterText,
} from '../printBook'

/**
 * FEAT-185 (Codex P2 on PR #1744) — the sight-words page must fit the content
 * area it is given. The trimmed 5.5 × 7 booklet page has fewer chip rows than
 * the 8.5 in half it used to be drawn on, so a list that fit before could run
 * below the cut line. jsPDF is not exercised; `measure` is a stand-in font.
 */

/** A fake font: 2 mm per letter at 12 pt, scaling with the size. */
const measure = (word: string, fontSize: number) => word.length * 2 * (fontSize / 12)

/** Booklet half content area (139.7 − 2·12.7 wide). */
const HALF_W = 114.3
/** Content height on the untrimmed 8.5 in half vs the trimmed 7 in page. */
const UNTRIMMED_H = 215.9 - 2 * 12.7 // 190.5
const TRIMMED_H = 177.8 - 2 * 12.7 //   152.4

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`.slice(0, 5))

describe('layoutSightWordChips (FEAT-185)', () => {
  it('a short list keeps the historical 12 pt / 8 mm chips on every area', () => {
    for (const h of [UNTRIMMED_H, TRIMMED_H]) {
      const layout = layoutSightWordChips(words(10), measure, HALF_W, h)
      expect(layout.fontSize).toBe(SIGHT_WORD_CHIP_SCALES[0].fontSize)
      expect(layout.chipH).toBe(8)
      expect(layout.omitted).toEqual([])
      expect(layout.rows.flat()).toHaveLength(10)
    }
  })

  it('wraps chips by the area width and never lets a row exceed it', () => {
    const layout = layoutSightWordChips(words(30), measure, HALF_W, UNTRIMMED_H)
    expect(layout.rows.length).toBeGreaterThan(1)
    for (const row of layout.rows) {
      const rowW = row.reduce((sum, [, w]) => sum + w, 0) + (row.length - 1) * layout.chipGap
      expect(rowW).toBeLessThanOrEqual(HALF_W)
    }
  })

  it('a list that fit the untrimmed half at 12 pt steps down on the trimmed page instead of overflowing', () => {
    const list = words(60)
    const before = layoutSightWordChips(list, measure, HALF_W, UNTRIMMED_H)
    expect(before.fontSize).toBe(12)
    expect(before.footerY).toBeLessThanOrEqual(UNTRIMMED_H)

    const after = layoutSightWordChips(list, measure, HALF_W, TRIMMED_H)
    expect(after.fontSize).toBeLessThan(12)
    expect(after.omitted).toEqual([])
    expect(after.rows.flat()).toHaveLength(60)
    expect(after.footerY).toBeLessThanOrEqual(TRIMMED_H)
  })

  it('the footer baseline is always inside the area, at every scale', () => {
    for (const n of [1, 5, 20, 45, 60, 90, 150, 300]) {
      const layout = layoutSightWordChips(words(n), measure, HALF_W, TRIMMED_H)
      expect(layout.footerY).toBeLessThanOrEqual(TRIMMED_H)
      // and the last chip row ends above the footer
      const lastRowBottom = 35 + (layout.rows.length - 1) * (layout.chipH + layout.chipGap) + layout.chipH
      expect(lastRowBottom).toBeLessThan(layout.footerY)
    }
  })

  it('a list that cannot fit even at the smallest scale keeps the rows that fit and names the rest', () => {
    const list = words(300)
    const layout = layoutSightWordChips(list, measure, HALF_W, TRIMMED_H)
    const smallest = SIGHT_WORD_CHIP_SCALES[SIGHT_WORD_CHIP_SCALES.length - 1]
    expect(layout.fontSize).toBe(smallest.fontSize)
    expect(layout.omitted.length).toBeGreaterThan(0)
    expect(layout.rows.flat().length + layout.omitted.length).toBe(300)
    // Every kept word is placed once, in input order, and the omitted tail is the rest.
    const kept = layout.rows.flat().map(([w]) => w)
    expect([...kept, ...layout.omitted]).toEqual(list)
    expect(layout.footerY).toBeLessThanOrEqual(TRIMMED_H)
  })

  it('an empty list lays out nothing and omits nothing', () => {
    const layout = layoutSightWordChips([], measure, HALF_W, TRIMMED_H)
    expect(layout.rows).toEqual([])
    expect(layout.omitted).toEqual([])
  })
})

describe('sightWordsFooterText (FEAT-185)', () => {
  it('is the historical line when everything fit', () => {
    expect(sightWordsFooterText(0)).toBe('Look for these words as you read!')
  })

  it('says how many words did not fit', () => {
    expect(sightWordsFooterText(7)).toBe('Look for these words as you read! (and 7 more)')
  })
})
