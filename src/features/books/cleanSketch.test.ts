import { describe, expect, it } from 'vitest'
import {
  boostInkContrast,
  computeMinIslandPixels,
  luminance,
  medianRgb,
  pickBackgroundSample,
  removeBackgroundColor,
  removeSmallIslands,
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

// ── FEAT-159: cleanup that respects the paper ──────────────────────

/** Paint a filled rect of `color` into an existing RGBA buffer. */
function paint(
  data: Uint8ClampedArray,
  width: number,
  rect: [number, number, number, number],
  color: [number, number, number],
  alpha = 255,
) {
  const [x0, y0, x1, y1] = rect
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4
      data[i] = color[0]
      data[i + 1] = color[1]
      data[i + 2] = color[2]
      data[i + 3] = alpha
    }
  }
}

/**
 * The reported case: a sheet of white-ish paper photographed on a patterned
 * carpet. The outermost pixels are carpet; the paper is an inner frame; the
 * drawing sits in the middle.
 */
function makeCarpetPhoto(size = 60): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const dark = (x >> 1) % 2 === (y >> 1) % 2
      const v = dark ? 60 : 120
      data[i] = v + 20
      data[i + 1] = v
      data[i + 2] = v - 10
      data[i + 3] = 255
    }
  }
  // The sheet of paper, inset from the photo edge.
  paint(data, size, [8, 8, size - 8, size - 8], [238, 236, 230])
  // A faint pencil drawing in the middle of the paper.
  paint(data, size, [24, 24, 36, 36], [186, 184, 180])
  return data
}

describe('sampleBorderRgb — inset + region (FEAT-159)', () => {
  it('skips the outermost pixels when an inset is given', () => {
    const data = makeImage(20, 20, [255, 255, 255])
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        if (x < 2 || y < 2 || x > 17 || y > 17) {
          const i = (y * 20 + x) * 4
          data[i] = 255
          data[i + 1] = 0
          data[i + 2] = 0
        }
      }
    }
    // No inset → the red ring dominates the sample.
    expect(medianRgb(sampleBorderRgb(data, 20, 20, 2))).toEqual([255, 0, 0])
    // 15% inset (3px) starts the ring inside the red → pure white.
    const inset = sampleBorderRgb(data, 20, 20, 2, { insetFraction: 0.15 })
    expect(medianRgb(inset)).toEqual([255, 255, 255])
  })

  it('samples inside the crop box the parent drew, not the whole photo', () => {
    const data = makeImage(40, 40, [120, 80, 50])
    paint(data, 40, [10, 10, 30, 30], [60, 110, 200])
    expect(medianRgb(sampleBorderRgb(data, 40, 40, 3))).toEqual([120, 80, 50])
    const cropped = sampleBorderRgb(data, 40, 40, 3, {
      region: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    })
    expect(medianRgb(cropped)).toEqual([60, 110, 200])
  })
})

describe('pickBackgroundSample — bimodal ring (FEAT-159)', () => {
  it('picks the paper, not the median of paper-and-carpet', () => {
    const size = 60
    const data = makeCarpetPhoto(size)
    const samples = sampleBorderRgb(data, size, size, 10, { insetFraction: 0.02 })
    const picked = pickBackgroundSample(samples)

    // What the old path did: the plain median of the whole ring lands between
    // the carpet and the paper — the wrong color for either surface, which is
    // why the paper survived opaque in the reported case.
    const oldMedian = medianRgb(samples)
    expect(oldMedian[0]).toBeLessThan(200)

    expect(picked.bimodal).toBe(true)
    expect(picked.color[0]).toBeGreaterThan(200)
    expect(picked.color[1]).toBeGreaterThan(200)
    expect(picked.color[2]).toBeGreaterThan(200)

    // The reported symptom: the *whole ring's* std dev trips the
    // maxBackgroundStdDev gate (35) and drops us into the weak HSL fallback,
    // while the chosen paper cluster's own std dev does not.
    expect(rgbStdDev(samples)).toBeGreaterThan(35)
    expect(picked.stdDev).toBeLessThan(35)
  })

  it('knocks the paper out and leaves the drawing standing', () => {
    const size = 60
    const data = makeCarpetPhoto(size)
    const samples = sampleBorderRgb(data, size, size, 10, { insetFraction: 0.02 })
    const picked = pickBackgroundSample(samples)
    removeBackgroundColor(data, picked.color, 60, 1.5)

    const paperIdx = (12 * size + 12) * 4
    expect(data[paperIdx + 3]).toBe(0)
    const inkIdx = (30 * size + 30) * 4
    expect(data[inkIdx + 3]).toBeGreaterThan(200)
  })

  it('falls back to the median when the ring is one uniform surface', () => {
    const data = makeImage(30, 30, [120, 80, 50])
    const samples = sampleBorderRgb(data, 30, 30, 4)
    const picked = pickBackgroundSample(samples)
    expect(picked.bimodal).toBe(false)
    expect(picked.color).toEqual([120, 80, 50])
  })

  it('does not treat a few stroke pixels at the edge as a second surface', () => {
    const data = makeImage(40, 40, [250, 250, 250])
    paint(data, 40, [18, 0, 22, 3], [10, 10, 10])
    const samples = sampleBorderRgb(data, 40, 40, 3)
    const picked = pickBackgroundSample(samples)
    expect(picked.bimodal).toBe(false)
    expect(picked.color).toEqual([250, 250, 250])
  })

  it('picks white paper over a solid dark table (Codex P1, PR #1701)', () => {
    // Two *uniform* surfaces → std dev 0 for both clusters. A bare
    // `darker * ratio <= lighter` comparison hands the tie to the table and
    // leaves the sheet opaque — the exact failure this function exists to fix.
    const samples: number[] = []
    for (let i = 0; i < 40; i++) samples.push(248, 247, 244) // uniform white paper
    for (let i = 0; i < 40; i++) samples.push(52, 44, 38) // uniform dark table
    const picked = pickBackgroundSample(new Uint8ClampedArray(samples))
    expect(picked.bimodal).toBe(true)
    expect(picked.color[0]).toBeGreaterThan(200)
  })

  it('prefers a decisively flatter dark surface over a busy lighter one', () => {
    const samples: number[] = []
    for (let i = 0; i < 40; i++) samples.push(38, 36, 40) // flat dark paper
    for (let i = 0; i < 40; i++) {
      const v = i % 2 === 0 ? 150 : 245 // busy bright rug
      samples.push(v, v, v)
    }
    const picked = pickBackgroundSample(new Uint8ClampedArray(samples))
    expect(picked.bimodal).toBe(true)
    expect(picked.color[0]).toBeLessThan(60)
  })
})

describe('removeSmallIslands (FEAT-159)', () => {
  it('drops dust specks but keeps a multi-stroke drawing whole', () => {
    const w = 40
    const h = 40
    const data = new Uint8ClampedArray(w * h * 4) // all transparent
    paint(data, w, [4, 4, 14, 14], [20, 20, 20]) // 100 px stroke
    paint(data, w, [24, 24, 32, 32], [20, 20, 20]) // 64 px stroke
    paint(data, w, [2, 36, 3, 37], [20, 20, 20]) // dust
    paint(data, w, [36, 2, 37, 3], [20, 20, 20]) // dust

    const removed = removeSmallIslands(data, w, h, 20)
    expect(removed).toBe(2)
    expect(data[(36 * w + 2) * 4 + 3]).toBe(0)
    expect(data[(2 * w + 36) * 4 + 3]).toBe(0)
    // Both strokes survive.
    expect(data[(8 * w + 8) * 4 + 3]).toBe(255)
    expect(data[(28 * w + 28) * 4 + 3]).toBe(255)
  })

  it('accepts a threshold computed from the largest island', () => {
    const w = 40
    const h = 40
    const data = new Uint8ClampedArray(w * h * 4)
    paint(data, w, [4, 4, 14, 14], [20, 20, 20]) // 100 px stroke
    paint(data, w, [2, 36, 3, 37], [20, 20, 20]) // 1 px dust
    // 20% of the largest island → 20 px, so the speck goes and the stroke stays.
    const removed = removeSmallIslands(data, w, h, (largest) => largest * 0.2)
    expect(removed).toBe(1)
    expect(data[(36 * w + 2) * 4 + 3]).toBe(0)
    expect(data[(8 * w + 8) * 4 + 3]).toBe(255)
  })

  it('never removes the largest island, even below the threshold', () => {
    const w = 20
    const h = 20
    const data = new Uint8ClampedArray(w * h * 4)
    paint(data, w, [5, 5, 8, 8], [20, 20, 20]) // 9 px, the only island
    expect(removeSmallIslands(data, w, h, 5000)).toBe(0)
    expect(data[(6 * w + 6) * 4 + 3]).toBe(255)
  })
})

describe('boostInkContrast (FEAT-159)', () => {
  /** Mean luminance of pixels that survived the knockout. */
  function meanInkLuminance(data: Uint8ClampedArray): number {
    let sum = 0
    let n = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue
      sum += luminance(data[i], data[i + 1], data[i + 2])
      n++
    }
    return n ? sum / n : 0
  }

  it('measurably darkens faint pencil', () => {
    const paper: [number, number, number] = [238, 236, 230]
    const data = new Uint8ClampedArray([190, 188, 186, 255])
    const before = meanInkLuminance(data)
    boostInkContrast(data, paper, 1, 120)
    expect(meanInkLuminance(data)).toBeLessThan(before - 15)
  })

  it('leaves marker-on-white byte-identical (the regression rail)', () => {
    const white: [number, number, number] = [255, 255, 255]
    const data = new Uint8ClampedArray([
      15, 15, 15, 255,
      220, 30, 30, 255,
      30, 60, 200, 255,
    ])
    const before = Uint8ClampedArray.from(data)
    boostInkContrast(data, white, 1, 120)
    expect(Array.from(data)).toEqual(Array.from(before))
  })

  it('never lightens ink, and preserves hue when it does boost', () => {
    const white: [number, number, number] = [255, 255, 255]
    const data = new Uint8ClampedArray([240, 230, 30, 255])
    boostInkContrast(data, white, 1, 120)
    expect(luminance(data[0], data[1], data[2])).toBeLessThan(
      luminance(240, 230, 30),
    )
    // Still yellow: red ≈ green, blue far below both.
    expect(Math.abs(data[0] - data[1])).toBeLessThan(20)
    expect(data[2]).toBeLessThan(data[1] - 100)
  })

  it('is a no-op at zero strength', () => {
    const data = new Uint8ClampedArray([190, 188, 186, 255])
    const before = Uint8ClampedArray.from(data)
    boostInkContrast(data, [238, 236, 230], 0, 120)
    expect(Array.from(data)).toEqual(Array.from(before))
  })

  it('skips fully transparent pixels', () => {
    const data = new Uint8ClampedArray([200, 200, 200, 0])
    boostInkContrast(data, [238, 236, 230], 1, 120)
    expect(Array.from(data)).toEqual([200, 200, 200, 0])
  })
})

describe('marker-on-white characterization (the regression rail)', () => {
  it('cuts out marker on white paper at least as well as before', () => {
    const w = 30
    const h = 30
    const data = makeImage(w, h, [252, 252, 250], {
      rect: [10, 10, 20, 20],
      color: [25, 40, 190], // blue marker
    })
    const samples = sampleBorderRgb(data, w, h, 4, { insetFraction: 0.05 })
    const picked = pickBackgroundSample(samples)
    // A single uniform surface — the same background the old median path found.
    expect(picked.bimodal).toBe(false)
    expect(picked.color).toEqual([252, 252, 250])

    const beforeInk = Uint8ClampedArray.from(data)
    removeBackgroundColor(data, picked.color, 60, 1.5)
    removeSmallIslands(data, w, h, Math.max(2, Math.round(w * h * 0.0002)))
    boostInkContrast(data, picked.color, 1, 120)

    expect(data[3]).toBe(0)
    const ink = (15 * w + 15) * 4
    expect(data[ink + 3]).toBe(255)
    // Marker pixels are far from the paper, so the boost leaves them identical.
    expect(data[ink]).toBe(beforeInk[ink])
    expect(data[ink + 1]).toBe(beforeInk[ink + 1])
    expect(data[ink + 2]).toBe(beforeInk[ink + 2])
  })
})

describe('computeMinIslandPixels (Codex P2, PR #1701)', () => {
  it('does not scale the dust bound with the camera megapixels', () => {
    // A 4000×3000 phone photo. The old area-only bound (0.0002) landed at
    // 2,400 px — big enough to erase an eye dot, a period, or the dot of an "i".
    const area = 4000 * 3000
    expect(Math.round(area * 0.0002)).toBe(2400)
    // The shipped bound is an order of magnitude smaller.
    expect(computeMinIslandPixels(area, 500_000)).toBeLessThan(300)
  })

  it('keeps a small intentional mark on a high-resolution capture', () => {
    const area = 4000 * 3000
    // An eye dot roughly 30 px across on that capture ≈ 700 px of ink.
    const eyeDot = 700
    expect(computeMinIslandPixels(area, 500_000)).toBeLessThan(eyeDot)
  })

  it('tightens further for a sparse drawing, tracking content not frame', () => {
    const area = 4000 * 3000
    const sparse = computeMinIslandPixels(area, 20_000)
    const full = computeMinIslandPixels(area, 500_000)
    // The sparser the drawing, the lower the bar for keeping a mark.
    expect(sparse).toBeLessThan(full)
    expect(sparse).toBeGreaterThanOrEqual(2)
  })

  it('never drops below a 2px floor', () => {
    expect(computeMinIslandPixels(100, 4)).toBe(2)
  })
})
