// ── Public order submission validation (FEAT-89) ───────────────────
//
// Pure, admin-SDK-free validation for the public catalog order form. The public
// catalog page (barnesbro.web.app / the Storage-hosted static page) has NO auth
// and NO backend, so an order needs a server write path. We chose W1 — an
// unauthenticated `onRequest` Cloud Function (`submitCatalogOrder`) — over W2 (a
// public create-only Firestore rule) because it keeps `firestore.rules`
// owner-only + untouched AND gives real spam control (honeypot, rate limit,
// origin lock, product-id allowlist). This module is the schema-validation half,
// kept pure so it unit-tests without Firestore. See
// docs/BARNES_BROS_CATALOG_DESIGN.md §4.
//
// Owner decision (2026-07-18): the "no customer data" rail is CONSCIOUSLY lifted,
// MINIMALLY scoped — first name + picked products + optional note + optional
// contact. Nothing else. These caps enforce that scope structurally.

/** Field length / count caps — generous for real people, tight against abuse. */
export const ORDER_LIMITS = {
  /** Max customer first-name length. */
  nameMax: 80,
  /** Max free-text note length. */
  noteMax: 600,
  /** Max optional contact-line length. */
  contactMax: 120,
  /** Max distinct items (line-items) on one order. */
  itemsMax: 40,
  /** Max quantity per line-item (FEAT-92 stepper caps at 9). */
  qtyMax: 9,
  /** Max total units across all line-items on one order (FEAT-92 cart cap). */
  totalQtyMax: 20,
  /** Max product-id length (Firestore auto-IDs are 20 chars; allow slack). */
  productIdMax: 128,
  /** Max product-title length. */
  titleMax: 200,
  /** Max total JSON body bytes accepted before parsing further. */
  bodyBytesMax: 16 * 1024,
} as const

/** The honeypot field name — a hidden input a human never fills, a bot often does. */
export const HONEYPOT_FIELD = 'website'

/** One validated line-item. */
export interface ValidatedOrderItem {
  productId: string
  title: string
  /** How many of this product (FEAT-92). Always ≥ 1 after validation. */
  qty: number
}

/** A clean, ready-to-write order (sans server-stamped id / timestamps / status). */
export interface ValidatedOrder {
  customerName: string
  items: ValidatedOrderItem[]
  note?: string
  contact?: string
}

/**
 * Result of validating a raw submission. `spam: true` means the honeypot was
 * tripped — the caller should ACK with success (so a bot learns nothing) but
 * write nothing. `ok: false` is an honest client error (400).
 */
export type OrderValidationResult =
  | { ok: true; spam: false; order: ValidatedOrder }
  | { ok: true; spam: true }
  | { ok: false; spam: false; reason: string }

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * Parse a line-item quantity (FEAT-92). Absent (legacy / stepper-omitted) → 1.
 * Present must be an integer in `1..qtyMax` — a float, non-number, or
 * out-of-range value is rejected (`null`) so a crafted payload can't order 10⁶.
 */
function parseQty(v: unknown): number | null {
  if (v === undefined || v === null) return 1
  if (typeof v !== 'number' || !Number.isInteger(v)) return null
  if (v < 1 || v > ORDER_LIMITS.qtyMax) return null
  return v
}

/**
 * Validate + normalize a raw parsed request body into a clean order, or reject.
 *
 * - Honeypot first: any non-empty honeypot value → `{ ok: true, spam: true }`.
 * - `customerName` required, trimmed, ≤ cap.
 * - `items` required, array of `{ productId, title }`, 1..itemsMax, each capped.
 *   If `allowedProducts` is provided (the family's LISTED products as an
 *   id→title map), items whose `productId` isn't listed are dropped, and the
 *   stored **authoritative title** REPLACES the client-supplied one — a valid id
 *   can't be paired with a misleading title (the browser snapshot is never
 *   trusted for display). An order with no surviving item is rejected. When the
 *   map is absent (allowlist lookup failed/unavailable), well-formed items pass
 *   on caps alone, keeping the client title.
 * - `note` / `contact` optional, trimmed, ≤ caps; empty → omitted.
 *
 * Never throws — every malformed shape returns an `{ ok: false }` reason.
 */
export function validateOrderSubmission(
  body: unknown,
  allowedProducts?: ReadonlyMap<string, string>,
): OrderValidationResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, spam: false, reason: 'Body must be a JSON object.' }
  }
  const b = body as Record<string, unknown>

  // Honeypot: a filled hidden field means a bot. ACK-and-drop (don't tip it off).
  if (asString(b[HONEYPOT_FIELD]).trim().length > 0) {
    return { ok: true, spam: true }
  }

  const customerName = asString(b.customerName).trim()
  if (!customerName) {
    return { ok: false, spam: false, reason: 'A first name is required.' }
  }
  if (customerName.length > ORDER_LIMITS.nameMax) {
    return { ok: false, spam: false, reason: 'Name is too long.' }
  }

  if (!Array.isArray(b.items) || b.items.length === 0) {
    return { ok: false, spam: false, reason: 'Pick at least one item.' }
  }
  if (b.items.length > ORDER_LIMITS.itemsMax) {
    return { ok: false, spam: false, reason: 'Too many items.' }
  }

  const items: ValidatedOrderItem[] = []
  for (const raw of b.items) {
    if (typeof raw !== 'object' || raw === null) {
      return { ok: false, spam: false, reason: 'Malformed item.' }
    }
    const item = raw as Record<string, unknown>
    const productId = asString(item.productId).trim()
    if (!productId || productId.length > ORDER_LIMITS.productIdMax) {
      return { ok: false, spam: false, reason: 'Malformed item id.' }
    }
    const qty = parseQty(item.qty)
    if (qty === null) {
      return { ok: false, spam: false, reason: 'Bad item quantity.' }
    }
    let title: string
    if (allowedProducts) {
      // Product-id allowlist available: drop unlisted picks and take the
      // AUTHORITATIVE stored title — never trust the browser's title snapshot.
      const authoritative = allowedProducts.get(productId)
      if (authoritative === undefined) continue
      title = authoritative.slice(0, ORDER_LIMITS.titleMax)
    } else {
      // Allowlist unavailable (transient read failure): keep the client title,
      // cap-checked, so a real order still lands rather than being rejected.
      title = asString(item.title).trim()
      if (!title || title.length > ORDER_LIMITS.titleMax) {
        return { ok: false, spam: false, reason: 'Malformed item title.' }
      }
    }
    items.push({ productId, title, qty })
  }
  if (items.length === 0) {
    return { ok: false, spam: false, reason: 'No valid items in this order.' }
  }
  // Total-units cap (FEAT-92): sum of quantities across surviving line-items.
  const totalUnits = items.reduce((n, it) => n + it.qty, 0)
  if (totalUnits > ORDER_LIMITS.totalQtyMax) {
    return { ok: false, spam: false, reason: 'Too many items.' }
  }

  const order: ValidatedOrder = { customerName, items }

  const note = asString(b.note).trim()
  if (note.length > ORDER_LIMITS.noteMax) {
    return { ok: false, spam: false, reason: 'Note is too long.' }
  }
  if (note) order.note = note

  const contact = asString(b.contact).trim()
  if (contact.length > ORDER_LIMITS.contactMax) {
    return { ok: false, spam: false, reason: 'Contact is too long.' }
  }
  if (contact) order.contact = contact

  return { ok: true, spam: false, order }
}

/** A Firestore auto-ID is 20 URL-safe chars — a cheap sanity gate on `familyId`. */
export function isPlausibleFamilyId(familyId: unknown): familyId is string {
  return typeof familyId === 'string' && /^[A-Za-z0-9_-]{6,128}$/.test(familyId)
}

// ── CORS origin lock ───────────────────────────────────────────────

/**
 * Origins allowed to POST an order: the published catalog's homes. The static
 * page is served from Storage (`firebasestorage.googleapis.com`); the short +
 * `/shop` addresses live on the two Hosting sites (FEAT-85/86/87).
 */
export const ALLOWED_ORDER_ORIGINS: readonly string[] = [
  'https://firebasestorage.googleapis.com',
  'https://barnesbro.web.app',
  'https://barnesbro.firebaseapp.com',
  'https://first-principles-engine.web.app',
  'https://first-principles-engine.firebaseapp.com',
] as const

/** True when the request Origin is in the allowlist (exact match, case-sensitive). */
export function isAllowedOrigin(origin: string | undefined): boolean {
  return typeof origin === 'string' && ALLOWED_ORDER_ORIGINS.includes(origin)
}

// ── Lightweight per-IP rate limit (best-effort, in-memory) ─────────

interface RateWindow {
  count: number
  resetAt: number
}

/**
 * A tiny fixed-window rate limiter over an injected clock + store. Per-instance
 * and best-effort (a v2 function can have several warm instances) — a floor
 * against a single noisy client, NOT a hard quota. Pairs with the honeypot +
 * origin lock + schema caps; the endpoint is low-value so this is sufficient.
 */
export function checkRateLimit(
  key: string,
  now: number,
  store: Map<string, RateWindow>,
  limit = 10,
  windowMs = 60_000,
): boolean {
  const w = store.get(key)
  if (!w || now >= w.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (w.count >= limit) return false
  w.count += 1
  return true
}
