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
// ## Narrowing: the same rule on an id the graph DOES define (FIX-226)
//
// `NARROWING_RESOLVERS` applies that rule one step further out. `math.problemSolving`
// and `math.number.counting` are curriculumMap ids the foundations graph *does*
// define, so they used to pass through as `direct` — but the graph carries more
// specific concepts underneath each (`math.problemSolving.oneStep`;
// `math.number.digitRecognition` / `comparison` / `skipCount`), and the coarse
// id is the HARDER one. A single-step word problem recorded against a band-5
// multi-step concept (UX-348) is the same class of error as a `noRegroup` tag
// recorded as regrouping, reached through a different door. Those narrower ids
// exist only in the foundations graph, which is why the repair is here and not
// in `mapFindingToNode`: that function answers with curriculumMap ids by
// contract, so `childSkillMaps` keeps the coarse node — the only answer the
// curriculum map has — and nothing on the skill-map side moves.
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
// ## The curated table is the AUTHORITY, not merely a thing to agree with
//
// `tagConceptBridge.ts` is the owner-curated `skillTag → conceptId` answer for
// the **catalog** tags in `skillTags.ts`, and those tags reach this module too
// (a `prioritySkill` carries one). FIX-224 required the two to *agree* and
// enforced it by test; UX-348 is what that left open — a catalog tag whose
// derived answer was a genuine foundations id, so it passed straight through
// with nothing to compare it against, and `math.wordProblems` seeded the
// **band-5** multi-step concept on evidence about the **band-1-2** one-step
// concept the curated table names.
//
// So the precedence is now in the code (FIX-226): where the curated table has a
// non-empty answer for the tag, that answer is taken verbatim and the derived
// route is not consulted. An **empty** curated entry is the declared curation
// gate ("not decided yet") and does NOT suppress a working derived route — see
// `curatedConcepts`. Agreement is still asserted, against
// `derivedFoundationConcepts`, because "the curated answer wins" and "the
// derived route would have said the same" are different claims and only the
// second one catches the next UX-348.
//
// Codex round 1 on FIX-224 found the defect that rail exists to catch:
// `math.subtraction.noRegroup` normalises to `...noregroup`, which CONTAINS
// `regroup`, so a bare substring match marked the harder `regrouping` concept
// solid for a child who had demonstrated the opposite.
//
// The **curriculumMap-side** consumers are deliberately NOT changed and must
// not read this module: `updateSkillMapFromFindings` and
// `deriveWorkingLevelMastery` write `childSkillMaps`, whose ids are
// curriculumMap ids — `addSub` and `multDiv` are correct there, and are pinned
// by test.

import { FOUNDATION_NODE_MAP } from './index'
import { TAG_CONCEPT_BRIDGE } from './tagConceptBridge'
import { phrasesMatch, phrasesName, tagPhrases } from '../curriculum/tagPhrases'

/** What the resolver did — returned so a drop is recorded, not merely silent. */
export const FoundationBridgeOutcome = {
  /** The id is itself a foundations concept — passed through unchanged. */
  Direct: 'direct',
  /** The owner-curated `tagConceptBridge` answered, and it is the authority. */
  Curated: 'curated',
  /** A curriculumMap-only id the finding's own detail resolved. */
  DetailResolved: 'detail-resolved',
  /**
   * A curriculumMap id that IS a foundations concept, narrowed by the finding's
   * own detail onto a more specific concept underneath it (UX-348).
   */
  DetailNarrowed: 'detail-narrowed',
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
 * The tag's phrases — see `curriculum/tagPhrases.ts`, which is the ONE definition
 * of *does this tag name this thing*, shared with `mapFindingToNode`'s keyword
 * fallback.
 *
 * It used to be a local `replace(/[^a-z0-9]/g, '')` plus `String.includes`, and
 * that is the technique UX-347 came out of one module over: `paragraph` contains
 * `graph`. The rule now matches whole words, so a keyword can no longer land
 * mid-word — with one stated exception below, negation, which is a question of
 * meaning rather than of boundaries.
 */
function detailPhrases(tag: string): readonly string[] {
  return tagPhrases(tag)
}

/** Does the tag name this keyword? (Prefix of a whole phrase — see `tagPhrases`.) */
function names(phrases: readonly string[], keyword: string): boolean {
  return phrasesName(phrases, keyword)
}

/** Small-facts band: `within-20`, `within-10`, `single`/`single-digit`, `facts`. */
function namesSmallNumberBand(phrases: readonly string[]): boolean {
  if (names(phrases, 'single') || names(phrases, 'facts')) return true
  const within = phrasesMatch(phrases, /^within(\d+)$/)
  return within != null && Number(within[1]) <= 20
}

/**
 * A tag that names the ABSENCE of regrouping — `math.subtraction.noRegroup` is a
 * live catalog tag (`skillTags.ts` `MathTags.SubtractionNoRegroup`) and a real
 * priority skill. Tested before `regroup`, because the negation contains the
 * word it negates — and it contains it as a **whole word**, so the word-boundary
 * rule in `tagPhrases` does not and cannot rescue this: "no regrouping" really
 * does say "regrouping". A bare match reads it as the positive and marks the
 * HARDER concept solid on a skill the child has not demonstrated, which is worse
 * than the silence this module exists to fix (Codex round 1 on FIX-224).
 */
function namesNoRegroup(phrases: readonly string[]): boolean {
  return names(phrases, 'noregroup') || names(phrases, 'withoutregroup')
}

/**
 * `math.operations.addSub` → the addition/subtraction concept the tag names.
 *
 * Order is most-specific-first, and specificity means **a named technique beats
 * a named size**: "regrouping" says what was tested, "multi-digit" says only how
 * big the numbers were. On the real tag vocabulary the two never co-occur
 * (`math.subtraction.regrouping` and `math.multi-digit.subtraction` are separate
 * tags), so this settles a hypothetical rather than reversing a live case.
 */
function resolveAddSub(phrases: readonly string[]): string | null {
  // Negation first — see namesNoRegroup. `twoDigit` is not a fallback here: it is
  // the answer `tagConceptBridge` already curates for this tag ("two-digit
  // subtraction without regrouping lives in the two-digit-ops node").
  if (namesNoRegroup(phrases)) return 'math.operations.twoDigit'
  if (names(phrases, 'regroup')) return 'math.operations.regrouping'
  if (names(phrases, 'multidigit')) return 'math.operations.multiDigit'
  if (names(phrases, 'twodigit')) return 'math.operations.twoDigit'
  if (names(phrases, 'factfamil')) return 'math.operations.factFamilies'
  if (namesSmallNumberBand(phrases)) {
    // The band is named; the operation still has to be, or we cannot tell
    // whether the child was adding or taking away.
    if (names(phrases, 'subtract')) return 'math.operations.subWithin20'
    if (names(phrases, 'add')) return 'math.operations.addWithin20'
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
function resolveMultDiv(phrases: readonly string[]): string | null {
  if (names(phrases, 'divis') || names(phrases, 'divid')) return 'math.operations.division'
  if (names(phrases, 'multidigit')) return 'math.operations.multiDigit'
  if (names(phrases, 'tables')) return 'math.operations.multiTables'
  if (names(phrases, 'facts')) return 'math.operations.multFacts'
  if (names(phrases, 'array') || names(phrases, 'groups') || names(phrases, 'repeatedaddition')) {
    return 'math.operations.arrays'
  }
  return null
}

// ── Narrowing (UX-346 / UX-348) ─────────────────────────────────
//
// The two resolvers above split a curriculumMap id the foundations graph does NOT
// define. These two narrow one it DOES: the node is a real concept and would pass
// straight through as `direct`, but the graph carries more specific concepts
// underneath it and the tag's own detail says which was assessed. Same rule as
// above — *the finding's own detail selects the concept* — and the reason it
// matters is that the id it would otherwise land on is the HARDER one.
//
// `mapFindingToNode` is not changed for either case and could not be: both
// narrower targets (`math.problemSolving.oneStep`, `math.number.digitRecognition`)
// exist only in the foundations graph, and that function answers with
// `curriculumMap` ids by contract. So `childSkillMaps` keeps recording the coarse
// node — which is the only answer the curriculum map has — and the narrowing is
// visible to the learner model alone.

/**
 * `math.problemSolving` → one-step or multi-step (UX-348).
 *
 * The owner-curated `tagConceptBridge` routes the catalog tag `math.wordProblems`
 * to `math.problemSolving.oneStep` and says why: *"Catalog evidence is
 * 'single-step word problems' → the one-step node, not the band-5 multi-step
 * `math.problemSolving`."* `mapFindingToNode`'s prefix table answered the band-5
 * node, and since that IS a foundations concept nothing downstream filtered it —
 * so a Gate-3 `math.wordProblems` priority skill seeded a **band 5** concept
 * `solid` on evidence about a **band 1-2** one. Four bands is not a rounding
 * error.
 */
function resolveProblemSolving(phrases: readonly string[]): string | null {
  // The eval prompt's own Level-4+ tag is `math.word-problems.multi-step`, and it
  // means the band-5 node. Tested first: it also names "word problems".
  if (names(phrases, 'multistep')) return 'math.problemSolving'
  if (names(phrases, 'onestep') || names(phrases, 'singlestep')) {
    return 'math.problemSolving.oneStep'
  }
  // An unqualified "word problem" is a one-step story problem — the curated
  // answer, taken verbatim rather than re-derived.
  if (names(phrases, 'wordproblem') || names(phrases, 'storyproblem')) {
    return 'math.problemSolving.oneStep'
  }
  // The tag names the node itself (`math.problemSolving`, `problem-solving`).
  if (names(phrases, 'problemsolv')) return 'math.problemSolving'
  return null
}

/**
 * `math.number.counting` → the K-band number concept the tag names (UX-346).
 *
 * The curriculum map has one Level-1 number node; the foundations graph has four
 * (`counting`, `digitRecognition`, `comparison`, `skipCount`). The evaluation
 * prompt's Level-1 tag is `math.number-sense`, whose own gloss is "counting,
 * digit recognition, number comparison" — **three of them at once** — so a bare
 * number-sense tag resolves to NONE rather than picking one. That is not
 * timidity: `applyEvalFindingsToModel` is calibrated and may move a concept DOWN,
 * so guessing counting from a finding that was really about digit recognition
 * could knock a solid concept back to the working edge on evidence about a
 * different skill. A tag that says which lands.
 */
function resolveNumberSense(phrases: readonly string[]): string | null {
  if (names(phrases, 'digitrecognition')) return 'math.number.digitRecognition'
  // `comparison` standalone as well: the phrase builder joins only CONTIGUOUS
  // words, so `math.number-sense.comparison` carries no `numbercomparison`
  // phrase — `sense` sits between the two — and used to be declined here as
  // having no detail (Codex round 3 on PR #1827, P2).
  if (names(phrases, 'numbercomparison') || names(phrases, 'comparison')) {
    return 'math.number.comparison'
  }
  if (names(phrases, 'skipcount')) return 'math.number.skipCount'
  if (names(phrases, 'count')) return 'math.number.counting'
  return null
}

/**
 * The measurement strand: length, telling time, or counting money (FIX-226).
 *
 * The curriculum map has **two** measurement nodes and the foundations graph has
 * **three**: `math.measurement.length` ("Measure things", band 2),
 * `math.measurement.time` ("Tell time", band 2) and `math.measurement.money`
 * ("Count money", band 3, which the graph makes depend on telling time). The map
 * folds money into its time node — the label is literally "Time & money" — so
 * `math.money` and `math.time` have always shared it there, and a money finding
 * was recorded against telling the time: a different skill, and the easier one.
 *
 * **It is registered on BOTH map nodes, and that is the repair Codex round 3
 * found missing** (P1 on PR #1827). `math.measurement.money` is a tag the
 * evaluator can plainly emit, and it is not a curriculumMap id, so
 * `mapFindingToNode` walks it up to the `math.measurement` prefix and answers
 * `math.measurement.length`. Registering the resolver on the time node alone
 * left that path unnarrowed, so money evidence landed on **length** — the same
 * defect one node over.
 *
 * `fallback` is the node the tag arrived on: unlike number sense, a bare
 * `math.measurement` or `math.measurement.length` names a real concept of its
 * own, so the coarse answer stands rather than declining.
 */
function resolveMeasurement(phrases: readonly string[], fallback: string): string | null {
  const money = names(phrases, 'money') || names(phrases, 'coin')
  const time = names(phrases, 'time') || names(phrases, 'clock')
  // A tag naming both names two concepts — the number-sense rule, so: no guess.
  // The real vocabulary never does (`math.time` and `math.money` are separate
  // tags), so this settles a hypothetical rather than reversing a live case.
  if (money && time) return null
  if (money) return 'math.measurement.money'
  if (time) return 'math.measurement.time'
  return fallback
}

/**
 * `math.fractions.concepts` → the fraction concept the tag names (FIX-226).
 *
 * `math.fractions.comparing` is one of the three fraction tags the evaluation
 * prompt emits, and the foundations graph has `math.fractions.compare` for it —
 * but the curriculum map has only `concepts` and `operations`, so comparing was
 * recorded as understanding-what-a-fraction-is. Unlike number sense, the coarse
 * node here IS a concept a bare `math.fractions` tag names, so the default is
 * the node itself rather than a decline.
 */
function resolveFractions(phrases: readonly string[]): string | null {
  if (names(phrases, 'compar')) return 'math.fractions.compare'
  return 'math.fractions.concepts'
}

/** The curriculumMap-only ids this module knows how to split, and how. */
const DETAIL_RESOLVERS: Record<string, (phrases: readonly string[]) => string | null> = {
  'math.operations.addSub': resolveAddSub,
  'math.operations.multDiv': resolveMultDiv,
}

/**
 * Ids that ARE foundations concepts but carry more specific concepts underneath,
 * and how the tag's detail chooses between them. Consulted BEFORE the `direct`
 * passthrough, which is the whole point — the passthrough is what wrote the
 * harder concept.
 */
const NARROWING_RESOLVERS: Record<string, (phrases: readonly string[]) => string | null> = {
  'math.problemSolving': resolveProblemSolving,
  'math.number.counting': resolveNumberSense,
  // Both measurement nodes, because a money tag can arrive at either (Codex
  // round 3): `math.money` resolves to the time node by prefix entry, and
  // `math.measurement.money` walks up to the length node by prefix WALK.
  'math.measurement.time': (phrases) => resolveMeasurement(phrases, 'math.measurement.time'),
  'math.measurement.length': (phrases) => resolveMeasurement(phrases, 'math.measurement.length'),
  'math.fractions.concepts': resolveFractions,
}

/**
 * The owner-curated answer for a tag, where there is one.
 *
 * **`tagConceptBridge` is the authority wherever it has an answer** (FIX-224
 * established it; UX-348 is what happens when nothing enforces it). It is the
 * only table in this area a person curated on purpose, entry by entry, with the
 * catalog's own evidence sentence in front of them — so where it speaks, it is
 * taken verbatim and the derived route is not consulted at all.
 *
 * **An EMPTY entry is not an answer.** `tagConceptBridge` maps every `writing.*`
 * and `regulation.*` tag to `[]` as its declared curation gate — "not decided
 * yet", not "decided: nothing" — so an empty entry must not suppress a derived
 * route that already works. The live case is `writing.spelling.sightWord`, which
 * is curated `[]` and derives `reading.phonics.sightWords` through the spelling→
 * decoding lane; reading `[]` as authoritative would silently delete that signal.
 */
function curatedConcepts(findingTag: string): string[] | null {
  const curated = TAG_CONCEPT_BRIDGE[findingTag]
  if (!curated || curated.length === 0) return null
  // Filtered through the graph for the same reason `conceptsForTags` filters: an
  // id the graph does not define must never leak out of this module.
  const known = curated.filter((conceptId) => FOUNDATION_NODE_MAP[conceptId])
  return known.length > 0 ? known : null
}

/**
 * Resolve a `mapFindingToNode` answer to the foundations concept(s) it speaks
 * to. **Pure.** Returns an empty list — with the outcome saying why — whenever
 * nothing resolves; it never guesses and never fans one finding across several
 * concepts.
 *
 * Order of authority: the curated table, then the tag's own detail, then the
 * plain passthrough. The detail steps run **before** the passthrough for the two
 * ids in `NARROWING_RESOLVERS`, which is UX-348's whole repair — the passthrough
 * is what recorded the harder concept.
 *
 * @param nodeId the curriculumMap node id from `mapFindingToNode` (or null).
 * @param findingTag the ORIGINAL finding skill tag, whose detail is the signal.
 */
export function resolveFoundationConcepts(
  nodeId: string | null,
  findingTag: string,
): FoundationBridgeResult {
  const curated = curatedConcepts(findingTag)
  if (curated) return { conceptIds: curated, outcome: FoundationBridgeOutcome.Curated }
  return derivedFoundationConcepts(nodeId, findingTag)
}

/**
 * The derived route on its own — everything {@link resolveFoundationConcepts}
 * does **after** the curated table has had its say.
 *
 * Exported for one reason: so the agreement rail can still be asserted now that
 * precedence makes agreement automatic. "The curated answer wins" and "the
 * derived route would have said the same thing" are two different claims, and
 * collapsing them would leave a future entry free to disagree unnoticed — which
 * is UX-348 exactly. The test asserts both: the curated answer is what comes
 * out, and the derived route either agrees with it or declines.
 */
export function derivedFoundationConcepts(
  nodeId: string | null,
  findingTag: string,
): FoundationBridgeResult {
  if (!nodeId) return { conceptIds: [], outcome: FoundationBridgeOutcome.Unmapped }

  const phrases = detailPhrases(findingTag)

  // A foundations concept with more specific concepts underneath it: the tag's
  // own detail chooses, and an unqualified tag declines (UX-346 / UX-348).
  const narrow = NARROWING_RESOLVERS[nodeId]
  if (narrow) {
    const narrowed = narrow(phrases)
    if (!narrowed || !FOUNDATION_NODE_MAP[narrowed]) {
      return { conceptIds: [], outcome: FoundationBridgeOutcome.NoDetail }
    }
    return {
      conceptIds: [narrowed],
      outcome:
        narrowed === nodeId
          ? FoundationBridgeOutcome.Direct
          : FoundationBridgeOutcome.DetailNarrowed,
    }
  }

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

  const resolved = resolver(phrases)
  if (!resolved) return { conceptIds: [], outcome: FoundationBridgeOutcome.NoDetail }
  return { conceptIds: [resolved], outcome: FoundationBridgeOutcome.DetailResolved }
}
