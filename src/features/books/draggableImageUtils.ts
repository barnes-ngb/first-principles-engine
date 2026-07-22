/** Extended position including rotation (degrees), zIndex, and flip flags. */
export interface ImagePosition {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
  flipH: boolean
  flipV: boolean
}

export function clampPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } {
  // Allow up to 80% off-canvas on any edge (at least 20% visible).
  const minX = -(width * 0.8)
  const maxX = 100 - width * 0.2
  const minY = -(height * 0.8)
  const maxY = 100 - height * 0.2
  return {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
  }
}

/**
 * Resize about the object's center: given the current box and a new size,
 * return the top-left (x, y) that keeps the center fixed.
 *
 * The invariant is `centerBefore === centerAfter` — scaling never drifts the
 * object toward a corner. All values are container percentages (0–100).
 */
export function scaleAboutCenter(
  pos: { x: number; y: number; width: number; height: number },
  newWidth: number,
  newHeight: number,
): { x: number; y: number } {
  const centerX = pos.x + pos.width / 2
  const centerY = pos.y + pos.height / 2
  return {
    x: centerX - newWidth / 2,
    y: centerY - newHeight / 2,
  }
}

/** Wrap degrees into [0, 360). */
export function wrapDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360
}

/**
 * Rotation while dragging a rotate handle: continue from the rotation captured
 * at grab, applying the pointer's angular delta. Prevents the image snapping to
 * the handle's own start angle on the first move.
 */
export function rotationFromDrag(
  startRotation: number,
  startPointerAngle: number,
  currentPointerAngle: number,
): number {
  return wrapDegrees(startRotation + (currentPointerAngle - startPointerAngle))
}

// ── Stacking order (layers) ────────────────────────────────────
//
// Two planes (FEAT-116): every *background* renders below every *element*, and
// each plane orders among itself by `effectiveZ` (tie-free, survives reload).
// A background can never float above an element, and an element can never sink
// below a background — the plane is the primary sort key, so even a background
// carrying a high stored `zIndex` stays behind the elements. Within a plane,
// reordering normalizes to a contiguous `zIndex` (see `normalizedStackZ`);
// legacy docs (no stored zIndex) order by array index. FEAT-115 unified
// backgrounds and stickers into one reorderable stack, which let a photo
// background float to the top — this restores the back plane.

/** The two stacking planes. Backgrounds always render below all elements. */
export type LayerType = 'background' | 'element'

/** Minimal shape needed to compute stacking order. */
export interface StackImage {
  id: string
  type: 'photo' | 'ai-generated' | 'sticker' | 'sketch'
  /** Explicit plane (FEAT-116). Absent on legacy images → resolved by heuristic. */
  layerType?: LayerType
  position?: { zIndex?: number } | null
}

/**
 * Resolve an image's stacking plane. Honors an explicit `layerType` when
 * present; otherwise falls back to the pre-`layerType` heuristic — only
 * stickers were elements, everything else (photo / scene / sketch) was a
 * background — so legacy books partition identically.
 */
export function layerTypeOf(img: StackImage): LayerType {
  if (img.layerType) return img.layerType
  return img.type === 'sticker' ? 'element' : 'background'
}

/**
 * Per-type default geometry (container %). Shared by the renderer's fallback
 * and any writer that must materialize a missing position — a sticker with no
 * stored position must stay `25,15,30,30`, not become a full-canvas image.
 */
export const DEFAULT_IMAGE_GEOMETRY: Record<
  StackImage['type'],
  { x: number; y: number; width: number; height: number }
> = {
  'ai-generated': { x: 0, y: 0, width: 100, height: 100 },
  photo: { x: 10, y: 10, width: 40, height: 40 },
  sticker: { x: 25, y: 15, width: 30, height: 30 },
  sketch: { x: 0, y: 0, width: 100, height: 100 },
}

// Unset images sort into type bands far above any normalized (small-integer)
// zIndex, so a freshly added element lands on top of its band. Backgrounds
// band < stickers band → legacy backgrounds stay below legacy stickers.
const UNSET_BG_BAND = 1_000_000
const UNSET_STICKER_BAND = 2_000_000

/** The z-value used to order an image, honoring a stored zIndex when present. */
export function effectiveZ(img: StackImage, index: number): number {
  const z = img.position?.zIndex
  if (typeof z === 'number') return z
  const band = img.type === 'sticker' ? UNSET_STICKER_BAND : UNSET_BG_BAND
  return band + index
}

/** Images sorted bottom → top for rendering. Stable and tie-free. */
export function stackOrder<T extends StackImage>(images: T[]): T[] {
  return images
    .map((img, index) => ({ img, index, z: effectiveZ(img, index) }))
    .sort((a, b) => a.z - b.z || a.index - b.index)
    .map((entry) => entry.img)
}

/** Image ids top → bottom (how a layers panel reads). */
export function stackOrderTopFirst(images: StackImage[]): string[] {
  return stackOrder(images)
    .map((img) => img.id)
    .reverse()
}

/**
 * New bottom→top id order after moving one image a single step.
 * `direction: 'up'` moves it toward the top of the stack (higher z).
 */
export function moveInStack(
  images: StackImage[],
  imageId: string,
  direction: 'up' | 'down',
): string[] {
  const ids = stackOrder(images).map((img) => img.id)
  const from = ids.indexOf(imageId)
  if (from === -1) return ids
  const to = direction === 'up' ? from + 1 : from - 1
  if (to < 0 || to >= ids.length) return ids
  const next = [...ids]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

/**
 * Map of image id → normalized contiguous zIndex (0 = bottom) for a given
 * bottom→top id order. Persisting these values makes the order fully explicit
 * and reload-stable.
 */
export function normalizedStackZ(bottomToTopIds: string[]): Record<string, number> {
  const result: Record<string, number> = {}
  bottomToTopIds.forEach((id, index) => {
    result[id] = index
  })
  return result
}
