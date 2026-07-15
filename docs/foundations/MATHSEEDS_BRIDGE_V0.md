# Mathseeds → Math-Graph Bridge — v0 — DRAFT, PENDING OWNER CURATION, not shipped as data

> ⚠️ **DRAFT — PENDING OWNER CURATION. This file is NOT shipped as bridge data.**
> The per-level content below is **reconstructed from general model knowledge** of the Mathseeds
> program structure, **not** transcribed from an authoritative published scope & sequence. It is a
> *structural draft* for the owner (and the owner's design partner) to curate against the official
> Mathseeds scope & sequence before any of it becomes code. **Every row carries a confidence flag.**
> A later curation-apply run (the FEAT-46 → FEAT-47 pattern) transcribes the CURATED version into
> `src/core/foundations/` bridge data — nothing here is read by the app today.
>
> **Companion to:** [`../LEARNER_MODEL_DESIGN.md`](../LEARNER_MODEL_DESIGN.md) §12 (external-curriculum
> bridge) and [`MATH_GRAPH_V0.md`](./MATH_GRAPH_V0.md) (the math-graph node ids mapped to). Bridge
> mechanism: FEAT-63 (`src/core/foundations/workbookBridge.ts`). Ledger anchor: **FEAT-63** (refs
> FEAT-49 §12, FEAT-53 the Fast Phonics template, FEAT-62 the position-capture pipeline that feeds it).

## Why this file exists

The learner model tracks curriculum *positions* (workbook configs) but, before FEAT-63, never read
them — the model's **math** picture was blind to the child's primary math curriculum. The family's
Mathseeds config reads **Level 122**; the model saw none of it. FEAT-63 shipped the *wiring* (a
generalized `WorkbookBridge` + the position → evidence conversion + the two triggers + a diag sync
action). This file is the **data half** for Mathseeds: a draft mapping of Mathseeds levels to
math-graph node ids, so a curated version can turn "Level 122 reached" into `covered` evidence on the
concepts those levels teach — exactly as the Fast Phonics bridge does for reading.

## Semantics (the rules a curated version of this data will obey)

These are inherited unchanged from the Fast Phonics bridge (design §12 / §13) and enforced in code by
`applyBridgeCoverageToModel`, so the curation only has to get the **mapping** right, not the rules:

- **Reaching a level = `covered` evidence for its mapped nodes — nothing more.** `curriculumPosition`
  evidence alone caps a concept at **`forming`** and attaches a "verify with a quick quest?"
  openQuestion. It **never** reaches `solid` — that needs a quest/eval finding or a parent attestation.
- **Positions are cumulative.** Reaching Level 122 implies coverage of every mapped level ≤ 122.
- **Never downgrades.** A concept already `solid` (attested / quest-verified) only gains the evidence
  ref; its state is untouched.
- **Dedup per concept.** A concept covered by several level-bands takes the highest band reached as its
  evidence label.

## Bridge data shape (the generalized interface a curated version fills in)

```ts
// src/core/foundations/mathseedsBridge.ts  (FUTURE — only after curation)
import type { WorkbookBridge } from './workbookBridge'
export const mathseedsBridge: WorkbookBridge = {
  sourceId: 'mathseeds',
  aliases: ['mathseeds', 'math seeds', 'reading eggs mathseeds'],
  version: 1,
  units: [ /* the level-bands below, once curated */ ],
  // lessonToUnit: see the CURATION QUESTION on lesson numbering below.
}
```

## Per-level-band `covers[]` (DRAFT — confidence-flagged, maps onto CURATED math-graph nodes ONLY)

Mathseeds is organized as a long run of numbered **Lessons/Levels** (the app tracks a single number).
The bands below are the DRAFT's best-guess grouping from general program knowledge; **the level
boundaries are the uncertain layer** and the primary curation target. Every `covers[]` id is a real
node in [`MATH_GRAPH_V0.md`](./MATH_GRAPH_V0.md).

| Band (DRAFT) | Approx. focus | `covers[]` (math-graph node ids) | Confidence |
|---|---|---|---|
| Levels ~1–25 | Counting, number recognition, comparing, basic shapes | `math.number.counting`, `math.number.digitRecognition`, `math.number.comparison`, `math.geometry.shapes` | 🟡 medium — content typical of early Mathseeds; **level cutoff uncertain** |
| Levels ~26–50 | Skip counting, add/subtract within 20, simple story problems | `math.number.skipCount`, `math.operations.addWithin20`, `math.operations.subWithin20`, `math.problemSolving.oneStep` | 🟡 medium — mapping plausible; cutoff uncertain |
| Levels ~51–80 | Fact families, place value (tens/ones), measurement (length/time), simple graphs | `math.operations.factFamilies`, `math.number.placeValue`, `math.measurement.length`, `math.measurement.time`, `math.data.graphs` | 🟠 low-medium — several distinct strands compressed; needs S&S check |
| Levels ~81–110 | Two-digit add/subtract, money, patterns | `math.operations.twoDigit`, `math.measurement.money`, `math.algebra.patterns` | 🟠 low-medium — cutoff + strand order uncertain |
| Levels ~111–140 | Regrouping (carry/borrow), arrays/early multiplication, fractions intro | `math.operations.regrouping`, `math.operations.arrays`, `math.fractions.concepts` | 🔴 low — **this band spans the child's current L122; verify carefully** |
| Levels ~141–200 | Multiplication facts, division, fraction compare, area/perimeter, data | `math.operations.multFacts`, `math.operations.division`, `math.fractions.compare`, `math.geometry.area`, `math.data.interpret` | 🔴 low — beyond the child's position; drafted for completeness only |

**Worked example (DRAFT, illustrative — do not ship):** "Mathseeds Level 122 reached" would, under this
draft, apply the cumulative union of every band up to ~111–140, i.e. `covered` (→ `forming`, capped)
on counting → regrouping/arrays/fractions-intro. **This is exactly the kind of claim the curation must
verify** before it writes anything.

## Curation questions (resolve before shipping)

1. **What does the family's Mathseeds "Level" number mean?** (the `lessonToUnit` slot / §0.2 finding).
   Mathseeds surfaces both a **Map/Lesson** number and internal **Level** groupings; the app stores one
   integer (currently 122). Is 122 a Mathseeds *lesson* on the map, a *level*, or a Reading-Eggs-wide
   position? The bridge's native unit and the `lessonToUnit` translation both depend on this. **Until
   answered, config-position sync for Mathseeds is gated** (the diag action reports "no bridge yet"
   because Mathseeds is unregistered; once registered without a curated `lessonToUnit`, it would report
   "lesson mapping pending curation", the Fast Phonics state).
2. **Level bands per concept.** The six bands above are guesses. What are the *actual* level ranges at
   which Mathseeds introduces each math-graph concept? This is the core transcription task.
3. **Does Mathseeds cover strands the graph splits differently?** e.g. the graph separates
   `math.operations.multFacts` (band 3) from `math.operations.multiTables` (band 4, fluency through
   12×12) — which Mathseeds levels, if any, reach the fluency node vs. only introduce facts?
4. **Where does Level 122 actually sit?** The child's current position lands in the lowest-confidence
   band (🔴). Getting *this* band right matters most for today's model.

> **The owner's design partner will verify this draft against the official Mathseeds scope & sequence
> during curation.** This file is *structure*, not authority — it exists to make the curation a
> transcription task, not a blank page.
