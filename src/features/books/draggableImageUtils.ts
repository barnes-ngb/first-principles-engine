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

/** One proportional scale bound for pinch and corner handles. Percentages are
 * relative to the image canvas, not the phone screen. A very narrow existing
 * box cannot have both sides >= 10 and <= 100; preserve its ratio and upper
 * bound, with the smaller side allowed below 10 in that case. */
export function scaleImagePosition(pos: ImagePosition, requestedScale: number): ImagePosition {
  if (pos.width <= 0 || pos.height <= 0 || !Number.isFinite(requestedScale)) return pos
  const maximum = Math.min(100 / pos.width, 100 / pos.height)
  const bothSidesMinimum = Math.max(10 / pos.width, 10 / pos.height)
  const minimum = bothSidesMinimum <= maximum ? bothSidesMinimum : 10 / Math.max(pos.width, pos.height)
  const scale = Math.max(minimum, Math.min(maximum, requestedScale))
  const width = pos.width * scale
  const height = pos.height * scale
  const center = scaleAboutCenter(pos, width, height)
  return { ...pos, width, height, ...clampPosition(center.x, center.y, width, height) }
}

/** Project the screen-space movement onto the rotated/flipped corner ray.
 * Both axes contribute, in pixels, so this also works on non-square canvases. */
export function cornerScaleFromDrag(
  pos: ImagePosition,
  canvas: { width: number; height: number },
  dx: number,
  dy: number,
): number {
  const x = pos.width * canvas.width / 200 * (pos.flipH ? -1 : 1)
  const y = pos.height * canvas.height / 200 * (pos.flipV ? -1 : 1)
  const angle = pos.rotation * Math.PI / 180
  const rx = x * Math.cos(angle) - y * Math.sin(angle)
  const ry = x * Math.sin(angle) + y * Math.cos(angle)
  const squared = rx * rx + ry * ry
  return squared > 0 ? 1 + (dx * rx + dy * ry) / squared : 1
}

/** Keep a recoverable part of the transformed box inside the canvas. The
 * existing 80%-off-page allowance is retained for axis-aligned boxes. For an
 * angled box, use its inscribed circle rather than its larger bounding box:
 * overlapping bounding-box corners alone do not mean the picture is visible.
 * This constrains geometry; transparent padding inside artwork is not measured. */
export function keepImageVisible(pos: ImagePosition, canvas: { width: number; height: number }): ImagePosition {
  if (!canvas.width || !canvas.height) return pos
  const angle = wrapDegrees(pos.rotation) * Math.PI / 180
  const w = pos.width * canvas.width / 200
  const h = pos.height * canvas.height / 200
  const c = Math.abs(Math.cos(angle))
  const s = Math.abs(Math.sin(angle))
  const marginX = 0.6 * (s < 1e-8 ? w : c < 1e-8 ? h : Math.min(w, h))
  const marginY = 0.6 * (s < 1e-8 ? h : c < 1e-8 ? w : Math.min(w, h))
  const cx = (pos.x + pos.width / 2) * canvas.width / 100
  const cy = (pos.y + pos.height / 2) * canvas.height / 100
  const clampedX = Math.max(-marginX, Math.min(canvas.width + marginX, cx))
  const clampedY = Math.max(-marginY, Math.min(canvas.height + marginY, cy))
  return {
    ...pos,
    x: clampedX === cx ? pos.x : clampedX / canvas.width * 100 - pos.width / 2,
    y: clampedY === cy ? pos.y : clampedY / canvas.height * 100 - pos.height / 2,
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

// An unset image sorts into a band far above any normalized (small-integer)
// zIndex, so a freshly added image lands on top of its own plane, ordered by
// array index. Plane separation is handled by the sort's primary key, so a
// single band suffices.
const UNSET_BAND = 1_000_000

/**
 * The z-value used to order an image *within its plane*, honoring a stored
 * zIndex when present. Cross-plane separation is applied by `stackOrder`, not
 * here.
 */
export function effectiveZ(img: StackImage, index: number): number {
  const z = img.position?.zIndex
  if (typeof z === 'number') return z
  return UNSET_BAND + index
}

/** Sort rank of a plane: backgrounds (0) always below elements (1). */
function planeRank(img: StackImage): 0 | 1 {
  return layerTypeOf(img) === 'background' ? 0 : 1
}

/**
 * Images sorted bottom → top for rendering. Backgrounds first (in their own
 * order), then elements (in their own order). Stable and tie-free.
 */
export function stackOrder<T extends StackImage>(images: T[]): T[] {
  return images
    .map((img, index) => ({ img, index, plane: planeRank(img), z: effectiveZ(img, index) }))
    .sort((a, b) => a.plane - b.plane || a.z - b.z || a.index - b.index)
    .map((entry) => entry.img)
}

/** Image ids top → bottom (how a layers panel reads). */
export function stackOrderTopFirst(images: StackImage[]): string[] {
  return stackOrder(images)
    .map((img) => img.id)
    .reverse()
}

/**
 * New bottom→top id order after moving one image a single step *within its
 * plane*. `direction: 'up'` moves it toward the top of the stack (higher z).
 * A background can never cross into the element plane and vice versa: because
 * planes are contiguous in `stackOrder`, the neighbor at the boundary is in the
 * other plane, so the move is refused (no-op) rather than interleaving.
 */
export function moveInStack(
  images: StackImage[],
  imageId: string,
  direction: 'up' | 'down',
): string[] {
  const ordered = stackOrder(images)
  const ids = ordered.map((img) => img.id)
  const from = ids.indexOf(imageId)
  if (from === -1) return ids
  const to = direction === 'up' ? from + 1 : from - 1
  if (to < 0 || to >= ids.length) return ids
  // Only swap with a same-plane neighbor — never let an image change planes.
  if (planeRank(ordered[to]) !== planeRank(ordered[from])) return ids
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
