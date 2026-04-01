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
