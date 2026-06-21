// ──────────────────────────────────────────────────────────────────
// Manual crop helper for the drawing → sticker flow (FEAT-33).
//
// A kid drags a box over a captured drawing to pick the region (trim
// paper edges, or grab one drawing off a busy page) before it's made
// transparent by `cleanSketchBackground`. The crop region is expressed
// in fractions (0..1) of the displayed image so it's resolution
// independent; `cropImageToRegion` resolves it against the decoded
// image's natural dimensions.
// ──────────────────────────────────────────────────────────────────

/** A crop region as fractions (0..1) of the image's width/height. */
export interface CropFraction {
  x: number
  y: number
  width: number
  height: number
}

/** A crop region in integer pixels. */
export interface CropRectPx {
  x: number
  y: number
  width: number
  height: number
}

/** The whole image — used as the "use whole image" / skip default. */
export const FULL_CROP: CropFraction = { x: 0, y: 0, width: 1, height: 1 }

/** Smallest selectable box as a fraction of each dimension. */
export const MIN_CROP_FRACTION = 0.1

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/**
 * Convert a fractional crop region (0..1) to integer pixel coordinates within
 * an image of the given natural dimensions. Clamps to image bounds and
 * guarantees a minimum 1px box. Pure — unit-testable without a canvas.
 */
export function computeCropRect(
  fraction: CropFraction,
  naturalWidth: number,
  naturalHeight: number,
): CropRectPx {
  const fx = clamp01(fraction.x)
  const fy = clamp01(fraction.y)
  const fw = clamp01(fraction.width)
  const fh = clamp01(fraction.height)

  const x = Math.min(Math.round(fx * naturalWidth), Math.max(0, naturalWidth - 1))
  const y = Math.min(Math.round(fy * naturalHeight), Math.max(0, naturalHeight - 1))
  const width = Math.max(1, Math.min(Math.round(fw * naturalWidth), naturalWidth - x))
  const height = Math.max(1, Math.min(Math.round(fh * naturalHeight), naturalHeight - y))
  return { x, y, width, height }
}

/** True when the region covers (essentially) the whole image — crop is a no-op. */
export function isWholeImage(fraction: CropFraction): boolean {
  return (
    fraction.x <= 0.001 &&
    fraction.y <= 0.001 &&
    fraction.width >= 0.999 &&
    fraction.height >= 0.999
  )
}

/**
 * Crop a captured drawing to the given fractional region and return a new File.
 * Falls back to the original file if a canvas context can't be obtained.
 */
export async function cropImageToRegion(
  file: File,
  fraction: CropFraction,
): Promise<File> {
  if (isWholeImage(fraction)) return file

  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      const rect = computeCropRect(
        fraction,
        img.naturalWidth || img.width,
        img.naturalHeight || img.height,
      )
      const canvas = document.createElement('canvas')
      canvas.width = rect.width
      canvas.height = rect.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(objectUrl)
        resolve(file)
        return
      }
      ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height)
      const type = file.type || 'image/png'
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl)
          if (blob) {
            resolve(new File([blob], file.name, { type }))
          } else {
            resolve(file)
          }
        },
        type,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to load image'))
    }
    img.src = objectUrl
  })
}
