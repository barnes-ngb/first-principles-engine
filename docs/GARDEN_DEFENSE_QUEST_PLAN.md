# Garden Defense Quest — Barnes Bros Business Plan

**Version:** v0.1 — June 19, 2026 (working draft)
**Status:** Strategy locked at the skeleton level; economics decisions open (see §10).
**Relationship to other docs:** The repo's business-track strategy reference, tracked in the
review ledger under **FEAT-29** (anchor) — which groups the July build dependencies FEAT-27
(kit assembler) and FEAT-28 (two clean-IP garden themes — Garden Defense + Gentle Garden, cartoon
house style). Grounds the original GDQ idea sketch in the
actual FPE codebase and the June 19 pipeline recon.

---

## 1. Thesis

Garden Defense Quest (GDQ) is a parent-run, kid-inspired printable + physical activity-kit
brand. A child invents the creatures, plant defenders, and treasure paths and does the making;
the parent sells, handles money and safety, and produces. The product is a kit: a short silly
garden-zombie story, a sticker sheet, clue cards, a defense map, and a final badge.

GDQ leads the Barnes Bros lineup for one counterintuitive reason: **it is the productized,
repeatable version of the highest-value thing the family already makes.** The personalized hero
books are the best revenue-per-unit line but they don't scale, because each is bespoke. GDQ turns
"story + art + stickers + print" into a *template SKU* — make the starter kit once, sell it many
times — with a party-kit tier as the real margin play. The custom quest kit is, in effect, a hero
book with a game wrapper. So GDQ doesn't compete with the existing lines; it packages existing
capabilities into something that scales.

Three things make it the right first bet: it reuses the most already-built technology, it has the
clearest buyer (parents solving a birthday-activity problem), and it gives both boys real roles.
London (6) is dead-center in the 5–10 target age, so he is both the maker and a built-in audience
tester — unusual and valuable.

---

## 2. What it rides on (FPE reuse map)

GDQ is an **extension, not a rebuild.** The June 19 recon confirmed roughly 80% of the production
pipeline already exists and works end-to-end:

| Kit component | Existing FPE feature | Recon status |
|---|---|---|
| The 6-page story | My Books AI Story Generator (progressive save) | WIRED |
| Printable booklet | `printBook.ts` mini-book PDF (5.5×8.5, `getBlob` CORS path) | WIRED |
| Sticker sheet | Sticker pipeline (`gpt-image-1.5` transparent) + Sticker Library | WIRED |
| Story-from-prompt | Story Guide → generator handoff | WIRED |
| Kid's art → kit art | Sketch-to-story pipeline (enhanced image now in portfolio, PR #1417) | WIRED |
| Curriculum credit | Creative timer → Art / LA / Practical Arts hours | WIRED |
| The game/quest layer | Story Game Workshop (board / adventure / cards) | PARTIAL — no print/export |

The clue cards, defense map, and badge are the only kit primitives the tools don't yet emit as a
bundle. For v1 they're made by hand (see Track A).

---

## 3. What the recon settled (de-risking)

Two findings from June 19 reshape the build question decisively toward *extend, fast*:

- **Theming is parameterized end-to-end.** Every generator threads a theme through to both text
  and image prompts; Minecraft is only a per-child *cosmetic style default* (and is actively
  stripped from stickers by the copyright rewrite). Clean non-branded garden-theme paths —
  **Garden Defense** (battle flagship) and **Gentle Garden** (calm spinoff), both in a cartoon/
  generalized house style — are therefore a **config addition**, not a refactor; the single biggest
  risk in extending the app is retired. Tracked as **FEAT-28** (July).
- **The only true net-new is Workshop print/export**, which *is* the July "kit assembler" by
  another name. Tracked as **FEAT-27** (July). Everything else is config + existing features.

---

## 4. Product line

Carried from the idea doc, sequenced so custom work never outruns capacity.

| Tier | Product | Price | Notes |
|---|---|---|---|
| Lead | **Seed Vault** starter kit (PDF) | $8 | Make one polished non-custom kit first |
| Lead | Seed Vault (printed, local pickup) | $15 | Primary test SKU |
| Lead | Seed Vault (printed + sticker upgrade) | $18–20 | |
| Margin | Small party kit (4–6 kids) | $35–45 | The real money angle |
| Margin | Large party kit (8–12 kids) | $65–95 | |
| Custom | Custom quest kit (PDF) | $25–35 | = hero book + game wrapper; **narrow fields only** |
| Custom | Custom printed single-child kit | $35–45 | |
| Custom | Custom party kit | $75–125 | |
| Add-on | Sticker sheet / badge sheet / seed packet / token bag / etc. | $2–10 | Order-value boosters |

**Hard rule:** keep customization narrow (name, favorite plant, favorite creature, color,
difficulty). Open-ended custom requests kill throughput.

---

## 5. Positioning within the Barnes Bros lineup

Working assumption (reversible): **GDQ leads.**

- **GDQ** — the repeatable template SKU out front (starter + party kits).
- **Hero books** — become the high-margin *custom quest kit* tier rather than a standalone line.
- **Stickers / prints** — add-ons that raise order value.
- **Perler beads / no-sew dog bandanas** — craft-fair side inventory; in-person channels only.
- **Edible dog treats** — ruled out (Missouri commercial feed licensing).

---

## 6. Roles

Maps cleanly onto principles already running in the homeschool ("London creates, Lincoln
refines"; "Nathan handles customers, Lincoln grows into it").

| Person | Role | Jobs |
|---|---|---|
| London (6) | Creative director + maker | Invent creatures/defenders, draw concepts, pick AI scenes, sort/pack, place labels, build map paths |
| Lincoln (10) | Operations | QA against a visual checklist, count cards, pack kits, sales/earnings tracking (July app) |
| Nathan | Seller + safety gate + producer | All accounts, payments, messages, printing, cutting, delivery, IP/safety decisions |

Operating rule: **he makes, you sell, he delivers only with you.**

---

## 7. Curriculum tie-in

The kit-making *is* school. The creative timer auto-logs making/drawing/writing time to the
correct subject buckets, and the business↔school mapping already exists in the outline:

| Business activity | Subject | Hours source |
|---|---|---|
| Drawing stickers / kit art | Art | Creative timer |
| Writing stories / product copy | Language Arts | Creative timer |
| Counting inventory / pricing | Math | Manual or timer |
| Assembling kits / fair setup | Practical Arts | Manual entry |

Principle: **school creates product.** This is the "part of curriculum" access you asked for —
it already exists; GDQ just gives it a destination.

---

## 8. Track A — Physical proof (now → mid-July, near-zero app work)

Operate-mode runs through June 30 (no new app features), but the *physical* product needs none.

1. Build **one** "Seed Vault" starter kit by hand with the tools exactly as they ship:
   story via My Books generator (clean theme) → mini-book PDF; sticker sheet via the sticker
   pipeline. Make the clue cards, defense map, and badge by hand for v1 (Canva or London's own
   drawings) — cheap, and it *is* London's creative-director job.
2. Run the **TEST-03 tablet checklist** as you build — verifying Books, Story Guide, Stickers,
   and Print on a real tablet is simultaneously the proof that the kit pipeline works.
3. Test with **3–5 warm families** using the idea doc's feedback questions (did the child
   understand it; how long did it hold attention; would you pay $15 printed / $8 PDF; would it
   work at a birthday party).
4. Improve, photograph, then sell/place **10–20 starter kits** locally.

Success gate: a parent who owes you nothing says "yes, I'd pay for that."

---

## 9. Track B — App integration (July+, the real build)

In order, each spawning its own Claude Code run-prompt under normal ledger discipline:

1. **FEAT-28 — Garden themes config.** Add two clean non-branded garden-theme presets — Garden
   Defense (flagship) + Gentle Garden (spinoff), cartoon house style — and a third style option;
   flip the per-child Minecraft cosmetic default off for business output.
2. **FEAT-27 — Kit assembler.** Expand Workshop print/export to render story + clue cards +
   defense map + badge into one print package from already-stored `storyGames` data. Mirror
   `printBook.ts`. This is the load-bearing build.
3. **Barnes Bros dashboard.** `families/{id}/businessLog` collection, sales tap-tracker, and the
   Xbox goal thermometer (already on the July list for Lincoln's operations role).
4. **(Optional) Intentional sketch→product picker** — the "choose the sellable version" step,
   designed deliberately rather than the orphan code that was just removed.

---

## 10. Decision log (open — drives the economics)

These need Nathan's input; the first sets the entire unit-cost model.

| # | Decision | Why it matters | Status |
|---|---|---|---|
| D1 | **Home-print vs. print-service** | Sets unit cost against the Xbox goal; generalizes the old hero-book print question to all kits | **RESOLVED** (2026-06-19) — home-print + Instant Ink; see Unit Economics |
| D2 | Custom-kit guardrails | Narrow fields vs. open requests determines whether custom work eats throughput | **RESOLVED** (2026-06-19) — narrow fixed menu: name, plant-defender, creature, color, difficulty; no open-ended requests |
| D3 | Positioning (GDQ-leads vs. parallel lines) | §5 working assumption | **RESOLVED** (2026-06-19) — GDQ-leads (template SKU; hero books = custom tier; stickers/prints add-ons; beads/bandanas craft-fair; treats out) |
| D4 | First sellable format | Starter-only vs. starter+party beta in the first push | **RESOLVED** (2026-06-19) — starter-first ($15 printed, $8 PDF fallback); party kit ($35–45) as validated fast-follow |

Revenue context: the idea doc's mixed-month example (~20 starters + 6 party + 5 custom + add-ons)
models ~$800/month, concentrated in the party tier. One to two strong months reaches a typical
Xbox target — but D1 sets the true margin, so resolve it before committing to the math.

---

## Unit Economics (D1 resolved — 2026-06-19)

**Decision:** Home-print on the family HP DeskJet 2755e with an active HP Instant Ink plan for the
proving phase. Per-kit service printing is rejected — at low volume it roughly doubles COGS.
**Action item:** the Instant Ink subscription has lapsed; re-enroll before production.

**Why Instant Ink is the hinge:** Instant Ink bills per page printed, not per ink used — a
full-bleed color illustration costs the same as a text page. On an entry-level inkjet that turns
the worst-case ink scenario into a flat ~$0.04–0.05/page. At ~20 kits/month (~240 pages) the
$12.99 / 300-page plan fits with rollover headroom; overage is $1.50 per extra set of 10–15 pages.

**Goal anchor:** Xbox Series S — ~$300 on sale to ~$400 MSRP (Series X ~$600 if aiming higher).

**Cost per starter kit (~12 printed pages):**

| Component | Cost |
|---|---|
| ~8 color pages (ink + paper) | ~$0.55 |
| ~3 cardstock (clue cards + badge) | ~$0.36 |
| 1 sticker sheet (ink + sticker paper) | ~$0.40 |
| Packaging | ~$0.50 |
| Variable COGS | ~$1.80 |
| + Instant Ink plan (~$13/mo ÷ ~20 kits) | ~$0.65 |
| **All-in COGS / starter** | **~$2.50** |

**Margins & units to goal** (local sales; $15 starter, ~$40 small party kit):

| | Net / unit | To ~$300 | To ~$350 | To ~$400 |
|---|---|---|---|---|
| Starter | ~$12.50 | ~24 | ~28 | ~32 |
| Small party kit | ~$32 | ~10 | ~11 | ~13 |

The mixed-month example in §10 (~$800 revenue) nets ~$680–700 after COGS — roughly one strong
month to a Series S, or ~11–13 party kits on the party tier alone.

**Caveats (carry into scaling):**
- The 2755e is entry-level — fine for proving (10–20 kits), not built for sustained volume. If
  monthly volume holds, budget a sturdier printer and keep it Instant-Ink-eligible so the per-page
  economics survive the upgrade.
- Instant Ink requires the printer stay connected; cancelling disables the subscription cartridges.
  Size the plan to real volume + rollover.
- Bulk-ordering from a sticker service is worth revisiting *only* for the one repeated, non-custom
  Seed Vault sticker sheet, purely for premium quality, once a design is locked.

> Figures are planning estimates (defensible ranges, not quotes); a real local-print quote and
> actual per-kit page count will tighten them.

---

## 11. Safety & IP guardrails

- **Sales safety:** parent owns all accounts, payments, and messages; no unsupervised pickups; no
  child's full name, location, or school/team identifiers in public posts; no direct
  customer↔child contact.
- **Public framing:** "a family-made adventure kit brand inspired by my son's ideas" — never lead
  with the child's age or neurodivergence.
- **Product safety:** label "Ages 5+, contains small parts, adult setup recommended"; avoid tiny
  magnets, sharp objects, candy look-alikes.
- **IP:** original names and creatures only — "Garden Defense," "Gentle Garden," "Sprout Cannon,"
  "Blocky Bog Monster." Avoid Plants vs. Zombies and Minecraft names, characters, and art. The app's
  copyright-rewrite step already strips brand terms from generated art; the two clean-IP garden
  themes (cartoon house style) keep business output clean by construction.
- **Platform ages:** all public accounts (Etsy, Pinterest, Facebook Marketplace, YouTube) are
  parent-owned and parent-run.

---

## 12. Sequencing

**Now – June 30 (operate-mode):**
- Merge PR #1417; run the TEST-03 tablet checklist.
- Build and test the hand-made Seed Vault with 3–5 families.
- Resolve D1 (home-print vs. service).

**July+ (extend-mode):**
- FEAT-28 theme config → FEAT-27 kit assembler → Barnes Bros dashboard.
- First real product run; first 10–20 local sales.

**Distribution order** (start where trust exists, move outward): warm network → homeschool /
parent groups → local birthday-party angle → one-page website → Pinterest → YouTube demos →
Etsy/Marketplace last.

---

## Open inputs before the next step

1. **D1 — home-print vs. print-service.** Resolving this unlocks the revenue model and the Xbox math.
2. Confirm **GDQ-leads** positioning (D3) or flag if you want it parallel to the existing lines.
3. Greenlight starting the **hand-made Seed Vault** under Track A while operate-mode holds.
