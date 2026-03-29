import { startStep } from '../../core/utils/perf'

// ── HSL conversion helper ──────────────────────────────────────

/** Convert RGB (0-255) to HSL. Returns [h: 0-360, s: 0-100, l: 0-100]. */
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

// ── Alpha-channel box blur for edge smoothing ──────────────────

/** Apply a box blur to only the alpha channel to smooth transparency edges. */
function blurAlpha(data: Uint8ClampedArray, width: number, height: number, radius: number) {
  if (radius < 1) return
  // Work on a copy of just the alpha values
  const alpha = new Float32Array(width * height)
  for (let i = 0; i < alpha.length; i++) {
    alpha[i] = data[i * 4 + 3]
  }

  const out = new Float32Array(width * height)

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      let count = 0
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx
        if (nx >= 0 && nx < width) {
          sum += alpha[y * width + nx]
          count++
        }
      }
      out[y * width + x] = sum / count
    }
  }

  // Copy horizontal result back
  for (let i = 0; i < alpha.length; i++) alpha[i] = out[i]

  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      let count = 0
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy
        if (ny >= 0 && ny < height) {
          sum += alpha[ny * width + x]
          count++
        }
      }
      out[y * width + x] = sum / count
    }
  }

  // Write smoothed alpha back to image data
  for (let i = 0; i < out.length; i++) {
    data[i * 4 + 3] = Math.round(out[i])
  }
}

// ── Auto-crop to bounding box of non-transparent pixels ────────

/** Crop canvas to the bounding box of non-transparent pixels. Returns a new canvas. */
function autoCrop(canvas: HTMLCanvasElement, padding: number = 4): HTMLCanvasElement {
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

  // No visible pixels — return as-is
  if (bottom <= top || right <= left) return canvas

  // Add padding, clamped to canvas bounds
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

// ── Main cleaning function ─────────────────────────────────────

/**
 * Remove paper background from an uploaded sketch image using HSL-based detection.
 *
 * Saturation is the key discriminator: paper is low-saturation + high-lightness,
 * while crayon/pencil strokes retain saturation even when light-colored.
 *
 * Returns a new File with transparency (PNG), auto-cropped to the drawing bounds.
 */
export async function cleanSketchBackground(
  file: File,
  options?: {
    /** Saturation threshold (0-100). Pixels below this AND above lightness threshold become transparent. Default 10. */
    saturationThreshold?: number
    /** Lightness threshold (0-100). Pixels above this AND below saturation threshold become transparent. Default 85. */
    lightnessThreshold?: number
    /** Edge softness in pixels (alpha blur radius). Default 1. */
    edgeSoftness?: number
  },
): Promise<File> {
  const satThreshold = options?.saturationThreshold ?? 10
  const litThreshold = options?.lightnessThreshold ?? 85
  const edgeSoftness = options?.edgeSoftness ?? 1
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

      // ── Corner sampling: verify this looks like a sketch on paper ──
      const sampleSize = 10
      const corners = [
        { x: 0, y: 0 },
        { x: canvas.width - sampleSize, y: 0 },
        { x: 0, y: canvas.height - sampleSize },
        { x: canvas.width - sampleSize, y: canvas.height - sampleSize },
      ]

      let paperCorners = 0
      for (const corner of corners) {
        let cornerSatSum = 0
        let cornerLitSum = 0
        let count = 0
        for (let dy = 0; dy < sampleSize; dy++) {
          for (let dx = 0; dx < sampleSize; dx++) {
            const idx = ((corner.y + dy) * canvas.width + (corner.x + dx)) * 4
            const [, s, l] = rgbToHsl(data[idx], data[idx + 1], data[idx + 2])
            cornerSatSum += s
            cornerLitSum += l
            count++
          }
        }
        const avgSat = cornerSatSum / count
        const avgLit = cornerLitSum / count
        // A corner looks like paper if it's low-saturation and high-lightness
        if (avgSat < 15 && avgLit > 70) paperCorners++
      }

      // Need at least 3 of 4 corners to look like paper to proceed
      if (paperCorners < 3) {
        endTotal()
        resolve(file)
        return
      }

      // ── HSL-based background removal ──
      // Soft boundary for gradual fade
      const satSoft = 4  // fade zone width in saturation %
      const litSoft = 8  // fade zone width in lightness %

      for (let i = 0; i < data.length; i += 4) {
        const [, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2])

        // Core paper zone: definitely background
        if (s < satThreshold && l > litThreshold) {
          data[i + 3] = 0
        }
        // Soft edge zone: gradual fade for smooth transitions
        else if (s < (satThreshold + satSoft) && l > (litThreshold - litSoft)) {
          // How "paper-like" is this pixel? Blend between the two thresholds.
          const satFactor = s < satThreshold ? 0 : (s - satThreshold) / satSoft
          const litFactor = l > litThreshold ? 0 : (litThreshold - l) / litSoft
          const keepFactor = Math.max(satFactor, litFactor)
          data[i + 3] = Math.round(keepFactor * 255)
        }
        // else: keep fully opaque (it's a drawing stroke)
      }

      ctx.putImageData(imageData, 0, 0)

      // ── Edge smoothing: box blur on alpha channel ──
      if (edgeSoftness > 0) {
        const smoothData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        blurAlpha(smoothData.data, canvas.width, canvas.height, edgeSoftness)
        ctx.putImageData(smoothData, 0, 0)
      }

      // ── Auto-crop to drawing bounding box ──
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
