import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import StickerLibraryTab from './StickerLibraryTab'
import type { Sticker } from '../../core/types'

// ── Mocks ─────────────────────────────────────────────────────────

vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => 'family-1',
}))

vi.mock('../../core/firebase/firestore', () => ({
  db: {},
  stickerLibraryCollection: () => ({}),
}))

const enhanceSketchMock = vi.fn()
const imageFailureRef: { current: unknown } = { current: null }
vi.mock('../../core/ai/useAI', () => ({
  useAI: () => ({ imageFailureRef, enhanceSketch: enhanceSketchMock }),
}))

const addDocMock = vi.fn()

const standalone: Sticker = {
  id: 'a',
  url: 'https://example.com/a.png',
  storagePath: 'stickers/a.png',
  label: 'Wolf',
  category: 'custom',
  tags: ['animal'],
  childProfile: 'both',
  createdAt: '2026-06-01',
}

vi.mock('firebase/firestore', () => ({
  query: (...args: unknown[]) => args,
  orderBy: () => 'orderBy',
  doc: (_col: unknown, id: string) => ({ id }),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  writeBatch: () => ({ update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) }),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  deleteDoc: vi.fn(),
  getDocs: () =>
    Promise.resolve({ docs: [{ id: standalone.id, data: () => standalone }] }),
}))

async function openMakeVersions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Edit Wolf' }))
  await user.click(await screen.findByRole('button', { name: /make more versions/i }))
}

/**
 * "+ My own look" on the "Make more versions" door (FEAT-197 / UX-177).
 *
 * The owner's report: the `space` look made the girl *out of* space when what he
 * wanted was to put her *in a space suit*. A look changes how a drawing is
 * redrawn; only this note changes what is in it.
 */
describe('StickerLibraryTab — "+ My own look" (FEAT-197)', () => {
  beforeEach(() => {
    enhanceSketchMock.mockReset()
    imageFailureRef.current = null
    enhanceSketchMock.mockResolvedValue({ url: 'https://x.test/v.png', storagePath: 'p/v.png' })
    addDocMock.mockReset()
    addDocMock.mockResolvedValue({ id: 'new-version' })
  })

  it('sends the note alongside the picked look', async () => {
    const user = userEvent.setup()
    render(<StickerLibraryTab />)
    await openMakeVersions(user)

    await user.click(screen.getByText(/my own look/i))
    await user.type(
      await screen.findByLabelText(/what should change\?/i),
      'put her in a space suit',
    )
    await user.click(screen.getByRole('button', { name: 'Make it' }))

    await waitFor(() => expect(enhanceSketchMock).toHaveBeenCalledTimes(1))
    // The look is untouched — the note is a second axis, not a fourteenth look.
    expect(enhanceSketchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customNote: 'put her in a space suit',
        transparent: true,
      }),
    )
  })

  it('sends no note key at all when nothing was typed', async () => {
    const user = userEvent.setup()
    render(<StickerLibraryTab />)
    await openMakeVersions(user)
    await user.click(screen.getByRole('button', { name: 'Make it' }))

    await waitFor(() => expect(enhanceSketchMock).toHaveBeenCalledTimes(1))
    expect('customNote' in enhanceSketchMock.mock.calls[0][0]).toBe(false)
  })

  it('routes a blocked note into the retry card, and a tap rewords the NOTE', async () => {
    // FEAT-197 × FEAT-195: the door used to have no words to reword, so it
    // showed static tips. With a note it has exactly one, and the server's
    // rewordings are rewordings of it.
    const user = userEvent.setup()
    imageFailureRef.current = {
      code: 'functions/invalid-argument',
      message: 'The sketch enhancement was blocked by the safety filter.',
      details: {
        failure: 'blocked',
        alternatives: ['in a sparkly blue ice-princess dress'],
      },
    }
    enhanceSketchMock.mockResolvedValue({ url: '', storagePath: '' })
    render(<StickerLibraryTab />)
    await openMakeVersions(user)

    await user.click(screen.getByText(/my own look/i))
    await user.type(
      await screen.findByLabelText(/what should change\?/i),
      'dress her as Elsa',
    )
    await user.click(screen.getByRole('button', { name: 'Make it' }))

    const card = await screen.findByTestId('image-retry-card')
    expect(card).toHaveTextContent(/wouldn't draw that one/i)
    const alternative = await screen.findByText('in a sparkly blue ice-princess dress')

    // Tapping one IS the retry: a NEW generation with the reworded note.
    enhanceSketchMock.mockResolvedValue({ url: 'https://x.test/v.png', storagePath: 'p/v.png' })
    await user.click(alternative)

    await waitFor(() => expect(enhanceSketchMock).toHaveBeenCalledTimes(2))
    expect(enhanceSketchMock.mock.calls[1][0]).toMatchObject({
      customNote: 'in a sparkly blue ice-princess dress',
    })
  })

  it('shows written tips, not taps, when there is no note to reword', async () => {
    const user = userEvent.setup()
    imageFailureRef.current = {
      code: 'functions/invalid-argument',
      message: 'The sketch enhancement was blocked by the safety filter.',
      details: { failure: 'blocked', alternatives: ['a friendly grey wolf'] },
    }
    enhanceSketchMock.mockResolvedValue({ url: '', storagePath: '' })
    render(<StickerLibraryTab />)
    await openMakeVersions(user)
    await user.click(screen.getByRole('button', { name: 'Make it' }))

    const card = await screen.findByTestId('image-retry-card')
    // The `Redraw` door's promise still holds: nothing tappable, because there
    // is nothing on screen the person could have worded differently.
    expect(card).toHaveTextContent(/some looks are stricter than others/i)
    expect(screen.queryByText('a friendly grey wolf')).toBeNull()
  })
})
