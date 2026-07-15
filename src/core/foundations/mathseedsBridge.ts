// ── Mathseeds → math-graph bridge (FEAT-64, OWNER-CURATED) ───────────────
//
// The Mathseeds climb, transcribed as versioned code data from the OWNER-ADOPTED
// curation (2026-07-15), verified against the official publisher:
//   docs/foundations/MATHSEEDS_BRIDGE_V0.md  (v1 — OWNER-CURATED)
//   content overview:  https://mathseeds.com/content-overview/
//   lesson overview:   https://mathseeds.com/lesson-overview/
//
// This is the SECOND external-curriculum bridge (Fast Phonics was first, FEAT-53)
// and the first MATH one. Like Fast Phonics it is *data*, not logic: a per-band
// table of which math-graph concepts a reached lesson supplies `covered` evidence
// for. Correcting the mapping is a data edit here, never a code change — the exact
// FEAT-47/50 curation-apply pattern.
//
// Structure fact (official): Mathseeds is 200 numbered lessons, 50 per grade band —
//   K = lessons 1–50 · G1 = 51–100 · G2 = 101–150 · G3 = 151–200.
// The family's config tracks a single Mathseeds lesson number (their child: L122).
//
// Semantics this data obeys (identical to the Fast Phonics bridge / design §12–§13,
// enforced by `applyBridgeCoverageToModel`):
//   • Reaching a band = `covered` evidence only — capped at `forming` downstream,
//     never `solid`. It attaches a "verify with a quick quest?" openQuestion.
//   • Positions are cumulative: reaching L122 implies coverage of every band ≤ 122.
//   • Never downgrades a stronger standing state (attested / quest-verified).
//   • Dedup per concept, highest band reached wins as the evidence label.
//
// ⚠️ IN-BAND CREDIT — see `lessonToUnit` at the bottom. A Mathseeds band spans ~50
// lessons and its concepts are distributed across that range, so a child *inside* a
// band (L122 sits inside the 101–150 band) has been exposed to the band's concepts.
// We therefore credit the band the child is CURRENTLY in (round the lesson UP to the
// band ceiling), not only bands fully completed. The `covered → forming` cap plus the
// verify-quest openQuestion keep this an honest exposure claim, never mastery — and
// the owner curated the fixtures expecting in-band credit for their L122 child.

import type { WorkbookBridge } from './workbookBridge'
import { makeBandCeilingLessonToUnit } from './bandCeiling'

/** Bump on curation, exactly like the graph / Fast Phonics bridge versions. */
export const MATHSEEDS_BRIDGE_VERSION = 1

/**
 * The five cumulative bands, transcribed EXACTLY from the curated doc's per-band
 * `covers[]` table (MATHSEEDS_BRIDGE_V0.md v1). Every id is a real node in
 * `mathGraph.ts` — pinned by a validation test. Concepts Mathseeds teaches that
 * the curated graph has NO node for are recorded in `notes` (never invented).
 */
export const mathseedsBridge: WorkbookBridge = {
  sourceId: 'mathseeds',
  aliases: ['mathseeds', 'math seeds', 'reading eggs mathseeds'],
  version: MATHSEEDS_BRIDGE_VERSION,
  units: [
    // ── K, early (through lesson 20) ──
    {
      unitLabel: 'up to Lesson 20',
      upToLesson: 20,
      // counting 0–10 · number knowledge/numerals · basic 2D shapes
      covers: [
        'math.number.counting',
        'math.number.digitRecognition',
        'math.geometry.shapes',
      ],
    },
    // ── K, end (through lesson 50) ──
    {
      unitLabel: 'up to Lesson 50',
      upToLesson: 50,
      // counting to 20 · comparison · addition facts to 10 · teen numbers as
      // tens+ones (place value begins) · patterns (evidence-only strand)
      covers: [
        'math.number.counting',
        'math.number.comparison',
        'math.operations.addWithin20',
        'math.number.placeValue',
        'math.algebra.patterns',
      ],
    },
    // ── G1, end (through lesson 100) ──
    {
      unitLabel: 'up to Lesson 100',
      upToLesson: 100,
      // counting to 100 · tens-and-ones place value · add/subtract within 100 ·
      // skip counting 2s/5s/10s · money · time (half-hour) · early fractions ·
      // one-step story problems · tally/picture charts (data strand)
      covers: [
        'math.number.counting',
        'math.number.placeValue',
        'math.operations.subWithin20',
        'math.operations.twoDigit',
        'math.number.skipCount',
        'math.measurement.money',
        'math.measurement.time',
        'math.fractions.concepts',
        'math.problemSolving.oneStep',
        'math.data.graphs',
      ],
    },
    // ── G2, end (through lesson 150) — the band the L122 child is IN ──
    {
      unitLabel: 'up to Lesson 150',
      upToLesson: 150,
      // place value to 999 · regrouping (vertical add/subtract) · multiplication &
      // division signs (tables forming) · fractions of collections · measurement
      // (length) · time (quarter-hour) · data
      covers: [
        'math.number.placeValue',
        'math.operations.multiDigit',
        'math.operations.regrouping',
        'math.operations.arrays',
        'math.operations.multFacts',
        'math.operations.division',
        'math.fractions.concepts',
        'math.measurement.length',
        'math.measurement.time',
        'math.data.interpret',
      ],
    },
    // ── G3, end (through lesson 200) ──
    {
      unitLabel: 'up to Lesson 200',
      upToLesson: 200,
      // multiplication/division fluency within 100 · division word problems
      // (multi-step problem solving) · rounding · area
      covers: [
        'math.operations.multiTables',
        'math.operations.division',
        'math.problemSolving',
        'math.geometry.area',
      ],
      // "rounding" is genuine Mathseeds content but the curated math graph has NO
      // rounding node — recorded here, NOT invented as a node (curation convention).
      notes: ['rounding — no math-graph node (recorded, not invented)'],
    },
  ],
  // The family tracks a single Mathseeds lesson number; the bridge's native unit is
  // the band ceiling. Round the lesson UP to the band it falls in (in-band credit —
  // see the ⚠️ header). L122 → 150 (the G2 band the child is inside), so the sync
  // credits regrouping + tables-forming, which the owner's fixture expects.
  lessonToUnit: makeBandCeilingLessonToUnit([20, 50, 100, 150, 200]),
}
