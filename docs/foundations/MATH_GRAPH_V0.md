# Math Concept Graph — v0 DRAFT (pending owner curation)

> ⚠️ **v0 DRAFT — a content proposal for OWNER REVIEW, not shipped data.** This is the first pass at the math half of the Foundations spine described in [`../LEARNER_MODEL_DESIGN.md`](../LEARNER_MODEL_DESIGN.md) §2. The owner edits node names, descriptions, bands, and edges; the curated result ships as versioned data in a later build slice (Open Decision D2). **Nothing here is live.**

## How to read this

- **Grounded in the repo, not generic standards.** Bands and ordering follow this codebase's math ladders: `MATH_SKILL_LEVEL_MAP` (L1–8) in `src/core/curriculum/skillLevelMaps.ts`, the prose `MATH_CONCEPT_BANDS` (L1–8) in `functions/src/ai/levelDefinitions.ts`, and the 16 math nodes in `curriculumMap.ts` (`MATH_MAP`). Quest `math` mode caps at level 8 (`QUEST_MODE_LEVEL_CAP`).
- **`id`** reuses `curriculumMap` node ids where an equivalent exists; new ids follow `math.<strand>.<concept>`.
- **`underlies`** = concepts this one is a prerequisite *for* (§2.1).
- **Band** = grade band (K–5) mapped from the level ladder (see below).
- **Kid-word name** obeys the ETHOS-02 no-judge / no-score rail.

## Band mapping (from `MATH_CONCEPT_BANDS`, L1–8)

| Band | Math ladder |
|---|---|
| **K** | L1 number sense — counting to 20, recognizing digits, comparing, sequencing |
| **1** | L2 addition within 20 (doubles, making 10) · L3 subtraction within 20 (fact families, missing addends) |
| **2** | L4 place value, two-digit add & subtract, multi-step word problems (begins) |
| **3** | L5 multiplication facts, basic division, arrays/repeated addition · L7 regrouping/borrowing |
| **4** | L6 fractions (recognize/compare/simple ops), measurement & time/money · L8 times-table fluency |
| **5** | fraction operations, decimals/percents, patterns/algebra, multi-step problem solving *(map "applying/extending" tiers)* |

> **Note on the repo's L7/L8:** the ledger records that "division/fractions *depth* is deliberately out of scope beyond L6; L7–L8 are the two 'outgrew L6' frontiers only" (regrouping subtraction; times-table fluency). This draft places those two as band-3/band-4 concepts in the ordinary flow; the owner may prefer to keep them as explicit late frontiers instead — see open question 3.

---

## Strand 1 — Number Sense & Counting

| id | Band | Kid-word name | Parent description | `underlies` |
|---|---|---|---|---|
| `math.number.counting` | K | Count things | Counts objects and says numbers in order past 20 | `math.number.placeValue`, `math.operations.addWithin20`, `math.geometry.shapes` |
| `math.number.digitRecognition` | K | Know the numbers | Recognizes and writes number symbols | `math.number.comparison`, `math.number.placeValue` |
| `math.number.comparison` | K | Compare numbers | Says which is more, less, or equal | `math.number.placeValue`, `math.data.graphs` |
| `math.number.skipCount` | 1 | Skip count | Counts by 2s, 5s, and 10s | `math.operations.arrays`, `math.operations.multiTables` |

## Strand 2 — Addition & Subtraction (within 20)

| id | Band | Kid-word name | Parent description | `underlies` |
|---|---|---|---|---|
| `math.operations.addWithin20` | 1 | Add small numbers | Adds within 20 using doubles and making 10 | `math.operations.subWithin20`, `math.operations.twoDigit` |
| `math.operations.subWithin20` | 1 | Take away small numbers | Subtracts within 20 | `math.operations.twoDigit` |
| `math.operations.factFamilies` | 1 | Know fact families | Sees how +/− facts connect (3+4=7, 7−4=3), fills missing addends | `math.operations.twoDigit` |

## Strand 3 — Place Value & Multi-digit

| id | Band | Kid-word name | Parent description | `underlies` |
|---|---|---|---|---|
| `math.number.placeValue` | 2 | Tens and ones | Knows what each digit is worth (hundreds, tens, ones) | `math.operations.twoDigit`, `math.operations.multiDigit`, `math.decimals` |
| `math.operations.twoDigit` | 2 | Add & subtract bigger numbers | Adds and subtracts two-digit numbers | `math.operations.regrouping`, `math.operations.multiDigit` |
| `math.operations.regrouping` | 3 | Carry and borrow | Regroups (carries and borrows), including across zeros | `math.operations.multiDigit` |
| `math.operations.multiDigit` | 3 | Multi-digit math | Works with three-digit and larger numbers | `math.problemSolving` |

## Strand 4 — Multiplication & Division

| id | Band | Kid-word name | Parent description | `underlies` |
|---|---|---|---|---|
| `math.operations.arrays` | 3 | Rows and groups | Sees multiplication as rows, groups, and repeated addition | `math.operations.multFacts` |
| `math.operations.multFacts` | 3 | Times tables | Knows multiplication facts | `math.operations.multiTables`, `math.operations.division`, `math.fractions.concepts` |
| `math.operations.multiTables` | 4 | Fast times tables | Recalls tables through 12×12 fluently | `math.operations.division` |
| `math.operations.division` | 3 | Share equally | Divides using known facts and arrays | `math.fractions.operations` |

## Strand 5 — Fractions & Decimals

| id | Band | Kid-word name | Parent description | `underlies` |
|---|---|---|---|---|
| `math.fractions.concepts` | 4 | Understand fractions | Recognizes and names simple fractions (½, ¼, ⅓) | `math.fractions.compare`, `math.fractions.operations`, `math.decimals` |
| `math.fractions.compare` | 4 | Compare fractions | Compares simple fractions | `math.fractions.operations` |
| `math.fractions.operations` | 5 | Add & subtract fractions | Adds and subtracts simple fractions | `math.problemSolving` |
| `math.decimals` | 5 | Decimals & percents | Works with decimals and percents | `math.problemSolving` |

## Strand 6 — Measurement, Money & Time

| id | Band | Kid-word name | Parent description | `underlies` |
|---|---|---|---|---|
| `math.measurement.length` | 2 | Measure things | Measures length with rulers and units | `math.geometry.area` |
| `math.measurement.time` | 2 | Tell time | Tells time on a clock | `math.measurement.money` |
| `math.measurement.money` | 3 | Count money | Counts coins and bills, makes change | `math.problemSolving` |

## Strand 7 — Geometry & Shapes

| id | Band | Kid-word name | Parent description | `underlies` |
|---|---|---|---|---|
| `math.geometry.shapes` | K | Know shapes | Names 2D and 3D shapes and their parts | `math.geometry.area` |
| `math.geometry.area` | 4 | Area & perimeter | Finds the area and perimeter of shapes | `math.problemSolving` |

## Strand 8 — Data & Graphs

| id | Band | Kid-word name | Parent description | `underlies` |
|---|---|---|---|---|
| `math.data.graphs` | 2 | Read charts | Reads and makes simple graphs and tables | `math.data.interpret` |
| `math.data.interpret` | 4 | Understand data | Answers questions from a graph or table | `math.problemSolving` |

## Strand 9 — Patterns, Algebra & Problem Solving

| id | Band | Kid-word name | Parent description | `underlies` |
|---|---|---|---|---|
| `math.algebra.patterns` | 4 | Find the pattern | Extends number and shape patterns, finds the rule | `math.problemSolving` |
| `math.problemSolving` | 5 | Solve word problems | Chooses the right steps for multi-step problems | *(top)* |

---

## Seeding this graph on day one (bootstrap)

From the Step 0.5 mappability finding, initial math concept states come — with no new assessment — from inverting `workingLevels.math` (`deriveWorkingLevelMastery` + `MATH_SKILL_LEVEL_MAP`):

- **`solid`** ← every math concept whose band is *below* the child's `workingLevels.math` level (e.g. math level 5 ⇒ number sense, addition/subtraction within 20, place value, two-digit ops `solid`), plus completed-program nodes and gate-3 priority skills.
- **`forming` / `frontier`** ← the concept(s) at exactly the working level (e.g. math level 5 ⇒ multiplication facts / basic division is the frontier).
- **`not-yet`** ← everything above the working level. With the repo's L1–8 scope, **fractions depth, decimals, patterns/algebra, area/perimeter, and multi-step problem solving all start `not-yet`** for both children until an evaluation, scan, or attestation touches them (the ladder deliberately caps academic math scope at L6-ish with L7/L8 as the two advanced frontiers).

The two children on day one: **London** seeds at the counting / number-sense frontier, most of Strands 2–9 `not-yet`; **Lincoln** (≈3rd-grade math per the family profile) seeds `solid` through addition/subtraction and place value, with a frontier around multiplication facts / two-digit-with-regrouping and everything from fractions up `not-yet`.

## Open questions for the owner (curation)

1. Strand 8 (Data & Graphs) and Strand 9 (Patterns/Algebra) exist as `MATH_MAP` nodes but have **no working-level ladder entry** — they can't seed from working levels and start `not-yet`. Track them, or drop them from v1 math scope?
2. Money and time are one node in `curriculumMap` (`math.measurement.time` = "Time & money"); this draft splits them. Keep split or merge back?
3. Regrouping (repo L7) and times-table fluency (repo L8) — placed here in the ordinary band-3/band-4 flow. Keep as ordinary flow, or model them as explicit late "outgrew L6" frontiers per the ledger note?
4. Is this the order the family actually teaches math (e.g. GATB Math lesson sequence), or should bands follow the specific workbook's scope-and-sequence?
5. Any concept here that isn't a real foundation for how *this* family does math?
