import type { MonthlyReviewPage, PhotoRef } from '../../core/types'

export type ReaderMode = 'kid' | 'parent'

/**
 * Read per-mode photos from a MonthlyReviewPage. New reviews store
 * `{ kid, parent }`; legacy reviews stored a single `PhotoRef[]`. Use this
 * helper instead of touching `page.photoRefs` directly so both shapes
 * keep rendering.
 */
export function getModePhotos(
  page: MonthlyReviewPage,
  mode: ReaderMode,
): PhotoRef[] {
  const refs = page.photoRefs
  if (!refs) return []
  if (Array.isArray(refs)) return refs
  return refs[mode] ?? []
}
