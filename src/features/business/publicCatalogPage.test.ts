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

  it('renders an opt-in book preview only when a resolved preview is passed for that product', () => {
    const p = product({
      id: 'book1',
      title: 'Tom Tom',
      priceCents: 800,
      includePreview: true,
      sourceRef: { kind: 'book', id: 'b1' },
    })
    const previews = {
      book1: {
        coverUrl: 'https://cdn/cover.png',
        pages: [{ imageUrl: 'https://cdn/p1.png', text: 'Once upon a tide' }],
      },
    }
    const html = buildPublicCatalogHtml([p], previews)
    expect(html).toContain('Peek inside')
    expect(html).toContain('https://cdn/p1.png')
    expect(html).toContain('Once upon a tide')
    expect(html).toContain('The real book is $8.00')

    // No preview passed ⇒ no peek, even if the product opted in.
    expect(buildPublicCatalogHtml([p])).not.toContain('Peek inside')
    // Opted-in but empty resolved preview ⇒ no peek.
    expect(
      buildPublicCatalogHtml([p], { book1: { coverUrl: undefined, pages: [] } }),
    ).not.toContain('Peek inside')
  })

  it('never renders a preview for a product that did not opt in', () => {
    const p = product({ id: 'x', title: 'No Peek' })
    const html = buildPublicCatalogHtml([p], {
      x: { coverUrl: 'https://cdn/c.png', pages: [{ imageUrl: 'https://cdn/1.png' }] },
    })
    expect(html).not.toContain('Peek inside')
  })

  it('uses a warm generic CTA in the preview when the book is unpriced', () => {
    const p = product({ id: 'b', title: 'Free', priceCents: 0, includePreview: true })
    const html = buildPublicCatalogHtml([p], {
      b: { coverUrl: undefined, pages: [{ text: 'hi' }] },
    })
    expect(html).toContain('Ask us about the real book')
    expect(html).not.toContain('$0')
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

describe('buildPublicCatalogHtml — order form (FEAT-89)', () => {
  const ORDER_CFG = {
    endpoint: 'https://us-central1-demo.cloudfunctions.net/submitCatalogOrder',
    familyId: 'fam-123',
  }

  it('stays a read-only, script-free lookbook when no order config is passed', () => {
    const html = buildPublicCatalogHtml([product({})])
    expect(html).not.toContain('<form')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('class="want-btn"')
  })

  it('emits the "I want this!" toggle on each product when interactive', () => {
    const html = buildPublicCatalogHtml(
      [product({ id: 'a', title: 'Listed Kit' })],
      {},
      ORDER_CFG,
    )
    expect(html).toContain('class="want-btn"')
    expect(html).toContain('data-product-id="a"')
    expect(html).toContain('data-title="Listed Kit"')
  })

  it('bakes the endpoint + familyId into the form script', () => {
    const html = buildPublicCatalogHtml([product({})], {}, ORDER_CFG)
    expect(html).toContain('<form id="orderForm"')
    expect(html).toContain(ORDER_CFG.endpoint)
    expect(html).toContain('"familyId":"fam-123"')
    // The honeypot + the "we know you" warm copy ship.
    expect(html).toContain('name="website"')
    expect(html).toMatch(/We know you/)
  })

  it('does not ship the form when nothing is listed (no picks possible)', () => {
    const html = buildPublicCatalogHtml([product({ status: 'draft' })], {}, ORDER_CFG)
    expect(html).not.toContain('<form id="orderForm"')
    expect(html).not.toContain('class="want-btn"')
  })

  it('escapes a crafted product title inside the toggle data attribute', () => {
    const html = buildPublicCatalogHtml(
      [product({ id: 'x', title: 'Kit "evil" <b>' })],
      {},
      ORDER_CFG,
    )
    expect(html).toContain('data-title="Kit &quot;evil&quot; &lt;b&gt;"')
    expect(html).not.toContain('data-title="Kit "evil"')
  })

  it('builds order chips with textContent, never innerHTML (getAttribute decodes titles)', () => {
    const html = buildPublicCatalogHtml([product({ title: 'Kit' })], {}, ORDER_CFG)
    // The form script must not route a decoded title back through innerHTML.
    expect(html).not.toContain('.innerHTML')
    expect(html).toContain('chip.textContent = picks[id]')
  })
})
