import { describe, expect, it } from 'vitest'

import type { CatalogProduct } from '../../core/types/business'
import { buildCatalogSheetHtml, selectListedProducts } from './catalogSheet'

const product = (over: Partial<CatalogProduct>): CatalogProduct => ({
  id: 'p1',
  title: 'Seed Vault Kit',
  type: 'StarterKit',
  description: '',
  priceCents: 0,
  images: [],
  madeBy: ['Lincoln'],
  status: 'listed',
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
  ...over,
})

describe('selectListedProducts', () => {
  it('keeps only listed products (drafts and retired excluded)', () => {
    const listed = selectListedProducts([
      product({ id: 'a', status: 'listed' }),
      product({ id: 'b', status: 'draft' }),
      product({ id: 'c', status: 'retired' }),
    ])
    expect(listed.map((p) => p.id)).toEqual(['a'])
  })
})

describe('buildCatalogSheetHtml', () => {
  it('renders only listed products — drafts and retired are excluded', () => {
    const html = buildCatalogSheetHtml([
      product({ id: 'a', title: 'Listed Kit', status: 'listed' }),
      product({ id: 'b', title: 'Draft Kit', status: 'draft' }),
      product({ id: 'c', title: 'Retired Kit', status: 'retired' }),
    ])
    expect(html).toContain('Listed Kit')
    expect(html).not.toContain('Draft Kit')
    expect(html).not.toContain('Retired Kit')
  })

  it('shows a price only when set — never "$0" for an unpriced product', () => {
    const priced = buildCatalogSheetHtml([product({ title: 'Priced', priceCents: 1500 })])
    expect(priced).toContain('$15.00')

    const unpriced = buildCatalogSheetHtml([product({ title: 'Free', priceCents: 0 })])
    expect(unpriced).not.toContain('$0')
    expect(unpriced).not.toContain('class="price"')
  })

  it('renders the real image when present and a placeholder when art-less', () => {
    const withArt = buildCatalogSheetHtml([
      product({ title: 'Has art', images: [{ url: 'https://cdn/x.png', alt: 'A kit' }] }),
    ])
    expect(withArt).toContain('src="https://cdn/x.png"')
    expect(withArt).not.toContain('class="art placeholder"')

    const noArt = buildCatalogSheetHtml([product({ title: 'No art', images: [] })])
    expect(noArt).toContain('class="art placeholder"')
    expect(noArt).not.toContain('<img')
  })

  it('features the boys in the footer — the union of madeBy across listed products', () => {
    const html = buildCatalogSheetHtml([
      product({ id: 'a', madeBy: ['Lincoln'] }),
      product({ id: 'b', madeBy: ['London', 'Lincoln'] }),
    ])
    expect(html).toContain('Lincoln &amp; London')
  })

  it('escapes user-authored text so a stray angle bracket cannot break the sheet', () => {
    const html = buildCatalogSheetHtml([
      product({ title: 'Kit <b>1</b>', description: 'A & B' }),
    ])
    expect(html).toContain('Kit &lt;b&gt;1&lt;/b&gt;')
    expect(html).toContain('A &amp; B')
  })

  it('renders a friendly empty note when nothing is listed', () => {
    const html = buildCatalogSheetHtml([product({ status: 'draft' })])
    expect(html).toMatch(/mark a product/i)
    expect(html).toContain('Listed')
  })

  it('is a self-contained printable document (doctype + print styles, no app chrome)', () => {
    const html = buildCatalogSheetHtml([product({})])
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('@media print')
    expect(html).toContain('Barnes Bros')
  })
})
