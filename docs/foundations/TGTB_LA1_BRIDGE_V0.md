# The Good and the Beautiful — Language Arts Level 1 → Reading-Graph Bridge — v1 — OWNER-CURATED (2026-07-15, official-source verified)

> ✅ **v1 — OWNER-CURATED and SHIPPED as bridge data**, deliberately **COARSE by design** (see below).
> The per-band content was **owner-adopted and verified against the official The Good and the Beautiful
> (TGTB) publisher pages on 2026-07-15**, then transcribed into
> `src/core/foundations/tgtbLa1Bridge.ts` (FEAT-64). This file is now the authority the code mirrors.
>
> **Official source verified (2026-07-15):**
> - TGTB Language Arts Level 1 course pages — https://www.goodandbeautiful.com/language-arts/level-1/
>
> **Companion to:** [`../LEARNER_MODEL_DESIGN.md`](../LEARNER_MODEL_DESIGN.md) §12 (external-curriculum
> bridge) and [`READING_GRAPH_V0.md`](./READING_GRAPH_V0.md) (the reading-graph node ids mapped to).
> Bridge mechanism: FEAT-63 (`src/core/foundations/workbookBridge.ts`). Activation: **FEAT-64** (refs
> FEAT-49 §12, FEAT-53 the Fast Phonics template, FEAT-47/50 the curation-apply pattern).

## Why this file exists

The learner model tracks curriculum *positions* but, before FEAT-63, never read them. The family runs
**two** language-arts curricula — Fast Phonics (bridged at FEAT-53) and **TGTB Language Arts Level 1**
(config reads **Level 110**) — and the model saw only the first. FEAT-63 shipped the *wiring*; FEAT-64
ships the **data half** for TGTB LA1, turning "TGTB LA1 Lesson 110 reached" into `covered` evidence.
Because TGTB LA1 and Fast Phonics both feed the **same** reading graph, they become **multi-source**
evidence on shared nodes (design §12: the model takes the best-supported source, never a raw sum).

## Structure facts (official) — and why this bridge is COARSE by design

- **120 lessons across 3 units;** **spelling lists begin in Level 1;** **Lesson 1 reviews long/short
  vowels** (the course opens on review, not on letter introduction).
- **The phonics progression lives in the self-paced Reading Booster B cards, NOT the lesson number.**
  Two children on the same TGTB lesson can be at very different Booster cards, so the lesson number is
  only a **coarse proxy** for phonics position. Vowel teams / diphthongs (e.g. OU/OW) are late-Booster
  territory. **This is why the bridge is intentionally three broad bands, not a per-lesson map** —
  claiming a precise phonics node from a lesson number would over-state what the lesson number knows.

## Named future (backlog, not built) — the precise phonics tracker

A **Reading Booster B card → node bridge** is the accurate phonics tracker: the Booster card numbers
are **printed on the cards Shelly already photographs**, so a card→node map (structured exactly like the
Fast Phonics peak map) would ground the phonics strand *precisely*, replacing this coarse lesson proxy.
Backlog — not built here.

## Semantics (the rules this data obeys)

Inherited unchanged from the Fast Phonics bridge (design §12 / §13), enforced in code by
`applyBridgeCoverageToModel`:

- **Reaching a band = `covered` evidence, capped at `forming`** + a "verify with a quick quest?"
  openQuestion. Never `solid` on curriculum position alone.
- **Positions are cumulative**, with **in-band credit** (round the lesson UP to the band ceiling via
  `makeBandCeilingLessonToUnit`): L110 is inside the 81–120 band, so it resolves to native band 120.
- **Never downgrades** a stronger standing state; a `solid` node only gains the ref.
- **Dedup per concept**, highest band reached wins as the evidence label.
- **Multi-source with Fast Phonics.** Where TGTB LA1 and Fast Phonics both cover a reading node (e.g.
  `reading.phonics.digraphs`), each contributes an independent `curriculumPosition` ref; the §13 cap
  and best-source rule (not addition) already govern the resulting state.

## Per-band `covers[]` (v1 — OWNER-CURATED, maps onto CURATED reading-graph nodes ONLY)

Every `covers[]` id is a real node in [`READING_GRAPH_V0.md`](./READING_GRAPH_V0.md) — pinned by a
validation test (`tgtbLa1Bridge.test.ts`). TGTB LA1 integrates phonics/reading **and**
handwriting/spelling; only the reading-graph-mappable strands appear (encoding nodes included).

| upToLesson | Cumulative content | `covers[]` (reading-graph node ids) |
|---|---|---|
| 40 | short/long-vowel review exposure, sight words (first-grade lists begin), spelling lists begin (encoding: CVC/pattern words), listening comprehension | `reading.phonics.cvc`, `reading.phonics.sightWords`, `reading.encoding.spellCvc`, `reading.comprehension.listen` |
| 80 | blends + digraphs consolidation, sight words continue, spelling pattern words (encoding), explicit comprehension | `reading.phonics.blends`, `reading.phonics.digraphs`, `reading.phonics.sightWords`, `reading.encoding.spellPatterns`, `reading.comprehension.explicit` |
| 120 | long vowels (silent-e, as instructed review), vowel teams + diphthongs (late Booster territory, e.g. OU/OW), comprehension, reading fluency (integrated readers) | `reading.phonics.longVowels`, `reading.phonics.vowelTeams`, `reading.phonics.diphthongs`, `reading.comprehension.explicit`, `reading.fluency.pace` |

**Worked example (the family's child, L110):** L110 is inside the 81–120 band, so it rounds UP to native
band **120**. The cumulative union of all three bands yields **12 reading concepts** — CVC/short-vowel
decoding, sight words, CVC + pattern-word spelling, blends, digraphs, long vowels, vowel teams,
diphthongs, listening + explicit comprehension, and fluency pace — all as `covered → forming`, alongside
Fast Phonics's own evidence on the overlapping phonics nodes. This is the fixture `tgtbLa1Bridge.test.ts`
pins.

## Curation questions — RESOLVED (appended per convention)

1. **What does the family's TGTB LA "Level" number mean?** → **RESOLVED.** It is a TGTB **Lesson** within
   **Level 1** (120 lessons, 3 units). L110 sits inside Level 1 (81–120 band), not across into Level 2.
   Native unit = band ceiling; `lessonToUnit` = `makeBandCeilingLessonToUnit([40, 80, 120])`.
2. **Lesson ranges per concept.** → **RESOLVED** by the owner-adopted (deliberately coarse) table above,
   verified against the official Level 1 course pages.
3. **Phonics vs. TGTB's own sequence.** → **RESOLVED as intentionally coarse** — the precise phonics
   position lives in the Reading Booster B cards, not the lesson number (see the named-future note). The
   lesson-band mapping is a soft proxy; the `covered → forming` cap + verify-quest keep it honest.
4. **Where does Level 110 sit?** → **RESOLVED** (worked example above): inside the 81–120 band of Level 1.
