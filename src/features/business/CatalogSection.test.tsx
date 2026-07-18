import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CatalogProduct } from '../../core/types/business'

const { useCatalogProductsMock, createProductMock, updateProductMock } = vi.hoisted(() => ({
  useCatalogProductsMock: vi.fn(),
  createProductMock: vi.fn<(...args: unknown[]) => Promise<string>>(async () => 'prod-new'),
  updateProductMock: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
}))

vi.mock('./useCatalogProducts', () => ({ useCatalogProducts: useCatalogProductsMock }))

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

beforeEach(() => {
  createProductMock.mockClear()
  updateProductMock.mockClear()
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
})
