import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * One host test per door the shared retry card replaced a dead end (FEAT-195),
 * plus the cost rail on each: **a refusal spends no quota**, and tapping an
 * alternative is a NEW generation that counts as one.
 *
 * Before this run these three doors said, respectively: "Couldn't make that
 * sticker. Try describing it differently." with a Try Again that just cleared
 * the box; the same again in the in-book picker; and — in the Book Editor — two
 * written suggestions the parent had to retype by hand. None of the three could
 * tell a refused prompt from a rate limit, and none offered anything to tap.
 */

const { generateImageMock, imageFailureRef, addDocMock } = vi.hoisted(() => ({
  generateImageMock: vi.fn(),
  imageFailureRef: { current: null as unknown },
  addDocMock: vi.fn(),
}))

vi.mock('../../../core/ai/useAI', () => ({
  useAI: () => ({
    generateImage: generateImageMock,
    imageFailureRef,
    loading: false,
    error: null,
  }),
}))

vi.mock('../../../core/firebase/firestore', () => ({
  stickerLibraryCollection: () => ({}),
}))

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDocMock(...args),
  doc: (_col: unknown, id: string) => ({ id }),
  setDoc: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  orderBy: vi.fn(),
  query: vi.fn(),
}))

import MakeStickerDialog from '../MakeStickerDialog'
import StickerPicker from '../StickerPicker'

/** A refusal exactly as `generateImage` rejects one, with three rewordings. */
const BLOCKED_WITH_ALTERNATIVES = {
  code: 'functions/invalid-argument',
  message: "That prompt was blocked by the image generator's safety filter.",
  details: {
    failure: 'blocked',
    alternatives: [
      'a stocky man in red overalls with a big mustache',
      'a cheerful plumber in a red cap',
      'a hero in blue dungarees, jumping',
    ],
  },
}

/** A rate limit — nothing a rewording would fix. */
const BUSY = {
  code: 'functions/resource-exhausted',
  message: 'Image generation is busy right now. Wait a moment and try again.',
  details: { failure: 'busy' },
}

beforeEach(() => {
  generateImageMock.mockReset()
  imageFailureRef.current = null
  addDocMock.mockReset()
  addDocMock.mockResolvedValue({ id: 'new-1' })
})

describe('MakeStickerDialog — a refused sticker offers a way forward', () => {
  it('shows the three alternatives as taps, and tapping one is the new generation', async () => {
    const user = userEvent.setup()
    const recordGeneration = vi.fn().mockResolvedValue(undefined)
    generateImageMock.mockImplementation(async () => {
      imageFailureRef.current = BLOCKED_WITH_ALTERNATIVES
      return null
    })

    render(
      <MakeStickerDialog
        open
        onClose={() => {}}
        familyId="f1"
        recordGeneration={recordGeneration}
      />,
    )

    await user.type(screen.getByLabelText('Describe your sticker'), 'Mario')
    await user.click(screen.getByRole('button', { name: 'Make it' }))

    // The failure is NAMED, not "couldn't make that sticker".
    expect(await screen.findByText(/wouldn't draw that one/i)).toBeInTheDocument()
    // A refusal made no picture, so it costs nothing.
    expect(recordGeneration).not.toHaveBeenCalled()

    // Now the picture arrives for the reworded ask.
    generateImageMock.mockImplementation(async () => {
      imageFailureRef.current = null
      return { url: 'https://x.test/a.png', storagePath: 'p/a.png' }
    })
    await user.click(
      screen.getByRole('button', { name: 'a cheerful plumber in a red cap' }),
    )

    await waitFor(() => expect(generateImageMock).toHaveBeenCalledTimes(2))
    // Sent verbatim — nobody retyped anything.
    expect(generateImageMock.mock.calls[1][0]).toMatchObject({
      prompt: 'a cheerful plumber in a red cap',
    })
    // A tap is a new picture and counts as one.
    await waitFor(() => expect(recordGeneration).toHaveBeenCalledTimes(1))
  })

  it('never spends the cap on an alternative — the guard is the same one', async () => {
    // At the cap `handleGenerate` refuses before the call, so a refusal cannot
    // become a route around the week's budget. (The card is unreachable at the
    // cap because the paid control is not offered, which is the point.)
    const recordGeneration = vi.fn().mockResolvedValue(undefined)
    render(
      <MakeStickerDialog
        open
        onClose={() => {}}
        familyId="f1"
        capReached
        recordGeneration={recordGeneration}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Make it' })).toBeNull()
    expect(generateImageMock).not.toHaveBeenCalled()
  })

  it('offers no rewordings for a rate limit — that is a wait, not a rewrite', async () => {
    const user = userEvent.setup()
    generateImageMock.mockImplementation(async () => {
      imageFailureRef.current = BUSY
      return null
    })

    render(<MakeStickerDialog open onClose={() => {}} familyId="f1" />)
    await user.type(screen.getByLabelText('Describe your sticker'), 'a dragon')
    await user.click(screen.getByRole('button', { name: 'Make it' }))

    expect(await screen.findByText(/busy right now/i)).toBeInTheDocument()
    expect(screen.queryByText(/try one of these/i)).toBeNull()
  })
})

describe('StickerPicker — the in-book door tells the same truth', () => {
  it('names the refusal and offers the server’s rewordings as taps', async () => {
    const user = userEvent.setup()
    generateImageMock.mockImplementation(async () => {
      imageFailureRef.current = BLOCKED_WITH_ALTERNATIVES
      return null
    })

    render(
      <StickerPicker
        open
        onClose={() => {}}
        onSelectSticker={() => {}}
        familyId="f1"
      />,
    )

    await user.click(await screen.findByRole('button', { name: 'Make a sticker' }))
    await user.type(screen.getByLabelText('Describe your sticker'), 'Mario')
    await user.click(screen.getByRole('button', { name: 'Make it' }))

    expect(await screen.findByText(/wouldn't draw that one/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'a cheerful plumber in a red cap' }),
    ).toBeInTheDocument()
  })
})
