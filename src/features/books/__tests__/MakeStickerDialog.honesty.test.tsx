import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { generateImageMock, addDocMock, setDocMock } = vi.hoisted(() => ({
  generateImageMock: vi.fn(),
  addDocMock: vi.fn(),
  setDocMock: vi.fn(),
}))

vi.mock('../../../core/ai/useAI', () => ({
  useAI: () => ({ imageFailureRef: { current: null }, generateImage: generateImageMock, loading: false, error: null }),
}))

vi.mock('../../../core/firebase/firestore', () => ({ stickerLibraryCollection: () => ({}) }))

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDocMock(...args),
  doc: (_col: unknown, id: string) => ({ id }),
  setDoc: (...args: unknown[]) => setDocMock(...args),
}))

import MakeStickerDialog from '../MakeStickerDialog'

/** Make a sticker and accept it, landing on the tagging step. */
async function reachTaggingStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/describe your sticker/i), 'a green dragon')
  await user.click(screen.getByRole('button', { name: 'Make it' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Use it' })).toBeTruthy())
  await user.click(screen.getByRole('button', { name: 'Use it' }))
}

beforeEach(() => {
  generateImageMock.mockReset()
  generateImageMock.mockResolvedValue({ url: 'https://x.test/a.png', storagePath: 'p/a.png' })
  addDocMock.mockReset().mockResolvedValue({ id: 'new-1' })
  setDocMock.mockReset().mockResolvedValue(undefined)
})

// UX-92 — the sticker is already in the library by the time the tagging screen
// opens: "Use This" wrote it. The screen said "What kind of sticker is this?"
// and its one button said "Save Sticker!" over a doc that already existed, so a
// backdrop-dismiss left it saved with auto tags and no sign either way.

describe('UX-92 — the tagging step does not pretend to be the save', () => {
  it('says it is tagging, not saving', async () => {
    const user = userEvent.setup()
    render(<MakeStickerDialog open onClose={() => {}} familyId="f1" />)
    await reachTaggingStep(user)

    expect(screen.getByText('Tag your sticker')).toBeTruthy()
    expect(screen.queryByText(/what kind of sticker is this/i)).toBeNull()
  })

  it('finishes with Done, not a second save verb', async () => {
    const user = userEvent.setup()
    render(<MakeStickerDialog open onClose={() => {}} familyId="f1" />)
    await reachTaggingStep(user)

    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /save sticker/i })).toBeNull()
  })
})

// UX-93 — both writes in this flow reported nothing when they failed:
// `handleUseGenerated` was `try … finally` with no `catch` (an unhandled
// rejection, a silent dialog) and `handleConfirmTagging` had `catch {}`
// followed by a close.

describe('UX-93 — a failed write says so and keeps the dialog open', () => {
  it('names a failed library write and leaves the picture on screen', async () => {
    const user = userEvent.setup()
    addDocMock.mockRejectedValue(new Error('permission-denied'))
    render(<MakeStickerDialog open onClose={() => {}} familyId="f1" />)

    await user.type(screen.getByLabelText(/describe your sticker/i), 'a green dragon')
    await user.click(screen.getByRole('button', { name: 'Make it' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Use it' })).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Use it' }))

    await waitFor(() => {
      expect(screen.getByText(/didn't reach your library/i)).toBeTruthy()
    })
    // Still on the preview: "Use it" is the way forward, so it is still there.
    expect(screen.getByRole('button', { name: 'Use it' })).toBeTruthy()
    expect(screen.queryByText('Tag your sticker')).toBeNull()
  })

  it('names a failed tag write, stays open, and does not claim the sticker is gone', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    setDocMock.mockRejectedValue(new Error('unavailable'))
    render(<MakeStickerDialog open onClose={onClose} familyId="f1" />)
    await reachTaggingStep(user)

    await user.click(screen.getByRole('button', { name: 'Done' }))

    await waitFor(() => {
      expect(screen.getByText(/tags didn't save/i)).toBeTruthy()
    })
    // The sticker itself IS in the library — the message says so, and the
    // dialog stays open rather than vanishing over a swallowed failure.
    expect(screen.getByText(/is in your library/i)).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
  })

  it('still closes cleanly when both writes succeed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<MakeStickerDialog open onClose={onClose} familyId="f1" />)
    await reachTaggingStep(user)

    await user.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(screen.queryByText(/didn't save/i)).toBeNull()
  })
})
