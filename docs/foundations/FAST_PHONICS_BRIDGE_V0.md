# Fast Phonics → Reading-Graph Bridge — v0 — DRAFT PENDING OWNER CURATION

> ⚠️ **v0 DRAFT — PENDING OWNER CURATION (2026-07-04).** Same workflow as the graph appendices
> (`READING_GRAPH_V0.md` / `MATH_GRAPH_V0.md`): this is a *proposed* mapping the owner reviews and
> corrects against his actual Fast Phonics (Reading Eggs) account before it ships as versioned bridge
> data. **It is not authoritative yet.** The peak→grapheme boundaries below are reconstructed from the
> published Fast Phonics synthetic-phonics scope & sequence and the family's own progress anchor
> (Peak 13 completed, 45 sounds, 548 words known, June 2026); the exact per-peak sound splits carry the
> uncertainty flagged in the "Scope-&-sequence gaps" section and must be verified against the account.
>
> **Companion to:** [`../LEARNER_MODEL_DESIGN.md`](../LEARNER_MODEL_DESIGN.md) §B (external-curriculum
> bridge) and [`READING_GRAPH_V0.md`](./READING_GRAPH_V0.md) (the node ids mapped to). Ledger anchor:
> **FEAT-49** (refs FEAT-46 design, FEAT-48 slice 1).

## Why this file exists

The seeded model showed **3 / 350 sight words** for a child whose Fast Phonics account shows **548 words
known, 45 sounds, 39 books read, Peak 13 completed (June 2026), 100% average end-of-peak quizzes.** The
model wasn't wrong — it was **starved.** The child's real reading life happens substantially in an external
curriculum the app never sees. This bridge is the evidence path for that curriculum: it maps *completing a
Fast Phonics unit* to `covered` evidence on the graph nodes that unit teaches, so an upload of the account's
progress can feed the model without a page-by-page photo of every workbook.

## Semantics (the rules this data obeys)

- **A completed peak = `covered` evidence for its mapped nodes — nothing more.** Per the covered≠mastered
  cap (design §C), `curriculumPosition` evidence alone moves a concept to **at most `forming`** and attaches
  an `openQuestion` ("verify with a quick quest?"). It **never** promotes a node to `solid`. `solid` still
  requires a quest/eval finding, a parent attestation, or (future) sustained multi-source signal.
- **Quiz scores promote *within* `forming`, never past it.** 100% end-of-peak quizzes are strong signal and
  raise confidence inside `forming`, but a curriculum's own internal quiz is not the app's independent
  verification — it does not reach `solid` on its own.
- **Sight words are multi-source.** The external "words known" count is evidence on the single
  `reading.phonics.sightWords` node **alongside** the in-app `sightWordProgress` tracker. The model takes the
  **best-supported** source, not the sum: 548 externally-known words is far better evidence than 3 in-app, so
  it dominates — but neither is a raw count shown to the parent (display rules, design §D). The in-app tracker
  stays the canonical *interaction* store; this bridge just stops it from being read as the child's ceiling.
- **Positions are cumulative.** Completing Peak 13 implies coverage of Peaks 1–13. The bridge maps each peak;
  ingesting "Peak 13 complete" applies the union of Peaks 1–13's node coverage.

## Bridge data shape (proposed — ships as versioned data, like the graphs)

```ts
// src/core/foundations/bridges/fastPhonics.ts  (proposed — versioned data, PR-reviewed)
export interface CurriculumBridge {
  source: 'fastPhonics'           // matches EvidenceRef.curriculumPosition.source
  version: number                 // bump on curation, like the graphs
  units: BridgeUnit[]
}
export interface BridgeUnit {
  unit: string                    // 'peak-1' … 'peak-20'
  label: string                   // 'Peak 1 — s, a, t, p'
  graphemes: string[]             // the sounds/graphemes this peak teaches (owner-verifiable)
  covers: string[]                // reading-graph node ids this peak supplies `covered` evidence for
  frontierHint?: string           // node id this peak is primarily *working at* (for frontier placement)
}
```

`covers[]` is the load-bearing field: it is the list of graph node ids that a completed peak marks `covered`.
`frontierHint` names the single node the peak is *centered* on, so ingesting a *partially* complete peak (the
child's current climb) can place a `frontier` rather than blanket-`covered` its target.

## Draft mapping — Fast Phonics Peaks 1–20 → reading-graph node ids

Fast Phonics is organised as a 20-peak climb (Yeti guide, mountain theme). The published scope & sequence
follows a standard synthetic-phonics order: single-letter sounds → short-vowel CVC → consonant digraphs &
blends → long vowels (silent-e, vowel teams) → r-controlled, diphthongs, and multisyllable decoding. The
family anchor (**45 sounds by Peak 13** ≈ 3.5 graphemes/peak) is consistent with that structure and is used
to space the grapheme groups below. **Grapheme splits per peak are the draft's uncertain layer** — see gaps.

### Level 1 — Peaks 1–5 · single sounds → short-vowel CVC (band K–1)

| Peak | Graphemes (draft) | `covers` node ids | frontierHint |
|---|---|---|---|
| Peak 1 | s, a, t, p | `reading.phonemic.hearSounds`, `reading.phonics.letterSounds` | `reading.phonics.letterSounds` |
| Peak 2 | i, n, m, d | `reading.phonics.letterSounds`, `reading.phonics.cvc` | `reading.phonics.cvc` |
| Peak 3 | g, o, c, k, ck | `reading.phonics.letterSounds`, `reading.phonics.cvc`, `reading.encoding.spellCvc` | `reading.phonics.cvc` |
| Peak 4 | e, u, r, h, b | `reading.phonics.letterSounds`, `reading.phonics.cvc`, `reading.encoding.spellCvc` | `reading.phonics.cvc` |
| Peak 5 | f, l, j, v, w | `reading.phonics.letterSounds`, `reading.phonics.cvc`, `reading.encoding.spellCvc` | `reading.phonics.cvc` |

### Level 2 — Peaks 6–10 · remaining single sounds, double letters, digraphs, blends (band 1)

| Peak | Graphemes (draft) | `covers` node ids | frontierHint |
|---|---|---|---|
| Peak 6 | x, y, z, qu | `reading.phonics.letterSounds`, `reading.phonics.cvc` | `reading.phonics.cvc` |
| Peak 7 | ll, ss, ff, zz (double letters) | `reading.phonics.cvc`, `reading.encoding.spellCvc` | `reading.phonics.cvc` |
| Peak 8 | sh, ch, th, ng | `reading.phonics.digraphs` | `reading.phonics.digraphs` |
| Peak 9 | initial/final blends (st, fr, mp, nd …) | `reading.phonics.blends`, `reading.encoding.spellPatterns` | `reading.phonics.blends` |
| Peak 10 | wh, ck review, blend consolidation | `reading.phonics.digraphs`, `reading.phonics.blends` | `reading.phonics.blends` |

### Level 3 — Peaks 11–15 · long vowels & vowel teams (band 2)

| Peak | Graphemes (draft) | `covers` node ids | frontierHint |
|---|---|---|---|
| Peak 11 | a_e, i_e (silent-e) | `reading.phonics.longVowels`, `reading.encoding.spellPatterns` | `reading.phonics.longVowels` |
| Peak 12 | o_e, u_e, e_e (silent-e) | `reading.phonics.longVowels`, `reading.encoding.spellPatterns` | `reading.phonics.longVowels` |
| Peak 13 | ai, ay, ee, ea (vowel teams) | `reading.phonics.vowelTeams`, `reading.encoding.spellPatterns` | `reading.phonics.vowelTeams` |
| Peak 14 | oa, ow, igh, ie | `reading.phonics.vowelTeams` | `reading.phonics.vowelTeams` |
| Peak 15 | oo, ew, ue, y-as-vowel | `reading.phonics.vowelTeams` | `reading.phonics.vowelTeams` |

### Level 4 — Peaks 16–20 · r-controlled, diphthongs, multisyllable (band 3)

| Peak | Graphemes (draft) | `covers` node ids | frontierHint |
|---|---|---|---|
| Peak 16 | ar, or | `reading.phonics.rControlled` | `reading.phonics.rControlled` |
| Peak 17 | er, ir, ur | `reading.phonics.rControlled` | `reading.phonics.rControlled` |
| Peak 18 | oi, oy, ou, ow (diphthongs) | `reading.phonics.diphthongs` | `reading.phonics.diphthongs` |
| Peak 19 | aw, au, -le, soft c/g | `reading.phonics.diphthongs` | `reading.phonics.diphthongs` |
| Peak 20 | multisyllable decoding, schwa, review | `reading.decoding.multisyllable` | `reading.decoding.multisyllable` |

### Sight words (cross-peak strand)

Fast Phonics introduces high-frequency / "tricky" words across every peak. The account-level **words-known
count** (548 at the anchor) maps to the single node:

| External signal | node id | Semantics |
|---|---|---|
| "Words known" count | `reading.phonics.sightWords` | Multi-source evidence alongside in-app `sightWordProgress`; take **best-supported** (a large external count dominates a thin in-app count); still capped at `forming` by covered≠mastered — the in-app confirm-mastery path or an eval reaches `solid`. |

## What "Peak 13 completed, 100% quizzes" produces (worked example)

Ingesting **Peak 13 complete** (cumulative Peaks 1–13) via chat-upload proposes `covered` evidence for:

- `reading.phonemic.hearSounds`, `reading.phonics.letterSounds`, `reading.phonics.cvc`,
  `reading.encoding.spellCvc` (Level 1–2)
- `reading.phonics.digraphs`, `reading.phonics.blends`, `reading.encoding.spellPatterns` (Level 2)
- `reading.phonics.longVowels`, `reading.phonics.vowelTeams` (Level 3, through Peak 13)
- `reading.phonics.sightWords` from the 548-word count (best-supported over the 3 in-app)

Every one lands at **`forming`, not `solid`**, each with an `openQuestion` offering a targeted Knowledge Mine
quest to verify. The 100% quiz average raises confidence *within* `forming`. Contrast the pre-bridge model:
these were **`not-yet` with "—" evidence**, the exact 43-row emptiness that made the list unreviewable. The
child is not at 3 sight words; he is a strong mid-Level-3 decoder whose evidence simply lived off-app.

## Scan-pipeline tie-in (LATER slice, noted not built)

The existing scan flow (`useScanToActivityConfig`) recognised a Fast Phonics screenshot only as "Reading
Eggs" with no positioning. A LATER slice routes certificates / progress reports recognised by the scan flow
through **this same bridge** (same `covers[]` map), so a photographed end-of-peak certificate produces the
same `curriculumPosition` evidence as a chat-upload. **Chat-upload is the v1 path** (design §A); scan-ingest
is the follow-on. Both converge on this one bridge — the mapping is authored once.

## Scope-&-sequence gaps — where this draft is uncertain (owner, please verify)

The **node-band mapping is high-confidence** (it reuses the curated reading graph); the **per-peak grapheme
boundaries are the uncertain layer.** Specific things to check against the actual account:

1. **Exact peak boundaries.** The 45-sounds-by-Peak-13 anchor spaces the groups at ~3.5 graphemes/peak, but
   the published order does not cleanly document which grapheme lands in which peak. **Peaks 6–10 (the
   digraph/blend transition) and Peaks 11–15 (the long-vowel/vowel-team split) are the least certain** — the
   boundary between "silent-e" peaks and "vowel-team" peaks especially. Please confirm which peak first
   introduces vowel teams, since that sets where `reading.phonics.vowelTeams` starts being `covered`.
2. **Peak 13's actual contents.** The worked example assumes Peak 13 reaches early vowel teams (ai/ay/ee/ea).
   If the account shows Peak 13 still inside silent-e, drop `reading.phonics.vowelTeams` from the Peak 13
   union. This single fact is the highest-leverage correction — it decides the child's current frontier.
3. **Does Fast Phonics teach r-controlled before or after diphthongs?** Drafted r-controlled (16–17) →
   diphthongs (18–19); some synthetic sequences invert this. Affects only Level 4 ordering, not band.
4. **"Sounds" vs "graphemes" counting.** The account's "45 sounds" may count phonemes, graphemes, or
   completed activities — which changes the graphemes/peak spacing. Confirm what the number counts.
5. **Total peak count.** Drafted as 20. If the account tops out differently, the Level-4 grouping shifts.
6. **Multisyllable coverage.** Drafted onto Peak 20 only; Fast Phonics may weave multisyllable decoding
   earlier. `reading.decoding.multisyllable` placement should follow the account.

**Correcting any of the above is a data edit to `covers[]` / `graphemes[]`, not a code change** — the bridge
ships as versioned data exactly so the owner curates it the way he curated the graphs.
