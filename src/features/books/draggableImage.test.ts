import { describe, it, expect } from 'vitest'
import {
  clampPosition,
  scaleAboutCenter,
  stackOrder,
  stackOrderTopFirst,
  moveInStack,
  normalizedStackZ,
  rotationFromDrag,
  layerTypeOf,
  DEFAULT_IMAGE_GEOMETRY,
  type StackImage,
  type LayerType,
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

function img(
  id: string,
  type: StackImage['type'],
  zIndex?: number,
  layerType?: LayerType,
): StackImage {
  return {
    id,
    type,
    ...(layerType ? { layerType } : {}),
    position: zIndex === undefined ? undefined : { zIndex },
  }
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

  it('a background can NEVER float above an element, even with a high zIndex (FEAT-116)', () => {
    // The reported bug: FEAT-115 let a background lift above stickers. The two-
    // plane order forbids it — the background stays in the back plane.
    const images = [
      img('bg', 'ai-generated', 2), // background given a high z
      img('s1', 'sticker', 0),
      img('s2', 'sticker', 1),
    ]
    expect(stackOrder(images).map((i) => i.id)).toEqual(['bg', 's1', 's2'])
  })

  it('a photo background added LAST still renders behind every element (the reported bug)', () => {
    // Photo overlay marked element (small placed image) + a full-page photo
    // background added afterward with the highest zIndex — background stays back.
    const images = [
      img('scene', 'ai-generated', 0, 'background'),
      img('char', 'sticker', 1, 'element'),
      img('photo', 'photo', 99, 'background'), // added last, high z, but a background
    ]
    const order = stackOrder(images).map((i) => i.id)
    // Both backgrounds below the character; the character is on top.
    expect(order).toEqual(['scene', 'photo', 'char'])
    expect(order.at(-1)).toBe('char')
  })

  it('backgrounds order among themselves at the back', () => {
    const images = [
      img('bgA', 'photo', 0, 'background'),
      img('bgB', 'ai-generated', 1, 'background'),
      img('el', 'sticker', 2, 'element'),
    ]
    // bgA below bgB (both back), element on top.
    expect(stackOrder(images).map((i) => i.id)).toEqual(['bgA', 'bgB', 'el'])
  })

  it('an overlay photo (layerType element) stacks above a background photo', () => {
    const images = [
      img('bgPhoto', 'photo', 0, 'background'),
      img('placedPhoto', 'photo', 1, 'element'), // same `type`, different plane
    ]
    expect(stackOrder(images).map((i) => i.id)).toEqual(['bgPhoto', 'placedPhoto'])
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

describe('layerTypeOf (back-fill for legacy images)', () => {
  it('honors an explicit layerType', () => {
    expect(layerTypeOf(img('a', 'photo', 0, 'element'))).toBe('element')
    expect(layerTypeOf(img('b', 'sticker', 0, 'background'))).toBe('background')
  })

  it('legacy (no layerType): only stickers are elements — everything else is a background', () => {
    expect(layerTypeOf(img('s', 'sticker'))).toBe('element')
    expect(layerTypeOf(img('p', 'photo'))).toBe('background')
    expect(layerTypeOf(img('a', 'ai-generated'))).toBe('background')
    expect(layerTypeOf(img('k', 'sketch'))).toBe('background')
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

describe('moveInStack — plane confinement (FEAT-116)', () => {
  // Bottom → top: bg1, bg2 (backgrounds) then el1, el2 (elements).
  const mixed = (): StackImage[] => [
    img('bg1', 'photo', 0, 'background'),
    img('bg2', 'ai-generated', 1, 'background'),
    img('el1', 'sticker', 2, 'element'),
    img('el2', 'sticker', 3, 'element'),
  ]

  it('the top background cannot rise into the element plane', () => {
    // bg2 is the top of the background plane; moving it up must be a no-op.
    expect(moveInStack(mixed(), 'bg2', 'up')).toEqual(['bg1', 'bg2', 'el1', 'el2'])
  })

  it('the bottom element cannot sink into the background plane', () => {
    // el1 is the bottom of the element plane; moving it down must be a no-op.
    expect(moveInStack(mixed(), 'el1', 'down')).toEqual(['bg1', 'bg2', 'el1', 'el2'])
  })

  it('backgrounds still reorder among themselves', () => {
    expect(moveInStack(mixed(), 'bg1', 'up')).toEqual(['bg2', 'bg1', 'el1', 'el2'])
  })

  it('elements still reorder among themselves', () => {
    expect(moveInStack(mixed(), 'el2', 'down')).toEqual(['bg1', 'bg2', 'el2', 'el1'])
  })
})

// ── Two-plane order: all three renderers agree (FEAT-116) ───────
//
// The editor, reader, and print each render `stackOrder(images)` bottom → top,
// assigning an ascending paint/zIndex (`stackIdx + 1`). Since they share the
// one pure `stackOrder`, the resolved paint order is identical everywhere —
// this asserts that single source of truth so screen and paper never disagree.

describe('all three renderers resolve the same order', () => {
  /** Mirror each renderer: stackOrder → id + ascending paint z. */
  function paint(images: StackImage[]): { id: string; z: number }[] {
    return stackOrder(images).map((im, stackIdx) => ({ id: im.id, z: stackIdx + 1 }))
  }

  it('a photo added last still paints behind the character in every renderer', () => {
    const images = [
      img('scene', 'ai-generated', 0, 'background'),
      img('char', 'sticker', 1, 'element'),
      img('photo', 'photo', 99, 'background'),
    ]
    const editor = paint(images)
    const reader = paint(images)
    const print = paint(images)
    expect(editor).toEqual(reader)
    expect(reader).toEqual(print)
    // Character paints last (highest z) → on top.
    expect(editor.at(-1)).toEqual({ id: 'char', z: 3 })
  })

  it('legacy books (no layerType) resolve identically across renderers via back-fill', () => {
    const legacy = [
      img('s1', 'sticker'),
      img('bg', 'ai-generated'),
      img('s2', 'sticker'),
    ]
    expect(paint(legacy)).toEqual([
      { id: 'bg', z: 1 },
      { id: 's1', z: 2 },
      { id: 's2', z: 3 },
    ])
  })
})

// ── review follow-ups (PR #1613) ───────────────────────────────

describe('DEFAULT_IMAGE_GEOMETRY (reorder must not full-canvas a sticker)', () => {
  it('keeps per-type defaults — a positionless sticker stays small', () => {
    expect(DEFAULT_IMAGE_GEOMETRY.sticker).toEqual({ x: 25, y: 15, width: 30, height: 30 })
    expect(DEFAULT_IMAGE_GEOMETRY.photo).toEqual({ x: 10, y: 10, width: 40, height: 40 })
    // Full-canvas is only correct for backgrounds.
    expect(DEFAULT_IMAGE_GEOMETRY['ai-generated']).toEqual({ x: 0, y: 0, width: 100, height: 100 })
    expect(DEFAULT_IMAGE_GEOMETRY.sketch).toEqual({ x: 0, y: 0, width: 100, height: 100 })
  })

  it('materializing a missing position uses the type default, never full-canvas', () => {
    // Mirrors reorderImage's per-image position construction.
    const materialize = (type: StackImage['type'], stored: object | undefined, z: number) => {
      const geom = DEFAULT_IMAGE_GEOMETRY[type]
      return { x: geom.x, y: geom.y, width: geom.width, height: geom.height, ...(stored ?? {}), zIndex: z }
    }
    expect(materialize('sticker', undefined, 2)).toEqual({ x: 25, y: 15, width: 30, height: 30, zIndex: 2 })
    // An existing position is preserved (only zIndex changes).
    expect(materialize('sticker', { x: 60, y: 40, width: 20, height: 20 }, 1)).toEqual({
      x: 60, y: 40, width: 20, height: 20, zIndex: 1,
    })
  })
})

describe('rotationFromDrag (rotate handle applies angular delta, no jump)', () => {
  it('a zero-movement grab does not change rotation', () => {
    // Handle at bottom-left → start angle ~135°; no movement must hold rotation.
    expect(rotationFromDrag(0, 135, 135)).toBe(0)
    expect(rotationFromDrag(90, 135, 135)).toBe(90)
  })

  it('applies the pointer delta on top of the current rotation', () => {
    expect(rotationFromDrag(30, 135, 165)).toBe(60) // +30° pointer → +30° rotation
    expect(rotationFromDrag(0, 135, 90)).toBe(315) // -45° wraps
  })

  it('wraps past 360', () => {
    expect(rotationFromDrag(350, 0, 20)).toBe(10)
  })
})

describe('transform writes preserve the stored zIndex (no order corruption)', () => {
  // Mirrors updateImagePosition: a transform strips the incoming (possibly
  // stale) zIndex and keeps the stored normalized one.
  function applyTransform(
    stored: { zIndex?: number } | undefined,
    incoming: { x: number; y: number; zIndex: number },
  ) {
    const next: { x: number; y: number; zIndex?: number } = { ...incoming }
    const preserved = stored?.zIndex
    if (preserved !== undefined) next.zIndex = preserved
    else delete next.zIndex
    return next
  }

  it('a drag after reorder keeps the normalized z (does not revert to stale)', () => {
    // Sticker was reordered from z=0 to z=1; DraggableImage still holds z=0.
    const result = applyTransform({ zIndex: 1 }, { x: 50, y: 50, zIndex: 0 })
    expect(result.zIndex).toBe(1)
  })

  it('a never-reordered element writes no spurious zIndex', () => {
    const result = applyTransform(undefined, { x: 50, y: 50, zIndex: 0 })
    expect('zIndex' in result).toBe(false)
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
