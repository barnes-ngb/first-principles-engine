/**
 * Compress an image file before uploading to Firebase Storage.
 * Resizes to maxWidth/maxHeight, converts to JPEG at given quality.
 * Returns a new Blob that's typically 10-15x smaller than the original.
 */
export function compressImage(
  file: File | Blob,
  options?: {
    maxWidth?: number
    maxHeight?: number
    quality?: number
    outputType?: string
  }
): Promise<Blob> {
  const {
    maxWidth = 1200,
    maxHeight = 1200,
    quality = 0.8,
    outputType = 'image/jpeg',
  } = options ?? {}

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      // Calculate new dimensions maintaining aspect ratio
      let { width, height } = img
      if (width > maxWidth) {
        height = Math.round(height * (maxWidth / width))
        width = maxWidth
      }
      if (height > maxHeight) {
        width = Math.round(width * (maxHeight / height))
        height = maxHeight
      }

      // Draw to canvas at new size
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Failed to get canvas context'))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)

      // Export as compressed blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            if (import.meta.env.DEV) {
              const savedKB = Math.round((file.size - blob.size) / 1024)
              const pct = Math.round((1 - blob.size / file.size) * 100)
              console.log(
                `[compress] ${(file.size / 1024).toFixed(0)}KB → ${(blob.size / 1024).toFixed(0)}KB (${pct}% saved, ${savedKB}KB)`
              )
            }
            resolve(blob)
          } else {
            reject(new Error('Canvas toBlob returned null'))
          }
        },
        outputType,
        quality
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      // If we can't process it (e.g., not a valid image), return original
      resolve(file instanceof Blob ? file : new Blob([file]))
    }

    img.src = url
  })
}

/**
 * Compress a photo to a square data URL (center-cropped).
 * Used for guest player tokens — keeps data URL small for Firestore storage.
 */
export function compressPhotoToDataUrl(
  file: File | Blob,
  maxSize: number = 128,
  quality: number = 0.7
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      const canvas = document.createElement('canvas')
      canvas.width = maxSize
      canvas.height = maxSize
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Failed to get canvas context'))
        return
      }

      // Center-crop to square
      const minDim = Math.min(img.width, img.height)
      const sx = (img.width - minDim) / 2
      const sy = (img.height - minDim) / 2

      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, maxSize, maxSize)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }

    img.src = url
  })
}

/**
 * Compress only if the file is larger than the threshold.
 * Small images (icons, stickers, AI-generated) don't need compression.
 */
export async function compressIfNeeded(
  file: File | Blob,
  thresholdBytes: number = 500_000,
  options?: Parameters<typeof compressImage>[1]
): Promise<Blob> {
  if (file.size <= thresholdBytes) return file
  // Only compress image types
  const type = file instanceof File ? file.type : ''
  if (type && !type.startsWith('image/')) return file
  return compressImage(file, options)
}
