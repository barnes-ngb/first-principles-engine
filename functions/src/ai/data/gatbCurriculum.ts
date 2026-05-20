// ── GATB Scope & Sequence Reference Map (Cloud Functions copy) ──
// Duplicated from src/core/data/gatbCurriculum.ts for use in Cloud
// Functions context pipeline. Static data — keep in sync manually.

export interface CurriculumUnit {
  lessonStart: number
  lessonEnd: number
  topic: string
  skills: string[]
  phonics?: string[]
  sightWords?: string[]
  mathConcepts?: string[]
}

export interface CurriculumLevel {
  name: string
  subject: 'LanguageArts' | 'Math'
  level: string
  gradeEquivalent: string
  totalLessons: number
  lessonsPerWeek: number
  units: CurriculumUnit[]
}

// ── Language Arts Level K ───────────────────────────────────────

const gatbLaK: CurriculumLevel = {
  name: 'The Good and the Beautiful Language Arts',
  subject: 'LanguageArts',
  level: 'Level K',
  gradeEquivalent: 'Kindergarten',
  totalLessons: 120,
  lessonsPerWeek: 4,
  units: [
    {
      lessonStart: 1, lessonEnd: 10,
      topic: 'Letter Introduction & Short Vowels',
      skills: ['letter-recognition', 'letter-sounds', 'pencil-grip', 'tracing'],
      phonics: ['short-a', 'short-i', 'm', 's', 't'],
      sightWords: ['the', 'a', 'I'],
    },
    {
      lessonStart: 11, lessonEnd: 20,
      topic: 'Consonants & Two-Letter Words',
      skills: ['letter-sounds', 'blending', 'two-letter-words', 'handwriting'],
      phonics: ['short-o', 'n', 'p', 'b', 'd'],
      sightWords: ['is', 'it', 'in'],
    },
    {
      lessonStart: 21, lessonEnd: 30,
      topic: 'CVC Words & Short Vowel Review',
      skills: ['CVC-blending', 'short-vowel-discrimination', 'handwriting'],
      phonics: ['short-e', 'short-u', 'g', 'h', 'r'],
      sightWords: ['he', 'to', 'we'],
    },
    {
      lessonStart: 31, lessonEnd: 45,
      topic: 'More Consonants & Simple Sentences',
      skills: ['CVC-words', 'simple-sentences', 'capital-letters', 'periods'],
      phonics: ['f', 'l', 'k', 'w', 'j', 'v', 'x', 'y', 'z', 'q'],
      sightWords: ['she', 'my', 'was', 'for', 'are'],
    },
    {
      lessonStart: 46, lessonEnd: 60,
      topic: 'Consonant Digraphs & Word Families',
      skills: ['digraphs', 'word-families', 'reading-simple-sentences'],
      phonics: ['sh', 'ch', 'th', 'wh', '-at', '-an', '-it', '-in'],
      sightWords: ['you', 'said', 'have', 'they', 'do'],
    },
    {
      lessonStart: 61, lessonEnd: 75,
      topic: 'Blends & Reading Practice',
      skills: ['consonant-blends', 'fluency', 'reading-short-passages'],
      phonics: ['bl', 'cl', 'fl', 'br', 'cr', 'dr', 'gr', 'tr'],
      sightWords: ['what', 'with', 'from', 'or', 'one'],
    },
    {
      lessonStart: 76, lessonEnd: 90,
      topic: 'Long Vowels Introduction',
      skills: ['long-vowels', 'silent-e', 'reading-comprehension-basic'],
      phonics: ['long-a', 'long-i', 'silent-e-pattern', 'ee', 'ea'],
      sightWords: ['come', 'some', 'were', 'there', 'could'],
    },
    {
      lessonStart: 91, lessonEnd: 105,
      topic: 'Vowel Teams & More Reading',
      skills: ['vowel-teams', 'reading-aloud', 'comprehension-questions'],
      phonics: ['oa', 'ai', 'ay', 'igh', 'oo'],
      sightWords: ['would', 'your', 'their', 'been', 'many'],
    },
    {
      lessonStart: 106, lessonEnd: 120,
      topic: 'Review & Reading Fluency',
      skills: ['phonics-review', 'fluency', 'reading-independently', 'comprehension'],
      phonics: ['review-all-patterns'],
      sightWords: ['because', 'very', 'after', 'know', 'other'],
    },
  ],
}

// ── Language Arts Level 1 ───────────────────────────────────────

const gatbLa1: CurriculumLevel = {
  name: 'The Good and the Beautiful Language Arts',
  subject: 'LanguageArts',
  level: 'Level 1',
  gradeEquivalent: '1st Grade',
  totalLessons: 120,
  lessonsPerWeek: 4,
  units: [
    {
      lessonStart: 1, lessonEnd: 12,
      topic: 'Short Vowel Review & Phonics Foundations',
      skills: ['short-vowels', 'CVC-words', 'handwriting', 'oral-reading'],
      phonics: ['short-a', 'short-e', 'short-i', 'short-o', 'short-u', 'CVC-review'],
      sightWords: ['again', 'any', 'been', 'before', 'does'],
    },
    {
      lessonStart: 13, lessonEnd: 24,
      topic: 'Consonant Blends & Digraphs',
      skills: ['blends', 'digraphs', 'spelling', 'sentence-reading'],
      phonics: ['bl', 'cl', 'fl', 'sl', 'br', 'cr', 'dr', 'fr', 'gr', 'tr', 'sh', 'ch', 'th', 'wh'],
      sightWords: ['every', 'friend', 'goes', 'great', 'know'],
    },
    {
      lessonStart: 25, lessonEnd: 36,
      topic: 'Silent-E & Long Vowels',
      skills: ['silent-e-rule', 'long-vowels', 'reading-fluency', 'copywork'],
      phonics: ['a-e', 'i-e', 'o-e', 'u-e', 'long-a', 'long-i'],
      sightWords: ['learn', 'light', 'live', 'many', 'most'],
    },
    {
      lessonStart: 37, lessonEnd: 48,
      topic: 'Vowel Teams & R-Controlled Vowels',
      skills: ['vowel-teams', 'r-controlled', 'reading-comprehension', 'grammar-nouns'],
      phonics: ['ai', 'ay', 'ee', 'ea', 'oa', 'ow', 'ar', 'or', 'er', 'ir', 'ur'],
      sightWords: ['once', 'open', 'pull', 'push', 'right'],
    },
    {
      lessonStart: 49, lessonEnd: 60,
      topic: 'Diphthongs & Advanced Phonics',
      skills: ['diphthongs', 'advanced-phonics', 'grammar-verbs', 'oral-narration'],
      phonics: ['oi', 'oy', 'ou', 'ow', 'oo', 'ew', 'au', 'aw'],
      sightWords: ['should', 'start', 'their', 'these', 'those'],
    },
    {
      lessonStart: 61, lessonEnd: 72,
      topic: 'Soft C & G, Suffixes',
      skills: ['soft-c', 'soft-g', 'suffixes', 'reading-aloud', 'grammar-adjectives'],
      phonics: ['soft-c', 'soft-g', '-ed', '-ing', '-er', '-est', '-ly'],
      sightWords: ['through', 'together', 'upon', 'wash', 'which'],
    },
    {
      lessonStart: 73, lessonEnd: 84,
      topic: 'Syllable Types & Grammar',
      skills: ['syllable-division', 'compound-words', 'grammar-sentences', 'punctuation'],
      phonics: ['open-syllables', 'closed-syllables', 'compound-words', '-tion', '-sion'],
      sightWords: ['work', 'world', 'write', 'young'],
    },
    {
      lessonStart: 85, lessonEnd: 96,
      topic: 'Reading Comprehension & Creative Writing',
      skills: ['comprehension-strategies', 'creative-writing', 'poetry', 'grammar-review'],
      phonics: ['silent-letters-kn', 'silent-letters-wr', 'ph', 'igh'],
      sightWords: ['answer', 'beauty', 'country', 'earth'],
    },
    {
      lessonStart: 97, lessonEnd: 108,
      topic: 'Advanced Reading & Spelling Patterns',
      skills: ['multi-syllable-words', 'spelling-patterns', 'paragraph-writing', 'dictation'],
      phonics: ['ough', 'augh', 'eigh', '-ble', '-dle', '-tle'],
    },
    {
      lessonStart: 109, lessonEnd: 120,
      topic: 'Review & Reading Independence',
      skills: ['phonics-review', 'fluency-assessment', 'independent-reading', 'writing-review'],
      phonics: ['review-all-level-1-patterns'],
    },
  ],
}

// ── Language Arts Level 2 ───────────────────────────────────────

const gatbLa2: CurriculumLevel = {
  name: 'The Good and the Beautiful Language Arts',
  subject: 'LanguageArts',
  level: 'Level 2',
  gradeEquivalent: '2nd Grade',
  totalLessons: 120,
  lessonsPerWeek: 4,
  units: [
    {
      lessonStart: 1, lessonEnd: 12,
      topic: 'Phonics Review & Grammar Foundations',
      skills: ['phonics-review', 'nouns', 'verbs', 'sentence-structure', 'handwriting-cursive-intro'],
      phonics: ['vowel-team-review', 'r-controlled-review', 'digraph-review'],
    },
    {
      lessonStart: 13, lessonEnd: 24,
      topic: 'Vowel Patterns & Parts of Speech',
      skills: ['advanced-vowel-patterns', 'adjectives', 'adverbs', 'spelling', 'copywork'],
      phonics: ['ei', 'ie', 'ey', 'oe', 'ue', 'ui'],
    },
    {
      lessonStart: 25, lessonEnd: 36,
      topic: 'Prefixes, Suffixes & Sentence Types',
      skills: ['prefixes', 'suffixes', 'sentence-types', 'reading-comprehension', 'oral-narration'],
      phonics: ['un-', 're-', 'pre-', 'dis-', '-ful', '-less', '-ness', '-ment'],
    },
    {
      lessonStart: 37, lessonEnd: 48,
      topic: 'Spelling Rules & Paragraph Writing',
      skills: ['spelling-rules', 'paragraph-structure', 'topic-sentences', 'punctuation'],
      phonics: ['doubling-rule', 'drop-e-rule', 'change-y-to-i'],
    },
    {
      lessonStart: 49, lessonEnd: 60,
      topic: 'Grammar: Pronouns, Conjunctions & Contractions',
      skills: ['pronouns', 'conjunctions', 'contractions', 'possessives', 'reading-fluency'],
      phonics: ['contractions-patterns'],
    },
    {
      lessonStart: 61, lessonEnd: 72,
      topic: 'Homophones, Synonyms & Antonyms',
      skills: ['homophones', 'synonyms', 'antonyms', 'context-clues', 'vocabulary'],
    },
    {
      lessonStart: 73, lessonEnd: 84,
      topic: 'Poetry, Literature & Creative Writing',
      skills: ['poetry-analysis', 'literary-elements', 'creative-writing', 'descriptive-writing'],
    },
    {
      lessonStart: 85, lessonEnd: 96,
      topic: 'Advanced Grammar & Composition',
      skills: ['subject-verb-agreement', 'compound-sentences', 'quotation-marks', 'letter-writing'],
    },
    {
      lessonStart: 97, lessonEnd: 108,
      topic: 'Research Skills & Informational Writing',
      skills: ['research-basics', 'informational-writing', 'note-taking', 'dictionary-skills'],
    },
    {
      lessonStart: 109, lessonEnd: 120,
      topic: 'Review & Assessment',
      skills: ['grammar-review', 'spelling-review', 'writing-portfolio', 'reading-assessment'],
    },
  ],
}

// ── Math Level K ────────────────────────────────────────────────

const gatbMathK: CurriculumLevel = {
  name: 'The Good and the Beautiful Math',
  subject: 'Math',
  level: 'Level K',
  gradeEquivalent: 'Kindergarten',
  totalLessons: 120,
  lessonsPerWeek: 4,
  units: [
    {
      lessonStart: 1, lessonEnd: 12,
      topic: 'Numbers 1–10 & Counting',
      skills: ['number-recognition', 'counting-to-10', 'number-writing', 'one-to-one-correspondence'],
      mathConcepts: ['counting-objects', 'number-formation', 'number-order-1-10'],
    },
    {
      lessonStart: 13, lessonEnd: 24,
      topic: 'Comparing Numbers & Patterns',
      skills: ['comparing-numbers', 'more-less-equal', 'patterns', 'sorting'],
      mathConcepts: ['greater-than-less-than', 'AB-patterns', 'sorting-by-attribute'],
    },
    {
      lessonStart: 25, lessonEnd: 36,
      topic: 'Numbers 11–20 & Shapes',
      skills: ['counting-to-20', 'teen-numbers', 'shape-recognition', 'shape-attributes'],
      mathConcepts: ['place-value-intro', 'circle', 'square', 'triangle', 'rectangle'],
    },
    {
      lessonStart: 37, lessonEnd: 48,
      topic: 'Addition Concepts',
      skills: ['addition-intro', 'combining-groups', 'number-bonds', 'addition-within-5'],
      mathConcepts: ['addition-symbol', 'number-bonds-to-5', 'addition-stories'],
    },
    {
      lessonStart: 49, lessonEnd: 60,
      topic: 'Subtraction Concepts',
      skills: ['subtraction-intro', 'taking-away', 'subtraction-within-5', 'fact-families'],
      mathConcepts: ['subtraction-symbol', 'taking-apart', 'comparison-subtraction'],
    },
    {
      lessonStart: 61, lessonEnd: 72,
      topic: 'Addition & Subtraction Within 10',
      skills: ['addition-within-10', 'subtraction-within-10', 'number-sentences'],
      mathConcepts: ['number-bonds-to-10', 'missing-addend', 'fact-families-to-10'],
    },
    {
      lessonStart: 73, lessonEnd: 84,
      topic: 'Numbers to 50 & Skip Counting',
      skills: ['counting-to-50', 'skip-counting', 'number-line'],
      mathConcepts: ['skip-count-by-2', 'skip-count-by-5', 'skip-count-by-10', 'number-line-to-50'],
    },
    {
      lessonStart: 85, lessonEnd: 96,
      topic: 'Measurement & Data',
      skills: ['measurement-concepts', 'comparing-lengths', 'graphing-intro'],
      mathConcepts: ['longer-shorter', 'heavier-lighter', 'picture-graphs', 'tally-marks'],
    },
    {
      lessonStart: 97, lessonEnd: 108,
      topic: 'Numbers to 100 & Place Value',
      skills: ['counting-to-100', 'tens-and-ones', 'place-value'],
      mathConcepts: ['place-value-tens-ones', 'counting-by-tens-to-100', 'number-words'],
    },
    {
      lessonStart: 109, lessonEnd: 120,
      topic: 'Review & Math Fluency',
      skills: ['addition-fluency', 'subtraction-fluency', 'number-sense-review'],
      mathConcepts: ['review-all-K-concepts', 'math-facts-within-10'],
    },
  ],
}

// ── Math Level 1 ────────────────────────────────────────────────

const gatbMath1: CurriculumLevel = {
  name: 'The Good and the Beautiful Math',
  subject: 'Math',
  level: 'Level 1',
  gradeEquivalent: '1st Grade',
  totalLessons: 120,
  lessonsPerWeek: 4,
  units: [
    {
      lessonStart: 1, lessonEnd: 12,
      topic: 'Place Value & Number Sense to 120',
      skills: ['place-value', 'counting-to-120', 'number-patterns', 'comparing-numbers'],
      mathConcepts: ['tens-and-ones', 'hundred-chart', 'number-order-to-120', 'comparing-two-digit'],
    },
    {
      lessonStart: 13, lessonEnd: 24,
      topic: 'Addition Strategies',
      skills: ['addition-within-20', 'addition-strategies', 'doubles', 'near-doubles'],
      mathConcepts: ['counting-on', 'doubles-facts', 'making-ten', 'addition-properties'],
    },
    {
      lessonStart: 25, lessonEnd: 36,
      topic: 'Subtraction Strategies',
      skills: ['subtraction-within-20', 'subtraction-strategies', 'fact-families'],
      mathConcepts: ['counting-back', 'think-addition', 'related-facts', 'missing-numbers'],
    },
    {
      lessonStart: 37, lessonEnd: 48,
      topic: 'Two-Digit Addition (No Regrouping)',
      skills: ['two-digit-addition', 'mental-math', 'word-problems'],
      mathConcepts: ['adding-tens', 'adding-ones-then-tens', 'addition-word-problems'],
    },
    {
      lessonStart: 49, lessonEnd: 60,
      topic: 'Two-Digit Subtraction (No Regrouping)',
      skills: ['two-digit-subtraction', 'mental-math', 'word-problems'],
      mathConcepts: ['subtracting-tens', 'subtracting-ones-then-tens', 'subtraction-word-problems'],
    },
    {
      lessonStart: 61, lessonEnd: 72,
      topic: 'Geometry & Fractions Intro',
      skills: ['shapes-2d', 'shapes-3d', 'fractions-intro', 'spatial-reasoning'],
      mathConcepts: ['2d-shapes-attributes', '3d-shapes', 'halves', 'fourths', 'partitioning'],
    },
    {
      lessonStart: 73, lessonEnd: 84,
      topic: 'Measurement & Time',
      skills: ['measurement', 'telling-time', 'comparing-lengths'],
      mathConcepts: ['inches', 'centimeters', 'hour', 'half-hour', 'ordering-by-length'],
    },
    {
      lessonStart: 85, lessonEnd: 96,
      topic: 'Money & Data',
      skills: ['money-identification', 'coin-values', 'data-collection', 'graphing'],
      mathConcepts: ['penny', 'nickel', 'dime', 'quarter', 'bar-graphs', 'picture-graphs'],
    },
    {
      lessonStart: 97, lessonEnd: 108,
      topic: 'Addition & Subtraction with Regrouping Intro',
      skills: ['regrouping-intro', 'two-digit-addition-regrouping', 'problem-solving'],
      mathConcepts: ['regrouping-ones-to-tens', 'carrying', 'multi-step-word-problems'],
    },
    {
      lessonStart: 109, lessonEnd: 120,
      topic: 'Review & Math Fact Fluency',
      skills: ['fact-fluency', 'mental-math-review', 'problem-solving-review'],
      mathConcepts: ['review-all-level-1', 'timed-math-facts', 'mixed-operations'],
    },
  ],
}

// ── Math Level 2 ────────────────────────────────────────────────

const gatbMath2: CurriculumLevel = {
  name: 'The Good and the Beautiful Math',
  subject: 'Math',
  level: 'Level 2',
  gradeEquivalent: '2nd Grade',
  totalLessons: 120,
  lessonsPerWeek: 4,
  units: [
    {
      lessonStart: 1, lessonEnd: 12,
      topic: 'Place Value to 1,000',
      skills: ['place-value-hundreds', 'expanded-form', 'comparing-three-digit', 'skip-counting'],
      mathConcepts: ['hundreds-tens-ones', 'expanded-form', 'comparing-ordering-to-1000', 'skip-count-by-5-10-100'],
    },
    {
      lessonStart: 13, lessonEnd: 24,
      topic: 'Multi-Digit Addition',
      skills: ['addition-with-regrouping', 'three-digit-addition', 'estimation'],
      mathConcepts: ['regrouping-ones', 'regrouping-tens', 'adding-three-numbers', 'estimation-strategies'],
    },
    {
      lessonStart: 25, lessonEnd: 36,
      topic: 'Multi-Digit Subtraction',
      skills: ['subtraction-with-regrouping', 'three-digit-subtraction', 'checking-work'],
      mathConcepts: ['borrowing-ones', 'borrowing-tens', 'subtraction-across-zeros', 'inverse-operations'],
    },
    {
      lessonStart: 37, lessonEnd: 48,
      topic: 'Multiplication Introduction',
      skills: ['multiplication-concepts', 'equal-groups', 'arrays', 'repeated-addition'],
      mathConcepts: ['multiplication-as-groups', 'arrays', 'times-tables-2-5-10', 'multiplication-symbol'],
    },
    {
      lessonStart: 49, lessonEnd: 60,
      topic: 'Measurement & Units',
      skills: ['measurement-standard', 'measurement-metric', 'estimating-length'],
      mathConcepts: ['inches-feet-yards', 'centimeters-meters', 'measuring-to-nearest-unit', 'choosing-units'],
    },
    {
      lessonStart: 61, lessonEnd: 72,
      topic: 'Time & Money',
      skills: ['telling-time-5min', 'elapsed-time', 'counting-money', 'making-change'],
      mathConcepts: ['time-to-5-minutes', 'am-pm', 'dollar-sign', 'counting-coins-bills', 'making-change'],
    },
    {
      lessonStart: 73, lessonEnd: 84,
      topic: 'Fractions & Geometry',
      skills: ['fractions', 'geometry-2d', 'geometry-3d', 'area-intro'],
      mathConcepts: ['halves-thirds-fourths', 'fraction-of-set', 'polygon-names', 'faces-edges-vertices', 'area-with-squares'],
    },
    {
      lessonStart: 85, lessonEnd: 96,
      topic: 'Data, Graphs & Probability',
      skills: ['data-collection', 'graphing', 'probability-intro'],
      mathConcepts: ['bar-graphs', 'line-plots', 'pictographs', 'certain-impossible-likely'],
    },
    {
      lessonStart: 97, lessonEnd: 108,
      topic: 'Word Problems & Multi-Step Operations',
      skills: ['multi-step-problems', 'problem-solving-strategies', 'mental-math'],
      mathConcepts: ['two-step-word-problems', 'draw-a-picture', 'work-backwards', 'number-patterns'],
    },
    {
      lessonStart: 109, lessonEnd: 120,
      topic: 'Review & Assessment',
      skills: ['computation-fluency', 'concept-review', 'problem-solving-review'],
      mathConcepts: ['review-all-level-2', 'mixed-operations-review', 'math-facts-fluency'],
    },
  ],
}

// ── Exported map ────────────────────────────────────────────────

export const GATB_CURRICULUM: Record<string, CurriculumLevel> = {
  'gatb-la-k': gatbLaK,
  'gatb-la-1': gatbLa1,
  'gatb-la-2': gatbLa2,
  'gatb-math-k': gatbMathK,
  'gatb-math-1': gatbMath1,
  'gatb-math-2': gatbMath2,
}

// ── Helper: get progress for a given curriculum + lesson ────────

export function getGatbProgress(curriculumKey: string, currentLesson: number): {
  coveredSkills: string[]
  coveredPhonics: string[]
  currentUnit: CurriculumUnit | null
  upcomingUnits: CurriculumUnit[]
  percentComplete: number
} | null {
  const level = GATB_CURRICULUM[curriculumKey]
  if (!level) return null

  const coveredSkills: string[] = []
  const coveredPhonics: string[] = []
  let currentUnit: CurriculumUnit | null = null
  const upcomingUnits: CurriculumUnit[] = []

  for (const unit of level.units) {
    if (unit.lessonEnd < currentLesson) {
      coveredSkills.push(...unit.skills)
      if (unit.phonics) coveredPhonics.push(...unit.phonics)
    } else if (unit.lessonStart <= currentLesson && currentLesson <= unit.lessonEnd) {
      currentUnit = unit
      coveredSkills.push(...unit.skills)
      if (unit.phonics) coveredPhonics.push(...unit.phonics)
    } else {
      upcomingUnits.push(unit)
    }
  }

  const percentComplete = Math.round((currentLesson / level.totalLessons) * 100)

  return {
    coveredSkills: [...new Set(coveredSkills)],
    coveredPhonics: [...new Set(coveredPhonics)],
    currentUnit,
    upcomingUnits,
    percentComplete,
  }
}
