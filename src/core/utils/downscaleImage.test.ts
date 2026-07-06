import { afterEach, describe, expect, it, vi } from 'vitest'

import { computeDownscaleDims, downscaleImage } from './downscaleImage'

describe('computeDownscaleDims', () => {
  it('caps the long edge of a landscape image, preserving aspect ratio', () => {
    expect(computeDownscaleDims(3200, 2400, 1600)).toEqual({
      width: 1600,
      height: 1200,
      scaled: true,
    })
  })

  it('caps the long edge of a tall phone screenshot', () => {
    // 1179×2556 — a typical phone screenshot: long edge 2556 > 1600.
    const d = computeDownscaleDims(1179, 2556, 1600)
    expect(d.scaled).toBe(true)
    expect(d.height).toBe(1600)
    expect(d.width).toBe(Math.round(1179 * (1600 / 2556)))
  })

  it('leaves an already-small image untouched', () => {
    expect(computeDownscaleDims(800, 600, 1600)).toEqual({
      width: 800,
      height: 600,
      scaled: false,
    })
  })

  it('treats an image exactly at maxEdge as no-scale', () => {
    expect(computeDownscaleDims(1600, 900, 1600).scaled).toBe(false)
  })
})

// ── downscaleImage — canvas path via mocked DOM globals ──────────────────
//
// jsdom has no real canvas, so we stub Image / canvas / URL to drive the flow and
// assert (a) large images are re-drawn at the capped dimensions, (b) small images
// are returned untouched (same reference), (c) a failed encode rejects.

interface MockEnv {
  canvas: { width: number; height: number }
  drawImage: ReturnType<typeof vi.fn>
}

function mockImageEnv(
  naturalWidth: number,
  naturalHeight: number,
  opts: { blob?: Blob | null } = {},
): MockEnv {
  const blob = 'blob' in opts ? opts.blob : new Blob(['x'], { type: 'image/jpeg' })
  const drawImage = vi.fn()
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage }),
    toBlob: (cb: (b: Blob | null) => void) => cb(blob),
  }
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag === 'canvas') return canvas as unknown as HTMLCanvasElement
    throw new Error(`unexpected createElement(${tag})`)
  }) as typeof document.createElement)

  class MockImage {
    onload: () => void = () => {}
    onerror: () => void = () => {}
    width = naturalWidth
    height = naturalHeight
    private _src = ''
    set src(v: string) {
      this._src = v
      queueMicrotask(() => this.onload())
    }
    get src() {
      return this._src
    }
  }
  vi.stubGlobal('Image', MockImage)
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:mock',
    revokeObjectURL: () => {},
  })
  return { canvas, drawImage }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('downscaleImage', () => {
  it('re-draws a large image at the capped dimensions', async () => {
    const { canvas, drawImage } = mockImageEnv(3200, 2400)
    const big = new Blob([new Uint8Array(1024)], { type: 'image/png' })
    const out = await downscaleImage(big, 1600, 0.85)
    expect(out.type).toBe('image/jpeg')
    expect(canvas.width).toBe(1600)
    expect(canvas.height).toBe(1200)
    expect(drawImage).toHaveBeenCalledOnce()
  })

  it('returns the original (no re-encode) when already within maxEdge', async () => {
    const { drawImage } = mockImageEnv(800, 600)
    const small = new Blob([new Uint8Array(64)], { type: 'image/png' })
    const out = await downscaleImage(small, 1600)
    expect(out).toBe(small)
    expect(drawImage).not.toHaveBeenCalled()
  })

  it('rejects when the canvas encode fails', async () => {
    mockImageEnv(3200, 2400, { blob: null })
    const big = new Blob([new Uint8Array(1024)], { type: 'image/png' })
    await expect(downscaleImage(big, 1600)).rejects.toThrow(/toBlob/)
  })
})
