import { describe, it, expect } from 'vitest'

import {
  clampPosition,
  scaleAboutCenter,
  scaleImagePosition,
  cornerScaleFromDrag,
  wrapDegrees,
  rotationFromDrag,
  stackOrder,
  moveInStack,
  normalizedStackZ,
  effectiveZ,
  layerTypeOf,
  reorderPageImages,
  stackOrderTopFirst,
  type ImagePosition,
  type StackImage,
} from './draggableImageUtils'

// ── clampPosition ────────────────────────────────────────────────

describe('clampPosition', () => {
  it('leaves a centered image untouched', () => {
    expect(clampPosition(30, 30, 40, 40)).toEqual({ x: 30, y: 30 })
  })

  it('clamps an image dragged far to the left', () => {
    // width=50 → minX = -(50*0.8) = -40
    const { x } = clampPosition(-100, 20, 50, 30)
    expect(x).toBe(-40)
  })

  it('clamps an image dragged far to the right', () => {
    // width=50 → maxX = 100 - 50*0.2 = 90
    const { x } = clampPosition(200, 20, 50, 30)
    expect(x).toBe(90)
  })

  it('clamps an image dragged far up', () => {
    // height=30 → minY = -(30*0.8) = -24
    const { y } = clampPosition(20, -100, 50, 30)
    expect(y).toBe(-24)
  })

  it('clamps an image dragged far down', () => {
    // height=30 → maxY = 100 - 30*0.2 = 94
    const { y } = clampPosition(20, 200, 50, 30)
    expect(y).toBe(94)
  })

  it('handles a large image (wider than canvas)', () => {
    // width=150 → minX = -120, maxX = 100 - 30 = 70
    const result = clampPosition(-200, 10, 150, 50)
    expect(result.x).toBe(-120)
  })
})

// ── scaleAboutCenter ─────────────────────────────────────────────

describe('scaleAboutCenter', () => {
  it('keeps the center fixed when scaling up', () => {
    const pos = { x: 20, y: 20, width: 40, height: 40 }
    // center = (40, 40)
    const result = scaleAboutCenter(pos, 60, 60)
    expect(result.x).toBe(10) // 40 - 60/2
    expect(result.y).toBe(10) // 40 - 60/2
    // Verify center is unchanged
    expect(result.x + 60 / 2).toBe(40)
    expect(result.y + 60 / 2).toBe(40)
  })

  it('keeps the center fixed when scaling down', () => {
    const pos = { x: 10, y: 10, width: 80, height: 80 }
    // center = (50, 50)
    const result = scaleAboutCenter(pos, 40, 40)
    expect(result.x).toBe(30) // 50 - 40/2
    expect(result.y).toBe(30)
  })

  it('works with non-square dimensions', () => {
    const pos = { x: 0, y: 0, width: 100, height: 50 }
    // center = (50, 25)
    const result = scaleAboutCenter(pos, 60, 30)
    expect(result.x).toBe(20) // 50 - 60/2
    expect(result.y).toBe(10) // 25 - 30/2
  })
})

// ── scaleImagePosition ───────────────────────────────────────────

describe('scaleImagePosition', () => {
  const base: ImagePosition = {
    x: 25, y: 25, width: 50, height: 50,
    rotation: 0, zIndex: 0, flipH: false, flipV: false,
  }

  it('scales up proportionally', () => {
    const result = scaleImagePosition(base, 1.5)
    expect(result.width).toBe(75)
    expect(result.height).toBe(75)
  })

  it('clamps scale so neither side exceeds 100%', () => {
    const result = scaleImagePosition(base, 5)
    expect(result.width).toBeLessThanOrEqual(100)
    expect(result.height).toBeLessThanOrEqual(100)
  })

  it('enforces minimum size (at least 10% on one side)', () => {
    const result = scaleImagePosition(base, 0.01)
    expect(result.width).toBeGreaterThanOrEqual(10)
    expect(result.height).toBeGreaterThanOrEqual(10)
  })

  it('returns the same position for zero-width image', () => {
    const zero: ImagePosition = { ...base, width: 0 }
    expect(scaleImagePosition(zero, 2)).toEqual(zero)
  })

  it('returns the same position for zero-height image', () => {
    const zero: ImagePosition = { ...base, height: 0 }
    expect(scaleImagePosition(zero, 2)).toEqual(zero)
  })

  it('returns the same position for NaN scale', () => {
    expect(scaleImagePosition(base, NaN)).toEqual(base)
  })

  it('returns the same position for Infinity scale', () => {
    expect(scaleImagePosition(base, Infinity)).toEqual(base)
  })

  it('preserves rotation and flip flags', () => {
    const rotated: ImagePosition = { ...base, rotation: 45, flipH: true, flipV: true }
    const result = scaleImagePosition(rotated, 1.2)
    expect(result.rotation).toBe(45)
    expect(result.flipH).toBe(true)
    expect(result.flipV).toBe(true)
  })
})

// ── cornerScaleFromDrag ──────────────────────────────────────────

describe('cornerScaleFromDrag', () => {
  const canvas = { width: 400, height: 400 }
  const pos: ImagePosition = {
    x: 25, y: 25, width: 50, height: 50,
    rotation: 0, zIndex: 0, flipH: false, flipV: false,
  }

  it('returns 1 for no movement', () => {
    expect(cornerScaleFromDrag(pos, canvas, 0, 0)).toBe(1)
  })

  it('returns > 1 for outward drag (positive dx, dy)', () => {
    const scale = cornerScaleFromDrag(pos, canvas, 20, 20)
    expect(scale).toBeGreaterThan(1)
  })

  it('returns < 1 for inward drag (negative dx, dy)', () => {
    const scale = cornerScaleFromDrag(pos, canvas, -20, -20)
    expect(scale).toBeLessThan(1)
  })

  it('accounts for flipH', () => {
    const flipped: ImagePosition = { ...pos, flipH: true }
    const normal = cornerScaleFromDrag(pos, canvas, 10, 0)
    const flippedResult = cornerScaleFromDrag(flipped, canvas, 10, 0)
    // Flipping horizontally inverts the x component, so these should differ
    expect(normal).not.toBeCloseTo(flippedResult)
  })
})

// ── wrapDegrees ──────────────────────────────────────────────────

describe('wrapDegrees', () => {
  it('wraps 0 to 0', () => {
    expect(wrapDegrees(0)).toBe(0)
  })

  it('keeps 180 as 180', () => {
    expect(wrapDegrees(180)).toBe(180)
  })

  it('wraps 360 to 0', () => {
    expect(wrapDegrees(360)).toBe(0)
  })

  it('wraps 720 to 0', () => {
    expect(wrapDegrees(720)).toBe(0)
  })

  it('wraps -90 to 270', () => {
    expect(wrapDegrees(-90)).toBe(270)
  })

  it('wraps -360 to 0', () => {
    expect(wrapDegrees(-360)).toBe(0)
  })

  it('wraps -450 to 270', () => {
    expect(wrapDegrees(-450)).toBe(270)
  })

  it('keeps 359 as 359', () => {
    expect(wrapDegrees(359)).toBe(359)
  })
})

// ── rotationFromDrag ─────────────────────────────────────────────

describe('rotationFromDrag', () => {
  it('returns start rotation when pointer has not moved', () => {
    expect(rotationFromDrag(45, 10, 10)).toBe(45)
  })

  it('adds the angular delta to the start rotation', () => {
    // start=90, pointer moved 30 degrees
    expect(rotationFromDrag(90, 10, 40)).toBe(wrapDegrees(90 + 30))
  })

  it('wraps result into [0, 360)', () => {
    expect(rotationFromDrag(350, 0, 20)).toBe(10)
  })

  it('handles negative pointer delta', () => {
    expect(rotationFromDrag(10, 30, 0)).toBe(340) // 10 + (0-30) = -20 → 340
  })
})

// ── layerTypeOf ──────────────────────────────────────────────────

describe('layerTypeOf', () => {
  it('honors explicit background layerType', () => {
    expect(layerTypeOf({ id: 'a', type: 'sticker', layerType: 'background' })).toBe('background')
  })

  it('honors explicit element layerType', () => {
    expect(layerTypeOf({ id: 'a', type: 'photo', layerType: 'element' })).toBe('element')
  })

  it('defaults sticker to element', () => {
    expect(layerTypeOf({ id: 'a', type: 'sticker' })).toBe('element')
  })

  it('defaults photo to background', () => {
    expect(layerTypeOf({ id: 'a', type: 'photo' })).toBe('background')
  })

  it('defaults ai-generated to background', () => {
    expect(layerTypeOf({ id: 'a', type: 'ai-generated' })).toBe('background')
  })

  it('defaults sketch to background', () => {
    expect(layerTypeOf({ id: 'a', type: 'sketch' })).toBe('background')
  })
})

// ── effectiveZ ───────────────────────────────────────────────────

describe('effectiveZ', () => {
  it('uses stored zIndex when present', () => {
    expect(effectiveZ({ id: 'a', type: 'photo', position: { zIndex: 5 } }, 0)).toBe(5)
  })

  it('uses stored zIndex of 0', () => {
    expect(effectiveZ({ id: 'a', type: 'photo', position: { zIndex: 0 } }, 3)).toBe(0)
  })

  it('falls back to UNSET_BAND + index when no zIndex', () => {
    const z = effectiveZ({ id: 'a', type: 'photo' }, 2)
    expect(z).toBe(1_000_002)
  })

  it('falls back for null position', () => {
    const z = effectiveZ({ id: 'a', type: 'photo', position: null }, 7)
    expect(z).toBe(1_000_007)
  })
})

// ── stackOrder ───────────────────────────────────────────────────

describe('stackOrder', () => {
  it('sorts backgrounds before elements', () => {
    const images: StackImage[] = [
      { id: 'sticker1', type: 'sticker' },
      { id: 'bg1', type: 'photo' },
      { id: 'sticker2', type: 'sticker' },
      { id: 'bg2', type: 'ai-generated' },
    ]
    const order = stackOrder(images).map((img) => img.id)
    // Backgrounds (photo, ai-generated) first, then elements (stickers)
    expect(order.indexOf('bg1')).toBeLessThan(order.indexOf('sticker1'))
    expect(order.indexOf('bg2')).toBeLessThan(order.indexOf('sticker1'))
    expect(order.indexOf('bg1')).toBeLessThan(order.indexOf('sticker2'))
    expect(order.indexOf('bg2')).toBeLessThan(order.indexOf('sticker2'))
  })

  it('is stable: same-plane images without zIndex keep array order', () => {
    const images: StackImage[] = [
      { id: 'a', type: 'sticker' },
      { id: 'b', type: 'sticker' },
      { id: 'c', type: 'sticker' },
    ]
    expect(stackOrder(images).map((img) => img.id)).toEqual(['a', 'b', 'c'])
  })

  it('respects stored zIndex within a plane', () => {
    const images: StackImage[] = [
      { id: 'a', type: 'sticker', position: { zIndex: 2 } },
      { id: 'b', type: 'sticker', position: { zIndex: 0 } },
      { id: 'c', type: 'sticker', position: { zIndex: 1 } },
    ]
    expect(stackOrder(images).map((img) => img.id)).toEqual(['b', 'c', 'a'])
  })

  it('returns empty for empty input', () => {
    expect(stackOrder([])).toEqual([])
  })
})

// ── stackOrderTopFirst ───────────────────────────────────────────

describe('stackOrderTopFirst', () => {
  it('reverses the bottom-to-top order', () => {
    const images: StackImage[] = [
      { id: 'bg', type: 'photo' },
      { id: 'sticker', type: 'sticker' },
    ]
    expect(stackOrderTopFirst(images)).toEqual(['sticker', 'bg'])
  })
})

// ── moveInStack ──────────────────────────────────────────────────

describe('moveInStack', () => {
  it('moves an element up within its plane', () => {
    const images: StackImage[] = [
      { id: 'bg', type: 'photo' },
      { id: 'a', type: 'sticker', position: { zIndex: 0 } },
      { id: 'b', type: 'sticker', position: { zIndex: 1 } },
    ]
    const result = moveInStack(images, 'a', 'up')
    // 'a' should swap with 'b'
    expect(result).toEqual(['bg', 'b', 'a'])
  })

  it('moves an element down within its plane', () => {
    const images: StackImage[] = [
      { id: 'bg', type: 'photo' },
      { id: 'a', type: 'sticker', position: { zIndex: 0 } },
      { id: 'b', type: 'sticker', position: { zIndex: 1 } },
    ]
    const result = moveInStack(images, 'b', 'down')
    expect(result).toEqual(['bg', 'b', 'a'])
  })

  it('refuses to move an element into the background plane', () => {
    const images: StackImage[] = [
      { id: 'bg', type: 'photo' },
      { id: 'elem', type: 'sticker' },
    ]
    const result = moveInStack(images, 'elem', 'down')
    // No swap — elem is at the bottom of its plane, neighbor is a background
    expect(result).toEqual(['bg', 'elem'])
  })

  it('refuses to move a background into the element plane', () => {
    const images: StackImage[] = [
      { id: 'bg', type: 'photo' },
      { id: 'elem', type: 'sticker' },
    ]
    const result = moveInStack(images, 'bg', 'up')
    expect(result).toEqual(['bg', 'elem'])
  })

  it('is a no-op for unknown image id', () => {
    const images: StackImage[] = [{ id: 'a', type: 'photo' }]
    expect(moveInStack(images, 'nonexistent', 'up')).toEqual(['a'])
  })

  it('is a no-op when already at the top of its plane', () => {
    const images: StackImage[] = [
      { id: 'a', type: 'sticker', position: { zIndex: 0 } },
      { id: 'b', type: 'sticker', position: { zIndex: 1 } },
    ]
    const result = moveInStack(images, 'b', 'up')
    // b is already the topmost element
    expect(result).toEqual(['a', 'b'])
  })

  it('is a no-op when already at the bottom of its plane', () => {
    const images: StackImage[] = [
      { id: 'a', type: 'sticker', position: { zIndex: 0 } },
      { id: 'b', type: 'sticker', position: { zIndex: 1 } },
    ]
    const result = moveInStack(images, 'a', 'down')
    expect(result).toEqual(['a', 'b'])
  })
})

// ── normalizedStackZ ─────────────────────────────────────────────

describe('normalizedStackZ', () => {
  it('assigns contiguous indices starting at 0', () => {
    expect(normalizedStackZ(['x', 'y', 'z'])).toEqual({ x: 0, y: 1, z: 2 })
  })

  it('returns empty for empty input', () => {
    expect(normalizedStackZ([])).toEqual({})
  })

  it('handles a single id', () => {
    expect(normalizedStackZ(['only'])).toEqual({ only: 0 })
  })
})

// ── reorderPageImages ────────────────────────────────────────────

describe('reorderPageImages', () => {
  it('updates zIndex only in the moved image plane', () => {
    const images = [
      { id: 'bg', type: 'photo' as const, position: { x: 0, y: 0, width: 100, height: 100, zIndex: 0 } },
      { id: 'a', type: 'sticker' as const, position: { x: 10, y: 10, width: 30, height: 30, zIndex: 0 } },
      { id: 'b', type: 'sticker' as const, position: { x: 20, y: 20, width: 30, height: 30, zIndex: 1 } },
    ]
    const result = reorderPageImages(images, 'a', 'up')
    const bg = result.find((i) => i.id === 'bg')!
    const a = result.find((i) => i.id === 'a')!
    const b = result.find((i) => i.id === 'b')!

    // Background plane untouched
    expect(bg.position?.zIndex).toBe(0)
    // a moved above b
    expect(a.position!.zIndex).toBeGreaterThan(b.position!.zIndex!)
  })

  it('returns the same array reference when nothing changed', () => {
    const images = [
      { id: 'a', type: 'sticker' as const, position: { x: 10, y: 10, width: 30, height: 30, zIndex: 1 } },
    ]
    const result = reorderPageImages(images, 'a', 'up')
    expect(result).toBe(images)
  })

  it('returns the same array when image id is not found', () => {
    const images = [
      { id: 'a', type: 'sticker' as const, position: { x: 10, y: 10, width: 30, height: 30, zIndex: 0 } },
    ]
    expect(reorderPageImages(images, 'missing', 'up')).toBe(images)
  })
})
