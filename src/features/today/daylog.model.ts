import { DayBlockLabel, DayBlockType, RoutineItemKey, SubjectBucket } from '../../core/types/enums'
import type { RoutineItemKey as RoutineItemKeyValue } from '../../core/types/enums'
import type {
  ChecklistItem,
  DayBlock,
  DayLog,
  MathRoutine,
  ReadingRoutine,
  SpeechRoutine,
} from '../../core/types/domain'

export { parseDateFromDocId } from '../../core/utils/docId'

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

/** Map block types to a natural default subject bucket where unambiguous. */
const defaultSubjectBucket: Partial<Record<DayBlockType, SubjectBucket>> = {
  [DayBlockType.Reading]: SubjectBucket.Reading,
  [DayBlockType.Math]: SubjectBucket.Math,
  [DayBlockType.Speech]: SubjectBucket.LanguageArts,
}

/** Default planned minutes per block type. Used when creating a new day log. */
export const DEFAULT_BLOCK_MINUTES: Record<DayBlockType, number> = {
  [DayBlockType.Formation]: 10,
  [DayBlockType.Reading]: 30,
  [DayBlockType.Math]: 20,
  [DayBlockType.Speech]: 10,
  [DayBlockType.Together]: 20,
  [DayBlockType.Movement]: 15,
  [DayBlockType.Project]: 30,
  [DayBlockType.FieldTrip]: 60,
  [DayBlockType.Other]: 15,
}

const buildBlocks = (blockTypes: DayBlockType[]): DayBlock[] =>
  blockTypes.map((type) => ({
    type,
    title: DayBlockLabel[type],
    plannedMinutes: DEFAULT_BLOCK_MINUTES[type],
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
    items.has(RoutineItemKey.ReadAloud) ||
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

// ─── Routine → Block minutes sync ───────────────────────────────────────────

const READING_ITEM_KEYS: RoutineItemKeyValue[] = [
  RoutineItemKey.Handwriting,
  RoutineItemKey.Spelling,
  RoutineItemKey.SightWords,
  RoutineItemKey.MinecraftReading,
  RoutineItemKey.ReadingEggs,
  RoutineItemKey.ReadAloud,
  RoutineItemKey.PhonemicAwareness,
  RoutineItemKey.PhonicsLesson,
  RoutineItemKey.DecodableReading,
  RoutineItemKey.SpellingDictation,
]

function isReadingDone(
  reading: ReadingRoutine | undefined,
  activeItems: Set<RoutineItemKeyValue>,
): boolean {
  if (!reading) return false
  const readingKeys = READING_ITEM_KEYS.filter((k) => activeItems.has(k))
  if (readingKeys.length === 0) return false
  return readingKeys.every((key) => {
    const item = reading[key as keyof ReadingRoutine]
    return item && typeof item === 'object' && 'done' in item && item.done
  })
}

function isRoutineDone(
  field: { done: boolean } | undefined,
): boolean {
  return field?.done ?? false
}

/**
 * Auto-fill `actualMinutes` on blocks based on routine done states.
 *
 * For each block whose type maps to a routine section (Reading, Math, Speech,
 * Formation, Together, Movement, Project), if the routine is done and the
 * block has no manually-set actualMinutes, set actualMinutes = plannedMinutes.
 *
 * When the routine is NOT done, clear actualMinutes only if it still equals
 * plannedMinutes (meaning the user hasn't manually edited it).
 */
export function autoFillBlockMinutes(
  dayLog: DayLog,
  activeRoutineItems?: RoutineItemKeyValue[],
): DayLog {
  const items = new Set(activeRoutineItems ?? ALL_ROUTINE_ITEMS)

  const blocks = dayLog.blocks.map((block) => {
    // Skip blocks that have checklists — those are handled by handleChecklistToggle
    if (block.checklist && block.checklist.length > 0) return block

    let done = false
    switch (block.type) {
      case DayBlockType.Reading:
        done = isReadingDone(dayLog.reading, items)
        break
      case DayBlockType.Math:
        done = isRoutineDone(dayLog.math)
        break
      case DayBlockType.Speech:
        done = isRoutineDone(dayLog.speech)
        break
      case DayBlockType.Formation:
        done = isRoutineDone(dayLog.formation)
        break
      case DayBlockType.Together:
        done = isRoutineDone(dayLog.together)
        break
      case DayBlockType.Movement:
        done = isRoutineDone(dayLog.movement)
        break
      case DayBlockType.Project:
        done = isRoutineDone(dayLog.project)
        break
      default:
        return block
    }

    const planned = block.plannedMinutes ?? DEFAULT_BLOCK_MINUTES[block.type]

    if (done) {
      if (block.actualMinutes == null || block.actualMinutes === 0) {
        return { ...block, actualMinutes: planned }
      }
    } else {
      // Clear auto-populated value only if it matches planned (not manually edited)
      if (block.actualMinutes != null && block.actualMinutes === planned) {
        return { ...block, actualMinutes: undefined }
      }
    }

    return block
  })

  return { ...dayLog, blocks }
}
