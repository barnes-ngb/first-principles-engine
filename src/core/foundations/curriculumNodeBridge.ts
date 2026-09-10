// ── curriculumMap node id → foundations concept id(s) (FIX-224 / UX-288) ──
//
// **The foundations-side answer to "which concept does this finding speak to".**
//
// `mapFindingToNode` answers a different question — *finding tag → curriculumMap
// node id* — and it answers it correctly. The defect UX-288 filed is that the
// foundations side then treated that answer as though it were a **foundations**
// id, and silently dropped every id the concept graph does not define
// (`computeEvalRead`'s `!FOUNDATION_NODE_MAP[conceptId]` filter).
//
// Two of those dropped ids are the whole of core arithmetic:
// `math.operations.addSub` and `math.operations.multDiv`. So a guided
// evaluation — the ONE calibrated writer in the system, the only signal
// permitted to move a concept toward the working edge — wrote **nothing** for
// eleven of the twenty math skill tags its own prompt tells the model to emit
// (`functions/src/ai/chat.ts`, "SKILL TAGS for math findings"). For a child
// working at ~3rd grade math, that is the majority of what an eval can say.
//
// ## Why the bridge was NOT repointed
//
// The obvious fix — pointing `math.addition` at `math.operations.addWithin20`
// in `mapFindingToNode` — would be a defect, not a fix. Both ids are **live
// `curriculumMap` nodes** (`curriculumMap.ts:286-287`) with four declared
// dependants (`math.operations.multiDigit`, `math.fractions.concepts`,
// `math.measurement.time`, `math.geometry.area`) and stored `childSkillMaps`
// entries already written against them. Repointing would break the curriculum
// map's dependency graph, break the skill map, and orphan stored entries.
// `mapFindingToNode`, `curriculumMap.ts` and the skill-map writers are
// therefore untouched: they keep emitting and consuming curriculumMap ids
// exactly as before, and the repair is here, on the reading side.
//
// ## The rule: the finding's own detail selects the concept
//
// A finding tag is shaped `math.addition.within-20` — the detail that tells
// `addWithin20` apart from `twoDigit` is *already in the tag*, and is exactly
// what `mapFindingToNode` discarded when it collapsed the tag to `addSub`. So
// this module reads the **original tag**, not only the mapped id, and matches
// the tokens the tag actually carries against the concepts the graph actually
// names. Every entry below is a literal correspondence ("multi-digit" ↔
// "Multi-digit math", "regrouping" ↔ "Regroups (carries and borrows)"), never
// an inference about what a child probably did.
//
// **When the detail is absent or unrecognised, the answer is none.** A bare
// `math.addition` could be any of five concepts spanning three bands, and the
// tag does not say which was tested. Resolving it to the most likely one would
// be a guess, and fanning it across all five would assert that each had been
// assessed. Either is worse than the silence being fixed, because
// `applyEvalFindingsToModel` is **calibrated** — it may move a concept DOWN —
// so a wrong target does not merely add noise, it can knock a solid concept
// back to the working edge on evidence about a different skill. The outcome is
// returned (`no-detail`) rather than thrown away, so a caller can tell "we had
// nothing to say" apart from "we said nothing".
//
// `math.division` is the one bare tag that *does* resolve, and it is not an
// exception to that rule: the graph defines exactly one division concept, so
// the word "division" in the tag is itself the detail.
//
// ## Who reads this
//
// Both foundations-side consumers of the finding bridge, so the two cannot
// disagree about which concept a tag is about:
//   - `evalModelSync.computeEvalRead` — the guided evaluation (UX-288 proper);
//   - `seedLearnerModel` — whose Gate-3 `prioritySkills` loop keys a Map by
//     `mapFindingToNode`'s answer and then looks it up by **graph node id**, so
//     an `addSub`/`multDiv` tag set a key no node ever has. That is the same
//     defect through a second door, and it is not hypothetical: Lincoln's own
//     default priority skill is tagged `math.subtraction.regroup`
//     (`features/evaluation/lincolnDefaults.ts`), which mapped to `addSub` and
//     seeded nothing. It is included here rather than left for a later run
//     because a second answer to this one question is exactly what this repo's
//     one-definition rail exists to prevent.
//
// ## It may not disagree with the curated table
//
// `tagConceptBridge.ts` is the owner-curated `skillTag → conceptId` answer for
// the **catalog** tags in `skillTags.ts`, and those tags reach this module too
// (a `prioritySkill` carries one). Where both answer, they must agree, and that
// is enforced by test over every catalog `MathTags` member whose bridge answer
// is one of the two ids split here — not by hand-checking. Codex round 1 found
// exactly the defect that rail exists to catch: `math.subtraction.noRegroup`
// normalises to `...noregroup`, which CONTAINS `regroup`, so a bare substring
// match marked the harder `regrouping` concept solid for a child who had
// demonstrated the opposite. Where a curated answer exists it is taken verbatim
// rather than re-derived (`noRegroup` → `twoDigit`, `additionFacts` →
// `addWithin20`).
//
// The **curriculumMap-side** consumers are deliberately NOT changed and must
// not read this module: `updateSkillMapFromFindings` and
// `deriveWorkingLevelMastery` write `childSkillMaps`, whose ids are
// curriculumMap ids — `addSub` and `multDiv` are correct there, and are pinned
// by test.

import { FOUNDATION_NODE_MAP } from './index'

/** What the resolver did — returned so a drop is recorded, not merely silent. */
export const FoundationBridgeOutcome = {
  /** The id is itself a foundations concept — passed through unchanged. */
  Direct: 'direct',
  /** A curriculumMap-only id the finding's own detail resolved. */
  DetailResolved: 'detail-resolved',
  /** A curriculumMap-only id whose detail is absent or unrecognised — no guess. */
  NoDetail: 'no-detail',
  /** A curriculumMap id in a domain the foundations graph has no half for. */
  OutsideDomain: 'outside-domain',
  /** `mapFindingToNode` itself returned null. */
  Unmapped: 'unmapped',
} as const
export type FoundationBridgeOutcome =
  (typeof FoundationBridgeOutcome)[keyof typeof FoundationBridgeOutcome]

export interface FoundationBridgeResult {
  /**
   * The foundations concept(s) this finding speaks to — empty when none does.
   *
   * The shape permits one-to-many so a future tag that genuinely names two
   * assessed concepts can say so without a breaking change. **Today the rule
   * never returns more than one**, deliberately: a finding must not be written
   * to a concept it did not test.
   */
  conceptIds: string[]
  outcome: FoundationBridgeOutcome
}

/**
 * Strip a tag to bare alphanumerics for token matching: lowercase, then drop
 * every separator (dots, hyphens, underscores, spaces) so `math.two-digit.addition`
 * becomes `mathtwodigitaddition` and a token is a plain substring.
 *
 * Deliberately its own minimal normalisation rather than a reuse of
 * `mapFindingToNode`'s private `normalize`: that file is not changed by this
 * run, and this needs a *stricter* transform (dots removed too) than routing
 * does. The two are pinned to agree on the real tag vocabulary by test.
 */
function tagTokens(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Small-facts band: `within-20`, `within-10`, `single`/`single-digit`, `facts`. */
function namesSmallNumberBand(t: string): boolean {
  if (t.includes('single') || t.includes('facts')) return true
  const within = /within(\d+)/.exec(t)
  return within != null && Number(within[1]) <= 20
}

/**
 * A tag that names the ABSENCE of regrouping — `math.subtraction.noRegroup` is a
 * live catalog tag (`skillTags.ts` `MathTags.SubtractionNoRegroup`) and a real
 * priority skill. Tested before `regroup`, because the negation contains the
 * word it negates: a bare substring match reads "no regrouping" as "regrouping"
 * and marks the HARDER concept solid on a skill the child has not demonstrated,
 * which is worse than the silence this module exists to fix (Codex round 1).
 */
const NO_REGROUP = /(no|without)regroup/

/**
 * `math.operations.addSub` → the addition/subtraction concept the tag names.
 *
 * Order is most-specific-first, and specificity means **a named technique beats
 * a named size**: "regrouping" says what was tested, "multi-digit" says only how
 * big the numbers were. On the real tag vocabulary the two never co-occur
 * (`math.subtraction.regrouping` and `math.multi-digit.subtraction` are separate
 * tags), so this settles a hypothetical rather than reversing a live case.
 */
function resolveAddSub(t: string): string | null {
  // Negation first — see NO_REGROUP. `twoDigit` is not a fallback here: it is
  // the answer `tagConceptBridge` already curates for this tag ("two-digit
  // subtraction without regrouping lives in the two-digit-ops node").
  if (NO_REGROUP.test(t)) return 'math.operations.twoDigit'
  if (t.includes('regroup')) return 'math.operations.regrouping'
  if (t.includes('multidigit')) return 'math.operations.multiDigit'
  if (t.includes('twodigit')) return 'math.operations.twoDigit'
  if (t.includes('factfamil')) return 'math.operations.factFamilies'
  if (namesSmallNumberBand(t)) {
    // The band is named; the operation still has to be, or we cannot tell
    // whether the child was adding or taking away.
    if (t.includes('subtraction') || t.includes('subtract')) return 'math.operations.subWithin20'
    if (t.includes('addition') || t.includes('adding')) return 'math.operations.addWithin20'
  }
  return null
}

/**
 * `math.operations.multDiv` → the multiplication/division concept the tag names.
 *
 * `divis` is tested first because division is its own strand: the graph has
 * exactly one division concept, so a tag naming division names it regardless of
 * what size or fluency word rides alongside.
 */
function resolveMultDiv(t: string): string | null {
  if (t.includes('divis') || t.includes('divid')) return 'math.operations.division'
  if (t.includes('multidigit')) return 'math.operations.multiDigit'
  if (t.includes('tables')) return 'math.operations.multiTables'
  if (t.includes('facts')) return 'math.operations.multFacts'
  if (t.includes('array') || t.includes('groups') || t.includes('repeatedaddition')) {
    return 'math.operations.arrays'
  }
  return null
}

/** The curriculumMap-only ids this module knows how to split, and how. */
const DETAIL_RESOLVERS: Record<string, (tagTokens: string) => string | null> = {
  'math.operations.addSub': resolveAddSub,
  'math.operations.multDiv': resolveMultDiv,
}

/**
 * Resolve a `mapFindingToNode` answer to the foundations concept(s) it speaks
 * to. **Pure.** Returns an empty list — with the outcome saying why — whenever
 * nothing resolves; it never guesses and never fans one finding across several
 * concepts.
 *
 * @param nodeId the curriculumMap node id from `mapFindingToNode` (or null).
 * @param findingTag the ORIGINAL finding skill tag, whose detail is the signal.
 */
export function resolveFoundationConcepts(
  nodeId: string | null,
  findingTag: string,
): FoundationBridgeResult {
  if (!nodeId) return { conceptIds: [], outcome: FoundationBridgeOutcome.Unmapped }

  // Already a foundations concept — the common case, unchanged.
  if (FOUNDATION_NODE_MAP[nodeId]) {
    return { conceptIds: [nodeId], outcome: FoundationBridgeOutcome.Direct }
  }

  const resolver = DETAIL_RESOLVERS[nodeId]
  if (!resolver) {
    // A curriculumMap id with no foundations half at all — the whole `writing.*`
    // and `speech.*` sides of the map. `FoundationDomain` is reading + math by
    // design, so this is the declared boundary, not a defect.
    return { conceptIds: [], outcome: FoundationBridgeOutcome.OutsideDomain }
  }

  const resolved = resolver(tagTokens(findingTag))
  if (!resolved) return { conceptIds: [], outcome: FoundationBridgeOutcome.NoDetail }
  return { conceptIds: [resolved], outcome: FoundationBridgeOutcome.DetailResolved }
}
