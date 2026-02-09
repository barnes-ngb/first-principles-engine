import { DayBlockType, RoutineItemKey, SubjectBucket } from '../../core/types/enums'
import type {
  ChecklistItem,
  DayBlock,
  DayLog,
  MathRoutine,
  ReadingRoutine,
  SpeechRoutine,
} from '../../core/types/domain'

// ─── DayLog document ID helpers ─────────────────────────────────────────────

/** Build the canonical DayLog document ID: `{date}_{childId}`. */
export const dayLogDocId = (date: string, childId: string): string =>
  `${date}_${childId}`

/**
 * Build the legacy document ID used before the per-child migration.
 * Format was `{childId}_{date}`.
 */
export const legacyDayLogDocId = (childId: string, date: string): string =>
  `${childId}_${date}`

/**
 * Extract the `date` portion from a DayLog document ID.
 * Handles both `{date}_{childId}` (new) and `{childId}_{date}` (legacy)
 * formats by checking which segment looks like a YYYY-MM-DD date.
 */
export const parseDateFromDocId = (docId: string): string => {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/
  // New format: date is the prefix (before first `_` that is followed by non-date)
  // e.g. "2026-02-09_abc123" → date is "2026-02-09"
  const prefix = docId.slice(0, 10)
  if (datePattern.test(prefix)) return prefix
  // Legacy format: date is the suffix after last `_`
  // e.g. "abc123_2026-02-09" → date is "2026-02-09"
  const suffix = docId.slice(-10)
  if (datePattern.test(suffix)) return suffix
  // Fallback — return the full ID (best effort)
  return docId
}

const defaultDayLogChecklistItems: ChecklistItem[] = []

/** All block types in default priority order. */
export const ALL_DAY_BLOCKS: DayBlockType[] = [
  DayBlockType.Formation,
  DayBlockType.Reading,
  DayBlockType.Speech,
  DayBlockType.Math,
  DayBlockType.Together,
  DayBlockType.Movement,
  DayBlockType.Project,
  DayBlockType.FieldTrip,
  DayBlockType.Other,
]

/** All routine items in default priority order. */
export const ALL_ROUTINE_ITEMS: RoutineItemKey[] = [
  RoutineItemKey.Handwriting,
  RoutineItemKey.Spelling,
  RoutineItemKey.SightWords,
  RoutineItemKey.MinecraftReading,
  RoutineItemKey.ReadingEggs,
  RoutineItemKey.Math,
  RoutineItemKey.Speech,
]

/** Human-readable label for each block type. */
const blockLabel: Record<DayBlockType, string> = {
  [DayBlockType.Formation]: 'Formation',
  [DayBlockType.Reading]: 'Reading',
  [DayBlockType.Speech]: 'Speech',
  [DayBlockType.Math]: 'Math',
  [DayBlockType.Together]: 'Together',
  [DayBlockType.Movement]: 'Movement',
  [DayBlockType.Project]: 'Project',
  [DayBlockType.FieldTrip]: 'Field Trip',
  [DayBlockType.Other]: 'Other',
}

/** Map block types to a natural default subject bucket where unambiguous. */
const defaultSubjectBucket: Partial<Record<DayBlockType, SubjectBucket>> = {
  [DayBlockType.Reading]: SubjectBucket.Reading,
  [DayBlockType.Math]: SubjectBucket.Math,
  [DayBlockType.Speech]: SubjectBucket.LanguageArts,
}

const buildBlocks = (blockTypes: DayBlockType[]): DayBlock[] =>
  blockTypes.map((type) => ({
    type,
    title: blockLabel[type],
    ...(defaultSubjectBucket[type] ? { subjectBucket: defaultSubjectBucket[type] } : {}),
  }))

const cloneChecklistItems = (
  items?: ChecklistItem[],
): ChecklistItem[] | undefined => {
  if (!items || items.length === 0) {
    return undefined
  }

  return items.map((item) => ({ ...item }))
}

export const emptyReadingRoutine = (): ReadingRoutine => ({
  handwriting: { done: false },
  spelling: { done: false },
  sightWords: { done: false },
  minecraft: { done: false },
  readingEggs: { done: false },
})

export const emptyMathRoutine = (): MathRoutine => ({
  done: false,
})

export const emptySpeechRoutine = (): SpeechRoutine => ({
  done: false,
})

export const createDefaultDayLog = (
  childId: string,
  date: string,
  dayBlocks?: DayBlockType[],
  routineItems?: RoutineItemKey[],
): DayLog => {
  const checklist = cloneChecklistItems(defaultDayLogChecklistItems)
  const blocks = buildBlocks(dayBlocks ?? ALL_DAY_BLOCKS)
  const items = new Set(routineItems ?? ALL_ROUTINE_ITEMS)

  const hasReading =
    items.has(RoutineItemKey.Handwriting) ||
    items.has(RoutineItemKey.Spelling) ||
    items.has(RoutineItemKey.SightWords) ||
    items.has(RoutineItemKey.MinecraftReading) ||
    items.has(RoutineItemKey.ReadingEggs) ||
    items.has(RoutineItemKey.PhonemicAwareness) ||
    items.has(RoutineItemKey.PhonicsLesson) ||
    items.has(RoutineItemKey.DecodableReading) ||
    items.has(RoutineItemKey.SpellingDictation)

  const hasMath =
    items.has(RoutineItemKey.Math) ||
    items.has(RoutineItemKey.NumberSenseOrFacts) ||
    items.has(RoutineItemKey.WordProblemsModeled)

  const hasSpeech =
    items.has(RoutineItemKey.Speech) ||
    items.has(RoutineItemKey.NarrationOrSoundReps)

  return {
    childId,
    date,
    blocks: blocks.map((block) => ({
      ...block,
      checklist: cloneChecklistItems(block.checklist),
    })),
    ...(hasReading ? { reading: emptyReadingRoutine() } : {}),
    ...(hasMath ? { math: emptyMathRoutine() } : {}),
    ...(hasSpeech ? { speech: emptySpeechRoutine() } : {}),
    ...(checklist ? { checklist } : {}),
    createdAt: new Date().toISOString(),
  }
}
