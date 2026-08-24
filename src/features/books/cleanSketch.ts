import { startStep } from '../../core/utils/perf'
import type { CropFraction } from './cropImage'

// ──────────────────────────────────────────────────────────────────
// Sketch background removal
//
// Auto-detects the dominant background color from a border ring of
// pixels (so it works on white paper, brown tables, lined notebook,
// colored construction paper, wood — anything with a roughly uniform
// surround). Pixels close to that color become transparent; pixels
// near the threshold get a feathered alpha for smooth edges.
//
// FEAT-159 — four changes so a photographed sheet on a busy surface
// (Nathan's carpet case) cuts out as the paper, not the room:
//   1. the ring is sampled *inset* from the edge (and inside the
//      parent's crop when one is passed), never the outermost pixels;
//   2. a bimodal ring (paper + surface) picks the paper cluster rather
//      than the median of both — see `pickBackgroundSample`;
//   3. tiny disconnected islands (dust, paper flecks) are dropped;
//   4. surviving faint ink is boosted so pencil reads like marker.
// ──────────────────────────────────────────────────────────────────

/** Ring inset when the parent already cropped — they trimmed the surround for us. */
export const DEFAULT_BORDER_INSET_FRACTION = 0.04
/** Ring inset on "use whole image" — pull further in, away from table/carpet edges. */
export const WHOLE_IMAGE_BORDER_INSET_FRACTION = 0.08

export interface CleanSketchOptions {
  /** Width of the border ring (px) sampled to detect the background. Default 20. */
  borderSampleSize?: number
  /** Color distance below this becomes fully transparent. Default 60. */
  tolerance?: number
  /** Multiplier for the feather zone (tolerance * featherMultiplier). Default 1.5. */
  featherMultiplier?: number
  /** Edge softness in pixels (alpha blur radius). Default 1. */
  edgeSoftness?: number
  /** If the chosen background cluster's std dev exceeds this, the background is
   *  considered too varied and we fall back to the conservative HSL paper-detect
   *  path. Default 35. */
  maxBackgroundStdDev?: number
  /** Fraction of each dimension skipped before the sampling ring starts, so the
   *  outermost (most likely table/carpet) pixels never define the background.
   *  Default {@link DEFAULT_BORDER_INSET_FRACTION}. */
  borderInsetFraction?: number
  /** Region of the image to sample the background from, as 0..1 fractions —
   *  normally the crop box the parent drew. Default the whole image. */
  sampleRegion?: CropFraction
  /** Minimum luminance gap between the two ring clusters before we treat the ring
   *  as bimodal (paper + surface). Default 28. */
  bimodalSeparation?: number
  /** Smallest opaque island kept, as a fraction of total pixels. Default 0.00002.
   *  The largest island is always kept regardless. */
  minIslandFraction?: number
  /** Second, usually tighter bound on the dust threshold: a fraction of the
   *  largest island, so a sparse drawing keeps its small marks. Default 0.0005.
   *  The lower of the two bounds wins — see {@link computeMinIslandPixels}. */
  minIslandShareOfLargest?: number
  /** Ink-contrast boost strength (0 = off). Default 1. */
  inkContrastStrength?: number
  /** Ink already this far from the background luminance is left byte-identical.
   *  Default 120 — this is the rail that keeps marker-on-white untouched. */
  inkContrastFullRange?: number
}

// ── Pure helpers (exported for unit testing) ───────────────────────

/** Rec. 709 relative luminance. */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export interface BorderSampleOptions {
  /** Fraction of each dimension to skip before the ring starts. Default 0 (the
   *  outermost pixels — the historical behavior). */
  insetFraction?: number
  /** Sub-region of the image to sample within, as 0..1 fractions. Default whole. */
  region?: CropFraction
}

/**
 * Sample pixels from a border ring into a flat [r, g, b, ...] array.
 *
 * By default this is the image's outer ring. Pass `region` to sample the border
 * of the parent's crop box instead, and/or `insetFraction` to start the ring
 * inside that edge — the outermost pixels of a photo are the ones most likely
 * to be table or carpet rather than the paper we actually want to knock out.
 */
export function sampleBorderRgb(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  border: number,
  opts: BorderSampleOptions = {},
): Uint8ClampedArray {
  const region = opts.region
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
  let rx = 0
  let ry = 0
  let rw = width
  let rh = height
  if (region) {
    rx = Math.round(clamp01(region.x) * width)
    ry = Math.round(clamp01(region.y) * height)
    rw = Math.round(clamp01(region.width) * width)
    rh = Math.round(clamp01(region.height) * height)
    rw = Math.max(1, Math.min(rw, width - rx))
    rh = Math.max(1, Math.min(rh, height - ry))
  }

  const inset = Math.max(0, opts.insetFraction ?? 0)
  const insetX = Math.min(Math.floor(rw * inset), Math.floor((rw - 1) / 2))
  const insetY = Math.min(Math.floor(rh * inset), Math.floor((rh - 1) / 2))
  const x0 = rx + insetX
  const y0 = ry + insetY
  const w = Math.max(1, rw - insetX * 2)
  const h = Math.max(1, rh - insetY * 2)

  const b = Math.max(1, Math.min(border, Math.floor(Math.min(w, h) / 2)))
  const samples: number[] = []
  const push = (x: number, y: number) => {
    const i = (y * width + x) * 4
    samples.push(data[i], data[i + 1], data[i + 2])
  }
  // Top + bottom strips (full ring width)
  for (let y = y0; y < y0 + b; y++) for (let x = x0; x < x0 + w; x++) push(x, y)
  for (let y = y0 + h - b; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) push(x, y)
  // Left + right strips, excluding the corners already covered
  for (let y = y0 + b; y < y0 + h - b; y++) {
    for (let x = x0; x < x0 + b; x++) push(x, y)
    for (let x = x0 + w - b; x < x0 + w; x++) push(x, y)
  }
  return new Uint8ClampedArray(samples)
}

/** Per-channel median of a flat [r, g, b, ...] sample buffer. Robust to outliers
 *  (e.g. drawing strokes that touch the edge). */
export function medianRgb(samples: Uint8ClampedArray): [number, number, number] {
  const n = samples.length / 3
  if (n <= 0) return [255, 255, 255]
  const r = new Uint8Array(n)
  const g = new Uint8Array(n)
  const b = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    r[i] = samples[i * 3]
    g[i] = samples[i * 3 + 1]
    b[i] = samples[i * 3 + 2]
  }
  // In-place sort then pick the middle element
  Array.prototype.sort.call(r, (a: number, c: number) => a - c)
  Array.prototype.sort.call(g, (a: number, c: number) => a - c)
  Array.prototype.sort.call(b, (a: number, c: number) => a - c)
  const mid = Math.floor(n / 2)
  return [r[mid], g[mid], b[mid]]
}

/** Mean per-channel std dev of a sample buffer — used to decide how confident
 *  we should be that the background is actually consistent. */
export function rgbStdDev(samples: Uint8ClampedArray): number {
  const n = samples.length / 3
  if (n === 0) return 0
  let rSum = 0, gSum = 0, bSum = 0
  for (let i = 0; i < n; i++) {
    rSum += samples[i * 3]
    gSum += samples[i * 3 + 1]
    bSum += samples[i * 3 + 2]
  }
  const rMean = rSum / n, gMean = gSum / n, bMean = bSum / n
  let rVar = 0, gVar = 0, bVar = 0
  for (let i = 0; i < n; i++) {
    rVar += (samples[i * 3] - rMean) ** 2
    gVar += (samples[i * 3 + 1] - gMean) ** 2
    bVar += (samples[i * 3 + 2] - bMean) ** 2
  }
  return (Math.sqrt(rVar / n) + Math.sqrt(gVar / n) + Math.sqrt(bVar / n)) / 3
}

export interface BackgroundSample {
  /** The RGB treated as "the background surface". */
  color: [number, number, number]
  /** Std dev of the *chosen* cluster only — not of the whole ring. This is what
   *  the `maxBackgroundStdDev` fallback gate reads, so a clean sheet of paper
   *  photographed on a patterned carpet no longer looks "too varied to trust". */
  stdDev: number
  /** True when the ring split into two well-separated surfaces (paper + table). */
  bimodal: boolean
}

/** Per-channel median + std dev of the sample rows listed in `idx`. */
function clusterStats(
  samples: Uint8ClampedArray,
  idx: number[],
): { color: [number, number, number]; stdDev: number; meanLum: number } {
  const sub = new Uint8ClampedArray(idx.length * 3)
  let lumSum = 0
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k] * 3
    sub[k * 3] = samples[i]
    sub[k * 3 + 1] = samples[i + 1]
    sub[k * 3 + 2] = samples[i + 2]
    lumSum += luminance(samples[i], samples[i + 1], samples[i + 2])
  }
  return {
    color: medianRgb(sub),
    stdDev: rgbStdDev(sub),
    meanLum: idx.length ? lumSum / idx.length : 0,
  }
}

/**
 * Choose which surface in the border ring is the background to knock out.
 *
 * A sheet of paper photographed on a table or a patterned carpet gives a ring
 * holding *two* surfaces. Taking the median of both lands between them — the
 * wrong color for either, which is why the paper survived opaque in the
 * reported case. So we split the ring's luminance into two clusters (1-D
 * 2-means) and, when they are genuinely separated, pick one:
 *
 *   **Prefer the lighter cluster** — paper is almost always lighter than the
 *   table or floor it sits on. **Unless the lighter cluster is actually busy
 *   (std dev over `minNoisyStdDev`) and the darker one is materially flatter**
 *   (`flatnessRatio`× smaller), in which case the darker-but-uniform surface is
 *   the paper and the lighter one is a patterned rug.
 *
 *   Both halves of that override are load-bearing. Two *uniform* surfaces —
 *   white paper on a solid dark table — give std dev 0 for each cluster, and a
 *   bare ratio comparison would hand the tie to the darker table and leave the
 *   sheet opaque. Lightness decides; flatness only overrides against a surface
 *   that is visibly patterned.
 *
 * When the ring is not bimodal (one uniform surround) this is exactly the old
 * behavior: median + std dev of everything.
 */
export function pickBackgroundSample(
  samples: Uint8ClampedArray,
  opts?: {
    separation?: number
    minShare?: number
    flatnessRatio?: number
    minNoisyStdDev?: number
  },
): BackgroundSample {
  const separation = opts?.separation ?? 28
  const minShare = opts?.minShare ?? 0.15
  const flatnessRatio = opts?.flatnessRatio ?? 1.6
  const minNoisyStdDev = opts?.minNoisyStdDev ?? 10

  const n = samples.length / 3
  const whole = (): BackgroundSample => ({
    color: medianRgb(samples),
    stdDev: rgbStdDev(samples),
    bimodal: false,
  })
  if (n < 4) return whole()

  const lum = new Float64Array(n)
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < n; i++) {
    const l = luminance(samples[i * 3], samples[i * 3 + 1], samples[i * 3 + 2])
    lum[i] = l
    if (l < lo) lo = l
    if (l > hi) hi = l
  }
  if (hi - lo < separation) return whole()

  // 1-D 2-means seeded at the extremes — deterministic, converges in a few passes.
  let cA = lo
  let cB = hi
  const assign = new Uint8Array(n)
  for (let iter = 0; iter < 12; iter++) {
    let sA = 0, nA = 0, sB = 0, nB = 0
    for (let i = 0; i < n; i++) {
      const a = Math.abs(lum[i] - cA) <= Math.abs(lum[i] - cB) ? 0 : 1
      assign[i] = a
      if (a === 0) { sA += lum[i]; nA++ } else { sB += lum[i]; nB++ }
    }
    const nextA = nA ? sA / nA : cA
    const nextB = nB ? sB / nB : cB
    if (nextA === cA && nextB === cB) break
    cA = nextA
    cB = nextB
  }

  const idxA: number[] = []
  const idxB: number[] = []
  for (let i = 0; i < n; i++) (assign[i] === 0 ? idxA : idxB).push(i)

  // Two clusters only count as "two surfaces" if they are far apart *and* both
  // hold a real share of the ring — a handful of stroke pixels touching the edge
  // must not masquerade as a second surface.
  const share = Math.min(idxA.length, idxB.length) / n
  if (share < minShare || Math.abs(cA - cB) < separation) return whole()

  const a = clusterStats(samples, idxA)
  const b = clusterStats(samples, idxB)
  const lighter = a.meanLum >= b.meanLum ? a : b
  const darker = a.meanLum >= b.meanLum ? b : a
  // Lightness decides. The darker cluster only wins when the lighter one is
  // *actually busy* and the darker is materially flatter — never on a tie.
  // Both tests matter: white paper on a solid dark table gives two uniform
  // clusters (std dev 0 each), and a bare ratio comparison would pick the table
  // and leave the sheet opaque — the exact failure this function exists to fix.
  const darkerIsDecisivelyFlatter =
    lighter.stdDev > minNoisyStdDev && darker.stdDev * flatnessRatio < lighter.stdDev
  const chosen = darkerIsDecisivelyFlatter ? darker : lighter
  return { color: chosen.color, stdDev: chosen.stdDev, bimodal: true }
}

/**
 * Walk every pixel and replace ones near `bgColor` with transparent (or partial
 * alpha for the feather zone). Mutates `data` in place.
 */
export function removeBackgroundColor(
  data: Uint8ClampedArray,
  bgColor: [number, number, number],
  tolerance: number,
  featherMultiplier: number,
): void {
  const featherEnd = tolerance * featherMultiplier
  const featherSpan = Math.max(1, featherEnd - tolerance)
  const [br, bg, bb] = bgColor
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - br
    const dg = data[i + 1] - bg
    const db = data[i + 2] - bb
    const distance = Math.sqrt(dr * dr + dg * dg + db * db)
    if (distance < tolerance) {
      data[i + 3] = 0
    } else if (distance < featherEnd) {
      const keep = (distance - tolerance) / featherSpan
      const next = Math.round(keep * 255)
      if (next < data[i + 3]) data[i + 3] = next
    }
  }
}

/**
 * How small an island has to be before it counts as dust.
 *
 * Keyed off the **drawing**, not the camera. A threshold that is only a fraction
 * of the capture area scales with megapixels rather than with content: at
 * 0.0002 of a 4000×3000 phone photo it lands at 2,400 px, which erases an eye
 * dot, a period, or the dot of an "i" — legitimate marks, and exactly the kind
 * of loss this pass must not cause. So the bound is the **smaller** of two:
 * a very small fraction of the frame, and a small fraction of the largest
 * island. The second is what makes a sparse drawing safe — the sparser the
 * content, the lower the bar for keeping a mark.
 *
 * At 12 MP with a full-page drawing this resolves to a few hundred pixels — on
 * the order of a 15×15 block, under a millimetre of pencil at that resolution.
 * This is a heuristic with a real (if now much smaller) false-positive risk; it
 * is deliberately tuned to under-remove.
 */
export function computeMinIslandPixels(
  imageArea: number,
  largestIslandPixels: number,
  fractionOfArea = 0.00002,
  fractionOfLargest = 0.0005,
): number {
  return Math.max(
    2,
    Math.round(
      Math.min(imageArea * fractionOfArea, largestIslandPixels * fractionOfLargest),
    ),
  )
}

/**
 * Drop tiny disconnected opaque islands — dust, paper flecks, a speck of the
 * carpet that squeaked past the knockout — so they don't survive as sticker
 * content. Mutates `data` in place; returns how many islands were cleared.
 *
 * **The largest island is always kept, whatever the threshold says**, and so is
 * anything at or above it: a drawing is legitimately several strokes apart (a
 * face and a separate hat), and losing one of them would be far worse than
 * leaving a speck.
 *
 * `minPixels` may be a function of the largest island's size, so the bound can
 * scale with the drawing rather than the frame — see {@link computeMinIslandPixels}.
 */
export function removeSmallIslands(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  minPixels: number | ((largestIslandPixels: number) => number),
  alphaThreshold = 10,
): number {
  const count = width * height
  if (count === 0) return 0
  const labels = new Int32Array(count).fill(-1)
  const sizes: number[] = []
  const stack: number[] = []

  for (let start = 0; start < count; start++) {
    if (labels[start] !== -1 || data[start * 4 + 3] <= alphaThreshold) continue
    const label = sizes.length
    let size = 0
    labels[start] = label
    stack.push(start)
    while (stack.length) {
      const p = stack.pop() as number
      size++
      const x = p % width
      const y = (p - x) / width
      // 4-connectivity — diagonal-only touching counts as separate islands.
      if (x > 0) {
        const q = p - 1
        if (labels[q] === -1 && data[q * 4 + 3] > alphaThreshold) { labels[q] = label; stack.push(q) }
      }
      if (x < width - 1) {
        const q = p + 1
        if (labels[q] === -1 && data[q * 4 + 3] > alphaThreshold) { labels[q] = label; stack.push(q) }
      }
      if (y > 0) {
        const q = p - width
        if (labels[q] === -1 && data[q * 4 + 3] > alphaThreshold) { labels[q] = label; stack.push(q) }
      }
      if (y < height - 1) {
        const q = p + width
        if (labels[q] === -1 && data[q * 4 + 3] > alphaThreshold) { labels[q] = label; stack.push(q) }
      }
    }
    sizes.push(size)
  }
  if (sizes.length <= 1) return 0

  let largest = 0
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[largest]) largest = i
  const threshold =
    typeof minPixels === 'function' ? minPixels(sizes[largest]) : minPixels
  let removed = 0
  for (let i = 0; i < sizes.length; i++) {
    if (i !== largest && sizes[i] < threshold) removed++
  }
  if (removed === 0) return 0
  for (let p = 0; p < count; p++) {
    const label = labels[p]
    if (label === -1 || label === largest) continue
    if (sizes[label] < threshold) data[p * 4 + 3] = 0
  }
  return removed
}

/**
 * Let the graphite live. Kid drawings are frequently faint pencil, and a cutout
 * that is technically correct but visually ghostly is a failed cutout — so push
 * surviving ink further away from the background's luminance.
 *
 * The gain tapers to exactly 1.0 as ink approaches `fullRange` away from the
 * background, and pixels already at or past that distance are **skipped
 * entirely** — byte-identical output. That is the rail: marker, which is far
 * from the paper by construction, cannot be made worse by this pass; only the
 * faint end moves. Hue is preserved by scaling all three channels together.
 */
export function boostInkContrast(
  data: Uint8ClampedArray,
  bgColor: [number, number, number],
  strength: number,
  fullRange: number,
): void {
  if (strength <= 0 || fullRange <= 0) return
  const bgLum = luminance(bgColor[0], bgColor[1], bgColor[2])
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    const l = luminance(data[i], data[i + 1], data[i + 2])
    if (l <= 0) continue
    const d = l - bgLum
    const mag = Math.abs(d)
    if (mag >= fullRange) continue // already strong ink — left untouched
    const gain = 1 + strength * (1 - mag / fullRange)
    const next = Math.max(0, Math.min(255, bgLum + d * gain))
    const scale = next / l
    data[i] = Math.max(0, Math.min(255, Math.round(data[i] * scale)))
    data[i + 1] = Math.max(0, Math.min(255, Math.round(data[i + 1] * scale)))
    data[i + 2] = Math.max(0, Math.min(255, Math.round(data[i + 2] * scale)))
  }
}

// ── Internal helpers ──────────────────────────────────────────────

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h * 360, s * 100, l * 100]
}

/** HSL "is this paper?" fallback — only used when border samples are too varied
 *  to trust the auto-detected color. Conservative: cuts low-saturation +
 *  high-lightness pixels with a soft fade. */
function applyHslPaperFallback(data: Uint8ClampedArray): void {
  const satThreshold = 10
  const litThreshold = 85
  const satSoft = 4
  const litSoft = 8
  for (let i = 0; i < data.length; i += 4) {
    const [, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2])
    if (s < satThreshold && l > litThreshold) {
      data[i + 3] = 0
    } else if (s < satThreshold + satSoft && l > litThreshold - litSoft) {
      const satFactor = s < satThreshold ? 0 : (s - satThreshold) / satSoft
      const litFactor = l > litThreshold ? 0 : (litThreshold - l) / litSoft
      const keepFactor = Math.max(satFactor, litFactor)
      data[i + 3] = Math.round(keepFactor * 255)
    }
  }
}

/** Box blur on the alpha channel only — softens the cutout edge. */
function blurAlpha(data: Uint8ClampedArray, width: number, height: number, radius: number) {
  if (radius < 1) return
  const alpha = new Float32Array(width * height)
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]
  const out = new Float32Array(width * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, count = 0
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx
        if (nx >= 0 && nx < width) { sum += alpha[y * width + nx]; count++ }
      }
      out[y * width + x] = sum / count
    }
  }
  for (let i = 0; i < alpha.length; i++) alpha[i] = out[i]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, count = 0
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy
        if (ny >= 0 && ny < height) { sum += alpha[ny * width + x]; count++ }
      }
      out[y * width + x] = sum / count
    }
  }
  for (let i = 0; i < out.length; i++) data[i * 4 + 3] = Math.round(out[i])
}

/** Crop canvas to the bounding box of non-transparent pixels. */
function autoCrop(canvas: HTMLCanvasElement, padding = 4): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const { width, height } = canvas
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data

  let top = height, left = width, bottom = 0, right = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (y < top) top = y
        if (y > bottom) bottom = y
        if (x < left) left = x
        if (x > right) right = x
      }
    }
  }
  if (bottom <= top || right <= left) return canvas

  top = Math.max(0, top - padding)
  left = Math.max(0, left - padding)
  bottom = Math.min(height - 1, bottom + padding)
  right = Math.min(width - 1, right + padding)

  const cropW = right - left + 1
  const cropH = bottom - top + 1
  const cropped = document.createElement('canvas')
  cropped.width = cropW
  cropped.height = cropH
  const cropCtx = cropped.getContext('2d')
  if (!cropCtx) return canvas
  cropCtx.drawImage(canvas, left, top, cropW, cropH, 0, 0, cropW, cropH)
  return cropped
}

// ── Main entry point ──────────────────────────────────────────────

/**
 * Remove the background from a photographed drawing and return a transparent
 * PNG cropped to the drawing's bounding box.
 *
 * Works on any consistent-color surface (white paper, brown table, lined
 * notebook, colored construction paper, wood, fabric) — not just paper. The
 * background color is detected by sampling the outer ring of pixels and
 * taking the per-channel median.
 */
export async function cleanSketchBackground(
  file: File,
  options?: CleanSketchOptions,
): Promise<File> {
  const border = options?.borderSampleSize ?? 20
  const tolerance = options?.tolerance ?? 60
  const featherMultiplier = options?.featherMultiplier ?? 1.5
  const edgeSoftness = options?.edgeSoftness ?? 1
  const maxBgStdDev = options?.maxBackgroundStdDev ?? 35
  const insetFraction = options?.borderInsetFraction ?? DEFAULT_BORDER_INSET_FRACTION
  const sampleRegion = options?.sampleRegion
  const bimodalSeparation = options?.bimodalSeparation ?? 28
  const minIslandFraction = options?.minIslandFraction ?? 0.00002
  const minIslandShareOfLargest = options?.minIslandShareOfLargest ?? 0.0005
  const inkStrength = options?.inkContrastStrength ?? 1
  const inkFullRange = options?.inkContrastFullRange ?? 120
  const endTotal = startStep('cleanSketchBackground')

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        endTotal()
        resolve(file)
        return
      }
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data

      // Sample inside the crop / inset from the edge, then pick the paper
      // cluster rather than the median of paper-and-carpet (FEAT-159).
      const samples = sampleBorderRgb(data, canvas.width, canvas.height, border, {
        insetFraction,
        region: sampleRegion,
      })
      const background = pickBackgroundSample(samples, { separation: bimodalSeparation })
      const bgColor = background.color

      if (background.stdDev > maxBgStdDev) {
        // The chosen surface is itself too varied (busy tablecloth, hand in
        // frame, etc.) — fall back to the conservative HSL paper-detect path.
        applyHslPaperFallback(data)
      } else {
        removeBackgroundColor(data, bgColor, tolerance, featherMultiplier)
      }

      // Drop dust/flecks, then strengthen what's left. Both run before the alpha
      // blur so specks aren't smeared into soft grey haze instead of removed.
      // The dust bound is resolved against the largest island so it tracks the
      // drawing, not the camera's megapixels.
      const area = canvas.width * canvas.height
      removeSmallIslands(data, canvas.width, canvas.height, (largest) =>
        computeMinIslandPixels(area, largest, minIslandFraction, minIslandShareOfLargest),
      )
      boostInkContrast(data, bgColor, inkStrength, inkFullRange)

      ctx.putImageData(imageData, 0, 0)

      if (edgeSoftness > 0) {
        const smoothData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        blurAlpha(smoothData.data, canvas.width, canvas.height, edgeSoftness)
        ctx.putImageData(smoothData, 0, 0)
      }

      const cropped = autoCrop(canvas)
      cropped.toBlob(
        (blob) => {
          if (blob) {
            endTotal()
            resolve(new File([blob], file.name.replace(/\.\w+$/, '.png'), { type: 'image/png' }))
          } else {
            endTotal()
            resolve(file)
          }
        },
        'image/png',
      )
    }
    img.onerror = () => {
      endTotal()
      reject(new Error('Failed to load image'))
    }
    const objectUrl = URL.createObjectURL(file)
    img.src = objectUrl
  })
}
