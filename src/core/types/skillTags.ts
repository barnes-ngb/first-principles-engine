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

export const WritingTags = {
  GripPosture: 'writing.gripPosture',
  LetterFormation: 'writing.letterFormation',
  CopyWords: 'writing.copyWords',
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
