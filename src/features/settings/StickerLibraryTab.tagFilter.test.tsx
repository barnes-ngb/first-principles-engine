import { render, screen, waitFor } from '@testing-library/react'
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

const stickersFixture: Sticker[] = [
  {
    id: 'a',
    url: 'https://example.com/a.png',
    storagePath: 'stickers/a.png',
    label: 'Wolf',
    category: 'custom',
    tags: ['animal'],
    childProfile: 'both',
    createdAt: '2026-06-01',
  },
  {
    id: 'b',
    url: 'https://example.com/b.png',
    storagePath: 'stickers/b.png',
    label: 'Creeper',
    category: 'custom',
    tags: ['minecraft'],
    childProfile: 'both',
    createdAt: '2026-06-02',
  },
  {
    id: 'c',
    url: 'https://example.com/c.png',
    storagePath: 'stickers/c.png',
    label: 'Fox in the forest',
    category: 'custom',
    tags: ['animal', 'nature'],
    childProfile: 'london',
    createdAt: '2026-06-03',
  },
]

vi.mock('firebase/firestore', () => ({
  query: (...args: unknown[]) => args,
  orderBy: () => 'orderBy',
  doc: () => ({}),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: () =>
    Promise.resolve({
      docs: stickersFixture.map((s) => ({ id: s.id, data: () => s })),
    }),
}))

// ── Tests ─────────────────────────────────────────────────────────

describe('StickerLibraryTab tagFilter', () => {
  it('shows all stickers when no tag filter is set', async () => {
    render(<StickerLibraryTab />)
    await waitFor(() => {
      expect(screen.getByText('3 stickers in your library')).toBeInTheDocument()
    })
  })

  it('narrows the library to stickers whose tags include the filter', async () => {
    render(<StickerLibraryTab tagFilter="animal" />)
    // Two of the three stickers carry the "animal" tag.
    await waitFor(() => {
      expect(screen.getByText('2 stickers in your library')).toBeInTheDocument()
    })
  })

  it('combines the tag filter with the child profile filter', async () => {
    // "minecraft" + "london": the Creeper is "both"-scoped (visible to London),
    // so it shows; the animal stickers are filtered out by the tag.
    render(<StickerLibraryTab tagFilter="minecraft" childProfileFilter="london" />)
    await waitFor(() => {
      expect(screen.getByText('1 sticker in your library')).toBeInTheDocument()
    })
  })

  it('shows a friendly empty state when a tag has no matches', async () => {
    render(<StickerLibraryTab tagFilter="vehicle" />)
    await waitFor(() => {
      expect(screen.getByText('No Vehicle stickers yet')).toBeInTheDocument()
    })
  })
})
