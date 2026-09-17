import type { BookPage, PageImage } from '../../core/types'
import { layerTypeOf } from './draggableImageUtils'

/** An in-session target, never stored in a family record. */
export interface BackgroundReplacementTarget {
  familyId: string
  bookId: string
  pageId: string
  imageId: string
  url: string
  storagePath?: string
  type: PageImage['type']
}

/** Same-ID replacement preserves composition while dropping obsolete source
 * metadata. Refuse if the selected picture was removed/replaced while waiting. */
export function replacePageBackground(page: BookPage, target: BackgroundReplacementTarget, candidate: PageImage): BookPage | undefined {
  if (page.id !== target.pageId) return undefined
  const old = page.images.find((image) => image.id === target.imageId)
  if (!old || layerTypeOf(old) !== 'background' || old.url !== target.url || old.storagePath !== target.storagePath || old.type !== target.type) return undefined
  const replacement: PageImage = { ...candidate, id: old.id, layerType: 'background' }
  if (old.position) replacement.position = old.position
  if (old.fit) replacement.fit = old.fit
  if (old.label) replacement.label = old.label
  if (old.previousVersions) replacement.previousVersions = old.previousVersions
  return { ...page, images: page.images.map((image) => image.id === old.id ? replacement : image) }
}
