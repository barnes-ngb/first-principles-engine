export const CurriculumDomain = {
  Reading: 'reading',
  Math: 'math',
  Speech: 'speech',
  Writing: 'writing',
} as const
export type CurriculumDomain = (typeof CurriculumDomain)[keyof typeof CurriculumDomain]

export const SkillTier = {
  Foundation: 'foundation',
  Building: 'building',
  Developing: 'developing',
  Applying: 'applying',
  Extending: 'extending',
  Mastering: 'mastering',
} as const
export type SkillTier = (typeof SkillTier)[keyof typeof SkillTier]

export const SKILL_TIER_ORDER: SkillTier[] = [
  SkillTier.Foundation,
  SkillTier.Building,
  SkillTier.Developing,
  SkillTier.Applying,
  SkillTier.Extending,
  SkillTier.Mastering,
]

export interface CurriculumNode {
  id: string
  domain: CurriculumDomain
  label: string
  description: string
  tier: SkillTier
  dependencies: string[]
  assessmentTypes: string[]
  practiceIdeas: string[]
  linkedPrograms?: string[]
}

export interface CurriculumDomainMap {
  domain: CurriculumDomain
  label: string
  icon: string
  description: string
  nodes: CurriculumNode[]
}

// ── Reading Domain ────────────────────────────────────────────────

export const READING_MAP: CurriculumDomainMap = {
  domain: 'reading',
  label: 'Reading',
  icon: 'MenuBook',
  description: 'From letter sounds to critical reading',
  nodes: [
    // FOUNDATION
    {
      id: 'reading.phonics.letterSounds',
      domain: 'reading',
      label: 'Letter sounds',
      description: 'Knows the sound each letter makes',
      tier: 'foundation',
      dependencies: [],
      assessmentTypes: ['phonics'],
      practiceIdeas: ['Letter sound cards', 'Point to letters during reading', '"What sound does this make?" game'],
      linkedPrograms: ['reading-eggs'],
    },
    {
      id: 'reading.phonics.cvc',
      domain: 'reading',
      label: 'CVC words',
      description: 'Can read simple 3-letter words like cat, dog, sun',
      tier: 'foundation',
      dependencies: ['reading.phonics.letterSounds'],
      assessmentTypes: ['phonics'],
      practiceIdeas: ['CVC word family lists', 'Build words with letter tiles', 'Read simple decodable books'],
      linkedPrograms: ['reading-eggs'],
    },
    {
      id: 'reading.phonics.sightWords',
      domain: 'reading',
      label: 'Sight words',
      description: 'Recognizes common words instantly (the, was, said)',
      tier: 'foundation',
      dependencies: [],
      assessmentTypes: ['phonics'],
      practiceIdeas: ['Sight word flashcards', 'Spot sight words in books', 'Sight word bingo'],
      linkedPrograms: ['reading-eggs'],
    },
    // BUILDING
    {
      id: 'reading.phonics.blends',
      domain: 'reading',
      label: 'Blends',
      description: 'Can read words with consonant blends (bl, cr, st, fl)',
      tier: 'building',
      dependencies: ['reading.phonics.cvc'],
      assessmentTypes: ['phonics'],
      practiceIdeas: ['Blend word sorts', 'Spot blends in reading', 'Blend bingo'],
      linkedPrograms: ['reading-eggs'],
    },
    {
      id: 'reading.phonics.digraphs',
      domain: 'reading',
      label: 'Digraphs',
      description: 'Can read words with letter teams (sh, ch, th, wh)',
      tier: 'building',
      dependencies: ['reading.phonics.cvc'],
      assessmentTypes: ['phonics'],
      practiceIdeas: ['Digraph word hunts', 'Sort sh/ch/th words', 'Read digraph decodable readers'],
      linkedPrograms: ['reading-eggs'],
    },
    {
      id: 'reading.phonics.longVowels',
      domain: 'reading',
      label: 'Long vowels',
      description: 'Can read CVCe and vowel team words (cake, rain, boat)',
      tier: 'building',
      dependencies: ['reading.phonics.blends', 'reading.phonics.digraphs'],
      assessmentTypes: ['phonics'],
      practiceIdeas: ['Silent-e word sorts', 'Vowel team flashcards', 'Read leveled readers with long vowel patterns'],
      linkedPrograms: ['reading-eggs'],
    },
    {
      id: 'reading.phonics.rControlled',
      domain: 'reading',
      label: 'R-controlled vowels',
      description: 'Can read words where R changes the vowel (car, bird, corn)',
      tier: 'building',
      dependencies: ['reading.phonics.longVowels'],
      assessmentTypes: ['phonics'],
      practiceIdeas: ['Sort ar/er/ir/or/ur words', 'R-controlled word hunt in books'],
      linkedPrograms: ['reading-eggs'],
    },
    // DEVELOPING
    {
      id: 'reading.decoding.multisyllable',
      domain: 'reading',
      label: 'Multisyllable words',
      description: 'Can break apart and read words with 2+ syllables',
      tier: 'developing',
      dependencies: ['reading.phonics.longVowels', 'reading.phonics.rControlled'],
      assessmentTypes: ['comprehension'],
      practiceIdeas: ['Clap syllables in words', 'Cover and read word parts', 'Compound word building'],
    },
    {
      id: 'reading.fluency.accuracy',
      domain: 'reading',
      label: 'Reading accuracy',
      description: "Reads text with few errors \u2014 self-corrects when something doesn't sound right",
      tier: 'developing',
      dependencies: ['reading.phonics.digraphs', 'reading.phonics.longVowels'],
      assessmentTypes: ['fluency'],
      practiceIdeas: ['Repeated reading of same passage', 'Echo reading (parent reads, child repeats)', 'Audio-assisted reading'],
    },
    {
      id: 'reading.fluency.pace',
      domain: 'reading',
      label: 'Reading pace',
      description: 'Reads at a natural speed \u2014 not word-by-word choppy reading',
      tier: 'developing',
      dependencies: ['reading.fluency.accuracy'],
      assessmentTypes: ['fluency'],
      practiceIdeas: ['Timed repeated readings', 'Partner reading', 'Read along with audiobooks at 0.9x speed'],
    },
    {
      id: 'reading.fluency.expression',
      domain: 'reading',
      label: 'Expression',
      description: 'Reads with appropriate voice changes \u2014 questions sound like questions, excitement sounds excited',
      tier: 'developing',
      dependencies: ['reading.fluency.pace'],
      assessmentTypes: ['fluency'],
      practiceIdeas: ["Reader's theater scripts", 'Read dialogue with character voices', 'Record and listen to own reading'],
    },
    {
      id: 'reading.vocabulary.everyday',
      domain: 'reading',
      label: 'Everyday vocabulary',
      description: 'Understands grade-level words encountered in reading',
      tier: 'developing',
      dependencies: ['reading.phonics.sightWords'],
      assessmentTypes: ['comprehension'],
      practiceIdeas: ['Pre-teach 3 words before reading', 'Word of the day', 'Use new words in conversation'],
    },
    // APPLYING
    {
      id: 'reading.comprehension.explicit',
      domain: 'reading',
      label: 'Literal comprehension',
      description: 'Can answer questions when the answer is directly stated in the text',
      tier: 'applying',
      dependencies: ['reading.fluency.accuracy', 'reading.vocabulary.everyday'],
      assessmentTypes: ['comprehension'],
      practiceIdeas: ['Who/what/where/when questions after reading', 'Retell what happened in order', 'Find the sentence that answers the question'],
    },
    {
      id: 'reading.comprehension.inference',
      domain: 'reading',
      label: 'Inference',
      description: "Can figure out things the author didn't say directly \u2014 reading between the lines",
      tier: 'applying',
      dependencies: ['reading.comprehension.explicit'],
      assessmentTypes: ['comprehension'],
      practiceIdeas: ['Why do you think...? questions', 'How do you know? (find the clues)', 'Predict what happens next and explain why'],
    },
    {
      id: 'reading.comprehension.mainIdea',
      domain: 'reading',
      label: 'Main idea',
      description: 'Can identify what a passage is mostly about \u2014 not just details',
      tier: 'applying',
      dependencies: ['reading.comprehension.explicit'],
      assessmentTypes: ['comprehension'],
      practiceIdeas: ['One sentence summary after each page', '"If you had to tell London what this was about in one sentence..."', 'Title prediction'],
    },
    {
      id: 'reading.vocabulary.wordParts',
      domain: 'reading',
      label: 'Word parts',
      description: 'Uses prefixes, suffixes, and roots to figure out new words (un-, re-, -able, -tion)',
      tier: 'applying',
      dependencies: ['reading.vocabulary.everyday', 'reading.decoding.multisyllable'],
      assessmentTypes: ['comprehension'],
      practiceIdeas: ['Prefix/suffix of the week', 'Word building with roots', '"What does un- do to happy?"'],
    },
    {
      id: 'reading.vocabulary.contextClues',
      domain: 'reading',
      label: 'Context clues',
      description: 'Can figure out what a new word means from the words around it',
      tier: 'applying',
      dependencies: ['reading.vocabulary.everyday', 'reading.comprehension.explicit'],
      assessmentTypes: ['comprehension'],
      practiceIdeas: ['Cover a word, guess from context, then check', 'Highlight unknown words, guess before looking up', 'Detective game: find clues in the sentence'],
    },
    // EXTENDING
    {
      id: 'reading.comprehension.analysis',
      domain: 'reading',
      label: 'Text analysis',
      description: "Can compare texts, identify author's purpose, distinguish fact from opinion",
      tier: 'extending',
      dependencies: ['reading.comprehension.inference', 'reading.comprehension.mainIdea'],
      assessmentTypes: ['comprehension'],
      practiceIdeas: ['Compare two books on same topic', 'Why did the author write this?', 'Is this a fact or what someone thinks?'],
    },
    {
      id: 'reading.independent.choice',
      domain: 'reading',
      label: 'Independent reading',
      description: 'Chooses to read for pleasure \u2014 picks books, sustains reading for 15+ minutes',
      tier: 'extending',
      dependencies: ['reading.fluency.pace', 'reading.comprehension.explicit'],
      assessmentTypes: [],
      practiceIdeas: ['Daily silent reading time', 'Book choice freedom', 'Reading nook setup', 'Library visits'],
    },
    // MASTERING
    {
      id: 'reading.critical.evaluate',
      domain: 'reading',
      label: 'Critical reading',
      description: 'Evaluates arguments, identifies bias, questions sources',
      tier: 'mastering',
      dependencies: ['reading.comprehension.analysis'],
      assessmentTypes: [],
      practiceIdeas: ['Discuss news articles together', 'Compare different accounts of same event', '"Do you agree with the author? Why?"'],
    },
  ],
}


// ── Math Domain ───────────────────────────────────────────────────

export const MATH_MAP: CurriculumDomainMap = {
  domain: 'math',
  label: 'Math',
  icon: 'Calculate',
  description: 'From counting to algebraic thinking',
  nodes: [
    // FOUNDATION
    { id: 'math.number.counting', domain: 'math', label: 'Counting', description: 'Counts objects accurately, understands one-to-one correspondence', tier: 'foundation', dependencies: [], assessmentTypes: ['math'], practiceIdeas: ['Count objects around the house', 'Skip counting songs', 'Count by 2s, 5s, 10s'] },
    { id: 'math.number.placeValue', domain: 'math', label: 'Place value', description: 'Understands ones, tens, hundreds \u2014 what each digit represents', tier: 'foundation', dependencies: ['math.number.counting'], assessmentTypes: ['math'], practiceIdeas: ['Base-10 blocks', 'Expanded form writing', 'Place value dice games'] },
    { id: 'math.number.comparison', domain: 'math', label: 'Comparing numbers', description: 'Can compare and order numbers, understands greater than / less than', tier: 'foundation', dependencies: ['math.number.placeValue'], assessmentTypes: ['math'], practiceIdeas: ['Number line activities', 'War card game', 'Greater than/less than alligator'] },
    // BUILDING
    { id: 'math.operations.addSub', domain: 'math', label: 'Addition & subtraction', description: 'Adds and subtracts within 100 with understanding', tier: 'building', dependencies: ['math.number.placeValue'], assessmentTypes: ['math'], practiceIdeas: ['Math fact practice (5 min daily)', 'Word problems from real life', 'Number bonds'] },
    { id: 'math.operations.multDiv', domain: 'math', label: 'Multiplication & division', description: 'Understands multiplication as groups, knows basic facts', tier: 'building', dependencies: ['math.operations.addSub'], assessmentTypes: ['math'], practiceIdeas: ['Skip counting to multiply', 'Array drawing', 'Real-world grouping problems', 'Times tables practice'] },
    { id: 'math.measurement.length', domain: 'math', label: 'Measurement', description: 'Measures with rulers, understands inches/centimeters, compares lengths', tier: 'building', dependencies: ['math.number.comparison'], assessmentTypes: ['math'], practiceIdeas: ['Measure things around the house', 'Cooking measurements', 'Dad Lab: build and measure'] },
    { id: 'math.geometry.shapes', domain: 'math', label: 'Shapes & geometry', description: 'Identifies and describes 2D and 3D shapes, understands properties', tier: 'building', dependencies: ['math.number.counting'], assessmentTypes: ['math'], practiceIdeas: ['Shape hunts', 'Build 3D shapes with toothpicks', 'Minecraft architecture geometry'] },
    // DEVELOPING
    { id: 'math.operations.multiDigit', domain: 'math', label: 'Multi-digit operations', description: 'Adds, subtracts, multiplies with larger numbers using strategies', tier: 'developing', dependencies: ['math.operations.multDiv', 'math.number.placeValue'], assessmentTypes: ['math'], practiceIdeas: ['Column addition/subtraction', 'Estimation before calculating', 'Real-world multi-step problems'] },
    { id: 'math.fractions.concepts', domain: 'math', label: 'Fraction concepts', description: 'Understands fractions as parts of a whole, can compare simple fractions', tier: 'developing', dependencies: ['math.operations.multDiv'], assessmentTypes: ['math'], practiceIdeas: ['Pizza/pie cutting', 'Fraction bars', 'Cooking with fractions (half cup, quarter teaspoon)'] },
    { id: 'math.measurement.time', domain: 'math', label: 'Time & money', description: 'Tells time, counts money, solves elapsed time problems', tier: 'developing', dependencies: ['math.operations.addSub'], assessmentTypes: ['math'], practiceIdeas: ['Clock reading practice', 'Barnes Bros: counting earnings', 'Schedule reading'] },
    { id: 'math.data.graphs', domain: 'math', label: 'Data & graphs', description: 'Reads and creates simple bar graphs, line plots, tables', tier: 'developing', dependencies: ['math.number.comparison'], assessmentTypes: ['math'], practiceIdeas: ['Graph favorite things', 'Read graphs in news/books', 'Minecraft inventory tracking'] },
    // APPLYING
    { id: 'math.fractions.operations', domain: 'math', label: 'Fraction operations', description: 'Adds, subtracts, multiplies fractions and mixed numbers', tier: 'applying', dependencies: ['math.fractions.concepts', 'math.operations.multiDigit'], assessmentTypes: ['math'], practiceIdeas: ['Recipe doubling/halving', 'Fraction number lines', 'Real-world fraction problems'] },
    { id: 'math.decimals', domain: 'math', label: 'Decimals & percents', description: 'Understands decimal notation, converts between fractions/decimals/percents', tier: 'applying', dependencies: ['math.fractions.concepts', 'math.number.placeValue'], assessmentTypes: ['math'], practiceIdeas: ['Money as decimals', 'Sports statistics', 'Barnes Bros: pricing and discounts'] },
    { id: 'math.problemSolving', domain: 'math', label: 'Problem solving', description: 'Solves multi-step word problems, identifies relevant information', tier: 'applying', dependencies: ['math.operations.multiDigit'], assessmentTypes: ['math'], practiceIdeas: ['Daily word problem', 'Write your own word problems', 'Dad Lab: engineering math'] },
    // EXTENDING
    { id: 'math.algebra.patterns', domain: 'math', label: 'Patterns & algebra', description: 'Identifies patterns, uses variables, solves simple equations', tier: 'extending', dependencies: ['math.operations.multiDigit', 'math.problemSolving'], assessmentTypes: ['math'], practiceIdeas: ['Pattern recognition games', 'Find the rule', 'Simple equations with unknowns'] },
    { id: 'math.geometry.area', domain: 'math', label: 'Area & perimeter', description: 'Calculates area and perimeter, understands square units', tier: 'extending', dependencies: ['math.measurement.length', 'math.operations.multDiv'], assessmentTypes: ['math'], practiceIdeas: ['Measure rooms at home', 'Minecraft building area', 'Garden planning'] },
  ],
}

// ── Speech Domain ─────────────────────────────────────────────────

export const SPEECH_MAP: CurriculumDomainMap = {
  domain: 'speech',
  label: 'Speech',
  icon: 'RecordVoiceOver',
  description: 'From individual sounds to confident communication',
  nodes: [
    // FOUNDATION
    { id: 'speech.sounds.early', domain: 'speech', label: 'Early sounds', description: 'Produces early-developing sounds clearly (m, b, p, d, t, n, h, w)', tier: 'foundation', dependencies: [], assessmentTypes: ['speech'], practiceIdeas: ['Repeat words with these sounds', 'Sound matching games'] },
    { id: 'speech.sounds.middle', domain: 'speech', label: 'Middle sounds', description: 'Produces mid-developing sounds clearly (k, g, f, v, ng)', tier: 'foundation', dependencies: [], assessmentTypes: ['speech'], practiceIdeas: ['Word lists by sound', 'Tongue placement practice'] },
    // BUILDING
    { id: 'speech.sounds.late', domain: 'speech', label: 'Late sounds', description: 'Produces late-developing sounds clearly (r, l, s, z, sh, ch, j, th)', tier: 'building', dependencies: ['speech.sounds.early', 'speech.sounds.middle'], assessmentTypes: ['speech'], practiceIdeas: ['Mirror practice', 'Sound in all positions (start/middle/end)', 'Minimal pairs (right/light, ship/chip)'] },
    { id: 'speech.blends.spoken', domain: 'speech', label: 'Spoken blends', description: 'Produces consonant clusters clearly in speech (str, spl, scr)', tier: 'building', dependencies: ['speech.sounds.late'], assessmentTypes: ['speech'], practiceIdeas: ['Blend word lists', 'Tongue twisters (slowly)', 'Record and listen back'] },
    { id: 'speech.sequencing', domain: 'speech', label: 'Sound sequencing', description: 'Says sounds in the right order \u2014 doesn\'t switch them (says "spaghetti" not "pasketti")', tier: 'building', dependencies: ['speech.sounds.late'], assessmentTypes: ['speech'], practiceIdeas: ['Practice multisyllable words slowly', 'Clap syllables then say', 'Common switched-word practice list'] },
    // DEVELOPING
    { id: 'speech.connected', domain: 'speech', label: 'Connected speech', description: 'Sounds are clear even in full sentences and conversation, not just single words', tier: 'developing', dependencies: ['speech.blends.spoken', 'speech.sequencing'], assessmentTypes: ['speech'], practiceIdeas: ['Conversation practice with feedback', 'Story retelling', 'Record natural conversation and review'] },
    { id: 'speech.intelligibility', domain: 'speech', label: 'Intelligibility', description: 'Unfamiliar listeners can understand most of what is said', tier: 'developing', dependencies: ['speech.connected'], assessmentTypes: ['speech'], practiceIdeas: ['Practice with unfamiliar adults', 'Phone calls to grandparents', 'Order at restaurants'] },
    // APPLYING
    { id: 'speech.narrative', domain: 'speech', label: 'Narrative speech', description: 'Can tell a story or explain something in order with enough detail to be understood', tier: 'applying', dependencies: ['speech.intelligibility'], assessmentTypes: ['speech'], practiceIdeas: ['Tell about your day in order', 'Retell a book or movie plot', 'Teach someone how to do something'] },
    { id: 'speech.pragmatics', domain: 'speech', label: 'Social communication', description: 'Takes turns in conversation, stays on topic, adjusts speech for audience', tier: 'applying', dependencies: ['speech.intelligibility'], assessmentTypes: ['speech'], practiceIdeas: ['Conversation practice games', 'Role-play different social situations', 'Practice asking follow-up questions'] },
    // EXTENDING
    { id: 'speech.confidence', domain: 'speech', label: 'Confident communication', description: 'Speaks up in groups, explains thinking clearly, advocates for self', tier: 'extending', dependencies: ['speech.narrative', 'speech.pragmatics'], assessmentTypes: [], practiceIdeas: ['Present a project to the family', 'Teach-back sessions', 'Order for yourself at stores and restaurants'] },
  ],
}

// ── Writing Domain ────────────────────────────────────────────────

export const WRITING_MAP: CurriculumDomainMap = {
  domain: 'writing',
  label: 'Writing',
  icon: 'Edit',
  description: 'From letter formation to creative expression',
  nodes: [
    // FOUNDATION
    { id: 'writing.mechanics.letterFormation', domain: 'writing', label: 'Letter formation', description: 'Forms uppercase and lowercase letters legibly', tier: 'foundation', dependencies: [], assessmentTypes: ['writing'], practiceIdeas: ['Tracing practice', 'Sand/salt tray writing', 'Large motor writing (whiteboard, sidewalk chalk)'] },
    { id: 'writing.mechanics.spacing', domain: 'writing', label: 'Word spacing', description: 'Leaves clear spaces between words', tier: 'foundation', dependencies: ['writing.mechanics.letterFormation'], assessmentTypes: ['writing'], practiceIdeas: ['Finger spacing', 'Popsicle stick spacer', 'Copy short sentences with good spacing'] },
    // BUILDING
    { id: 'writing.mechanics.spelling', domain: 'writing', label: 'Phonetic spelling', description: 'Spells words by sounding them out \u2014 readable even if not conventional', tier: 'building', dependencies: ['writing.mechanics.letterFormation'], assessmentTypes: ['writing'], practiceIdeas: ['Invented spelling journal', 'Sound it out together', 'Word family spelling'] },
    { id: 'writing.mechanics.capitalization', domain: 'writing', label: 'Capitalization & punctuation', description: 'Uses capital letters at starts of sentences and periods at ends', tier: 'building', dependencies: ['writing.mechanics.spacing'], assessmentTypes: ['writing'], practiceIdeas: ['Edit sentences for capitals and periods', 'Punctuation scavenger hunt in books', 'Dictation practice'] },
    { id: 'writing.composition.sentence', domain: 'writing', label: 'Complete sentences', description: 'Writes complete thoughts with a subject and verb', tier: 'building', dependencies: ['writing.mechanics.spacing'], assessmentTypes: ['writing'], practiceIdeas: ['Sentence starters', 'Fix the fragment game', 'Expand a word into a sentence'] },
    // DEVELOPING
    { id: 'writing.mechanics.conventionalSpelling', domain: 'writing', label: 'Conventional spelling', description: 'Spells common words correctly, uses spelling patterns', tier: 'developing', dependencies: ['writing.mechanics.spelling'], assessmentTypes: ['writing'], practiceIdeas: ['Personal word wall', 'Look-say-cover-write-check', 'Spelling patterns study'] },
    { id: 'writing.composition.paragraph', domain: 'writing', label: 'Paragraphs', description: 'Groups related sentences together with a topic sentence', tier: 'developing', dependencies: ['writing.composition.sentence', 'writing.mechanics.capitalization'], assessmentTypes: ['writing'], practiceIdeas: ['Hamburger paragraph model', 'Topic sentence practice', 'Paragraph building from bullet points'] },
    { id: 'writing.composition.narrative', domain: 'writing', label: 'Story writing', description: 'Writes stories with a beginning, middle, and end', tier: 'developing', dependencies: ['writing.composition.sentence'], assessmentTypes: ['writing'], practiceIdeas: ['Story maps before writing', 'Add dialogue to stories', 'Write book sequels or fan fiction'] },
    // APPLYING
    { id: 'writing.composition.informational', domain: 'writing', label: 'Informational writing', description: 'Writes to explain or inform \u2014 uses facts, examples, and organization', tier: 'applying', dependencies: ['writing.composition.paragraph'], assessmentTypes: ['writing'], practiceIdeas: ['How-to writing', 'Animal/topic reports', 'Write instructions for a game'] },
    { id: 'writing.composition.opinion', domain: 'writing', label: 'Opinion writing', description: 'States an opinion and supports it with reasons', tier: 'applying', dependencies: ['writing.composition.paragraph'], assessmentTypes: ['writing'], practiceIdeas: ['Persuasive letters', 'Book reviews', 'Would you rather... with reasons'] },
    { id: 'writing.process.revision', domain: 'writing', label: 'Revision', description: 'Re-reads own writing and makes it better \u2014 adds detail, fixes unclear parts', tier: 'applying', dependencies: ['writing.composition.paragraph'], assessmentTypes: ['writing'], practiceIdeas: ['Read aloud to catch errors', 'Peer editing with parent', 'Revision checklist'] },
    // EXTENDING
    { id: 'writing.composition.voice', domain: 'writing', label: "Writer's voice", description: 'Writing has personality and style \u2014 sounds like the writer, not a template', tier: 'extending', dependencies: ['writing.composition.narrative', 'writing.composition.opinion'], assessmentTypes: [], practiceIdeas: ['Free writing journals', 'Write in different moods', 'Compare own style to favorite authors'] },
    { id: 'writing.composition.research', domain: 'writing', label: 'Research writing', description: 'Gathers information from sources and writes about findings in own words', tier: 'extending', dependencies: ['writing.composition.informational', 'writing.process.revision'], assessmentTypes: [], practiceIdeas: ['Mini research projects', 'Source comparison', 'Note-taking before writing'] },
  ],
}

// ── Combined Maps & Helpers ───────────────────────────────────────

export const CURRICULUM_MAPS: CurriculumDomainMap[] = [
  READING_MAP,
  MATH_MAP,
  SPEECH_MAP,
  WRITING_MAP,
]

/** Flat lookup of all curriculum nodes by ID */
export const CURRICULUM_NODE_MAP: Record<string, CurriculumNode> = Object.fromEntries(
  CURRICULUM_MAPS.flatMap((m) => m.nodes).map((n) => [n.id, n]),
)

/** Get all nodes for a domain */
export function getNodesForDomain(domain: CurriculumDomain): CurriculumNode[] {
  return CURRICULUM_MAPS.find((m) => m.domain === domain)?.nodes ?? []
}

/** Get all nodes at a specific tier within a domain */
export function getNodesForTier(domain: CurriculumDomain, tier: SkillTier): CurriculumNode[] {
  return getNodesForDomain(domain).filter((n) => n.tier === tier)
}

/** Get immediate dependents of a node (nodes that depend on it) */
export function getDependents(nodeId: string): CurriculumNode[] {
  return CURRICULUM_MAPS.flatMap((m) => m.nodes).filter((n) => n.dependencies.includes(nodeId))
}
