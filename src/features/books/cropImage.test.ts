import { describe, it, expect } from 'vitest'
import { computeCropRect, isWholeImage, FULL_CROP } from './cropImage'

describe('computeCropRect', () => {
  it('maps a centered fractional box to pixel coords', () => {
    const rect = computeCropRect({ x: 0.1, y: 0.2, width: 0.5, height: 0.5 }, 1000, 800)
    expect(rect).toEqual({ x: 100, y: 160, width: 500, height: 400 })
  })

  it('returns the whole image for the full-crop fraction', () => {
    const rect = computeCropRect(FULL_CROP, 640, 480)
    expect(rect).toEqual({ x: 0, y: 0, width: 640, height: 480 })
  })

  it('clamps a region that overflows the right/bottom edges', () => {
    const rect = computeCropRect({ x: 0.8, y: 0.8, width: 0.5, height: 0.5 }, 1000, 1000)
    expect(rect.x).toBe(800)
    expect(rect.y).toBe(800)
    expect(rect.width).toBe(200)
    expect(rect.height).toBe(200)
  })

  it('clamps negative origins to zero', () => {
    const rect = computeCropRect({ x: -0.3, y: -0.1, width: 0.5, height: 0.5 }, 400, 400)
    expect(rect.x).toBe(0)
    expect(rect.y).toBe(0)
  })

  it('never returns a zero-size box', () => {
    const rect = computeCropRect({ x: 0, y: 0, width: 0, height: 0 }, 500, 500)
    expect(rect.width).toBeGreaterThanOrEqual(1)
    expect(rect.height).toBeGreaterThanOrEqual(1)
  })
})

describe('isWholeImage', () => {
  it('is true for the full-crop default', () => {
    expect(isWholeImage(FULL_CROP)).toBe(true)
  })

  it('is true for a near-full region (rounding tolerance)', () => {
    expect(isWholeImage({ x: 0, y: 0.0005, width: 0.9995, height: 1 })).toBe(true)
  })

  it('is false for a partial crop', () => {
    expect(isWholeImage({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 })).toBe(false)
  })
})
