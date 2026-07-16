# skillTag → Foundations-Concept Bridge — v1 — DRAFT (flagged for OWNER REVIEW at merge, 2026-07-16)

> ⚠️ **v1 DRAFT — flagged for owner review at merge.** The table below is transcribed into
> `src/core/foundations/tagConceptBridge.ts` (FEAT-69) and IS consumed in code, but the *mapping choices*
> are the curation surface: the owner confirms / extends them. Correcting a mapping is a data edit in the
> `.ts` module, re-synced here. The bridge is **additive and no-guess** — an unmapped tag resolves to `[]`
> and no-ops, so growing coverage is a pure data addition, never a code change.
>
> **Companion to:** [`../LEARNER_MODEL_DESIGN.md`](../LEARNER_MODEL_DESIGN.md) §3.5 / §11.5 (the daily
> struggle → re-test loop), [`READING_GRAPH_V0.md`](./READING_GRAPH_V0.md) + [`MATH_GRAPH_V0.md`](./MATH_GRAPH_V0.md)
> (the concept node ids mapped to), and the catalog in `src/core/types/skillTags.ts` (the 22 v1 tags).
> Precedent: the workbook bridges (FEAT-53/63/64, [`MATHSEEDS_BRIDGE_V0.md`](./MATHSEEDS_BRIDGE_V0.md)) —
> **ship the wiring; the mapping is versioned, owner-reviewed data.**

## Why this file exists

FEAT-68 closed the daily-struggle → re-test loop **only** through the deterministic
`workbookConfigId → workbookBridge` position path, because there was **no `skillTag → conceptId` mapping
in the repo** and `ChecklistItem` carries no `conceptId`. A "stuck" chip (or an `engagement:'struggled'`
flag) on a **non-workbook** item had no way to reach the concept graph.

The two namespaces are genuinely different — this bridge is **not free**:

| skillTag (catalog) | ≠ | concept-graph node |
|---|---|---|
| `reading.cvcBlend` | | `reading.phonics.cvc` |
| `math.subtraction.regroup` | | `math.operations.regrouping` |

FEAT-69 ships the *wiring* (a tolerant resolver + the two daily signals wired in) and this **hand-curated
table** as its data half. Coverage lights up per-tag as the owner curates; it never fabricates a pairing.

## Semantics (the rules this data obeys)

- **No guess.** A tag with no confident concept equivalent maps to `[]` and no-ops. Every resolved id is
  filtered through the node map (`readingGraph` + `mathGraph`); an id the graph doesn't define can never
  escape (it would be inert in `selectQuestTargets` anyway).
- **High-confidence 1:1 only.** v1 seeds only pairs where the tag and node describe the same skill. Every
  seeded target id is pinned to a real graph node by `tagConceptBridge.test.ts`.
- **Additive + versioned.** `TAG_CONCEPT_BRIDGE_VERSION = 1`. Extending the table is a data edit + a
  version bump, mirrored here — never a silent code change.
- **Scope boundaries (deliberate, not gaps):** `writing.*` and `regulation.*` map to `[]` in v1 (see below).

## v1 mapping table (owner-review the choices)

Every non-empty target below is a real node in the reading/math graph (pinned by test).

### Reading

| skillTag | → concept node(s) | rationale |
|---|---|---|
| `reading.phonemicAwareness` | `reading.phonemic.hearSounds` | 1:1 — "hear the sounds in words" / segments-blends phonemes |
| `reading.letterSound` | `reading.phonics.letterSounds` | 1:1 — says each letter's sound |
| `reading.cvcBlend` | `reading.phonics.cvc` | 1:1 — sound out short CVC words |
| `reading.sightWords` | `reading.phonics.sightWords` | 1:1 — reads common non-decodable words |
| `reading.fluency.short` | **unmapped — pending curation** | straddles `reading.fluency.accuracy` / `.pace` / `.expression`; no clean single node — owner picks a lane |

### Writing — **all unmapped (scope boundary: v1 graph is reading+math only)**

| skillTag | → | note |
|---|---|---|
| `writing.gripPosture` | `[]` | handwriting mechanics — no concept-graph domain |
| `writing.letterFormation` | `[]` | handwriting mechanics — no concept-graph domain |
| `writing.copyWords` | `[]` | handwriting mechanics — no concept-graph domain |
| `writing.spelling.phonetic` | `[]` | **owner-review candidate:** the reading graph carries encoding nodes `reading.encoding.spellCvc` / `reading.encoding.spellPatterns`. Whether the `writing.spelling.*` tags should map onto them is a live curation question — left unmapped in v1 rather than guessed. |
| `writing.spelling.sightWord` | `[]` | as above (candidate: `reading.encoding.spellCvc`) |
| `writing.composition.sentence` | `[]` | no sentence-composition node in the v1 graph |
| `writing.sentence.order` | `[]` | no sentence-order node in the v1 graph |

### Math

| skillTag | → concept node(s) | rationale |
|---|---|---|
| `math.addition.facts` | `math.operations.addWithin20` | 1:1 — single-digit addition facts |
| `math.subtraction.noRegroup` | `math.operations.twoDigit` | two-digit subtraction w/o regrouping lives in the two-digit-ops node (regrouping is the distinct node below) |
| `math.subtraction.regroup` | `math.operations.regrouping` | 1:1 — carry/borrow |
| `math.placeValue` | `math.number.placeValue` | 1:1 — tens and ones |
| `math.wordProblems` | `math.problemSolving.oneStep` | catalog evidence is "single-step word problems" → the one-step node, not band-5 multi-step `math.problemSolving` |

### Self-Regulation — **all unmapped (scope boundary: regulation is not a concept domain)**

| skillTag | → | note |
|---|---|---|
| `regulation.attention` | `[]` | a regulation struggle is not a concept miss to re-test |
| `regulation.frustration` | `[]` | ″ |
| `regulation.startAnyway` | `[]` | ″ |
| `regulation.stamina` | `[]` | ″ |
| `regulation.frustrationTolerance` | `[]` | ″ (mirrors the FEAT-69 decision to skip `engagement:'refused'` — regulation ≠ concept gap) |

## Coverage caveat

The re-test seeding lights up **only** for items carrying a catalog tag mapped above. LLM-generated /
empty-tag items correctly no-op (`[]`), and coverage grows purely by curating this table (adding rows or
resolving the `reading.fluency.short` / `writing.spelling.*` questions) — never by touching the wiring.

## Curation questions (open — for the owner)

1. **`reading.fluency.short`** — which of `accuracy` / `pace` / `expression` should it map to (or should the
   fluency tag stay coarse and map to `reading.fluency.accuracy` as the entry node)?
2. **`writing.spelling.phonetic` / `writing.spelling.sightWord`** — map onto the reading-graph encoding
   nodes (`reading.encoding.spellCvc` / `reading.encoding.spellPatterns`), or wait for a dedicated writing
   strand in a future graph re-curation?
3. **Multi-map** — should any tag legitimately map to *more than one* concept? The resolver already
   supports `string[]` values; v1 uses 1:1 only.
