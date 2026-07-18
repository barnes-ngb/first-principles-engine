import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Sticker } from '../../core/types'

// ── Hoisted mocks ───────────────────────────────────────────────

const { useCatalogProductsMock, useChildrenMock } = vi.hoisted(() => ({
  useCatalogProductsMock: vi.fn(),
  useChildrenMock: vi.fn(),
}))

vi.mock('../business/useCatalogProducts', () => ({
  useCatalogProducts: useCatalogProductsMock,
}))

vi.mock('../../core/hooks/useChildren', () => ({
  useChildren: useChildrenMock,
}))

// Stub the promote dialog: echo the pre-filled initial so we can assert it.
vi.mock('../business/CatalogPromoteDialog', () => ({
  default: ({ initial }: { initial?: { title?: string; type?: string; images?: { url: string }[]; sourceRef?: { kind: string; id: string } } | null }) =>
    initial ? (
      <div data-testid="promote-dialog">
        <span data-testid="pd-title">{initial.title}</span>
        <span data-testid="pd-type">{initial.type}</span>
        <span data-testid="pd-image">{initial.images?.[0]?.url}</span>
        <span data-testid="pd-source">{initial.sourceRef ? `${initial.sourceRef.kind}:${initial.sourceRef.id}` : 'none'}</span>
      </div>
    ) : null,
}))

import { StickerCatalogButton, StickerCatalogPromoteDialog } from './StickerCatalogPromote'

const sticker = (over: Partial<Sticker> = {}): Sticker => ({
  id: 's1',
  url: 'sticker.png',
  storagePath: 'p/s1',
  label: 'Creeper',
  category: 'character' as Sticker['category'],
  childProfile: 'lincoln',
  createdAt: '2026-07-18T00:00:00.000Z',
  ...over,
})

beforeEach(() => {
  useCatalogProductsMock.mockReturnValue({ products: [] })
  useChildrenMock.mockReturnValue({ children: [{ id: 'lincoln', name: 'Lincoln' }] })
})

describe('StickerCatalogButton', () => {
  it('offers "Add to catalog" and fires onPromote with the sticker', async () => {
    const user = userEvent.setup()
    const onPromote = vi.fn()
    render(<StickerCatalogButton sticker={sticker()} onPromote={onPromote} />)

    const btn = screen.getByRole('button', { name: /add to catalog/i })
    await user.click(btn)
    expect(onPromote).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }))
  })

  it('shows a disabled "In catalog" when this sticker is already promoted (dedup)', () => {
    useCatalogProductsMock.mockReturnValue({
      products: [{ id: 'p1', sourceRef: { kind: 'sticker', id: 's1' } }],
    })
    const onPromote = vi.fn()
    render(<StickerCatalogButton sticker={sticker()} onPromote={onPromote} />)

    const btn = screen.getByRole('button', { name: /in catalog/i })
    expect(btn).toBeDisabled()
  })
})

describe('StickerCatalogPromoteDialog', () => {
  it('is closed when sticker is null', () => {
    render(<StickerCatalogPromoteDialog sticker={null} onClose={vi.fn()} />)
    expect(screen.queryByTestId('promote-dialog')).not.toBeInTheDocument()
  })

  it('pre-fills the promote dialog from the sticker (StickerSheet + real image + sourceRef)', () => {
    render(<StickerCatalogPromoteDialog sticker={sticker()} onClose={vi.fn()} />)
    expect(screen.getByTestId('pd-title')).toHaveTextContent('Creeper')
    expect(screen.getByTestId('pd-type')).toHaveTextContent('StickerSheet')
    expect(screen.getByTestId('pd-image')).toHaveTextContent('sticker.png')
    expect(screen.getByTestId('pd-source')).toHaveTextContent('sticker:s1')
  })
})
