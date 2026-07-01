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
  stickerLibraryCollection: () => ({}),
}))

vi.mock('../../core/ai/useAI', () => ({
  useAI: () => ({ enhanceSketch: vi.fn() }),
}))

const printStickerSheetMock = vi.fn()
vi.mock('../books/printStickerSheet', () => ({
  printStickerSheet: (...args: unknown[]) => printStickerSheetMock(...args),
}))

// A source-drawing group (original + one themed version) plus a standalone.
const stickers: Sticker[] = [
  {
    id: 'orig',
    url: 'https://example.com/orig.png',
    storagePath: 'stickers/orig.png',
    label: 'Dragon',
    category: 'custom',
    tags: ['fantasy'],
    childProfile: 'both',
    createdAt: '2026-06-01',
    sourceDrawingId: 'd1',
    isOriginal: true,
  },
  {
    id: 'themed',
    url: 'https://example.com/themed.png',
    storagePath: 'stickers/themed.png',
    label: 'Dragon',
    category: 'custom',
    tags: ['fantasy'],
    childProfile: 'both',
    createdAt: '2026-06-02',
    sourceDrawingId: 'd1',
    theme: 'fantasy',
  },
  {
    id: 'solo',
    url: 'https://example.com/solo.png',
    storagePath: 'stickers/solo.png',
    label: 'Wolf',
    category: 'custom',
    tags: ['animal'],
    childProfile: 'both',
    createdAt: '2026-06-03',
  },
]

vi.mock('firebase/firestore', () => ({
  query: (...args: unknown[]) => args,
  orderBy: () => 'orderBy',
  doc: () => ({}),
  updateDoc: vi.fn(),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: () =>
    Promise.resolve({ docs: stickers.map((s) => ({ id: s.id, data: () => s })) }),
}))

// ── Tests ─────────────────────────────────────────────────────────

describe('StickerLibraryTab — grouped preview + select-to-print (FEAT-33 fix)', () => {
  beforeEach(() => {
    printStickerSheetMock.mockReset()
    printStickerSheetMock.mockResolvedValue({ skippedImageCount: 0, pageCount: 1 })
  })

  it('tapping a grouped version opens the big preview, with an Original badge for the original', async () => {
    const user = userEvent.setup()
    render(<StickerLibraryTab groupByDrawing enableSelectToPrint />)
    await screen.findByText('3 stickers in your library')

    // Tap the original version tile inside the drawing group.
    await user.click(screen.getByRole('button', { name: /Preview Dragon Original/i }))
    const preview = await screen.findByRole('dialog')
    expect(within(preview).getByText('Original')).toBeInTheDocument()
  })

  it('select mode selects grouped versions and includes them in the print set', async () => {
    const user = userEvent.setup()
    render(<StickerLibraryTab groupByDrawing enableSelectToPrint />)
    await screen.findByText('3 stickers in your library')

    await user.click(screen.getByRole('button', { name: /make a sheet/i }))
    // Select the original (grouped) and the standalone.
    await user.click(screen.getByRole('button', { name: /Select Dragon Original/i }))
    await user.click(screen.getByRole('button', { name: 'Select Wolf' }))

    await user.click(screen.getByRole('button', { name: /print 2 stickers/i }))
    const optionsDialog = await screen.findByRole('dialog', { name: /print 2 stickers/i })
    await user.click(within(optionsDialog).getByRole('button', { name: /^print$/i }))

    await waitFor(() => expect(printStickerSheetMock).toHaveBeenCalledTimes(1))
    const [sent] = printStickerSheetMock.mock.calls[0] as [Sticker[]]
    expect(sent.map((s) => s.id).sort()).toEqual(['orig', 'solo'])
  })
})
