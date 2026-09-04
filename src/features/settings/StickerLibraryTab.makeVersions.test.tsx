import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

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
vi.mock('../../core/ai/useAI', () => ({
  useAI: () => ({ imageFailureRef: { current: null }, enhanceSketch: enhanceSketchMock }),
}))

const updateDocMock = vi.fn()
const addDocMock = vi.fn()
const deleteDocMock = vi.fn()
// The edit dialog's save commits as one batch (FEAT-160, Codex P2 on PR #1708),
// so the group can never end up with mixed names. `batchUpdateMock` records the
// same (ref, patch) pairs `updateDoc` used to; the adoption write below is still
// a direct `updateDoc`.
const batchUpdateMock = vi.fn()
const batchCommitMock = vi.fn()

// A single standalone sticker (no sourceDrawingId) — the legacy/text-made case.
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
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  writeBatch: () => ({ update: batchUpdateMock, commit: batchCommitMock }),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  getDocs: () =>
    Promise.resolve({ docs: [{ id: standalone.id, data: () => standalone }] }),
}))

// ── Tests ─────────────────────────────────────────────────────────

describe('StickerLibraryTab — make more versions (FEAT-33 slice 4)', () => {
  beforeEach(() => {
    enhanceSketchMock.mockReset()
    updateDocMock.mockReset()
    addDocMock.mockReset()
    deleteDocMock.mockReset()
    addDocMock.mockResolvedValue({ id: 'new-version' })
    updateDocMock.mockResolvedValue(undefined)
    batchUpdateMock.mockReset()
    batchCommitMock.mockReset()
    batchCommitMock.mockResolvedValue(undefined)
  })

  it('adopts a standalone sticker (non-destructive write) and links a new version', async () => {
    enhanceSketchMock.mockResolvedValue({
      url: 'https://example.com/fancy.png',
      storagePath: 'stickers/fancy.png',
    })
    const user = userEvent.setup()
    render(<StickerLibraryTab />)

    await screen.findByText('1 sticker in your library')

    await user.click(screen.getByRole('button', { name: 'Edit Wolf' }))
    await user.click(await screen.findByRole('button', { name: /make more versions/i }))

    const dialog = await screen.findByRole('dialog', { name: /make another version/i })
    await user.click(within(dialog).getByText(/Make it/i))

    await waitFor(() => expect(addDocMock).toHaveBeenCalledTimes(1))

    // Adoption: an updateDoc (NOT setDoc) stamps sourceDrawingId + isOriginal.
    expect(updateDocMock).toHaveBeenCalledTimes(1)
    const [, adoption] = updateDocMock.mock.calls[0]
    expect(adoption).toMatchObject({ isOriginal: true })
    expect(typeof (adoption as { sourceDrawingId?: string }).sourceDrawingId).toBe('string')

    // The new version is linked to the same freshly-minted group.
    const [, saved] = addDocMock.mock.calls[0] as [unknown, Sticker]
    expect(saved.sourceDrawingId).toBe((adoption as { sourceDrawingId: string }).sourceDrawingId)
    expect(saved.theme).toBeTruthy()
    expect(saved.isOriginal).toBeUndefined()
  })

  it('saves edits with a non-destructive partial write that preserves link fields', async () => {
    const user = userEvent.setup()
    render(<StickerLibraryTab />)

    await screen.findByText('1 sticker in your library')

    await user.click(screen.getByRole('button', { name: 'Edit Wolf' }))
    const editDialog = await screen.findByRole('dialog', { name: /edit sticker/i })
    // Toggle a tag and save.
    await user.click(within(editDialog).getByText('Minecraft'))
    await user.click(within(editDialog).getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(batchUpdateMock).toHaveBeenCalledTimes(1))
    const [, patch] = batchUpdateMock.mock.calls[0] as [unknown, Record<string, unknown>]
    // Only the field that actually moved is written — no whole-doc overwrite, so
    // sourceDrawingId / theme / isOriginal can never be dropped. (FEAT-160
    // narrowed this from tags+childProfile to just the changed field: an
    // unchanged "For" is not a write.)
    expect(Object.keys(patch).sort()).toEqual(['tags'])
  })
})
