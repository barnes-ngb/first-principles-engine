# Barnes Bros Business Tab — Design Spec

**Version:** v0.1 — June 19, 2026 (design capture; build is July+, operate-mode holds through June 30)
**Status:** Design shaped; first build slice sequenced. No app work until July 1.
**Companions:** `GARDEN_DEFENSE_QUEST_PLAN.md` (strategy/economics) and `SEED_VAULT_V1_RUNBOOK.md`
(physical build). Ledger anchor: **FEAT-29**; depends on **FEAT-27** (kit assembler) and **FEAT-28**
(clean-IP theme).

## Core principle: a product is a locked report of a book

The business tab is a **curation layer, not a second creation tool.** Content is made only in the
existing tools (My Books, sticker generation, sketch-to-story). The business tab sits downstream and
*references* what those tools produced.

A **product** is a thin manifest — it points at an existing book ID, sticker IDs, and art, plus
business metadata (title, kit type, price tier, status). While a **draft** it references the live
content. The moment it's marked **ready/sellable it freezes into a snapshot** — a locked "report" of
the book and pieces as sold — so editing the original book later never silently changes a kit
already sold.

> **Drafts reference. Products snapshot.** This one rule keeps the tab a curation layer and avoids
> the data-duplication drift the project has been burned by before.

Freeze timing: a deliberate **manual "lock it in"** by Lincoln (or on marking ready) — a meaningful
operational moment, not a silent side effect.

## Who it's for

Lincoln is the operator. The business serves his goal (the Xbox is his), he's the active app user,
and an operations-and-curation surface is his domain. London makes art and stories upstream. Roles
stay loose and grow as the world gets built — the app should not hard-code them.

Anything money-, customer-, or listing-related is **parent-gated.** Lincoln sees operational state
("3 kits requested, 1 delivered"), never customer names or contact info.

## The two halves of the tab

**1. Operations surface (Lincoln's dashboard)**
- Sales & earnings log
- Inventory status (made / packed / left)
- Order pipeline — parent-gated (operational state only)
- Additive tiered goal thermometer (see Goal stack)

**2. Prep / studio (curation)**
- Content shelf — finished books, library stickers, sketches, pulled live from existing collections
- Product staging — stage content into a product manifest (kit type, price tier, status:
  draft → ready → listed → sold)
- Lock/freeze on ready
- Sticker-sheet composer — two modes (see Production)
- Kit assembler — frozen pieces → one print package (= FEAT-27)

## What the app needs to support

**Content → product → kit spine**
- Pull existing content by reference (live shelf)
- Product = thin manifest; never copies content while draft
- Lock/freeze → snapshot on ready

**Operations**
- Sales/earnings log, inventory status, parent-gated order pipeline
- Additive tiered thermometer

**Goal builder**
- Lincoln (with Nathan) assembles the target stack (Xbox + games) with real prices. This is the
  ownership moment and the budgeting lesson — it is what makes the meter genuinely his.

**Production path (reuses existing tools)**
- Sticker-sheet composer — two modes: (a) **arrange existing** library stickers onto a sheet (pure
  curation, cheap); (b) **generate new** stickers seeded from a book's own illustrations (reuses
  sticker-gen).
- Kit assembler — frozen pieces → print package (FEAT-27, rides the existing print path).

**Cross-cutting must-haves**
- Curriculum capture — business work auto-logs as school (packing/pricing = Math/Practical Arts,
  art = Art, writing = Language Arts), the way making already does.
- Parent gate — on money, customers, listings.
- Clean-IP theme (FEAT-28) — business output never leaks a brand.

## Goal stack (Xbox + games)

The motivator is not a single ~$350 wall — it is a **stack of milestones Lincoln collects on the way
up**, so there is always a near win and the meter never drops:
- Console — Series S, ~$300–400
- First game (~$50–70) or Game Pass (~$10–23/mo by tier)
- Second controller (~$60–65) — the "play with London" unlock
- More games / a Game Pass year

Total lands ~$450–600 by his choices — and those choices are the Math lesson. Price exactly at build
time; console and Game Pass prices move.

## Pedagogy guardrails

- Thermometer is **additive-only.** Money-in climbs; nothing ever falls. No dropping bars, no
  breakable streaks — the exact perfectionist failure mode designed around everywhere else.
- Frame as "X kits to the next unlock," not a percentage.
- Lead with earnings-toward-goal; keep cost/margin **optional.** Cost-and-margin is rich Math, but
  if the dominant frame becomes "are we profitable," a motivator becomes pressure. Margin is an
  optional "learn the business" view, not the headline.

## Data model (sketch — finalize at build)

- `businessLog` — additive sales/earnings event log.
- `products` — manifest referencing book ID + sticker IDs + art; metadata (kit type, price tier,
  status); a `snapshot` field populated on lock.
- Goal config — the milestone stack with prices.
- Discipline: `setDoc` with `{ merge: true }` / `updateDoc` only; `ignoreUndefinedProperties` already
  on. The snapshot-on-lock is the one place duplication is intentional.

## Sequencing

1. **First slice — operations + goal surface.** Business-tab shell + sales log + additive tiered
   thermometer + goal builder + parent gate. Lightest slice and the motivation engine; needs no
   content pipeline. Lincoln logs a sale, watches the meter climb toward his Xbox.
2. Content shelf + product staging (reference + draft→lock manifest).
3. Sticker-sheet composer (two modes).
4. Kit assembler (FEAT-27).

## Operate-mode note

Design captured June 19 during operate-mode (no app features until July 1). Build begins July; the
first slice is tracked as the business-tab operations-and-goal row in the ledger.
