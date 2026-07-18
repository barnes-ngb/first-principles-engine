import { describe, expect, it } from 'vitest'

import type { CatalogProduct } from '../../core/types/business'
import { buildPublicCatalogHtml } from './publicCatalogPage'

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

describe('buildPublicCatalogHtml', () => {
  it('renders only listed products — drafts and retired are excluded', () => {
    const html = buildPublicCatalogHtml([
      product({ id: 'a', title: 'Listed Kit', status: 'listed' }),
      product({ id: 'b', title: 'Draft Kit', status: 'draft' }),
      product({ id: 'c', title: 'Retired Kit', status: 'retired' }),
    ])
    expect(html).toContain('Listed Kit')
    expect(html).not.toContain('Draft Kit')
    expect(html).not.toContain('Retired Kit')
  })

  it('shows a price only when set — never "$0" for an unpriced product', () => {
    const priced = buildPublicCatalogHtml([product({ title: 'Priced', priceCents: 1500 })])
    expect(priced).toContain('$15.00')

    const unpriced = buildPublicCatalogHtml([product({ title: 'Free', priceCents: 0 })])
    expect(unpriced).not.toContain('$0')
    expect(unpriced).not.toContain('class="price"')
  })

  it('renders the real image URL when present and a placeholder when art-less', () => {
    const withArt = buildPublicCatalogHtml([
      product({ title: 'Has art', images: [{ url: 'https://cdn/x.png', alt: 'A kit' }] }),
    ])
    expect(withArt).toContain('src="https://cdn/x.png"')
    expect(withArt).not.toContain('class="art placeholder"')

    const noArt = buildPublicCatalogHtml([product({ title: 'No art', images: [] })])
    expect(noArt).toContain('class="art placeholder"')
    expect(noArt).not.toContain('<img')
  })

  it('credits the boys in the header and footer — the union of madeBy across listed products', () => {
    const html = buildPublicCatalogHtml([
      product({ id: 'a', madeBy: ['Lincoln'] }),
      product({ id: 'b', madeBy: ['London', 'Lincoln'] }),
    ])
    expect(html).toContain('made by Lincoln &amp; London')
    expect(html).toContain('Lincoln &amp; London')
  })

  it('escapes user-authored text so a stray angle bracket cannot break the page', () => {
    const html = buildPublicCatalogHtml([product({ title: 'Kit <b>1</b>', description: 'A & B' })])
    expect(html).toContain('Kit &lt;b&gt;1&lt;/b&gt;')
    expect(html).toContain('A &amp; B')
  })

  it('has a warm "Want one?" outreach line but no contact-capture form field', () => {
    const html = buildPublicCatalogHtml([product({})])
    expect(html).toMatch(/tell us your favorites/i)
    // No PII capture: no forms, inputs, or mailto links (§6).
    expect(html).not.toContain('<form')
    expect(html).not.toContain('<input')
    expect(html).not.toContain('mailto:')
  })

  it('renders a friendly note when nothing is listed', () => {
    const html = buildPublicCatalogHtml([product({ status: 'draft' })])
    expect(html).toMatch(/being set up/i)
  })

  it('is a self-contained, mobile-first page (doctype + viewport + inline CSS, no app chrome)', () => {
    const html = buildPublicCatalogHtml([product({})])
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('name="viewport"')
    expect(html).toContain('<style>')
    // No external assets / bundle references — fully self-contained.
    expect(html).not.toContain('<script')
    expect(html).not.toContain('.js"')
    expect(html).not.toContain('href="http')
    expect(html).toContain('Barnes Bros')
  })
})
