# The Good and the Beautiful — Simply G&B Math → Math-Graph Bridge — v0 — DRAFT PENDING OWNER CURATION (2026-07-25)

> ⚠️ **v0 DRAFT — reconstructed from published reviews, NOT yet verified against the family's course book.**
> Drafted in the home-base chat (2026-07-25) following the FEAT-49→50 (Fast Phonics) and FEAT-63→64
> (Mathseeds / TGTB LA1) draft→curate→apply pattern. **Nothing here ships until the owner curates it**;
> the curation-apply CC run then transcribes it to `src/core/foundations/tgtbMathBridge.ts` and stamps
> this doc v1.
>
> **Sources consulted (2026-07-25):**
> - Official course structure (120 lessons/course, placement test): https://www.goodandbeautiful.com/pages/choose-math
> - Math 2 FAQs (lesson length, assessments): https://www.goodandbeautiful.com/pages/simply-good-and-beautiful-math-2-faqs
> - Per-level scope detail (the uncertain layer — a REVIEW, not the publisher): https://cathyduffyreviews.com/homeschool-reviews-core-curricula/math/math-grades-k-6/simply-good-and-beautiful-math
>
> **Companion to:** [`../LEARNER_MODEL_DESIGN.md`](../LEARNER_MODEL_DESIGN.md) §12 (external-curriculum bridge) and
> [`MATH_GRAPH_V0.md`](./MATH_GRAPH_V0.md) / `src/core/foundations/mathGraph.ts` (the node ids mapped to).
> Bridge mechanism: FEAT-63 `workbookBridge.ts`. Precedents: [`MATHSEEDS_BRIDGE_V0.md`](./MATHSEEDS_BRIDGE_V0.md)
> (`mathseedsBridge.ts`), [`TGTB_LA1_BRIDGE_V0.md`](./TGTB_LA1_BRIDGE_V0.md) (`tgtbLa1Bridge.ts`).

## Why this file exists

The family's workbook configs track **"TGTB Math L107"** — but no TGTB Math bridge exists, so the
learner model is blind to the position. This matters double for fall 2026: the family bought TGTB for
the 2026–27 year and the boys are slated for the free **Math Placement Test**, after which TGTB Math
is likely the primary math curriculum. Scope decision (owner, 2026-07-25): **bridge the currently
tracked course now; add fall-course bridges when placement levels are known.**

## Structure facts (official)

- Every Simply Good & Beautiful Math course (K–6) is **120 lessons**. Lessons run ~20–25 minutes.
- Unit counts vary by level (sources disagree on exactly which levels have 3 vs 4 units — resolve from
  the course book TOC at curation; unit count only matters if we band by unit).
- **Spiral approach** — concepts are taught, revisited, and expanded; lessons carry built-in review
  from Math 1 up. (Banding consequence: a concept's *introduction* band is what `covers[]` should key
  on; later bands re-touch everything, which cumulative semantics already handle.)
- Unit assessments exist but are parent-information, not grades — consonant with the charter; they are
  NOT app evidence (the bridge maps *position*, the covered≠mastered cap does the rest).

## Semantics (inherited unchanged — no new rules)

Identical to `mathseedsBridge` / `tgtbLa1Bridge`, enforced in code by `applyBridgeCoverageToModel`:
covered→`forming` cap + verify-quest openQuestion; cumulative positions; in-band credit via
`makeBandCeilingLessonToUnit`; never downgrades; dedup keeps highest band; **multi-source with
Mathseeds** — both feed the same math graph, so shared nodes (e.g. `math.operations.regrouping`) take
best-supported evidence, never a sum.

## ❓ CURATION QUESTION 1 — course identity (BLOCKING)

**Which Simply G&B Math course is the tracked "L107" inside, and whose config is it?** The owner
checks the app (Settings → Curriculum, the workbook config name + child). Candidates below assume
Lincoln (~3rd-grade math). If it turns out to be London's config, stop and re-draft — the K/1 scope
differs entirely.

Also record: the exact config name string (the bridge's `aliases[]` must match it through the
tolerant normalizer, and the level-conflict guard needs the level digit — the `tgtbLa1Bridge`
precedent, `workbookBridge.ts:180`).

⚠️ **The seeded name carries no level.** The repo seeds this config as literally
`'The Good and the Beautiful Math'` (`src/core/data/gatbCurriculum.ts`,
`src/core/firebase/migrateActivityConfigs.ts`) → normalized `thegoodandthebeautifulmath`, on which
`levelInName()` returns **null**. That is harmless while exactly one TGTB Math bridge exists (the
guard only suppresses a *conflicting* declared level), but it is the crux of Q4/Q5 below — see the
rollover constraint there.

## Candidate A — Math 2 (per-band `covers[]`, v0 — UNVERIFIED)

Coarse 3-band map (40/80/120), the `tgtbLa1Bridge` granularity. Every id is a real
`mathGraph.ts` node. **The band boundaries are the uncertain layer** — reconstructed from a review's
course summary, not the TOC; curation verifies which unit/lesson range actually introduces each.

| upToLesson | Cumulative content (reconstructed) | `covers[]` (math-graph node ids) | notes |
|---|---|---|---|
| 40 | place value review, two-digit add/sub, skip counting, time, money | `math.number.placeValue`, `math.operations.twoDigit`, `math.number.skipCount`, `math.measurement.time`, `math.measurement.money` | — |
| 80 | add/sub **with regrouping** solidified; multiplication introduced via skip counting + visual arrays; graphing | `math.operations.regrouping`, `math.operations.arrays`, `math.data.graphs` | — |
| 120 | times tables forming; gentle division; fraction concepts; geometry; rounding + estimating | `math.operations.multFacts`, `math.operations.division`, `math.fractions.concepts`, `math.geometry.shapes` | **rounding/estimating** — no graph node (recorded, never invented; same call as Mathseeds band 200) |

Worked example if adopted: **L107** → band ceiling **120** → cumulative union of all three bands = 12
concepts as `covered → forming`, alongside Mathseeds' evidence on the overlapping nodes.

## Candidate B — Math 3 (per-band `covers[]`, v0 — UNVERIFIED)

| upToLesson | Cumulative content (reconstructed) | `covers[]` (math-graph node ids) | notes |
|---|---|---|---|
| 40 | place value to millions; multi-digit add/sub with regrouping | `math.number.placeValue`, `math.operations.multiDigit`, `math.operations.regrouping` | "to millions" exceeds the K–5 graph's placeValue framing — evidence detail, not a new node |
| 80 | multiplication emphasis (facts → fluency, up to 4-digit × 1-digit); division; elapsed time | `math.operations.multFacts`, `math.operations.multiTables`, `math.operations.arrays`, `math.operations.division`, `math.measurement.time` | — |
| 120 | fractions (incl. comparing); measurement; geometry; multi-step problems; order of operations; Roman numerals | `math.fractions.concepts`, `math.fractions.compare`, `math.measurement.length`, `math.geometry.shapes`, `math.problemSolving` | **order of operations, Roman numerals** — no graph nodes (recorded, not invented) |

Worked example if adopted: **L107** → band ceiling **120** → cumulative union = 13 concepts as
`covered → forming`. Note `math.operations.multiTables` (fluency) lands here — Mathseeds only grants
it at its band 200, so multi-source rules apply.

## Node-id verification (done at draft time, 2026-07-25)

Every `covers[]` id in **both** candidate tables above was checked against `src/core/foundations/mathGraph.ts`
(v1, 29 nodes): **17 distinct ids, all real** — no invented nodes, nothing to add to the graph. The two
curriculum concepts with **no** graph node (rounding/estimating in A; order of operations + Roman
numerals in B) are recorded in the `notes` column and stay out of `covers[]`, exactly as
`mathseedsBridge`'s band-200 rounding note does. Node-id validity is *not* what curation resolves —
**band placement is.**

## ❓ CURATION QUESTIONS 2–6

> Q4's rollover constraint and Q6's in-band-credit trade-off were added 2026-07-25 after automated
> review of the draft PR (#1622) raised both; Q4's is verified against the live matcher, Q6's is the
> inherited precedent restated as an explicit choice.

2. **Band boundaries (the uncertain layer).** Verify each candidate row against the actual course book
   TOC (the family owns the books / free PDFs). Move `covers[]` ids between bands freely — but see Q6:
   under the **inherited in-band-credit rule**, an L107 child rounds up to band ceiling 120 and is
   credited the union of **all three** bands, so re-shuffling ids *among these three bands* changes
   **nothing** for that child today. Band placement starts to matter (a) for a child at a lower
   position, (b) as the position advances, and (c) immediately, if Q6 adopts completed-band semantics.
   Verify it anyway — the table is the durable artifact, not just today's read.
3. **3 bands or unit-aligned bands?** 40/80/120 mirrors `tgtbLa1Bridge`. If the course book's units
   suggest natural boundaries (e.g. 4×30), band on those instead — pure data choice, same code. Note
   this does not, by itself, change what an L107 child is credited: under band-ceiling rounding, *any*
   banding credits everything up to the top band the child is inside (4×30 → L107 still rounds to 120).
   Only Q6 changes that.
4. **Fall courses.** After the placement test lands, each new course (each boy) is a new data module of
   the same shape — Math K/1 for London and whatever Lincoln places into. Name the follow-up row then;
   do NOT pre-build on guessed levels (owner call, 2026-07-25: current now, fall later).
   **⚠️ Blocking prerequisite for the multi-course world (verified, not hypothetical):**
   `matchWorkbookBridge` resolves a bridge **by name only — it takes no `childId`**. Ship two leveled
   math bridges (`tgtbMath2` + `tgtbMath3`) carrying the same generic alias and resolve the *seeded*
   level-less name against them and both match at the identical alias length → the tie returns
   **`ambiguous`**, so **neither** boy's position syncs (probed 2026-07-25 against the real matcher:
   generic name → both bridges score 23 → tie; `'…Math Level 3'` → `levelInName` = 3 → `tgtbMath2`
   suppressed, `tgtbMath3` matches cleanly). So the fall rollover **must** pick one:
   **(a)** give each child's config a **level-bearing name** (`… Math Level 3`) — no code change, the
   existing guard then does the work; **(b)** give each bridge a **distinct non-generic alias** and
   drop the shared one; or **(c)** make resolution **child-aware** (a code change to `workbookBridge`,
   the largest option). Recommended: **(a)** — it is a config-name edit, and the guard was built for it.
5. **Rollover semantics.** If the fall placement puts a boy in a *different* course than the tracked
   one, the old config's evidence stands (cumulative, never downgraded) and the new course simply
   becomes a new source — confirm no special handling is wanted. This is true **per bridge**; it
   assumes Q4's disambiguation is settled first, or the new source resolves to `ambiguous` and writes
   nothing.
6. **In-band credit vs. completed-band semantics — inherited, and worth a deliberate re-confirm.**
   Band-ceiling rounding credits the band the child is *inside*: L107 → ceiling 120, so concepts whose
   real introduction sits at lessons 108–120 are recorded as `covered` before the child reaches them,
   and each queues a verify-quest ask. That is **not new here** — it is the shipped, owner-curated rule
   for both existing bridges (`mathseedsBridge` L122 → 150 and `tgtbLa1Bridge` L110 → 120, both pinned
   as owner fixtures), justified by the `covered → forming` cap: the claim is *exposure*, never mastery,
   and the verify-quest is exactly how a not-yet-reached concept gets corrected. Options if the owner
   wants it tighter **for this bridge**: keep the precedent (default); use **completed-band** semantics
   (credit only bands fully below the position — L107 → 80, dropping the whole third band); or cut
   **finer bands** so the over-credit window shrinks. ⚠️ Changing the *rule* rather than this bridge's
   data would also change Mathseeds/LA1 behavior — that is an invariant-level, propose-and-confirm
   decision, not a data edit, and should not ride along with this bridge's curation.

## Named future (backlog, not built)

- Fall-course bridges (Q4) — after placement.
- A finer lesson→node map if the coarse bands ever mislead — the covered→forming cap + verify-quest
  makes coarse honest, same as Mathseeds/LA1.

## What a curation-apply run does (the FEAT-50 / FEAT-64 pattern, for the follow-up run)

1. Answer Q1 (course identity + exact config name string), then fix the bands per Q2/Q3 in **this doc**
   and stamp it **v1 — OWNER-CURATED**.
2. Transcribe the curated table verbatim into `src/core/foundations/tgtbMathBridge.ts` — a
   `WorkbookBridge` with `sourceId: 'tgtbMath<N>'`, `aliases[]` matching the real config name,
   `level: <N>` (the level-conflict guard), `units[]`, and
   `lessonToUnit: makeBandCeilingLessonToUnit([...])`.
3. Register it in `workbookBridge.ts`'s bridge registry and **flip the pinned negative** in
   `workbookBridge.test.ts` (today it asserts TGTB Math resolves to *no* bridge — that assertion is
   correct until this ships and must be updated deliberately, not deleted).
4. Add `tgtbMathBridge.test.ts` mirroring `mathseedsBridge.test.ts`: every id is a real `mathGraph.ts`
   node, cumulative-union fixture at the child's real position, and the multi-source-with-Mathseeds case.
5. Update [`../LEARNER_MODEL_DESIGN.md`](../LEARNER_MODEL_DESIGN.md) §12.5 and
   [`../DOCUMENT_INDEX.md`](../DOCUMENT_INDEX.md), and close the ledger row.
