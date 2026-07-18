import type { CatalogProduct } from '../../core/types/business'
import { BusinessItemTypeLabel } from '../../core/types/business'
import type { CatalogPreview } from './catalogPreview'
import { creditNames, escapeHtml, selectListedProducts } from './catalogSheet'

/**
 * Public catalog page (FEAT-84, design §4 Option C — the public storefront,
 * shipped as **C1**: a static page uploaded to Firebase Storage and served at a
 * world-readable URL). A pure builder — the mobile-first sibling of the FEAT-83
 * printable `catalogSheet.ts`: same `status:'listed'` filter, same HTML escaping,
 * different chrome. It renders a self-contained `<!DOCTYPE html>` string (all CSS
 * inline, **no app-bundle dependency**) that a family opens on a phone with no
 * login.
 *
 * Read-only lookbook: image (or a friendly placeholder), title, description,
 * price-when-set, made-by. **No cart, no checkout, no accounts, and no
 * contact-capture** — the "tell us your favorites" line is warm copy only; the
 * family already knows the owner, so outreach is a text back, not a form (§6:
 * never collect customer PII).
 *
 * Images REFERENCE the products' existing Firebase Storage download URLs
 * directly (design §4 static-snapshot: "images are the existing Storage download
 * URLs"). Those URLs carry a download token, so they resolve for a
 * not-logged-in viewer without any rules change.
 */

/** Price shows ONLY when set (>0). An unpriced product shows nothing — never "$0". */
function priceLine(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return ''
  return `<div class="price">$${(cents / 100).toFixed(2)}</div>`
}

/** Warm "buy the real thing" nudge closing a preview — priced when the price is set. */
function previewCta(cents: number): string {
  const copy =
    Number.isFinite(cents) && cents > 0
      ? `Like it? The real book is $${(cents / 100).toFixed(2)}! 💚`
      : `Like it? Ask us about the real book! 💚`
  return `<p class="peek-cta">${escapeHtml(copy)}</p>`
}

/**
 * The opt-in "Peek inside" block (FEAT-85). A pure-HTML `<details>` (no JS) so
 * the page stays self-contained: cover + the first N inside pages (image + text),
 * closed by a warm CTA. Rendered ONLY when the parent opted the product in and a
 * resolved preview with at least one page was passed. Page images hotlink the
 * SAME tokenized Storage URLs the cover uses — nothing new is uploaded.
 */
function previewBlock(p: CatalogProduct, preview: CatalogPreview): string {
  const cover = preview.coverUrl
    ? `<img class="peek-img" src="${escapeHtml(preview.coverUrl)}" alt="${escapeHtml(`${p.title} cover`)}" loading="lazy" />`
    : ''
  const pages = preview.pages
    .map((pg) => {
      const img = pg.imageUrl
        ? `<img class="peek-img" src="${escapeHtml(pg.imageUrl)}" alt="A page from ${escapeHtml(p.title)}" loading="lazy" />`
        : ''
      const text = pg.text ? `<p class="peek-text">${escapeHtml(pg.text)}</p>` : ''
      return `<div class="peek-page">${img}${text}</div>`
    })
    .join('\n')

  return `<details class="peek">
        <summary>Peek inside 📖</summary>
        <div class="peek-body">
          ${cover}
          ${pages}
          ${previewCta(p.priceCents)}
        </div>
      </details>`
}

function productCard(p: CatalogProduct, preview?: CatalogPreview): string {
  const cover = p.images[0]
  const image = cover
    ? `<img class="art" src="${escapeHtml(cover.url)}" alt="${escapeHtml(cover.alt ?? p.title)}" loading="lazy" />`
    : `<div class="art placeholder" role="img" aria-label="Art coming soon">🎨</div>`
  const made =
    p.madeBy.length > 0 ? `<div class="made">Made by ${escapeHtml(p.madeBy.join(', '))}</div>` : ''
  const desc = p.description.trim()
    ? `<div class="desc">${escapeHtml(p.description.trim())}</div>`
    : ''
  // Preview renders only when opted-in AND a resolved preview with pages exists.
  const peek =
    p.includePreview && preview && preview.pages.length > 0 ? previewBlock(p, preview) : ''

  return `<article class="card">
      ${image}
      <div class="body">
        <h2 class="title">${escapeHtml(p.title)}</h2>
        <div class="type">${escapeHtml(BusinessItemTypeLabel[p.type])}</div>
        ${desc}
        ${priceLine(p.priceCents)}
        ${made}
        ${peek}
      </div>
    </article>`
}

/**
 * Build the full, self-contained public catalog page from the given products.
 * Filters to `listed` internally, so callers can pass the whole catalog. Returns
 * a complete `<!DOCTYPE html>` string suitable for upload to a public URL.
 *
 * If nothing is listed, renders a friendly note (defensive — the publish surface
 * gates the action so this is rarely hit).
 */
export function buildPublicCatalogHtml(
  products: CatalogProduct[],
  previews: Record<string, CatalogPreview> = {},
): string {
  const listed = selectListedProducts(products)
  const credit = creditNames(listed)

  const cards =
    listed.length > 0
      ? listed.map((p) => productCard(p, previews[p.id])).join('\n')
      : `<p class="empty">Our catalog is being set up — check back soon! 🌱</p>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Barnes Bros — Catalog</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif;
      color: #2a2a2a; background: #f6faf6; line-height: 1.4;
      -webkit-text-size-adjust: 100%;
    }
    .wrap { max-width: 640px; margin: 0 auto; padding: 20px 16px 48px; }
    header { text-align: center; padding: 12px 0 20px; }
    header h1 { font-size: 30px; color: #2e7d32; margin-bottom: 6px; }
    header .sub { font-size: 16px; color: #555; }
    header .want { margin-top: 12px; font-size: 15px; color: #33691e; background: #e8f5e9;
      border-radius: 999px; padding: 8px 16px; display: inline-block; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
    @media (min-width: 520px) { .grid { grid-template-columns: repeat(2, 1fr); } }
    .card { border: 2px solid #cfe8cf; border-radius: 16px; overflow: hidden;
      background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
    .art { display: block; width: 100%; height: 200px; object-fit: cover; background: #f3f7f3; }
    .art.placeholder { display: flex; align-items: center; justify-content: center;
      font-size: 64px; color: #bcd6bc; }
    .body { padding: 12px 14px 16px; }
    .title { font-size: 19px; font-weight: bold; margin-bottom: 2px; line-height: 1.25; }
    .type { font-size: 11px; color: #7a7a7a; text-transform: uppercase; letter-spacing: 0.6px;
      margin-bottom: 6px; }
    .desc { font-size: 14px; margin-bottom: 8px; }
    .price { font-size: 18px; font-weight: bold; color: #2e7d32; margin-bottom: 4px; }
    .made { font-size: 12px; color: #888; font-style: italic; }
    .peek { margin-top: 10px; border-top: 1px dashed #cfe8cf; padding-top: 8px; }
    .peek summary { cursor: pointer; font-size: 14px; font-weight: bold; color: #33691e;
      list-style: none; }
    .peek summary::-webkit-details-marker { display: none; }
    .peek-body { margin-top: 8px; }
    .peek-page { margin-bottom: 10px; }
    .peek-img { display: block; width: 100%; border-radius: 8px; margin-bottom: 4px;
      background: #f3f7f3; }
    .peek-text { font-size: 13px; color: #444; }
    .peek-cta { margin-top: 6px; font-size: 14px; font-weight: bold; color: #2e7d32; }
    .empty { text-align: center; color: #777; font-size: 16px; padding: 40px 12px; }
    footer { margin-top: 32px; text-align: center; font-size: 14px; color: #666; }
    footer .heart { color: #e57373; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>Barnes Bros</h1>
      <div class="sub">made by ${escapeHtml(credit)}</div>
      <div class="want">Want one? Tell us your favorites! 💚</div>
    </header>
    <div class="grid">
      ${cards}
    </div>
    <footer>Made with <span class="heart" aria-hidden="true">♥</span> by ${escapeHtml(credit)}</footer>
  </div>
</body>
</html>`
}
