import { startStep } from '../../core/utils/perf'

// ──────────────────────────────────────────────────────────────────
// Sketch background removal
//
// Auto-detects the dominant background color from a border ring of
// pixels (so it works on white paper, brown tables, lined notebook,
// colored construction paper, wood — anything with a roughly uniform
// surround). Pixels close to that color become transparent; pixels
// near the threshold get a feathered alpha for smooth edges.
// ──────────────────────────────────────────────────────────────────

export interface CleanSketchOptions {
  /** Width of the border ring (px) sampled to detect the background. Default 20. */
  borderSampleSize?: number
  /** Color distance below this becomes fully transparent. Default 60. */
  tolerance?: number
  /** Multiplier for the feather zone (tolerance * featherMultiplier). Default 1.5. */
  featherMultiplier?: number
  /** Edge softness in pixels (alpha blur radius). Default 1. */
  edgeSoftness?: number
  /** If border-pixel std dev exceeds this, the background is considered too varied
   *  and we fall back to the conservative HSL paper-detect path. Default 35. */
  maxBackgroundStdDev?: number
}

// ── Pure helpers (exported for unit testing) ───────────────────────

/** Sample pixels from the outer ring of the image into a flat [r, g, b, ...] array. */
export function sampleBorderRgb(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  border: number,
): Uint8ClampedArray {
  const b = Math.max(1, Math.min(border, Math.floor(Math.min(width, height) / 2)))
  const samples: number[] = []
  // Top + bottom strips (full width)
  for (let y = 0; y < b; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      samples.push(data[i], data[i + 1], data[i + 2])
    }
  }
  for (let y = height - b; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      samples.push(data[i], data[i + 1], data[i + 2])
    }
  }
  // Left + right strips, excluding the corners already covered
  for (let y = b; y < height - b; y++) {
    for (let x = 0; x < b; x++) {
      const i = (y * width + x) * 4
      samples.push(data[i], data[i + 1], data[i + 2])
    }
    for (let x = width - b; x < width; x++) {
      const i = (y * width + x) * 4
      samples.push(data[i], data[i + 1], data[i + 2])
    }
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

      const samples = sampleBorderRgb(data, canvas.width, canvas.height, border)
      const stdDev = rgbStdDev(samples)
      const bgColor = medianRgb(samples)

      if (stdDev > maxBgStdDev) {
        // Border is too varied (busy tablecloth, hand in frame, etc.) — fall
        // back to the conservative HSL paper-detect path.
        applyHslPaperFallback(data)
      } else {
        removeBackgroundColor(data, bgColor, tolerance, featherMultiplier)
      }

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
