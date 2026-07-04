# Fast Phonics → Reading-Graph Bridge — v1 — CURATED against official scope & sequence (2026-07-04)

> ✅ **v1 — CURATED against the official Reading Eggs / Fast Phonics scope & sequence (2026-07-04).**
> The per-peak content layer below is now transcribed from the **authoritative published scope & sequence**
> (verified 2026-07-04, <https://readingeggs.com/schools/fastphonics/scope-sequence/>), which shows Fast
> Phonics follows the **UK Letters and Sounds** phase order (Phases 2–5) rather than the US-conventional
> synthetic-phonics order the v0 draft reconstructed. This corrects the draft substantially: the phase
> framing replaces the draft's four "Level" bands, r-controlled and diphthong graphemes interleave inside
> Phase 3 (not a late "Level 4"), silent-e (split digraphs) is a *late* Phase-5 peak (Peak 18, not Peaks
> 11–12), and multisyllable decoding begins in Phase 4. **This is now authoritative for the FEAT-46 build**
> (same status the graph appendices reached at FEAT-47) and still ships as versioned bridge data, unchanged
> in shape. The node→band layer (which reuses the curated reading graph) was high-confidence in v0 and is
> unchanged; only the per-peak content mapping was corrected.
>
> **Curation history:** v0 DRAFT (2026-07-04, FEAT-49) — per-peak grapheme boundaries reconstructed from a
> US-conventional sequence and flagged as the uncertain layer, pending owner verification. v1 CURATED
> (2026-07-04, FEAT-50) — replaced with the official scope & sequence; all five open questions resolved
> (see "Curation resolutions" below, where the draft's questions are kept and answers appended).
>
> **Companion to:** [`../LEARNER_MODEL_DESIGN.md`](../LEARNER_MODEL_DESIGN.md) §B (external-curriculum
> bridge) and [`READING_GRAPH_V0.md`](./READING_GRAPH_V0.md) (the node ids mapped to). Ledger anchor:
> **FEAT-50** (curates the **FEAT-49** draft; refs FEAT-46 design, FEAT-48 slice 1).

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
  phase: 2 | 3 | 4 | 5            // official Letters-and-Sounds phase this peak sits in
  graphemes: string[]             // the sounds/graphemes this peak teaches (from the official S&S)
  covers: string[]                // reading-graph node ids this peak supplies `covered` evidence for
  frontierHint?: string           // node id this peak is primarily *working at* (for frontier placement)
}
```

`covers[]` is the load-bearing field: it is the list of graph node ids that a completed peak marks `covered`.
`frontierHint` names the single node the peak is *centered* on, so ingesting a *partially* complete peak (the
child's current climb) can place a `frontier` rather than blanket-`covered` its target. (`phase` is additive
metadata for display/frontier hints — the shape is otherwise identical to v0; the correction is in the data,
not the type.)

## Curated mapping — Fast Phonics Peaks 1–20 → reading-graph node ids (official scope & sequence)

Fast Phonics is a 20-peak climb (Yeti guide, mountain theme). The **official** Reading Eggs scope & sequence
(verified 2026-07-04) maps the peaks onto the **UK Letters and Sounds** phases 2–5. The authoritative
mapping, transcribed exactly, is:

| Peaks | Phase | Official content | Graph nodes covered |
|---|---|---|---|
| 1–5 | 2 | Letter sets: s,a,t,p / m,i,d,n / g,o,c,k,ck / r,e,u / l,h,f,b,ll,ff,ss. VC/CVC reading, tricky words begin, segmenting for spelling. 23 graphemes, ~143 words. | `reading.phonemic.hearSounds`, `reading.phonics.letterSounds`, `reading.phonics.cvc`, `reading.encoding.spellCvc`; tricky words begin feeding `reading.phonics.sightWords` (capped, see note) |
| 6–7 | 3 | j,v,w / x,y,z,zz,qu — completes single letter sounds | `reading.phonics.letterSounds` (completes), `reading.phonics.cvc` (consolidates) |
| 8 | 3 | Consonant digraphs sh, ch, th, ng | `reading.phonics.digraphs` |
| 9–12 | 3 | Vowel digraphs/trigraphs one at a time: ai,ee,igh,oa (9); oo,ar,or,ur (10); ow,oi,ear,air (11); er,ure (12). 25 graphemes across Phase 3, 350+ words. | `reading.phonics.vowelTeams` (early set), `reading.phonics.rControlled` (ar/or/ur at 10; er at 12), `reading.phonics.diphthongs` (ow/oi at 11) |
| 13–14 | 4 | Adjacent consonants: CVCC/CCVC (13); CCVCC/CCCVC (14). Polysyllabic words introduced. No new graphemes. 400+ words. | `reading.phonics.blends`; `reading.decoding.multisyllable` (begins) |
| 15–17 | 5 | New graphemes: ay,ie,ea,oy,ir (15); ou,ue,aw,wh,ph (16); ew,oe,au,ey (17) | `reading.phonics.vowelTeams` (extended set), `reading.phonics.diphthongs` (extended) |
| 18 | 5 | Split digraphs a-e, e-e, i-e, o-e, u-e | `reading.phonics.longVowels` (silent-e) |
| 19–20 | 5 | Alternative pronunciations (soft c/g; ow as in snow; ea as in bread; y as in baby) (19); alternative spellings (tch, dge, kn, wr, mb) (20) | Depth on `reading.phonics.vowelTeams` / `reading.decoding.multisyllable` — no new node; mark as depth-consolidation rows |

### Per-peak `covers[]` (versioned data derived from the table above)

The bridge stores one `BridgeUnit` per peak; `covers[]` distributes the phase group's nodes across its peaks
using the per-peak grapheme detail in the "Official content" column. Coverage is cumulative on ingest.

| Peak | Phase | Graphemes (official) | `covers` node ids | frontierHint |
|---|---|---|---|---|
| 1 | 2 | s, a, t, p | `reading.phonemic.hearSounds`, `reading.phonics.letterSounds`, `reading.phonics.cvc`, `reading.encoding.spellCvc`, `reading.phonics.sightWords` | `reading.phonics.letterSounds` |
| 2 | 2 | m, i, d, n | `reading.phonics.letterSounds`, `reading.phonics.cvc`, `reading.encoding.spellCvc`, `reading.phonics.sightWords` | `reading.phonics.cvc` |
| 3 | 2 | g, o, c, k, ck | `reading.phonics.letterSounds`, `reading.phonics.cvc`, `reading.encoding.spellCvc`, `reading.phonics.sightWords` | `reading.phonics.cvc` |
| 4 | 2 | r, e, u | `reading.phonics.letterSounds`, `reading.phonics.cvc`, `reading.encoding.spellCvc`, `reading.phonics.sightWords` | `reading.phonics.cvc` |
| 5 | 2 | l, h, f, b, ll, ff, ss | `reading.phonics.letterSounds`, `reading.phonics.cvc`, `reading.encoding.spellCvc`, `reading.phonics.sightWords` | `reading.phonics.cvc` |
| 6 | 3 | j, v, w | `reading.phonics.letterSounds`, `reading.phonics.cvc` | `reading.phonics.cvc` |
| 7 | 3 | x, y, z, zz, qu | `reading.phonics.letterSounds`, `reading.phonics.cvc` | `reading.phonics.cvc` |
| 8 | 3 | sh, ch, th, ng | `reading.phonics.digraphs` | `reading.phonics.digraphs` |
| 9 | 3 | ai, ee, igh, oa | `reading.phonics.vowelTeams` | `reading.phonics.vowelTeams` |
| 10 | 3 | oo, ar, or, ur | `reading.phonics.vowelTeams`, `reading.phonics.rControlled` | `reading.phonics.rControlled` |
| 11 | 3 | ow, oi, ear, air | `reading.phonics.diphthongs` | `reading.phonics.diphthongs` |
| 12 | 3 | er, ure | `reading.phonics.rControlled` | `reading.phonics.rControlled` |
| 13 | 4 | (no new graphemes) CVCC / CCVC | `reading.phonics.blends`, `reading.decoding.multisyllable` | `reading.phonics.blends` |
| 14 | 4 | (no new graphemes) CCVCC / CCCVC | `reading.phonics.blends`, `reading.decoding.multisyllable` | `reading.phonics.blends` |
| 15 | 5 | ay, ie, ea, oy, ir | `reading.phonics.vowelTeams`, `reading.phonics.diphthongs` | `reading.phonics.vowelTeams` |
| 16 | 5 | ou, ue, aw, wh, ph | `reading.phonics.vowelTeams`, `reading.phonics.diphthongs` | `reading.phonics.vowelTeams` |
| 17 | 5 | ew, oe, au, ey | `reading.phonics.vowelTeams`, `reading.phonics.diphthongs` | `reading.phonics.vowelTeams` |
| 18 | 5 | a-e, e-e, i-e, o-e, u-e (split digraphs) | `reading.phonics.longVowels` | `reading.phonics.longVowels` |
| 19 | 5 | alternative pronunciations (soft c/g; ow→snow; ea→bread; y→baby) | *(depth-consolidation — no new node)* `reading.phonics.vowelTeams`, `reading.decoding.multisyllable` | `reading.decoding.multisyllable` |
| 20 | 5 | alternative spellings (tch, dge, kn, wr, mb) | *(depth-consolidation — no new node)* `reading.phonics.vowelTeams`, `reading.decoding.multisyllable` | `reading.decoding.multisyllable` |

Peaks 19–20 add **no new graph node** — they are alternative-pronunciation / alternative-spelling depth on
graphemes already covered. They are marked **depth-consolidation rows**: ingesting them raises confidence
*within* the existing `forming` states (vowel-team decoding breadth and multisyllable decoding), never a new
`covered` node.

### Sight words (cross-peak strand)

Fast Phonics introduces high-frequency / "tricky" words beginning in Phase 2 (Peaks 1–5) and continuing
across every peak. The account-level **words-known count** (548 at the anchor) maps to the single node:

| External signal | node id | Semantics |
|---|---|---|
| "Words known" count | `reading.phonics.sightWords` | Multi-source evidence alongside in-app `sightWordProgress`; take **best-supported** (a large external count dominates a thin in-app count); still capped at `forming` by covered≠mastered — the in-app confirm-mastery path or an eval reaches `solid`. **These are decodable-words-read milestones, not Dolch mastery** — see the words-known note below. |

## What "Peak 13 completed, 100% quizzes" produces (worked example — corrected v1)

> **v1 correction (2026-07-04).** The v0 draft placed Peak 13 at *early vowel teams (ai/ay/ee/ea)* and drew
> `reading.phonics.vowelTeams` into the Peak-13 union. The official scope & sequence corrects this: **Peak 13
> is Phase 4 adjacent-consonant blends (CVCC/CCVC)** — the vowel teams were already covered earlier in Phase 3
> (Peaks 9–12), and silent-e (`longVowels`) is *ahead* of the frontier at Peak 18. The worked example below
> replaces the draft's version.

Ingesting **Peak 13 complete** (cumulative Peaks 1–13) via chat-upload proposes `covered` evidence for:

- `reading.phonemic.hearSounds`, `reading.phonics.letterSounds`, `reading.phonics.cvc`,
  `reading.encoding.spellCvc` (Phase 2, Peaks 1–5)
- `reading.phonics.digraphs` (Phase 3, Peak 8)
- `reading.phonics.vowelTeams` (Phase 3, Peaks 9–10 early set), `reading.phonics.rControlled`
  (Phase 3, Peaks 10 + 12: ar/or/ur, er), `reading.phonics.diphthongs` (Phase 3, Peak 11: ow/oi)
- `reading.phonics.blends` (Phase 4, Peak 13 — the child's **current frontier**),
  `reading.decoding.multisyllable` (begins Phase 4, Peak 13)
- `reading.phonics.sightWords` from the 548-word count (best-supported over the 3 in-app)

`reading.phonics.longVowels` (silent-e) is **correctly left untouched** — it is Peak 18 content, ahead of a
child at Peak 13. This is the **silent-e ahead-of-frontier** case: the bridge does not mark a node `covered`
for content the child has not yet reached, so `longVowels` stays `not-yet` until the child climbs to Phase 5.

Every covered node lands at **`forming`, not `solid`**, each with an `openQuestion` offering a targeted
Knowledge Mine quest to verify. The 100% quiz average raises confidence *within* `forming`. Contrast the
pre-bridge model: these were **`not-yet` with "—" evidence**, the exact 43-row emptiness that made the list
unreviewable. The child is not at 3 sight words; he is a strong decoder at the **Phase-4 adjacent-consonant
frontier** whose evidence simply lived off-app.

**Independent corroboration of the frontier.** The bridge-derived frontier for a Peak-13 child (blends in
progress, Peak 14 next) **matches the in-app FEAT-48 seeded frontier** (blends / digraphs), which was derived
from an entirely separate evidence path (the deterministic working-level seeder over skill snapshots). Two
independent sources — the external curriculum position and the in-app seeder — agree on where this child is
working. That agreement is itself evidence the corrected mapping is right.

## Scan-pipeline tie-in (LATER slice, noted not built)

The existing scan flow (`useScanToActivityConfig`) recognised a Fast Phonics screenshot only as "Reading
Eggs" with no positioning. A LATER slice routes certificates / progress reports recognised by the scan flow
through **this same bridge** (same `covers[]` map), so a photographed end-of-peak certificate produces the
same `curriculumPosition` evidence as a chat-upload. **Chat-upload is the v1 path** (design §A); scan-ingest
is the follow-on. Both converge on this one bridge — the mapping is authored once.

## Words-known counts — what the milestone numbers mean

The cumulative words-read counts in the official scope & sequence — **~143 (Phase 2), 350+ (Phase 3), 400+
(Phase 4), 500+ (Phase 5)** — are **decodable-words-read milestones, NOT Dolch sight-word mastery.** They
count words the program has had the child decode across its books and activities. In the bridge they feed
`curriculumPosition` evidence on `reading.phonics.sightWords` (as breadth) and general decoding confidence —
always **under the §13 covered≠mastered cap (max `forming`)**. They never assert Dolch mastery: the in-app
per-word `sightWordProgress` tracking remains the Dolch authority, and the confirm-mastery path there is what
reaches `solid`. The external count stops the in-app tracker being read as a ceiling; it does not replace it.

## Curation resolutions (2026-07-04) — the draft's open questions, answered

The v0 draft closed with six "Scope-&-sequence gaps" flagged for owner verification. The official Reading
Eggs scope & sequence (verified 2026-07-04, <https://readingeggs.com/schools/fastphonics/scope-sequence/>)
resolves all of them. Per curation convention the draft's questions are kept and the resolutions appended.

1. **Exact peak boundaries.** *(Draft: peak boundaries reconstructed from a US-conventional sequence,
   flagged uncertain — esp. the digraph/blend and long-vowel/vowel-team splits.)*
   **RESOLVED:** boundaries are exactly per the official table above (Phases 2–5, cited source). The draft's
   spacing was wrong in kind, not just detail — Fast Phonics follows the **UK Letters and Sounds** order, so
   digraphs land at Peak 8, vowel teams begin Peak 9 (Phase 3, not a "Level 3"), and adjacent-consonant
   blends are Phase 4 (Peaks 13–14). The node→band layer (reused from the curated reading graph) was
   unaffected and is unchanged.
2. **Peak 13's actual contents.** *(Draft: assumed early vowel teams ai/ay/ee/ea; called this "the
   highest-leverage correction.")*
   **RESOLVED:** Peak 13 is **Phase 4 adjacent-consonant blends (CVCC/CCVC)** — **not** silent-e and **not**
   vowel teams (those are earlier, Phase 3). `reading.phonics.vowelTeams` is therefore dropped from the
   Peak-13 *frontier* (it's already `covered` by Peak 10), and `reading.phonics.blends` +
   `reading.decoding.multisyllable` are the Peak-13 additions. **Corroboration recorded explicitly:** the
   bridge-derived frontier (blends in progress, Peak 14 next) **matches the in-app FEAT-48 seeded frontier**
   (blends / digraphs) — two independent evidence sources agree on the child's current position.
3. **R-controlled before or after diphthongs?** *(Draft: drafted r-controlled 16–17 → diphthongs 18–19,
   noting some sequences invert this.)*
   **RESOLVED:** neither is a late "Level 4" item — both are **interleaved inside Phase 3, Peaks 9–12**
   (r-controlled ar/or/ur at Peak 10 and er at Peak 12; diphthongs ow/oi at Peak 11), then extended in Phase
   5 (Peaks 15–17). **The draft's four-"Level" frame is replaced by the official five-phase frame throughout
   this doc.**
4. **"Sounds" vs "graphemes" counting ("45 sounds").** *(Draft: the account's "45 sounds" may count
   phonemes, graphemes, or activities, which changes grapheme spacing.)*
   **RESOLVED:** "45 sounds" is **marketing shorthand for the English phoneme count** (~44–45 phonemes); it
   is not a per-peak counter. The bridge tracks the **per-peak grapheme sets from the official table**
   instead (Phase 2: 23 graphemes; Phase 3: 25 graphemes; Phase 5 per-peak sets as listed). Grapheme spacing
   no longer depends on interpreting the "45 sounds" figure.
5. **Total peak count.** *(Draft: drafted as 20; if the account tops out differently the Level-4 grouping
   shifts.)*
   **RESOLVED:** **20 peaks confirmed** by the official source.
6. **Multisyllable coverage.** *(Draft: placed on Peak 20 only; noted Fast Phonics may weave it earlier.)*
   **RESOLVED:** multisyllable / polysyllabic decoding **begins in Phase 4 (Peaks 13–14)** where polysyllabic
   words are introduced, and **consolidates through Phase 5** — corrected from the draft's Peak-20-only
   placement. `reading.decoding.multisyllable` is `covered` from Peak 13 onward.

**Correcting any of the above is a data edit to `covers[]` / `graphemes[]`, not a code change** — the bridge
ships as versioned data (v1) exactly so the owner curates it the way he curated the graphs.
