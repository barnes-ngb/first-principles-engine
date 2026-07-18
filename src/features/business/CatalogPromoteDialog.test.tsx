import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────

const { useCatalogProductsMock, createProductMock } = vi.hoisted(() => ({
  useCatalogProductsMock: vi.fn(),
  createProductMock: vi.fn<(...args: unknown[]) => Promise<string>>(async () => 'prod-new'),
}))

vi.mock('./useCatalogProducts', () => ({
  useCatalogProducts: useCatalogProductsMock,
}))

// Stub the form: echo the pre-fill and expose a save that forwards `initial`.
vi.mock('./CatalogProductForm', () => ({
  default: ({
    initial,
    onSave,
    onCancel,
  }: {
    initial?: { title?: string; type?: string; sourceRef?: { kind: string; id: string }; images?: { url: string }[] }
    onSave: (body: unknown) => Promise<void>
    onCancel: () => void
  }) => (
    <div data-testid="catalog-form">
      <span data-testid="cf-title">{initial?.title ?? 'none'}</span>
      <span data-testid="cf-type">{initial?.type ?? 'none'}</span>
      <span data-testid="cf-source">{initial?.sourceRef ? `${initial.sourceRef.kind}:${initial.sourceRef.id}` : 'none'}</span>
      <span data-testid="cf-image">{initial?.images?.[0]?.url ?? 'none'}</span>
      <button
        onClick={() =>
          onSave({
            title: initial?.title,
            type: initial?.type,
            description: '',
            priceCents: 0,
            images: initial?.images ?? [],
            sourceRef: initial?.sourceRef,
            madeBy: [],
            status: 'draft',
          })
        }
      >
        cf-save
      </button>
      <button onClick={onCancel}>cf-cancel</button>
    </div>
  ),
}))

import CatalogPromoteDialog from './CatalogPromoteDialog'

beforeEach(() => {
  createProductMock.mockClear()
  useCatalogProductsMock.mockReturnValue({ createProduct: createProductMock })
})

describe('CatalogPromoteDialog', () => {
  it('is closed when initial is null', () => {
    render(<CatalogPromoteDialog initial={null} onClose={vi.fn()} />)
    expect(screen.queryByTestId('catalog-form')).not.toBeInTheDocument()
  })

  it('pre-fills from a book source and persists via createProduct', async () => {
    const user = userEvent.setup()
    render(
      <CatalogPromoteDialog
        initial={{
          title: 'My Book',
          type: 'Book',
          images: [{ url: 'cover.png' }],
          sourceRef: { kind: 'book', id: 'b1' },
          madeBy: ['Lincoln'],
        }}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByTestId('cf-title')).toHaveTextContent('My Book')
    expect(screen.getByTestId('cf-type')).toHaveTextContent('Book')
    expect(screen.getByTestId('cf-image')).toHaveTextContent('cover.png')
    expect(screen.getByTestId('cf-source')).toHaveTextContent('book:b1')

    await user.click(screen.getByRole('button', { name: 'cf-save' }))
    await waitFor(() => expect(createProductMock).toHaveBeenCalledTimes(1))
    const body = createProductMock.mock.calls[0][0] as { sourceRef?: { kind: string; id: string } }
    expect(body.sourceRef).toEqual({ kind: 'book', id: 'b1' })
  })

  it('pre-fills from a sticker source (StickerSheet) and persists via createProduct', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <CatalogPromoteDialog
        initial={{
          title: 'Creeper',
          type: 'StickerSheet',
          images: [{ url: 'sticker.png' }],
          sourceRef: { kind: 'sticker', id: 's1' },
          madeBy: ['Lincoln'],
        }}
        onClose={onClose}
      />,
    )
    expect(screen.getByTestId('cf-type')).toHaveTextContent('StickerSheet')
    expect(screen.getByTestId('cf-source')).toHaveTextContent('sticker:s1')

    await user.click(screen.getByRole('button', { name: 'cf-save' }))
    await waitFor(() => expect(createProductMock).toHaveBeenCalledTimes(1))
    const body = createProductMock.mock.calls[0][0] as { sourceRef?: { kind: string; id: string } }
    expect(body.sourceRef).toEqual({ kind: 'sticker', id: 's1' })
    // Save closes the dialog.
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('cancel closes without writing', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <CatalogPromoteDialog
        initial={{ title: 'X', type: 'Book', sourceRef: { kind: 'book', id: 'b1' } }}
        onClose={onClose}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'cf-cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(createProductMock).not.toHaveBeenCalled()
  })
})
