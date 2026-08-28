import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import StickerLibraryTab from './StickerLibraryTab'
import type { Sticker } from '../../core/types'

// ── Mocks ─────────────────────────────────────────────────────────

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'family-1' }))
vi.mock('../../core/firebase/firestore', () => ({ stickerLibraryCollection: () => ({}) }))
vi.mock('../../core/ai/useAI', () => ({ useAI: () => ({ enhanceSketch: vi.fn() }) }))

const updateDocMock = vi.fn()

/** A standalone sticker plus a two-version drawing group. */
const standalone: Sticker = {
  id: 'solo',
  url: 'https://example.com/solo.png',
  storagePath: 'stickers/solo.png',
  label: 'Wolf',
  category: 'custom',
  tags: ['animal'],
  childProfile: 'both',
  createdAt: '2026-06-03',
}
const original: Sticker = {
  id: 'orig',
  url: 'https://example.com/orig.png',
  storagePath: 'stickers/orig.png',
  label: 'My drawing',
  category: 'custom',
  tags: ['object'],
  childProfile: 'both',
  createdAt: '2026-06-02',
  sourceDrawingId: 'd1',
  isOriginal: true,
}
const fancy: Sticker = {
  ...original,
  id: 'fancy',
  url: 'https://example.com/fancy.png',
  storagePath: 'stickers/fancy.png',
  createdAt: '2026-06-01',
  isOriginal: false,
  theme: 'fantasy',
}
const ALL = [standalone, original, fancy]

vi.mock('firebase/firestore', () => ({
  query: (...args: unknown[]) => args,
  orderBy: () => 'orderBy',
  doc: (_col: unknown, id: string) => ({ id }),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: () => Promise.resolve({ docs: ALL.map((s) => ({ id: s.id, data: () => s })) }),
}))

async function openEdit(user: ReturnType<typeof userEvent.setup>, name: string) {
  // The flat (ungrouped) render lists every version, so a group's label appears
  // more than once — the first is the group's original.
  await user.click(screen.getAllByRole('button', { name: `Edit ${name}` })[0])
  return screen.findByRole('dialog', { name: /edit sticker/i })
}

// ── Tests ─────────────────────────────────────────────────────────

describe('StickerLibraryTab — label editing (FEAT-160)', () => {
  beforeEach(() => {
    updateDocMock.mockReset()
    updateDocMock.mockResolvedValue(undefined)
  })

  it('renames a standalone sticker through the existing edit dialog', async () => {
    const user = userEvent.setup()
    render(<StickerLibraryTab />)
    await screen.findByRole('button', { name: 'Edit Wolf' })

    const dialog = await openEdit(user, 'Wolf')
    const field = within(dialog).getByLabelText('Name')
    await user.clear(field)
    await user.type(field, 'Grey wolf')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1))
    expect(updateDocMock.mock.calls[0][0]).toEqual({ id: 'solo' })
    expect(updateDocMock.mock.calls[0][1]).toEqual({ label: 'Grey wolf' })
    // The renamed label is reflected without a reload.
    expect(await screen.findByRole('button', { name: 'Edit Grey wolf' })).toBeInTheDocument()
  })

  it('a rename here is a group rename — every version of the drawing follows', async () => {
    const user = userEvent.setup()
    render(<StickerLibraryTab />)
    await screen.findAllByRole('button', { name: 'Edit My drawing' })

    const dialog = await openEdit(user, 'My drawing')
    const field = within(dialog).getByLabelText('Name')
    await user.clear(field)
    await user.type(field, 'Ender dragon')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(2))
    expect(updateDocMock.mock.calls.map((c) => (c[0] as { id: string }).id).sort()).toEqual([
      'fancy',
      'orig',
    ])
    for (const call of updateDocMock.mock.calls) {
      expect(call[1]).toEqual({ label: 'Ender dragon' })
    }
  })

  it('a no-op is not a write: saving an unchanged dialog writes nothing', async () => {
    const user = userEvent.setup()
    render(<StickerLibraryTab />)
    await screen.findByRole('button', { name: 'Edit Wolf' })

    const dialog = await openEdit(user, 'Wolf')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /edit sticker/i })).not.toBeInTheDocument(),
    )
    expect(updateDocMock).not.toHaveBeenCalled()
  })

  it('a failed save says so and keeps the dialog open with the typed text', async () => {
    updateDocMock.mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    render(<StickerLibraryTab />)
    await screen.findByRole('button', { name: 'Edit Wolf' })

    const dialog = await openEdit(user, 'Wolf')
    const field = within(dialog).getByLabelText('Name')
    await user.clear(field)
    await user.type(field, 'Grey wolf')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await within(dialog).findByText('offline')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Grey wolf')
  })

  it('will not save a blank name', async () => {
    const user = userEvent.setup()
    render(<StickerLibraryTab />)
    await screen.findByRole('button', { name: 'Edit Wolf' })

    const dialog = await openEdit(user, 'Wolf')
    await user.clear(within(dialog).getByLabelText('Name'))
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(updateDocMock).not.toHaveBeenCalled()
  })
})
