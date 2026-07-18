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

describe('buildPublicCatalogHtml — book preview flipper (FEAT-91)', () => {
  const peekProduct = (over: Partial<CatalogProduct> = {}) =>
    product({
      id: 'book1',
      title: 'Tom Tom',
      priceCents: 800,
      includePreview: true,
      sourceRef: { kind: 'book', id: 'b1' },
      ...over,
    })

  it('emits one slide per cover + page and a hidden nav with a counter', () => {
    const html = buildPublicCatalogHtml([peekProduct()], {
      book1: {
        coverUrl: 'https://cdn/cover.png',
        pages: [
          { imageUrl: 'https://cdn/p1.png', text: 'one' },
          { imageUrl: 'https://cdn/p2.png', text: 'two' },
        ],
      },
    })
    // 3 slides: cover + 2 pages.
    expect((html.match(/class="peek-slide"/g) ?? []).length).toBe(3)
    expect(html).toContain('class="peek-viewer"')
    // Nav ships hidden (graceful fallback: JS off ⇒ slides stack, no controls).
    expect(html).toContain('<div class="peek-nav" hidden>')
    expect(html).toContain('class="peek-counter"')
    expect(html).toContain('aria-label="Previous page"')
    expect(html).toContain('aria-label="Next page"')
  })

  it('ships the flipper script exactly once, only when a preview renders', () => {
    const withPeek = buildPublicCatalogHtml([peekProduct()], {
      book1: { coverUrl: 'https://cdn/c.png', pages: [{ imageUrl: 'https://cdn/1.png' }] },
    })
    expect((withPeek.match(/querySelectorAll\('\.peek-viewer'\)/g) ?? []).length).toBe(1)

    // Opted-in product but NO resolved preview ⇒ no flipper script.
    expect(buildPublicCatalogHtml([peekProduct()])).not.toContain('.peek-viewer')
    // A preview-less catalog stays script-free entirely.
    expect(buildPublicCatalogHtml([product({})])).not.toContain('<script')
  })

  it('the flipper script never routes text through innerHTML (FEAT-88 rule)', () => {
    const html = buildPublicCatalogHtml([peekProduct()], {
      book1: { coverUrl: 'https://cdn/c.png', pages: [{ imageUrl: 'https://cdn/1.png' }] },
    })
    expect(html).not.toContain('.innerHTML')
    // The counter is written as a text node.
    expect(html).toContain('counter.textContent =')
  })

  it('renders a sticker strip only when the preview carries stickers', () => {
    const withStickers = buildPublicCatalogHtml([peekProduct()], {
      book1: {
        coverUrl: 'https://cdn/c.png',
        pages: [{ imageUrl: 'https://cdn/1.png' }],
        stickers: ['https://cdn/star.png', 'https://cdn/heart.png'],
      },
    })
    expect(withStickers).toContain('Stickers in this book')
    expect(withStickers).toContain('class="peek-sticker-strip"')
    expect(withStickers).toContain('src="https://cdn/star.png"')
    expect(withStickers).toContain('src="https://cdn/heart.png"')

    // No stickers on the preview ⇒ no strip.
    const noStickers = buildPublicCatalogHtml([peekProduct()], {
      book1: { coverUrl: 'https://cdn/c.png', pages: [{ imageUrl: 'https://cdn/1.png' }] },
    })
    expect(noStickers).not.toContain('Stickers in this book')
    // The CSS selector is always present; the markup class attribute is not.
    expect(noStickers).not.toContain('class="peek-sticker-strip"')
  })

  it('never shows a sticker strip for a product that did not opt in', () => {
    // Stickers resolved but the product is not opted in ⇒ no peek at all.
    const html = buildPublicCatalogHtml([product({ id: 'x', title: 'No Peek' })], {
      x: { coverUrl: 'https://cdn/c.png', pages: [{ imageUrl: 'https://cdn/1.png' }], stickers: ['https://cdn/s.png'] },
    })
    expect(html).not.toContain('Stickers in this book')
    expect(html).not.toContain('Peek inside')
  })

  it('escapes page + cover image URLs in the slides', () => {
    const html = buildPublicCatalogHtml([peekProduct({ title: 'A "Book"' })], {
      book1: { coverUrl: 'https://cdn/c.png', pages: [{ imageUrl: 'https://cdn/1.png' }] },
    })
    expect(html).toContain('A &quot;Book&quot; cover')
    expect(html).not.toContain('alt="A "Book" cover"')
  })
})

describe('buildPublicCatalogHtml — type filter chips (FEAT-92)', () => {
  it('renders "All" + one chip per bucket present, with All pressed by default', () => {
    const html = buildPublicCatalogHtml([
      product({ id: 'a', title: 'A Book', type: 'Book' }),
      product({ id: 'b', title: 'A Sheet', type: 'StickerSheet' }),
    ])
    expect(html).toContain('class="filter-bar"')
    expect(html).toContain('data-filter="all" aria-pressed="true"')
    expect(html).toContain('>Books</button>')
    expect(html).toContain('>Stickers</button>')
    // A bucket with no product never gets a chip.
    expect(html).not.toContain('>Kits</button>')
  })

  it('collapses the three kit types into one "Kits" chip', () => {
    const html = buildPublicCatalogHtml([
      product({ id: 'a', title: 'Starter', type: 'StarterKit' }),
      product({ id: 'b', title: 'Party', type: 'PartyKit' }),
      product({ id: 'c', title: 'Custom', type: 'CustomKit' }),
      product({ id: 'd', title: 'A Book', type: 'Book' }),
    ])
    // Kits + Books = 2 buckets → a bar with a single "Kits" chip for all three.
    expect(html.match(/>Kits<\/button>/g)).toHaveLength(1)
    expect(html).toContain('data-filter="kits"')
  })

  it('shows no filter bar (or script) for a single-type catalog', () => {
    const html = buildPublicCatalogHtml([
      product({ id: 'a', type: 'Book' }),
      product({ id: 'b', type: 'Book' }),
    ])
    expect(html).not.toContain('class="filter-bar"')
    // The filter script only ships alongside the bar.
    expect(html).not.toContain("querySelector('.filter-bar')")
  })

  it('stamps each card with its filter bucket and never bakes a hidden attribute (works without JS)', () => {
    const html = buildPublicCatalogHtml([
      product({ id: 'a', type: 'Book' }),
      product({ id: 'b', type: 'StickerSheet' }),
    ])
    expect(html).toContain('class="card" data-filter="books"')
    expect(html).toContain('class="card" data-filter="stickers"')
    // No card ships hidden — JS-off means every card is visible.
    expect(html).not.toContain('class="card" data-filter="stickers" hidden')
    expect(html).not.toMatch(/<article class="card"[^>]*hidden/)
  })

  it('ships a CSP-safe filter script (no innerHTML) only when the bar renders', () => {
    const html = buildPublicCatalogHtml([
      product({ id: 'a', type: 'Book' }),
      product({ id: 'b', type: 'StickerSheet' }),
    ])
    expect(html).toContain("querySelector('.filter-bar')")
    expect(html).toContain("card.hidden = filter !== 'all'")
    expect(html).not.toContain('.innerHTML')
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
    expect(html).not.toContain('class="qty-row"')
  })

  it('emits a quantity stepper on each product when interactive (FEAT-92)', () => {
    const html = buildPublicCatalogHtml(
      [product({ id: 'a', title: 'Listed Kit' })],
      {},
      ORDER_CFG,
    )
    expect(html).toContain('class="qty-row"')
    expect(html).toContain('data-product-id="a"')
    expect(html).toContain('data-title="Listed Kit"')
    // The stepper controls: minus, a live value, plus.
    expect(html).toContain('class="qty-btn qty-dec"')
    expect(html).toContain('class="qty-val"')
    expect(html).toContain('class="qty-btn qty-inc"')
    // No trace of the old binary toggle.
    expect(html).not.toContain('class="want-btn"')
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
    expect(html).not.toContain('class="qty-row"')
  })

  it('escapes a crafted product title inside the stepper data attribute', () => {
    const html = buildPublicCatalogHtml(
      [product({ id: 'x', title: 'Kit "evil" <b>' })],
      {},
      ORDER_CFG,
    )
    expect(html).toContain('data-title="Kit &quot;evil&quot; &lt;b&gt;"')
    expect(html).not.toContain('data-title="Kit "evil"')
  })

  it('builds the order summary with textContent, never innerHTML (getAttribute decodes titles)', () => {
    const html = buildPublicCatalogHtml([product({ title: 'Kit' })], {}, ORDER_CFG)
    // The form script must not route a decoded title back through innerHTML.
    expect(html).not.toContain('.innerHTML')
    // The per-pick chip shows "title ×qty" via textContent.
    expect(html).toContain("chip.textContent = p.title + ' ×' + p.qty")
  })

  it('sends qty in each payload line-item and caps client-side (FEAT-92)', () => {
    const html = buildPublicCatalogHtml([product({ title: 'Kit' })], {}, ORDER_CFG)
    // The payload carries qty per item…
    expect(html).toContain('qty: picks[id].qty')
    // …and the stepper mirrors the server caps for honest UX.
    expect(html).toContain('QTY_MAX = 9')
    expect(html).toContain('TOTAL_MAX = 20')
  })
})
