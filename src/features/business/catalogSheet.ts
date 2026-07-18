import type { CatalogProduct } from '../../core/types/business'
import { BusinessItemTypeLabel, CatalogProductStatus } from '../../core/types/business'

/**
 * Shareable catalog sheet (FEAT-83, design §4 Option A — printable/PDF, NOT the
 * public storefront Option C). A pure builder that renders the `status:'listed'`
 * catalog products into a self-contained, print-optimized HTML string the parent
 * opens and prints / saves-to-PDF and hands to a family: they browse and circle
 * favorites on paper. **No cart, no checkout, no data capture** — the ❤ pick
 * affordance is visual only. Reuses the same window.open + print pattern as the
 * MO compliance report (`records.logic.ts`); this file is the pure view layer so
 * it stays trivially testable.
 *
 * Read-only: it never writes — no `createProduct`/mutation happens here.
 */

/** Only `listed` products are shareable (design §4). Drafts/retired are excluded. */
export function selectListedProducts(products: CatalogProduct[]): CatalogProduct[] {
  return products.filter((p) => p.status === CatalogProductStatus.Listed)
}

/**
 * Minimal HTML escape for user-authored text going into a generated document.
 * Shared by the printable sheet (this file) and the public catalog page
 * (`publicCatalogPage.ts`) so both escape identically (FEAT-84).
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Back-compat local alias — the rest of this file reads `esc(...)`. */
const esc = escapeHtml

/** Price shows ONLY when set (>0). An unpriced product shows nothing — never "$0". */
function priceLine(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return ''
  return `<div class="price">$${(cents / 100).toFixed(2)}</div>`
}

/** The "made by …" footer credit — the union of every listed product's `madeBy`,
 *  in first-seen order, so the boys' names are featured. Falls back to a warm
 *  generic when nothing is credited. */
export function creditNames(products: CatalogProduct[]): string {
  const seen: string[] = []
  for (const p of products) {
    for (const name of p.madeBy) {
      const trimmed = name.trim()
      if (trimmed && !seen.includes(trimmed)) seen.push(trimmed)
    }
  }
  if (seen.length === 0) return 'the Barnes Bros'
  if (seen.length === 1) return seen[0]
  if (seen.length === 2) return `${seen[0]} & ${seen[1]}`
  return `${seen.slice(0, -1).join(', ')} & ${seen[seen.length - 1]}`
}

function productCard(p: CatalogProduct): string {
  const cover = p.images[0]
  const image = cover
    ? `<img class="art" src="${esc(cover.url)}" alt="${esc(cover.alt ?? p.title)}" />`
    : `<div class="art placeholder" aria-label="Art coming soon">🎨</div>`
  const made = p.madeBy.length > 0 ? `<div class="made">Made by ${esc(p.madeBy.join(', '))}</div>` : ''
  const desc = p.description.trim() ? `<div class="desc">${esc(p.description.trim())}</div>` : ''

  return `<div class="card">
    <div class="pick" aria-hidden="true">♡</div>
    ${image}
    <div class="body">
      <div class="title">${esc(p.title)}</div>
      <div class="type">${esc(BusinessItemTypeLabel[p.type])}</div>
      ${desc}
      ${priceLine(p.priceCents)}
      ${made}
    </div>
  </div>`
}

/**
 * Build the full, self-contained catalog sheet document from the given products.
 * Filters to `listed` internally, so callers can pass the whole catalog. Returns
 * a complete `<!DOCTYPE html>` string suitable for `window.open` + `print()`.
 *
 * If nothing is listed, renders a friendly note (defensive — the surface gates
 * the action so this is rarely hit).
 */
export function buildCatalogSheetHtml(products: CatalogProduct[]): string {
  const listed = selectListedProducts(products)
  const credit = creditNames(listed)

  const cards =
    listed.length > 0
      ? listed.map(productCard).join('\n')
      : `<p class="empty">Nothing to show yet — mark a product <strong>Listed</strong> to add it to the sheet.</p>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Barnes Bros — Catalog</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Comic Sans MS', 'Trebuchet MS', system-ui, sans-serif; color: #2a2a2a; background: #fff; padding: 0.5in; }
    header { text-align: center; margin-bottom: 18pt; }
    header h1 { font-size: 26pt; color: #2e7d32; margin-bottom: 4pt; }
    header p { font-size: 13pt; color: #555; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14pt; }
    .card { position: relative; border: 2px solid #cfe8cf; border-radius: 12pt; overflow: hidden; page-break-inside: avoid; break-inside: avoid; background: #fff; }
    .pick { position: absolute; top: 6pt; right: 8pt; font-size: 22pt; color: #e57373; line-height: 1; }
    .art { display: block; width: 100%; height: 150pt; object-fit: cover; background: #f3f7f3; }
    .art.placeholder { display: flex; align-items: center; justify-content: center; font-size: 48pt; color: #bcd6bc; }
    .body { padding: 8pt 10pt 10pt; }
    .title { font-size: 15pt; font-weight: bold; margin-bottom: 2pt; }
    .type { font-size: 10pt; color: #777; text-transform: uppercase; letter-spacing: 0.5pt; margin-bottom: 4pt; }
    .desc { font-size: 11pt; line-height: 1.35; margin-bottom: 5pt; }
    .price { font-size: 14pt; font-weight: bold; color: #2e7d32; margin-bottom: 3pt; }
    .made { font-size: 10pt; color: #888; font-style: italic; }
    .empty { text-align: center; color: #777; font-size: 13pt; padding: 24pt; }
    footer { margin-top: 20pt; text-align: center; font-size: 12pt; color: #666; }
    footer .heart { color: #e57373; }
    @media print {
      body { padding: 0.3in; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Barnes Bros</h1>
    <p>Here's what we make! Pick your favorites <span aria-hidden="true">♡</span></p>
  </header>
  <div class="grid">
    ${cards}
  </div>
  <footer>Made with <span class="heart" aria-hidden="true">♥</span> by ${esc(credit)}</footer>
</body>
</html>`
}
