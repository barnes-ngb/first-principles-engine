/**
 * Maps AI-generated finding skill tags to curriculum node IDs.
 *
 * Finding tags come from quest/evaluation sessions (e.g. "phonics.cvc.short-o",
 * "math.addition.within-20", "speech.articulation.r.initial").
 * Curriculum nodes use a different hierarchy (e.g. "reading.phonics.cvc",
 * "math.operations.addSub", "speech.sounds.late").
 *
 * This module bridges the two with exact matches, prefix matches, and keyword fallbacks.
 */

import { CURRICULUM_MAPS, CURRICULUM_NODE_MAP } from './curriculumMap'

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
  'reading.vocabulary.contextclues': 'reading.vocabulary.contextClues',
  'reading.vocabulary.wordparts': 'reading.vocabulary.wordParts',
  'reading.vocabulary.synonymsantonyms': 'reading.vocabulary.everyday',
  'reading.fluency': 'reading.fluency.accuracy',

  // ── Math ────────────────────────────────────────────────
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
 * Normalize a finding tag for lookup:
 * - lowercase
 * - strip spaces, hyphens, underscores between segments
 * - collapse dots
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
  // Reading
  if (norm.includes('cvc') || /short[aeiou]/.test(norm)) return 'reading.phonics.cvc'
  if (norm.includes('blend')) return 'reading.phonics.blends'
  if (norm.includes('digraph')) return 'reading.phonics.digraphs'
  if (norm.includes('longvowel') || norm.includes('cvce') || norm.includes('vowelteam')) return 'reading.phonics.longVowels'
  if (norm.includes('rcontrolled')) return 'reading.phonics.rControlled'
  if (norm.includes('sightword')) return 'reading.phonics.sightWords'
  if (norm.includes('lettersound')) return 'reading.phonics.letterSounds'
  if (norm.includes('rhym')) return 'reading.phonics.cvc'
  if (norm.includes('vocabulary') || norm.includes('contextclue')) return 'reading.vocabulary.contextClues'
  if (norm.includes('comprehension') || norm.includes('mainidea')) return 'reading.comprehension.explicit'
  if (norm.includes('inference')) return 'reading.comprehension.inference'
  if (norm.includes('fluency')) return 'reading.fluency.accuracy'
  if (norm.includes('multisyllab')) return 'reading.decoding.multisyllable'

  // Math
  if (norm.includes('placevalue')) return 'math.number.placeValue'
  if (norm.includes('counting') || norm.includes('skipcount')) return 'math.number.counting'
  if (norm.includes('addition') || norm.includes('subtraction')) return 'math.operations.addSub'
  if (norm.includes('multipl') || norm.includes('divis') || norm.includes('times') || norm.includes('tables')) return 'math.operations.multDiv'
  if (norm.includes('fraction')) return 'math.fractions.concepts'
  if (norm.includes('measur')) return 'math.measurement.length'
  if (norm.includes('geometry') || norm.includes('shape')) return 'math.geometry.shapes'
  if (norm.includes('time') || norm.includes('money') || norm.includes('clock')) return 'math.measurement.time'
  if (norm.includes('twodigit') || norm.includes('multidigit')) return 'math.operations.multiDigit'
  if (norm.includes('decimal') || norm.includes('percent')) return 'math.decimals'
  if (norm.includes('pattern') || norm.includes('algebra')) return 'math.algebra.patterns'
  if (norm.includes('area') || norm.includes('perimeter')) return 'math.geometry.area'
  if (norm.includes('wordproblem') || norm.includes('problemsolv')) return 'math.problemSolving'
  if (norm.includes('graph') || norm.includes('data')) return 'math.data.graphs'

  // Speech
  if (norm.includes('articulation') || norm.includes('speech.sounds')) return 'speech.sounds.late'
  if (norm.includes('metathesis')) return 'speech.sequencing'
  if (norm.includes('connectedspeech') || norm.includes('intelligib')) return 'speech.connected'

  // Writing
  if (norm.includes('spelling')) return 'writing.mechanics.spelling'
  if (norm.includes('sentence')) return 'writing.composition.sentence'
  if (norm.includes('paragraph')) return 'writing.composition.paragraph'

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
