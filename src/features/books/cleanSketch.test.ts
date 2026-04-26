import { describe, expect, it } from 'vitest'
import {
  medianRgb,
  removeBackgroundColor,
  rgbStdDev,
  sampleBorderRgb,
} from './cleanSketch'

/** Build an RGBA buffer of `width × height` filled with `bg`, then paint the
 *  inner block defined by [innerX0, innerY0, innerX1, innerY1] with `fg`. */
function makeImage(
  width: number,
  height: number,
  bg: [number, number, number],
  fg?: { rect: [number, number, number, number]; color: [number, number, number] },
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      data[i] = bg[0]
      data[i + 1] = bg[1]
      data[i + 2] = bg[2]
      data[i + 3] = 255
    }
  }
  if (fg) {
    const [x0, y0, x1, y1] = fg.rect
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4
        data[i] = fg.color[0]
        data[i + 1] = fg.color[1]
        data[i + 2] = fg.color[2]
        data[i + 3] = 255
      }
    }
  }
  return data
}

/** Count fully transparent (alpha=0) pixels inside a rectangle. */
function countTransparentInRect(
  data: Uint8ClampedArray,
  width: number,
  rect: [number, number, number, number],
): number {
  const [x0, y0, x1, y1] = rect
  let count = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) count++
    }
  }
  return count
}

describe('sampleBorderRgb', () => {
  it('samples only the outer ring, not the centre', () => {
    // Centre red, border white. 10×10 with border=2 should sample only white.
    const data = makeImage(10, 10, [255, 255, 255], {
      rect: [3, 3, 7, 7],
      color: [255, 0, 0],
    })
    const samples = sampleBorderRgb(data, 10, 10, 2)
    const n = samples.length / 3
    for (let i = 0; i < n; i++) {
      expect(samples[i * 3]).toBe(255)
      expect(samples[i * 3 + 1]).toBe(255)
      expect(samples[i * 3 + 2]).toBe(255)
    }
  })

  it('clamps an oversized border to the image size', () => {
    const data = makeImage(4, 4, [10, 20, 30])
    const samples = sampleBorderRgb(data, 4, 4, 999)
    // All 16 pixels should be sampled
    expect(samples.length).toBe(16 * 3)
  })
})

describe('medianRgb', () => {
  it('returns the per-channel median', () => {
    // 5 samples — sorted index 2 is the median
    const samples = new Uint8ClampedArray([
      10, 20, 30,
      40, 50, 60,
      70, 80, 90,
      100, 110, 120,
      130, 140, 150,
    ])
    expect(medianRgb(samples)).toEqual([70, 80, 90])
  })

  it('is robust to outliers (drawing strokes touching the border)', () => {
    // 8 white edge pixels + 1 black "outlier" stroke pixel
    const pixels: number[] = []
    for (let i = 0; i < 8; i++) pixels.push(255, 255, 255)
    pixels.push(0, 0, 0)
    const samples = new Uint8ClampedArray(pixels)
    // Median should still be white, not pulled toward the outlier
    expect(medianRgb(samples)).toEqual([255, 255, 255])
  })

  it('returns white for empty samples (defensive default)', () => {
    expect(medianRgb(new Uint8ClampedArray(0))).toEqual([255, 255, 255])
  })
})

describe('rgbStdDev', () => {
  it('is zero for a perfectly uniform background', () => {
    const samples = new Uint8ClampedArray(30)
    for (let i = 0; i < 10; i++) {
      samples[i * 3] = 200
      samples[i * 3 + 1] = 150
      samples[i * 3 + 2] = 100
    }
    expect(rgbStdDev(samples)).toBe(0)
  })

  it('rises with variance (busy patterned background)', () => {
    const samples = new Uint8ClampedArray([
      0, 0, 0,
      255, 255, 255,
      0, 0, 0,
      255, 255, 255,
    ])
    expect(rgbStdDev(samples)).toBeGreaterThan(100)
  })
})

describe('removeBackgroundColor', () => {
  it('removes white background from a black-line drawing on white paper', () => {
    const data = makeImage(20, 20, [255, 255, 255], {
      rect: [8, 8, 12, 12],
      color: [10, 10, 10],
    })
    removeBackgroundColor(data, [255, 255, 255], 60, 1.5)
    // White corner pixel should be transparent
    expect(data[3]).toBe(0)
    // Black centre pixel should still be opaque
    const i = (10 * 20 + 10) * 4
    expect(data[i + 3]).toBeGreaterThan(200)
  })

  it('removes brown table background while keeping a colored drawing', () => {
    // Brown table ~ rgb(120, 80, 50). Drawing in saturated red.
    const data = makeImage(20, 20, [120, 80, 50], {
      rect: [6, 6, 14, 14],
      color: [220, 30, 30],
    })
    removeBackgroundColor(data, [120, 80, 50], 60, 1.5)
    // Brown corner → transparent
    expect(data[3]).toBe(0)
    // Red drawing pixel → still opaque
    const i = (10 * 20 + 10) * 4
    expect(data[i + 3]).toBeGreaterThan(200)
  })

  it('removes blue construction-paper background', () => {
    const data = makeImage(20, 20, [60, 110, 200], {
      rect: [6, 6, 14, 14],
      color: [240, 230, 30], // yellow drawing
    })
    removeBackgroundColor(data, [60, 110, 200], 60, 1.5)
    expect(data[3]).toBe(0)
    const i = (10 * 20 + 10) * 4
    expect(data[i + 3]).toBeGreaterThan(200)
  })

  it('feathers the boundary instead of producing a binary cutout', () => {
    // Pure white border, mid-grey drawing — the grey is in the feather zone for tolerance=60.
    const data = makeImage(10, 10, [255, 255, 255], {
      rect: [3, 3, 7, 7],
      color: [205, 205, 205], // distance ~= 86 → feather zone (60–90)
    })
    removeBackgroundColor(data, [255, 255, 255], 60, 1.5)
    const i = (5 * 10 + 5) * 4
    expect(data[i + 3]).toBeGreaterThan(0)
    expect(data[i + 3]).toBeLessThan(255)
  })

  it('keeps the original alpha when feather alpha would be larger', () => {
    // Pixel that already has alpha=100 should not be brightened by feather logic.
    const data = new Uint8ClampedArray([200, 200, 200, 100])
    removeBackgroundColor(data, [255, 255, 255], 60, 1.5)
    // Distance from white ~= 95 → outside feather zone → alpha unchanged
    expect(data[3]).toBe(100)
  })

  it('full pipeline: edge sampling + median + removal cleans a colored-paper photo', () => {
    // 30×30 image. Border 5 px sampled. Background = brown table. Drawing in centre.
    const w = 30, h = 30
    const data = makeImage(w, h, [120, 80, 50], {
      rect: [10, 10, 20, 20],
      color: [240, 240, 240], // white drawing
    })
    const samples = sampleBorderRgb(data, w, h, 5)
    const bg = medianRgb(samples)
    expect(bg[0]).toBe(120)
    expect(bg[1]).toBe(80)
    expect(bg[2]).toBe(50)

    removeBackgroundColor(data, bg, 60, 1.5)
    // Every border pixel transparent
    const transparentTopRow = countTransparentInRect(data, w, [0, 0, w, 1])
    expect(transparentTopRow).toBe(w)
    // Every drawing-centre pixel still opaque
    const opaqueDrawingCentre = countTransparentInRect(data, w, [12, 12, 18, 18])
    expect(opaqueDrawingCentre).toBe(0)
  })
})
