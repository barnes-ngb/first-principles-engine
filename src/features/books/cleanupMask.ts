import { cleanSketchPixels } from './cleanSketch'

export interface CleanupSource { width: number; height: number; data: Uint8ClampedArray; smallerCopy?: boolean }
export interface CleanupPoint { x: number; y: number }
export type CleanupMark =
  | { kind: 'tap'; point: CleanupPoint }
  | { kind: 'keep' | 'remove'; points: CleanupPoint[]; radius: number }
export interface CleanupEdits { auto: boolean; strength: number; marks: CleanupMark[] }
export const INITIAL_CLEANUP: CleanupEdits = { auto: true, strength: 60, marks: [] }
// A phone camera can exceed this by an order of magnitude. Refuse rather than
// silently resize the source or allocate an unbounded set of pixel buffers.
export const MAX_CLEANUP_PIXELS = 4_000_000
export const MAX_CLEANUP_MARKS = 80
export const MAX_STROKE_POINTS = 4000

/** CSS bounds are the actual canvas area (no object-fit or letterboxing). */
export function cleanupPoint(clientX: number, clientY: number, rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>, width: number, height: number): CleanupPoint | null {
  if (rect.width <= 0 || rect.height <= 0) return null
  const x = (clientX - rect.left) / rect.width * width
  const y = (clientY - rect.top) / rect.height * height
  if (x < 0 || y < 0 || x >= width || y >= height) return null
  return { x, y }
}

/** A connected fill compares ORIGINAL colors, never already-removed pixels. */
export function connectedCleanupMask(source: CleanupSource, point: CleanupPoint, strength: number): Uint8Array {
  const { width, height, data } = source
  const mask = new Uint8Array(width * height)
  const x = Math.floor(point.x), y = Math.floor(point.y)
  if (x < 0 || y < 0 || x >= width || y >= height) return mask
  const seed = y * width + x
  const tolerance2 = strength * strength
  const queue = new Int32Array(width * height)
  let start = 0, end = 0
  const visit = (pixel: number) => {
    if (mask[pixel]) return
    const offset = pixel * 4, origin = seed * 4
    const distance = (data[offset] - data[origin]) ** 2 + (data[offset + 1] - data[origin + 1]) ** 2 + (data[offset + 2] - data[origin + 2]) ** 2
    // Zero-alpha space is its own connected region, irrespective of hidden RGB.
    const matches = data[origin + 3] === 0 ? data[offset + 3] === 0 : data[offset + 3] > 0 && distance <= tolerance2
    mask[pixel] = matches ? 1 : 2
    if (matches) queue[end++] = pixel
  }
  visit(seed)
  while (start < end) {
    const p = queue[start++]
    if (p % width > 0) visit(p - 1)
    if (p % width < width - 1) visit(p + 1)
    if (p >= width) visit(p - width)
    if (p < width * (height - 1)) visit(p + width)
  }
  return mask
}

/** Apply one stroke in source coordinates, including between sparse pointer events. */
export function applyCleanupMark(output: Uint8ClampedArray, source: CleanupSource, mark: CleanupMark, strength: number): void {
  const { width, height, data } = source
  if (mark.kind === 'tap') {
    const mask = connectedCleanupMask(source, mark.point, strength)
    for (let p = 0; p < mask.length; p++) if (mask[p] === 1) output[p * 4 + 3] = 0
    return
  }
  const paint = (point: CleanupPoint) => {
    const radius2 = mark.radius ** 2
    for (let y = Math.max(0, Math.floor(point.y - mark.radius)); y <= Math.min(height - 1, Math.ceil(point.y + mark.radius)); y++) {
      for (let x = Math.max(0, Math.floor(point.x - mark.radius)); x <= Math.min(width - 1, Math.ceil(point.x + mark.radius)); x++) {
        if ((x + 0.5 - point.x) ** 2 + (y + 0.5 - point.y) ** 2 > radius2) continue
        const offset = (y * width + x) * 4
        if (mark.kind === 'keep') output.set(data.subarray(offset, offset + 4), offset)
        else output[offset + 3] = 0
      }
    }
  }
  for (let i = 0; i < mark.points.length; i++) {
    const point = mark.points[i], previous = mark.points[i - 1] ?? point
    const steps = Math.max(1, Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) / Math.max(1, mark.radius / 2)))
    for (let step = 1; step <= steps; step++) paint({ x: previous.x + (point.x - previous.x) * step / steps, y: previous.y + (point.y - previous.y) * step / steps })
  }
}

/** Every replay starts from immutable source. Manual marks always win over Auto. */
export function renderCleanup(source: CleanupSource, edits: CleanupEdits, borderInsetFraction: number): Uint8ClampedArray {
  const output = new Uint8ClampedArray(source.data)
  if (edits.auto) {
    cleanSketchPixels(output, source.width, source.height, { tolerance: edits.strength, borderInsetFraction })
    // Auto's old blur/fallback can raise alpha. Never invent opacity in a PNG.
    for (let i = 3; i < output.length; i += 4) output[i] = Math.min(output[i], source.data[i])
  }
  for (const mark of edits.marks) if (mark.kind === 'tap') applyCleanupMark(output, source, mark, edits.strength)
  // Color tolerance must never silently widen a selection into a Keep stroke.
  for (const mark of edits.marks) if (mark.kind !== 'tap') applyCleanupMark(output, source, mark, edits.strength)
  return output
}
