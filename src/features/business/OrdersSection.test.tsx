import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CatalogOrder } from '../../core/types/business'

const { useCatalogOrdersMock, advanceStatusMock } = vi.hoisted(() => ({
  useCatalogOrdersMock: vi.fn(),
  advanceStatusMock: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
}))

vi.mock('./useCatalogOrders', () => ({ useCatalogOrders: useCatalogOrdersMock }))

import OrdersSection from './OrdersSection'

const order = (over: Partial<CatalogOrder>): CatalogOrder => ({
  id: 'o1',
  customerName: 'Sam',
  items: [{ productId: 'p1', title: 'Seed Vault Kit' }],
  status: 'new',
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
  ...over,
})

function setOrders(orders: CatalogOrder[], loading = false) {
  useCatalogOrdersMock.mockReturnValue({
    orders,
    loading,
    error: null,
    advanceStatus: advanceStatusMock,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('OrdersSection (FEAT-88)', () => {
  it('renders an order with customer, items, note, and contact', () => {
    setOrders([
      order({ note: 'blue please', contact: 'text 555', items: [{ productId: 'p1', title: 'Seed Vault Kit' }] }),
    ])
    render(<OrdersSection />)
    expect(screen.getByText('Sam')).toBeInTheDocument()
    expect(screen.getByText('Seed Vault Kit')).toBeInTheDocument()
    expect(screen.getByText(/blue please/)).toBeInTheDocument()
    expect(screen.getByText(/text 555/)).toBeInTheDocument()
  })

  it('shows the 🎉 New order! affordance only when a new order exists', () => {
    setOrders([order({ status: 'new' })])
    const { rerender } = render(<OrdersSection />)
    expect(screen.getByText(/New order/)).toBeInTheDocument()

    setOrders([order({ status: 'making' })])
    rerender(<OrdersSection />)
    expect(screen.queryByText(/New order/)).not.toBeInTheDocument()
  })

  it('advances status forward when the stepper button is clicked', async () => {
    setOrders([order({ id: 'o9', status: 'new' })])
    render(<OrdersSection />)
    // The button names the NEXT status forward.
    await userEvent.click(screen.getByRole('button', { name: /Mark Making/ }))
    expect(advanceStatusMock).toHaveBeenCalledWith('o9', 'new')
  })

  it('shows no advance button once delivered (forward-only terminal state)', () => {
    setOrders([order({ status: 'delivered' })])
    render(<OrdersSection />)
    expect(screen.queryByRole('button', { name: /^Mark/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Delivered — nice work/)).toBeInTheDocument()
  })

  it('renders the empty state when there are no orders', () => {
    setOrders([])
    render(<OrdersSection />)
    expect(screen.getByText(/No orders yet/)).toBeInTheDocument()
    expect(screen.queryByText(/New order/)).not.toBeInTheDocument()
  })
})
