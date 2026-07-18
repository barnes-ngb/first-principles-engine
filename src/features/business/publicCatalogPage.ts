import type { BusinessItemType, CatalogProduct } from '../../core/types/business'
import { BusinessItemType as ItemType, BusinessItemTypeLabel } from '../../core/types/business'
import type { CatalogPreview } from './catalogPreview'
import { creditNames, escapeHtml, selectListedProducts } from './catalogSheet'

/**
 * Type-filter buckets for the public catalog chips (FEAT-92). The three kit
 * types collapse into one "Kits" chip; Books / Stickers / Other each get their
 * own. Order here is the chip render order. A product's bucket is stamped on its
 * card as `data-filter` so a chip can show/hide cards with vanilla JS.
 *
 * FUTURE (deferred, FEAT-92): "theme" filtering (e.g. dinosaurs, space) would
 * need a `tags?: string[]` on `CatalogProduct` — products carry none today, so
 * this ships type-only. See docs/BARNES_BROS_CATALOG_DESIGN.md.
 */
const FILTER_GROUPS: { key: string; label: string; types: readonly BusinessItemType[] }[] = [
  { key: 'books', label: 'Books', types: [ItemType.Book] },
  { key: 'stickers', label: 'Stickers', types: [ItemType.StickerSheet] },
  { key: 'kits', label: 'Kits', types: [ItemType.StarterKit, ItemType.PartyKit, ItemType.CustomKit] },
  { key: 'other', label: 'Other', types: [ItemType.Other] },
]

/** The filter-bucket key for a product type (defaults to `other`). */
function filterGroupKey(type: BusinessItemType): string {
  return FILTER_GROUPS.find((g) => g.types.includes(type))?.key ?? 'other'
}

/** The distinct filter buckets present among the given products, in chip order. */
function presentFilterGroups(products: CatalogProduct[]): { key: string; label: string }[] {
  const keys = new Set(products.map((p) => filterGroupKey(p.type)))
  return FILTER_GROUPS.filter((g) => keys.has(g.key)).map((g) => ({ key: g.key, label: g.label }))
}

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
 * The "Stickers in this book ✨" strip (FEAT-91). A horizontally-scrollable row
 * of the book's sticker thumbnails, hotlinked like every other preview image.
 * Rendered ONLY when the resolved preview carries stickers — it rides the SAME
 * `includePreview` opt-in as the flipper (no new toggle), so a parent who didn't
 * open the peek shows nothing. Returns '' when the book has no stickers.
 */
function stickerStrip(p: CatalogProduct, preview: CatalogPreview): string {
  const stickers = preview.stickers ?? []
  if (stickers.length === 0) return ''
  const thumbs = stickers
    .map(
      (url) =>
        `<img class="peek-sticker" src="${escapeHtml(url)}" alt="A sticker from ${escapeHtml(p.title)}" loading="lazy" />`,
    )
    .join('\n            ')
  return `<div class="peek-stickers">
            <div class="peek-stickers-label">Stickers in this book ✨</div>
            <div class="peek-sticker-strip">
            ${thumbs}
            </div>
          </div>`
}

/** True when a product's peek should render: opted-in with a non-empty preview. */
function shouldRenderPeek(
  p: CatalogProduct,
  preview: CatalogPreview | undefined,
): preview is CatalogPreview {
  return Boolean(p.includePreview && preview && preview.pages.length > 0)
}

/**
 * The opt-in "Peek inside" block (FEAT-85, flipper FEAT-91). A `<details>`
 * holding a compact page flipper: cover + the first N inside pages (image +
 * text) as `.peek-slide`s, plus a hidden `‹ Prev / Next ›` nav the page script
 * ({@link pagerScript}) reveals and drives one-slide-at-a-time. **Graceful
 * fallback:** with JS disabled the nav stays hidden and the slides simply stack
 * (the original FEAT-85 behavior) — no deps, no broken controls. Rendered ONLY
 * when the parent opted in and a non-empty preview was passed. Page images
 * hotlink the SAME tokenized Storage URLs the cover uses — nothing new uploaded.
 */
function previewBlock(p: CatalogProduct, preview: CatalogPreview): string {
  const slides: string[] = []
  if (preview.coverUrl) {
    slides.push(
      `<div class="peek-slide"><img class="peek-img" src="${escapeHtml(preview.coverUrl)}" alt="${escapeHtml(`${p.title} cover`)}" loading="lazy" /></div>`,
    )
  }
  for (const pg of preview.pages) {
    const img = pg.imageUrl
      ? `<img class="peek-img" src="${escapeHtml(pg.imageUrl)}" alt="A page from ${escapeHtml(p.title)}" loading="lazy" />`
      : ''
    const text = pg.text ? `<p class="peek-text">${escapeHtml(pg.text)}</p>` : ''
    slides.push(`<div class="peek-slide">${img}${text}</div>`)
  }

  // Nav ships hidden; the page script un-hides it and switches to one slide at a
  // time. Buttons carry no untrusted text — the counter is filled by textContent.
  const nav = `<div class="peek-nav" hidden>
            <button type="button" class="peek-btn peek-prev" aria-label="Previous page">‹ Prev</button>
            <span class="peek-counter" role="status" aria-live="polite"></span>
            <button type="button" class="peek-btn peek-next" aria-label="Next page">Next ›</button>
          </div>`

  return `<details class="peek">
        <summary>Peek inside 📖</summary>
        <div class="peek-body">
          <div class="peek-viewer">
            <div class="peek-stage">
              ${slides.join('\n            ')}
            </div>
            ${nav}
          </div>
          ${stickerStrip(p, preview)}
          ${previewCta(p.priceCents)}
        </div>
      </details>`
}

/**
 * The page-flipper client script (FEAT-91). Self-contained, no external refs,
 * CSP-safe: it only toggles `hidden` and writes the counter via `textContent`
 * (never `innerHTML`). Emitted once per page and ONLY when a preview renders, so
 * a preview-less catalog stays script-free. Reveals the nav, shows one slide at
 * a time with a "N of M" counter + disabled ends, and adds cheap pointer-swipe.
 */
function pagerScript(): string {
  return `<script>
    (function () {
      Array.prototype.forEach.call(document.querySelectorAll('.peek-viewer'), function (viewer) {
        var slides = viewer.querySelectorAll('.peek-slide');
        if (slides.length < 2) return;
        var nav = viewer.querySelector('.peek-nav');
        var counter = viewer.querySelector('.peek-counter');
        var prev = viewer.querySelector('.peek-prev');
        var next = viewer.querySelector('.peek-next');
        var i = 0;
        function show(n) {
          i = Math.max(0, Math.min(slides.length - 1, n));
          Array.prototype.forEach.call(slides, function (s, idx) { s.hidden = idx !== i; });
          counter.textContent = (i + 1) + ' of ' + slides.length;
          prev.disabled = i === 0;
          next.disabled = i === slides.length - 1;
        }
        prev.addEventListener('click', function () { show(i - 1); });
        next.addEventListener('click', function () { show(i + 1); });
        var x0 = null;
        viewer.addEventListener('pointerdown', function (e) { x0 = e.clientX; });
        viewer.addEventListener('pointerup', function (e) {
          if (x0 === null) return;
          var dx = e.clientX - x0; x0 = null;
          if (dx > 40) show(i - 1); else if (dx < -40) show(i + 1);
        });
        nav.hidden = false;
        show(0);
      });
    })();
    </script>`
}

/**
 * The type-filter chip bar (FEAT-92). "All" plus one chip per filter bucket
 * actually present among the listed products (never a chip for an absent type).
 * Returns '' when fewer than two buckets exist — a single-type catalog needs no
 * filter. Vanilla JS ({@link filterScript}) drives it; with JS off the chips are
 * inert and every card stays visible (the default), so nothing is ever hidden
 * behind a control that doesn't work.
 */
function filterBar(groups: { key: string; label: string }[]): string {
  if (groups.length < 2) return ''
  const chips = [{ key: 'all', label: 'All' }, ...groups]
    .map(
      (g, i) =>
        `<button type="button" class="filter-chip" data-filter="${escapeHtml(g.key)}" aria-pressed="${i === 0 ? 'true' : 'false'}">${escapeHtml(g.label)}</button>`,
    )
    .join('\n        ')
  return `<div class="filter-bar" role="group" aria-label="Filter by type">
        ${chips}
      </div>`
}

/**
 * The type-filter client script (FEAT-92). Self-contained, CSP-safe: it toggles
 * `hidden` on cards and `aria-pressed` on chips — no `innerHTML`, no external
 * refs. Emitted once and ONLY when the filter bar renders, so a single-type (or
 * empty) catalog stays script-free for this feature.
 */
function filterScript(): string {
  return `<script>
    (function () {
      var bar = document.querySelector('.filter-bar');
      if (!bar) return;
      var chips = bar.querySelectorAll('.filter-chip');
      var cards = document.querySelectorAll('.grid .card');
      function apply(filter) {
        Array.prototype.forEach.call(cards, function (card) {
          card.hidden = filter !== 'all' && card.getAttribute('data-filter') !== filter;
        });
        Array.prototype.forEach.call(chips, function (chip) {
          chip.setAttribute('aria-pressed', chip.getAttribute('data-filter') === filter ? 'true' : 'false');
        });
      }
      Array.prototype.forEach.call(chips, function (chip) {
        chip.addEventListener('click', function () { apply(chip.getAttribute('data-filter')); });
      });
    })();
    </script>`
}

/** Filter-chip CSS (FEAT-92). Appended only when the bar renders. */
const FILTER_STYLES = `
    /* ── Type filter chips (FEAT-92) ── */
    .filter-bar { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 16px; }
    .filter-chip { border: 2px solid #2e7d32; background: #fff; color: #2e7d32; font-weight: bold;
      font-size: 14px; padding: 6px 14px; border-radius: 999px; cursor: pointer; font-family: inherit; }
    .filter-chip[aria-pressed="true"] { background: #2e7d32; color: #fff; }`

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
  const peek = shouldRenderPeek(p, preview) ? previewBlock(p, preview) : ''

  // FEAT-92: the per-product quantity stepper (replaces FEAT-89's binary "I want
  // this!" toggle). Data attributes carry the pick to the form script; escaped so
  // a crafted title can't break out of the attribute. The value starts at 0
  // (nothing picked) and the script clamps it to 0..9.
  const qty = interactive
    ? `<div class="qty-row" data-product-id="${escapeHtml(p.id)}" data-title="${escapeHtml(p.title)}">
        <span class="qty-label">How many?</span>
        <div class="qty-stepper" role="group" aria-label="Quantity for ${escapeHtml(p.title)}">
          <button type="button" class="qty-btn qty-dec" aria-label="One fewer">−</button>
          <span class="qty-val" role="status" aria-live="polite">0</span>
          <button type="button" class="qty-btn qty-inc" aria-label="One more">+</button>
        </div>
      </div>`
    : ''

  return `<article class="card" data-filter="${filterGroupKey(p.type)}">
      ${image}
      <div class="body">
        <h2 class="title">${escapeHtml(p.title)}</h2>
        <div class="type">${escapeHtml(BusinessItemTypeLabel[p.type])}</div>
        ${desc}
        ${priceLine(p.priceCents)}
        ${made}
        ${peek}
        ${qty}
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
    /* ── Order form (FEAT-89) + quantity cart (FEAT-92) ── */
    .qty-row { margin-top: 10px; display: flex; align-items: center; justify-content: space-between;
      gap: 10px; }
    .qty-label { font-size: 14px; font-weight: bold; color: #33691e; }
    .qty-stepper { display: flex; align-items: center; gap: 4px; }
    .qty-btn { width: 40px; height: 40px; border: 2px solid #2e7d32; background: #fff;
      color: #2e7d32; font-weight: bold; font-size: 22px; line-height: 1; border-radius: 999px;
      cursor: pointer; font-family: inherit; display: flex; align-items: center; justify-content: center; }
    .qty-btn:disabled { opacity: 0.4; cursor: default; }
    .qty-val { min-width: 28px; text-align: center; font-weight: bold; font-size: 18px; color: #2a2a2a; }
    .order-total { display: inline-block; margin-left: 4px; font-weight: bold; color: #33691e; }
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
      // Client-side caps mirror functions ORDER_LIMITS (qtyMax / totalQtyMax).
      // The server re-validates authoritatively; these are for honest UX only.
      var QTY_MAX = 9, TOTAL_MAX = 20;
      // picks[id] = { title: string, qty: number>0 }. A product drops out at qty 0.
      var picks = {};
      var form = document.getElementById('orderForm');
      var picksEl = document.getElementById('orderPicks');
      var msgEl = document.getElementById('orderMsg');

      function totalUnits() {
        return Object.keys(picks).reduce(function (n, id) { return n + picks[id].qty; }, 0);
      }

      function render() {
        var ids = Object.keys(picks);
        form.hidden = ids.length === 0;
        // Build the summary from text nodes — a product title is untrusted markup,
        // so never route it through innerHTML (it is escaped in the card, but
        // getAttribute decodes it back). Shape: "Steven ×2 · Tom Tom ×1 — 3 items".
        picksEl.textContent = '';
        if (!ids.length) return;
        var total = 0;
        ids.forEach(function (id, idx) {
          var p = picks[id];
          total += p.qty;
          if (idx > 0) picksEl.appendChild(document.createTextNode(' · '));
          var chip = document.createElement('span');
          chip.className = 'order-chip';
          chip.textContent = p.title + ' ×' + p.qty;
          picksEl.appendChild(chip);
        });
        var totalEl = document.createElement('span');
        totalEl.className = 'order-total';
        totalEl.textContent = ' — ' + total + (total === 1 ? ' item' : ' items');
        picksEl.appendChild(totalEl);
      }

      Array.prototype.forEach.call(document.querySelectorAll('.qty-row'), function (row) {
        var id = row.getAttribute('data-product-id');
        var title = row.getAttribute('data-title') || '';
        var valEl = row.querySelector('.qty-val');
        var dec = row.querySelector('.qty-dec');
        var inc = row.querySelector('.qty-inc');
        var qty = 0;

        function sync() {
          valEl.textContent = String(qty);
          dec.disabled = qty <= 0;
          inc.disabled = qty >= QTY_MAX;
          if (qty > 0) { picks[id] = { title: title, qty: qty }; }
          else { delete picks[id]; }
          render();
        }
        function setQty(next) {
          next = Math.max(0, Math.min(QTY_MAX, next));
          // Guard the cart-wide cap: block a bump that would exceed TOTAL_MAX.
          if (next > qty && totalUnits() - qty + next > TOTAL_MAX) {
            msgEl.textContent = "That's our max order — please send this one first. 💚";
            return;
          }
          msgEl.textContent = '';
          qty = next;
          sync();
        }

        dec.addEventListener('click', function () { setQty(qty - 1); });
        inc.addEventListener('click', function () { setQty(qty + 1); });
        sync();
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
          items: ids.map(function (id) {
            return { productId: id, title: picks[id].title, qty: picks[id].qty };
          }),
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
  // The page flipper ships once, and only when a preview actually renders — a
  // preview-less catalog (with or without the order form) stays this-block-free.
  const hasPreview = listed.some((p) => shouldRenderPeek(p, previews[p.id]))
  const pager = hasPreview ? pagerScript() : ''
  // Type-filter chips (FEAT-92): only when ≥2 buckets are present. The bar, its
  // script, and its styles all ride the same gate so a single-type catalog is
  // byte-identical to before.
  const filterGroups = presentFilterGroups(listed)
  const filters = filterBar(filterGroups)
  const filterCode = filters ? filterScript() : ''

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
    .peek-slide { margin-bottom: 6px; }
    /* Fixed aspect box so flipping pages never makes the card jump; contain
       (never crop/distort) since book pages and the cover vary in shape. */
    .peek-img { display: block; width: 100%; aspect-ratio: 4 / 5; object-fit: contain;
      border-radius: 8px; margin-bottom: 4px; background: #f3f7f3; }
    .peek-text { font-size: 13px; color: #444; }
    .peek-nav { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
    .peek-btn { flex: 0 0 auto; min-width: 88px; min-height: 44px; border: 2px solid #2e7d32;
      background: #fff; color: #2e7d32; font-weight: bold; font-size: 15px; border-radius: 999px;
      cursor: pointer; font-family: inherit; }
    .peek-btn:disabled { opacity: 0.4; cursor: default; }
    .peek-counter { flex: 1 1 auto; text-align: center; font-size: 13px; font-weight: bold;
      color: #555; }
    .peek-stickers { margin-top: 10px; }
    .peek-stickers-label { font-size: 13px; font-weight: bold; color: #33691e; margin-bottom: 6px; }
    .peek-sticker-strip { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px;
      -webkit-overflow-scrolling: touch; }
    .peek-sticker { flex: 0 0 auto; width: 64px; height: 64px; object-fit: contain;
      background: #f3f7f3; border-radius: 10px; padding: 4px; }
    .peek-cta { margin-top: 6px; font-size: 14px; font-weight: bold; color: #2e7d32; }
    .empty { text-align: center; color: #777; font-size: 16px; padding: 40px 12px; }
    footer { margin-top: 32px; text-align: center; font-size: 14px; color: #666; }
    footer .heart { color: #e57373; }${filters ? FILTER_STYLES : ''}${interactive ? ORDER_STYLES : ''}
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>Barnes Bros</h1>
      <div class="sub">made by ${escapeHtml(credit)}</div>
      <div class="want">${
        interactive
          ? `Set a quantity on your favorites, then send it our way 💚`
          : 'Want one? Tell us your favorites! 💚'
      }</div>
    </header>
    ${filters}
    <div class="grid">
      ${cards}
    </div>
    <footer>Made with <span class="heart" aria-hidden="true">♥</span> by ${escapeHtml(credit)}</footer>
  </div>
  ${form}
  ${pager}
  ${filterCode}
</body>
</html>`
}
