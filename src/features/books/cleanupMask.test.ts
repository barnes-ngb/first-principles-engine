import { describe, expect, it } from 'vitest'
import { applyCleanupMark, cleanupPoint, connectedCleanupMask, renderCleanup, INITIAL_CLEANUP, type CleanupSource } from './cleanupMask'

function drawing(): CleanupSource {
  const width = 25, height = 25, data = new Uint8ClampedArray(width * height * 4).fill(255)
  for (let y = 5; y < 20; y++) for (let x = 5; x < 20; x++) {
    if (x > 7 && x < 17 && y > 7 && y < 17) continue
    data.set([20, 30, 40, 255], (y * width + x) * 4)
  }
  return { width, height, data }
}
const pixel = (data: Uint8ClampedArray, x: number, y: number) => [...data.slice((y * 25 + x) * 4, (y * 25 + x + 1) * 4)]

describe('source-based cleanup corrections', () => {
  it('reproduces Auto erasing enclosed white detail, then Keep restores exact RGBA', () => {
    const source = drawing()
    source.data.set([250, 249, 248, 117], (12 * 25 + 12) * 4)
    const before = new Uint8ClampedArray(source.data)
    const auto = renderCleanup(source, INITIAL_CLEANUP, 0.04)
    expect(pixel(auto, 12, 12)[3]).toBe(0)
    const restored = renderCleanup(source, { ...INITIAL_CLEANUP, marks: [{ kind: 'keep', points: [{ x: 12.5, y: 12.5 }], radius: 2 }] }, 0.04)
    expect(pixel(restored, 12, 12)).toEqual([250, 249, 248, 117])
    expect(pixel(restored, 0, 0)[3]).toBe(0)
    expect(source.data).toEqual(before)
  })

  it('tapping outside does not remove a disconnected matching interior', () => {
    const source = drawing()
    const mask = connectedCleanupMask(source, { x: 0, y: 0 }, 60)
    expect(mask[0]).toBe(1)
    expect(mask[12 * 25 + 12]).not.toBe(1)
    const output = renderCleanup(source, { auto: false, strength: 60, marks: [{ kind: 'tap', point: { x: 0, y: 0 } }] }, 0.04)
    expect(pixel(output, 12, 12)).toEqual([255, 255, 255, 255])
    expect(pixel(output, 0, 0)[3]).toBe(0)
  })

  it('Auto/strength replay preserves Keep and Remove, including Keep before a tap', () => {
    const source = drawing()
    const marks = [
      { kind: 'keep' as const, points: [{ x: 1.5, y: 1.5 }], radius: 1 },
      { kind: 'tap' as const, point: { x: 0, y: 0 } },
      { kind: 'remove' as const, points: [{ x: 6.5, y: 6.5 }], radius: 1 },
    ]
    for (const strength of [0, 1, 60, 150, 60]) {
      const output = renderCleanup(source, { auto: true, strength, marks }, 0.04)
      expect(pixel(output, 1, 1)).toEqual(pixel(source.data, 1, 1))
      expect(pixel(output, 6, 6)[3]).toBe(0)
    }
    expect(renderCleanup(source, { auto: true, strength: 60, marks }, 0.04)).toEqual(renderCleanup(source, { auto: true, strength: 60, marks }, 0.04))
  })

  it('Reset returns every source channel exactly, including fully transparent colored pixels', () => {
    const source = drawing()
    source.data.set([123, 45, 67, 0], 0)
    const auto = renderCleanup(source, INITIAL_CLEANUP, 0.04)
    expect(auto[3]).toBe(0)
    expect(renderCleanup(source, { auto: false, strength: 60, marks: [] }, 0.04)).toEqual(source.data)
  })

  it('strokes join sparse touch points and Keep restores alpha, not just opacity', () => {
    const source = drawing()
    const output = new Uint8ClampedArray(source.data)
    const stroke = { kind: 'remove' as const, points: [{ x: 2.5, y: 12.5 }, { x: 22.5, y: 12.5 }], radius: 1 }
    applyCleanupMark(output, source, stroke, 60)
    for (let x = 2; x <= 22; x++) expect(pixel(output, x, 12)[3]).toBe(0)
    expect(pixel(output, 12, 10)[3]).toBe(255)
    applyCleanupMark(output, source, { ...stroke, kind: 'keep' }, 60)
    expect(output).toEqual(source.data)
  })

  it('maps scaled/scrolled/zoomed CSS coordinates without multiplying device pixel ratio', () => {
    const rect = { left: -50, top: 80, width: 400, height: 200 }
    expect(cleanupPoint(150, 180, rect, 1600, 800)).toEqual({ x: 800, y: 400 })
    expect(cleanupPoint(-51, 100, rect, 1600, 800)).toBeNull()
    expect(cleanupPoint(350, 100, rect, 1600, 800)).toBeNull()
    expect(cleanupPoint(0, 0, { left: 0, top: 0, width: 0, height: 1 }, 1, 1)).toBeNull()
  })

  it('zero-strength selection matches exact colors and respects transparent boundaries', () => {
    const source = drawing()
    source.data.set([255, 255, 255, 0], 0)
    const mask = connectedCleanupMask(source, { x: 0, y: 0 }, 0)
    expect(mask[0]).toBe(1)
    expect(mask[1]).not.toBe(1)
  })
})
