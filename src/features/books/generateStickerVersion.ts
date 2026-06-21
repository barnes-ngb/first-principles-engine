import { addDoc } from 'firebase/firestore'

import { stickerLibraryCollection } from '../../core/firebase/firestore'
import type { EnhanceSketchRequest, EnhanceSketchResponse } from '../../core/ai/useAI'
import { StickerCategory } from '../../core/types/enums'
import type { Sticker } from '../../core/types'
import { resolveFancyEnhanceParams } from './drawingStickerStyles'

/** The `enhanceSketch` callable from `useAI()` — typed locally so this helper
 * stays value-free of the hook (and easy to unit-test with a stub). */
export type EnhanceSketchFn = (
  request: EnhanceSketchRequest,
) => Promise<EnhanceSketchResponse | null>

export interface GenerateStickerVersionArgs {
  familyId: string
  /** The saved image whose `storagePath` we transform (the group's original/representative). */
  source: Sticker
  /** A `FANCY_STYLE_OPTIONS` id selecting the theme/style for this version. */
  styleId: string
  /** Group key linking every version of one drawing. */
  sourceDrawingId: string
  /** Drawing label carried onto the new version. */
  label: string
  enhanceSketch: EnhanceSketchFn
}

export type GenerateStickerVersionResult =
  | { ok: true; sticker: Sticker }
  | { ok: false; error: string }

/**
 * Generate one new themed version of a drawing and save it to the sticker
 * library (FEAT-33 slice 4). Re-runs `enhanceSketch` on the source's stored
 * image and writes a new sticker linked by `sourceDrawingId` + `theme`.
 *
 * **Always adds, never replaces** — repeating a theme keeps both. Shared by the
 * drawing-group card's "Add version" and the standalone "Make more versions"
 * flow so there's a single implementation. Throws on enhance/save errors;
 * returns `{ ok: false }` only when the model produced no usable image.
 */
export async function generateStickerVersion({
  familyId,
  source,
  styleId,
  sourceDrawingId,
  label,
  enhanceSketch,
}: GenerateStickerVersionArgs): Promise<GenerateStickerVersionResult> {
  const result = await enhanceSketch({
    familyId,
    sketchStoragePath: source.storagePath,
    ...resolveFancyEnhanceParams(styleId),
  })
  if (!result?.url) {
    return { ok: false, error: "That didn't work — try again." }
  }
  const newVersion: Omit<Sticker, 'id'> = {
    url: result.url,
    storagePath: result.storagePath,
    label,
    category: StickerCategory.Custom,
    childId: source.childId ?? null,
    createdAt: new Date().toISOString(),
    tags: source.tags ?? ['object'],
    childProfile: source.childProfile ?? 'both',
    sourceDrawingId,
    theme: styleId,
  }
  const ref = await addDoc(stickerLibraryCollection(familyId), newVersion as Sticker)
  return { ok: true, sticker: { ...newVersion, id: ref.id } }
}
