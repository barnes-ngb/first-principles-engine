import { autoCrop } from './cleanSketch'
import { MAX_CLEANUP_PIXELS, type CleanupSource } from './cleanupMask'

/** Decode once per editor session; never decode an intermediate preview. */
export async function loadCleanupSource(file: File, allowSmallerCopy = false): Promise<CleanupSource> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Could not open this picture.'))
      image.src = url
    })
    let width = image.naturalWidth || image.width
    let height = image.naturalHeight || image.height
    if (!width || !height) throw new Error('Could not open this picture.')
    const smallerCopy = width * height > MAX_CLEANUP_PIXELS
    if (smallerCopy && !allowSmallerCopy) {
      const error = new Error('This picture is large. Use a smaller editable copy? Your original stays unchanged; the corrected sticker will have fewer pixels.')
      error.name = 'PictureTooLarge'
      throw error
    }
    if (smallerCopy) {
      const scale = Math.sqrt(MAX_CLEANUP_PIXELS / (width * height))
      width = Math.max(1, Math.floor(width * scale))
      height = Math.max(1, Math.floor(height * scale))
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Picture editing is unavailable in this browser.')
    context.drawImage(image, 0, 0, width, height)
    return { width, height, data: context.getImageData(0, 0, width, height).data, smallerCopy }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Encode only when the user accepts the preview; no image writes on brush moves. */
export async function encodeCleanup(source: CleanupSource, pixels: Uint8ClampedArray, name: string): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not save this preview. Please try again.')
  const image = context.createImageData(source.width, source.height)
  image.data.set(pixels)
  context.putImageData(image, 0, 0)
  const cropped = autoCrop(canvas)
  const blob = await new Promise<Blob>((resolve, reject) => {
    cropped.toBlob(result => result ? resolve(result) : reject(new Error('Could not save this preview. Please try again.')), 'image/png')
  })
  return new File([blob], name.replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' })
}
