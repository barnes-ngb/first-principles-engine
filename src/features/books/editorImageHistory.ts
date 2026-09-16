import type { BookPage, PageImage } from '../../core/types'
import { imageGeometry } from './draggableImageUtils'

/** Restore only geometry on an image that still exists. Do not resurrect an
 * image, restore old URLs, change layer order, or replace newer story text. */
export function restoreImageTransform(current: BookPage, snapshot: BookPage, imageId: string): Partial<BookPage> {
  const source = snapshot.images.find((image) => image.id === imageId)
  if (!source) return {}
  return {
    images: current.images.map((image) => {
      if (image.id !== imageId) return image
      const position: NonNullable<PageImage['position']> = imageGeometry(source)
      delete position.zIndex
      if (image.position?.zIndex !== undefined) position.zIndex = image.position.zIndex
      return { ...image, position }
    }),
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const sourceFields = ['url', 'storagePath', 'type', 'layerType', 'style', 'originalSketchUrl', 'enhancedUrl', 'enhancedStoragePath', 'prompt', 'tags'] as const
const sourceFieldSet = new Set<string>(sourceFields)

/** Reverse only fields that the operation changed, against the latest page.
 * Later text, unrelated art and untouched metadata stay. A field edited since
 * the operation is also retained rather than silently overwriting newer work. */
export function restoreImageChanges(current: BookPage, from: BookPage, to: BookPage): Partial<BookPage> {
  const fromById = new Map(from.images.map((image) => [image.id, image]))
  const toById = new Map(to.images.map((image) => [image.id, image]))
  const images = current.images.flatMap((image) => {
    const was = fromById.get(image.id)
    const desired = toById.get(image.id)
    if (!was) return [image]
    if (!desired) return same(image, was) ? [] : [image]
    // A newer source may keep the same image ID and some old metadata. Never
    // combine its URL with the earlier picture's type, path or generation data.
    // Placement/fit/label remain independently owned, as before.
    const sourceChanged = sourceFields.some((key) => !same(was[key], desired[key]))
    const keepCurrentSource = sourceChanged && sourceFields.some((key) => !same(image[key], was[key]))
    const restored = { ...image } as Record<string, unknown>
    for (const key of new Set([...Object.keys(was), ...Object.keys(desired)])) {
      if (key === 'id' || (keepCurrentSource && sourceFieldSet.has(key))) continue
      const oldValue = (was as unknown as Record<string, unknown>)[key]
      const newValue = (desired as unknown as Record<string, unknown>)[key]
      if (same(oldValue, newValue)) continue
      if (key === 'position') {
        const position = { ...imageGeometry(image) } as Record<string, unknown>
        const oldPosition = imageGeometry(was) as unknown as Record<string, unknown>
        const newPosition = imageGeometry(desired) as unknown as Record<string, unknown>
        for (const field of new Set([...Object.keys(oldPosition), ...Object.keys(newPosition)])) {
          if (same(oldPosition[field], newPosition[field]) || !same(position[field], oldPosition[field])) continue
          if (field in newPosition) position[field] = newPosition[field]
          else delete position[field]
        }
        if (Object.keys(position).length) restored.position = position
        else delete restored.position
      } else if (same(restored[key], oldValue)) {
        if (key in desired) restored[key] = newValue
        else delete restored[key]
      }
    }
    return [restored as unknown as PageImage]
  })
  // Restore a removed image in its old relative place, without dropping art
  // inserted later. Existing IDs are never replaced by an older incarnation.
  for (const [index, image] of to.images.entries()) {
    if (fromById.has(image.id) || images.some((item) => item.id === image.id)) continue
    const nextId = to.images.slice(index + 1).find((item) => images.some((present) => present.id === item.id))?.id
    const insertion = nextId ? images.findIndex((item) => item.id === nextId) : images.length
    images.splice(insertion, 0, image)
  }
  return { images }
}
