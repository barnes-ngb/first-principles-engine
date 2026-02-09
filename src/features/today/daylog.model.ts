import { DayBlockType, RoutineItemKey } from '../../core/types/enums'
import type {
  ChecklistItem,
  DayBlock,
  DayLog,
  MathRoutine,
  ReadingRoutine,
  SpeechRoutine,
} from '../../core/types/domain'

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

const buildBlocks = (blockTypes: DayBlockType[]): DayBlock[] =>
  blockTypes.map((type) => ({ type, title: blockLabel[type] }))

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
  }
}
