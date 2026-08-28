import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import StickerLibraryTab from './StickerLibraryTab'
import type { Sticker } from '../../core/types'

// ── Mocks ─────────────────────────────────────────────────────────

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'family-1' }))
vi.mock('../../core/firebase/firestore', () => ({ db: {}, stickerLibraryCollection: () => ({}) }))
const enhanceSketchMock = vi.fn()
vi.mock('../../core/ai/useAI', () => ({ useAI: () => ({ enhanceSketch: enhanceSketchMock }) }))

const generateStickerVersionMock = vi.fn()
vi.mock('../books/generateStickerVersion', () => ({
  generateStickerVersion: (...args: unknown[]) => generateStickerVersionMock(...args),
}))

// A rename commits as ONE batch (Codex P2, PR #1708); the spies record the
// batched updates so "which docs moved" stays directly assertable.
const updateDocMock = vi.fn()
const commitMock = vi.fn()
const writeBatchMock = vi.fn((db: unknown) => {
  void db
  return { update: updateDocMock, commit: commitMock }
})

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
  // Per-version "For" — this is what a child filter can split a group on.
  childProfile: 'lincoln',
}
const ALL = [standalone, original, fancy]

vi.mock('firebase/firestore', () => ({
  query: (...args: unknown[]) => args,
  orderBy: () => 'orderBy',
  doc: (_col: unknown, id: string) => ({ id }),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  writeBatch: (db: unknown) => writeBatchMock(db),
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
    commitMock.mockReset()
    commitMock.mockResolvedValue(undefined)
    writeBatchMock.mockClear()
    generateStickerVersionMock.mockReset()
    generateStickerVersionMock.mockResolvedValue({ ok: true })
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
    // All-or-nothing, so a partial fan-out can never leave mixed names.
    expect(writeBatchMock).toHaveBeenCalledTimes(1)
    expect(commitMock).toHaveBeenCalledTimes(1)
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
    commitMock.mockRejectedValue(new Error('offline'))
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

  it('a name typed here is committed before a version is generated, and stamps it', async () => {
    const user = userEvent.setup()
    render(<StickerLibraryTab />)
    await screen.findByRole('button', { name: 'Edit Wolf' })

    const dialog = await openEdit(user, 'Wolf')
    const field = within(dialog).getByLabelText('Name')
    await user.clear(field)
    await user.type(field, 'Grey wolf')
    // Straight to generation without tapping Save — the rename must not be lost.
    await user.click(within(dialog).getByRole('button', { name: /make more versions/i }))
    const picker = await screen.findByRole('dialog', { name: /make another version/i })
    await user.click(within(picker).getByRole('button', { name: /make it/i }))

    await waitFor(() => expect(generateStickerVersionMock).toHaveBeenCalledTimes(1))
    // The typed name was persisted first...
    expect(commitMock).toHaveBeenCalledTimes(1)
    expect(updateDocMock.mock.calls[0][1]).toEqual({ label: 'Grey wolf' })
    // ...and the new version carries it, not the stale one.
    expect(generateStickerVersionMock.mock.calls[0][0]).toMatchObject({ label: 'Grey wolf' })
  })

  it('a failed pre-generation save stops the generation and says so', async () => {
    commitMock.mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    render(<StickerLibraryTab />)
    await screen.findByRole('button', { name: 'Edit Wolf' })

    const dialog = await openEdit(user, 'Wolf')
    const field = within(dialog).getByLabelText('Name')
    await user.clear(field)
    await user.type(field, 'Grey wolf')
    await user.click(within(dialog).getByRole('button', { name: /make more versions/i }))
    const picker = await screen.findByRole('dialog', { name: /make another version/i })
    await user.click(within(picker).getByRole('button', { name: /make it/i }))

    expect(await within(dialog).findByText('offline')).toBeInTheDocument()
    // No paid generation on top of a rename that did not land.
    expect(generateStickerVersionMock).not.toHaveBeenCalled()
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Grey wolf')
  })

  it('a group rename from a FILTERED library still covers the hidden versions', async () => {
    // `fancy` is marked for Lincoln only, so the "For London" filter hides it
    // from the card — but it is still part of the drawing, and the rename
    // promises one name for every version.
    const user = userEvent.setup()
    render(<StickerLibraryTab groupByDrawing childProfileFilter="london" />)
    await user.click(await screen.findByRole('button', { name: 'Rename drawing' }))
    const field = screen.getByLabelText('Drawing name')
    await user.clear(field)
    await user.type(field, 'Ender dragon')
    await user.click(screen.getByRole('button', { name: 'Save name' }))

    await waitFor(() => expect(commitMock).toHaveBeenCalledTimes(1))
    expect(updateDocMock.mock.calls.map((c) => c[0].id).sort()).toEqual(['fancy', 'orig'])
  })
})
