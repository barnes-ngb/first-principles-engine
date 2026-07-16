// ── skillTag → foundations conceptId bridge (FEAT-69) ─────────────────────
//
// FEAT-68 closed the daily-struggle → re-test loop, but ONLY through the
// deterministic `workbookConfigId → workbookBridge` position path. A struggle on a
// NON-workbook item went nowhere near the learner-model re-test queue, because
// skillTag ids and concept-graph ids live in DIFFERENT namespaces —
// `reading.cvcBlend` (tag) vs `reading.phonics.cvc` (concept),
// `math.subtraction.regroup` (tag) vs `math.operations.regrouping` (concept). There
// is no free translation; the mapping is a hand-curated table.
//
// This module is that missing bridge, built as the FEAT-63 workbook bridge is:
// VERSIONED, owner-reviewed DATA + a pure, tolerant resolver. It ships the wiring;
// the mapping grows as the owner curates it (see
// `docs/foundations/TAG_CONCEPT_BRIDGE_V0.md`). The discipline is identical to the
// workbook bridge and `resolveStuckConcepts`: an unmapped or unrecognized tag
// resolves to nothing — NO GUESS, ever. Coverage lights up per-tag as the table is
// extended; it never fabricates a tag→concept pairing.
//
// PURE — no Firestore, no clock. The async writer that consumes it stays
// `src/features/today/stuckRetestQueue.ts`; the resolver that unions it with the
// workbook path stays `dailySignalTargeting.ts`.

import { readingGraph } from './readingGraph'
import { mathGraph } from './mathGraph'
import { MathTags, ReadingTags, RegulationTags, WritingTags } from '../types/skillTags'
import type { ConceptNode } from './types'

/** Bump on curation, like the graph + workbook-bridge versions. */
export const TAG_CONCEPT_BRIDGE_VERSION = 1

/**
 * Local flat node lookup, built from the domain graphs DIRECTLY (NOT the `./index`
 * barrel), mirroring `workbookBridge.ts` — this module is re-exported by `index`, so
 * importing `index` here would form a cycle.
 */
const NODE_MAP: Record<string, ConceptNode> = Object.fromEntries(
  [...readingGraph.nodes, ...mathGraph.nodes].map((n) => [n.id, n]),
)

/**
 * The versioned, PR-reviewed catalog-tag → concept-graph-node(s) table.
 *
 * Only HIGH-CONFIDENCE 1:1 pairs are seeded; every target id below is a real node
 * in `readingGraph`/`mathGraph` (pinned by a test). Ambiguous tags map to `[]` and
 * no-op — the honest curation gate, not a bug. Two deliberate SCOPE BOUNDARIES:
 *
 *   • `writing.*` → `[]` — the v1 foundations graph is reading + math ONLY. (The
 *     reading graph carries `reading.encoding.*` spelling nodes; whether the
 *     `writing.spelling.*` tags should map onto them is a live curation question
 *     left to the owner — see the V0 draft — not guessed here.)
 *   • `regulation.*` → `[]` — self-regulation is not a foundations *concept* domain;
 *     a regulation struggle is not a concept miss to re-test. (Mirrors the FEAT-69
 *     decision to skip `engagement:'refused'`: regulation ≠ concept gap.)
 *
 * Keys reference the `skillTags.ts` catalog constants so a typo can't silently
 * introduce an unmapped tag; values are graph node ids verified against the graphs.
 */
export const TAG_CONCEPT_BRIDGE: Record<string, string[]> = {
  // ── Reading (high-confidence 1:1) ──────────────────────────────────
  [ReadingTags.PhonemicAwareness]: ['reading.phonemic.hearSounds'],
  [ReadingTags.LetterSound]: ['reading.phonics.letterSounds'],
  [ReadingTags.CvcBlend]: ['reading.phonics.cvc'],
  [ReadingTags.SightWords]: ['reading.phonics.sightWords'],
  // Straddles accuracy / pace / expression — no clean single node. Unmapped
  // pending owner curation (coverage grows as a lane is chosen).
  [ReadingTags.FluencyShort]: [],

  // ── Writing → [] (scope boundary: reading+math graph only, v1) ──────
  [WritingTags.GripPosture]: [],
  [WritingTags.LetterFormation]: [],
  [WritingTags.CopyWords]: [],
  [WritingTags.SpellingPhonetic]: [],
  [WritingTags.SpellingSightWord]: [],
  [WritingTags.SentenceComposition]: [],
  [WritingTags.SentenceOrder]: [],

  // ── Math (high-confidence 1:1) ─────────────────────────────────────
  [MathTags.AdditionFacts]: ['math.operations.addWithin20'],
  // Two-digit subtraction w/o regrouping lives in the two-digit-ops node; the
  // regrouping tag maps to the distinct regrouping node below.
  [MathTags.SubtractionNoRegroup]: ['math.operations.twoDigit'],
  [MathTags.SubtractionRegroup]: ['math.operations.regrouping'],
  [MathTags.PlaceValue]: ['math.number.placeValue'],
  // Catalog evidence is "single-step word problems" → the one-step node, not the
  // band-5 multi-step `math.problemSolving`.
  [MathTags.WordProblems]: ['math.problemSolving.oneStep'],

  // ── Self-regulation → [] (not a foundations concept domain) ─────────
  [RegulationTags.Attention]: [],
  [RegulationTags.Frustration]: [],
  [RegulationTags.StartAnyway]: [],
  [RegulationTags.Stamina]: [],
  [RegulationTags.FrustrationTolerance]: [],
}

/**
 * Resolve a set of skill tags to foundation concept ids. Tolerant: an unknown or
 * unmapped tag contributes nothing (NO GUESS). Deduped, and every returned id is
 * filtered through the node map so an id the graph doesn't define can never leak out
 * (it would be inert in `selectQuestTargets` anyway). `[]` is the honest, common
 * result — for LLM-generated / empty-tag items, and for `writing.*`/`regulation.*`.
 */
export function conceptsForTags(tags: string[]): string[] {
  const out = new Set<string>()
  for (const tag of tags) {
    const mapped = TAG_CONCEPT_BRIDGE[tag]
    if (!mapped) continue
    for (const conceptId of mapped) {
      if (NODE_MAP[conceptId]) out.add(conceptId)
    }
  }
  return [...out]
}
