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
vi.mock('../../core/ai/useAI', () => ({
  useAI: () => ({ enhanceSketch: enhanceSketchMock }),
}))

const updateDocMock = vi.fn()
const addDocMock = vi.fn()

// A standalone sticker: "Make more versions" on one of these ADOPTS it into a
// drawing group (a real Firestore write) before generating — so the cap has to
// refuse before that write, not after it.
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
  writeBatch: () => ({ update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) }),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  deleteDoc: vi.fn(),
  getDocs: () =>
    Promise.resolve({ docs: [{ id: standalone.id, data: () => standalone }] }),
}))

const CAP_MESSAGE = /that's a lot of art today/i

async function openMakeVersions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Edit Wolf' }))
  await user.click(await screen.findByRole('button', { name: /make more versions/i }))
}

describe('StickerLibraryTab — daily art cap (FEAT-165 / UX-95)', () => {
  beforeEach(() => {
    enhanceSketchMock.mockReset()
    enhanceSketchMock.mockResolvedValue({ url: 'https://x.test/v.png', storagePath: 'p/v.png' })
    updateDocMock.mockReset()
    updateDocMock.mockResolvedValue(undefined)
    addDocMock.mockReset()
    addDocMock.mockResolvedValue({ id: 'v1' })
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111')
  })

  it('nudges instead of generating at the cap — no paid call and no adoption write', async () => {
    const user = userEvent.setup()
    const recordGeneration = vi.fn().mockResolvedValue(undefined)
    render(<StickerLibraryTab capReached recordGeneration={recordGeneration} />)

    await openMakeVersions(user)

    expect(await screen.findByText(CAP_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make it' })).toBeNull()
    expect(enhanceSketchMock).not.toHaveBeenCalled()
    // The standalone sticker was NOT pulled into a drawing group for a version
    // that is never going to be made.
    expect(updateDocMock).not.toHaveBeenCalled()
    expect(recordGeneration).not.toHaveBeenCalled()
  })

  it('counts a version that was really generated', async () => {
    const user = userEvent.setup()
    const recordGeneration = vi.fn().mockResolvedValue(undefined)
    render(<StickerLibraryTab recordGeneration={recordGeneration} />)

    await openMakeVersions(user)
    await user.click(screen.getByRole('button', { name: 'Make it' }))

    await waitFor(() => expect(enhanceSketchMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(recordGeneration).toHaveBeenCalledTimes(1))
  })

  it('does not count a generation that produced no usable image', async () => {
    const user = userEvent.setup()
    const recordGeneration = vi.fn().mockResolvedValue(undefined)
    enhanceSketchMock.mockResolvedValue({ url: '', storagePath: '' })
    render(<StickerLibraryTab recordGeneration={recordGeneration} />)

    await openMakeVersions(user)
    await user.click(screen.getByRole('button', { name: 'Make it' }))

    await waitFor(() => expect(enhanceSketchMock).toHaveBeenCalledTimes(1))
    expect(recordGeneration).not.toHaveBeenCalled()
  })

  it('is unchanged for an uncapped caller (the parent-only Settings tab)', async () => {
    const user = userEvent.setup()
    render(<StickerLibraryTab />)

    await openMakeVersions(user)

    expect(screen.queryByText(CAP_MESSAGE)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Make it' }))
    await waitFor(() => expect(enhanceSketchMock).toHaveBeenCalledTimes(1))
  })
})
