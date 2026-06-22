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

const stickers: Sticker[] = [
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

describe('StickerLibraryTab — print to sheet (FEAT-33)', () => {
  beforeEach(() => {
    printStickerSheetMock.mockReset()
    printStickerSheetMock.mockResolvedValue({ skippedImageCount: 0, pageCount: 1 })
  })

  it('does not show print controls when enableSelectToPrint is off', async () => {
    render(<StickerLibraryTab />)
    await screen.findByText('2 stickers in your library')
    expect(screen.queryByRole('button', { name: /make a sheet/i })).not.toBeInTheDocument()
    // Preview has no "Print this" without the prop.
    await userEvent.click(screen.getByRole('button', { name: 'Preview Wolf' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: /print this/i })).not.toBeInTheDocument()
  })

  it('select-to-print: select stickers → print N → printStickerSheet runs with chosen options', async () => {
    const user = userEvent.setup()
    render(<StickerLibraryTab enableSelectToPrint />)
    await screen.findByText('2 stickers in your library')

    await user.click(screen.getByRole('button', { name: /make a sheet/i }))
    // Now images toggle selection.
    await user.click(screen.getByRole('button', { name: 'Select Wolf' }))
    await user.click(screen.getByRole('button', { name: 'Select Creeper' }))

    await user.click(screen.getByRole('button', { name: /print 2 stickers/i }))

    const optionsDialog = await screen.findByRole('dialog', { name: /print 2 stickers/i })
    // Choose A4 + Large, then print.
    await user.click(within(optionsDialog).getByText('A4'))
    await user.click(within(optionsDialog).getByText('Large'))
    await user.click(within(optionsDialog).getByRole('button', { name: /^print$/i }))

    await waitFor(() => expect(printStickerSheetMock).toHaveBeenCalledTimes(1))
    const [sent, opts] = printStickerSheetMock.mock.calls[0] as [Sticker[], Record<string, unknown>]
    expect(sent.map((s) => s.id).sort()).toEqual(['a', 'b'])
    expect(opts).toMatchObject({ pageSize: 'a4', stickerSize: 'large' })
  })

  it('preview "Print this" prints exactly that one sticker', async () => {
    const user = userEvent.setup()
    render(<StickerLibraryTab enableSelectToPrint />)
    await screen.findByText('2 stickers in your library')

    await user.click(screen.getByRole('button', { name: 'Preview Wolf' }))
    const preview = await screen.findByRole('dialog')
    await user.click(within(preview).getByRole('button', { name: /print this/i }))

    const optionsDialog = await screen.findByRole('dialog', { name: /print this sticker/i })
    await user.click(within(optionsDialog).getByRole('button', { name: /^print$/i }))

    await waitFor(() => expect(printStickerSheetMock).toHaveBeenCalledTimes(1))
    const [sent] = printStickerSheetMock.mock.calls[0] as [Sticker[]]
    expect(sent).toHaveLength(1)
    expect(sent[0].id).toBe('a')
  })
})
