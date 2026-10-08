import type { ComponentProps } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Sticker } from '../../core/types'
import ArcadeArtDialog from './ArcadeArtDialog'
import {
  ARCADE_ART_COPIED,
  ARCADE_ART_COPY_FALLBACK_LABEL,
  ArcadeArtLoadFailure,
  arcadeArtLoadFailureMessage,
} from './arcadeArtSession'
import type { ArcadeArtSourcePixels } from './arcadeArt'

/**
 * The game-art dialog — FEAT-239.
 *
 * The converter and the loader have their own suites; what is asserted here is
 * the SESSION: that a result arriving late — a clipboard write, an encode, a
 * load — can only report into the session and the size it was started for.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────

const loadMock = vi.fn()
const encodeMock = vi.fn()
const copyMock = vi.fn()
const downloadMock = vi.fn()
const textBlobMock = vi.fn((literal: string) => new Blob([literal]))

vi.mock('./arcadeArtImage', () => ({
  loadArcadeArtPixels: (...args: unknown[]) => loadMock(...args),
  encodeArcadeArtPng: (...args: unknown[]) => encodeMock(...args),
  copyArcadeArtLiteral: (...args: unknown[]) => copyMock(...args),
  downloadArcadeArtBlob: (...args: unknown[]) => downloadMock(...args),
  arcadeArtTextBlob: (literal: string) => textBlobMock(literal),
}))

const sticker: Sticker = {
  id: 'v-comic',
  url: 'https://example.test/comic.png',
  storagePath: 'families/f1/stickers/comic.png',
  label: 'Wolf',
  category: 'custom',
  createdAt: '2026-10-01',
}

/** 32 × 32, fully opaque white: a clean conversion at both sizes. */
function solidPixels(): ArcadeArtSourcePixels {
  return { width: 32, height: 32, data: new Uint8ClampedArray(32 * 32 * 4).fill(255) }
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error?: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  loadMock.mockReset().mockResolvedValue({ ok: true, pixels: solidPixels() })
  encodeMock.mockReset().mockImplementation(async () => new Blob(['png']))
  copyMock.mockReset().mockResolvedValue(true)
  downloadMock.mockReset()
  textBlobMock.mockClear()
  let next = 0
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => `blob:sprite-${(next += 1)}`),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function open(props: Partial<ComponentProps<typeof ArcadeArtDialog>> = {}) {
  const onClose = props.onClose ?? vi.fn()
  const view = render(
    <ArcadeArtDialog
      source={sticker}
      familyId="f1"
      contextKey="f1|parents|child-1"
      nonce={0}
      onClose={onClose}
      {...props}
    />,
  )
  return { ...view, onClose, user: userEvent.setup() }
}

const previewFor = (size: 16 | 32) =>
  screen.findByAltText(`Wolf as ${size} by ${size} game art`)

/** The size toggle, matched loosely so the multiplication sign cannot bite. */
const sizeButton = (size: 16 | 32) =>
  screen.getByRole('button', { name: new RegExp(`^${size}\\s*\\D\\s*${size}$`) })

// ── Tests ─────────────────────────────────────────────────────────────────

describe('a game-art session', () => {
  it('reads the picture once and shows both previews at the chosen size', async () => {
    open()

    await previewFor(16)
    expect(loadMock).toHaveBeenCalledTimes(1)
    // The exact saved picture it was opened on.
    expect(loadMock.mock.calls[0][0]).toMatchObject({
      id: 'v-comic',
      storagePath: sticker.storagePath,
      url: sticker.url,
    })
    // One encode per conversion, and the big view, the actual-size view and the
    // download all read it — so what is on screen cannot differ from the file.
    expect(encodeMock).toHaveBeenCalledTimes(1)
    expect(encodeMock.mock.calls[0][1]).toBe(16)
  })

  it('hands the loader a session signal, so retiring it stops the read', async () => {
    open()
    await previewFor(16)
    expect(loadMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
    expect(loadMock.mock.calls[0][1].signal.aborted).toBe(false)
  })

  it('re-encodes at the new size and names the download for it', async () => {
    const { user } = open()
    await previewFor(16)

    await user.click(sizeButton(32))
    await previewFor(32)

    expect(encodeMock).toHaveBeenCalledTimes(2)
    expect(encodeMock.mock.calls[1][1]).toBe(32)

    await user.click(screen.getByRole('button', { name: /download png/i }))
    expect(downloadMock).toHaveBeenCalledTimes(1)
    expect(downloadMock.mock.calls[0][1]).toBe('wolf-arcade-32x32.png')
  })

  /**
   * The size change retires the output at the TAP, not in the effect that
   * follows the commit — otherwise a promise resolving in between reports
   * against a grid nobody is looking at.
   */
  it('retires the previous output SYNCHRONOUSLY when the size changes', async () => {
    const held = deferred<Blob>()
    const { user } = open()
    await previewFor(16)

    encodeMock.mockReturnValueOnce(held.promise)
    await user.click(sizeButton(32))

    // The 16 × 16 result is gone the moment the size changed, and nothing is
    // exportable until the 32 × 32 one exists.
    expect(screen.queryByAltText('Wolf as 16 by 16 game art')).toBeNull()
    expect(screen.getByRole('button', { name: /download png/i })).toBeDisabled()

    held.resolve(new Blob(['png32']))
    await previewFor(32)
    expect(screen.getByRole('button', { name: /download png/i })).toBeEnabled()
  })
})

describe('copying', () => {
  it('shows the receipt only after the clipboard write fulfils', async () => {
    const held = deferred<boolean>()
    copyMock.mockReturnValueOnce(held.promise)
    const { user } = open()
    await previewFor(16)

    await user.click(screen.getByRole('button', { name: /copy for makecode/i }))
    expect(screen.queryByText(ARCADE_ART_COPIED)).toBeNull()

    held.resolve(true)
    expect(await screen.findByText(ARCADE_ART_COPIED)).toBeInTheDocument()
    // The literal it sent is the one on screen, 16 rows of it.
    const sent = copyMock.mock.calls[0][0] as string
    expect(sent.split('\n')).toHaveLength(18) // img` + 16 rows + closing `
  })

  it('offers the selectable literal when the clipboard refuses', async () => {
    copyMock.mockResolvedValueOnce(false)
    const { user } = open()
    await previewFor(16)

    await user.click(screen.getByRole('button', { name: /copy for makecode/i }))

    const field = await screen.findByLabelText(ARCADE_ART_COPY_FALLBACK_LABEL)
    expect(field).toHaveAttribute('readonly')
    expect(screen.queryByText(ARCADE_ART_COPIED)).toBeNull()

    await user.click(screen.getByRole('button', { name: /save as a text file/i }))
    expect(textBlobMock).toHaveBeenCalledTimes(1)
    expect(downloadMock.mock.calls[0][1]).toBe('wolf-arcade-16x16.txt')
  })

  /**
   * The P2 this closes: the clipboard really does hold the 16 × 16 literal, so
   * a "Copied" receipt rendered under 32 × 32 is a true sentence about the wrong
   * thing. The receipt is refused rather than relabelled.
   */
  it('refuses a receipt for a copy that completed under the PREVIOUS size', async () => {
    const held = deferred<boolean>()
    copyMock.mockReturnValueOnce(held.promise)
    const { user } = open()
    await previewFor(16)

    await user.click(screen.getByRole('button', { name: /copy for makecode/i }))
    await user.click(sizeButton(32))
    await previewFor(32)

    held.resolve(true)
    await waitFor(() => expect(copyMock).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(ARCADE_ART_COPIED)).toBeNull()
  })

  it('refuses the fallback too when a REJECTED copy completes after a size change', async () => {
    const held = deferred<boolean>()
    copyMock.mockReturnValueOnce(held.promise)
    const { user } = open()
    await previewFor(16)

    await user.click(screen.getByRole('button', { name: /copy for makecode/i }))
    await user.click(sizeButton(32))
    await previewFor(32)

    held.resolve(false)
    await waitFor(() => expect(copyMock).toHaveBeenCalledTimes(1))
    // Neither a receipt nor a failure notice: both would be claims about a tap
    // that belonged to the grid before this one.
    expect(screen.queryByText(ARCADE_ART_COPIED)).toBeNull()
    expect(screen.queryByLabelText(ARCADE_ART_COPY_FALLBACK_LABEL)).toBeNull()
  })

  it('does not copy once the session is dismissed', async () => {
    const { user, onClose } = open()
    await previewFor(16)

    await user.click(screen.getByRole('button', { name: /^close$/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: /copy for makecode/i }))

    expect(copyMock).not.toHaveBeenCalled()
  })
})

describe('when the picture cannot be read', () => {
  it('says so, and Try again re-reads it', async () => {
    loadMock.mockResolvedValueOnce({
      ok: false,
      reason: ArcadeArtLoadFailure.Unavailable,
    })
    const { user } = open()

    expect(
      await screen.findByText(arcadeArtLoadFailureMessage(ArcadeArtLoadFailure.Unavailable)),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /try again/i }))

    await previewFor(16)
    expect(loadMock).toHaveBeenCalledTimes(2)
  })

  /**
   * The spinner-for-ever case, from the dialog's side: before the effect caught,
   * a rejected loader left `loading` true with no error and no retry.
   */
  it('turns an unexpected loader REJECTION into an error with a retry', async () => {
    loadMock.mockRejectedValueOnce(new Error('boom'))
    open()

    expect(
      await screen.findByText(arcadeArtLoadFailureMessage(ArcadeArtLoadFailure.Unexpected)),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeEnabled()
  })

  it('reports a conversion that cannot produce a sprite, with no retry', async () => {
    // Every pixel clear: nothing to convert, and trying again changes nothing.
    loadMock.mockResolvedValue({
      ok: true,
      pixels: { width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4) },
    })
    open()

    expect(await screen.findByText(/completely see-through/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull()
  })

  it('reports nothing at all for a load that was cancelled', async () => {
    loadMock.mockResolvedValue({ ok: false, reason: ArcadeArtLoadFailure.Cancelled })
    open()

    await waitFor(() => expect(loadMock).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull()
    expect(screen.queryByText(/could not/i)).toBeNull()
  })

  it('drops a load that lands after the session is dismissed', async () => {
    const held = deferred<unknown>()
    loadMock.mockReturnValueOnce(held.promise)
    const { user, onClose } = open()

    await user.click(screen.getByRole('button', { name: /^close$/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
    held.resolve({ ok: true, pixels: solidPixels() })

    await waitFor(() => expect(loadMock).toHaveBeenCalledTimes(1))
    expect(screen.queryByAltText('Wolf as 16 by 16 game art')).toBeNull()
    expect(encodeMock).not.toHaveBeenCalled()
  })
})

describe('a session is replaced rather than re-pointed', () => {
  it('starts afresh when the source is re-pointed at different bytes', async () => {
    const { rerender } = open()
    await previewFor(16)

    rerender(
      <ArcadeArtDialog
        source={{ ...sticker, url: 'https://example.test/other.png' }}
        familyId="f1"
        contextKey="f1|parents|child-1"
        nonce={0}
        onClose={vi.fn()}
      />,
    )

    await waitFor(() => expect(loadMock).toHaveBeenCalledTimes(2))
    expect(loadMock.mock.calls[1][0].url).toBe('https://example.test/other.png')
  })

  it('starts afresh on a reopen of the identical picture', async () => {
    const { rerender } = open()
    await previewFor(16)

    rerender(
      <ArcadeArtDialog
        source={sticker}
        familyId="f1"
        contextKey="f1|parents|child-1"
        nonce={1}
        onClose={vi.fn()}
      />,
    )

    await waitFor(() => expect(loadMock).toHaveBeenCalledTimes(2))
  })

  it('refuses a sticker with no stored image instead of opening on nothing', async () => {
    open({ source: { ...sticker, storagePath: '' } })

    expect(await screen.findByText(/no saved picture/i)).toBeInTheDocument()
    expect(loadMock).not.toHaveBeenCalled()
  })
})
