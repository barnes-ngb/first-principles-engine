import type { DayBlock } from '../types'
import type { DayBlockType, SubjectBucket } from '../types/enums'

// ─── MO Required Subjects ────────────────────────────────────────────────────
//
// Missouri requires homeschool instruction in five core subjects:
//   Reading, Language Arts, Math, Science, Social Studies
//
// These map 1:1 to our SubjectBucket values (excluding 'Other').
// This utility infers subject tags from block type + content so the
// hours report covers all five subjects without manual tagging.

export const MO_REQUIRED_SUBJECTS: readonly SubjectBucket[] = [
  'Reading',
  'LanguageArts',
  'Math',
  'Science',
  'SocialStudies',
] as const

// ─── Block-type defaults ─────────────────────────────────────────────────────

/** Default subject for each block type (null = needs content-based inference). */
const BLOCK_TYPE_DEFAULTS: Partial<Record<DayBlockType, SubjectBucket>> = {
  Reading: 'Reading',
  Math: 'Math',
  Speech: 'LanguageArts',
}

// ─── Keyword sets for content-based inference ────────────────────────────────

const CIVIC_HISTORICAL_KEYWORDS = [
  'civic',
  'civics',
  'history',
  'historical',
  'government',
  'constitution',
  'president',
  'founding father',
  'patriot',
  'liberty',
  'democracy',
  'election',
  'citizen',
  'citizenship',
  'rights',
  'revolution',
  'colonial',
  'colony',
  'declaration',
  'amendment',
  'pledge',
  'nation',
  'voting',
  'law',
  'veteran',
]

const GEOGRAPHY_COMMUNITY_KEYWORDS = [
  'geography',
  'map',
  'maps',
  'globe',
  'continent',
  'ocean',
  'community',
  'neighborhood',
  'culture',
  'tradition',
  'social studies',
  'society',
  'diversity',
  'state',
  'capital',
]

const SCIENCE_KEYWORDS = [
  'nature',
  'nature journal',
  'science',
  'experiment',
  'observe',
  'observation',
  'plant',
  'animal',
  'weather',
  'season',
  'habitat',
  'ecosystem',
  'biology',
  'chemistry',
  'physics',
  'insect',
  'bird',
  'tree',
  'flower',
  'rock',
  'mineral',
  'fossil',
  'dinosaur',
  'space',
  'planet',
  'star',
  'moon',
  'solar system',
  'water cycle',
  'magnet',
  'force',
  'energy',
  'life cycle',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function combineText(title?: string, notes?: string): string {
  return `${title ?? ''} ${notes ?? ''}`.toLowerCase()
}

function matchesAny(text: string, keywords: readonly string[]): boolean {
  const lower = text.toLowerCase()
  return keywords.some((kw) => lower.includes(kw))
}

function isReadAloud(blockType: DayBlockType, title?: string): boolean {
  if (blockType === 'Reading') return true
  const t = (title ?? '').toLowerCase()
  return t.includes('read aloud') || t.includes('read-aloud')
}

function isNatureJournal(title?: string, notes?: string): boolean {
  const text = combineText(title, notes)
  return text.includes('nature journal') || text.includes('nature log')
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface BlockInput {
  blockType: DayBlockType
  title?: string
  notes?: string
  subjectBucket?: SubjectBucket
}

/**
 * Infer all applicable MO subjects for a single activity block.
 *
 * Rules:
 * - If `subjectBucket` is already set to a core subject, respect it
 *   (and add LanguageArts for read-alouds tagged as Reading).
 * - Reading blocks and read-aloud sessions → Reading + LanguageArts.
 * - Math blocks → Math.
 * - Speech blocks → LanguageArts.
 * - Formation blocks with civic/historical content → SocialStudies.
 * - Theme weeks with geography/community topics → SocialStudies.
 * - Nature journal blocks → Science.
 * - Other content scanned for science / social-studies keywords.
 *
 * Returns at least one SubjectBucket. Falls back to 'Other' when nothing matches.
 */
export function inferMoSubjects(input: BlockInput): SubjectBucket[] {
  const { blockType, title, notes, subjectBucket } = input
  const subjects = new Set<SubjectBucket>()

  // 1. Respect an explicit core tag
  if (subjectBucket && subjectBucket !== 'Other') {
    subjects.add(subjectBucket)
    // Read-alouds tagged Reading also count as LanguageArts
    if (subjectBucket === 'Reading' && isReadAloud(blockType, title)) {
      subjects.add('LanguageArts')
    }
    return [...subjects]
  }

  // 2. Block-type default
  const defaultSubject = BLOCK_TYPE_DEFAULTS[blockType]
  if (defaultSubject) {
    subjects.add(defaultSubject)
  }

  // 3. Read-aloud → Reading + LanguageArts
  if (isReadAloud(blockType, title)) {
    subjects.add('Reading')
    subjects.add('LanguageArts')
  }

  // 4. Content-based inference
  const text = combineText(title, notes)

  // Formation with civic/historical/geography content → SocialStudies
  if (
    blockType === 'Formation' &&
    (matchesAny(text, CIVIC_HISTORICAL_KEYWORDS) ||
      matchesAny(text, GEOGRAPHY_COMMUNITY_KEYWORDS))
  ) {
    subjects.add('SocialStudies')
  }

  // Geography/community topics (any block) → SocialStudies
  if (
    blockType !== 'Formation' &&
    (matchesAny(text, CIVIC_HISTORICAL_KEYWORDS) ||
      matchesAny(text, GEOGRAPHY_COMMUNITY_KEYWORDS))
  ) {
    subjects.add('SocialStudies')
  }

  // Nature journal → Science
  if (isNatureJournal(title, notes)) {
    subjects.add('Science')
  }

  // Other science keywords (skip Reading/Math blocks to avoid false positives)
  if (
    blockType !== 'Reading' &&
    blockType !== 'Math' &&
    !isNatureJournal(title, notes) &&
    matchesAny(text, SCIENCE_KEYWORDS)
  ) {
    subjects.add('Science')
  }

  return subjects.size > 0 ? [...subjects] : ['Other']
}

/**
 * Resolve a single primary SubjectBucket for a block.
 * Used for hours reporting where each minute maps to exactly one subject.
 *
 * Priority: explicit tag > block-type default > content inference > 'Other'.
 */
export function resolveSubjectBucket(input: BlockInput): SubjectBucket {
  if (input.subjectBucket && input.subjectBucket !== 'Other') {
    return input.subjectBucket
  }
  const inferred = inferMoSubjects(input)
  return inferred[0]
}

/**
 * Infer MO subjects from a week theme string.
 *
 * Useful for tagging Together/Project/FieldTrip blocks that inherit
 * their theme week's topic when they have no explicit subject tag.
 */
export function inferThemeSubjects(theme: string): SubjectBucket[] {
  const subjects = new Set<SubjectBucket>()
  const lower = theme.toLowerCase()

  if (matchesAny(lower, CIVIC_HISTORICAL_KEYWORDS) || matchesAny(lower, GEOGRAPHY_COMMUNITY_KEYWORDS)) {
    subjects.add('SocialStudies')
  }
  if (matchesAny(lower, SCIENCE_KEYWORDS)) {
    subjects.add('Science')
  }

  return [...subjects]
}

/**
 * Auto-tag every block in a list, returning the inferred subjects per block.
 *
 * This is a convenience wrapper for mapping over blocks in a DayLog.
 * The optional `weekTheme` parameter allows theme-based inference to kick in
 * for blocks that would otherwise resolve to 'Other'.
 */
export function autoTagBlocks(
  blocks: readonly DayBlock[],
  weekTheme?: string,
): Array<{ blockIndex: number; subjects: SubjectBucket[] }> {
  const themeSubjects = weekTheme ? inferThemeSubjects(weekTheme) : []

  return blocks.map((block, blockIndex) => {
    const input: BlockInput = {
      blockType: block.type,
      title: block.title,
      notes: block.notes,
      subjectBucket: block.subjectBucket,
    }
    let subjects = inferMoSubjects(input)

    // If we got 'Other' and the theme implies a subject, use theme subjects
    if (
      subjects.length === 1 &&
      subjects[0] === 'Other' &&
      themeSubjects.length > 0
    ) {
      subjects = themeSubjects
    }

    return { blockIndex, subjects }
  })
}
