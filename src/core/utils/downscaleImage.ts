// ── Dimension-capping image downscaler (FEAT-61) ─────────────────────────
//
// `compressIfNeeded` (compressImage.ts) gates on BYTE size: it only re-encodes a
// file larger than a threshold (2 MB in the upload paths). A modern phone
// SCREENSHOT is often under that threshold on disk (a 1 MB PNG) yet enormous in
// PIXELS (e.g. 1179×2556) — so it sailed through un-shrunk and reached the vision
// Cloud Function full-size. Three of those in one message was enough to blow past
// a comfortable request budget (the FEAT-53 upload's "Reading your photo…" hang).
//
// This util caps DIMENSIONS instead: it guarantees the longest edge is at most
// `maxEdge`, re-encoding to JPEG. It skips work only when the image is already
// within `maxEdge` on both edges. Original→final KB is logged (always, not just in
// DEV) so a field bug report carries the actual reduction.

/** The output dimensions for a source of `width`×`height`, capped at `maxEdge`. */
export function computeDownscaleDims(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number; scaled: boolean } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height, scaled: false }
  const ratio = maxEdge / longest
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
    scaled: true,
  }
}

/**
 * Downscale `file` so its longest edge is ≤ `maxEdge`, re-encoded as JPEG at
 * `quality`. Returns the ORIGINAL file untouched when it is already within
 * `maxEdge` (no needless re-encode) or when it cannot be decoded as an image
 * (mirrors `compressImage`'s tolerance — never throw on a non-image). Rejects
 * only if the canvas encode itself fails.
 */
export function downscaleImage(
  file: File | Blob,
  maxEdge = 1600,
  quality = 0.85,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    const originalKB = Math.round(file.size / 1024)

    img.onload = () => {
      URL.revokeObjectURL(url)
      const { width, height, scaled } = computeDownscaleDims(img.width, img.height, maxEdge)

      if (!scaled) {
        console.info(
          `[downscale] ${img.width}×${img.height}, ${originalKB}KB — within ${maxEdge}px, kept as-is`,
        )
        resolve(file)
        return
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Failed to get canvas context'))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Canvas toBlob returned null'))
            return
          }
          console.info(
            `[downscale] ${img.width}×${img.height} → ${width}×${height}, ${originalKB}KB → ${Math.round(blob.size / 1024)}KB`,
          )
          resolve(blob)
        },
        'image/jpeg',
        quality,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      // Not a decodable image — hand the original back rather than fail the send.
      resolve(file instanceof Blob ? file : new Blob([file]))
    }

    img.src = url
  })
}
