/**
 * A saved sticker, as game art for MakeCode Arcade — the pure half (FEAT-239).
 *
 * ## What this module answers
 *
 * *What does this picture look like as a 16×16 or 32×32 Arcade sprite, in
 * Arcade's own sixteen default colours, and what is the exact image literal a
 * person pastes into their game?* Nothing else: no React, no canvas, no
 * Firestore, no network. The DOM boundary (loading the bytes, encoding the PNG)
 * is `arcadeArtImage.ts`; the session, copy and identity rules are
 * `arcadeArtSession.ts`.
 *
 * ## The palette is ONE constant
 *
 * {@link ARCADE_PALETTE} is the single table: the character a cell is written
 * as and the hex Arcade draws it in, in index order, read from
 * https://arcade.makecode.com/developer/images. The RGB triples the nearest-
 * colour search uses are **derived** from it at module load rather than typed
 * out again, so a palette edit cannot leave the search matching the old colours
 * while the literal spells the new ones.
 *
 * These are the sixteen colours of Arcade's **default** palette. A project that
 * has replaced its palette draws the same indices in different colours — which
 * is a fact about the destination, not about this conversion, and is why
 * `arcadeArtSession.ts` says so in words beside the literal.
 *
 * ## The conversion, and the four decisions inside it
 *
 * **1. Crop to what is actually drawn.** The bounding box of every pixel with
 * non-zero alpha. Faint outlying pixels are inside it by design: they are part
 * of the picture, and guessing a threshold here would silently crop art.
 *
 * **2. Pad to a square, centred, and NEVER stretch.** The square's side is the
 * longer crop edge, and the shorter axis is padded equally on both sides —
 * **fractionally** where the difference is odd, because flooring first is a
 * half-pixel shift applied to one edge only. The padding is transparent and
 * lies outside the source, so it contributes no colour and no alpha.
 *
 * **3. Integrate, don't sample.** Each output cell covers an exact rectangle of
 * source space, usually with fractional edges. Every source pixel it overlaps
 * contributes in proportion to the overlapping AREA, so shrinking a 900px
 * drawing to 16 cells reads all of it rather than 256 lucky pixels.
 *
 * **4. Alpha decides the cell; alpha weights the colour.** A cell's average
 * alpha is `Σ(area × alpha) / cellArea` — the denominator is the WHOLE cell,
 * padding included, so a cell that is mostly outside the drawing goes
 * transparent rather than taking the colour of the sliver inside it. Below 0.5
 * the cell is transparent; 0.5 and above it is opaque (a full cell of alpha 127
 * is transparent, 128 is opaque). The colour divides by the alpha weight only,
 * so **a fully transparent pixel's RGB can never darken an edge** — the exact
 * trap in an un-weighted average, where the black-by-default RGB of cleared
 * pixels bleeds a dark fringe around everything.
 *
 * ## Refusals, not guesses
 *
 * Every way this can fail is named and returned (see {@link ArcadeArtFailure}).
 * Two of them are worth stating plainly, because both could be dressed up as a
 * success: a source with no visible pixel at all, and a source whose visible
 * pixels all average below the alpha threshold and quantise to an empty grid.
 * An empty sprite is not a conversion; it is a blank file that looks like one.
 */

// ── The palette ─────────────────────────────────────────────────────────────

/**
 * MakeCode Arcade's default sixteen colours, in index order.
 *
 * `char` is how index *i* is written inside an image literal — `.` for the
 * transparent index 0, then `1`..`f`. `hex` is the colour Arcade draws, without
 * a leading `#`, exactly as the Arcade image documentation lists it; index 0 has
 * none, because transparent is an absence rather than a colour.
 *
 * The one table. Everything else in this module is derived from it.
 */
export const ARCADE_PALETTE = [
  { char: '.', hex: null },
  { char: '1', hex: 'ffffff' },
  { char: '2', hex: 'ff2121' },
  { char: '3', hex: 'ff93c4' },
  { char: '4', hex: 'ff8135' },
  { char: '5', hex: 'fff609' },
  { char: '6', hex: '249ca3' },
  { char: '7', hex: '78dc52' },
  { char: '8', hex: '003fad' },
  { char: '9', hex: '87f2ff' },
  { char: 'a', hex: '8e2ec4' },
  { char: 'b', hex: 'a4839f' },
  { char: 'c', hex: '5c406c' },
  { char: 'd', hex: 'e5cdc4' },
  { char: 'e', hex: '91463d' },
  { char: 'f', hex: '000000' },
] as const

/** The transparent index. Written as `.`, exported as alpha 0. */
export const ARCADE_TRANSPARENT_INDEX = 0

/**
 * The opaque colours as RGB triples, derived from {@link ARCADE_PALETTE}.
 *
 * Deliberately not exported and deliberately not hand-written: a second list
 * would be a second answer, and the one that drifts is always the one the
 * nearest-colour search reads.
 */
const PALETTE_RGB: readonly (readonly [number, number, number] | null)[] =
  ARCADE_PALETTE.map((entry) => {
    if (entry.hex === null) return null
    const value = Number.parseInt(entry.hex, 16)
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff] as const
  })

/** The colour an index is drawn in, as CSS. `null` for transparent. */
export function arcadePaletteCss(index: number): string | null {
  const entry = ARCADE_PALETTE[index]
  return entry && entry.hex ? `#${entry.hex}` : null
}

/**
 * The palette index whose colour is nearest this RGB, never index 0.
 *
 * Squared Euclidean distance in RGB, which is what Arcade's own converter uses
 * and what the family will compare against on screen. **Ties go to the lowest
 * index**, because the scan keeps a result only on a strictly smaller distance —
 * so the same colour always lands on the same index, in this run and the next.
 *
 * Transparency is decided by alpha before this is ever asked, so index 0 is not
 * a candidate: it has no colour to be near.
 */
export function nearestArcadePaletteIndex(r: number, g: number, b: number): number {
  let best = 1
  let bestDistance = Number.POSITIVE_INFINITY
  for (let i = 1; i < PALETTE_RGB.length; i += 1) {
    const rgb = PALETTE_RGB[i]
    if (!rgb) continue
    const dr = r - rgb[0]
    const dg = g - rgb[1]
    const db = b - rgb[2]
    const distance = dr * dr + dg * dg + db * db
    if (distance < bestDistance) {
      bestDistance = distance
      best = i
    }
  }
  return best
}

// ── Sizes ───────────────────────────────────────────────────────────────────

/**
 * The two square sizes this slice makes.
 *
 * Arcade supports rectangular images, and this product slice deliberately does
 * not: a square grid is the one shape that can be centre-padded from any
 * drawing without stretching it, and a sprite sized to the drawing's aspect
 * ratio is a different feature with its own questions (which axis is 16?).
 */
export const ARCADE_ART_SIZES = [16, 32] as const
export type ArcadeArtSize = (typeof ARCADE_ART_SIZES)[number]

export function isArcadeArtSize(value: unknown): value is ArcadeArtSize {
  return ARCADE_ART_SIZES.includes(value as ArcadeArtSize)
}

/**
 * The most source pixels this will integrate over.
 *
 * The same ceiling and the same reason as `cleanupMask.MAX_CLEANUP_PIXELS`: a
 * phone camera can exceed it by an order of magnitude, and the honest answer is
 * to refuse rather than to resize the source behind the person's back or
 * allocate an unbounded buffer. The decode that produced the pixels has already
 * allocated them, so this is a bound on OUR work — the loader bounds the bytes
 * before the decode (see `arcadeArtImage.ts`).
 */
export const MAX_ARCADE_SOURCE_PIXELS = 4_000_000

/** The alpha a cell must average to be drawn at all. Inclusive. */
export const ARCADE_ALPHA_THRESHOLD = 0.5

// ── Inputs, outputs and refusals ────────────────────────────────────────────

/** Decoded RGBA pixels, row-major, four bytes per pixel. */
export interface ArcadeArtSourcePixels {
  width: number
  height: number
  data: Uint8ClampedArray
}

/** Why a conversion produced nothing. Each one needs its own sentence. */
export const ArcadeArtFailure = {
  /** Not 16 or 32 — a caller asked for a size this slice does not make. */
  InvalidSize: 'invalid-size',
  /** Width/height not finite positive integers, or their product unsafe. */
  InvalidDimensions: 'invalid-dimensions',
  /** Not typed RGBA, or not `width × height × 4` bytes long. */
  InvalidBuffer: 'invalid-buffer',
  /** More pixels than {@link MAX_ARCADE_SOURCE_PIXELS}. */
  TooLarge: 'too-large',
  /** Every pixel is fully transparent: there is no picture to convert. */
  EmptySource: 'empty-source',
  /**
   * Something was visible, and the whole grid still came out transparent.
   * A real outcome for a very faint or very thin drawing at 16×16 — and an
   * ERROR, not a blank success, because an empty sprite exports cleanly and
   * teaches the person nothing about why their picture vanished.
   */
  EmptyResult: 'empty-result',
} as const
export type ArcadeArtFailure =
  (typeof ArcadeArtFailure)[keyof typeof ArcadeArtFailure]

/** One converted picture: the grid, how it reads, and what gets pasted. */
export interface ArcadeArtImage {
  size: ArcadeArtSize
  /** `size × size` palette indices, row-major. */
  indices: Uint8Array
  /** One string per row — palette characters separated by single spaces. */
  rows: string[]
  /** The MakeCode JavaScript image literal, back-ticks included. */
  literal: string
}

export type ArcadeArtResult =
  | { ok: true; image: ArcadeArtImage }
  | { ok: false; reason: ArcadeArtFailure }

// ── The literal ─────────────────────────────────────────────────────────────

/**
 * The indent each row of a literal carries.
 *
 * Four spaces, which is what the MakeCode editor itself emits, so a literal
 * pasted over an existing one reads the same as its neighbours. Arcade's parser
 * ignores the whitespace either way; this is for the person reading the code.
 */
export const ARCADE_LITERAL_INDENT = '    '

/** One row of palette characters, separated by single spaces. */
export function arcadeArtRow(
  indices: Uint8Array,
  size: ArcadeArtSize,
  row: number,
): string {
  const chars: string[] = []
  for (let x = 0; x < size; x += 1) {
    chars.push(ARCADE_PALETTE[indices[row * size + x]].char)
  }
  return chars.join(' ')
}

/**
 * The image literal for a grid of indices.
 *
 * Shape, pinned by a golden test: `img\`` alone on the first line, one indented
 * row per line, and the closing back-tick alone on the last. This is what gets
 * pasted OVER an existing `img\`…\`` in a game's JavaScript — see
 * `arcadeArtSession.ts` for the instructions that say so, because pasting it at
 * the top level of a program is a syntax error rather than a sprite.
 *
 * Throws on a grid that does not match its own declared size. The converter
 * cannot produce one; a caller that hand-builds indices can, and a silently
 * short literal is a corrupt sprite rather than a visible failure.
 */
export function arcadeArtLiteral(indices: Uint8Array, size: ArcadeArtSize): string {
  if (!isArcadeArtSize(size)) {
    throw new RangeError('arcadeArtLiteral: size must be 16 or 32')
  }
  if (indices.length !== size * size) {
    throw new RangeError(
      `arcadeArtLiteral: ${indices.length} indices for a ${size}×${size} grid`,
    )
  }
  const rows: string[] = []
  for (let y = 0; y < size; y += 1) rows.push(arcadeArtRow(indices, size, y))
  return `img\`\n${rows.map((r) => ARCADE_LITERAL_INDENT + r).join('\n')}\n\``
}

// ── Pixels, for the native-resolution PNG ───────────────────────────────────

/**
 * The grid expanded to RGBA bytes, one byte-quad per CELL.
 *
 * `size × size × 4` and nothing else — the downloaded PNG is exactly the
 * sprite, not the enlarged copy the preview shows. Index 0 becomes fully
 * transparent black; every other index its palette colour at alpha 255. There
 * is no partial alpha anywhere in the output, because an Arcade sprite has no
 * partial alpha to carry.
 */
export function arcadeArtPixels(
  indices: Uint8Array,
  size: ArcadeArtSize,
): Uint8ClampedArray {
  if (!isArcadeArtSize(size)) {
    throw new RangeError('arcadeArtPixels: size must be 16 or 32')
  }
  if (indices.length !== size * size) {
    throw new RangeError(
      `arcadeArtPixels: ${indices.length} indices for a ${size}×${size} grid`,
    )
  }
  const out = new Uint8ClampedArray(size * size * 4)
  for (let i = 0; i < indices.length; i += 1) {
    const rgb = PALETTE_RGB[indices[i]]
    const at = i * 4
    if (!rgb) continue // transparent: leave 0,0,0,0
    out[at] = rgb[0]
    out[at + 1] = rgb[1]
    out[at + 2] = rgb[2]
    out[at + 3] = 255
  }
  return out
}

// ── The conversion ──────────────────────────────────────────────────────────

/** The non-zero-alpha bounding box, or `null` when nothing is visible. */
interface VisibleBounds {
  x: number
  y: number
  width: number
  height: number
}

export function visibleArcadeBounds(
  source: ArcadeArtSourcePixels,
): VisibleBounds | null {
  const { width, height, data } = source
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * width * 4
    for (let x = 0; x < width; x += 1) {
      if (data[rowStart + x * 4 + 3] === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/**
 * Convert decoded RGBA pixels into one Arcade sprite.
 *
 * Validates before it allocates or loops: a bad size, non-integer or absurd
 * dimensions, a buffer that is not typed RGBA of the right length, and a pixel
 * count over the ceiling are each refused by name. See the module header for
 * the four decisions the loop below makes and why each one is that way.
 */
export function convertToArcadeArt(
  source: ArcadeArtSourcePixels,
  size: ArcadeArtSize,
): ArcadeArtResult {
  if (!isArcadeArtSize(size)) {
    return { ok: false, reason: ArcadeArtFailure.InvalidSize }
  }
  const { width, height, data } = source
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isSafeInteger(width * height * 4)
  ) {
    return { ok: false, reason: ArcadeArtFailure.InvalidDimensions }
  }
  if (width * height > MAX_ARCADE_SOURCE_PIXELS) {
    return { ok: false, reason: ArcadeArtFailure.TooLarge }
  }
  // Typed, and exactly as long as the dimensions claim. A short buffer would
  // read `undefined` as 0 and quietly produce a half-black sprite, and a plain
  // array would read as pixels while indexing differently.
  //
  // Checked through an `unknown` view on purpose: `data` is DECLARED
  // `Uint8ClampedArray`, so TypeScript narrows the second arm of a direct
  // `instanceof` chain to `never` and errors (TS2358). The declared type is a
  // claim about the caller, not about the bytes — this function is handed
  // decoded pixels from a browser and from tests — so the runtime check stays
  // and only the way it is spelled changes.
  const bytes: unknown = data
  if (
    !(bytes instanceof Uint8ClampedArray || bytes instanceof Uint8Array) ||
    bytes.length !== width * height * 4
  ) {
    return { ok: false, reason: ArcadeArtFailure.InvalidBuffer }
  }

  const crop = visibleArcadeBounds(source)
  if (!crop) return { ok: false, reason: ArcadeArtFailure.EmptySource }

  // The square, centred on the crop. Fractional on the shorter axis when the
  // difference is odd — flooring here would shift the picture half a source
  // pixel toward one edge, and at 16 cells that is a visible lean.
  const side = Math.max(crop.width, crop.height)
  const originX = crop.x - (side - crop.width) / 2
  const originY = crop.y - (side - crop.height) / 2
  const step = side / size
  const cellArea = step * step

  const indices = new Uint8Array(size * size)
  let anyVisible = false

  for (let gy = 0; gy < size; gy += 1) {
    const top = originY + gy * step
    const bottom = top + step
    // Only the in-bounds pixels: everything outside the source is the
    // transparent padding, which contributes to neither sum. Clamping here
    // also keeps total work proportional to the source rather than to the
    // padded square, which for a very long thin drawing is much larger.
    const firstRow = Math.max(0, Math.floor(top))
    const lastRow = Math.min(height, Math.ceil(bottom))
    for (let gx = 0; gx < size; gx += 1) {
      const left = originX + gx * step
      const right = left + step
      const firstCol = Math.max(0, Math.floor(left))
      const lastCol = Math.min(width, Math.ceil(right))

      let alphaWeight = 0
      let red = 0
      let green = 0
      let blue = 0

      for (let py = firstRow; py < lastRow; py += 1) {
        const overlapY = Math.min(bottom, py + 1) - Math.max(top, py)
        if (overlapY <= 0) continue
        const rowStart = py * width * 4
        for (let px = firstCol; px < lastCol; px += 1) {
          const overlapX = Math.min(right, px + 1) - Math.max(left, px)
          if (overlapX <= 0) continue
          const at = rowStart + px * 4
          const alpha = data[at + 3]
          // A fully transparent pixel contributes NOTHING — not to the alpha
          // sum and, crucially, not to the colour. Its RGB is usually black,
          // and letting it in is what fringes every edge dark.
          if (alpha === 0) continue
          const weight = overlapX * overlapY * (alpha / 255)
          alphaWeight += weight
          red += weight * data[at]
          green += weight * data[at + 1]
          blue += weight * data[at + 2]
        }
      }

      // The denominator is the whole cell, padding included.
      if (alphaWeight / cellArea < ARCADE_ALPHA_THRESHOLD) continue
      // Colour divides by the covered alpha weight only. `alphaWeight` is
      // strictly positive here: the test above could not have passed otherwise.
      indices[gy * size + gx] = nearestArcadePaletteIndex(
        red / alphaWeight,
        green / alphaWeight,
        blue / alphaWeight,
      )
      anyVisible = true
    }
  }

  if (!anyVisible) return { ok: false, reason: ArcadeArtFailure.EmptyResult }

  const rows: string[] = []
  for (let y = 0; y < size; y += 1) rows.push(arcadeArtRow(indices, size, y))
  return {
    ok: true,
    image: {
      size,
      indices,
      rows,
      literal: `img\`\n${rows.map((r) => ARCADE_LITERAL_INDENT + r).join('\n')}\n\``,
    },
  }
}
