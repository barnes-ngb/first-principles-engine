import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The fourth paid door on the Stickers page (FEAT-166 / UX-95): "Make it fancy"
// inside the From a Drawing flow is a real `enhanceSketch` call, and it is the
// one door that does not route through `generateStickerVersion.ts` — which is
// why FEAT-165 capped three and left this one open. These probes hold the same
// four rules the other doors keep: refuse before the spend, count only a real
// image, fail open on the counter, and leave every free control working.
const { enhanceSketchMock, uploadBytesMock, addDocMock, cleanSketchMock, imageFailureRef } =
  vi.hoisted(() => ({
    enhanceSketchMock: vi.fn(),
    uploadBytesMock: vi.fn(),
    addDocMock: vi.fn(),
    cleanSketchMock: vi.fn(),
    imageFailureRef: { current: null as unknown },
  }))

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDocMock(...args),
  collection: vi.fn(),
}))

vi.mock('firebase/storage', () => ({
  ref: vi.fn(() => ({})),
  uploadBytes: (...args: unknown[]) => uploadBytesMock(...args),
  getDownloadURL: vi.fn(async () => 'https://example.test/original.png'),
}))

vi.mock('../../../core/firebase/firestore', () => ({
  stickerLibraryCollection: vi.fn(() => ({})),
}))

vi.mock('../../../core/firebase/storage', () => ({ storage: {} }))

vi.mock('../../../core/ai/useAI', () => ({
  useAI: () => ({ imageFailureRef, enhanceSketch: enhanceSketchMock }),
}))

// The real cleaner is canvas work; the flow under test starts after it.
vi.mock('../cleanSketch', () => ({
  cleanSketchBackground: (...args: unknown[]) => cleanSketchMock(...args),
  DEFAULT_BORDER_INSET_FRACTION: 0.04,
  WHOLE_IMAGE_BORDER_INSET_FRACTION: 0.08,
}))

vi.mock('../SketchCropStage', () => ({ default: () => <div data-testid="crop-stage" /> }))

import SketchScanner from '../SketchScanner'
import { ImageRetryDoor, blockedTips } from '../imageGenerationFailure'

const CAP_MESSAGE = /that's a lot of art this week/i

/** Walk the dialog from capture to the Fancy preview tab. */
async function reachFancyTab(user: ReturnType<typeof userEvent.setup>) {
  const input = document.querySelector(
    'input[type="file"]:not([capture])',
  ) as HTMLInputElement
  await user.upload(input, new File(['drawing'], 'drawing.png', { type: 'image/png' }))
  await user.click(await screen.findByRole('button', { name: /use the whole picture/i }))
  await user.click(await screen.findByRole('tab', { name: /fancy/i }))
}

function renderScanner(props: Partial<React.ComponentProps<typeof SketchScanner>> = {}) {
  return render(
    <SketchScanner open onClose={() => {}} familyId="f1" childName="Lincoln" {...props} />,
  )
}

describe('SketchScanner — weekly art cap on "Make it fancy" (FEAT-166 / UX-95)', () => {
  beforeEach(() => {
    enhanceSketchMock.mockReset()
    imageFailureRef.current = null
    enhanceSketchMock.mockResolvedValue({
      url: 'https://example.test/fancy.png',
      storagePath: 'families/f1/fancy.png',
    })
    uploadBytesMock.mockReset()
    uploadBytesMock.mockResolvedValue({ ref: {} })
    addDocMock.mockReset()
    addDocMock.mockResolvedValue({ id: 's1' })
    cleanSketchMock.mockReset()
    cleanSketchMock.mockImplementation(
      async () => new File(['cleaned'], 'cleaned.png', { type: 'image/png' }),
    )
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    })
  })

  it('offers the nudge instead of "Make it fancy" at the cap — no upload, no paid call', async () => {
    const user = userEvent.setup()
    const recordGeneration = vi.fn().mockResolvedValue(undefined)
    renderScanner({ capReached: true, recordGeneration })

    await reachFancyTab(user)

    expect(await screen.findByText(CAP_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /make it fancy/i })).toBeNull()
    expect(enhanceSketchMock).not.toHaveBeenCalled()
    // `ensureOriginalUploaded` sits behind the guard, so a capped tap does not
    // even pay the Storage write.
    expect(uploadBytesMock).not.toHaveBeenCalled()
    expect(recordGeneration).not.toHaveBeenCalled()
  })

  it('counts the transform once a real image comes back', async () => {
    const user = userEvent.setup()
    const recordGeneration = vi.fn().mockResolvedValue(undefined)
    renderScanner({ recordGeneration })

    await reachFancyTab(user)
    await user.click(await screen.findByRole('button', { name: /make it fancy/i }))

    await waitFor(() => expect(enhanceSketchMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(recordGeneration).toHaveBeenCalledTimes(1))
  })

  it('counts a redo too — "try another style" is another real call', async () => {
    const user = userEvent.setup()
    const recordGeneration = vi.fn().mockResolvedValue(undefined)
    renderScanner({ recordGeneration })

    await reachFancyTab(user)
    await user.click(await screen.findByRole('button', { name: /make it fancy/i }))
    await waitFor(() => expect(recordGeneration).toHaveBeenCalledTimes(1))

    await user.click(await screen.findByRole('button', { name: /make it with this style/i }))
    await waitFor(() => expect(enhanceSketchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(recordGeneration).toHaveBeenCalledTimes(2))
  })

  it('closes the redo door at the cap as well, keeping the fancy version visible', async () => {
    const user = userEvent.setup()
    const recordGeneration = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderScanner({ recordGeneration })

    await reachFancyTab(user)
    await user.click(await screen.findByRole('button', { name: /make it fancy/i }))
    await waitFor(() => expect(screen.getByAltText('Fancy version')).toBeInTheDocument())

    rerender(
      <SketchScanner
        open
        onClose={() => {}}
        familyId="f1"
        childName="Lincoln"
        capReached
        recordGeneration={recordGeneration}
      />,
    )

    expect(await screen.findByText(CAP_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /make it with this style/i })).toBeNull()
    expect(screen.getByAltText('Fancy version')).toBeInTheDocument()
  })

  it('does not count a transform that returned no image', async () => {
    const user = userEvent.setup()
    const recordGeneration = vi.fn().mockResolvedValue(undefined)
    enhanceSketchMock.mockResolvedValue({ url: '', storagePath: '' })
    renderScanner({ recordGeneration })

    await reachFancyTab(user)
    await user.click(await screen.findByRole('button', { name: /make it fancy/i }))

    await waitFor(() => expect(enhanceSketchMock).toHaveBeenCalledTimes(1))
    expect(recordGeneration).not.toHaveBeenCalled()
  })

  it('names WHICH failure it was, and a refusal still spends nothing (FEAT-195)', async () => {
    // This door said "Couldn't use that picture. Please try again." for a
    // refused prompt, a rate limit, a missing API key and a dropped connection
    // alike. `useAI.enhanceSketch` swallows the rejection and returns null, so
    // the classified failure comes off the ref rather than a message string.
    const user = userEvent.setup()
    const recordGeneration = vi.fn().mockResolvedValue(undefined)
    imageFailureRef.current = {
      code: 'functions/invalid-argument',
      message: 'The sketch enhancement was blocked by the safety filter.',
      details: { failure: 'blocked' },
    }
    enhanceSketchMock.mockResolvedValue(null)
    renderScanner({ recordGeneration })

    await reachFancyTab(user)
    await user.click(await screen.findByRole('button', { name: /make it fancy/i }))

    expect(await screen.findByText(/wouldn't draw that one/i)).toBeInTheDocument()
    // No picture was made, so nothing is charged to the week.
    expect(recordGeneration).not.toHaveBeenCalled()
    // The written tips stand in: this door sends no caption, so the server has
    // no words of the kid's to reword. And they are the tips for THIS door —
    // there is no prompt field here, so neither may advise rewording (Codex P2,
    // PR #1768; the first cut showed the Book Editor's scene advice everywhere).
    for (const tip of blockedTips(ImageRetryDoor.Redraw, 'parent')) {
      expect(screen.getByText(tip)).toBeInTheDocument()
    }
    expect(screen.queryByText(/describe the world instead of characters/i)).toBeNull()
  })

  it('tells a rate limit apart from a refusal — different failure, different words', async () => {
    const user = userEvent.setup()
    imageFailureRef.current = {
      code: 'functions/resource-exhausted',
      message: 'Image enhancement is busy right now.',
      details: { failure: 'busy' },
    }
    enhanceSketchMock.mockResolvedValue(null)
    renderScanner({})

    await reachFancyTab(user)
    await user.click(await screen.findByRole('button', { name: /make it fancy/i }))

    expect(await screen.findByText(/busy right now/i)).toBeInTheDocument()
    expect(screen.queryByText(/try one of these/i)).toBeNull()
  })

  it('does not count a transform that threw', async () => {
    const user = userEvent.setup()
    const recordGeneration = vi.fn().mockResolvedValue(undefined)
    enhanceSketchMock.mockRejectedValue(new Error('model unavailable'))
    renderScanner({ recordGeneration })

    await reachFancyTab(user)
    await user.click(await screen.findByRole('button', { name: /make it fancy/i }))

    await waitFor(() => expect(screen.getByText('model unavailable')).toBeInTheDocument())
    expect(recordGeneration).not.toHaveBeenCalled()
  })

  it('fails open: a counter write that rejects still keeps the fancy version', async () => {
    const user = userEvent.setup()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const recordGeneration = vi.fn().mockRejectedValue(new Error('offline'))
    renderScanner({ recordGeneration })

    await reachFancyTab(user)
    await user.click(await screen.findByRole('button', { name: /make it fancy/i }))

    await waitFor(() => expect(screen.getByAltText('Fancy version')).toBeInTheDocument())
    expect(screen.queryByText('offline')).toBeNull()
    errorSpy.mockRestore()
  })

  it('never blocks the art on the counter: a write that hangs still reveals the fancy version', async () => {
    // Codex P2 (PR #1717): `recordStickerArtGeneration` swallows a *rejection*,
    // but it cannot bound a promise that simply never settles — and Firestore's
    // write promise resolves only on server ack, so offline it stays pending
    // rather than rejecting. Awaited, that left `enhancing` true forever: the
    // spinner covered an image the kid had already paid for and could not save.
    // Counting is fire-and-forget for exactly this reason.
    const user = userEvent.setup()
    const recordGeneration = vi.fn().mockReturnValue(new Promise<void>(() => {}))
    renderScanner({ recordGeneration })

    await reachFancyTab(user)
    await user.click(await screen.findByRole('button', { name: /make it fancy/i }))

    await waitFor(() => expect(screen.getByAltText('Fancy version')).toBeInTheDocument())
    expect(screen.queryByText(/making it fancy/i)).toBeNull()
    // The counter was still asked — under-counting is the safe direction, but
    // this path does not under-count, it just refuses to wait.
    expect(recordGeneration).toHaveBeenCalledTimes(1)
    // And the paid control is live again, so a redo is not wedged either.
    expect(await screen.findByRole('button', { name: /make it with this style/i })).toBeInTheDocument()
  })

  it('leaves the free controls working at the cap — the cleaned sticker still saves', async () => {
    const user = userEvent.setup()
    renderScanner({ capReached: true, recordGeneration: vi.fn() })

    await reachFancyTab(user)
    expect(await screen.findByText(CAP_MESSAGE)).toBeInTheDocument()

    // Cleaning, the preview tabs and saving are free and must not be gated.
    await user.click(screen.getByRole('tab', { name: /^cleaned$/i }))
    await user.click(await screen.findByRole('button', { name: /save cleaned/i }))

    await waitFor(() => expect(addDocMock).toHaveBeenCalledTimes(1))
    expect(enhanceSketchMock).not.toHaveBeenCalled()
  })

  it('stays uncapped by default, so other mounts of the dialog are unchanged', async () => {
    const user = userEvent.setup()
    renderScanner()

    await reachFancyTab(user)
    await user.click(await screen.findByRole('button', { name: /make it fancy/i }))

    await waitFor(() => expect(enhanceSketchMock).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(CAP_MESSAGE)).toBeNull()
  })
})
