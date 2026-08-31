import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Sticker } from '../../../core/types'
import { StickerCategory } from '../../../core/types/enums'
import type { DrawingGroup } from '../stickerGrouping'

const { enhanceSketchMock, addDocMock } = vi.hoisted(() => ({
  enhanceSketchMock: vi.fn(),
  addDocMock: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  writeBatch: vi.fn(() => ({ update: vi.fn(), commit: vi.fn() })),
  deleteDoc: vi.fn(),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  doc: vi.fn((_col: unknown, id: string) => ({ id })),
  collection: vi.fn(),
}))

vi.mock('../../../core/firebase/firestore', () => ({
  db: {},
  stickerLibraryCollection: vi.fn(() => ({})),
}))

vi.mock('../../../core/ai/useAI', () => ({
  useAI: () => ({ enhanceSketch: enhanceSketchMock }),
}))

import DrawingGroupCard from '../DrawingGroupCard'

const CAP_MESSAGE = /that's a lot of art today/i

function sticker(over: Partial<Sticker> & { id: string }): Sticker {
  return {
    url: 'https://example.test/s.png',
    storagePath: 'families/f1/stickers/s.png',
    label: 'My drawing',
    category: StickerCategory.Custom,
    createdAt: '2026-08-01T00:00:00.000Z',
    tags: ['object'],
    childProfile: 'both',
    sourceDrawingId: 'd1',
    ...over,
  }
}

function makeGroup(): DrawingGroup {
  const original = sticker({ id: 'a', isOriginal: true })
  return { sourceDrawingId: 'd1', representative: original, versions: [original] }
}

async function openPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /add version/i }))
}

describe('DrawingGroupCard — daily art cap (FEAT-165 / UX-95)', () => {
  beforeEach(() => {
    enhanceSketchMock.mockReset()
    enhanceSketchMock.mockResolvedValue({ url: 'https://x.test/v.png', storagePath: 'p/v.png' })
    addDocMock.mockReset()
    addDocMock.mockResolvedValue({ id: 'v1' })
  })

  it('offers the nudge instead of "Make it" once the kid is at the cap, and spends nothing', async () => {
    const user = userEvent.setup()
    const recordGeneration = vi.fn().mockResolvedValue(undefined)
    render(
      <DrawingGroupCard
        group={makeGroup()}
        familyId="f1"
        onChanged={() => {}}
        capReached
        recordGeneration={recordGeneration}
      />,
    )

    await openPicker(user)

    expect(await screen.findByText(CAP_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make it' })).toBeNull()
    expect(enhanceSketchMock).not.toHaveBeenCalled()
    expect(recordGeneration).not.toHaveBeenCalled()
  })

  it('counts each new version — "add another" is another paid call', async () => {
    const user = userEvent.setup()
    const recordGeneration = vi.fn().mockResolvedValue(undefined)
    render(
      <DrawingGroupCard
        group={makeGroup()}
        familyId="f1"
        onChanged={() => {}}
        recordGeneration={recordGeneration}
      />,
    )

    await openPicker(user)
    await user.click(screen.getByRole('button', { name: 'Make it' }))

    await waitFor(() => expect(enhanceSketchMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(recordGeneration).toHaveBeenCalledTimes(1))
  })

  it('does not count a generation that produced no usable image', async () => {
    const user = userEvent.setup()
    const recordGeneration = vi.fn().mockResolvedValue(undefined)
    enhanceSketchMock.mockResolvedValue({ url: '', storagePath: '' })
    render(
      <DrawingGroupCard
        group={makeGroup()}
        familyId="f1"
        onChanged={() => {}}
        recordGeneration={recordGeneration}
      />,
    )

    await openPicker(user)
    await user.click(screen.getByRole('button', { name: 'Make it' }))

    await waitFor(() => expect(enhanceSketchMock).toHaveBeenCalledTimes(1))
    expect(recordGeneration).not.toHaveBeenCalled()
  })

  it('fails open: a counter write that rejects still keeps the new version', async () => {
    const user = userEvent.setup()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onChanged = vi.fn()
    const recordGeneration = vi.fn().mockRejectedValue(new Error('offline'))
    render(
      <DrawingGroupCard
        group={makeGroup()}
        familyId="f1"
        onChanged={onChanged}
        recordGeneration={recordGeneration}
      />,
    )

    await openPicker(user)
    await user.click(screen.getByRole('button', { name: 'Make it' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('offline')).toBeNull()
    errorSpy.mockRestore()
  })

  it('never waits on the counter: a write that hangs still closes the picker and refreshes the card', async () => {
    // FEAT-167. Failing open cannot mean "the counter may not throw" — a
    // Firestore write resolves only on server ack, so offline it stays *pending*
    // rather than rejecting, and an awaited counter never settles at all.
    // Awaited (FEAT-165's shape), this door's three following lines were
    // unreachable: the version was generated, paid for and saved, and the kid
    // was left staring at "Making..." over a picker that would not close and a
    // card that never showed the thing they made.
    const user = userEvent.setup()
    const onChanged = vi.fn()
    const recordGeneration = vi.fn().mockReturnValue(new Promise<void>(() => {}))
    render(
      <DrawingGroupCard
        group={makeGroup()}
        familyId="f1"
        onChanged={onChanged}
        recordGeneration={recordGeneration}
      />,
    )

    await openPicker(user)
    await user.click(screen.getByRole('button', { name: 'Make it' }))

    // The card refreshes...
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
    // ...the picker closes...
    await waitFor(() => expect(screen.queryByText('Make another version')).toBeNull())
    // ...and the busy flag cleared, so the door is live again rather than stuck
    // on "Making...".
    await openPicker(user)
    const makeIt = await screen.findByRole('button', { name: 'Make it' })
    expect(makeIt).toBeEnabled()
    expect(screen.queryByRole('button', { name: /making\.\.\./i })).toBeNull()
    // The counter was still asked — this refuses to wait, it does not skip.
    expect(recordGeneration).toHaveBeenCalledTimes(1)
  })
})
