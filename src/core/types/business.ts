// ── Barnes Bros Business (FEAT-30) ────────────────────────────────
//
// Lincoln's operations-and-goal surface. Spec: docs/BUSINESS_TAB_DESIGN.md.
//
// Two load-bearing pedagogy invariants live in these shapes:
//   1. The earnings log is ADDITIVE — a `BusinessLogEntry` is an append-only
//      money-in event. There is no stored, mutable balance anywhere; progress
//      toward the goal is *derived* by summing the log. This structurally
//      enforces the additive-only thermometer (the meter only ever climbs).
//   2. The kid-visible log carries NO customer PII — only operational state
//      (amount, kit type, date, an optional kid-safe note). Customer/order
//      data is parent-gated and lands in a later chunk.

/**
 * Kit / item a sale or earning can be logged against. Additive `as const`
 * list (per the enums.ts convention) — extend as the product line grows.
 * Deliberately loose for chunk 1; price tiers and the product manifest land
 * in later slices.
 */
export const BusinessItemType = {
  StarterKit: 'StarterKit',
  PartyKit: 'PartyKit',
  CustomKit: 'CustomKit',
  StickerSheet: 'StickerSheet',
  Book: 'Book',
  Other: 'Other',
} as const
export type BusinessItemType = (typeof BusinessItemType)[keyof typeof BusinessItemType]

/** Human-readable label for each business item type. */
export const BusinessItemTypeLabel: Record<BusinessItemType, string> = {
  [BusinessItemType.StarterKit]: 'Starter Kit',
  [BusinessItemType.PartyKit]: 'Party Kit',
  [BusinessItemType.CustomKit]: 'Custom Kit',
  [BusinessItemType.StickerSheet]: 'Sticker Sheet',
  [BusinessItemType.Book]: 'Book',
  [BusinessItemType.Other]: 'Other',
}

/**
 * One additive sales/earnings event. Append-only — never edited to model a
 * balance, never negative. Kid-visible: no customer PII.
 *
 * Stored at `families/{familyId}/businessLog/{autoId}`.
 */
export interface BusinessLogEntry {
  id: string
  /** Child operator who logged it (Lincoln for now). */
  childId: string
  /** Dollars earned by this event. Additive — only ever climbs the meter. */
  amount: number
  /** What was sold / earned against. */
  itemType: BusinessItemType
  /** Sale date, `YYYY-MM-DD` per the repo date convention. */
  date: string
  /** Optional kid-safe note. NEVER customer PII. */
  note?: string
  /** ISO timestamp when the entry was logged. */
  createdAt: string
  /**
   * Parent-confirmation flag (FEAT-30 chunk 4). A sale counts toward the
   * goal/thermometer ONLY once a parent OKs it — this keeps the meter honest
   * (real money, not practice taps) while the kid keeps the freedom to log.
   *
   * Treat a missing/`undefined` value as PENDING (not counted). This is the
   * safe default: any pre-chunk-4 entry naturally stays uncounted until OK'd.
   */
  confirmed?: boolean
  /** ISO timestamp when a parent confirmed the sale. Set alongside `confirmed`. */
  confirmedAt?: string
}

/**
 * One rung of the goal stack (e.g. "Xbox Series S", "First game", "Second
 * controller"). The stack is ordered; `threshold` is the cumulative dollars
 * needed to unlock this rung (this rung's price plus every prior rung's).
 */
export interface BusinessGoalMilestone {
  /** Stable id for ordering / reference. */
  id: string
  /** Display label, e.g. "Xbox Series S". */
  label: string
  /** Price of this single milestone in dollars. */
  price: number
  /** Cumulative dollars needed to reach this rung (this price + all prior). */
  threshold: number
}

/**
 * The Xbox + games milestone stack Lincoln (with Nathan) assembles. Progress
 * is NEVER stored here — it is derived by summing the additive `businessLog`.
 * This config holds only the target rungs and their prices.
 *
 * One config per child operator. Stored at
 * `families/{familyId}/businessGoals/{childId}`.
 */
export interface BusinessGoal {
  id: string
  /** Child this goal belongs to (the operator). */
  childId: string
  /** Ordered milestone stack. The climb toward each rung is additive. */
  milestones: BusinessGoalMilestone[]
  /** ISO timestamp of the last config edit. */
  updatedAt: string
}

// ── GDQ Kit Builder (FEAT-80) ─────────────────────────────────────
//
// A kit ROSTER — a reusable cast + rules a different family plays — is business
// data, NOT a narrative (that's the Story Guide / My Books). The roster is the
// seed from which the production pipeline grows the actual kit (stickers,
// booklet, defense map, clue cards, badge). Design: docs/GDQ_KIT_BUILDER_DESIGN.md
// (§2 data model, §4 collection). Additive — nothing above moves.
//
// Load-bearing invariants baked into these shapes:
//   1. The kid's words are stored VERBATIM — no autocorrect, no normalization,
//      no capitalization fix on name/power/menace/vaultName. Weird is canon.
//   2. Targets (4–6 defenders / 3–4 invaders) are GUIDANCE, not schema caps.
//      A kid who names 7 defenders keeps all 7 — the shape never blocks a count.

/** One plant defender: a kid-named character with a kid-named power. */
export interface KitDefender {
  /** Stable id for list ordering / mid-list resume. */
  id: string
  /** The kid's word — never corrected. */
  name: string
  /** What it does — "shoots sticky sap", "grows a thorn wall". Verbatim. */
  power: string
}

/** One invader: a kid-named threat with a kid-named menace. */
export interface KitInvader {
  /** Stable id for list ordering / mid-list resume. */
  id: string
  /** The kid's word — never corrected. */
  name: string
  /** What it does — "steals the seeds", "digs under the fence". Verbatim. */
  menace: string
}

/**
 * One generated character-art reference on a roster (FEAT-88 — the kit art
 * pipeline). Points at an already-generated transparent sticker in Storage —
 * the roster REFERENCES art, exactly as `CatalogImageRef` does for products; it
 * never stores image bytes. Business art only — never a learner-model input.
 */
export interface KitArtRef {
  /** Firebase Storage download URL of the generated transparent sticker. */
  url: string
  /** Storage object path (kept for future cleanup — not engineered this slice). */
  storagePath: string
  /** ISO timestamp when the image was generated. */
  generatedAt: string
}

export const KitRosterStatus = {
  InProgress: 'InProgress',
  Complete: 'Complete',
} as const
export type KitRosterStatus = (typeof KitRosterStatus)[keyof typeof KitRosterStatus]

/**
 * A reusable GDQ kit roster — the seed for stickers, booklet, map, clue cards,
 * badge. Business data, NOT a narrative. Stored at
 * `families/{familyId}/kitRosters/{autoId}` (§4).
 */
export interface KitRoster {
  id: string
  /** The child who dreamed it up (the operator/author). */
  childId: string
  /** Capture provenance — always 'kitBuilder' for this flow. */
  source: 'kitBuilder'
  status: KitRosterStatus

  // ── The roster ──
  vaultName: string
  heroName: string
  heroLook: string
  heroMove: string
  defenders: KitDefender[] // target 4–6 (guidance, not a cap)
  invaders: KitInvader[] // target 3–4 (guidance, not a cap)
  winCondition: string

  /**
   * Which capture beat is "current" for mid-flow resume (§3). Free-form beat key
   * (e.g. 'vault' | 'hero.look' | 'defenders' | 'invaders' | 'win' | 'done'),
   * NOT a numeric index — the defender/invader beats are variable-length.
   */
  resumeBeat?: string

  /**
   * Optional per-character generated sticker art (FEAT-88). Keyed by a **stable**
   * character key: `hero`, `defender:${defender.id}`, `invader:${invader.id}`
   * (see `kitArt.ts`). Additive + **partial** — some characters may have art
   * while others don't; a regenerate replaces that key's ref (the prior Storage
   * file may linger — cleanup is deliberately out of scope this slice). Business
   * art only: never a learner-model / compliance / hours / XP input.
   */
  art?: Record<string, KitArtRef>

  createdAt: string // ISO
  updatedAt: string // ISO
}

// ── Barnes Bros Product Catalog (FEAT-81) ─────────────────────────
//
// The "show" layer for the business — a curated catalog / lookbook of what the
// boys offer (design: docs/BARNES_BROS_CATALOG_DESIGN.md §2). A CatalogProduct
// is parent-curated: kids' made things (Books / stickers / kit rosters) are the
// SOURCE; a parent promotes one into a product, sets its price, and lists it.
// Additive — nothing above moves. Business data, NOT a learner-model input (no
// concept states, no compliance/hours/XP writes — §5).
//
// Load-bearing invariants baked into these shapes:
//   1. `images` hold REFERENCES to already-generated art (Storage URLs) — never
//      a new asset; the catalog never regenerates art (§6).
//   2. Pricing + `status` transitions are parent-only (§6). The shape keeps the
//      kids' `madeBy` credit verbatim; a kid never publishes or prices — that is
//      enforced at the surface via `canEdit`.

/** One image on a catalog product — a REFERENCE to existing art, not a new asset. */
export interface CatalogImageRef {
  /** Firebase Storage download URL of an already-generated image. */
  url: string
  /** Optional alt text for accessibility / the printable & web views. */
  alt?: string
}

/** Where a promoted product came from (optional — manual products omit it). */
export interface CatalogSourceRef {
  /** The source collection: a finished Book, a sticker, or a FEAT-80 KitRoster. */
  kind: 'book' | 'sticker' | 'kitRoster'
  /** Doc ID in the source collection. */
  id: string
}

/** Lifecycle of a catalog product. Only `Listed` is eligible for a public export (§4). */
export const CatalogProductStatus = {
  Draft: 'draft',
  Listed: 'listed',
  Retired: 'retired',
} as const
export type CatalogProductStatus = (typeof CatalogProductStatus)[keyof typeof CatalogProductStatus]

/** Human-readable label for each catalog product status. */
export const CatalogProductStatusLabel: Record<CatalogProductStatus, string> = {
  [CatalogProductStatus.Draft]: 'Draft',
  [CatalogProductStatus.Listed]: 'Listed',
  [CatalogProductStatus.Retired]: 'Retired',
}

/**
 * A product the Barnes Bros offer, shown in the in-app catalog / lookbook
 * (design §2). Stored at `families/{familyId}/catalogProducts/{autoId}`.
 * Family-scoped: a catalog is the family's storefront, not per-child.
 */
export interface CatalogProduct {
  id: string
  /** Display name, e.g. "Garden Defense Quest — Seed Vault Kit". */
  title: string
  /**
   * What kind of product this is. REUSES `BusinessItemType` so a catalog item
   * and a `businessLog` sale line-item speak the same vocabulary
   * (StarterKit / PartyKit / CustomKit / StickerSheet / Book / Other).
   */
  type: BusinessItemType
  /** Parent/kid-authored blurb. Empty string until written. */
  description: string
  /**
   * Price in whole cents (avoids float drift; display divides by 100). `0` means
   * "no price yet" — a draft promoted from a roster starts unpriced, since
   * pricing is parent-only (§2/§6).
   */
  priceCents: number
  /**
   * Image references. These POINT AT already-generated art — a Book's
   * `coverImageUrl`, a sticker's stored URL, a kit's sticker sheet. The catalog
   * NEVER regenerates art (§6). Empty ⇒ the card shows a placeholder.
   */
  images: CatalogImageRef[]
  /**
   * Optional provenance: what artifact this product was promoted from. Lets
   * "made by…" and the source thumbnail resolve without duplicating data.
   * Omitted on manually-authored products.
   */
  sourceRef?: CatalogSourceRef
  /** Child names credited, e.g. ["Lincoln", "London"]. Stored verbatim. */
  madeBy: string[]
  /** Lifecycle. Only `listed` products are eligible for the public export (§4). */
  status: CatalogProductStatus
  /**
   * Opt-in book preview (FEAT-85, design §4). When `true`, a listed product
   * promoted from a Book (`sourceRef.kind === 'book'`) publishes a **partial**
   * peek — cover + the first {@link previewPageCount} pages — inside the public
   * catalog page. **Default OFF** and parent-controlled: never auto-enabled, and
   * meaningless for non-book products (nothing to page through). It is a
   * deliberately partial preview — never the whole book (that IS the product).
   */
  includePreview?: boolean
  /**
   * How many inside pages the preview shows (FEAT-85). Default 3, capped at 5 —
   * a taste, not the book. Only meaningful when `includePreview` is set.
   */
  previewPageCount?: number
  /** ISO timestamp. */
  createdAt: string
  /** ISO timestamp of last parent edit. */
  updatedAt: string
}

// ── Barnes Bros Order Queue (FEAT-89) ─────────────────────────────
//
// The outreach loop closed: a family on the published catalog site
// (barnesbro.web.app, FEAT-84/85/86) says WHAT they want and WHO they are, and
// it lands in-app as an ORDER the kids fulfill and track. Design:
// docs/BARNES_BROS_CATALOG_DESIGN.md §4 (order capture) / §6 (scope).
//
// Owner decision (2026-07-18): FEAT-84's "no customer data" rail is CONSCIOUSLY
// lifted, MINIMALLY scoped — an order captures a first name + picked products +
// an optional note + an optional contact line. NOTHING else: no address, no
// payment, no required email, no accounts. The audience is people the family
// already knows.
//
// Load-bearing invariants baked into these shapes:
//   1. Status moves FORWARD ONLY through the fixed flow (new → making → ready →
//      delivered). The stepper never regresses — `nextOrderStatus` is the only
//      transition, and it returns `null` at the end. No timers, no due-dates, no
//      overdue language: the mechanic carries the message.
//   2. Business data, NOT a learner-model input — no concept states, no
//      compliance / hours / XP writes (mirrors the catalog §5 rail).
//   3. The making is the KIDS' work: advancing status is NOT parent-gated (any
//      family member steps it). Only a future destructive op (delete/archive)
//      would be parent-gated.

/** One line-item on an order — a REFERENCE to a catalog product the family picked. */
export interface CatalogOrderItem {
  /** The `CatalogProduct` doc ID the family picked. */
  productId: string
  /** The product title at order time (snapshot — survives a later retitle). */
  title: string
  /**
   * How many of this product the customer wants (FEAT-92). Additive + optional:
   * orders placed before the qty cart omit it, and are read as a single unit —
   * always resolve via {@link orderItemQty}, never `item.qty` directly.
   */
  qty?: number
}

/**
 * The quantity for a line-item, tolerant of legacy orders (FEAT-92). Pre-cart
 * orders have no `qty` → 1; a malformed / non-positive value also floors to 1.
 * The single reader for order quantity so the "default 1" rule lives in one place.
 */
export function orderItemQty(item: CatalogOrderItem): number {
  const q = item.qty
  return typeof q === 'number' && Number.isInteger(q) && q > 0 ? q : 1
}

/** Fulfillment lifecycle of an order. Advances forward only (invariant 1). */
export const CatalogOrderStatus = {
  New: 'new',
  Making: 'making',
  Ready: 'ready',
  Delivered: 'delivered',
} as const
export type CatalogOrderStatus = (typeof CatalogOrderStatus)[keyof typeof CatalogOrderStatus]

/** Human-readable label for each order status. */
export const CatalogOrderStatusLabel: Record<CatalogOrderStatus, string> = {
  [CatalogOrderStatus.New]: 'New',
  [CatalogOrderStatus.Making]: 'Making',
  [CatalogOrderStatus.Ready]: 'Ready',
  [CatalogOrderStatus.Delivered]: 'Delivered',
}

/**
 * The fixed forward-only order flow. The stepper walks this array left→right and
 * never back — the single source of truth for both the UI stepper and the
 * `nextOrderStatus` transition helper.
 */
export const CATALOG_ORDER_STATUS_FLOW: readonly CatalogOrderStatus[] = [
  CatalogOrderStatus.New,
  CatalogOrderStatus.Making,
  CatalogOrderStatus.Ready,
  CatalogOrderStatus.Delivered,
] as const

/**
 * The next status forward in the flow, or `null` at the end (`delivered`). This
 * is the ONLY status transition — there is deliberately no "back" helper, which
 * structurally enforces the forward-only invariant.
 */
export function nextOrderStatus(status: CatalogOrderStatus): CatalogOrderStatus | null {
  const i = CATALOG_ORDER_STATUS_FLOW.indexOf(status)
  if (i < 0 || i >= CATALOG_ORDER_STATUS_FLOW.length - 1) return null
  return CATALOG_ORDER_STATUS_FLOW[i + 1]
}

/**
 * A family's order — placed from the public catalog site, fulfilled in-app.
 * Stored at `families/{familyId}/orders/{autoId}`. Family-scoped (a catalog is
 * the family's storefront). Minimally scoped customer data (owner decision,
 * invariant above): a first name + picks + optional note + optional contact.
 */
export interface CatalogOrder {
  id: string
  /** The customer's first name (required on the form). Stored verbatim. */
  customerName: string
  /** The catalog products they picked (≥ 1). Titles snapshotted at order time. */
  items: CatalogOrderItem[]
  /** Optional free-text note from the customer ("London's is blue please!"). */
  note?: string
  /** Optional contact line the customer chose to leave (phone / handle / "text me"). */
  contact?: string
  /** Fulfillment status — advances forward only. New orders start `new`. */
  status: CatalogOrderStatus
  /** ISO timestamp the order was placed (server-stamped by the endpoint). */
  createdAt: string
  /** ISO timestamp of the last status advance. */
  updatedAt: string
}

// ── Kid art-generation quota (FEAT-94) ────────────────────────────

/**
 * A per-child, per-day counter for kid-initiated art generation (FEAT-94). Each
 * image generation is a paid call, so a kid profile gets a light, non-shaming
 * daily cap (never a lock) — this doc just counts today's generations. Parent
 * profiles are uncapped and never read/write it.
 *
 * Doc ID: `{childId}-{YYYY-MM-DD}`. Additive, client-written under the existing
 * owner Firestore rule (kids share the family auth, so the cap is UX, not
 * security). No schema churn — a tiny standalone counter, not a child record.
 */
export interface ArtQuota {
  /** The operator this counter belongs to. */
  childId: string
  /** The local day this counter covers (`YYYY-MM-DD`). */
  date: string
  /** How many generations have been recorded today. */
  count: number
  /** ISO timestamp of the last increment. */
  updatedAt: string
}
