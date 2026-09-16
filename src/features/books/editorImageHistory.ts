import type { BookPage, PageImage } from '../../core/types'
import { DEFAULT_IMAGE_GEOMETRY } from './draggableImageUtils'

/** Restore only geometry on an image that still exists. Do not resurrect an
 * image, restore old URLs, change layer order, or replace newer story text. */
export function restoreImageTransform(current: BookPage, snapshot: BookPage, imageId: string): Partial<BookPage> {
  const source = snapshot.images.find((image) => image.id === imageId)
  if (!source) return {}
  return {
    images: current.images.map((image) => {
      if (image.id !== imageId) return image
      const position: NonNullable<PageImage['position']> = { ...(source.position ?? DEFAULT_IMAGE_GEOMETRY[source.type]) }
      delete position.zIndex
      if (image.position?.zIndex !== undefined) position.zIndex = image.position.zIndex
      return { ...image, position }
    }),
  }
}
