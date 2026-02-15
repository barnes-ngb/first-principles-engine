import { DayBlockType, RoutineItemKey } from '../../core/types/enums'
import type { DayBlockType as DayBlockTypeValue, RoutineItemKey as RoutineItemKeyValue } from '../../core/types/enums'

export interface DailyPlanTemplate {
  /** Display name for the template */
  label: string
  /** Block types in priority order */
  dayBlocks: DayBlockTypeValue[]
  /** Routine items this child logs */
  routineItems: RoutineItemKeyValue[]
  /** Per-block instructions to show on Dashboard */
  blockInstructions: Partial<Record<DayBlockTypeValue, string[]>>
  /** Minimum Viable Day: the smallest set of items that count as a real day */
  minimumViableDay: string[]
}

/**
 * Lincoln's daily routine template.
 *
 * Reading & Literacy:
 *   Handwriting (+1 XP), Spelling word (+1 XP), Sight words (+1 XP),
 *   Minecraft book reading (+2 XP), Reading Eggs (+1 XP)
 * Math:
 *   Hand math (+2 XP)
 * Speech:
 *   Sentence routine 2-5 min (+1 XP)
 */
export const lincolnTemplate: DailyPlanTemplate = {
  label: 'Lincoln',
  dayBlocks: [
    DayBlockType.Formation,
    DayBlockType.Reading,
    DayBlockType.Math,
    DayBlockType.Speech,
    DayBlockType.Together,
    DayBlockType.Movement,
    DayBlockType.Project,
  ],
  routineItems: [
    RoutineItemKey.Handwriting,
    RoutineItemKey.Spelling,
    RoutineItemKey.SightWords,
    RoutineItemKey.MinecraftReading,
    RoutineItemKey.ReadingEggs,
    RoutineItemKey.Math,
    RoutineItemKey.Speech,
  ],
  blockInstructions: {
    [DayBlockType.Formation]: [
      'Gratitude (1 thing)',
      'Scripture memory or virtue talk',
    ],
    [DayBlockType.Reading]: [
      'Handwriting (+1 XP)',
      'Spelling word (+1 XP)',
      'Sight words (+1 XP)',
      'Minecraft book reading (+2 XP)',
      'Reading Eggs (+1 XP)',
    ],
    [DayBlockType.Math]: [
      'Hand math (+2 XP)',
    ],
    [DayBlockType.Speech]: [
      'Sentence routine 2\u20135 min (+1 XP)',
    ],
    [DayBlockType.Together]: [
      'Family read-aloud or discussion',
    ],
    [DayBlockType.Movement]: [
      'Outdoor play or exercise',
    ],
    [DayBlockType.Project]: [
      'Hands-on project time',
    ],
  },
  minimumViableDay: [
    'Minecraft reading: 1 page (or 2\u20133 min)',
    'Math: 1 problem',
    'Writing OR spelling: 1 line or 1 word',
    'Gratitude (Formation)',
  ],
}

/**
 * London's daily routine template (younger child, simpler routine).
 *
 * Reading & Literacy:
 *   Read aloud 10 min (+1 XP), Sight words 5 min (+1 XP)
 * Math:
 *   5-minute counting / number practice (+1 XP)
 * Speech:
 *   Optional — practice if energy allows (+1 XP)
 */
export const londonTemplate: DailyPlanTemplate = {
  label: 'London',
  dayBlocks: [
    DayBlockType.Formation,
    DayBlockType.Reading,
    DayBlockType.Math,
    DayBlockType.Speech,
    DayBlockType.Together,
    DayBlockType.Movement,
  ],
  routineItems: [
    RoutineItemKey.ReadAloud,
    RoutineItemKey.SightWords,
    RoutineItemKey.Math,
    RoutineItemKey.Speech,
  ],
  blockInstructions: {
    [DayBlockType.Formation]: [
      'Gratitude (1 thing)',
    ],
    [DayBlockType.Reading]: [
      'Read aloud 10 min (+1 XP)',
      'Sight words 5 min (+1 XP)',
    ],
    [DayBlockType.Math]: [
      '5-minute counting or number practice (+1 XP)',
    ],
    [DayBlockType.Speech]: [
      'Optional \u2014 practice if energy allows (+1 XP)',
    ],
    [DayBlockType.Together]: [
      'Family activity or read-aloud',
    ],
    [DayBlockType.Movement]: [
      'Outdoor play or movement break',
    ],
  },
  minimumViableDay: [
    'Read-aloud: 1 book or 10 min',
    'Sight words: 5 min',
    'Counting or number practice: 5 min',
    'Gratitude (Formation)',
  ],
}

/** Look up a plan template by child name (case-insensitive). */
export function getTemplateForChild(childName: string): DailyPlanTemplate | undefined {
  const lower = childName.toLowerCase()
  if (lower === 'lincoln') return lincolnTemplate
  if (lower === 'london') return londonTemplate
  return undefined
}
