import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import {
  arcadeArtPixels,
  convertToArcadeArt,
  type ArcadeArtSize,
} from './arcadeArt'
import { ArcadeArtLoadFailure } from './arcadeArtSession'
import {
  arcadeArtTextBlob,
  copyArcadeArtLiteral,
  downloadArcadeArtBlob,
  encodeArcadeArtPng,
  loadArcadeArtPixels,
  MAX_ARCADE_SOURCE_BYTES,
} from './arcadeArtImage'

/**
 * The DOM boundary — FEAT-239.
 *
 * Two things are asserted here that the pure tests cannot: that the loader is
 * **fail-closed and silent** (it never answers with the URL it could not read,
 * and it writes nothing to the console, which is the specific defect in
 * `imageDataUri.fetchAsDataUri` that this module exists instead of), and that
 * the PNG is written at the sprite's own size with no crop in the way.
 *
 * The canvas is synthetic rather than mocked away: `putImageData` keeps the
 * bytes it is given, so the last block runs a real pixel fixture through the
 * whole pipeline — decode → convert → expand → encode — and checks the actual
 * bytes that reach the encoder, not that a stub was called.
 */

// ── Firebase ──────────────────────────────────────────────────────────────

const getBlobMock = vi.fn()
vi.mock('firebase/storage', () => ({
  ref: (_storage: unknown, path: string) => ({ path }),
  getBlob: (...args: unknown[]) => getBlobMock(...args),
}))
vi.mock('../../core/firebase/storage', () => ({ storage: {} }))

// ── A synthetic canvas ────────────────────────────────────────────────────

/** What `putImageData` was handed, per canvas, plus that canvas's size. */
interface Written {
  width: number
  height: number
  data: Uint8ClampedArray
}

let written: Written | null = null
/** What `getImageData` answers — the "decoded picture" for a load test. */
let decodedPixels: Written | null = null
/** Make `getContext` answer null, as a browser with no 2D canvas does. */
let noContext = false
/** Make `getImageData` throw, as a tainted canvas does. */
let readBlocked = false
/** Make `toBlob` answer null, as an encoder that failed does. */
let encodeFails = false

function installCanvas() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    if (noContext) return null
    const canvas = this
    return {
      drawImage: () => {},
      createImageData: (w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      }),
      putImageData: (image: { data: Uint8ClampedArray }) => {
        written = {
          width: canvas.width,
          height: canvas.height,
          data: new Uint8ClampedArray(image.data),
        }
      },
      getImageData: () => {
        if (readBlocked) {
          const error = new Error('tainted')
          error.name = 'SecurityError'
          throw error
        }
        if (!decodedPixels) throw new Error('no fixture installed')
        return {
          data: decodedPixels.data,
          width: decodedPixels.width,
          height: decodedPixels.height,
        }
      },
    } as unknown as CanvasRenderingContext2D
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
  ) {
    callback(encodeFails || !written ? null : new Blob(['png'], { type: 'image/png' }))
  })
}

/** A decoded bitmap of a stated size, through the `createImageBitmap` route. */
function installDecoder(width: number, height: number) {
  const close = vi.fn()
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width, height, close })),
  )
  return close
}

const SOURCE = {
  id: 's1',
  url: 'https://example.test/wolf.png',
  storagePath: 'families/f1/stickers/wolf.png',
  label: 'Wolf',
}

/** Nothing in this feature may write to the console. */
const consoleSpies: ReturnType<typeof vi.spyOn>[] = []

beforeEach(() => {
  written = null
  decodedPixels = null
  noContext = false
  readBlocked = false
  encodeFails = false
  getBlobMock.mockReset()
  installCanvas()
  installDecoder(4, 4)
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('no network in tests') }))
  consoleSpies.length = 0
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    consoleSpies.push(vi.spyOn(console, method).mockImplementation(() => {}))
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function expectSilence() {
  for (const spy of consoleSpies) {
    expect(spy, 'this feature must never log a storage path or a URL').not.toHaveBeenCalled()
  }
}

function solidFixture(width: number, height: number): Written {
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  return { width, height, data }
}

// ── Loading ───────────────────────────────────────────────────────────────

describe('reading a saved picture', () => {
  it('asks the Storage SDK first, by the row\'s own path', async () => {
    decodedPixels = solidFixture(4, 4)
    getBlobMock.mockResolvedValue(new Blob(['bytes']))

    const result = await loadArcadeArtPixels(SOURCE)

    expect(result.ok).toBe(true)
    expect(getBlobMock).toHaveBeenCalledTimes(1)
    expect(getBlobMock.mock.calls[0][0]).toEqual({ path: SOURCE.storagePath })
    // The ceiling goes INTO the request, so an oversized object is refused
    // during the download rather than measured after it is all allocated.
    expect(getBlobMock.mock.calls[0][1]).toBe(MAX_ARCADE_SOURCE_BYTES)
    // The SDK answered, so the browser fetch is never reached.
    expect(fetch).not.toHaveBeenCalled()
    expectSilence()
  })

  it('falls through to one plain browser fetch when the SDK throws', async () => {
    decodedPixels = solidFixture(4, 4)
    getBlobMock.mockRejectedValue(new Error('cors'))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(['bytes']) })),
    )

    const result = await loadArcadeArtPixels(SOURCE)

    expect(result.ok).toBe(true)
    const [url, init] = (fetch as unknown as Mock).mock.calls[0]
    expect(url).toBe(SOURCE.url)
    expect(init.mode).toBe('cors')
    // Abortable, so retiring the session stops the transfer.
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expectSilence()
  })

  /**
   * The SDK's own "too large" is an ANSWER, not a reason to try again by
   * another route: the browser fetch would be the same bytes, and routing it
   * there is how a bounded first attempt becomes an unbounded second one.
   */
  it('does not fall through to the browser when the SDK says too large', async () => {
    getBlobMock.mockRejectedValue(new Error('Blob exceeds maximum size.'))

    expect(await loadArcadeArtPixels(SOURCE)).toEqual({
      ok: false,
      reason: ArcadeArtLoadFailure.TooLarge,
    })
    expect(fetch).not.toHaveBeenCalled()
    expectSilence()
  })

  it('gives the SDK a DEADLINE, so a request that never settles still reports', async () => {
    // The defect this closes: a hanging SDK request never reached the fallback
    // and never produced an error, so the dialog sat on `loading: true` with no
    // Try again at all.
    decodedPixels = solidFixture(4, 4)
    getBlobMock.mockReturnValue(new Promise(() => {}))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(['bytes']) })),
    )

    const result = await loadArcadeArtPixels(SOURCE, { timeoutMs: 5 })

    // The deadline is not a refusal of the picture: it falls through, and the
    // browser answers.
    expect(result.ok).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    expectSilence()
  })

  it('reports an unavailable picture when both routes miss their deadline', async () => {
    getBlobMock.mockReturnValue(new Promise(() => {}))
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))

    expect(await loadArcadeArtPixels(SOURCE, { timeoutMs: 5 })).toEqual({
      ok: false,
      reason: ArcadeArtLoadFailure.Unavailable,
    })
    expectSilence()
  })

  /**
   * The whole reason this module exists rather than reusing
   * `imageDataUri.fetchAsDataUri`, which ends `return url` — so its caller
   * believes it succeeded and hands a remote address to a canvas.
   */
  it('FAILS CLOSED — it never answers with the address it could not read', async () => {
    getBlobMock.mockRejectedValue(new Error('cors'))

    const result = await loadArcadeArtPixels(SOURCE)

    expect(result).toEqual({ ok: false, reason: ArcadeArtLoadFailure.Unavailable })
    expect(JSON.stringify(result)).not.toContain(SOURCE.url)
    expect(JSON.stringify(result)).not.toContain(SOURCE.storagePath)
    expectSilence()
  })

  it('treats a non-ok fetch as unavailable rather than as bytes', async () => {
    getBlobMock.mockRejectedValue(new Error('cors'))
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, blob: async () => new Blob([]) })))

    expect(await loadArcadeArtPixels(SOURCE)).toEqual({
      ok: false,
      reason: ArcadeArtLoadFailure.Unavailable,
    })
    expectSilence()
  })

  it('refuses too many bytes BEFORE the decode', async () => {
    const close = installDecoder(4, 4)
    getBlobMock.mockResolvedValue({ size: MAX_ARCADE_SOURCE_BYTES + 1 } as Blob)

    expect(await loadArcadeArtPixels(SOURCE)).toEqual({
      ok: false,
      reason: ArcadeArtLoadFailure.TooLarge,
    })
    // The bound is only worth having if it is checked before the allocation —
    // so nothing was decoded, and there was nothing to release.
    expect(createImageBitmap).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    expectSilence()
  })

  it('refuses too many pixels before reading them back as RGBA', async () => {
    const close = installDecoder(3000, 2000)
    getBlobMock.mockResolvedValue(new Blob(['bytes']))

    expect(await loadArcadeArtPixels(SOURCE)).toEqual({
      ok: false,
      reason: ArcadeArtLoadFailure.TooManyPixels,
    })
    // Released even on the refusal path.
    expect(close).toHaveBeenCalledTimes(1)
    expectSilence()
  })

  it('reports an undecodable picture as undecodable', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('bad png') }))
    getBlobMock.mockResolvedValue(new Blob(['bytes']))

    expect(await loadArcadeArtPixels(SOURCE)).toEqual({
      ok: false,
      reason: ArcadeArtLoadFailure.Undecodable,
    })
    expectSilence()
  })

  it('reports a zero-sized decode as undecodable rather than converting nothing', async () => {
    installDecoder(0, 0)
    getBlobMock.mockResolvedValue(new Blob(['bytes']))

    expect(await loadArcadeArtPixels(SOURCE)).toEqual({
      ok: false,
      reason: ArcadeArtLoadFailure.Undecodable,
    })
  })

  it('reports a refused pixel read as blocked, and does not crash', async () => {
    readBlocked = true
    getBlobMock.mockResolvedValue(new Blob(['bytes']))

    expect(await loadArcadeArtPixels(SOURCE)).toEqual({
      ok: false,
      reason: ArcadeArtLoadFailure.Blocked,
    })
    expectSilence()
  })

  it('reports a browser with no 2D canvas as unsupported', async () => {
    noContext = true
    getBlobMock.mockResolvedValue(new Blob(['bytes']))

    expect(await loadArcadeArtPixels(SOURCE)).toEqual({
      ok: false,
      reason: ArcadeArtLoadFailure.Unsupported,
    })
  })

  it('stops and reports CANCELLED when the session goes away mid-load', async () => {
    decodedPixels = solidFixture(4, 4)
    getBlobMock.mockResolvedValue(new Blob(['bytes']))
    // Current at the door, gone by the time the bytes arrive.
    let calls = 0
    const isCurrent = () => {
      calls += 1
      return calls < 2
    }

    expect(await loadArcadeArtPixels(SOURCE, { isCurrent })).toEqual({
      ok: false,
      reason: ArcadeArtLoadFailure.Cancelled,
    })
    expectSilence()
  })

  it('does not even ask for the bytes when the session is already gone', async () => {
    expect(await loadArcadeArtPixels(SOURCE, { isCurrent: () => false })).toEqual({
      ok: false,
      reason: ArcadeArtLoadFailure.Cancelled,
    })
    expect(getBlobMock).not.toHaveBeenCalled()
  })

  it('treats an aborted session signal as gone, without an isCurrent', async () => {
    const controller = new AbortController()
    controller.abort()

    expect(await loadArcadeArtPixels(SOURCE, { signal: controller.signal })).toEqual({
      ok: false,
      reason: ArcadeArtLoadFailure.Cancelled,
    })
    expect(getBlobMock).not.toHaveBeenCalled()
  })

  it('ABORTS the browser fetch when the session retires during it', async () => {
    getBlobMock.mockRejectedValue(new Error('cors'))
    const controller = new AbortController()
    let sawAbort = false
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              sawAbort = true
              reject(new DOMException('aborted', 'AbortError'))
            })
            // The session retires while the transfer is in flight — closing the
            // dialog, or a child / family switch.
            setTimeout(() => controller.abort(), 0)
          }),
      ),
    )

    expect(await loadArcadeArtPixels(SOURCE, { signal: controller.signal })).toEqual({
      ok: false,
      reason: ArcadeArtLoadFailure.Cancelled,
    })
    // Not merely dropped: a dropped transfer still holds a socket and a buffer.
    expect(sawAbort).toBe(true)
    expectSilence()
  })

  /**
   * `Content-Length` is a claim. It may refuse early — cheap, and worth having —
   * but it may never be what accepts a body, because it can be absent or wrong.
   */
  it('refuses an over-size body by its STREAMED count, not its header', async () => {
    getBlobMock.mockRejectedValue(new Error('cors'))
    const chunk = new Uint8Array(1_000_000)
    let served = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        // Absent, so nothing can be learned from it.
        headers: { get: () => null },
        body: {
          getReader: () => ({
            read: async () => {
              served += 1
              // Thirteen megabytes, one at a time, past a twelve-megabyte cap.
              return served > 13 ? { done: true } : { done: false, value: chunk }
            },
            cancel: async () => {},
          }),
        },
        blob: async () => new Blob([]),
      })),
    )

    expect(await loadArcadeArtPixels(SOURCE)).toEqual({
      ok: false,
      reason: ArcadeArtLoadFailure.TooLarge,
    })
    // Stopped mid-stream rather than read to the end and measured afterwards.
    expect(served).toBeLessThan(14)
    expect(createImageBitmap).not.toHaveBeenCalled()
    expectSilence()
  })

  it('refuses early on an honest over-size Content-Length', async () => {
    getBlobMock.mockRejectedValue(new Error('cors'))
    const getReader = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: { get: (name: string) => (name === 'content-length' ? '99000000' : null) },
        body: { getReader },
        blob: async () => new Blob([]),
      })),
    )

    expect(await loadArcadeArtPixels(SOURCE)).toEqual({
      ok: false,
      reason: ArcadeArtLoadFailure.TooLarge,
    })
    expect(getReader).not.toHaveBeenCalled()
  })

  it('accepts a bounded streamed body and converts it', async () => {
    decodedPixels = solidFixture(4, 4)
    getBlobMock.mockRejectedValue(new Error('cors'))
    let served = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: { get: (name: string) => (name === 'content-type' ? 'image/png' : null) },
        body: {
          getReader: () => ({
            read: async () => {
              served += 1
              return served > 2
                ? { done: true }
                : { done: false, value: new Uint8Array([1, 2, 3]) }
            },
            cancel: async () => {},
          }),
        },
      })),
    )

    expect((await loadArcadeArtPixels(SOURCE)).ok).toBe(true)
    expect(createImageBitmap).toHaveBeenCalledTimes(1)
    const [blob] = (createImageBitmap as unknown as Mock).mock.calls[0]
    expect(blob.size).toBe(6)
    expect(blob.type).toBe('image/png')
  })

  /**
   * The spinner-for-ever case. `document.createElement`, `drawImage` and
   * `URL.createObjectURL` are browser resources that can fail, and before the
   * boundary catch such a rejection escaped the result union entirely.
   */
  it('NORMALISES an unexpected browser failure instead of rejecting', async () => {
    decodedPixels = solidFixture(4, 4)
    getBlobMock.mockResolvedValue(new Blob(['bytes']))
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') throw new Error('out of memory')
      return realCreate(tag)
    })

    const result = await loadArcadeArtPixels(SOURCE)

    expect(result).toEqual({ ok: false, reason: ArcadeArtLoadFailure.Unexpected })
    expect(JSON.stringify(result)).not.toContain(SOURCE.storagePath)
    expectSilence()
  })

  it('calls an unexpected failure a cancellation when the session has gone', async () => {
    getBlobMock.mockResolvedValue(new Blob(['bytes']))
    decodedPixels = solidFixture(4, 4)
    const controller = new AbortController()
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        controller.abort()
        throw new Error('out of memory')
      }
      return realCreate(tag)
    })

    expect(await loadArcadeArtPixels(SOURCE, { signal: controller.signal })).toEqual({
      ok: false,
      reason: ArcadeArtLoadFailure.Cancelled,
    })
  })

  it('releases the decoded bitmap on the way out', async () => {
    decodedPixels = solidFixture(4, 4)
    const close = installDecoder(4, 4)
    getBlobMock.mockResolvedValue(new Blob(['bytes']))

    await loadArcadeArtPixels(SOURCE)

    expect(close).toHaveBeenCalledTimes(1)
  })
})

// ── Encoding ──────────────────────────────────────────────────────────────

describe('the exported PNG', () => {
  const grid = (size: ArcadeArtSize) => {
    const indices = new Uint8Array(size * size)
    indices[0] = 2
    indices[size * size - 1] = 15
    return indices
  }

  for (const size of [16, 32] as const) {
    it(`is written on a ${size} × ${size} canvas — the sprite, not the zoomed view`, async () => {
      const blob = await encodeArcadeArtPng(grid(size), size)

      expect(blob.type).toBe('image/png')
      expect(written).not.toBeNull()
      expect(written?.width).toBe(size)
      expect(written?.height).toBe(size)
      expect(written?.data).toHaveLength(size * size * 4)
    })
  }

  it('writes the palette expansion byte for byte, with no crop in the way', async () => {
    // `encodeCleanup` autocrops its output, which would change a sprite's size.
    // This path uses `putImageData` only, so the bytes are exactly the grid.
    await encodeArcadeArtPng(grid(16), 16)
    expect(written?.data).toEqual(arcadeArtPixels(grid(16), 16))
  })

  it('refuses rather than returning an empty file when the encoder gives nothing', async () => {
    encodeFails = true
    await expect(encodeArcadeArtPng(grid(16), 16)).rejects.toThrow()
  })

  it('refuses when the browser gives no canvas', async () => {
    noContext = true
    await expect(encodeArcadeArtPng(grid(16), 16)).rejects.toThrow()
  })
})

// ── The whole pipeline over a real pixel fixture ──────────────────────────

describe('a synthetic picture, end to end', () => {
  it('decodes, converts and encodes an actual fixture to the right bytes', async () => {
    // A 32 × 32 fixture: an opaque red left half and a clear right half.
    //
    // The crop is therefore 16 wide × 32 tall — a TALL shape — so the square's
    // side is 32 and the padding goes on the SHORT axis, which is the
    // horizontal one: four clear cells, eight red, four clear, on every row.
    // (Padding above and below would be a wide crop's answer, and reading it
    // the other way round is the easiest thing to get wrong here.)
    const width = 32
    const height = 32
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const i = (y * width + x) * 4
        data[i] = 0xff
        data[i + 1] = 0x21
        data[i + 2] = 0x21
        data[i + 3] = 255
      }
    }
    decodedPixels = { width, height, data }
    installDecoder(width, height)
    getBlobMock.mockResolvedValue(new Blob(['bytes']))

    const loaded = await loadArcadeArtPixels(SOURCE)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.pixels.width).toBe(width)
    expect(loaded.pixels.height).toBe(height)

    const converted = convertToArcadeArt(loaded.pixels, 16)
    expect(converted.ok).toBe(true)
    if (!converted.ok) return
    // Independent expectation, written from the crop by hand: side 32 at size
    // 16 is two source pixels per cell, so the 8 padding columns on each side
    // become 4 cells, and every one of the sixteen rows reads the same.
    const EXPECTED_ROW = '. . . . 2 2 2 2 2 2 2 2 . . . .'
    expect(converted.image.rows).toHaveLength(16)
    for (const [index, row] of converted.image.rows.entries()) {
      expect(row, `row ${index}`).toBe(EXPECTED_ROW)
    }

    await encodeArcadeArtPng(converted.image.indices, converted.image.size)

    expect(written?.width).toBe(16)
    expect(written?.height).toBe(16)
    const cell = (x: number, y: number) =>
      [...(written?.data.slice((y * 16 + x) * 4, (y * 16 + x) * 4 + 4) ?? [])]
    // Column 0 is padding on every row; column 4 is the red block on every row.
    expect(cell(0, 0)).toEqual([0, 0, 0, 0])
    expect(cell(0, 15)).toEqual([0, 0, 0, 0])
    expect(cell(4, 0)).toEqual([255, 33, 33, 255])
    expect(cell(11, 15)).toEqual([255, 33, 33, 255])
    expect(cell(12, 8)).toEqual([0, 0, 0, 0])
    expectSilence()
  })
})

// ── Clipboard and files ───────────────────────────────────────────────────

describe('copying', () => {
  it('answers true only when the clipboard write FULFILS', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    expect(await copyArcadeArtLiteral('img``')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('img``')
  })

  it('answers false when the clipboard refuses', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn(async () => { throw new Error('denied') }) },
    })

    expect(await copyArcadeArtLiteral('img``')).toBe(false)
    expectSilence()
  })

  it('answers false when there is no clipboard at all', async () => {
    vi.stubGlobal('navigator', {})
    expect(await copyArcadeArtLiteral('img``')).toBe(false)

    vi.stubGlobal('navigator', { clipboard: {} })
    expect(await copyArcadeArtLiteral('img``')).toBe(false)
  })
})

describe('files', () => {
  it('offers the literal as plain text', async () => {
    const blob = arcadeArtTextBlob('img`\n    . .\n`')
    expect(blob.type).toContain('text/plain')
    expect(blob.size).toBeGreaterThan(0)
  })

  it('downloads under the name it is given, and revokes the object URL', async () => {
    const createObjectURL = vi.fn(() => 'blob:sprite')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const clicks: string[] = []
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const element = realCreate(tag) as HTMLElement
      if (tag === 'a') {
        element.addEventListener('click', (event) => {
          event.preventDefault()
          clicks.push((element as HTMLAnchorElement).download)
        })
      }
      return element
    })

    downloadArcadeArtBlob(new Blob(['x']), 'wolf-arcade-16x16.png')

    expect(clicks).toEqual(['wolf-arcade-16x16.png'])
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    // Revoked on the next task, not synchronously — a synchronous revoke races
    // the browser's own read of the URL the click just started.
    expect(revokeObjectURL).not.toHaveBeenCalled()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:sprite')
  })
})
