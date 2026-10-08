import { describe, expect, it } from 'vitest'

import {
  arcadeArtLiteral,
  arcadeArtPixels,
  ARCADE_PALETTE,
  ArcadeArtFailure,
  convertToArcadeArt,
  MAX_ARCADE_SOURCE_PIXELS,
  nearestArcadePaletteIndex,
  visibleArcadeBounds,
  type ArcadeArtSize,
  type ArcadeArtSourcePixels,
} from './arcadeArt'

/**
 * The game-art converter — FEAT-239.
 *
 * Every number below is chosen so the expected answer is derivable by hand from
 * the four rules in the module header, and the comment says which rule it is
 * about. The two that could be dressed up as a success — an invisible source and
 * a grid that quantises to nothing — are asserted as ERRORS, because an empty
 * sprite exports perfectly and teaches nobody anything.
 */

// ── Fixtures ──────────────────────────────────────────────────────────────

type Pixel = readonly [number, number, number, number]

function makeSource(
  width: number,
  height: number,
  at: (x: number, y: number) => Pixel,
): ArcadeArtSourcePixels {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = at(x, y)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  return { width, height, data }
}

const WHITE: Pixel = [255, 255, 255, 255]
const BLACK: Pixel = [0, 0, 0, 255]
/** The trap: a cleared pixel's RGB is black, and it must never be averaged in. */
const CLEARED: Pixel = [0, 0, 0, 0]

/** The palette's own colours, recomputed here rather than imported derived. */
function paletteRgb(index: number): Pixel {
  const hex = ARCADE_PALETTE[index].hex
  if (!hex) return CLEARED
  const n = Number.parseInt(hex, 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, 255]
}

function convert(source: ArcadeArtSourcePixels, size: ArcadeArtSize = 16) {
  const result = convertToArcadeArt(source, size)
  if (!result.ok) throw new Error(`expected a conversion, got ${result.reason}`)
  return result.image
}

// ── The palette round-trips ───────────────────────────────────────────────

describe('the palette is its own fixed point', () => {
  it('maps every one of its own colours back to its own index', () => {
    // 16 × 16 at size 16 is a one-to-one cell/pixel mapping, and every pixel is
    // opaque, so the crop is the whole image and no averaging happens. A colour
    // the palette contains must therefore come back as that colour's index.
    const source = makeSource(16, 16, (x, y) => paletteRgb(((y * 16 + x) % 15) + 1))
    const image = convert(source)
    for (let i = 0; i < 256; i += 1) {
      expect(image.indices[i], `cell ${i}`).toBe((i % 15) + 1)
    }
  })

  it('reads black and white as black and white', () => {
    const source = makeSource(16, 16, (x) => (x < 8 ? WHITE : BLACK))
    const image = convert(source)
    expect(image.indices[0]).toBe(1) // ffffff
    expect(image.indices[15]).toBe(15) // 000000
    expect(image.rows[0]).toBe('1 1 1 1 1 1 1 1 f f f f f f f f')
  })

  it('answers the LOWEST index when two palette colours are equally near', () => {
    // (255, 81, 43) is the exact midpoint of ff2121 (index 2) and ff8135
    // (index 4): both are 2404 away and nothing else is close. The scan keeps a
    // result only on a STRICTLY smaller distance, so the tie is stable.
    expect(nearestArcadePaletteIndex(255, 81, 43)).toBe(2)
  })

  it('returns the minimum index among every equally-near colour, for any colour', () => {
    // The tie rule as a property rather than as one lucky triple.
    for (const probe of [
      [0, 0, 0],
      [128, 128, 128],
      [200, 40, 90],
      [10, 250, 130],
      [255, 81, 43],
    ] as const) {
      const distances = ARCADE_PALETTE.map((_entry, index) => {
        if (index === 0) return Number.POSITIVE_INFINITY
        const [r, g, b] = paletteRgb(index)
        return (probe[0] - r) ** 2 + (probe[1] - g) ** 2 + (probe[2] - b) ** 2
      })
      const best = Math.min(...distances)
      const lowest = distances.indexOf(best)
      expect(nearestArcadePaletteIndex(probe[0], probe[1], probe[2])).toBe(lowest)
    }
  })

  it('never answers the transparent index — it has no colour to be near', () => {
    expect(nearestArcadePaletteIndex(0, 0, 0)).toBeGreaterThan(0)
  })
})

// ── Alpha ─────────────────────────────────────────────────────────────────

describe('alpha decides the cell and weights the colour', () => {
  it('refuses a source with nothing visible in it', () => {
    const result = convertToArcadeArt(makeSource(16, 16, () => CLEARED), 16)
    expect(result).toEqual({ ok: false, reason: ArcadeArtFailure.EmptySource })
  })

  it('is INCLUSIVE at 0.5 — a full cell of alpha 128 is drawn', () => {
    const image = convert(makeSource(16, 16, () => [255, 33, 33, 128]))
    // 128 / 255 = 0.50196, which is not below the threshold.
    expect(image.indices.every((i) => i === 2)).toBe(true)
  })

  it('and a full cell of alpha 127 is not — which is an EMPTY RESULT, not a blank sprite', () => {
    // 127 / 255 = 0.498. Something was visible (the crop found it), and the
    // whole grid still came out transparent. That is a refusal with its own
    // reason, because a blank export looks exactly like a successful one.
    const result = convertToArcadeArt(makeSource(16, 16, () => [255, 33, 33, 127]), 16)
    expect(result).toEqual({ ok: false, reason: ArcadeArtFailure.EmptyResult })
  })

  it('divides the average alpha by the WHOLE cell, not by what is covered', () => {
    // 32 × 32 at size 16, so every cell covers exactly four source pixels. The
    // left half has one fully opaque pixel per cell and three clear ones — an
    // average of 0.25, below the threshold, however opaque that one pixel is —
    // and the right half is solid. Dividing by the covered weight instead would
    // read the left half as pure white and draw the whole row.
    const source = makeSource(32, 32, (x, y) => {
      if (x >= 16) return WHITE
      return x % 2 === 0 && y % 2 === 0 ? WHITE : CLEARED
    })
    const image = convert(source, 16)
    for (const row of image.rows) {
      expect(row).toBe('. . . . . . . . 1 1 1 1 1 1 1 1')
    }
  })

  it('never lets an invisible pixel darken the colour it sits beside', () => {
    // Three opaque white pixels and one CLEARED (black, alpha 0) per cell.
    // Weighted by alpha: 0.75 average alpha (drawn) and pure white → index 1.
    // An un-weighted average would read (255 × 3 + 0) / 4 = 191 and land on
    // index 13 (e5cdc4) — so this test tells the two implementations apart.
    const source = makeSource(32, 32, (x, y) =>
      x % 2 === 1 && y % 2 === 1 ? CLEARED : WHITE,
    )
    const image = convert(source, 16)
    expect(image.indices.every((i) => i === 1)).toBe(true)
  })
})

// ── Crop and square fit ───────────────────────────────────────────────────

describe('the crop is what is drawn, and the fit never stretches', () => {
  it('finds the non-zero-alpha bounding box, faint pixels included', () => {
    const source = makeSource(10, 10, (x, y) => {
      if (x === 3 && y === 2) return [255, 255, 255, 255]
      if (x === 6 && y === 7) return [255, 255, 255, 1] // alpha 1: still drawn
      return CLEARED
    })
    expect(visibleArcadeBounds(source)).toEqual({ x: 3, y: 2, width: 4, height: 6 })
  })

  it('answers null for a wholly invisible source', () => {
    expect(visibleArcadeBounds(makeSource(4, 4, () => CLEARED))).toBeNull()
  })

  it('pads a TALL drawing left and right, and leaves the picture unstretched', () => {
    // 8 × 16 opaque. Side 16, so originX = 0 − (16 − 8) / 2 = −4: four empty
    // columns, eight drawn, four empty. A stretch would fill the row.
    const image = convert(makeSource(8, 16, () => WHITE))
    for (const row of image.rows) {
      expect(row).toBe('. . . . 1 1 1 1 1 1 1 1 . . . .')
    }
  })

  it('pads a WIDE drawing top and bottom', () => {
    const image = convert(makeSource(16, 8, () => WHITE))
    const clear = '. . . . . . . . . . . . . . . .'
    const drawn = '1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1'
    expect(image.rows[0]).toBe(clear)
    expect(image.rows[3]).toBe(clear)
    expect(image.rows[4]).toBe(drawn)
    expect(image.rows[11]).toBe(drawn)
    expect(image.rows[12]).toBe(clear)
    expect(image.rows[15]).toBe(clear)
  })

  it('pads an ODD difference by half a pixel rather than flooring it', () => {
    // 7 × 16 opaque. Side 16, originX = −4.5. Column 4 covers source x in
    // [−0.5, 0.5) — half of pixel 0 — so its average alpha is exactly 0.5 and
    // it is DRAWN; column 3 covers [−1.5, −0.5) and is empty. Flooring the
    // offset first would shift the whole picture a half pixel to one side, and
    // at sixteen cells that lean is visible.
    const image = convert(makeSource(7, 16, () => WHITE))
    for (const row of image.rows) {
      expect(row).toBe('. . . . 1 1 1 1 1 1 1 1 . . . .')
    }
  })

  it('keeps a border a border', () => {
    const source = makeSource(16, 16, (x, y) =>
      x === 0 || y === 0 || x === 15 || y === 15 ? BLACK : CLEARED,
    )
    const image = convert(source)
    expect(image.rows[0]).toBe('f f f f f f f f f f f f f f f f')
    expect(image.rows[8]).toBe('f . . . . . . . . . . . . . . f')
    expect(image.rows[15]).toBe('f f f f f f f f f f f f f f f f')
  })

  it('integrates a large drawing rather than sampling it', () => {
    // 160 × 160 of one colour down to 16: each cell covers 100 source pixels.
    // Half of them cleared in a fine checker — average alpha 0.5, inclusive —
    // and the colour is still the one colour that is actually there.
    const source = makeSource(160, 160, (x, y) =>
      (x + y) % 2 === 0 ? paletteRgb(7) : CLEARED,
    )
    const image = convert(source, 16)
    expect(image.indices.every((i) => i === 7)).toBe(true)
  })
})

// ── Validation ────────────────────────────────────────────────────────────

describe('it validates before it loops', () => {
  const ok = makeSource(4, 4, () => WHITE)

  it('refuses a size it does not make', () => {
    expect(convertToArcadeArt(ok, 8 as unknown as ArcadeArtSize)).toEqual({
      ok: false,
      reason: ArcadeArtFailure.InvalidSize,
    })
  })

  const badDimensions: [string, number, number][] = [
    ['zero width', 0, 4],
    ['a negative height', 4, -4],
    ['a fractional width', 4.5, 4],
    ['a NaN height', 4, Number.NaN],
    ['an infinite width', Number.POSITIVE_INFINITY, 4],
  ]
  for (const [label, width, height] of badDimensions) {
    it(`refuses ${label}`, () => {
      expect(convertToArcadeArt({ width, height, data: ok.data }, 16)).toEqual({
        ok: false,
        reason: ArcadeArtFailure.InvalidDimensions,
      })
    })
  }

  it('refuses a pixel count over the ceiling BEFORE touching the buffer', () => {
    // Dimensions that would need 24 MB of RGBA, with a four-pixel buffer. The
    // size check has to come first or this allocates nothing and still crashes.
    expect(
      convertToArcadeArt({ width: 3000, height: 2000, data: ok.data }, 16),
    ).toEqual({ ok: false, reason: ArcadeArtFailure.TooLarge })
    expect(3000 * 2000).toBeGreaterThan(MAX_ARCADE_SOURCE_PIXELS)
  })

  it('refuses a buffer that is the wrong length', () => {
    expect(
      convertToArcadeArt({ width: 4, height: 4, data: new Uint8ClampedArray(10) }, 16),
    ).toEqual({ ok: false, reason: ArcadeArtFailure.InvalidBuffer })
  })

  it('refuses a buffer that is not typed pixels at all', () => {
    const untyped = new Array(4 * 4 * 4).fill(255) as unknown as Uint8ClampedArray
    expect(convertToArcadeArt({ width: 4, height: 4, data: untyped }, 16)).toEqual({
      ok: false,
      reason: ArcadeArtFailure.InvalidBuffer,
    })
  })
})

// ── Both sizes, and the literal ───────────────────────────────────────────

describe('both output sizes', () => {
  for (const size of [16, 32] as const) {
    it(`produces a ${size} × ${size} grid and ${size} rows`, () => {
      const image = convert(makeSource(40, 40, () => WHITE), size)
      expect(image.size).toBe(size)
      expect(image.indices).toHaveLength(size * size)
      expect(image.rows).toHaveLength(size)
      for (const row of image.rows) expect(row.split(' ')).toHaveLength(size)
    })
  }

  it('keeps detail at 32 that 16 cannot hold', () => {
    // A single opaque pixel in a 32 × 32 source: at 32 the cell is that pixel
    // and survives; at 16 it is one quarter of a cell and does not.
    const source = makeSource(32, 32, (x, y) =>
      x === 0 && y === 0 ? WHITE : x === 31 && y === 31 ? WHITE : CLEARED,
    )
    const fine = convert(source, 32)
    expect(fine.indices[0]).toBe(1)
    expect(fine.indices[32 * 32 - 1]).toBe(1)
    expect(convertToArcadeArt(source, 16)).toEqual({
      ok: false,
      reason: ArcadeArtFailure.EmptyResult,
    })
  })
})

describe('the image literal', () => {
  /**
   * The golden, written out by hand.
   *
   * Four-space indent, one row per line, `img\`` and the closing back-tick each
   * alone on their own line. This is the exact text a person pastes OVER an
   * existing literal in their game's JavaScript, so its shape is pinned rather
   * than derived from the same code that produces it.
   */
  const BORDER_GOLDEN = `img\`
    f f f f f f f f f f f f f f f f
    f . . . . . . . . . . . . . . f
    f . . . . . . . . . . . . . . f
    f . . . . . . . . . . . . . . f
    f . . . . . . . . . . . . . . f
    f . . . . . . . . . . . . . . f
    f . . . . . . . . . . . . . . f
    f . . . . . . . . . . . . . . f
    f . . . . . . . . . . . . . . f
    f . . . . . . . . . . . . . . f
    f . . . . . . . . . . . . . . f
    f . . . . . . . . . . . . . . f
    f . . . . . . . . . . . . . . f
    f . . . . . . . . . . . . . . f
    f . . . . . . . . . . . . . . f
    f f f f f f f f f f f f f f f f
\``

  /**
   * The golden checks itself before it checks the converter.
   *
   * A hand-written fixture can be wrong, and a 15-row golden pinned against a
   * 15-row bug would pass. So its own shape is asserted independently of the
   * code under test: sixteen rows between the back-ticks, sixteen tokens each.
   */
  it('is itself a well-formed 16 × 16 literal', () => {
    const lines = BORDER_GOLDEN.split('\n')
    expect(lines[0]).toBe('img`')
    expect(lines[lines.length - 1]).toBe('`')
    const rows = lines.slice(1, -1)
    expect(rows).toHaveLength(16)
    for (const row of rows) {
      expect(row.startsWith('    ')).toBe(true)
      expect(row.slice(4).split(' ')).toHaveLength(16)
    }
  })

  it('matches the golden, character for character', () => {
    const source = makeSource(16, 16, (x, y) =>
      x === 0 || y === 0 || x === 15 || y === 15 ? BLACK : CLEARED,
    )
    expect(convert(source).literal).toBe(BORDER_GOLDEN)
  })

  it('is the same text the converter put on the result', () => {
    const source = makeSource(16, 16, () => WHITE)
    const image = convert(source)
    expect(arcadeArtLiteral(image.indices, image.size)).toBe(image.literal)
  })

  it('uses `.` for transparent and 1..f for the fifteen colours', () => {
    expect(ARCADE_PALETTE.map((e) => e.char).join('')).toBe('.123456789abcdef')
  })

  it('refuses a grid that does not match its declared size', () => {
    expect(() => arcadeArtLiteral(new Uint8Array(10), 16)).toThrow(RangeError)
  })
})

// ── The PNG's pixels ──────────────────────────────────────────────────────

describe('the exported pixels', () => {
  it('are exactly one byte-quad per CELL — the sprite, not the zoomed view', () => {
    for (const size of [16, 32] as const) {
      const indices = new Uint8Array(size * size)
      expect(arcadeArtPixels(indices, size)).toHaveLength(size * size * 4)
    }
  })

  it('give a `.` cell alpha 0 and every other cell alpha 255', () => {
    const indices = new Uint8Array(16 * 16)
    indices[0] = 0
    indices[1] = 2 // ff2121
    indices[2] = 15 // 000000
    const pixels = arcadeArtPixels(indices, 16)
    expect([...pixels.slice(0, 4)]).toEqual([0, 0, 0, 0])
    expect([...pixels.slice(4, 8)]).toEqual([255, 33, 33, 255])
    // The one that cannot be read off alpha alone: opaque black is NOT clear.
    expect([...pixels.slice(8, 12)]).toEqual([0, 0, 0, 255])
  })

  it('refuses a grid that does not match its declared size', () => {
    expect(() => arcadeArtPixels(new Uint8Array(7), 16)).toThrow(RangeError)
  })
})
