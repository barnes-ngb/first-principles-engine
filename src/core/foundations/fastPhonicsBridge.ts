// ── Fast Phonics → reading-graph bridge (FEAT-53, slice 2b) ──────────────
//
// The Fast Phonics (Reading Eggs) climb, transcribed as versioned code data from
// the CURATED source of truth:
//   docs/foundations/FAST_PHONICS_BRIDGE_V0.md  (v1 — CURATED, FEAT-50)
//   official scope & sequence: https://readingeggs.com/schools/fastphonics/scope-sequence/
//
// This is the FIRST external-curriculum bridge. It is *data*, not logic: a per-peak
// table of which reading-graph concepts a completed peak supplies `covered` evidence
// for. Correcting the mapping is a data edit here, never a code change — the exact
// pattern the owner curated the graphs with, and the template for future sources
// (Reading Eggs core, math apps): each new source is a new data module of this shape,
// not new code (design §12, LEARNER_MODEL_DESIGN.md).
//
// Semantics this data obeys (bridge doc §Semantics):
//   • A completed peak = `covered` evidence only — capped at `forming` by the §13
//     covered≠mastered clamp downstream (`clampCoveredState`). It never reaches `solid`.
//   • Positions are cumulative: "Peak 13 complete" implies coverage of Peaks 1–13.
//   • Peaks 19–20 are depth-consolidation (`depthOnly`) — alternative pronunciations /
//     spellings on graphemes already covered; they add NO new graph node.

import { readingGraph } from './readingGraph'

/** One peak of the Fast Phonics climb, mapped to reading-graph node ids. */
export interface BridgeUnit {
  /** Peak number, 1–20. */
  peak: number
  /** Official Letters-and-Sounds phase this peak sits in. */
  phase: 2 | 3 | 4 | 5
  /** Plain-language label for display, e.g. "Peak 8 — sh, ch, th, ng". */
  label: string
  /** The graphemes this peak teaches (from the official S&S). Omitted where a peak
   *  introduces no new grapheme (Peaks 13–14 are blend/word-shape peaks). */
  graphemes?: string[]
  /** Reading-graph node ids this peak supplies `covered` evidence for. */
  covers: string[]
  /** True for the depth-consolidation peaks (19–20): they raise confidence within
   *  already-covered concepts and add no new node id beyond earlier peaks. */
  depthOnly?: boolean
}

/** A versioned external-curriculum bridge. `source` matches `EvidenceRef.source`. */
export interface CurriculumBridge {
  source: string
  version: number
  units: BridgeUnit[]
  /**
   * Free-text names a parent (or the LLM) might type for this source. Matched
   * tolerantly by {@link normalizeSourceName} (lowercase + strip non-alphanumerics),
   * so "Fast Phonics", "fast-phonics", "Reading Eggs Fast Phonics" all resolve.
   * Deliberately conservative: a real typo like "Fast phony" does NOT match — the
   * caller then keeps the generic-covered fallback and the assistant is prompted to
   * ask "did you mean Fast Phonics?" rather than silently drop the mapping (FEAT-61).
   */
  aliases: string[]
}

/** Bump on curation, exactly like the graph versions. */
export const FAST_PHONICS_BRIDGE_VERSION = 1

/**
 * The 20-peak Fast Phonics bridge, transcribed EXACTLY from the curated doc's
 * per-peak `covers[]` table (FAST_PHONICS_BRIDGE_V0.md §"Per-peak covers[]", the
 * authoritative v1 mapping against the official scope & sequence).
 */
export const fastPhonicsUnits: BridgeUnit[] = [
  // ── Phase 2 — letter sets, VC/CVC reading, tricky words begin ──
  {
    peak: 1,
    phase: 2,
    label: 'Peak 1 — s, a, t, p',
    graphemes: ['s', 'a', 't', 'p'],
    covers: [
      'reading.phonemic.hearSounds',
      'reading.phonics.letterSounds',
      'reading.phonics.cvc',
      'reading.encoding.spellCvc',
      'reading.phonics.sightWords',
    ],
  },
  {
    peak: 2,
    phase: 2,
    label: 'Peak 2 — m, i, d, n',
    graphemes: ['m', 'i', 'd', 'n'],
    covers: [
      'reading.phonics.letterSounds',
      'reading.phonics.cvc',
      'reading.encoding.spellCvc',
      'reading.phonics.sightWords',
    ],
  },
  {
    peak: 3,
    phase: 2,
    label: 'Peak 3 — g, o, c, k, ck',
    graphemes: ['g', 'o', 'c', 'k', 'ck'],
    covers: [
      'reading.phonics.letterSounds',
      'reading.phonics.cvc',
      'reading.encoding.spellCvc',
      'reading.phonics.sightWords',
    ],
  },
  {
    peak: 4,
    phase: 2,
    label: 'Peak 4 — r, e, u',
    graphemes: ['r', 'e', 'u'],
    covers: [
      'reading.phonics.letterSounds',
      'reading.phonics.cvc',
      'reading.encoding.spellCvc',
      'reading.phonics.sightWords',
    ],
  },
  {
    peak: 5,
    phase: 2,
    label: 'Peak 5 — l, h, f, b, ll, ff, ss',
    graphemes: ['l', 'h', 'f', 'b', 'll', 'ff', 'ss'],
    covers: [
      'reading.phonics.letterSounds',
      'reading.phonics.cvc',
      'reading.encoding.spellCvc',
      'reading.phonics.sightWords',
    ],
  },
  // ── Phase 3 — completes single letters, digraphs, vowel digraphs/trigraphs ──
  {
    peak: 6,
    phase: 3,
    label: 'Peak 6 — j, v, w',
    graphemes: ['j', 'v', 'w'],
    covers: ['reading.phonics.letterSounds', 'reading.phonics.cvc'],
  },
  {
    peak: 7,
    phase: 3,
    label: 'Peak 7 — x, y, z, zz, qu',
    graphemes: ['x', 'y', 'z', 'zz', 'qu'],
    covers: ['reading.phonics.letterSounds', 'reading.phonics.cvc'],
  },
  {
    peak: 8,
    phase: 3,
    label: 'Peak 8 — sh, ch, th, ng',
    graphemes: ['sh', 'ch', 'th', 'ng'],
    covers: ['reading.phonics.digraphs'],
  },
  {
    peak: 9,
    phase: 3,
    label: 'Peak 9 — ai, ee, igh, oa',
    graphemes: ['ai', 'ee', 'igh', 'oa'],
    covers: ['reading.phonics.vowelTeams'],
  },
  {
    peak: 10,
    phase: 3,
    label: 'Peak 10 — oo, ar, or, ur',
    graphemes: ['oo', 'ar', 'or', 'ur'],
    covers: ['reading.phonics.vowelTeams', 'reading.phonics.rControlled'],
  },
  {
    peak: 11,
    phase: 3,
    label: 'Peak 11 — ow, oi, ear, air',
    graphemes: ['ow', 'oi', 'ear', 'air'],
    covers: ['reading.phonics.diphthongs'],
  },
  {
    peak: 12,
    phase: 3,
    label: 'Peak 12 — er, ure',
    graphemes: ['er', 'ure'],
    covers: ['reading.phonics.rControlled'],
  },
  // ── Phase 4 — adjacent-consonant blends, polysyllabic words begin ──
  {
    peak: 13,
    phase: 4,
    label: 'Peak 13 — blends (CVCC / CCVC)',
    covers: ['reading.phonics.blends', 'reading.decoding.multisyllable'],
  },
  {
    peak: 14,
    phase: 4,
    label: 'Peak 14 — blends (CCVCC / CCCVC)',
    covers: ['reading.phonics.blends', 'reading.decoding.multisyllable'],
  },
  // ── Phase 5 — extended vowel teams/diphthongs, split digraphs, alternatives ──
  {
    peak: 15,
    phase: 5,
    label: 'Peak 15 — ay, ie, ea, oy, ir',
    graphemes: ['ay', 'ie', 'ea', 'oy', 'ir'],
    covers: ['reading.phonics.vowelTeams', 'reading.phonics.diphthongs'],
  },
  {
    peak: 16,
    phase: 5,
    label: 'Peak 16 — ou, ue, aw, wh, ph',
    graphemes: ['ou', 'ue', 'aw', 'wh', 'ph'],
    covers: ['reading.phonics.vowelTeams', 'reading.phonics.diphthongs'],
  },
  {
    peak: 17,
    phase: 5,
    label: 'Peak 17 — ew, oe, au, ey',
    graphemes: ['ew', 'oe', 'au', 'ey'],
    covers: ['reading.phonics.vowelTeams', 'reading.phonics.diphthongs'],
  },
  {
    peak: 18,
    phase: 5,
    label: 'Peak 18 — split digraphs a-e, e-e, i-e, o-e, u-e',
    graphemes: ['a-e', 'e-e', 'i-e', 'o-e', 'u-e'],
    covers: ['reading.phonics.longVowels'],
  },
  {
    peak: 19,
    phase: 5,
    label: 'Peak 19 — alternative pronunciations (soft c/g; ow→snow; ea→bread; y→baby)',
    graphemes: ['soft c', 'soft g', 'ow', 'ea', 'y'],
    covers: ['reading.phonics.vowelTeams', 'reading.decoding.multisyllable'],
    depthOnly: true,
  },
  {
    peak: 20,
    phase: 5,
    label: 'Peak 20 — alternative spellings (tch, dge, kn, wr, mb)',
    graphemes: ['tch', 'dge', 'kn', 'wr', 'mb'],
    covers: ['reading.phonics.vowelTeams', 'reading.decoding.multisyllable'],
    depthOnly: true,
  },
]

/** The Fast Phonics bridge as a versioned, source-tagged object. */
export const fastPhonicsBridge: CurriculumBridge = {
  source: 'fastPhonics',
  version: FAST_PHONICS_BRIDGE_VERSION,
  units: fastPhonicsUnits,
  aliases: ['fast phonics', 'fastphonics', 'reading eggs fast phonics', 'fast phonic'],
}

/** Every bridge we know how to map. New sources add a module + an entry here. */
const ALL_BRIDGES: CurriculumBridge[] = [fastPhonicsBridge]

/**
 * Normalize a free-text source name for tolerant matching: lowercase, then strip
 * every non-alphanumeric character (spaces, hyphens, underscores, punctuation).
 * Deliberately conservative — it collapses formatting differences but NOT
 * misspellings, so "Fast phony" ≠ "fastphonics" (see {@link bridgeForSource}).
 */
export function normalizeSourceName(source: string): string {
  return source.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Look up a bridge by external-source name (case-insensitive, tolerant of the
 * "Fast Phonics" free-text the parent might type). Returns null when the named
 * source has no bridge — the caller then falls back to a single generic `covered`.
 */
export function bridgeForSource(source: string | undefined | null): CurriculumBridge | null {
  if (!source) return null
  const key = normalizeSourceName(source)
  if (!key) return null
  for (const bridge of ALL_BRIDGES) {
    // The bridge's own `source` id is always a valid alias, plus its listed ones.
    if (
      normalizeSourceName(bridge.source) === key ||
      bridge.aliases.some((a) => normalizeSourceName(a) === key)
    ) {
      return bridge
    }
  }
  return null
}

/** One deterministic coverage claim: a concept id + the peak that grounds it. */
export interface BridgeEvidence {
  conceptId: string
  unit: BridgeUnit
}

/**
 * The DETERMINISTIC authority for "which concepts does completing Peak N cover?"
 *
 * Given a completed peak, return the full cumulative set of `{ conceptId, unit }`
 * coverage claims for Peaks 1..N — deduped per concept, keeping the HIGHEST peak
 * that covers it as the unit label (so the evidence reads at the furthest position
 * the child has reached). Positions are cumulative (bridge doc §Semantics).
 *
 * This is the grounding function the upload path filters LLM proposals against: the
 * model is trusted for the POSITION (which peak the screenshot shows); this function
 * is the authority for the MAPPING (which concepts that peak legitimately covers).
 * A model proposal whose conceptId is not in this output for the extracted peak is
 * dropped before staging (see `groundCoveredProposals`).
 */
export function bridgeEvidenceForPosition(peakComplete: number): BridgeEvidence[] {
  const byConcept = new Map<string, BridgeUnit>()
  for (const unit of fastPhonicsUnits) {
    if (unit.peak > peakComplete) continue
    for (const conceptId of unit.covers) {
      const existing = byConcept.get(conceptId)
      // Keep the highest peak covering this concept as its label.
      if (!existing || unit.peak > existing.peak) byConcept.set(conceptId, unit)
    }
  }
  return [...byConcept.entries()].map(([conceptId, unit]) => ({ conceptId, unit }))
}

/** The set of node ids the reading graph actually defines (bridge-validation use). */
export const READING_GRAPH_NODE_IDS: ReadonlySet<string> = new Set(
  readingGraph.nodes.map((n) => n.id),
)
