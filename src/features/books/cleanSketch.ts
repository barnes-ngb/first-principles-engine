/**
 * Remove white/light background from an uploaded sketch image.
 * Uses Canvas API to convert near-white pixels to transparent.
 * Returns a new File with transparency (PNG).
 */
export async function cleanSketchBackground(
  file: File,
  options?: {
    /** How aggressively to remove background. 0-255, higher = more removal. Default 210. */
    threshold?: number
  },
): Promise<File> {
  const threshold = options?.threshold ?? 210

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(file)
        return
      }

      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data

      // Sample corners to find background color (average of 4 corner 10x10 regions)
      const sampleSize = 10
      const corners = [
        { x: 0, y: 0 },
        { x: canvas.width - sampleSize, y: 0 },
        { x: 0, y: canvas.height - sampleSize },
        { x: canvas.width - sampleSize, y: canvas.height - sampleSize },
      ]

      let rSum = 0
      let gSum = 0
      let bSum = 0
      let count = 0
      for (const corner of corners) {
        for (let dy = 0; dy < sampleSize; dy++) {
          for (let dx = 0; dx < sampleSize; dx++) {
            const idx = ((corner.y + dy) * canvas.width + (corner.x + dx)) * 4
            rSum += data[idx]
            gSum += data[idx + 1]
            bSum += data[idx + 2]
            count++
          }
        }
      }
      const bgR = Math.round(rSum / count)
      const bgG = Math.round(gSum / count)
      const bgB = Math.round(bSum / count)

      // Only proceed if background is light (paper-like)
      const bgBrightness = (bgR + bgG + bgB) / 3
      if (bgBrightness < 150) {
        // Dark background — probably not a sketch on paper, skip cleanup
        resolve(file)
        return
      }

      // Remove pixels similar to detected background color
      const tolerance = 255 - threshold // Higher threshold = higher tolerance
      const edgeSoftness = 20

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]

        const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2)

        if (dist < tolerance) {
          data[i + 3] = 0 // Fully transparent
        } else if (dist < tolerance + edgeSoftness) {
          // Gradual fade at edges
          const alpha = Math.round(((dist - tolerance) / edgeSoftness) * 255)
          data[i + 3] = Math.min(data[i + 3], alpha)
        }
      }

      ctx.putImageData(imageData, 0, 0)

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], file.name.replace(/\.\w+$/, '.png'), { type: 'image/png' }))
          } else {
            resolve(file)
          }
        },
        'image/png',
      )
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    const objectUrl = URL.createObjectURL(file)
    img.src = objectUrl
  })
}
