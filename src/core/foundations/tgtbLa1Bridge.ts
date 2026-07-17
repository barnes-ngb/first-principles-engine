// ── The Good and the Beautiful — Language Arts 1 → reading-graph bridge ───
//                                                        (FEAT-64, OWNER-CURATED)
//
// TGTB Language Arts Level 1, transcribed as versioned code data from the
// OWNER-CURATED curation (2026-07-15), verified against the official publisher:
//   docs/foundations/TGTB_LA1_BRIDGE_V0.md  (v1 — OWNER-CURATED)
//   Level 1 course pages: https://www.goodandbeautiful.com/language-arts/level-1/
//
// The family runs TWO language-arts curricula against the SAME reading graph —
// Fast Phonics (FEAT-53) and TGTB LA1 (config: Level 110) — so on shared nodes they
// become MULTI-SOURCE evidence; the §13 cap + best-source rule (never a raw sum)
// already govern the resulting state.
//
// ⚠️ COARSE-BY-DESIGN — this bridge is deliberately three broad bands, NOT a
// per-lesson map, because in TGTB LA1 the phonics progression lives in the
// self-paced **Reading Booster B** cards, NOT in the lesson number: two children on
// the same lesson can be at very different phonics cards. So the lesson number is a
// coarse proxy for phonics position. Facts driving the coarseness (official):
//   • 120 lessons across 3 units; spelling lists begin in Level 1;
//   • Lesson 1 reviews long/short vowels (the course opens on review, not letters);
//   • phonics (blends → digraphs → vowel teams → diphthongs, e.g. OU/OW) advances
//     via Booster B cards, late-Booster territory being the vowel teams/diphthongs.
//
// NAMED FUTURE (backlog, not built): a **Reading Booster B card → node bridge** would
// be the PRECISE phonics tracker — the Booster card numbers are printed on the cards
// Shelly already photographs, so a card→node map (like the FP peak map) would ground
// phonics position exactly, replacing this coarse lesson proxy for the phonics strand.
//
// Semantics (identical to Fast Phonics / design §12–§13, enforced by
// `applyBridgeCoverageToModel`): reaching a band = `covered` evidence capped at
// `forming` + a verify-quest ask; cumulative; never downgrades; dedup per concept
// (highest band wins). Same in-band credit as Mathseeds (round up to band ceiling).

import type { WorkbookBridge } from './workbookBridge'
import { makeBandCeilingLessonToUnit } from './bandCeiling'

/** Bump on curation, like the graph / Fast Phonics bridge versions. */
export const TGTB_LA1_BRIDGE_VERSION = 1

/**
 * Three cumulative, deliberately-coarse bands, transcribed EXACTLY from the curated
 * doc's per-band `covers[]` table (TGTB_LA1_BRIDGE_V0.md v1). Every id is a real
 * node in `readingGraph.ts` — pinned by a validation test.
 */
export const tgtbLa1Bridge: WorkbookBridge = {
  sourceId: 'tgtbLanguageArts1',
  aliases: [
    'tgtb la',
    'tgtb la1',
    'tgtb la level 1',
    'tgtb language arts',
    'tgtb language arts 1',
    'tgtb language arts level 1',
    'the good and the beautiful language arts',
    'the good and the beautiful language arts 1',
    'good and the beautiful language arts',
    'good and beautiful language arts',
    'good and beautiful la1',
  ],
  version: TGTB_LA1_BRIDGE_VERSION,
  // Level 1 of the TGTB Language Arts series. The contains-matcher's level-conflict
  // guard uses this so a "…Language Arts Level 2/3/…" name does NOT resolve here
  // through a generic, level-less alias (FEAT-64 amendment, P1).
  level: 1,
  units: [
    // ── Unit-ish band, through lesson 40 ──
    {
      unitLabel: 'up to Lesson 40',
      upToLesson: 40,
      // short/long-vowel review exposure · sight words (first-grade lists begin) ·
      // spelling lists begin (encoding: CVC/pattern words) · listening comprehension
      covers: [
        'reading.phonics.cvc',
        'reading.phonics.sightWords',
        'reading.encoding.spellCvc',
        'reading.comprehension.listen',
      ],
    },
    // ── through lesson 80 ──
    {
      unitLabel: 'up to Lesson 80',
      upToLesson: 80,
      // blends + digraphs consolidation · sight words continue · spelling pattern
      // words (encoding) · explicit comprehension
      covers: [
        'reading.phonics.blends',
        'reading.phonics.digraphs',
        'reading.phonics.sightWords',
        'reading.encoding.spellPatterns',
        'reading.comprehension.explicit',
      ],
    },
    // ── through lesson 120 (end of Level 1) — the band the L110 child is IN ──
    {
      unitLabel: 'up to Lesson 120',
      upToLesson: 120,
      // long vowels (silent-e, as instructed review) · vowel teams + diphthongs
      // (late Booster territory, e.g. OU/OW) · comprehension · reading fluency
      // (integrated readers)
      covers: [
        'reading.phonics.longVowels',
        'reading.phonics.vowelTeams',
        'reading.phonics.diphthongs',
        'reading.comprehension.explicit',
        'reading.fluency.pace',
      ],
    },
  ],
  // The family tracks a single TGTB lesson number; native unit is the band ceiling.
  // Round UP to the band the child is inside (in-band credit — see the ⚠️ header):
  // L110 → 120, so the sync credits all three bands (the owner's fixture expects it).
  lessonToUnit: makeBandCeilingLessonToUnit([40, 80, 120]),
}
