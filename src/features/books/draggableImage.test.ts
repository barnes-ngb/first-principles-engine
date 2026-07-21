import { describe, it, expect } from 'vitest'
import {
  clampPosition,
  scaleAboutCenter,
  stackOrder,
  stackOrderTopFirst,
  moveInStack,
  normalizedStackZ,
  type StackImage,
} from './draggableImageUtils'

// ── clampPosition ──────────────────────────────────────────────

describe('clampPosition', () => {
  it('allows sticker fully on canvas', () => {
    const result = clampPosition(10, 10, 30, 30)
    expect(result).toEqual({ x: 10, y: 10 })
  })

  it('allows sticker 80% off left edge', () => {
    // width=40, so minX = -(40*0.8) = -32. Position at -32 is ok.
    const result = clampPosition(-32, 10, 40, 40)
    expect(result.x).toBeCloseTo(-32)
  })

  it('clamps sticker more than 80% off left edge', () => {
    // width=40, minX = -32. Attempting x=-50 should clamp to -32.
    const result = clampPosition(-50, 10, 40, 40)
    expect(result.x).toBeCloseTo(-32)
  })

  it('allows sticker 80% off right edge', () => {
    // width=40, maxX = 100 - 40*0.2 = 92. Position at 92 is ok.
    const result = clampPosition(92, 10, 40, 40)
    expect(result.x).toBeCloseTo(92)
  })

  it('clamps sticker more than 80% off right edge', () => {
    // width=40, maxX = 92. Attempting x=100 should clamp to 92.
    const result = clampPosition(100, 10, 40, 40)
    expect(result.x).toBeCloseTo(92)
  })

  it('allows sticker 80% off top edge', () => {
    // height=30, minY = -(30*0.8) = -24.
    const result = clampPosition(10, -24, 30, 30)
    expect(result.y).toBeCloseTo(-24)
  })

  it('clamps sticker more than 80% off top edge', () => {
    const result = clampPosition(10, -50, 30, 30)
    expect(result.y).toBeCloseTo(-24)
  })

  it('allows sticker 80% off bottom edge', () => {
    // height=30, maxY = 100 - 30*0.2 = 94.
    const result = clampPosition(10, 94, 30, 30)
    expect(result.y).toBeCloseTo(94)
  })

  it('clamps sticker more than 80% off bottom edge', () => {
    const result = clampPosition(10, 110, 30, 30)
    expect(result.y).toBeCloseTo(94)
  })
})

// ── rotation wrap ──────────────────────────────────────────────

function wrapRotation(deg: number): number {
  return ((deg % 360) + 360) % 360
}

describe('wrapRotation', () => {
  it('increments 15° per tap', () => {
    expect(wrapRotation(0 + 15)).toBe(15)
    expect(wrapRotation(345 + 15)).toBe(0)
  })

  it('wraps at 360°', () => {
    expect(wrapRotation(360)).toBe(0)
    expect(wrapRotation(375)).toBe(15)
  })

  it('handles negative rotation (rotate left)', () => {
    expect(wrapRotation(0 - 15)).toBe(345)
    expect(wrapRotation(-360)).toBe(0)
  })

  it('rotates 24 steps back to 0', () => {
    let rotation = 0
    for (let i = 0; i < 24; i++) {
      rotation = wrapRotation(rotation + 15)
    }
    expect(rotation).toBe(0)
  })
})

// ── z-index clamping ───────────────────────────────────────────

function clampZIndex(current: number, delta: 1 | -1, totalImages: number): number {
  return Math.max(0, Math.min(totalImages - 1, current + delta))
}

describe('clampZIndex', () => {
  it('increments z-index', () => {
    expect(clampZIndex(0, 1, 5)).toBe(1)
  })

  it('decrements z-index', () => {
    expect(clampZIndex(3, -1, 5)).toBe(2)
  })

  it('clamps at 0 (min)', () => {
    expect(clampZIndex(0, -1, 5)).toBe(0)
  })

  it('clamps at totalImages - 1 (max)', () => {
    expect(clampZIndex(4, 1, 5)).toBe(4)
  })

  it('clamps correctly for single image', () => {
    expect(clampZIndex(0, 1, 1)).toBe(0)
    expect(clampZIndex(0, -1, 1)).toBe(0)
  })
})

// ── percentage conversion ──────────────────────────────────────

function pxToPercent(px: number, containerPx: number): number {
  return (px / containerPx) * 100
}

function percentToPx(pct: number, containerPx: number): number {
  return (pct / 100) * containerPx
}

describe('percentage <-> pixel conversion', () => {
  const canvasSizes = [400, 800, 1200]

  for (const canvasSize of canvasSizes) {
    it(`round-trips correctly at canvas size ${canvasSize}px`, () => {
      const originalPx = 120
      const pct = pxToPercent(originalPx, canvasSize)
      const backToPx = percentToPx(pct, canvasSize)
      expect(backToPx).toBeCloseTo(originalPx, 5)
    })
  }

  it('50% is always half of canvas width', () => {
    for (const size of canvasSizes) {
      expect(percentToPx(50, size)).toBeCloseTo(size / 2)
    }
  })

  it('position at 25% x 800px canvas = 200px', () => {
    expect(percentToPx(25, 800)).toBeCloseTo(200)
  })

  it('position at 200px on 800px canvas = 25%', () => {
    expect(pxToPercent(200, 800)).toBeCloseTo(25)
  })
})

// ── scale about center (Step 3 invariant) ──────────────────────

/** Center of a box in container %. */
function centerOf(pos: { x: number; y: number; width: number; height: number }) {
  return { cx: pos.x + pos.width / 2, cy: pos.y + pos.height / 2 }
}

describe('scaleAboutCenter', () => {
  it('keeps the center fixed when growing (center before === center after)', () => {
    const pos = { x: 20, y: 30, width: 40, height: 20 }
    const before = centerOf(pos)
    const { x, y } = scaleAboutCenter(pos, 60, 30)
    const after = centerOf({ x, y, width: 60, height: 30 })
    expect(after.cx).toBeCloseTo(before.cx)
    expect(after.cy).toBeCloseTo(before.cy)
  })

  it('keeps the center fixed when shrinking', () => {
    const pos = { x: 10, y: 10, width: 80, height: 80 }
    const before = centerOf(pos)
    const { x, y } = scaleAboutCenter(pos, 20, 20)
    const after = centerOf({ x, y, width: 20, height: 20 })
    expect(after.cx).toBeCloseTo(before.cx)
    expect(after.cy).toBeCloseTo(before.cy)
  })

  it('does NOT behave like the old top-left-anchored resize (regression)', () => {
    // Old behavior kept x,y fixed → center drifted toward bottom-right.
    const pos = { x: 0, y: 0, width: 40, height: 40 }
    const oldCenter = centerOf({ x: 0, y: 0, width: 80, height: 80 }) // top-left anchored
    const { x, y } = scaleAboutCenter(pos, 80, 80)
    const newCenter = centerOf({ x, y, width: 80, height: 80 })
    expect(newCenter.cx).not.toBeCloseTo(oldCenter.cx)
    expect(newCenter.cx).toBeCloseTo(20) // original center preserved
  })

  it('drives many scale steps without center drift', () => {
    let pos = { x: 25, y: 25, width: 50, height: 50 }
    const before = centerOf(pos)
    for (const size of [30, 45, 60, 20, 55]) {
      const { x, y } = scaleAboutCenter(pos, size, size)
      pos = { x, y, width: size, height: size }
    }
    const after = centerOf(pos)
    expect(after.cx).toBeCloseTo(before.cx)
    expect(after.cy).toBeCloseTo(before.cy)
  })
})

// ── stacking order + layer reorder (Steps 1 & 2) ───────────────

function img(id: string, type: StackImage['type'], zIndex?: number): StackImage {
  return { id, type, position: zIndex === undefined ? undefined : { zIndex } }
}

describe('stackOrder', () => {
  it('legacy (no zIndex): backgrounds below stickers, in array order', () => {
    const images = [
      img('s1', 'sticker'),
      img('bg', 'ai-generated'),
      img('s2', 'sticker'),
    ]
    // bottom → top
    expect(stackOrder(images).map((i) => i.id)).toEqual(['bg', 's1', 's2'])
  })

  it('honors explicit contiguous zIndex across types (cross-type ordering)', () => {
    const images = [
      img('bg', 'ai-generated', 2), // background lifted above stickers
      img('s1', 'sticker', 0),
      img('s2', 'sticker', 1),
    ]
    expect(stackOrder(images).map((i) => i.id)).toEqual(['s1', 's2', 'bg'])
  })

  it('newly added (unset) sticker floats to the top of a normalized page', () => {
    const images = [
      img('bg', 'ai-generated', 0),
      img('s1', 'sticker', 1),
      img('new', 'sticker'), // just added, no zIndex yet
    ]
    expect(stackOrder(images).map((i) => i.id).at(-1)).toBe('new')
  })

  it('is stable and tie-free (no ambiguous ordering)', () => {
    const images = [img('a', 'sticker', 0), img('b', 'sticker', 1), img('c', 'sticker', 2)]
    const order = stackOrder(images).map((i) => i.id)
    expect(order).toEqual(['a', 'b', 'c'])
  })
})

describe('stackOrderTopFirst', () => {
  it('reads top of stack first (how a layers panel lists)', () => {
    const images = [img('bg', 'ai-generated', 0), img('s1', 'sticker', 1), img('s2', 'sticker', 2)]
    expect(stackOrderTopFirst(images)).toEqual(['s2', 's1', 'bg'])
  })
})

describe('moveInStack', () => {
  const base = () => [
    img('a', 'sticker', 0),
    img('b', 'sticker', 1),
    img('c', 'sticker', 2),
  ]

  it("'up' moves an element toward the top", () => {
    expect(moveInStack(base(), 'a', 'up')).toEqual(['b', 'a', 'c'])
  })

  it("'down' moves an element toward the bottom", () => {
    expect(moveInStack(base(), 'c', 'down')).toEqual(['a', 'c', 'b'])
  })

  it('is a no-op at the top edge', () => {
    expect(moveInStack(base(), 'c', 'up')).toEqual(['a', 'b', 'c'])
  })

  it('is a no-op at the bottom edge', () => {
    expect(moveInStack(base(), 'a', 'down')).toEqual(['a', 'b', 'c'])
  })

  it('is a no-op for an unknown id', () => {
    expect(moveInStack(base(), 'zzz', 'up')).toEqual(['a', 'b', 'c'])
  })
})

describe('z-order survives reorder → normalize → reload (the bug regression)', () => {
  // Simulate the full write path: three elements, reorder each direction,
  // normalize to persisted zIndex, then re-derive order (a "reload").
  type Persisted = { id: string; type: StackImage['type']; position?: { zIndex?: number } | null }

  function reorderAndPersist(images: Persisted[], id: string, dir: 'up' | 'down'): Persisted[] {
    const order = moveInStack(images, id, dir)
    const z = normalizedStackZ(order)
    return images.map((i) => ({ ...i, position: { ...i.position, zIndex: z[i.id] } }))
  }

  function reload(images: Persisted[]): string[] {
    // Fresh objects, order re-derived only from persisted zIndex.
    const fresh = images.map((i) => ({ id: i.id, type: i.type, position: { zIndex: i.position?.zIndex } }))
    return stackOrder(fresh).map((i) => i.id)
  }

  it('holds order across move up, move down, and reload', () => {
    let images: Persisted[] = [
      img('a', 'sticker'),
      img('b', 'sticker'),
      img('c', 'sticker'),
    ]

    // Move 'a' up twice → top.
    images = reorderAndPersist(images, 'a', 'up')
    images = reorderAndPersist(images, 'a', 'up')
    expect(reload(images)).toEqual(['b', 'c', 'a'])

    // Move 'a' back down once.
    images = reorderAndPersist(images, 'a', 'down')
    expect(reload(images)).toEqual(['b', 'a', 'c'])

    // Reload again — order is stable, never reverts.
    expect(reload(images)).toEqual(['b', 'a', 'c'])
    // Every element carries an explicit contiguous zIndex (no ties).
    const zs = images.map((i) => i.position?.zIndex).sort()
    expect(zs).toEqual([0, 1, 2])
  })
})
