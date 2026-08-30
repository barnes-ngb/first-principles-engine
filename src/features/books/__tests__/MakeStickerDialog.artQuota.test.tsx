import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { generateImageMock, addDocMock } = vi.hoisted(() => ({
  generateImageMock: vi.fn(),
  addDocMock: vi.fn(),
}))

vi.mock('../../../core/ai/useAI', () => ({
  useAI: () => ({ generateImage: generateImageMock, loading: false, error: null }),
}))

vi.mock('../../../core/firebase/firestore', () => ({
  stickerLibraryCollection: () => ({}),
}))

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDocMock(...args),
  doc: (_col: unknown, id: string) => ({ id }),
  setDoc: vi.fn(),
}))

import MakeStickerDialog from '../MakeStickerDialog'

const CAP_MESSAGE = /that's a lot of art today/i

describe('MakeStickerDialog — daily art cap (FEAT-165 / UX-95)', () => {
  beforeEach(() => {
    generateImageMock.mockReset()
    generateImageMock.mockResolvedValue({ url: 'https://x.test/a.png', storagePath: 'p/a.png' })
    addDocMock.mockReset()
    addDocMock.mockResolvedValue({ id: 'new-1' })
  })

  it('spends nothing once the kid has hit the cap, and nudges a grown-up instead', async () => {
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

    // The paid control is simply not offered, and the copy is a nudge — not an
    // error, not a lock.
    expect(screen.queryByRole('button', { name: 'Create!' })).toBeNull()
    expect(screen.getByText(CAP_MESSAGE)).toBeInTheDocument()
    expect(generateImageMock).not.toHaveBeenCalled()
    expect(recordGeneration).not.toHaveBeenCalled()
  })

  it('counts a generation that actually produced an image', async () => {
    const user = userEvent.setup()
    const recordGeneration = vi.fn().mockResolvedValue(undefined)
    render(
      <MakeStickerDialog
        open
        onClose={() => {}}
        familyId="f1"
        recordGeneration={recordGeneration}
      />,
    )

    await user.type(screen.getByLabelText('Describe your sticker'), 'a dragon')
    await user.click(screen.getByRole('button', { name: 'Create!' }))

    await waitFor(() => expect(generateImageMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(recordGeneration).toHaveBeenCalledTimes(1))
  })

  it('does not count a call that came back with no image', async () => {
    const user = userEvent.setup()
    const recordGeneration = vi.fn().mockResolvedValue(undefined)
    generateImageMock.mockResolvedValue(null)
    render(
      <MakeStickerDialog
        open
        onClose={() => {}}
        familyId="f1"
        recordGeneration={recordGeneration}
      />,
    )

    await user.type(screen.getByLabelText('Describe your sticker'), 'a dragon')
    await user.click(screen.getByRole('button', { name: 'Create!' }))

    await waitFor(() => expect(generateImageMock).toHaveBeenCalledTimes(1))
    expect(recordGeneration).not.toHaveBeenCalled()
  })

  it('is unchanged for an uncapped caller that passes no quota props', async () => {
    const user = userEvent.setup()
    render(<MakeStickerDialog open onClose={() => {}} familyId="f1" />)

    expect(screen.queryByText(CAP_MESSAGE)).toBeNull()
    await user.type(screen.getByLabelText('Describe your sticker'), 'a dragon')
    await user.click(screen.getByRole('button', { name: 'Create!' }))

    await waitFor(() => expect(generateImageMock).toHaveBeenCalledTimes(1))
  })
})
