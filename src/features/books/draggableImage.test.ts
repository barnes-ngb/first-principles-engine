import { describe, it, expect } from 'vitest'
import { clampPosition } from './DraggableImage'

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
