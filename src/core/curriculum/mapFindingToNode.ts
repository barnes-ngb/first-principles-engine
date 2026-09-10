/**
 * Maps AI-generated finding skill tags to curriculum node IDs.
 *
 * Finding tags come from quest/evaluation sessions (e.g. "phonics.cvc.short-o",
 * "math.addition.within-20", "speech.articulation.r.initial").
 * Curriculum nodes use a different hierarchy (e.g. "reading.phonics.cvc",
 * "math.operations.addSub", "speech.sounds.late").
 *
 * This module bridges the two with exact matches, prefix matches, and keyword fallbacks.
 *
 * ## The contract, unchanged (FIX-226)
 *
 * **It answers with `curriculumMap` node ids and nothing else.** The foundations
 * concept graph is a *different* namespace, and the translation onto it is the
 * separate `core/foundations/curriculumNodeBridge.ts` (FIX-224 / UX-288). So a
 * concept that exists only in the foundations graph — `math.problemSolving.oneStep`,
 * `math.number.digitRecognition` — can never be returned from here however
 * plainly a tag names it; that resolution happens one step later, on the
 * foundations side, and `childSkillMaps` is untouched by it.
 *
 * ## Why the keyword fallback works the way it does (FIX-226 / UX-347)
 *
 * The fallback used to be an ordered chain of `norm.includes(keyword)` tests over
 * a tag whose separators had been **stripped**, and that technique produced at
 * least three independent defects, two of them found by accident:
 *
 *   - `writing.paragraph` → `math.data.graphs`, because "para**graph**" contains
 *     `graph` and the math tests ran before the writing ones (UX-347). The
 *     `paragraph` rule below was therefore **unreachable for every input it
 *     exists to catch** — dead code that looked live.
 *   - `math.subtraction.noRegroup` reads as `regroup` once the hyphen is gone, so
 *     a negation matched the thing it negates (Codex round 1 on FIX-224, fixed
 *     there; the same trap, one module over).
 *   - `multiplication.fluency` → `reading.fluency.accuracy`, a math tag on a
 *     reading node, which `deriveWorkingLevelMastery` has to defend against with
 *     a domain filter of its own.
 *
 * Three changes, and the first is the repair — the other two are the belt:
 *
 *   1. **A keyword matches at word boundaries, never mid-word.** The tag is split
 *      into words on every separator *and* on camelCase (`writing.paragraph` →
 *      `writing` · `paragraph`), and a keyword must be a **prefix of one whole
 *      phrase** — a contiguous run of those words joined up. `graph` is not a
 *      prefix of `paragraph`, so it cannot match; `lettersound` still matches
 *      `letter-sounds` (a prefix of the phrase `lettersounds`), which is why the
 *      loose stems the table depends on (`measur`, `multipl`, `divis`, `rhym`)
 *      still work. Re-ordering the chain would have fixed the one reported tag
 *      and left the technique that produced it, so ordering is **not** the fix.
 *   2. **The rules are a declared table, not a prose if-chain**, so their order is
 *      data that a test can enumerate — and one order rule is mechanical and
 *      asserted: *no keyword may be a prefix of an earlier-declared keyword*
 *      (`cvce` before `cvc`, `times` before `time`), because the earlier one
 *      would otherwise always win.
 *   3. **A tag that declares a domain may not resolve across it.** `math.*` may
 *      not answer with a reading node, `writing.*` may not answer with a math
 *      one. There is exactly one lane (`CROSS_DOMAIN_LANES`), and it is keyed on
 *      **both ends**: a `writing.*` tag that *names spelling* may reach a
 *      **named phonics or decoding** node, which is the lane
 *      `deriveWorkingLevelMastery` already permits ("spelling a CVC word implies
 *      you can decode it") and nothing wider. Each end cost a review round on
 *      PR #1827: gating at the domain level let `writing.fluency` reach
 *      `reading.fluency.accuracy` (round 1), and gating the source alone let
 *      `writing.spelling.fluency` reach it too (round 2) — both `UX-347`'s own
 *      shape through its own guard. The anchor applies to the keyword fallback
 *      only — steps 1-3 are exact or curated answers and are not second-guessed.
 *
 * `docs/review/FINDING_TAG_BRIDGE_CENSUS_2026-09.md` is the registry of every tag
 * the app can hand this function, where each one lands, and why;
 * `src/test/findingTagBridge.invariant.test.ts` fails closed when a tag joins it
 * unclassified or resolves into the wrong domain.
 */

import { CURRICULUM_MAPS, CURRICULUM_NODE_MAP } from './curriculumMap'
import type { CurriculumDomain } from './curriculumMap'
import { phrasesName, tagNames, tagPhrases } from './tagPhrases'

// ── Exact / prefix mapping ─────────────────────────────────────

/**
 * Maps normalized finding prefixes to curriculum node IDs.
 * Keys are normalized (lowercase, dots only, no hyphens/spaces).
 */
const FINDING_PREFIX_MAP: Record<string, string> = {
  // ── Reading / Phonics ───────────────────────────────────
  'phonics.lettersound': 'reading.phonics.letterSounds',
  'phonics.letter_sound': 'reading.phonics.letterSounds',
  'phonics.cvc': 'reading.phonics.cvc',
  'phonics.sightwords': 'reading.phonics.sightWords',
  'phonics.sight_words': 'reading.phonics.sightWords',
  'phonics.blends': 'reading.phonics.blends',
  'phonics.blend': 'reading.phonics.blends',
  'phonics.digraphs': 'reading.phonics.digraphs',
  'phonics.digraph': 'reading.phonics.digraphs',
  'phonics.cvce': 'reading.phonics.longVowels',
  'phonics.vowelteams': 'reading.phonics.longVowels',
  'phonics.longvowels': 'reading.phonics.longVowels',
  'phonics.longvowel': 'reading.phonics.longVowels',
  'phonics.rcontrolled': 'reading.phonics.rControlled',
  'phonics.multisyllable': 'reading.decoding.multisyllable',
  'phonics.prefixes': 'reading.vocabulary.wordParts',
  'phonics.suffixes': 'reading.vocabulary.wordParts',

  // ── Reading / Comprehension & Vocabulary ────────────────
  'reading.comprehension.explicit': 'reading.comprehension.explicit',
  'reading.comprehension.inference': 'reading.comprehension.inference',
  'reading.comprehension.mainidea': 'reading.comprehension.mainIdea',
  'reading.comprehension.sequencing': 'reading.comprehension.explicit',
  // The Knowledge Mine prompt's own two inference tags, whose labels say so:
  // "Cause-effect inference" and "Multi-step inference". Both used to fall to the
  // generic `comprehension` keyword and be recorded as EXPLICIT recall — a
  // different skill, and an easier one (FIX-226). `reading.comprehension.inference`
  // is a live node in both maps, so this is a literal correspondence, not a guess.
  'reading.comprehension.infercause': 'reading.comprehension.inference',
  'reading.comprehension.multistepinference': 'reading.comprehension.inference',
  'reading.vocabulary.contextclues': 'reading.vocabulary.contextClues',
  'reading.vocabulary.wordparts': 'reading.vocabulary.wordParts',
  'reading.vocabulary.synonymsantonyms': 'reading.vocabulary.everyday',
  'reading.fluency': 'reading.fluency.accuracy',

  // ── Math ────────────────────────────────────────────────
  // The number-sense family (UX-346) is deliberately NOT here — it is a keyword
  // rule instead, so a tag that names WHICH number skill was tested is not
  // shadowed by a prefix entry for the family. See `KEYWORD_FALLBACKS`.
  'math.counting': 'math.number.counting',
  'math.skipcounting': 'math.number.counting',
  'math.placevalue': 'math.number.placeValue',
  'math.addition': 'math.operations.addSub',
  'math.subtraction': 'math.operations.addSub',
  'math.multiplication': 'math.operations.multDiv',
  'math.division': 'math.operations.multDiv',
  'math.fractions': 'math.fractions.concepts',
  'math.wordproblems': 'math.problemSolving',
  'math.measurement': 'math.measurement.length',
  'math.geometry': 'math.geometry.shapes',
  'math.time': 'math.measurement.time',
  'math.money': 'math.measurement.time',
  'math.data': 'math.data.graphs',
  'math.graphs': 'math.data.graphs',
  'math.patterns': 'math.algebra.patterns',
  'math.area': 'math.geometry.area',
  'math.perimeter': 'math.geometry.area',
  'math.decimals': 'math.decimals',

  // ── Speech ──────────────────────────────────────────────
  'speech.articulation.r': 'speech.sounds.late',
  'speech.articulation.l': 'speech.sounds.late',
  'speech.articulation.s': 'speech.sounds.late',
  'speech.articulation.z': 'speech.sounds.late',
  'speech.articulation.sh': 'speech.sounds.late',
  'speech.articulation.ch': 'speech.sounds.late',
  'speech.articulation.j': 'speech.sounds.late',
  'speech.articulation.th': 'speech.sounds.late',
  'speech.articulation': 'speech.sounds.late',
  'speech.metathesis': 'speech.sequencing',
  'speech.connectedspeech': 'speech.connected',
}

/**
 * Normalize a finding tag for the EXACT and PREFIX lookups (steps 1-3):
 * - lowercase
 * - strip spaces, hyphens, underscores between segments
 * - collapse dots
 *
 * This is deliberately lossy — it is what makes `math.addition.within-20` walk up
 * to the `math.addition` prefix entry. The keyword fallback does **not** use it,
 * because losing the separators is exactly how `paragraph` came to contain
 * `graph`; step 4 reads the ORIGINAL tag through {@link tagPhrases}.
 */
function normalize(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/\s*\.\s*/g, '.')    // "Phonics . CVC" → "phonics.cvc"
    .replace(/[-_]/g, '')         // "short-o" → "shorto", "within_20" → "within20"
    .replace(/\s+/g, '')          // collapse remaining spaces
    .replace(/\.{2,}/g, '.')      // collapse double dots
    .replace(/^\.|\.$/g, '')      // trim leading/trailing dots
}

// ── Keyword fallback (step 4) ───────────────────────────────────
//
// The word/phrase rule this step matches on has ONE definition, shared with
// `foundations/curriculumNodeBridge`'s detail resolvers: `./tagPhrases`. Both
// modules used to ask *does this tag name this thing* with `String.includes` over
// a tag whose separators had been stripped, and that is the technique UX-347 came
// out of.

/** One fallback rule: any of these keywords, in this position, means this node. */
interface KeywordRule {
  readonly keywords: readonly string[]
  readonly node: string
}

/**
 * The keyword fallback, as an ordered table.
 *
 * **Order is data and it is load-bearing**, so two things are asserted about it
 * rather than left to whoever edits next (`mapFindingToNode.test.ts`):
 *
 *   - *Mechanically:* no keyword may be a prefix of an earlier-declared keyword,
 *     since the earlier one would always win. That is why `cvce` is declared
 *     before `cvc` and `times` before `time`.
 *   - *By hand, pinned by named test:* where two keywords both match a real tag
 *     without either being the other's prefix, the more specific skill is
 *     declared first. `repeatedaddition` before `addition` is the live case —
 *     "repeated addition" IS multiplication (`math.operations.arrays` in the
 *     foundations graph), and reading it as addition recorded the wrong strand.
 *
 * Every `node` is a `curriculumMap` id — the contract in this file's header —
 * pinned by test against `CURRICULUM_NODE_MAP`.
 */
export const KEYWORD_FALLBACKS: readonly KeywordRule[] = [
  // ── Reading ─────────────────────────────────────────────
  // `cvce` first: `cvc` is a prefix of it, so declaring `cvc` earlier would send
  // every silent-e tag to the CVC node three levels below it.
  { keywords: ['cvce', 'longvowel', 'vowelteam'], node: 'reading.phonics.longVowels' },
  { keywords: ['cvc', 'shorta', 'shorte', 'shorti', 'shorto', 'shortu'], node: 'reading.phonics.cvc' },
  { keywords: ['blend'], node: 'reading.phonics.blends' },
  { keywords: ['digraph'], node: 'reading.phonics.digraphs' },
  { keywords: ['rcontrolled'], node: 'reading.phonics.rControlled' },
  { keywords: ['sightword'], node: 'reading.phonics.sightWords' },
  { keywords: ['lettersound'], node: 'reading.phonics.letterSounds' },
  { keywords: ['rhym'], node: 'reading.phonics.cvc' },
  { keywords: ['vocabulary', 'contextclue'], node: 'reading.vocabulary.contextClues' },
  { keywords: ['comprehension', 'mainidea'], node: 'reading.comprehension.explicit' },
  { keywords: ['inference'], node: 'reading.comprehension.inference' },
  { keywords: ['fluency'], node: 'reading.fluency.accuracy' },
  { keywords: ['multisyllab'], node: 'reading.decoding.multisyllable' },

  // ── Math ────────────────────────────────────────────────
  { keywords: ['placevalue'], node: 'math.number.placeValue' },
  // UX-346: `math.number-sense` is the FIRST tag in the evaluation prompt's own
  // math list — Level 1, the floor of the whole ladder — and it used to resolve
  // to **nothing at all**: no prefix entry, and none of these keywords existed
  // (`counting` and `placevalue` were tested, `numbersense` was not). So a
  // Level-1 finding reached neither `childSkillMaps` nor the learner model and
  // logged one `console.warn` nobody reads.
  //
  // `numbercomparison` is declared first because the curriculum map has a node of
  // its own for comparing numbers; the rest of the family shares the Level-1
  // counting node, which is the same node the existing `counting` level-map key
  // already resolves to — so `deriveWorkingLevelMastery`'s output does not move
  // and the only change is that previously-null tags now have a target.
  //
  // **A BARE `math.number-sense` still writes nothing to the learner model**, and
  // that is a rule rather than an accident: it names three K-band concepts at once
  // (counting, digit recognition, comparison), and `applyEvalFindingsToModel` may
  // move a concept DOWN, so choosing one of the three would be the guess FIX-224
  // forbids. The narrowing rule in `curriculumNodeBridge` answers only when the
  // tag's own detail says which — and a tag that says lands.
  { keywords: ['numbercomparison'], node: 'math.number.comparison' },
  { keywords: ['counting', 'skipcount', 'numbersense', 'digitrecognition'], node: 'math.number.counting' },
  // "Repeated addition" is multiplication. Declared before `addition`, which also
  // matches it — the ordering rule stated above, and the one live instance of it.
  { keywords: ['repeatedaddition'], node: 'math.operations.multDiv' },
  { keywords: ['addition', 'subtraction'], node: 'math.operations.addSub' },
  { keywords: ['multipl', 'divis', 'times', 'tables'], node: 'math.operations.multDiv' },
  { keywords: ['fraction'], node: 'math.fractions.concepts' },
  { keywords: ['measur'], node: 'math.measurement.length' },
  { keywords: ['geometry', 'shape'], node: 'math.geometry.shapes' },
  // `times` (above) is matched first, so `times-tables` cannot land here.
  { keywords: ['time', 'money', 'clock'], node: 'math.measurement.time' },
  { keywords: ['twodigit', 'multidigit'], node: 'math.operations.multiDigit' },
  { keywords: ['decimal', 'percent'], node: 'math.decimals' },
  { keywords: ['pattern', 'algebra'], node: 'math.algebra.patterns' },
  { keywords: ['area', 'perimeter'], node: 'math.geometry.area' },
  { keywords: ['wordproblem', 'problemsolv'], node: 'math.problemSolving' },
  { keywords: ['graph', 'data'], node: 'math.data.graphs' },

  // ── Speech ──────────────────────────────────────────────
  { keywords: ['articulation', 'speechsounds'], node: 'speech.sounds.late' },
  { keywords: ['metathesis'], node: 'speech.sequencing' },
  { keywords: ['connectedspeech', 'intelligib'], node: 'speech.connected' },

  // ── Writing ─────────────────────────────────────────────
  // These three sat BELOW the math section and `paragraph` was unreachable
  // (UX-347). They stay last: the boundary rule, not the ordering, is what makes
  // them reachable, and moving them would have hidden the real defect.
  { keywords: ['spelling'], node: 'writing.mechanics.spelling' },
  { keywords: ['sentence'], node: 'writing.composition.sentence' },
  { keywords: ['paragraph'], node: 'writing.composition.paragraph' },
]

// ── Domain anchor (step 4) ──────────────────────────────────────

/**
 * The domain a tag DECLARES, read off its leading segment. A tag whose first
 * segment is not one of these declares nothing — every level-map key
 * (`counting`, `two-digit.addition`, `multiplication.fluency`) is in that
 * position — and is left to the ordered table alone.
 */
const DOMAIN_BY_LEADING_SEGMENT: Record<string, CurriculumDomain> = {
  phonics: 'reading',
  reading: 'reading',
  math: 'math',
  writing: 'writing',
  speech: 'speech',
}

/**
 * A declared cross-domain lane: a tag in one domain that may legitimately answer
 * with a node in another — **but only when the tag itself names the thing that
 * makes the implication true, AND only onto the nodes that implication reaches.**
 *
 * Both halves of that are load-bearing, and each was a P1 from a review round on
 * PR #1827:
 *
 *   - **Round 1** — the first version allowed the pairing at the DOMAIN level
 *     (`writing` may reach `reading`), which is a far wider claim than the
 *     justification supports: `writing.fluency` reached
 *     `reading.fluency.accuracy` and `writing.inference` reached
 *     `reading.comprehension.inference`.
 *   - **Round 2** — gating on the tag naming `spelling` constrained the *source*
 *     and left the *destination* open, so a compound tag carried the lane
 *     anywhere a reading keyword happened to point: `writing.spelling.fluency`
 *     still reached `reading.fluency.accuracy`, and `writing.spelling.inference`
 *     still reached `reading.comprehension.inference`.
 *
 * Both are `UX-347`'s shape — a writing finding landing on a real foundations
 * reading concept, which `computeEvalRead` accepts and can DOWNGRADE — through
 * the guard written to stop it. So a lane now names its destinations explicitly:
 * *"spelling a CVC word implies you can decode it"* justifies the phonics and
 * decoding nodes and **nothing else**. Fluency, vocabulary and comprehension are
 * not implied by spelling a word.
 */
interface CrossDomainLane {
  from: CurriculumDomain
  /** The lane opens only for a tag naming one of these (see `tagPhrases`). */
  named: readonly string[]
  /**
   * …and only onto these exact nodes. An explicit list rather than an
   * `reading.phonics.*` prefix, because a prefix would silently admit whatever
   * node is added to the curriculum map next; a test asserts every id here is a
   * live `curriculumMap` node outside `from`, so a typo fails rather than
   * quietly closing the lane.
   */
  nodes: readonly string[]
}

/**
 * Every cross-domain lane there is, and there is exactly one.
 *
 * `writing` **spelling** → `reading` **decoding**: spelling a word implies you
 * can decode it, so `writing.spelling.sightWord` reaching
 * `reading.phonics.sightWords` is intended and is left exactly as it was. It is
 * the lane `deriveWorkingLevelMastery` already declares for its writing key, and
 * it is **one-directional** — a `reading.*` tag may not answer with a writing
 * node — because the implication only runs that way.
 */
const CROSS_DOMAIN_LANES: readonly CrossDomainLane[] = [
  {
    from: 'writing',
    named: ['spelling'],
    nodes: [
      'reading.phonics.letterSounds',
      'reading.phonics.cvc',
      'reading.phonics.blends',
      'reading.phonics.digraphs',
      'reading.phonics.longVowels',
      'reading.phonics.rControlled',
      'reading.phonics.sightWords',
      'reading.decoding.multisyllable',
    ],
  },
]

/** The lanes, exported so a test can assert every destination is a real node. */
export const CROSS_DOMAIN_LANE_TABLE = CROSS_DOMAIN_LANES

/**
 * Would this keyword answer cross the domain the tag declared?
 *
 * Belt to the boundary rule's braces: `writing.paragraph` is stopped by the
 * boundary rule before it can reach `math.data.graphs`, and stopped again here
 * if a future keyword makes the same mistake a different way. Exported because
 * the registry (`src/test/findingTagBridge.ts`) classifies every tag by this
 * exact rule — a second copy of it there would be a second answer to the one
 * question the anchor exists to answer.
 */
export function resolvesOutsideDeclaredDomain(tag: string, nodeId: string): boolean {
  const declared = declaredTagDomain(tag)
  if (!declared) return false
  const nodeDomain = CURRICULUM_NODE_MAP[nodeId]?.domain
  if (!nodeDomain) return false
  if (nodeDomain === declared) return false
  // A lane is keyed by BOTH ends: where the tag is from, and which node it wants.
  const lane = CROSS_DOMAIN_LANES.find(
    (l) => l.from === declared && l.nodes.includes(nodeId),
  )
  if (!lane) return true
  // The lane exists and the destination is one it justifies, so it comes down to
  // whether THIS tag names the thing that makes it true. A writing tag that does
  // not say "spelling" is not carrying spelling evidence, whatever else it says.
  return !lane.named.some((keyword) => tagNames(tag, keyword))
}

/**
 * The domain a tag DECLARES, by its leading segment — or null when it declares
 * nothing, which every working-level key does (`counting`,
 * `two-digit.addition`, `multiplication.fluency`). Exported for the registry,
 * for the same one-definition reason as the rule above.
 */
export function declaredTagDomain(tag: string): CurriculumDomain | null {
  return DOMAIN_BY_LEADING_SEGMENT[normalize(tag).split('.')[0] ?? ''] ?? null
}

/**
 * Step 4 alone, exported so the census and the guard can report on the fallback
 * separately from the exact and prefix answers above it.
 */
export function keywordFallbackNode(tag: string): string | null {
  const phrases = tagPhrases(tag)
  for (const rule of KEYWORD_FALLBACKS) {
    if (!rule.keywords.some((keyword) => phrasesName(phrases, keyword))) continue
    if (resolvesOutsideDeclaredDomain(tag, rule.node)) continue
    return rule.node
  }
  return null
}

/**
 * Map a finding skill tag to a curriculum node ID.
 * Returns null if no mapping is found.
 */
export function mapFindingToNode(findingSkillTag: string): string | null {
  if (!findingSkillTag) return null

  const norm = normalize(findingSkillTag)

  // 1) Check if the tag IS already a valid curriculum node ID
  if (CURRICULUM_NODE_MAP[findingSkillTag]) return findingSkillTag

  // 2) Exact normalized match in prefix map
  if (FINDING_PREFIX_MAP[norm]) return FINDING_PREFIX_MAP[norm]

  // 3) Walk up the hierarchy — "phonics.cvc.shorto" → "phonics.cvc" → "phonics"
  const parts = norm.split('.')
  while (parts.length > 1) {
    parts.pop()
    const prefix = parts.join('.')
    if (FINDING_PREFIX_MAP[prefix]) return FINDING_PREFIX_MAP[prefix]
  }

  // 4) Keyword fallback — catch tags that don't match the prefix structure
  const fallback = keywordFallbackNode(findingSkillTag)
  if (fallback) return fallback

  console.warn(`[LearningMap] Unmapped finding tag: "${findingSkillTag}" (normalized: "${norm}")`)
  return null
}

/**
 * Convert an EvaluationFinding status to a SkillStatus.
 * - 'mastered' → 'mastered'
 * - 'emerging' → 'in-progress'
 * - 'not-yet' → 'in-progress' (they've been assessed, so not "not started")
 * - 'not-tested' → null (skip)
 */
export function findingStatusToSkillStatus(
  findingStatus: string,
): 'mastered' | 'in-progress' | null {
  switch (findingStatus) {
    case 'mastered':
      return 'mastered'
    case 'emerging':
    case 'not-yet':
      return 'in-progress'
    default:
      return null
  }
}

/**
 * Get all curriculum node IDs linked to a given program (e.g. 'reading-eggs').
 */
export function getNodesForProgram(programId: string): string[] {
  return CURRICULUM_MAPS
    .flatMap((m) => m.nodes)
    .filter((n) => n.linkedPrograms?.includes(programId))
    .map((n) => n.id)
}
