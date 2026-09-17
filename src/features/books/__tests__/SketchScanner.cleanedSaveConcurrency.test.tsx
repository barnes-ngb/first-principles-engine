/**
 * Which pending save owns the fancy picture (PR1866 review repair).
 *
 * The rule these pin is asymmetric on purpose. A submitted FANCY save owns the
 * picture it was submitted for until it settles, because `savedVersions` has one
 * `'fancy'` slot and a generation landing mid-save would hand the old picture's
 * marker to a new picture nobody wrote. A submitted CLEANED save owns nothing
 * the generator touches: different bytes, different row, different slot. The
 * guard used to read "any save in flight", which made the two product lines per
 * drawing one queue — and since an `addDoc` resolves only on server ack, a
 * cleaned save started offline never settles and closed the paid door for the
 * rest of the session.
 *
 * So: a pending cleaned save must not block a generation or a redo, settling it
 * must mark only its own version, and a pending fancy save must still refuse
 * both the button and the direct call the retry card makes.
 */
import type { ComponentProps } from 'react'
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { addDoc } from 'firebase/firestore'
import { uploadBytes, getDownloadURL } from 'firebase/storage'
import { recordStickerArtGeneration } from '../useStickerArtQuota'
import SketchScanner from '../SketchScanner'

vi.mock('firebase/firestore', () => ({ addDoc: vi.fn() }))
vi.mock('../../../core/firebase/firestore', () => ({
  stickerLibraryCollection: vi.fn(() => ({ id: 'stickerLibrary' })),
}))
vi.mock('../../../core/firebase/storage', () => ({ storage: {} }))
vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage: unknown, path: string) => ({ path })),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
}))
vi.mock('../cleanSketch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../cleanSketch')>()),
  cleanSketchBackground: vi.fn(async () => new File(['cleaned'], 'cleaned.png', { type: 'image/png' })),
}))
// The crop stage draws to a canvas; this suite never exercises it (every test
// takes "Use the whole picture").
vi.mock('../SketchCropStage', () => ({ default: () => <div data-testid="crop-stage" /> }))
vi.mock('../useStickerArtQuota', () => ({ recordStickerArtGeneration: vi.fn() }))

const enhanceSketch = vi.fn()
const imageFailureRef = { current: null }
vi.mock('../../../core/ai/useAI', () => ({
  useAI: () => ({ enhanceSketch, imageFailureRef }),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** A save/upload that is on its way and will not come back — the offline shape. */
function neverSettles<T>() {
  return new Promise<T>(() => {})
}

const FANCY_URL = 'https://files.test/fancy.png'
const FANCY_PATH = 'families/fam-1/fancy/fancy.png'

/** Storage uploads: `sketches` (the original, needed by every generation) always
 *  resolves; `stickers` (the cleaned save) is the one a test may hold open. */
let stickerUpload: Promise<unknown> | null = null

function mountScanner(props: Partial<ComponentProps<typeof SketchScanner>> = {}) {
  const onSaved = vi.fn()
  const onClose = vi.fn()
  const recordGeneration = vi.fn(async () => {})
  const utils = render(
    <SketchScanner
      open
      onClose={onClose}
      familyId="fam-1"
      childName="Lincoln"
      onSaved={onSaved}
      recordGeneration={recordGeneration}
      {...props}
    />,
  )
  return { ...utils, onSaved, onClose, recordGeneration }
}

/** capture → "Use the whole picture" → preview, sitting on the Cleaned tab.
 *
 *  MUI's Dialog renders through a portal into `document.body`, so the two hidden
 *  file inputs are NOT inside `render()`'s container — that element stays empty.
 *  They are queried off the dialog itself: same two inputs, in source order
 *  (camera, then upload), so the last one is still "Upload a picture". */
async function reachPreview() {
  const dialog = await screen.findByRole('dialog')
  const inputs = dialog.querySelectorAll('input[type="file"]')
  const uploadInput = inputs[inputs.length - 1] as HTMLInputElement
  const drawing = new File(['drawing'], 'drawing.png', { type: 'image/png' })
  fireEvent.change(uploadInput, { target: { files: [drawing] } })

  fireEvent.click(await screen.findByRole('button', { name: /use the whole picture/i }))
  await screen.findByRole('tab', { name: /^Cleaned/ })
}

const tab = (name: RegExp) => screen.getByRole('tab', { name })
const clickTab = (name: RegExp) => fireEvent.click(tab(name))
const footerButton = (name: RegExp) => screen.getByRole('button', { name })

/** Resolve a fancy picture and wait for it to be on screen. */
async function generateFancy(buttonName: RegExp) {
  enhanceSketch.mockResolvedValueOnce({ url: FANCY_URL, storagePath: FANCY_PATH })
  fireEvent.click(footerButton(buttonName))
  await screen.findByAltText('Fancy version')
}

beforeEach(() => {
  vi.clearAllMocks()
  stickerUpload = null
  vi.mocked(uploadBytes).mockImplementation((async (storageRef: { path: string }) => {
    if (storageRef.path.includes('/stickers/') && stickerUpload) {
      await stickerUpload
    }
    return { ref: { path: storageRef.path } }
  }) as unknown as typeof uploadBytes)
  vi.mocked(getDownloadURL).mockImplementation((async (snapRef: { path: string }) =>
    `https://files.test/${snapRef.path}`) as unknown as typeof getDownloadURL)
  vi.mocked(addDoc).mockResolvedValue({ id: 'doc-1' } as never)
  enhanceSketch.mockResolvedValue({ url: FANCY_URL, storagePath: FANCY_PATH })
  URL.createObjectURL = vi.fn(() => 'blob:sketch') as unknown as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn()
  if (!globalThis.crypto?.randomUUID) {
    Object.defineProperty(globalThis, 'crypto', {
      value: { ...globalThis.crypto, randomUUID: () => 'source-drawing-1' },
      configurable: true,
    })
  }
})

// Deliberately no `vi.restoreAllMocks()`: every mock here is a factory `vi.fn`,
// and restoring one strips the implementation this suite re-seeds above.

// The dialog lives in a portal under `document.body`, not under render()'s
// container, so a mount left behind would still be visible to the next test's
// `screen` / `getByRole('dialog')` queries. RTL only registers its automatic
// cleanup when a global `afterEach` exists (vitest `globals: true`); doing it
// explicitly is correct either way — the second call is a no-op.
afterEach(cleanup)

describe('SketchScanner — a pending cleaned save does not own the fancy picture', () => {
  it('generates a first fancy picture while the cleaned document write is still pending', async () => {
    const pendingWrite = deferred<{ id: string }>()
    vi.mocked(addDoc).mockReturnValueOnce(pendingWrite.promise as never)
    const { recordGeneration } = mountScanner()
    await reachPreview()

    // Submit the cleaned save and leave it in flight — the offline case, where
    // the write is on its way to a server that never acks.
    fireEvent.click(footerButton(/save cleaned/i))
    await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(1))

    clickTab(/^Fancy/)
    const makeFancy = footerButton(/^make it fancy$/i)
    expect(makeFancy).not.toBeDisabled()

    enhanceSketch.mockResolvedValueOnce({ url: FANCY_URL, storagePath: FANCY_PATH })
    fireEvent.click(makeFancy)
    await screen.findByAltText('Fancy version')
    expect(enhanceSketch).toHaveBeenCalledTimes(1)
    // The paid call is still counted through the host's quota callback.
    expect(recordStickerArtGeneration).toHaveBeenCalledTimes(1)
    expect(recordStickerArtGeneration).toHaveBeenCalledWith(recordGeneration)
    // Nothing new was written: the generation is not a save.
    expect(addDoc).toHaveBeenCalledTimes(1)

    pendingWrite.resolve({ id: 'doc-1' })
    await waitFor(() => expect(tab(/^Cleaned/)).toHaveTextContent('✓'))
  })

  it('redoes a fancy picture in another style while the cleaned write is pending', async () => {
    mountScanner()
    await reachPreview()

    clickTab(/^Fancy/)
    await generateFancy(/^make it fancy$/i)

    // Now start the cleaned save and hold it open.
    clickTab(/^Cleaned/)
    vi.mocked(addDoc).mockReturnValueOnce(neverSettles() as never)
    fireEvent.click(footerButton(/save cleaned/i))
    await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(1))

    clickTab(/^Fancy/)
    const redo = footerButton(/make it with this style/i)
    expect(redo).not.toBeDisabled()

    const redone = { url: 'https://files.test/fancy-2.png', storagePath: 'families/fam-1/fancy/fancy-2.png' }
    enhanceSketch.mockResolvedValueOnce(redone)
    fireEvent.click(redo)
    await waitFor(() => expect(enhanceSketch).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByAltText('Fancy version')).toHaveAttribute('src', redone.url))
    expect(addDoc).toHaveBeenCalledTimes(1)
  })

  it('generates while the cleaned STORAGE upload is still pending, before any write', async () => {
    const upload = deferred<void>()
    stickerUpload = upload.promise
    mountScanner()
    await reachPreview()

    fireEvent.click(footerButton(/save cleaned/i))
    // The save is in flight but has not reached Firestore yet.
    await waitFor(() => expect(uploadBytes).toHaveBeenCalled())
    expect(addDoc).not.toHaveBeenCalled()

    clickTab(/^Fancy/)
    expect(footerButton(/^make it fancy$/i)).not.toBeDisabled()
    enhanceSketch.mockResolvedValueOnce({ url: FANCY_URL, storagePath: FANCY_PATH })
    fireEvent.click(footerButton(/^make it fancy$/i))
    await screen.findByAltText('Fancy version')
    expect(enhanceSketch).toHaveBeenCalledTimes(1)

    upload.resolve()
    await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(tab(/^Cleaned/)).toHaveTextContent('✓'))
  })

  it('settling the cleaned save marks only Cleaned — never the fancy picture generated under it', async () => {
    const pendingWrite = deferred<{ id: string }>()
    vi.mocked(addDoc).mockReturnValueOnce(pendingWrite.promise as never)
    const { onSaved } = mountScanner()
    await reachPreview()

    fireEvent.click(footerButton(/save cleaned/i))
    await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(1))

    clickTab(/^Fancy/)
    await generateFancy(/^make it fancy$/i)

    pendingWrite.resolve({ id: 'doc-1' })
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(tab(/^Cleaned/)).toHaveTextContent('✓'))

    // The cleaned write's success belongs to the cleaned row alone. The fancy
    // picture on screen was never written, so it must not wear a marker.
    expect(tab(/^Fancy/)).not.toHaveTextContent('✓')
    const saveFancy = footerButton(/save fancy/i)
    expect(saveFancy).toBeEnabled()
    expect(saveFancy).not.toHaveTextContent('Saved')

    // And it still saves as itself: the fancy row, written from the completed
    // result, not a second copy of the cleaned one.
    fireEvent.click(saveFancy)
    await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(2))
    const fancyDoc = vi.mocked(addDoc).mock.calls[1][1] as Record<string, unknown>
    expect(fancyDoc.storagePath).toBe(FANCY_PATH)
    expect(fancyDoc).toHaveProperty('theme')
    expect(fancyDoc).not.toHaveProperty('isOriginal')
    await waitFor(() => expect(tab(/^Fancy/)).toHaveTextContent('✓'))
  })
})

describe('SketchScanner — a pending fancy save still owns its picture', () => {
  it('refuses a redo while the fancy save is in flight, and reopens it when the save settles', async () => {
    mountScanner()
    await reachPreview()

    clickTab(/^Fancy/)
    await generateFancy(/^make it fancy$/i)
    expect(enhanceSketch).toHaveBeenCalledTimes(1)

    const pendingWrite = deferred<{ id: string }>()
    vi.mocked(addDoc).mockReturnValueOnce(pendingWrite.promise as never)
    fireEvent.click(footerButton(/save fancy/i))
    await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(1))

    const redo = footerButton(/make it with this style/i)
    expect(redo).toBeDisabled()
    // Refused in the handler too, not only on the button — the retry card calls
    // it directly, so a disabled button is not the whole guard.
    fireEvent.click(redo)
    expect(enhanceSketch).toHaveBeenCalledTimes(1)

    pendingWrite.resolve({ id: 'doc-1' })
    await waitFor(() => expect(tab(/^Fancy/)).toHaveTextContent('✓'))
    // The picture is now saved AND the paid door is open again for the next one.
    await waitFor(() => expect(footerButton(/make it with this style/i)).toBeEnabled())
  })

  it('keeps the saved fancy marker true for the picture that was written', async () => {
    mountScanner()
    await reachPreview()

    clickTab(/^Fancy/)
    await generateFancy(/^make it fancy$/i)

    fireEvent.click(footerButton(/save fancy/i))
    await waitFor(() => expect(tab(/^Fancy/)).toHaveTextContent('✓'))

    // A later generation replaces the picture, so the marker is dropped with it.
    const redone = { url: 'https://files.test/fancy-3.png', storagePath: 'families/fam-1/fancy/fancy-3.png' }
    enhanceSketch.mockResolvedValueOnce(redone)
    fireEvent.click(footerButton(/make it with this style/i))
    await waitFor(() => expect(screen.getByAltText('Fancy version')).toHaveAttribute('src', redone.url))
    expect(tab(/^Fancy/)).not.toHaveTextContent('✓')
    // The cleaned row was never touched by any of it.
    expect(tab(/^Cleaned/)).not.toHaveTextContent('✓')
  })

  it('refuses a fancy save while a generation is in flight (the other direction, unchanged)', async () => {
    mountScanner()
    await reachPreview()

    clickTab(/^Fancy/)
    await generateFancy(/^make it fancy$/i)

    const inFlight = deferred<{ url: string; storagePath: string }>()
    enhanceSketch.mockReturnValueOnce(inFlight.promise)
    fireEvent.click(footerButton(/make it with this style/i))
    await waitFor(() => expect(screen.getByRole('button', { name: /save fancy/i })).toBeDisabled())
    fireEvent.click(footerButton(/save fancy/i))
    expect(addDoc).not.toHaveBeenCalled()

    inFlight.resolve({ url: FANCY_URL, storagePath: FANCY_PATH })
    await waitFor(() => expect(footerButton(/save fancy/i)).toBeEnabled())
  })
})

describe('SketchScanner — guards a pending save still holds', () => {
  it('will not close the dialog while a cleaned save is in flight', async () => {
    const { onClose } = mountScanner()
    await reachPreview()

    vi.mocked(addDoc).mockReturnValueOnce(neverSettles() as never)
    fireEvent.click(footerButton(/save cleaned/i))
    await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(1))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /^cancel$/i })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: /^retake$/i })).toBeDisabled()
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('will not start a second save while one is in flight', async () => {
    mountScanner()
    await reachPreview()

    vi.mocked(addDoc).mockReturnValueOnce(neverSettles() as never)
    fireEvent.click(footerButton(/save cleaned/i))
    await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(1))

    clickTab(/^Fancy/)
    await generateFancy(/^make it fancy$/i)
    // Generation is free to run — a second WRITE is not.
    fireEvent.click(footerButton(/save fancy/i))
    await waitFor(() => expect(enhanceSketch).toHaveBeenCalledTimes(1))
    expect(addDoc).toHaveBeenCalledTimes(1)
  })
})
