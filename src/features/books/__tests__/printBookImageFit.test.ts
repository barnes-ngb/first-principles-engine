import { describe, expect, it } from 'vitest'

import { centerInBox, fitInBox } from '../printBook'

/**
 * FEAT-177 — the print geometry behind a background shown whole. jsPDF itself
 * is not exercised here; the decision (`resolveImageFit`) has its own suite in
 * `imageFit.test.ts`, and this covers the maths that places the picture.
 */

describe('fitInBox (print contain-fit, FEAT-177)', () => {
  it('a wide image in a tall box is limited by width, leaving space above and below', () => {
    // 200×100 source into a 100×100 box → 100×50.
    const fit = fitInBox(200, 100, 100, 100)
    expect(fit).toEqual({ w: 100, h: 50 })
    expect(fit.h).toBeLessThan(100)
  })

  it('a tall image in a wide box is limited by height, leaving space at the sides', () => {
    // 100×200 into a 150×100 box → 50×100.
    expect(fitInBox(100, 200, 150, 100)).toEqual({ w: 50, h: 100 })
  })

  it('a square scene in the 3:2 page area keeps its full height', () => {
    // The case the feature exists for: 1024×1024 art in a 150×100mm image area.
    const fit = fitInBox(1024, 1024, 150, 100)
    expect(fit).toEqual({ w: 100, h: 100 })
  })

  it('never enlarges past the box, and keeps the source aspect ratio', () => {
    const fit = fitInBox(300, 200, 90, 90)
    expect(fit.w).toBeLessThanOrEqual(90)
    expect(fit.h).toBeLessThanOrEqual(90)
    expect(fit.w / fit.h).toBeCloseTo(300 / 200)
  })
})

describe('centerInBox (print object-fit: contain, FEAT-177)', () => {
  it('centres a wide image vertically in a tall box', () => {
    const box = { x: 10, y: 20, w: 100, h: 100 }
    const fit = fitInBox(200, 100, box.w, box.h) // 100×50
    expect(centerInBox(box.x, box.y, box.w, box.h, fit)).toEqual({ x: 10, y: 45 })
  })

  it('centres a tall image horizontally in a wide box', () => {
    const fit = fitInBox(100, 200, 150, 100) // 50×100
    expect(centerInBox(0, 0, 150, 100, fit)).toEqual({ x: 50, y: 0 })
  })

  it('leaves an exactly-fitting image at the box origin', () => {
    const fit = fitInBox(150, 100, 150, 100)
    expect(centerInBox(5, 7, 150, 100, fit)).toEqual({ x: 5, y: 7 })
  })

  it('splits the leftover space evenly on both sides', () => {
    const box = { x: 0, y: 0, w: 150, h: 100 }
    const fit = fitInBox(1024, 1024, box.w, box.h) // 100×100
    const at = centerInBox(box.x, box.y, box.w, box.h, fit)
    expect(at.x).toBe(25)
    expect(box.w - (at.x + fit.w)).toBe(25)
  })
})
