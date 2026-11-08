import { describe, it, expect } from 'vitest'

import {
  clampPosition,
  scaleAboutCenter,
  scaleImagePosition,
  cornerScaleFromDrag,
  keepImageVisible,
  wrapDegrees,
  rotationFromDrag,
  layerTypeOf,
  DEFAULT_IMAGE_GEOMETRY,
  imageGeometry,
  effectiveZ,
  stackOrder,
  stackOrderTopFirst,
  moveInStack,
  normalizedStackZ,
  reorderPageImages,
  backgroundTarget,
  type ImagePosition,
  type StackImage,
} from './draggableImageUtils'

// ─── clampPosition ──────────────────────────────────────────────────────────

describe('clampPosition', () => {
  it('leaves a centered image unchanged', () => {
    const { x, y } = clampPosition(25, 25, 50, 50)
    expect(x).toBe(25)
    expect(y).toBe(25)
  })

  it('prevents more than 80% off the left edge', () => {
    const { x } = clampPosition(-100, 25, 50, 50)
    expect(x).toBe(-40) // -(50 * 0.8)
  })

  it('prevents more than 80% off the right edge', () => {
    const { x } = clampPosition(200, 25, 50, 50)
    expect(x).toBe(90) // 100 - 50 * 0.2
  })

  it('prevents more than 80% off the top', () => {
    const { y } = clampPosition(25, -100, 50, 50)
    expect(y).toBe(-40)
  })

  it('prevents more than 80% off the bottom', () => {
    const { y } = clampPosition(25, 200, 50, 50)
    expect(y).toBe(90)
  })
})

// ─── scaleAboutCenter ───────────────────────────────────────────────────────

describe('scaleAboutCenter', () => {
  it('preserves center when scaling up', () => {
    const pos = { x: 10, y: 10, width: 40, height: 40 }
    const { x, y } = scaleAboutCenter(pos, 60, 60)
    expect(x).toBe(0) // center was 30, new x = 30 - 60/2 = 0
    expect(y).toBe(0)
  })

  it('preserves center when scaling down', () => {
    const pos = { x: 0, y: 0, width: 100, height: 100 }
    const { x, y } = scaleAboutCenter(pos, 50, 50)
    expect(x).toBe(25) // center was 50, new x = 50 - 50/2 = 25
    expect(y).toBe(25)
  })

  it('handles non-square images', () => {
    const pos = { x: 20, y: 10, width: 60, height: 80 }
    const { x, y } = scaleAboutCenter(pos, 30, 40)
    // centerX = 20 + 30 = 50, newX = 50 - 15 = 35
    expect(x).toBe(35)
    // centerY = 10 + 40 = 50, newY = 50 - 20 = 30
    expect(y).toBe(30)
  })
})

// ─── scaleImagePosition ─────────────────────────────────────────────────────

describe('scaleImagePosition', () => {
  const basePos: ImagePosition = {
    x: 25, y: 25, width: 50, height: 50,
    rotation: 0, zIndex: 0, flipH: false, flipV: false,
  }

  it('scales the image proportionally', () => {
    const result = scaleImagePosition(basePos, 1.5)
    expect(result.width).toBe(75)
    expect(result.height).toBe(75)
  })

  it('clamps to maximum of 100% on each side', () => {
    const result = scaleImagePosition(basePos, 5)
    expect(result.width).toBeLessThanOrEqual(100)
    expect(result.height).toBeLessThanOrEqual(100)
  })

  it('enforces a minimum size', () => {
    const result = scaleImagePosition(basePos, 0.01)
    expect(result.width).toBeGreaterThanOrEqual(10)
    expect(result.height).toBeGreaterThanOrEqual(10)
  })

  it('returns pos unchanged for zero width', () => {
    const zeroPos = { ...basePos, width: 0 }
    expect(scaleImagePosition(zeroPos, 2)).toEqual(zeroPos)
  })

  it('returns pos unchanged for NaN scale', () => {
    expect(scaleImagePosition(basePos, NaN)).toEqual(basePos)
  })

  it('preserves rotation, zIndex and flip flags', () => {
    const pos = { ...basePos, rotation: 45, zIndex: 3, flipH: true, flipV: true }
    const result = scaleImagePosition(pos, 1.2)
    expect(result.rotation).toBe(45)
    expect(result.zIndex).toBe(3)
    expect(result.flipH).toBe(true)
    expect(result.flipV).toBe(true)
  })
})

// ─── wrapDegrees ────────────────────────────────────────────────────────────

describe('wrapDegrees', () => {
  it('wraps positive degrees', () => {
    expect(wrapDegrees(0)).toBe(0)
    expect(wrapDegrees(90)).toBe(90)
    expect(wrapDegrees(360)).toBe(0)
    expect(wrapDegrees(450)).toBe(90)
  })

  it('wraps negative degrees', () => {
    expect(wrapDegrees(-90)).toBe(270)
    expect(wrapDegrees(-360)).toBe(0)
    expect(wrapDegrees(-450)).toBe(270)
  })

  it('returns values in [0, 360)', () => {
    for (const deg of [-720, -359, -1, 0, 1, 179, 359, 360, 719]) {
      const result = wrapDegrees(deg)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThan(360)
    }
  })
})

// ─── rotationFromDrag ───────────────────────────────────────────────────────

describe('rotationFromDrag', () => {
  it('adds the pointer delta to the start rotation', () => {
    expect(rotationFromDrag(45, 10, 40)).toBe(wrapDegrees(45 + 30))
  })

  it('wraps the result into [0, 360)', () => {
    expect(rotationFromDrag(350, 0, 20)).toBe(10) // 350 + 20 = 370 → 10
  })

  it('handles negative pointer delta', () => {
    expect(rotationFromDrag(10, 30, 0)).toBe(340) // 10 + (-30) = -20 → 340
  })
})

// ─── cornerScaleFromDrag ────────────────────────────────────────────────────

describe('cornerScaleFromDrag', () => {
  it('returns 1 when there is no drag (dx=0, dy=0)', () => {
    const pos: ImagePosition = {
      x: 25, y: 25, width: 50, height: 50,
      rotation: 0, zIndex: 0, flipH: false, flipV: false,
    }
    expect(cornerScaleFromDrag(pos, { width: 400, height: 400 }, 0, 0)).toBe(1)
  })

  it('returns > 1 for a drag along the corner ray (grow)', () => {
    const pos: ImagePosition = {
      x: 25, y: 25, width: 50, height: 50,
      rotation: 0, zIndex: 0, flipH: false, flipV: false,
    }
    const scale = cornerScaleFromDrag(pos, { width: 400, height: 400 }, 10, 10)
    expect(scale).toBeGreaterThan(1)
  })

  it('returns < 1 for a drag opposite to the corner ray (shrink)', () => {
    const pos: ImagePosition = {
      x: 25, y: 25, width: 50, height: 50,
      rotation: 0, zIndex: 0, flipH: false, flipV: false,
    }
    const scale = cornerScaleFromDrag(pos, { width: 400, height: 400 }, -10, -10)
    expect(scale).toBeLessThan(1)
  })
})

// ─── layerTypeOf ────────────────────────────────────────────────────────────

describe('layerTypeOf', () => {
  it('uses explicit layerType when present', () => {
    expect(layerTypeOf({ id: '1', type: 'sticker', layerType: 'background' })).toBe('background')
    expect(layerTypeOf({ id: '2', type: 'photo', layerType: 'element' })).toBe('element')
  })

  it('defaults sticker to element', () => {
    expect(layerTypeOf({ id: '1', type: 'sticker' })).toBe('element')
  })

  it('defaults photo to background', () => {
    expect(layerTypeOf({ id: '1', type: 'photo' })).toBe('background')
  })

  it('defaults ai-generated to background', () => {
    expect(layerTypeOf({ id: '1', type: 'ai-generated' })).toBe('background')
  })

  it('defaults sketch to background', () => {
    expect(layerTypeOf({ id: '1', type: 'sketch' })).toBe('background')
  })
})

// ─── DEFAULT_IMAGE_GEOMETRY ─────────────────────────────────────────────────

describe('DEFAULT_IMAGE_GEOMETRY', () => {
  it('has entries for all image types', () => {
    expect(DEFAULT_IMAGE_GEOMETRY['ai-generated']).toBeDefined()
    expect(DEFAULT_IMAGE_GEOMETRY['photo']).toBeDefined()
    expect(DEFAULT_IMAGE_GEOMETRY['sticker']).toBeDefined()
    expect(DEFAULT_IMAGE_GEOMETRY['sketch']).toBeDefined()
  })

  it('ai-generated fills the canvas', () => {
    const g = DEFAULT_IMAGE_GEOMETRY['ai-generated']
    expect(g.width).toBe(100)
    expect(g.height).toBe(100)
  })

  it('sticker is smaller than full canvas', () => {
    const g = DEFAULT_IMAGE_GEOMETRY['sticker']
    expect(g.width).toBeLessThan(100)
    expect(g.height).toBeLessThan(100)
  })
})

// ─── effectiveZ ─────────────────────────────────────────────────────────────

describe('effectiveZ', () => {
  it('uses stored zIndex when present', () => {
    expect(effectiveZ({ id: '1', type: 'sticker', position: { zIndex: 5 } }, 0)).toBe(5)
  })

  it('falls back to a high band + index when zIndex is absent', () => {
    const z = effectiveZ({ id: '1', type: 'sticker' }, 3)
    expect(z).toBeGreaterThan(999_000) // UNSET_BAND
    expect(z).toBe(1_000_003)
  })

  it('falls back when position is null', () => {
    const z = effectiveZ({ id: '1', type: 'sticker', position: null }, 0)
    expect(z).toBe(1_000_000)
  })
})

// ─── stackOrder / stackOrderTopFirst ────────────────────────────────────────

describe('stackOrder', () => {
  it('backgrounds come before elements', () => {
    const images: StackImage[] = [
      { id: 'sticker', type: 'sticker' },
      { id: 'bg', type: 'photo' },
    ]
    const order = stackOrder(images)
    expect(order[0].id).toBe('bg')
    expect(order[1].id).toBe('sticker')
  })

  it('within a plane, sorts by zIndex', () => {
    const images: StackImage[] = [
      { id: 'a', type: 'sticker', position: { zIndex: 5 } },
      { id: 'b', type: 'sticker', position: { zIndex: 2 } },
    ]
    const order = stackOrder(images)
    expect(order[0].id).toBe('b')
    expect(order[1].id).toBe('a')
  })

  it('uses array index for images without zIndex', () => {
    const images: StackImage[] = [
      { id: 'first', type: 'sticker' },
      { id: 'second', type: 'sticker' },
    ]
    const order = stackOrder(images)
    expect(order[0].id).toBe('first')
    expect(order[1].id).toBe('second')
  })
})

describe('stackOrderTopFirst', () => {
  it('reverses the bottom-to-top order', () => {
    const images: StackImage[] = [
      { id: 'bg', type: 'photo' },
      { id: 's1', type: 'sticker', position: { zIndex: 1 } },
      { id: 's2', type: 'sticker', position: { zIndex: 2 } },
    ]
    const order = stackOrderTopFirst(images)
    expect(order[0]).toBe('s2')
    expect(order[order.length - 1]).toBe('bg')
  })
})

// ─── moveInStack ────────────────────────────────────────────────────────────

describe('moveInStack', () => {
  it('moves an element up within its plane', () => {
    const images: StackImage[] = [
      { id: 's1', type: 'sticker', position: { zIndex: 0 } },
      { id: 's2', type: 'sticker', position: { zIndex: 1 } },
    ]
    const order = moveInStack(images, 's1', 'up')
    expect(order.indexOf('s1')).toBeGreaterThan(order.indexOf('s2'))
  })

  it('does not move an element across planes', () => {
    const images: StackImage[] = [
      { id: 'bg', type: 'photo', position: { zIndex: 0 } },
      { id: 's1', type: 'sticker', position: { zIndex: 1 } },
    ]
    // bg is at bottom; moving it up would cross into the element plane
    const order = moveInStack(images, 'bg', 'up')
    expect(order.indexOf('bg')).toBeLessThan(order.indexOf('s1'))
  })

  it('returns unchanged order for unknown image id', () => {
    const images: StackImage[] = [
      { id: 's1', type: 'sticker', position: { zIndex: 0 } },
    ]
    const order = moveInStack(images, 'nonexistent', 'up')
    expect(order).toEqual(['s1'])
  })

  it('returns unchanged order when already at the top of the plane', () => {
    const images: StackImage[] = [
      { id: 's1', type: 'sticker', position: { zIndex: 0 } },
      { id: 's2', type: 'sticker', position: { zIndex: 1 } },
    ]
    const order = moveInStack(images, 's2', 'up')
    expect(order).toEqual(['s1', 's2'])
  })
})

// ─── normalizedStackZ ───────────────────────────────────────────────────────

describe('normalizedStackZ', () => {
  it('assigns contiguous zIndex starting from 0', () => {
    const z = normalizedStackZ(['a', 'b', 'c'])
    expect(z).toEqual({ a: 0, b: 1, c: 2 })
  })

  it('returns empty object for empty input', () => {
    expect(normalizedStackZ([])).toEqual({})
  })
})

// ─── keepImageVisible ───────────────────────────────────────────────────────

describe('keepImageVisible', () => {
  it('returns pos unchanged when canvas has zero dimensions', () => {
    const pos: ImagePosition = {
      x: 50, y: 50, width: 20, height: 20,
      rotation: 0, zIndex: 0, flipH: false, flipV: false,
    }
    expect(keepImageVisible(pos, { width: 0, height: 0 })).toEqual(pos)
  })

  it('clamps an image that is too far off the canvas', () => {
    const pos: ImagePosition = {
      x: -500, y: -500, width: 50, height: 50,
      rotation: 0, zIndex: 0, flipH: false, flipV: false,
    }
    const result = keepImageVisible(pos, { width: 400, height: 400 })
    // The center should be brought back near the canvas
    const centerX = result.x + result.width / 2
    expect(centerX).toBeGreaterThan(-200) // not hundreds of pixels off-screen
  })
})
