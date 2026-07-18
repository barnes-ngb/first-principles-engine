import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CatalogProduct } from '../../core/types/business'

const { useCatalogProductsMock, createProductMock, updateProductMock } = vi.hoisted(() => ({
  useCatalogProductsMock: vi.fn(),
  createProductMock: vi.fn<(...args: unknown[]) => Promise<string>>(async () => 'prod-new'),
  updateProductMock: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
}))

const { useCatalogSiteMock, publishMock, unpublishMock } = vi.hoisted(() => ({
  useCatalogSiteMock: vi.fn(),
  publishMock: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
  unpublishMock: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
}))

vi.mock('./useCatalogProducts', () => ({ useCatalogProducts: useCatalogProductsMock }))
vi.mock('./useCatalogSite', () => ({ useCatalogSite: useCatalogSiteMock }))

// Stub the form so the section test stays focused on list/mode behavior.
vi.mock('./CatalogProductForm', () => ({
  default: ({
    initial,
    onSave,
    onCancel,
  }: {
    initial?: Partial<CatalogProduct>
    onSave: (body: unknown) => Promise<void>
    onCancel: () => void
  }) => (
    <div data-testid="form">
      <span data-testid="form-title">{initial?.title ?? 'none'}</span>
      <button onClick={() => onSave({ title: 'X', type: 'StarterKit', images: [], madeBy: [], status: 'draft', description: '', priceCents: 0 })}>
        stub-save
      </button>
      <button onClick={onCancel}>stub-cancel</button>
    </div>
  ),
}))

import CatalogSection from './CatalogSection'

const product = (over: Partial<CatalogProduct>): CatalogProduct => ({
  id: 'p1',
  title: 'Seed Vault Kit',
  type: 'StarterKit',
  description: '',
  priceCents: 0,
  images: [],
  madeBy: ['Lincoln'],
  status: 'draft',
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
  ...over,
})

function setProducts(products: CatalogProduct[], loading = false) {
  useCatalogProductsMock.mockReturnValue({
    products,
    loading,
    error: null,
    createProduct: createProductMock,
    updateProduct: updateProductMock,
  })
}

function setSite(over: Partial<ReturnType<typeof useCatalogSiteMock>> = {}) {
  useCatalogSiteMock.mockReturnValue({
    published: null,
    loading: false,
    busy: false,
    error: null,
    publish: publishMock,
    unpublish: unpublishMock,
    ...over,
  })
}

beforeEach(() => {
  createProductMock.mockClear()
  updateProductMock.mockClear()
  publishMock.mockClear()
  unpublishMock.mockClear()
  setSite()
})

describe('CatalogSection', () => {
  it('renders the empty state and an Add product button for a parent', () => {
    setProducts([])
    render(<CatalogSection canEdit />)
    expect(screen.getByText(/No products yet — promote a kit or add one/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add product/i })).toBeInTheDocument()
  })

  it('hides the Add button for a non-parent', () => {
    setProducts([])
    render(<CatalogSection canEdit={false} />)
    expect(screen.queryByRole('button', { name: /add product/i })).not.toBeInTheDocument()
  })

  it('lists non-retired products and hides retired ones', () => {
    setProducts([
      product({ id: 'p1', title: 'Kept', status: 'listed' }),
      product({ id: 'p2', title: 'Gone', status: 'retired' }),
    ])
    render(<CatalogSection canEdit />)
    expect(screen.getByText('Kept')).toBeInTheDocument()
    expect(screen.queryByText('Gone')).not.toBeInTheDocument()
  })

  it('saving a new product calls createProduct then returns to the list', async () => {
    const user = userEvent.setup()
    setProducts([])
    render(<CatalogSection canEdit />)

    await user.click(screen.getByRole('button', { name: /add product/i }))
    expect(screen.getByTestId('form-title')).toHaveTextContent('none')
    await user.click(screen.getByRole('button', { name: 'stub-save' }))

    await waitFor(() => expect(createProductMock).toHaveBeenCalledTimes(1))
    expect(updateProductMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('form')).not.toBeInTheDocument()
  })

  it('tapping a product opens edit and saving calls updateProduct with its id', async () => {
    const user = userEvent.setup()
    setProducts([product({ id: 'p7', title: 'Editable' })])
    render(<CatalogSection canEdit />)

    await user.click(screen.getByText('Editable'))
    expect(screen.getByTestId('form-title')).toHaveTextContent('Editable')

    await user.click(screen.getByRole('button', { name: 'stub-save' }))
    await waitFor(() => expect(updateProductMock).toHaveBeenCalledTimes(1))
    expect(updateProductMock.mock.calls[0][0]).toBe('p7')
    expect(createProductMock).not.toHaveBeenCalled()
  })

  it('hides the Share / print sheet action from a non-parent', () => {
    setProducts([product({ id: 'p1', title: 'Kept', status: 'listed' })])
    render(<CatalogSection canEdit={false} />)
    expect(screen.queryByRole('button', { name: /share \/ print sheet/i })).not.toBeInTheDocument()
  })

  it('disables the sheet action and hints when no product is listed', () => {
    setProducts([product({ id: 'p1', title: 'Draft only', status: 'draft' })])
    render(<CatalogSection canEdit />)
    expect(screen.getByRole('button', { name: /share \/ print sheet/i })).toBeDisabled()
    expect(screen.getByText(/mark a product/i)).toBeInTheDocument()
  })

  it('opens a printable sheet window when a listed product exists', async () => {
    const user = userEvent.setup()
    const write = vi.fn()
    const printWin = {
      document: { write, close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn(),
    }
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(printWin as unknown as Window)
    setProducts([product({ id: 'p1', title: 'Seed Vault Kit', status: 'listed' })])
    render(<CatalogSection canEdit />)

    await user.click(screen.getByRole('button', { name: /share \/ print sheet/i }))
    expect(openSpy).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write.mock.calls[0][0]).toContain('Seed Vault Kit')
    expect(printWin.print).toHaveBeenCalledTimes(1)
    // Read-only — sharing must never write.
    expect(createProductMock).not.toHaveBeenCalled()
    expect(updateProductMock).not.toHaveBeenCalled()
    openSpy.mockRestore()
  })

  it('hides the Publish site action from a non-parent', () => {
    setProducts([product({ id: 'p1', title: 'Kept', status: 'listed' })])
    render(<CatalogSection canEdit={false} />)
    expect(screen.queryByRole('button', { name: /publish site/i })).not.toBeInTheDocument()
  })

  it('disables Publish site when no product is listed', () => {
    setProducts([product({ id: 'p1', title: 'Draft only', status: 'draft' })])
    render(<CatalogSection canEdit />)
    expect(screen.getByRole('button', { name: /publish site/i })).toBeDisabled()
  })

  it('publishes the catalog products when a listed product exists', async () => {
    const user = userEvent.setup()
    const listed = product({ id: 'p1', title: 'Seed Vault Kit', status: 'listed' })
    setProducts([listed])
    render(<CatalogSection canEdit />)

    await user.click(screen.getByRole('button', { name: /publish site/i }))
    await waitFor(() => expect(publishMock).toHaveBeenCalledTimes(1))
    expect(publishMock.mock.calls[0][0]).toEqual([listed])
    // Publishing must not touch the catalog data itself.
    expect(createProductMock).not.toHaveBeenCalled()
    expect(updateProductMock).not.toHaveBeenCalled()
  })

  it('shows the live URL, a copy button, and unpublish once published', async () => {
    const user = userEvent.setup()
    setProducts([product({ id: 'p1', title: 'Kept', status: 'listed' })])
    setSite({
      published: { url: 'https://firebasestorage.example/public/catalog', publishedAt: '2026-07-18T12:00:00.000Z' },
    })
    render(<CatalogSection canEdit />)

    expect(screen.getByRole('link', { name: /firebasestorage\.example/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /republish site/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /unpublish/i }))
    await waitFor(() => expect(unpublishMock).toHaveBeenCalledTimes(1))
  })
})
