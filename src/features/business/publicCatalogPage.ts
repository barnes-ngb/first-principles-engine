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

function productCard(
  p: CatalogProduct,
  preview?: CatalogPreview,
  interactive = false,
): string {
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

  // FEAT-89: the "I want this!" toggle. Data attributes carry the pick to the
  // form script; escaped so a crafted title can't break out of the attribute.
  const want = interactive
    ? `<button type="button" class="want-btn" aria-pressed="false"
        data-product-id="${escapeHtml(p.id)}" data-title="${escapeHtml(p.title)}">I want this!</button>`
    : ''

  return `<article class="card">
      ${image}
      <div class="body">
        <h2 class="title">${escapeHtml(p.title)}</h2>
        <div class="type">${escapeHtml(BusinessItemTypeLabel[p.type])}</div>
        ${desc}
        ${priceLine(p.priceCents)}
        ${made}
        ${peek}
        ${want}
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
/**
 * Config for the FEAT-89 public order form, baked into the page at publish time.
 * When present, product cards get an "I want this!" toggle and a sticky order
 * form posts the picks to {@link endpoint}. Absent ⇒ the page is the read-only
 * FEAT-84 lookbook, byte-for-byte (script-free), so a project without the
 * endpoint deployed never ships a broken form.
 */
export interface OrderFormConfig {
  /** The `submitCatalogOrder` endpoint URL. */
  endpoint: string
  /** The family whose shop this is — posted so the endpoint knows where to write. */
  familyId: string
}

/**
 * The FEAT-89 order-form CSS. Injected into the page `<style>` ONLY when the
 * form ships, so the read-only FEAT-84 lookbook stays byte-identical.
 */
const ORDER_STYLES = `
    /* ── Order form (FEAT-89) ── */
    .want-btn { margin-top: 10px; width: 100%; border: 2px solid #2e7d32; background: #fff;
      color: #2e7d32; font-weight: bold; font-size: 15px; padding: 9px 12px; border-radius: 999px;
      cursor: pointer; font-family: inherit; }
    .want-btn[aria-pressed="true"] { background: #2e7d32; color: #fff; }
    .order-bar { position: sticky; bottom: 0; left: 0; right: 0; margin-top: 24px;
      background: #fff; border-top: 3px solid #2e7d32; box-shadow: 0 -3px 12px rgba(0,0,0,0.12);
      border-radius: 16px 16px 0 0; z-index: 10; }
    .order-inner { max-width: 640px; margin: 0 auto; padding: 14px 16px 18px;
      display: flex; flex-direction: column; gap: 8px; }
    .order-picks { font-size: 13px; color: #555; }
    .order-chip { display: inline-block; background: #e8f5e9; color: #2e7d32; border-radius: 999px;
      padding: 2px 10px; margin: 2px 2px 0 0; font-weight: bold; font-size: 12px; }
    .order-field { display: flex; flex-direction: column; gap: 3px; font-size: 13px; color: #444; }
    .order-field input { font: inherit; font-size: 16px; padding: 9px 11px; border: 1px solid #cfe8cf;
      border-radius: 10px; background: #f9fdf9; }
    .order-known { font-size: 13px; color: #33691e; margin: 2px 0; }
    .order-hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
    .order-send { font: inherit; font-weight: bold; font-size: 16px; padding: 12px; border: none;
      border-radius: 12px; background: #2e7d32; color: #fff; cursor: pointer; }
    .order-send:disabled { opacity: 0.6; cursor: default; }
    .order-msg { font-size: 13px; color: #b71c1c; margin: 0; min-height: 1em; }
    .order-done { font-size: 16px; font-weight: bold; color: #2e7d32; text-align: center;
      padding: 12px 0; margin: 0; }`

/**
 * The sticky order form + its client script (FEAT-89). Self-contained, no
 * external refs. Only emitted when an {@link OrderFormConfig} is passed, so the
 * read-only page stays script-free. The endpoint + familyId are JSON-embedded
 * (they're controlled values — our URL + a UID — never user text).
 */
function orderForm(cfg: OrderFormConfig): string {
  const config = JSON.stringify({ endpoint: cfg.endpoint, familyId: cfg.familyId })
  return `<form id="orderForm" class="order-bar" hidden aria-label="Send an order to the Barnes Bros">
      <div class="order-inner">
        <div class="order-picks" id="orderPicks"></div>
        <label class="order-field">
          <span>Your first name</span>
          <input type="text" id="orderName" name="customerName" maxlength="80" autocomplete="given-name" required />
        </label>
        <label class="order-field">
          <span>Note (optional)</span>
          <input type="text" id="orderNote" name="note" maxlength="600" placeholder="Anything we should know?" />
        </label>
        <label class="order-field">
          <span>How to reach you (optional)</span>
          <input type="text" id="orderContact" name="contact" maxlength="120" placeholder="Text, call, or @handle" />
        </label>
        <p class="order-known">We know you — we'll be in touch! 💚</p>
        <input type="text" id="orderHp" name="website" class="order-hp" tabindex="-1" autocomplete="off" aria-hidden="true" />
        <button type="submit" id="orderSubmit" class="order-send">Send to the Barnes Bros</button>
        <p id="orderMsg" class="order-msg" role="status" aria-live="polite"></p>
      </div>
    </form>
    <script>
    (function () {
      var CONFIG = ${config};
      var picks = {};
      var form = document.getElementById('orderForm');
      var picksEl = document.getElementById('orderPicks');
      var msgEl = document.getElementById('orderMsg');

      function render() {
        var ids = Object.keys(picks);
        form.hidden = ids.length === 0;
        // Build chips with text nodes — a product title is untrusted markup, so
        // never route it through innerHTML (it is escaped in the card, but
        // getAttribute decodes it back).
        picksEl.textContent = '';
        if (!ids.length) return;
        picksEl.appendChild(document.createTextNode('Your picks: '));
        ids.forEach(function (id) {
          var chip = document.createElement('span');
          chip.className = 'order-chip';
          chip.textContent = picks[id];
          picksEl.appendChild(chip);
          picksEl.appendChild(document.createTextNode(' '));
        });
      }

      Array.prototype.forEach.call(document.querySelectorAll('.want-btn'), function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-product-id');
          var title = btn.getAttribute('data-title') || '';
          if (picks[id]) {
            delete picks[id];
            btn.setAttribute('aria-pressed', 'false');
            btn.textContent = 'I want this!';
          } else {
            picks[id] = title;
            btn.setAttribute('aria-pressed', 'true');
            btn.textContent = 'Picked ✓';
          }
          render();
        });
      });

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = (document.getElementById('orderName').value || '').trim();
        if (!name) { msgEl.textContent = 'Please add your first name.'; return; }
        var ids = Object.keys(picks);
        if (!ids.length) { return; }
        var payload = {
          familyId: CONFIG.familyId,
          customerName: name,
          items: ids.map(function (id) { return { productId: id, title: picks[id] }; }),
          note: (document.getElementById('orderNote').value || '').trim(),
          contact: (document.getElementById('orderContact').value || '').trim(),
          website: document.getElementById('orderHp').value
        };
        var btn = document.getElementById('orderSubmit');
        btn.disabled = true;
        msgEl.textContent = 'Sending…';
        fetch(CONFIG.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (res) {
          if (!res.ok) throw new Error('bad status');
          // Text node — the visitor's own name goes back to them as text, never markup.
          form.textContent = '';
          var done = document.createElement('p');
          done.className = 'order-done';
          done.textContent = 'Got it, ' + name + '! The bros are on it. 💪';
          form.appendChild(done);
        }).catch(function () {
          btn.disabled = false;
          msgEl.textContent = "Hmm, that didn't send. Please try again in a moment.";
        });
      });
    })();
    </script>`
}

export function buildPublicCatalogHtml(
  products: CatalogProduct[],
  previews: Record<string, CatalogPreview> = {},
  orderConfig?: OrderFormConfig,
): string {
  const listed = selectListedProducts(products)
  const credit = creditNames(listed)
  // Interactive ONLY when the endpoint is baked AND there's something to pick —
  // an empty catalog never shows toggles, a form, or the "tap to pick" copy.
  const interactive = Boolean(orderConfig) && listed.length > 0

  const cards =
    listed.length > 0
      ? listed.map((p) => productCard(p, previews[p.id], interactive)).join('\n')
      : `<p class="empty">Our catalog is being set up — check back soon! 🌱</p>`

  // The order form only ships when the endpoint was baked AND something is listed.
  const form = interactive && orderConfig ? orderForm(orderConfig) : ''

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
    footer .heart { color: #e57373; }${interactive ? ORDER_STYLES : ''}
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>Barnes Bros</h1>
      <div class="sub">made by ${escapeHtml(credit)}</div>
      <div class="want">${
        interactive
          ? `Tap "I want this!" on your favorites, then send it our way 💚`
          : 'Want one? Tell us your favorites! 💚'
      }</div>
    </header>
    <div class="grid">
      ${cards}
    </div>
    <footer>Made with <span class="heart" aria-hidden="true">♥</span> by ${escapeHtml(credit)}</footer>
  </div>
  ${form}
</body>
</html>`
}
