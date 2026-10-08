/**
 * The DOM boundary for game art (FEAT-239): reading a saved sticker's pixels,
 * and writing the sprite back out as a file or to the clipboard.
 *
 * ## Why not `imageDataUri.fetchAsDataUri`
 *
 * Three reasons, each of which would be a defect here. It is **not fail-closed**
 * (after both attempts fail it `return url`, so its caller hands a remote
 * address to a canvas believing it succeeded); it **logs the private address**
 * (`console.warn` with the storage path, and a URL prefix); and it **bounds
 * nothing** — no byte ceiling, no deadline, no cancellation.
 *
 * Its one good idea, ask the Storage SDK first, is kept — with its comment
 * corrected: the SDK path is a `fetch` of a download URL like any other, and
 * "no CORS needed" is not a browser guarantee.
 *
 * ## Bounds
 *
 * - **Bytes, during the download.** The SDK is given its own
 *   `maxDownloadSizeBytes`, and the browser fallback reads the body as a stream
 *   and counts the bytes that actually arrive — `Content-Length` may refuse
 *   early but is never trusted to accept.
 * - **Time.** Every network stage has a deadline, so a request that never
 *   settles becomes an error with a *Try again* rather than a permanent spinner.
 * - **The session.** A retired session aborts the browser fetch and drops the
 *   result.
 * - **Pixels, before the RGBA read**, which is four bytes per pixel.
 *
 * The one bound that cannot exist: a browser learns an image's dimensions by
 * decoding its header and allocating the bitmap, so the memory is spent before
 * `naturalWidth` is readable. The byte ceiling is the only lever on that, and a
 * small, highly compressed PNG can still decode large.
 *
 * Nothing here logs, and nothing here reads or writes Firestore.
 */
import { getBlob, ref } from 'firebase/storage'

import { storage } from '../../core/firebase/storage'
import {
  arcadeArtPixels,
  MAX_ARCADE_SOURCE_PIXELS,
  type ArcadeArtSize,
  type ArcadeArtSourcePixels,
} from './arcadeArt'
import {
  ArcadeArtLoadFailure,
  type ArcadeArtLoadFailure as LoadFailure,
  type ArcadeArtSource,
} from './arcadeArtSession'

/**
 * The most bytes we will accept. A generated sticker is a few hundred
 * kilobytes, so this is wide headroom that still refuses the pathological case.
 */
export const MAX_ARCADE_SOURCE_BYTES = 12_000_000

/** How long any one network stage may take before it is an error. */
export const ARCADE_LOAD_TIMEOUT_MS = 20_000

export type ArcadeArtLoadResult =
  | { ok: true; pixels: ArcadeArtSourcePixels }
  | { ok: false; reason: LoadFailure }

export interface ArcadeArtLoadOptions {
  /** Is the session that asked for this still the live one? */
  isCurrent?: () => boolean
  /** Aborted when the session retires, which aborts the browser fetch. */
  signal?: AbortSignal
  timeoutMs?: number
}

/** Has the asking session gone away? */
function retired(options: ArcadeArtLoadOptions): boolean {
  if (options.signal?.aborted) return true
  return options.isCurrent ? !options.isCurrent() : false
}

// ── Deadlines ───────────────────────────────────────────────────────────────

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown }

/**
 * Attach handlers immediately, so a rejection arriving after a deadline has
 * passed is already handled and never surfaces as an unhandled rejection.
 */
function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  )
}

async function withDeadline<T>(
  promise: Promise<T>,
  ms: number,
): Promise<Settled<T> | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms)
  })
  try {
    return await Promise.race([settle(promise), deadline])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

// ── Fetching the bytes ──────────────────────────────────────────────────────

type FetchOutcome = { ok: true; blob: Blob } | { ok: false; reason: LoadFailure }

/**
 * The SDK's own refusal that the object is over the maximum we asked for.
 *
 * Matched on the message the SDK writes for exactly this case. A miss is safe
 * rather than silent: the attempt falls through to the browser fetch, which is
 * itself bounded — so the worst outcome of a reworded SDK message is one extra
 * bounded request, never an unbounded download.
 */
function isOversizeRejection(error: unknown): boolean {
  const message = (error as { message?: unknown } | null)?.message
  return typeof message === 'string' && /exceeds maximum size/i.test(message)
}

type SdkOutcome =
  | { kind: 'blob'; blob: Blob }
  /** The object is over the ceiling. This is an answer, not a reason to retry. */
  | { kind: 'too-large' }
  /** Unreachable by this route; the browser may still manage it. */
  | { kind: 'failed' }

async function fetchViaSdk(
  source: ArcadeArtSource,
  timeoutMs: number,
): Promise<SdkOutcome> {
  // The maximum goes INTO the request, so an oversized object is refused during
  // the download rather than measured after it has all been allocated.
  //
  // `ref` and `getBlob` can throw SYNCHRONOUSLY on a path the SDK rejects, so
  // the call is inside the try: that is an unreachable source, which the
  // browser may still manage, not an unexpected browser failure.
  let settled: Settled<Blob> | null
  try {
    settled = await withDeadline(
      getBlob(ref(storage, source.storagePath), MAX_ARCADE_SOURCE_BYTES),
      timeoutMs,
    )
  } catch {
    return { kind: 'failed' }
  }
  if (!settled) return { kind: 'failed' } // the deadline passed
  if (!settled.ok) {
    return isOversizeRejection(settled.error) ? { kind: 'too-large' } : { kind: 'failed' }
  }
  // GCS does not always honour a Range request, so the size is checked again.
  if (settled.value.size > MAX_ARCADE_SOURCE_BYTES) return { kind: 'too-large' }
  return { kind: 'blob', blob: settled.value }
}

function headerValue(response: Response, name: string): string | null {
  const headers: Headers | undefined = response.headers
  if (!headers || typeof headers.get !== 'function') return null
  try {
    return headers.get(name)
  } catch {
    return null
  }
}

/**
 * Read a response body, counting the bytes that actually arrive.
 *
 * `Content-Length` is a claim: it may be absent, and it may be wrong in either
 * direction. So it is allowed to refuse early (cheap) and never to accept, and
 * the stream is abandoned the moment the real count passes the ceiling.
 */
async function readBoundedBody(
  response: Response,
  limit: number,
  controller: AbortController,
): Promise<FetchOutcome> {
  const body = response.body
  if (!body || typeof body.getReader !== 'function') {
    // No stream available. The declared length has already been checked, and
    // what arrived is checked again — but this path does allocate before it can
    // measure, which is why it is the fallback's fallback rather than the rule.
    const blob = await response.blob()
    return blob.size > limit
      ? { ok: false, reason: ArcadeArtLoadFailure.TooLarge }
      : { ok: true, blob }
  }
  const reader = body.getReader()
  const chunks: BlobPart[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > limit) {
      // Stop the transfer, not only the loop.
      await reader.cancel().catch(() => {})
      controller.abort()
      return { ok: false, reason: ArcadeArtLoadFailure.TooLarge }
    }
    chunks.push(value)
  }
  const type = headerValue(response, 'content-type') ?? ''
  return { ok: true, blob: new Blob(chunks, type ? { type } : undefined) }
}

async function readFromBrowser(
  source: ArcadeArtSource,
  controller: AbortController,
): Promise<FetchOutcome> {
  const response = await fetch(source.url, { mode: 'cors', signal: controller.signal })
  if (!response.ok) return { ok: false, reason: ArcadeArtLoadFailure.Unavailable }
  // An honest over-size header refuses before a byte is read. `Number(null)`
  // and `Number('')` are 0, so an absent header simply falls through to the
  // streamed count, which is the measurement that actually decides.
  const declared = Number(headerValue(response, 'content-length'))
  if (Number.isFinite(declared) && declared > MAX_ARCADE_SOURCE_BYTES) {
    return { ok: false, reason: ArcadeArtLoadFailure.TooLarge }
  }
  return readBoundedBody(response, MAX_ARCADE_SOURCE_BYTES, controller)
}

/**
 * The browser fallback, bounded three ways: aborted when the session retires,
 * aborted at the deadline, and raced against that deadline as well — because
 * `abort` is a request, and a transfer that does not honour it must still stop
 * being waited on.
 */
async function fetchViaBrowser(
  source: ArcadeArtSource,
  options: ArcadeArtLoadOptions,
  timeoutMs: number,
): Promise<FetchOutcome> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const sessionSignal = options.signal
  sessionSignal?.addEventListener('abort', abort)
  const timer = setTimeout(abort, timeoutMs)
  try {
    const settled = await withDeadline(readFromBrowser(source, controller), timeoutMs)
    if (settled?.ok) return settled.value
    // A deadline and a retirement both land here; only the session's own abort
    // is a cancellation, and the other is worth a sentence and a retry.
    return {
      ok: false,
      reason: sessionSignal?.aborted
        ? ArcadeArtLoadFailure.Cancelled
        : ArcadeArtLoadFailure.Unavailable,
    }
  } finally {
    clearTimeout(timer)
    sessionSignal?.removeEventListener('abort', abort)
  }
}

async function fetchSourceBlob(
  source: ArcadeArtSource,
  options: ArcadeArtLoadOptions,
  timeoutMs: number,
): Promise<FetchOutcome> {
  const sdk = await fetchViaSdk(source, timeoutMs)
  if (sdk.kind === 'blob') return { ok: true, blob: sdk.blob }
  // An oversized object does NOT fall through: retrying it through the browser
  // would be the same bytes by a second route, and the answer is already known.
  if (sdk.kind === 'too-large') {
    return { ok: false, reason: ArcadeArtLoadFailure.TooLarge }
  }
  if (retired(options)) return { ok: false, reason: ArcadeArtLoadFailure.Cancelled }
  return fetchViaBrowser(source, options, timeoutMs)
}

// ── Decoding ────────────────────────────────────────────────────────────────

/** A decoded bitmap plus the way to release it, whichever route produced it. */
interface DecodedImage {
  width: number
  height: number
  drawable: CanvasImageSource
  release: () => void
}

/**
 * Prefer `createImageBitmap`: it reports dimensions without an element in the
 * document and releases deterministically. The `Image` route is the fallback
 * for browsers that lack it, and revokes its object URL on every exit.
 */
async function decodeSourceBlob(blob: Blob): Promise<DecodedImage | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob)
      if (!bitmap.width || !bitmap.height) {
        bitmap.close()
        return null
      }
      return {
        width: bitmap.width,
        height: bitmap.height,
        drawable: bitmap,
        release: () => bitmap.close(),
      }
    } catch {
      return null
    }
  }
  const objectUrl = URL.createObjectURL(blob)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('decode'))
      image.src = objectUrl
    })
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (!width || !height) {
      URL.revokeObjectURL(objectUrl)
      return null
    }
    return {
      width,
      height,
      drawable: image,
      release: () => URL.revokeObjectURL(objectUrl),
    }
  } catch {
    URL.revokeObjectURL(objectUrl)
    return null
  }
}

async function loadInternal(
  source: ArcadeArtSource,
  options: ArcadeArtLoadOptions,
): Promise<ArcadeArtLoadResult> {
  const timeoutMs = options.timeoutMs ?? ARCADE_LOAD_TIMEOUT_MS
  if (retired(options)) return { ok: false, reason: ArcadeArtLoadFailure.Cancelled }

  const fetched = await fetchSourceBlob(source, options, timeoutMs)
  if (retired(options)) return { ok: false, reason: ArcadeArtLoadFailure.Cancelled }
  if (!fetched.ok) return { ok: false, reason: fetched.reason }

  const decoded = await decodeSourceBlob(fetched.blob)
  if (retired(options)) {
    decoded?.release()
    return { ok: false, reason: ArcadeArtLoadFailure.Cancelled }
  }
  if (!decoded) return { ok: false, reason: ArcadeArtLoadFailure.Undecodable }

  try {
    // Before the RGBA buffer, which is four bytes per pixel.
    if (decoded.width * decoded.height > MAX_ARCADE_SOURCE_PIXELS) {
      return { ok: false, reason: ArcadeArtLoadFailure.TooManyPixels }
    }
    const canvas = document.createElement('canvas')
    canvas.width = decoded.width
    canvas.height = decoded.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return { ok: false, reason: ArcadeArtLoadFailure.Unsupported }
    context.drawImage(decoded.drawable, 0, 0)
    let image: ImageData
    try {
      image = context.getImageData(0, 0, decoded.width, decoded.height)
    } catch {
      // A tainted canvas throws SecurityError here. We only ever draw from a
      // Blob, so this should be unreachable — kept because "unreachable" is a
      // claim about today's browsers and a crash is not an error message.
      return { ok: false, reason: ArcadeArtLoadFailure.Blocked }
    }
    return {
      ok: true,
      pixels: { width: decoded.width, height: decoded.height, data: image.data },
    }
  } finally {
    decoded.release()
  }
}

/**
 * Read one saved sticker's pixels, or say why not.
 *
 * Every failure leaves by the result union. The boundary `catch` is what makes
 * that true: `document.createElement`, `drawImage` and `URL.createObjectURL`
 * are browser resources that can fail under memory pressure, and before it
 * existed such a rejection escaped the union entirely and left the dialog on a
 * spinner with no error and no retry — the one outcome worse than either.
 */
export async function loadArcadeArtPixels(
  source: ArcadeArtSource,
  options: ArcadeArtLoadOptions = {},
): Promise<ArcadeArtLoadResult> {
  try {
    return await loadInternal(source, options)
  } catch {
    return {
      ok: false,
      reason: retired(options)
        ? ArcadeArtLoadFailure.Cancelled
        : ArcadeArtLoadFailure.Unexpected,
    }
  }
}

// ── Writing it back out ─────────────────────────────────────────────────────

/**
 * Encode a converted grid as a PNG at its NATIVE size.
 *
 * `size × size` pixels: the file is the sprite, not the enlarged copy on
 * screen. Expanded straight from palette indices — alpha 0 for a `.` cell,
 * alpha 255 for every other — and written with `putImageData`, so it passes
 * through no crop, no print helper and no re-encode that could trim a
 * transparent edge and change the sprite's size.
 */
export async function encodeArcadeArtPng(
  indices: Uint8Array,
  size: ArcadeArtSize,
): Promise<Blob> {
  const pixels = arcadeArtPixels(indices, size)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('arcade-art: no 2d canvas')
  const image = context.createImageData(size, size)
  image.data.set(pixels)
  context.putImageData(image, 0, 0)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('arcade-art: no blob'))),
      'image/png',
    )
  })
}

/** The literal as a plain-text file, for the clipboard-refused fallback. */
export function arcadeArtTextBlob(literal: string): Blob {
  return new Blob([literal], { type: 'text/plain;charset=utf-8' })
}

/**
 * Offer a blob as a download. The object URL is revoked on the next task: a
 * synchronous revoke races the browser's own read of it and yields an empty
 * file.
 */
export function downloadArcadeArtBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = fileName
    anchor.rel = 'noopener'
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
  }
}

/**
 * Copy the literal, and answer whether it actually landed.
 *
 * `true` ONLY on a fulfilled clipboard write. A missing API, an insecure
 * context, an unfocused page and a refused permission all answer `false`, which
 * is what lets the caller show the selectable text instead of a receipt for
 * something that is not on the clipboard.
 */
export async function copyArcadeArtLiteral(literal: string): Promise<boolean> {
  const clipboard = navigator.clipboard
  if (!clipboard || typeof clipboard.writeText !== 'function') return false
  try {
    await clipboard.writeText(literal)
    return true
  } catch {
    return false
  }
}
