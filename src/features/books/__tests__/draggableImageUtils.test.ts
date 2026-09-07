import { describe, it, expect } from 'vitest'
import {
  clampPosition,
  DEFAULT_IMAGE_GEOMETRY,
  effectiveZ,
  layerTypeOf,
  moveInStack,
  normalizedStackZ,
  rotationFromDrag,
  scaleAboutCenter,
  stackOrder,
  stackOrderTopFirst,
  wrapDegrees,
} from '../draggableImageUtils'
import type { StackImage } from '../draggableImageUtils'

// ── clampPosition ───────────────────────────────────────────────

describe('clampPosition', () => {
  it('returns unchanged position when fully on-canvas', () => {
    const result = clampPosition(10, 10, 30, 30)
    expect(result).toEqual({ x: 10, y: 10 })
  })

  it('clamps x to keep at least 20% visible on the right', () => {
    const result = clampPosition(200, 50, 30, 30)
    expect(result.x).toBe(100 - 30 * 0.2)
  })

  it('clamps x to keep at least 20% visible on the left', () => {
    const result = clampPosition(-100, 50, 30, 30)
    expect(result.x).toBe(-(30 * 0.8))
  })

  it('clamps y to keep at least 20% visible on the bottom', () => {
    const result = clampPosition(50, 200, 30, 30)
    expect(result.y).toBe(100 - 30 * 0.2)
  })

  it('clamps y to keep at least 20% visible on the top', () => {
    const result = clampPosition(50, -100, 30, 30)
    expect(result.y).toBe(-(30 * 0.8))
  })

  it('clamps both axes simultaneously', () => {
    const result = clampPosition(-200, -200, 50, 50)
    expect(result.x).toBe(-(50 * 0.8))
    expect(result.y).toBe(-(50 * 0.8))
  })
})

// ── scaleAboutCenter ────────────────────────────────────────────

describe('scaleAboutCenter', () => {
  it('keeps the center fixed when growing', () => {
    const pos = { x: 30, y: 30, width: 40, height: 40 }
    const result = scaleAboutCenter(pos, 60, 60)
    const centerBefore = { x: pos.x + pos.width / 2, y: pos.y + pos.height / 2 }
    const centerAfter = { x: result.x + 60 / 2, y: result.y + 60 / 2 }
    expect(centerAfter.x).toBeCloseTo(centerBefore.x)
    expect(centerAfter.y).toBeCloseTo(centerBefore.y)
  })

  it('keeps the center fixed when shrinking', () => {
    const pos = { x: 30, y: 30, width: 40, height: 40 }
    const result = scaleAboutCenter(pos, 20, 20)
    const centerBefore = { x: pos.x + pos.width / 2, y: pos.y + pos.height / 2 }
    const centerAfter = { x: result.x + 20 / 2, y: result.y + 20 / 2 }
    expect(centerAfter.x).toBeCloseTo(centerBefore.x)
    expect(centerAfter.y).toBeCloseTo(centerBefore.y)
  })

  it('returns the same position when size is unchanged', () => {
    const pos = { x: 10, y: 20, width: 50, height: 50 }
    const result = scaleAboutCenter(pos, 50, 50)
    expect(result.x).toBeCloseTo(10)
    expect(result.y).toBeCloseTo(20)
  })
})

// ── wrapDegrees ─────────────────────────────────────────────────

describe('wrapDegrees', () => {
  it('wraps positive values into [0, 360)', () => {
    expect(wrapDegrees(0)).toBe(0)
    expect(wrapDegrees(90)).toBe(90)
    expect(wrapDegrees(360)).toBe(0)
    expect(wrapDegrees(450)).toBe(90)
  })

  it('wraps negative values into [0, 360)', () => {
    expect(wrapDegrees(-90)).toBe(270)
    expect(wrapDegrees(-360)).toBe(0)
    expect(wrapDegrees(-450)).toBe(270)
  })
})

// ── rotationFromDrag ────────────────────────────────────────────

describe('rotationFromDrag', () => {
  it('applies angular delta from the start rotation', () => {
    expect(rotationFromDrag(45, 10, 40)).toBe(wrapDegrees(45 + 30))
  })

  it('wraps the result into [0, 360)', () => {
    expect(rotationFromDrag(350, 0, 30)).toBe(20) // 350 + 30 = 380 → 20
  })

  it('returns the start rotation when no drag has happened', () => {
    expect(rotationFromDrag(90, 45, 45)).toBe(90)
  })
})

// ── layerTypeOf ─────────────────────────────────────────────────

describe('layerTypeOf', () => {
  it('honors an explicit layerType', () => {
    expect(layerTypeOf({ id: 'a', type: 'photo', layerType: 'element' })).toBe('element')
    expect(layerTypeOf({ id: 'a', type: 'sticker', layerType: 'background' })).toBe('background')
  })

  it('defaults sticker to element', () => {
    expect(layerTypeOf({ id: 'a', type: 'sticker' })).toBe('element')
  })

  it('defaults photo, ai-generated, sketch to background', () => {
    expect(layerTypeOf({ id: 'a', type: 'photo' })).toBe('background')
    expect(layerTypeOf({ id: 'a', type: 'ai-generated' })).toBe('background')
    expect(layerTypeOf({ id: 'a', type: 'sketch' })).toBe('background')
  })
})

// ── effectiveZ ──────────────────────────────────────────────────

describe('effectiveZ', () => {
  it('returns the stored zIndex when present', () => {
    expect(effectiveZ({ id: 'a', type: 'sticker', position: { zIndex: 5 } }, 0)).toBe(5)
  })

  it('returns a high value based on index when zIndex is absent', () => {
    const z = effectiveZ({ id: 'a', type: 'sticker' }, 3)
    expect(z).toBeGreaterThan(999999)
  })

  it('returns a high value when position is null', () => {
    const z = effectiveZ({ id: 'a', type: 'sticker', position: null }, 0)
    expect(z).toBeGreaterThan(999999)
  })
})

// ── stackOrder ──────────────────────────────────────────────────

describe('stackOrder', () => {
  const bg1: StackImage = { id: 'bg1', type: 'photo', position: { zIndex: 0 } }
  const bg2: StackImage = { id: 'bg2', type: 'ai-generated', position: { zIndex: 1 } }
  const el1: StackImage = { id: 'el1', type: 'sticker', position: { zIndex: 0 } }
  const el2: StackImage = { id: 'el2', type: 'sticker', position: { zIndex: 1 } }

  it('sorts backgrounds before elements', () => {
    const ordered = stackOrder([el1, bg1, el2, bg2])
    expect(ordered.map((i) => i.id)).toEqual(['bg1', 'bg2', 'el1', 'el2'])
  })

  it('sorts within each plane by zIndex', () => {
    const ordered = stackOrder([bg2, bg1, el2, el1])
    expect(ordered.map((i) => i.id)).toEqual(['bg1', 'bg2', 'el1', 'el2'])
  })

  it('returns empty for empty input', () => {
    expect(stackOrder([])).toEqual([])
  })

  it('handles images without position by sorting by array index', () => {
    const a: StackImage = { id: 'a', type: 'photo' }
    const b: StackImage = { id: 'b', type: 'photo' }
    const ordered = stackOrder([a, b])
    expect(ordered.map((i) => i.id)).toEqual(['a', 'b'])
  })
})

// ── stackOrderTopFirst ──────────────────────────────────────────

describe('stackOrderTopFirst', () => {
  it('returns ids in top-to-bottom order', () => {
    const bg: StackImage = { id: 'bg', type: 'photo', position: { zIndex: 0 } }
    const el: StackImage = { id: 'el', type: 'sticker', position: { zIndex: 0 } }
    expect(stackOrderTopFirst([bg, el])).toEqual(['el', 'bg'])
  })
})

// ── moveInStack ─────────────────────────────────────────────────

describe('moveInStack', () => {
  const bg1: StackImage = { id: 'bg1', type: 'photo', position: { zIndex: 0 } }
  const bg2: StackImage = { id: 'bg2', type: 'ai-generated', position: { zIndex: 1 } }
  const el1: StackImage = { id: 'el1', type: 'sticker', position: { zIndex: 0 } }
  const el2: StackImage = { id: 'el2', type: 'sticker', position: { zIndex: 1 } }
  const all = [bg1, bg2, el1, el2]

  it('swaps within the same plane (element up)', () => {
    const result = moveInStack(all, 'el1', 'up')
    const elIds = result.filter((id) => id.startsWith('el'))
    expect(elIds).toEqual(['el2', 'el1'])
  })

  it('swaps within the same plane (background down)', () => {
    const result = moveInStack(all, 'bg2', 'down')
    const bgIds = result.filter((id) => id.startsWith('bg'))
    expect(bgIds).toEqual(['bg2', 'bg1'])
  })

  it('refuses to cross planes (top background cannot move up into elements)', () => {
    const result = moveInStack(all, 'bg2', 'up')
    expect(result).toEqual(['bg1', 'bg2', 'el1', 'el2'])
  })

  it('refuses to cross planes (bottom element cannot move down into backgrounds)', () => {
    const result = moveInStack(all, 'el1', 'down')
    expect(result).toEqual(['bg1', 'bg2', 'el1', 'el2'])
  })

  it('no-ops for an unknown imageId', () => {
    const result = moveInStack(all, 'unknown', 'up')
    expect(result).toEqual(['bg1', 'bg2', 'el1', 'el2'])
  })

  it('no-ops when already at the edge (bottom bg down)', () => {
    const result = moveInStack(all, 'bg1', 'down')
    expect(result).toEqual(['bg1', 'bg2', 'el1', 'el2'])
  })

  it('no-ops when already at the edge (top el up)', () => {
    const result = moveInStack(all, 'el2', 'up')
    expect(result).toEqual(['bg1', 'bg2', 'el1', 'el2'])
  })
})

// ── normalizedStackZ ────────────────────────────────────────────

describe('normalizedStackZ', () => {
  it('assigns contiguous 0-based indices', () => {
    expect(normalizedStackZ(['a', 'b', 'c'])).toEqual({ a: 0, b: 1, c: 2 })
  })

  it('returns empty for empty input', () => {
    expect(normalizedStackZ([])).toEqual({})
  })
})

// ── DEFAULT_IMAGE_GEOMETRY ──────────────────────────────────────

describe('DEFAULT_IMAGE_GEOMETRY', () => {
  it('has an entry for every image type', () => {
    for (const type of ['ai-generated', 'photo', 'sticker', 'sketch'] as const) {
      const geo = DEFAULT_IMAGE_GEOMETRY[type]
      expect(geo).toBeDefined()
      expect(typeof geo.x).toBe('number')
      expect(typeof geo.y).toBe('number')
      expect(typeof geo.width).toBe('number')
      expect(typeof geo.height).toBe('number')
    }
  })
})
