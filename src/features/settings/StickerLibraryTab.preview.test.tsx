import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import StickerLibraryTab from './StickerLibraryTab'
import type { Sticker } from '../../core/types'

// ── Mocks ─────────────────────────────────────────────────────────

vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => 'family-1',
}))

vi.mock('../../core/firebase/firestore', () => ({
  stickerLibraryCollection: () => ({}),
}))

vi.mock('../../core/ai/useAI', () => ({
  useAI: () => ({ enhanceSketch: vi.fn() }),
}))

const wolf: Sticker = {
  id: 'a',
  url: 'https://example.com/a.png',
  storagePath: 'stickers/a.png',
  label: 'Wolf',
  category: 'custom',
  tags: ['animal'],
  childProfile: 'london',
  createdAt: '2026-06-01',
}

vi.mock('firebase/firestore', () => ({
  query: (...args: unknown[]) => args,
  orderBy: () => 'orderBy',
  doc: () => ({}),
  updateDoc: vi.fn(),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: () =>
    Promise.resolve({ docs: [{ id: wolf.id, data: () => wolf }] }),
}))

// ── Tests ─────────────────────────────────────────────────────────

describe('StickerLibraryTab — big preview on tap (FEAT-33)', () => {
  it('opens a large preview with quick actions when the sticker image is tapped', async () => {
    const user = userEvent.setup()
    render(<StickerLibraryTab />)

    await screen.findByText('1 sticker in your library')

    await user.click(screen.getByRole('button', { name: 'Preview Wolf' }))

    const dialog = await screen.findByRole('dialog')
    // Label + tag + child badge render in the preview.
    expect(within(dialog).getByText('Wolf')).toBeInTheDocument()
    expect(within(dialog).getByText('Animal')).toBeInTheDocument()
    expect(within(dialog).getByText('London')).toBeInTheDocument()
    // Quick actions present.
    expect(within(dialog).getByRole('button', { name: /^edit$/i })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /make more versions/i })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /^close$/i })).toBeInTheDocument()
  })

  it('preview → Delete hands the sticker to the delete confirmation', async () => {
    const user = userEvent.setup()
    render(<StickerLibraryTab />)

    await screen.findByText('1 sticker in your library')
    await user.click(screen.getByRole('button', { name: 'Preview Wolf' }))

    const preview = await screen.findByRole('dialog')
    await user.click(within(preview).getByRole('button', { name: /^delete$/i }))

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: /delete sticker/i })).toBeInTheDocument(),
    )
  })
})
