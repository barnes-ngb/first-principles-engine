/**
 * Skill Tags v1 Taxonomy
 *
 * Minimal taxonomy for tagging plan items, artifacts, and day blocks
 * to engine stages, ladder rungs, and evaluation metrics.
 *
 * Format: domain.area.skill (no level — level lives on the PrioritySkill)
 */

export interface SkillTagDefinition {
  tag: string
  label: string
  evidence: string
  commonSupports: string[]
}

// ── Reading ──────────────────────────────────────────────────────

export const ReadingTags = {
  PhonemicAwareness: 'reading.phonemicAwareness',
  LetterSound: 'reading.letterSound',
  CvcBlend: 'reading.cvcBlend',
  SightWords: 'reading.sightWords',
  FluencyShort: 'reading.fluency.short',
} as const
export type ReadingTag = (typeof ReadingTags)[keyof typeof ReadingTags]

// ── Writing ──────────────────────────────────────────────────────

// `writing` splits into deliberately **separate** sub-domains so each routes by
// its own gap (FEAT-11): `writing.spelling.*` (encoding — "get the word right",
// the spell-the-word signal, Phase 1), `writing.composition.sentence` /
// `writing.sentence.*` (sentence-building — "put words in order", the
// build-the-sentence signal, Phase 2), and, in a later phase, the rest of
// `writing.composition.*` ("say what you mean"). They are NOT collapsed into one
// blurred `writing` number — a struggling speller with strong ideas (Lincoln)
// would be mis-served by a single level: spelling ≠ sentence ≠ composition. The
// legacy handwriting-mechanics tags below are retained for back-compat but are
// **not** routed to via practice (their pencil-first practice ideas were
// neutralized on the curriculum nodes — see `curriculumMap.ts`).
export const WritingTags = {
  GripPosture: 'writing.gripPosture',
  LetterFormation: 'writing.letterFormation',
  CopyWords: 'writing.copyWords',
  // ── Spelling / encoding (FEAT-11 Phase 1, tap-only tile assembly) ──
  SpellingPhonetic: 'writing.spelling.phonetic',
  SpellingSightWord: 'writing.spelling.sightWord',
  // ── Sentence-building (FEAT-11 Phase 2, tap word-tiles into order) ──
  // `SentenceComposition` maps to the existing `writing.composition.sentence`
  // curriculum node; `SentenceOrder` is the scrambled-to-order construction
  // sub-skill (word order + bundled capital/period). Both are distinct from the
  // `writing.spelling.*` namespace so the sentence signal never blurs into it.
  SentenceComposition: 'writing.composition.sentence',
  SentenceOrder: 'writing.sentence.order',
} as const
export type WritingTag = (typeof WritingTags)[keyof typeof WritingTags]

// ── Math ─────────────────────────────────────────────────────────

export const MathTags = {
  AdditionFacts: 'math.addition.facts',
  SubtractionNoRegroup: 'math.subtraction.noRegroup',
  SubtractionRegroup: 'math.subtraction.regroup',
  PlaceValue: 'math.placeValue',
  WordProblems: 'math.wordProblems',
} as const
export type MathTag = (typeof MathTags)[keyof typeof MathTags]

// ── Self-Regulation ──────────────────────────────────────────────

export const RegulationTags = {
  Attention: 'regulation.attention',
  Frustration: 'regulation.frustration',
  StartAnyway: 'regulation.startAnyway',
  Stamina: 'regulation.stamina',
  FrustrationTolerance: 'regulation.frustrationTolerance',
} as const
export type RegulationTag = (typeof RegulationTags)[keyof typeof RegulationTags]

// ── All tags union ───────────────────────────────────────────────

export const SKILL_TAG_CATALOG: SkillTagDefinition[] = [
  // Reading
  {
    tag: ReadingTags.PhonemicAwareness,
    label: 'Phonemic Awareness',
    evidence: 'Segments or blends 3+ phonemes in spoken words',
    commonSupports: ['Elkonin boxes', 'Clap/tap syllables', 'Short bursts (2 min)'],
  },
  {
    tag: ReadingTags.LetterSound,
    label: 'Letter-Sound Correspondence',
    evidence: 'Names sound for 20+ letters without prompt',
    commonSupports: ['Letter tiles', 'Finger tracing', 'Multisensory (sand/playdough)'],
  },
  {
    tag: ReadingTags.CvcBlend,
    label: 'CVC Blending',
    evidence: 'Reads 10 CVC words with 2 or fewer prompts',
    commonSupports: ['Tap sounds', 'Finger blending', 'Short sessions (5-8 min)'],
  },
  {
    tag: ReadingTags.SightWords,
    label: 'Sight Words',
    evidence: 'Reads 5+ sight words automatically (< 3 sec each)',
    commonSupports: ['Flash cards', 'Word wall', 'Repeated reading'],
  },
  {
    tag: ReadingTags.FluencyShort,
    label: 'Short Passage Fluency',
    evidence: 'Reads a decodable sentence with expression',
    commonSupports: ['Repeated reading', 'Echo reading', 'Phrase-cued text'],
  },

  // Writing
  {
    tag: WritingTags.GripPosture,
    label: 'Grip & Posture',
    evidence: 'Holds pencil with tripod grip for 3+ min',
    commonSupports: ['Pencil grip aid', 'Slant board', 'Short practice (5 min max)'],
  },
  {
    tag: WritingTags.LetterFormation,
    label: 'Letter Formation',
    evidence: 'Forms 15+ letters legibly from memory',
    commonSupports: ['Tracing sheets', 'Skywriting', 'Verbal cues for strokes'],
  },
  {
    tag: WritingTags.CopyWords,
    label: 'Copy Words',
    evidence: 'Copies 3-word phrases legibly with spacing',
    commonSupports: ['Model nearby', 'Lined paper', 'Short sets (3-5 words)'],
  },
  {
    tag: WritingTags.SpellingPhonetic,
    label: 'Spelling (sound it out)',
    evidence: 'Builds a heard word from sound/letter tiles (tap-only)',
    // Tap/voice supports only — never a pencil or typing prompt (FEAT-11).
    commonSupports: ['Sound-block tiles', 'Hear-the-word replay', 'Stretch the sounds together'],
  },
  {
    tag: WritingTags.SpellingSightWord,
    label: 'Spelling sight words',
    evidence: 'Spells a familiar sight word from tiles after hearing it (tap-only)',
    commonSupports: ['Tiles from words he can already read', 'Hear-the-word replay', 'Build then check'],
  },
  {
    tag: WritingTags.SentenceComposition,
    label: 'Building sentences',
    evidence: 'Orders word tiles into a complete sentence with a capital and a period (tap-only)',
    // Tap-only supports — never a pencil or typing prompt (FEAT-11).
    commonSupports: ['Word tiles to tap into order', 'Hear-the-sentence replay', 'Capital tile + period tile'],
  },
  {
    tag: WritingTags.SentenceOrder,
    label: 'Word order in a sentence',
    evidence: 'Puts scrambled word tiles into the right order to make a sentence',
    commonSupports: ['Start with the capital tile', 'Say it aloud, then place each word', 'Finish with the period tile'],
  },

  // Math
  {
    tag: MathTags.AdditionFacts,
    label: 'Addition Facts',
    evidence: 'Solves 10 single-digit addition facts in 2 min',
    commonSupports: ['Number line', 'Counters', 'Timed sprints (1 min)'],
  },
  {
    tag: MathTags.SubtractionNoRegroup,
    label: 'Subtraction (no regrouping)',
    evidence: 'Solves 8/10 two-digit subtraction without regrouping',
    commonSupports: ['Base-ten blocks', 'Place value chart', 'Color-coded columns'],
  },
  {
    tag: MathTags.SubtractionRegroup,
    label: 'Subtraction (regrouping)',
    evidence: 'Solves 6/8 two-digit regrouping problems with manipulatives or guided steps',
    commonSupports: ['Base-ten blocks', 'Place value chart', 'Crossing-out method'],
  },
  {
    tag: MathTags.PlaceValue,
    label: 'Place Value',
    evidence: 'Identifies tens and ones in 2-digit numbers',
    commonSupports: ['Base-ten blocks', 'Place value mat', 'Expanded form practice'],
  },
  {
    tag: MathTags.WordProblems,
    label: 'Word Problems',
    evidence: 'Solves 2/3 single-step word problems with drawing',
    commonSupports: ['Draw a picture', 'Act it out', 'Underline key words'],
  },

  // Self-Regulation
  {
    tag: RegulationTags.Attention,
    label: 'Sustained Attention',
    evidence: 'Stays on task for 8+ min with 1 redirect',
    commonSupports: ['Timer visible', 'Fidget tool', 'Break after 8 min'],
  },
  {
    tag: RegulationTags.Frustration,
    label: 'Frustration Tolerance',
    evidence: 'Uses a coping strategy before quitting',
    commonSupports: ['Visual calm-down steps', 'Offer choice of 2 tasks', 'Reduce difficulty first'],
  },
  {
    tag: RegulationTags.StartAnyway,
    label: 'Start Anyway',
    evidence: 'Begins task within 2 minutes of prompt despite reluctance',
    commonSupports: ['Offer 2 choices (same skill, different modality)', '5-minute timer', 'First rep together', 'Immediate win (1 XP + praise)'],
  },
  {
    tag: RegulationTags.Stamina,
    label: 'Task Stamina',
    evidence: 'Sustains effort on a non-preferred task for 10+ minutes',
    commonSupports: ['Visual timer', 'Break after milestone', 'Reduce task length', 'Pair with preferred activity'],
  },
  {
    tag: RegulationTags.FrustrationTolerance,
    label: 'Frustration Recovery',
    evidence: 'Returns to task after frustration without adult escalation',
    commonSupports: ['Deep breaths visual', 'Choice card', 'Lower difficulty then rebuild', 'Celebrate recovery'],
  },
]

/** Map from tag string to its definition for quick lookup. */
export const SKILL_TAG_MAP: Record<string, SkillTagDefinition> = Object.fromEntries(
  SKILL_TAG_CATALOG.map((def) => [def.tag, def]),
)

/** All tag strings for use in dropdowns. */
export const ALL_SKILL_TAGS: string[] = SKILL_TAG_CATALOG.map((d) => d.tag)

/**
 * Given a subject bucket string, return suggested skill tags.
 */
export function suggestTagsForSubject(subjectBucket: string): string[] {
  const lower = subjectBucket.toLowerCase()
  if (lower === 'reading' || lower === 'languagearts') {
    return [
      ReadingTags.CvcBlend,
      ReadingTags.SightWords,
      ReadingTags.PhonemicAwareness,
      ReadingTags.FluencyShort,
      WritingTags.LetterFormation,
      WritingTags.CopyWords,
    ]
  }
  if (lower === 'math') {
    return [
      MathTags.SubtractionRegroup,
      MathTags.SubtractionNoRegroup,
      MathTags.AdditionFacts,
      MathTags.PlaceValue,
      MathTags.WordProblems,
    ]
  }
  return ALL_SKILL_TAGS
}

/**
 * Auto-suggest tags for an assignment based on subject + snapshot priority skills.
 * Returns the best-match tags (priority skills first, then subject defaults).
 */
export function autoSuggestTags(
  subjectBucket: string,
  prioritySkillTags: string[],
): string[] {
  const subjectTags = suggestTagsForSubject(subjectBucket)
  // Prioritize tags that match both the subject AND a priority skill
  const prioritized = subjectTags.filter((t) => prioritySkillTags.includes(t))
  if (prioritized.length > 0) return prioritized
  // Fall back to first 2 subject-relevant tags
  return subjectTags.slice(0, 2)
}
