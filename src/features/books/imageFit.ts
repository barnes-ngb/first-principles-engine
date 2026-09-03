import type { PageImage } from '../../core/types'
import { layerTypeOf } from './draggableImageUtils'

/**
 * FEAT-177 — the ONE definition of "how does an image sit in its box."
 *
 * Before this file the rule was copy-pasted as a `type === 'sticker' ? 'contain'
 * : 'cover'` ternary in the editor, the reader, the drag layer and the PDF
 * writer, which meant a generated scene (square-ish) lost its top and bottom on
 * every non-square page area, in the book AND in the print, with nothing a
 * parent could do about it. Now all four call `resolveImageFit`, so the four
 * surfaces cannot disagree.
 *
 * Scope is deliberately narrow: **the background plane only**. Stickers keep the
 * contain-fit they have always had and ignore `fit` entirely, and so does a
 * placed *element* — FEAT-116 stores a photo dropped over an existing image as
 * `type: 'photo'` with `layerType: 'element'` at a 40x40 overlay position
 * (`useBook.ts`), so a `type !== 'sticker'` test would have swept that overlay
 * into the toggle and contain-fit it behind a blurred rectangle, silently
 * recomposing the page. The plane test is therefore `layerTypeOf`, the same one
 * the stacking order uses, never the raw `type`.
 */

/** The only fields the fit rule reads. */
export type FittableImage = Pick<PageImage, 'id' | 'type'> &
  Partial<Pick<PageImage, 'fit' | 'layerType'>>

/** True for the full-page canvas plane — the only images `fit` applies to. */
function isBackgroundPlane(img: FittableImage): boolean {
  return layerTypeOf(img) === 'background'
}

/** CSS blur radius (px) for the backdrop copy behind a fitted image. */
export const FIT_BACKDROP_BLUR_PX = 16

/**
 * Scale applied to the backdrop copy so the blur's soft edge is pushed outside
 * the (overflow-hidden) box instead of showing as a pale border.
 */
export const FIT_BACKDROP_SCALE = 1.1

/** Test hook / DOM marker for the blurred backdrop copy. */
export const FIT_BACKDROP_TESTID = 'image-fit-backdrop'

/** How this image should sit in its box — the CSS `object-fit` value. */
export function resolveImageFit(img: FittableImage): 'contain' | 'cover' {
  // Stickers are cut-outs: they have always been shown whole, and `fit` is not
  // theirs to set.
  if (img.type === 'sticker') return 'contain'
  // A placed element is a composed overlay, not a page canvas. It fills its own
  // box exactly as before, and a stray `fit` on one is ignored rather than
  // honoured — so even a value written by an older build cannot move it.
  if (!isBackgroundPlane(img)) return 'cover'
  return img.fit === 'fit' ? 'contain' : 'cover'
}

/**
 * True when this image needs a blurred copy of itself behind it — i.e. it is a
 * background the parent asked to see whole, so contain-fitting it leaves space.
 * Stickers never get one (they are meant to float over what is behind them).
 */
export function hasFitBackdrop(img: FittableImage): boolean {
  return img.type !== 'sticker' && resolveImageFit(img) === 'contain'
}

/**
 * The fit currently in force for a page's backgrounds — what the editor menu
 * shows as checked. `'fit'` only when there is at least one background and
 * every one of them is fitted, so a half-set page reads as (and toggles to)
 * "show the whole picture".
 */
export function backgroundFitOf(images: readonly PageImage[]): 'fill' | 'fit' {
  const backgrounds = images.filter(isBackgroundPlane)
  if (backgrounds.length === 0) return 'fill'
  return backgrounds.every((img) => img.fit === 'fit') ? 'fit' : 'fill'
}

/**
 * Does this page have anything the toggle applies to? Gates the menu row, so a
 * page whose only images are stickers or placed elements is never offered a
 * control that would do nothing.
 */
export function hasFittableBackground(images: readonly PageImage[]): boolean {
  return images.some(isBackgroundPlane)
}

/**
 * Stamp `fit` on every image in the background plane, leaving stickers AND
 * placed elements untouched. Returns a new array; the caller hands it to the
 * page's existing update path.
 */
export function applyBackgroundFit(
  images: readonly PageImage[],
  fit: 'fill' | 'fit',
): PageImage[] {
  return images.map((img) => (isBackgroundPlane(img) ? { ...img, fit } : img))
}
