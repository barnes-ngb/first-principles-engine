import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import StickerLibraryTab from './StickerLibraryTab'
import type { Sticker } from '../../core/types'

/**
 * The library preview's door into the saved-version editor
 * (SAVED-STICKER-EDITOR-003).
 *
 * Two things are asserted here that the dialog's own tests cannot: the door is
 * absent on a host that did not ask for it — this tab still renders in Settings
 * on default props — and when it does open, it opens on the version that was
 * actually tapped, including a group version that is not the card's
 * representative.
 */

// ── Mocks ─────────────────────────────────────────────────────────

vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => 'family-1',
}))

vi.mock('../../core/firebase/firestore', () => ({
  db: {},
  stickerLibraryCollection: (familyId: string) => ({ familyId }),
}))

const enhanceSketchMock = vi.fn()
vi.mock('../../core/ai/useAI', () => ({
  useAI: () => ({ enhanceSketch: enhanceSketchMock, imageFailureRef: { current: null } }),
}))

const original: Sticker = {
  id: 'orig',
  url: 'https://example.test/orig.png',
  storagePath: 'families/family-1/sketches/orig.png',
  label: 'Wolf',
  category: 'custom',
  tags: ['animal'],
  childProfile: 'both',
  sourceDrawingId: 'g1',
  isOriginal: true,
  createdAt: '2026-06-01',
}

const fantasyVersion: Sticker = {
  ...original,
  id: 'v-fantasy',
  url: 'https://example.test/fantasy.png',
  storagePath: 'families/family-1/sketches/fantasy.png',
  isOriginal: undefined,
  theme: 'fantasy',
  createdAt: '2026-06-02',
}

/** The card's non-representative version — the one a tap must reach. */
const comicVersion: Sticker = {
  ...fantasyVersion,
  id: 'v-comic',
  url: 'https://example.test/comic.png',
  storagePath: 'families/family-1/sketches/comic.png',
  theme: 'comic',
  createdAt: '2026-06-03',
}

/** A legacy standalone sticker: no look, so nothing to preserve. */
const legacy: Sticker = {
  id: 'legacy',
  url: 'https://example.test/legacy.png',
  storagePath: 'families/family-1/stickers/legacy.png',
  label: 'Dino',
  category: 'custom',
  tags: ['animal'],
  childProfile: 'both',
  createdAt: '2026-05-01',
}

const LIBRARY = [comicVersion, fantasyVersion, original, legacy]

const getDocsMock = vi.fn()
const getDocMock = vi.fn()
const setDocMock = vi.fn()
let allocated = 0

vi.mock('firebase/firestore', () => ({
  query: (...args: unknown[]) => args,
  orderBy: () => 'orderBy',
  doc: (collection: unknown, id?: string) => ({
    collection,
    id: id ?? `allocated-${(allocated += 1)}`,
  }),
  updateDoc: vi.fn(),
  writeBatch: () => ({ update: vi.fn(), commit: vi.fn() }),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
}))

const storedRow = (sticker: Sticker) => ({
  exists: () => true,
  data: () => ({ ...sticker, id: undefined }),
})

beforeEach(() => {
  enhanceSketchMock.mockReset()
  getDocMock.mockReset()
  setDocMock.mockReset()
  setDocMock.mockResolvedValue(undefined)
  allocated = 0
  getDocsMock.mockReset()
  getDocsMock.mockResolvedValue({
    docs: LIBRARY.map((s) => ({ id: s.id, data: () => s })),
  })
})

const openPreview = async (
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
) => {
  await screen.findByText(/sticker/)
  await user.click(await screen.findByRole('button', { name }))
}

// ── Tests ─────────────────────────────────────────────────────────

describe('the saved-version editor door', () => {
  it('is absent on the default Settings host', async () => {
    const user = userEvent.setup()
    render(<StickerLibraryTab groupByDrawing />)
    await openPreview(user, /Preview Wolf.*Comic/)

    // The existing preview actions are untouched; only the new door is missing.
    expect(screen.getByRole('button', { name: /make more versions/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit this version/i })).toBeNull()
  })

  it('is absent when the host opts in without supplying its context identity', async () => {
    const user = userEvent.setup()
    render(<StickerLibraryTab groupByDrawing enableSavedStickerEditing />)
    await openPreview(user, /Preview Wolf.*Comic/)

    expect(screen.queryByRole('button', { name: /edit this version/i })).toBeNull()
  })

  it('opens on the version that was actually tapped, not the representative', async () => {
    const user = userEvent.setup()
    render(
      <StickerLibraryTab groupByDrawing enableSavedStickerEditing editContextKey="family-1|parents|child-1" />,
    )
    await openPreview(user, /Preview Wolf.*Comic/)
    await user.click(screen.getByRole('button', { name: /edit this version/i }))

    const dialog = await screen.findByRole('dialog', { name: /edit this version/i })
    // The clicked version's own picture and its own look.
    expect(within(dialog).getByAltText('Wolf')).toHaveAttribute('src', comicVersion.url)
    expect(within(dialog).getByText(/Comic-book look/)).toBeInTheDocument()

    // …and it edits that exact row.
    getDocMock.mockResolvedValue(storedRow(comicVersion))
    enhanceSketchMock.mockResolvedValue({
      url: 'https://example.test/edited.png',
      storagePath: 'families/family-1/sketches/edited.png',
    })
    await user.type(within(dialog).getByLabelText(/what should change/i), 'take the hat off')
    await user.click(within(dialog).getByRole('button', { name: /make the change/i }))

    await waitFor(() => expect(enhanceSketchMock).toHaveBeenCalledTimes(1))
    expect(enhanceSketchMock.mock.calls[0][0]).toMatchObject({
      sketchStoragePath: comicVersion.storagePath,
      savedStickerEdit: { sourceStickerId: 'v-comic', sourceLookId: 'comic' },
    })

    // Saving writes one new row and reloads the library once.
    await user.click(await screen.findByRole('button', { name: /save as new version/i }))
    await waitFor(() => expect(setDocMock).toHaveBeenCalledTimes(1))
    expect(setDocMock.mock.calls[0][1]).toMatchObject({
      theme: 'comic',
      sourceDrawingId: 'g1',
      label: 'Wolf',
    })
    await waitFor(() => expect(getDocsMock).toHaveBeenCalledTimes(2))
  })

  it('is absent for the group original and for a sticker with no known look', async () => {
    const user = userEvent.setup()
    render(
      <StickerLibraryTab groupByDrawing enableSavedStickerEditing editContextKey="ctx" />,
    )
    await openPreview(user, /Preview Wolf Original/)
    expect(screen.queryByRole('button', { name: /edit this version/i })).toBeNull()
    await user.click(screen.getByRole('button', { name: /^close$/i }))
    // MUI keeps the paper mounted through its exit transition.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // The standalone legacy sticker carries no look to preserve.
    await user.click(screen.getByRole('button', { name: 'Preview Dino' }))
    expect(screen.queryByRole('button', { name: /edit this version/i })).toBeNull()
  })

  it('closes an open session when the host context changes', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <StickerLibraryTab groupByDrawing enableSavedStickerEditing editContextKey="ctx-1" />,
    )
    await openPreview(user, /Preview Wolf.*Comic/)
    await user.click(screen.getByRole('button', { name: /edit this version/i }))
    await screen.findByRole('dialog', { name: /edit this version/i })

    rerender(
      <StickerLibraryTab groupByDrawing enableSavedStickerEditing editContextKey="ctx-2" />,
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /edit this version/i })).toBeNull(),
    )
  })
})
