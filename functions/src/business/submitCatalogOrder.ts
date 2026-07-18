// ── Public catalog order endpoint (FEAT-88) ────────────────────────
//
// The write path for the public catalog order form (`buildPublicCatalogHtml`'s
// baked form). The published page has no auth and no backend, so this
// unauthenticated HTTPS function is the server that receives an order and writes
// it to `families/{familyId}/orders` via the admin SDK — leaving
// `firestore.rules` owner-only and UNTOUCHED (mechanism W1; see
// docs/BARNES_BROS_CATALOG_DESIGN.md §4 and orderValidation.ts).
//
// Defense in depth (an unauthenticated endpoint):
//   1. CORS origin lock — only the catalog's own origins may call it.
//   2. Honeypot — a filled hidden field ACKs success but writes nothing.
//   3. Rate limit — best-effort per-IP fixed window (in-memory).
//   4. Schema validation + caps — pure `validateOrderSubmission`.
//   5. Product-id allowlist — items must match the family's LISTED products.
//
// This function ONLY writes an order. No learner-model / compliance / hours / XP
// write; business data, not a child's record (catalog §5 rail).

import { getFirestore } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import type { Response } from "express";

import {
  ALLOWED_ORDER_ORIGINS,
  checkRateLimit,
  isAllowedOrigin,
  isPlausibleFamilyId,
  ORDER_LIMITS,
  validateOrderSubmission,
} from "./orderValidation.js";
import type { ValidatedOrder } from "./orderValidation.js";

/** Best-effort in-memory rate-limit store (per warm instance). */
const rateStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Read the family's LISTED catalog products as an id→title map, or `undefined`
 * if the lookup fails / the family has no catalog. `undefined` (not an empty
 * map) signals "allowlist unavailable" so validation falls back to caps-only
 * rather than rejecting every item on a transient read error. The title lets the
 * endpoint store the AUTHORITATIVE product name instead of the browser snapshot.
 */
async function loadListedProducts(
  db: FirebaseFirestore.Firestore,
  familyId: string,
): Promise<ReadonlyMap<string, string> | undefined> {
  try {
    const snap = await db
      .collection(`families/${familyId}/catalogProducts`)
      .where("status", "==", "listed")
      .get();
    const map = new Map<string, string>();
    for (const d of snap.docs) {
      const title = (d.data() as { title?: unknown }).title;
      map.set(d.id, typeof title === "string" ? title : "");
    }
    return map;
  } catch {
    return undefined;
  }
}

/** Apply the CORS headers for an allowed origin (or leave them unset). */
function applyCors(req: Request, res: Response): void {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    res.set("Access-Control-Allow-Origin", origin as string);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Max-Age", "3600");
}

/**
 * `submitCatalogOrder` — the unauthenticated public order endpoint. Accepts a
 * JSON POST `{ familyId, customerName, items:[{productId,title}], note?, contact?,
 * website? }`, validates + rate-limits + allowlists, and writes one order doc.
 *
 * Always returns JSON. A tripped honeypot returns 200 `{ ok: true }` and writes
 * nothing (so a bot learns nothing). Real client errors return 400 with a short
 * honest reason the form shows on retry.
 */
export const submitCatalogOrder = onRequest(
  { cors: false }, // We handle CORS ourselves against a strict allowlist.
  async (req: Request, res: Response): Promise<void> => {
    applyCors(req, res);

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Use POST." });
      return;
    }
    // Origin lock — reject calls from anywhere but the catalog's own pages.
    if (!isAllowedOrigin(req.headers.origin)) {
      res.status(403).json({ ok: false, error: "Origin not allowed." });
      return;
    }
    // Body-size ceiling (before trusting the parsed body).
    const rawLen = req.rawBody?.length ?? 0;
    if (rawLen > ORDER_LIMITS.bodyBytesMax) {
      res.status(413).json({ ok: false, error: "Order too large." });
      return;
    }

    // Best-effort per-IP rate limit. `req.ip` is populated by the runtime.
    const ip = req.ip || "unknown";
    if (!checkRateLimit(ip, Date.now(), rateStore)) {
      res.status(429).json({ ok: false, error: "Slow down a moment and try again." });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const familyId = body.familyId;
    if (!isPlausibleFamilyId(familyId)) {
      res.status(400).json({ ok: false, error: "Missing shop id." });
      return;
    }

    const allowed = await loadListedProducts(getFirestore(), familyId);
    const result = validateOrderSubmission(body, allowed);

    // Honeypot tripped — pretend all is well, write nothing.
    if (result.ok && result.spam) {
      res.status(200).json({ ok: true });
      return;
    }
    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.reason });
      return;
    }

    try {
      await writeOrder(getFirestore(), familyId, result.order);
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error(`[submitCatalogOrder] write failed for family=${familyId}:`, err);
      res.status(500).json({ ok: false, error: "Could not save the order. Please try again." });
    }
  },
);

/** Write a validated order to `families/{familyId}/orders`, server-stamping status + times. */
export async function writeOrder(
  db: FirebaseFirestore.Firestore,
  familyId: string,
  order: ValidatedOrder,
): Promise<void> {
  const now = new Date().toISOString();
  await db.collection(`families/${familyId}/orders`).add({
    customerName: order.customerName,
    items: order.items,
    ...(order.note ? { note: order.note } : {}),
    ...(order.contact ? { contact: order.contact } : {}),
    status: "new",
    createdAt: now,
    updatedAt: now,
  });
}

// Re-export the origin allowlist so a config/test can assert it stays in sync.
export { ALLOWED_ORDER_ORIGINS };
