import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { CatalogProduct } from '../../core/types/business'
import CatalogProductCard, { formatPriceCents } from './CatalogProductCard'

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

describe('formatPriceCents', () => {
  it('reads 0 (and negatives) as "No price yet"', () => {
    expect(formatPriceCents(0)).toBe('No price yet')
    expect(formatPriceCents(-5)).toBe('No price yet')
  })
  it('formats positive cents as dollars', () => {
    expect(formatPriceCents(1500)).toBe('$15.00')
    expect(formatPriceCents(899)).toBe('$8.99')
  })
})

describe('CatalogProductCard', () => {
  it('shows the placeholder when there is no image (empty images)', () => {
    render(<CatalogProductCard product={product({ images: [] })} />)
    expect(screen.getByLabelText('No image yet')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders the cover image when present', () => {
    render(
      <CatalogProductCard product={product({ images: [{ url: 'https://x/c.png', alt: 'cover' }] })} />,
    )
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://x/c.png')
    expect(screen.queryByLabelText('No image yet')).not.toBeInTheDocument()
  })

  it('shows title, type, price, made-by, and the draft chip', () => {
    render(<CatalogProductCard product={product({ priceCents: 1500, status: 'draft' })} />)
    expect(screen.getByText('Seed Vault Kit')).toBeInTheDocument()
    expect(screen.getByText(/Starter Kit · \$15\.00/)).toBeInTheDocument()
    expect(screen.getByText('Made by Lincoln')).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('shows "No price yet" for an unpriced product and a Listed chip when listed', () => {
    render(<CatalogProductCard product={product({ priceCents: 0, status: 'listed' })} />)
    expect(screen.getByText(/No price yet/)).toBeInTheDocument()
    expect(screen.getByText('Listed')).toBeInTheDocument()
  })
})
