# Mathseeds → Math-Graph Bridge — v1 — OWNER-CURATED (2026-07-15, official-source verified)

> ✅ **v1 — OWNER-CURATED and SHIPPED as bridge data.** The per-band content below was
> **owner-adopted and verified against the official Mathseeds publisher pages on 2026-07-15**, then
> transcribed into `src/core/foundations/mathseedsBridge.ts` (FEAT-64). This file is now the authority
> the code mirrors — correcting the mapping is a data edit in the `.ts` module, re-synced here.
>
> **Official sources verified (2026-07-15):**
> - Content overview — https://mathseeds.com/content-overview/
> - Lesson overview — https://mathseeds.com/lesson-overview/
>
> **Companion to:** [`../LEARNER_MODEL_DESIGN.md`](../LEARNER_MODEL_DESIGN.md) §12 (external-curriculum
> bridge) and [`MATH_GRAPH_V0.md`](./MATH_GRAPH_V0.md) (the math-graph node ids mapped to). Bridge
> mechanism: FEAT-63 (`src/core/foundations/workbookBridge.ts`). Activation: **FEAT-64** (refs FEAT-49
> §12, FEAT-53 the Fast Phonics template, FEAT-47/50 the curation-apply pattern, FEAT-62 the
> position-capture pipeline that feeds it).

## Why this file exists

The learner model tracks curriculum *positions* (workbook configs) but, before FEAT-63, never read
them — the model's **math** picture was blind to the child's primary math curriculum. The family's
Mathseeds config reads **Level 122**; the model saw none of it. FEAT-63 shipped the *wiring* (a
generalized `WorkbookBridge` + position → evidence conversion + two triggers + a diag sync action).
FEAT-64 ships the **data half** for Mathseeds: this curated mapping of Mathseeds lessons to math-graph
node ids, turning "Level 122 reached" into `covered` evidence on the concepts those levels teach —
exactly as the Fast Phonics bridge does for reading.

## Structure fact (official)

Mathseeds is **200 numbered lessons, 50 per grade band**:

| Grade band | Lessons |
|---|---|
| Kindergarten | 1–50 |
| Grade 1 | 51–100 |
| Grade 2 | 101–150 |
| Grade 3 | 151–200 |

The family's config tracks a single Mathseeds lesson number (their child: **L122**, inside the Grade 2
band).

## Semantics (the rules this data obeys)

Inherited unchanged from the Fast Phonics bridge (design §12 / §13) and enforced in code by
`applyBridgeCoverageToModel`, so the curation only had to get the **mapping** right, not the rules:

- **Reaching a band = `covered` evidence for its mapped nodes — nothing more.** `curriculumPosition`
  evidence alone caps a concept at **`forming`** and attaches a "verify with a quick quest?"
  openQuestion. It **never** reaches `solid` — that needs a quest/eval finding or a parent attestation.
- **Positions are cumulative.** Reaching a band implies coverage of every mapped band below it.
- **In-band credit (round UP to the band ceiling).** Because a ~50-lesson band's content is
  distributed across its whole range, a child *inside* a band (L122 is inside the 101–150 band) is
  credited for that band's concepts — the config lesson is rounded UP to the band ceiling
  (`makeBandCeilingLessonToUnit`), so L122 resolves to native band 150. The `covered → forming` cap +
  the verify-quest openQuestion keep this an honest exposure claim, never mastery.
- **Never downgrades.** A concept already `solid` (attested / quest-verified) only gains the evidence
  ref; its state is untouched.
- **Dedup per concept.** A concept covered by several bands takes the highest band reached as its label.

## Per-band `covers[]` (v1 — OWNER-CURATED, maps onto CURATED math-graph nodes ONLY)

Every `covers[]` id is a real node in [`MATH_GRAPH_V0.md`](./MATH_GRAPH_V0.md) — pinned by a validation
test (`mathseedsBridge.test.ts`). Concepts Mathseeds teaches for which the curated graph has **no
node** are recorded in a **notes** column, **never invented** as a node.

| upToLesson | Cumulative content | `covers[]` (math-graph node ids) | notes |
|---|---|---|---|
| 20 | counting 0–10, number knowledge/numerals, basic 2D shapes | `math.number.counting`, `math.number.digitRecognition`, `math.geometry.shapes` | — |
| 50 | counting to 20, comparison, addition facts to 10, teen numbers as tens+ones (place value begins), patterns (evidence-only strand) | `math.number.counting`, `math.number.comparison`, `math.operations.addWithin20`, `math.number.placeValue`, `math.algebra.patterns` | — |
| 100 | counting to 100, tens-and-ones place value, add/subtract within 100, skip counting 2s/5s/10s, money, time (half-hour), early fractions, one-step story problems, tally/picture charts (data strand) | `math.number.counting`, `math.number.placeValue`, `math.operations.subWithin20`, `math.operations.twoDigit`, `math.number.skipCount`, `math.measurement.money`, `math.measurement.time`, `math.fractions.concepts`, `math.problemSolving.oneStep`, `math.data.graphs` | — |
| 150 | place value to 999, **regrouping** (vertical add/subtract), multiplication & division signs (tables forming), fractions of collections, measurement (length), time (quarter-hour), data | `math.number.placeValue`, `math.operations.multiDigit`, `math.operations.regrouping`, `math.operations.arrays`, `math.operations.multFacts`, `math.operations.division`, `math.fractions.concepts`, `math.measurement.length`, `math.measurement.time`, `math.data.interpret` | — |
| 200 | multiplication/division fluency within 100, division word problems (multi-step problem solving), rounding, area | `math.operations.multiTables`, `math.operations.division`, `math.problemSolving`, `math.geometry.area` | **rounding** — no math-graph node (recorded, not invented) |

**Worked example (the owner's exact child, L122):** L122 is inside the 101–150 (G2) band, so it rounds
UP to native band **150**. The cumulative union of bands ≤ 150 yields **22 concepts** — the Kindergarten
and Grade 1 spine fully covered (counting → place value → two-digit add/subtract → early fractions →
one-step story problems → charts) **plus** the Grade 2 band the child is inside: `math.operations.regrouping`
("Carry and borrow") and `math.operations.multFacts` ("Times tables", *tables forming*) — all as
`covered → forming`. It does **not** yet reach the Grade 3 band (fluent tables `multiTables`, multi-step
`problemSolving`, `geometry.area`). This is the fixture `mathseedsBridge.test.ts` pins.

## Curation questions — RESOLVED (appended per convention)

1. **What does the family's Mathseeds "Level" number mean?** → **RESOLVED.** It is a Mathseeds **lesson**
   on the 200-lesson map (50 per grade band). The bridge's native unit is the **band ceiling** and
   `lessonToUnit` = `makeBandCeilingLessonToUnit([20, 50, 100, 150, 200])` (round the lesson UP to the
   band it is inside — in-band credit).
2. **Level bands per concept.** → **RESOLVED** by the owner-adopted table above (verified against the
   official content + lesson-overview pages).
3. **Facts vs. fluency split.** → **RESOLVED.** Band 150 covers `math.operations.multFacts` (tables
   *forming*); the fluency node `math.operations.multiTables` is reached only at band 200 (Grade 3).
4. **Where does Level 122 sit?** → **RESOLVED** (worked example above): inside the 101–150 (G2) band.

## Named future (backlog, not built)

Mathseeds surfaces per-lesson map "stops"; a finer **lesson→node** map (below the 50-lesson band
granularity) could sharpen the boundary between adjacent bands, but the band-ceiling mapping is
sufficient for the model's `covered → forming` (soft, verify-gated) claims today.
