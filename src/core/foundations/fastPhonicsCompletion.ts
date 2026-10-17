// ── Fast Phonics WHOLE-PROGRAM completion → coverage targets (FEAT-242) ───
//
// `fastPhonicsBridge` is the mapping authority and stays it: this module adds a
// REVIEWED, VERSIONED read of that same per-peak table for one new question —
// *what does finishing the whole climb cover?* — and adds nothing to the table
// itself. There is no second curriculum here, no peak this file knows about that
// the bridge does not, and no AI call anywhere in the path.
//
// Three things it does that a cumulative position read cannot:
//
//   1. **It attributes each concept to the peak that actually teaches it.**
//      `bridgeEvidenceForPosition(20)` labels a concept with the HIGHEST peak
//      that covers it, which for the depth rows is wrong in a way that matters:
//      Peak 20 is alternative *consonant* spellings (tch, dge, kn, wr, mb), and
//      a vowel-teams claim labelled "Peak 20" reads as though the child's vowel
//      work happened there. Vowel teams are taught in Peaks 9/10/15/16/17 and
//      that is what this mapping cites. So attribution skips `depthOnly` peaks
//      (19–20) entirely — they consolidate graphemes already covered and add no
//      graph node, exactly as the bridge says.
//   2. **It qualifies the three broad concepts.** `hearSounds`, `sightWords` and
//      `multisyllable` mean more in the graph than Fast Phonics teaches (see
//      `PARTIAL_COVERAGE_REASON`), so completing the program is recorded as
//      `partial` evidence on them and promotes nothing.
//   3. **It is versioned.** {@link FAST_PHONICS_COMPLETION_MAPPING_VERSION} is
//      stamped on every ref written, so a later re-curation is an explicit,
//      parent-visible re-apply rather than a silent change of meaning.
//
// Sequence source: the publisher's own scope & sequence
// (https://readingeggs.com/schools/fastphonics/scope-sequence/, verified
// 2026-10-17), already transcribed into the bridge. The publisher also describes
// per-peak activities and end-of-peak quiz gates; **no individual result is read,
// inferred or stored** by anything here.

import { fastPhonicsUnits, READING_GRAPH_NODE_IDS } from './fastPhonicsBridge'
import type { BridgeUnit } from './fastPhonicsBridge'
import { CoverageQualifier } from '../../../functions/src/shared/foundations/completionCoverage'

/** Bump on re-curation, like the graph and bridge versions. */
export const FAST_PHONICS_COMPLETION_MAPPING_VERSION = 1

/**
 * The last peak of the climb.
 *
 * Used for ONE thing: deciding whether an existing native-progress row is an
 * eligible *citation* for a completion a parent is confirming. It is **not** how
 * completion is recorded — reaching a number is not finishing a program, and the
 * stored fact is the parent's explicit confirmation, never a numeric threshold
 * (`ProgramCompletionAssertion`).
 */
export const FAST_PHONICS_FINAL_PEAK = 20

/** The canonical source id these refs carry (the bridge's own). */
export const FAST_PHONICS_SOURCE_ID = 'fastPhonics'

/** Parent-facing name of the program. */
export const FAST_PHONICS_LABEL = 'Fast Phonics'

/**
 * The three graph concepts Fast Phonics covers only PART of, and why — the
 * reason is data, because it is what the parent is shown next to the claim.
 *
 * Each reason is read off the concept's own `parentDescription` in the curated
 * reading graph, not invented here: where the graph asks for more than the
 * program teaches, the claim is evidence and nothing more.
 */
export const PARTIAL_COVERAGE_REASON: Record<string, string> = {
  'reading.phonemic.hearSounds':
    'Fast Phonics works on sounds inside its own words; clapping syllables and hearing rhymes is wider than that.',
  'reading.phonics.sightWords':
    'Each peak teaches its own tricky words; the whole pre-primer and primer list is wider than that.',
  'reading.decoding.multisyllable':
    'The later peaks read longer words; chunking any long word into syllables is wider than that.',
}

/**
 * The publisher discrepancy this mapping deliberately does not resolve.
 *
 * The scope & sequence lists `ie` among Peak 15's graphemes and the split
 * digraph `i-e` among Peak 18's, and some publisher-facing material renders the
 * split digraph as `i_e` or plainly as `ie` — which collides with the Peak 15
 * vowel digraph. The bridge treats them as the two different graphemes they are
 * (Peak 15 → vowel teams / tricky vowel sounds, Peak 18 → long-vowel split
 * digraphs), and this mapping inherits that reading unchanged. Recorded because
 * a reader comparing this app's attribution against a printed chart will see the
 * difference and should find it already named.
 */
export const FAST_PHONICS_IE_DISCREPANCY_NOTE =
  "Peak 15's `ie` and Peak 18's split digraph `i-e` are different graphemes; some published charts render both as “ie”. This mapping keeps them apart, as the scope & sequence does."

/**
 * What the mapping claims about itself — shown to the parent at the confirm step
 * and stamped on the stored evidence.
 *
 * Every clause is load-bearing: the mapping is against the **published** scope &
 * sequence, the **edition/version the child used is unknown** and is recorded as
 * unknown rather than guessed, and **no activity or quiz result is known** to
 * this app — so nothing here is a score and nothing here says the child was
 * tested.
 */
export const FAST_PHONICS_COMPLETION_SCOPE_NOTE =
  'Mapped against the published Fast Phonics scope & sequence. The program version the child used is not known, and no activity or quiz results are known or recorded.'

/** The depth-consolidation peaks, and what they add (nothing, by design). */
export const FAST_PHONICS_DEPTH_ONLY_NOTE: Record<number, string> = {
  19: 'Peak 19 revisits alternative pronunciations of graphemes earlier peaks taught; it adds no new concept.',
  20: 'Peak 20 teaches alternative consonant spellings (tch, dge, kn, wr, mb); it adds no new concept, and in particular it is not where vowel teams are learned.',
}

/** One concept a completed Fast Phonics covers, with its grounding and its reach. */
export interface CompletionCoverageTarget {
  conceptId: string
  /** `direct` — same material; `partial` — the graph concept is wider (rule 3). */
  qualifier: CoverageQualifier
  /** The peak that TEACHES this concept — the highest non-depth peak covering it. */
  attributedPeak: number
  /** That peak's own label, for display and for the evidence `unit`. */
  attributedPeakLabel: string
  /** Why the reach is partial. Present only for `partial` targets. */
  partialReason?: string
}

/** The highest NON-depth-only peak whose `covers[]` names this concept. */
function teachingPeakFor(conceptId: string): BridgeUnit | null {
  let best: BridgeUnit | null = null
  for (const unit of fastPhonicsUnits) {
    if (unit.depthOnly) continue
    if (unit.peak > FAST_PHONICS_FINAL_PEAK) continue
    if (!unit.covers.includes(conceptId)) continue
    if (!best || unit.peak > best.peak) best = unit
  }
  return best
}

/**
 * The reviewed coverage of a COMPLETED Fast Phonics, derived from the bridge.
 *
 * Deterministic and derived — never a hand-typed list — so a bridge re-curation
 * flows straight through and cannot disagree with it. A concept named ONLY by a
 * depth row would be dropped here rather than attributed to it; the mapping test
 * pins that no such concept exists today, so nothing is silently lost.
 *
 * Order: by attributed peak, then by concept id, so the summary a parent reads
 * walks the climb.
 */
function buildCompletionTargets(): CompletionCoverageTarget[] {
  const conceptIds = new Set<string>()
  for (const unit of fastPhonicsUnits) {
    if (unit.peak > FAST_PHONICS_FINAL_PEAK) continue
    for (const id of unit.covers) conceptIds.add(id)
  }

  const targets: CompletionCoverageTarget[] = []
  for (const conceptId of conceptIds) {
    // Never claim a node the reading graph does not define.
    if (!READING_GRAPH_NODE_IDS.has(conceptId)) continue
    const unit = teachingPeakFor(conceptId)
    if (!unit) continue // covered only by a depth row — no acquisition claim
    const partialReason = PARTIAL_COVERAGE_REASON[conceptId]
    targets.push({
      conceptId,
      qualifier: partialReason ? CoverageQualifier.Partial : CoverageQualifier.Direct,
      attributedPeak: unit.peak,
      attributedPeakLabel: `Peak ${unit.peak}`,
      ...(partialReason ? { partialReason } : {}),
    })
  }

  return targets.sort(
    (a, b) =>
      a.attributedPeak - b.attributedPeak || a.conceptId.localeCompare(b.conceptId),
  )
}

/** The mapping, computed once at module load. */
export const FAST_PHONICS_COMPLETION_TARGETS: readonly CompletionCoverageTarget[] =
  Object.freeze(buildCompletionTargets())

/** The ids a completed Fast Phonics touches, in mapping order. */
export const FAST_PHONICS_COMPLETION_CONCEPT_IDS: readonly string[] = Object.freeze(
  FAST_PHONICS_COMPLETION_TARGETS.map((t) => t.conceptId),
)

/** One target by concept id, or undefined. */
export function completionTargetFor(
  conceptId: string,
): CompletionCoverageTarget | undefined {
  return FAST_PHONICS_COMPLETION_TARGETS.find((t) => t.conceptId === conceptId)
}

// ── The per-program registry ───────────────────────────────────────────────

/** Everything a completion write needs to know about one program's mapping. */
export interface ProgramCompletionMapping {
  /** The canonical source id stamped on evidence (the bridge's own). */
  sourceId: string
  /** Parent-facing program name. */
  label: string
  /** Reviewed mapping version, stamped on every ref written. */
  mappingVersion: number
  /** The applicability disclosure shown and stored. Never a score. */
  scopeNote: string
  targets: readonly CompletionCoverageTarget[]
  /**
   * The ONE native-progress number that can CITE this completion: the last unit
   * of the program, recorded as finished.
   *
   * A citation is optional and is not what makes a completion true — the
   * parent's confirmation is (see `ProgramCompletionAssertion`). This value only
   * decides which existing rows the surface may offer as supporting evidence, so
   * that "finished through peak 20" can be pointed at while a larger or
   * unfinished number cannot stand in for a confirmation.
   */
  citableFinalPosition: number
}

/**
 * Every program a completion can be confirmed for, keyed by program id.
 *
 * One entry: a completion needs a REVIEWED mapping, and Fast Phonics is the one
 * program that has one. Adding a program is a new mapping module plus an entry
 * here — which is also why `confirmProgramCompletion` refuses a program that is
 * not in this table rather than falling back to anything generic.
 */
export const PROGRAM_COMPLETION_MAPPINGS: Record<string, ProgramCompletionMapping> = {
  fastPhonics: {
    sourceId: FAST_PHONICS_SOURCE_ID,
    label: FAST_PHONICS_LABEL,
    mappingVersion: FAST_PHONICS_COMPLETION_MAPPING_VERSION,
    scopeNote: FAST_PHONICS_COMPLETION_SCOPE_NOTE,
    targets: FAST_PHONICS_COMPLETION_TARGETS,
    citableFinalPosition: FAST_PHONICS_FINAL_PEAK,
  },
}

/** The reviewed mapping for one program, or null when it has none. */
export function completionMappingFor(
  program: string | undefined | null,
): ProgramCompletionMapping | null {
  if (!program) return null
  return PROGRAM_COMPLETION_MAPPINGS[program] ?? null
}
