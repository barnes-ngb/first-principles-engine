# Barnes Bros Product Catalog + Website Export Path

**Status:** design + slices 1–3 + Option C shipped + Option C polish (clean address + book previews) (PRs open) · v0.3 · 2026-07-18
**Ledger anchor:** FEAT-79 (design); build rows FEAT-80/81/82/83/84/85
**Depends on:** FEAT-78 (GDQ Kit Builder — `docs/GDQ_KIT_BUILDER_DESIGN.md`)
**Companion to:** `BUSINESS_TAB_DESIGN.md` (FEAT-30), `GARDEN_DEFENSE_QUEST_PLAN.md` (FEAT-29)

> **Owner decision (2026-07-17): the sale-gate on the public storefront is lifted.**
> The catalog now holds real `listed`/priced products with real art, and the near-term
> family outreach ("send a link, they pick, no money") is better served by a URL than a PDF.
> Option C is therefore built now (as **C1**, see §4) **consciously un-gated** — the
> "kit #1 + one confirmed sale" predicate in §1/§7 no longer blocks it. The other Never
> invariants (§6) still hold: no public Firestore read, no PII capture, the authed app
> is never exposed.

Design-only. No source is authorized by this doc. Build is serialized and gated (see §7).

---

## 1. Problem + dependency order

The Barnes Bros business can already **make** things and **track** sales, but has no way to
**show** what the boys offer.

- **Make** — finished `Book`s (My Books), stickers (`gpt-image-1.5` cutout / `book-sticker`),
  and — once FEAT-78 ships — a `KitRoster` that becomes a real physical/digital kit.
- **Track** — `businessLog` (append-only money-in) + `businessGoals` (the Xbox milestone
  thermometer), surfaced on `BusinessPage`.
- **Show** — *missing.* There is no curated product view, no lookbook, no "here's what we sell."
- **Sell** — also missing, and deliberately downstream of Show.

This doc designs the **middle (Show)** — a curated catalog / lookbook — and the **path to Sell**
(a website / export layer that is a thin view over the catalog).

### Honest dependency order (state this up front, do not skip it)

```
Kit Builder (FEAT-78)  →  first roster  →  kit #1 is real
                                              │
                                              ▼
                    catalog holds REAL products (not mockups)
                                              │
                                              ▼
              website / export = thin public layer over the catalog
                                              │
                     ┌────────────────────────┴───────────────────────┐
                     │  GATE: no website is built until kit #1 is real  │
                     │  AND has had one parent-confirmed sale.          │
                     └──────────────────────────────────────────────────┘
```

Two hard facts this doc commits to:

1. **The catalog can be designed now but cannot be populated until FEAT-78 ships.** A kit
   product does not exist until a roster becomes kit #1. Until then the catalog holds only
   Books and stickers, and its kit section is empty by design.
2. **The website (the "sell" half) is NOT built until kit #1 is real and has had one
   parent-confirmed sale** — the validation gate carried over from the GDQ strategy docs
   (`GARDEN_DEFENSE_QUEST_PLAN.md`: "The website isn't the starting move … worth the listing
   effort only once a product is proven"). This doc **plans** the sell path; it does **not**
   authorize premature storefront work.

Parent-confirmed sale is already a first-class concept: `BusinessLogEntry.confirmed` is the
existing honest-money flag the thermometer climbs on (`useBusinessLog.confirmSale`). The sale
gate **builds on** that signal — but `confirmed` alone is **not** a sufficient gate predicate.
A `BusinessLogEntry` is keyed by `amount`/`itemType`/`date`/`note` and carries **no link to a
`CatalogProduct` or `KitRoster` source**, so "some confirmed sale exists" would also be satisfied
by an earlier confirmed Book/Sticker/Other sale, or by a different kit — marking the storefront
validated without proving that **kit #1 specifically sold**. The gate therefore needs a
**sale-to-product link**, resolved before Option C is built (Open decision 7):

- **Minimum (no schema change):** require a confirmed entry whose `itemType` is a kit type
  (`StarterKit`/`PartyKit`/`CustomKit`) — a coarse proxy that at least excludes Book/Sticker sales,
  but still can't distinguish kit #1 from a later kit.
- **Correct (small additive change):** add an optional `sourceRef` (or `catalogProductId`) to
  `BusinessLogEntry` so a confirmed sale points at the exact `CatalogProduct` it sold. Touching
  `BusinessLogEntry` is a business-invariant-adjacent edit (the additive log shape) → propose →
  confirm; this is why it is a decision, not a default.

The gate is a human/parent judgment either way (a parent decides the storefront is worth standing
up); the predicate above matters only if/when the gate is ever enforced in code.

---

## 2. `CatalogProduct` data model (proposed)

Additive. New `catalogProducts` collection, auto-ID docs, same converter pattern as
`businessLog` (spread data, then `id` from the snapshot so the doc ID wins). No existing type
or collection changes.

```ts
// src/core/types/business.ts (proposed addition — additive)

/** A product the Barnes Bros offer, shown in the in-app catalog / lookbook. */
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
  /** Parent/kid-authored blurb. */
  description: string
  /** Price in whole cents (avoids float drift; display divides by 100). */
  priceCents: number
  /**
   * Image references. These POINT AT already-generated art — a Book's
   * `coverImageUrl`, a sticker's stored image URL, a kit's sticker sheet.
   * The catalog NEVER regenerates art (see §6).
   */
  images: CatalogImageRef[]
  /**
   * Optional provenance: what artifact this product was promoted from.
   * Lets "made by…" and the source thumbnail resolve without duplicating data.
   */
  sourceRef?: CatalogSourceRef
  /** Child names credited, e.g. ["Lincoln", "London"]. */
  madeBy: string[]
  /** Lifecycle. Only `listed` products are eligible for the public export (§4). */
  status: 'draft' | 'listed' | 'retired'
  /** ISO timestamp. */
  createdAt: string
  /** ISO timestamp of last parent edit. */
  updatedAt: string
}

/** One image on a catalog product — a REFERENCE, not a new asset. */
export interface CatalogImageRef {
  /** Firebase Storage download URL of an already-generated image. */
  url: string
  /** Optional alt text for accessibility / the printable & web views. */
  alt?: string
}

/** Where a promoted product came from (optional — manual products omit it). */
export interface CatalogSourceRef {
  /** 'book' | 'sticker' | 'kitRoster' (the FEAT-78 collection). */
  kind: 'book' | 'sticker' | 'kitRoster'
  /** Doc ID in the source collection. */
  id: string
}
```

Collection helper (proposed, mirrors `businessLogCollection` in `firestore.ts`):

```ts
/** Curated products the Barnes Bros show/sell. Path: families/{familyId}/catalogProducts/{autoId} */
export const catalogProductsCollection = (familyId: string): CollectionReference<CatalogProduct> =>
  collection(db, `families/${familyId}/catalogProducts`).withConverter(catalogProductConverter)
    as CollectionReference<CatalogProduct>
```

### Authoring: two paths, both parent-gated

1. **Manual** — a parent fills the catalog-entry form (title, type, price, description, pick
   one or more existing images, credit the makers). `sourceRef` omitted.
2. **Promote from artifact** — a parent starts from a finished `Book`, a generated sticker set,
   or a `KitRoster` (FEAT-78) and the form pre-fills `title` / `images` / `madeBy` / `sourceRef`
   from that source, then the parent sets price + status. This is the primary path once there
   are real things to promote.

Pricing and `status` transitions are **parent-only** — a kid never publishes or prices without
parent confirmation (§6). Kids' made things are the *source*; a parent curates them into products.

---

## 3. In-app Catalog surface (the "show" — build this first, after FEAT-78)

A catalog view inside the Barnes Bros area — a **sibling** of the existing Operations and Goal
regions on `BusinessPage`, not a redesign. Read the existing `SectionCard` / `SectionErrorBoundary`
+ MUI `Stack` styling and match it.

- **Layout:** product cards grouped by `BusinessItemType` (Kits · Sticker Sheets · Books · Other),
  each card showing the image, title, price (`$` from `priceCents`), and "made by Lincoln /
  London". `draft` products show a subtle draft chip; `retired` are hidden from the default view.
- **Doubles as a pride wall.** Even before anything sells, the catalog is the boys' shelf of
  what they've made — a motivator, not just a storefront back-office.
- **Empty state (honest about the dependency):** when there are no products, the card reads
  *"Add your first product once you've made a kit."* — acknowledging the FEAT-78 dependency
  rather than showing a dead grid.
- **Parent-curated:** the entry/promote form (§2) and price/status controls are gated on the
  existing `canEdit` (`useProfile`), the same gate the sale-confirm controls already use.

Where it slots in: a third `SectionCard` ("Catalog") on `BusinessPage`, or — if the page gets
busy — a lightweight tab within the Barnes Bros area. Start with the section card; it's the
smaller slice and matches the current single-page shape.

---

## 4. Website export path (the "sell" — designed, NOT built)

Three escalating options, honestly costed. The catalog makes all three **thin**, because each is
just a *view over the same `catalogProducts` data*. Owner picks later; the recommended order is a
ladder (A → B → C), climbed only as demand is proven.

### Option A — Printable / PDF order sheet (cheapest)

The catalog renders to a one-page printable "Barnes Bros catalog" — reuse the existing PDF
pattern the books feature already uses (`features/books` print/PDF). Hand out at parties, on the
porch, at the door.

- **Cost:** near-zero. No hosting, no new infra, no auth changes. Works **today** once products exist.
- **Requires:** only the catalog data + a print stylesheet / PDF export of the `listed` products.
- **Best for:** the local birthday-party / porch channel the GDQ plan leads with.

### Option B — Etsy listing export (established channel)

The catalog exports listing-ready fields (title, description, price, image URLs) to a
copy-pasteable block — or a CSV — the owner pastes into **Etsy**.

- **Cost:** low. No new hosting. A pure client-side transform of `catalogProducts` → Etsy fields.
- **Respects the adult-account requirement:** the GDQ docs note Etsy is Nathan's **adult**
  account and flag MO sales-tax / licensing constraints (`GARDEN_DEFENSE_QUEST_PLAN.md` §"Platform
  ages", "marketplaces"). This export **feeds** the adult account; it does not let a kid list
  anything, and it introduces no in-app commerce.
- **Best for:** the **digital** kit line specifically (the GDQ plan: "Lead digital on Etsy; keep
  physical local"), once there's inventory worth the listing effort.

### Option C — Public storefront site (biggest) — SHIPPED as **C1** (FEAT-84, 2026-07-17)

A separate, **static, unauthenticated** page serving `status: 'listed'` products — a thin
read-only lookbook generated from the catalog.

> **Shipped as C1 (Storage-published static page), not C2 (second Hosting target).**
> Recon confirmed C2 would need a **deploy per republish** (a push to the `deploy` branch
> triggers the full CI deploy) — a poor fit for a phone-only owner who republishes whenever
> the catalog changes. **C1** instead: the parent taps "Publish site" → the `listed` products
> render to a self-contained static page (`publicCatalogPage.ts`, the mobile-first sibling of
> FEAT-83's `catalogSheet.ts`) → it uploads to a **world-readable, per-family** Storage path
> (`public/catalog/{familyId}/index.html`) → the parent shares the stable, token-less URL.
> Republish is one tap, no deploy. Images **reference the products' existing Storage download
> URLs** directly (those carry a download token, so they resolve for a not-logged-in viewer
> with no rules change — the design's static-snapshot recommendation below). The only rules
> change is the narrow, world-readable `public/catalog/{familyId}/**` **Storage** rule —
> **read public, but create/update/delete gated on `isOwner(familyId)`** so one family can
> never clobber another's storefront (per Codex review); `firestore.rules` is **untouched**.

> **Polished by FEAT-85 (2026-07-18) — clean address + opt-in book previews (no rules change).**
> **(1) Clean, steady address.** The token-less Storage URL is stable but unreadably long, so a
> **thin one-time redirect** gives it a short, sayable address. Recon chose **R1** (`/shop` on the
> existing Hosting site) over R2 (a dedicated `barnes-bros` site): R2 needs a one-time
> `firebase hosting:sites:create` + target the deploy workflow can't perform and a globally-unique
> name — an owner console step, so a HARD STOP → R1 (noted as a follow-up). `public/shop/index.html`
> is copied into `dist` and, because Firebase serves static files before the SPA catch-all rewrite,
> `/shop` resolves ahead of the app router and `location.replace`s to the stable published URL. It
> never redeploys on republish (the target is stable), so **republish stays one tap**. The redirect
> bakes its target in a single `CATALOG_URL` constant (single-family — the familyId is a runtime
> UID, so the owner sets it once from the "live" panel; until then `/shop` shows a friendly note).
> The in-app "live" panel shows `first-principles-engine.web.app/shop` as a labeled "short address
> (one-time setup)", but **Copy link copies the always-working direct Storage URL** — promoting the
> clean link to the copy target before it's wired would hand families a dead page (Codex P1). The
> owner pastes the direct link into `CATALOG_URL` once, then shares the short one.
> **(2) Opt-in book previews.** A listed **book** product can offer a **partial** peek — cover +
> the first N pages (N=3 default, capped ≤ 5) — **per-product opt-in, default OFF, parent-set**
> (`CatalogProduct.includePreview?` / `previewPageCount?`, additive; toggle shown only for
> `sourceRef.kind==='book'` behind `canEdit`). At publish time the builder fetches the source Book
> (read-only, fire-and-forget — a missing book just skips the peek, never blocks publish) and emits
> an **inline pure-HTML `<details>` "Peek inside 📖"** on the same page: cover + first N page images
> (hotlinked tokenized URLs, same mechanism as the covers), page text, and a warm priced CTA. Never
> the whole book (that IS the product); never auto-enabled; never pages of a non-listed/non-opted
> book; no write from the public page; **no rules change** (the preview lives inline under the same
> `public/catalog/{familyId}/**` object).

> **Order capture shipped by FEAT-89 (2026-07-18) — the outreach loop closes.**
> C1 was a read-only lookbook; FEAT-89 lets a family on the published page say **what they want
> and who they are**, landing it in-app as an **order the kids fulfill and track**.
>
> **Owner decision — the "no customer data" rail (§6) is consciously lifted, minimally scoped.**
> An order captures a **first name + picked products + optional note + optional contact line.**
> NOTHING else: no address, no payment, no required email, no accounts. The audience is people
> the family already knows; the form says so warmly ("We know you — we'll be in touch! 💚").
>
> **Mechanism — W1 (unauthenticated HTTPS function), not W2 (public create-only Firestore rule).**
> The published page has no auth and no backend, so an order needs a server write path. Recon
> evaluated both:
> - **W1 (shipped):** an unauthenticated `onRequest` function `submitCatalogOrder` (admin SDK
>   write to `families/{familyId}/orders`) with **CORS locked** to the catalog's own origins, a
>   **honeypot** field, a best-effort **per-IP rate limit**, strict **schema validation + caps**,
>   and a **product-id allowlist** against the family's `listed` products. `firestore.rules` stays
>   owner-only and **UNTOUCHED**.
> - **W2 (rejected):** a public `allow create` rule on `orders`. No function, but it *is* a
>   `firestore.rules` change (a propose-confirm invariant) and spam control is far weaker (no
>   honeypot, no rate limit, no origin lock). Chosen against for exactly those reasons.
>
> **How the page learns the endpoint:** baked at publish time, the same pattern as the catalog
> URL — `publishCatalogSite` reads the runtime firebase-app `projectId`, builds the deterministic
> `us-central1` `cloudfunctions.net` endpoint, and embeds `{ endpoint, familyId }` into the page's
> form script. No endpoint ⇒ the page is the read-only lookbook, byte-for-byte (script-free).
>
> **In-app:** an **Orders** SectionCard on the Business tab lists orders newest-first (customer,
> picks, note, contact) with a **forward-only status stepper** (`new → making → ready →
> delivered`) any family member advances — the making is the **kids' work**, so status is **not**
> parent-gated (only a future destructive op would be). A "🎉 New order!" affordance shows while an
> unstarted order waits. No timers, no due-dates, no overdue language.
>
> **Learning loop untouched (§5):** orders are business data — no learner-model / compliance /
> hours / XP write. **Future linkage (noted, not built):** an order that later gets paid becomes a
> confirmed `businessLog` sale; that bridge is deliberately left for a later slice.

**What this actually requires** (from Step 0.4 recon — the current app is a single, fully-authed
SPA, so *none of this exists today*):

1. **A second Firebase Hosting site/target.** `firebase.json` today defines exactly one hosting
   entry — `site: "first-principles-engine"`, `public: "dist"`, with a catch-all rewrite
   (`"**" → /index.html`). A public storefront needs its **own** hosting site (e.g. a
   `barnes-bros` site under the same Firebase project) and a second `hosting` array entry with a
   distinct `public` dir and `target`. The existing app site is untouched.
2. **A separate static export/build step.** The storefront is a *pre-rendered static bundle* — a
   small page (or generated HTML/JSON) listing the `listed` products, built from the catalog data
   at export time. It is **not** the SPA with auth stripped.
3. **A public read path — and the honest constraint:** the current app is *entirely* behind auth;
   there is no unauthenticated route and no public Firestore read. Two ways to serve public data:
   - **(Recommended) Static snapshot export** — at publish time, serialize the `listed` products
     (title/price/description/image URLs) into the static bundle. **No live Firestore read, no
     rules change.** The storefront reads a baked-in JSON/HTML file; images are the existing
     Storage download URLs. This keeps `firestore.rules` untouched — important, because rules are
     a **propose-and-confirm invariant** (CLAUDE.md) and opening public reads would be a
     significant, separately-gated change.
   - **(Not recommended for v1) Public Firestore read rule** — a rule allowing unauthenticated
     reads of `catalogProducts` where `status == 'listed'`. This *is* a `firestore.rules` change
     → propose-and-confirm, and it exposes a live collection publicly. Avoid unless a dynamic
     storefront is genuinely needed; the static snapshot covers the "show listed products" job
     without touching rules.
- **Cost:** highest — second hosting target + a static export pipeline + a publish step. Explicitly
  **gated behind kit #1 + one parent-confirmed sale.**
- **Never** serve the authed SPA publicly (§6). Option C is a *separate static site*, never a
  public route into this app.

### Recommendation — climb the ladder, don't leap

**A now-ish** (once products exist) → **B when there's inventory worth listing** → **C only if
demand proves out** past the sale gate. Because every option is a view over `catalogProducts`,
building the catalog once makes all three cheap; there is no reason to build C speculatively.

---

## 5. What feeds the catalog

| Source | Becomes | Reference held |
|---|---|---|
| Finished `Book` (My Books) | `CatalogProduct` type `Book` | `Book.coverImageUrl` → `images[]`; `sourceRef {kind:'book', id}` |
| Generated sticker set (`stickerLibrary`) | `CatalogProduct` type `StickerSheet` | sticker image URL → `images[]`; `sourceRef {kind:'sticker', id}` |
| `KitRoster` (FEAT-78 → the flagship GDQ kit) | `CatalogProduct` type `StarterKit`/`PartyKit`/`CustomKit` | kit sticker sheet / art URLs → `images[]`; `sourceRef {kind:'kitRoster', id}` |

Each promotes into a `CatalogProduct` that **references its source art** (Storage URLs), never a
copy or a regeneration. A parent picks the source, the form pre-fills, the parent sets price +
status.

**The learning loop is unaffected.** The catalog is *business data* — it is **not** a learner-model
input, does not write concept states, and does not touch compliance/hours/XP. (Same posture as the
FEAT-78 roster: creative/commercial output, not a calibrated assessment.)

---

## 6. Never

- **Regenerate art** the catalog can only reference. Products point at existing Book covers /
  sticker images / kit art via their Storage URLs.
- **Expose the authed app publicly.** Option C is a *separate static site*, never a public route
  into this SPA. The app stays fully behind auth.
- **Collect customer PII beyond the FEAT-89 minimal scope.** The original "no customer data" rail
  was consciously lifted by the owner (2026-07-18) to exactly **first name + picked products +
  optional note + optional contact line** — the audience is people the family already knows.
  Still **never**: address, payment, required email, or accounts. The `businessLog` earnings
  surface remains PII-free.
- **Let a kid publish or price without parent confirmation.** `status` transitions and pricing are
  `canEdit`-gated. Kids' made things are the source; a parent curates them into listed products.
- **Change `firestore.rules` casually.** A public read path is an invariant change — propose →
  confirm. The recommended static-snapshot export avoids it entirely.
- **Build the storefront before kit #1 + one parent-confirmed sale.** The GDQ validation gate.

---

## 7. Build plan (later, serialized)

Serialized, one reviewable PR per slice. **All slices are gated after FEAT-78** so there is
something real to catalog; slice 5 is additionally gated on the sale.

1. **Data model + collection + entry form.** `CatalogProduct` type + `catalogProducts` collection
   helper + converter + a parent catalog-entry form (manual authoring). Ships the data model
   testable. *(Gated after FEAT-78 so there's real product to store.)*
2. **In-app catalog view + promote-from-artifact.** The "Catalog" section on `BusinessPage`
   (cards grouped by type, empty state, `canEdit` gating) + promote-from-`Book`/sticker/`KitRoster`.
3. **Option A — printable/PDF export** (reuse the books PDF pattern).
4. **Option B — Etsy field export** (client-side transform → paste/CSV).
5. **Option C — public static storefront** — second hosting target + static snapshot export.
   **Only past the sale gate** (kit #1 real + one parent-confirmed sale).

**First slice = the smallest thing that stores + shows one real product** (slices 1–2).

---

## 8. Open decisions

1. **Catalog collection location.** `families/{familyId}/catalogProducts` (proposed, sibling of
   `businessLog`/`businessGoals`) — confirm, vs. nesting under a business sub-path.
2. **Manual-author vs promote-from-artifact for v1.** Both are designed; which ships in slice 1
   vs slice 2? (Recommend: manual in slice 1 to land the model; promote in slice 2.)
3. **Price display.** Kid-facing price on the pride wall, or parent-only? (Affects whether the
   card shows `$` to a logged-in kid.)
4. **Which website option first, and when.** A (printable) is the cheap default once products
   exist; confirm the A→B→C ladder and the trigger for each rung.
5. **Is Option C worth standing up** (a second hosting target + export pipeline) vs. staying
   **Etsy-only** (Option B) for the sell path? Etsy respects the adult-account + MO tax/licensing
   constraints with zero hosting; C is the bigger bet.
6. **Static snapshot vs public Firestore read** for Option C. Recommended: static snapshot (no
   rules change). Confirm we never open a public `catalogProducts` read unless a dynamic
   storefront is truly required.
7. **Sale-gate predicate (kit #1 must be the thing that sold).** `BusinessLogEntry.confirmed`
   alone can't prove it — the log has no product/source link (§1). Pick: coarse kit-`itemType`
   proxy (no schema change) vs. an additive `sourceRef`/`catalogProductId` on `BusinessLogEntry`
   linking a confirmed sale to its exact `CatalogProduct` (propose→confirm, since it touches the
   additive log shape). Resolve before Option C is built.
