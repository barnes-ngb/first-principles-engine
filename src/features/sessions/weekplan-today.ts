import type { Child, DayLog, WeekPlan } from '../../core/types/domain'
import { DayBlockType } from '../../core/types/enums'
import type { DayBlockType as DayBlockTypeValue } from '../../core/types/enums'
import { ALL_DAY_BLOCKS } from '../today/daylog.model'

export interface TodayBlock {
  type: DayBlockTypeValue
  title: string
  suggestedMinutes: number
  instructions: string[]
  done: boolean
}

/** Default suggested minutes per block type. */
const defaultMinutes: Record<DayBlockTypeValue, number> = {
  [DayBlockType.Formation]: 15,
  [DayBlockType.Reading]: 30,
  [DayBlockType.Speech]: 15,
  [DayBlockType.Math]: 25,
  [DayBlockType.Together]: 20,
  [DayBlockType.Movement]: 15,
  [DayBlockType.Project]: 30,
  [DayBlockType.FieldTrip]: 60,
  [DayBlockType.Other]: 15,
}

/** Default fallback instructions when WeekPlan doesn't provide content for a block. */
const defaultInstructions: Record<DayBlockTypeValue, string[]> = {
  [DayBlockType.Formation]: ['Gratitude journaling', 'Scripture memory'],
  [DayBlockType.Reading]: ['Independent reading or read-aloud'],
  [DayBlockType.Speech]: ['Speech practice or narration'],
  [DayBlockType.Math]: ['Math lesson or practice problems'],
  [DayBlockType.Together]: ['Family read-aloud or discussion'],
  [DayBlockType.Movement]: ['Outdoor play or exercise'],
  [DayBlockType.Project]: ['Hands-on project time'],
  [DayBlockType.FieldTrip]: ['Field trip or community outing'],
  [DayBlockType.Other]: ['Flex time'],
}

/** Human labels for block types (matches blockMeta). */
const blockTitle: Record<DayBlockTypeValue, string> = {
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

/**
 * Derive 1-2 instructions for a block type from the WeekPlan.
 * Falls back to defaults when the plan doesn't have relevant content.
 */
function deriveInstructions(
  type: DayBlockTypeValue,
  weekPlan: WeekPlan,
  childId: string,
): string[] {
  const childGoals =
    weekPlan.childGoals.find((cg) => cg.childId === childId)?.goals ?? []

  switch (type) {
    case DayBlockType.Formation: {
      const items: string[] = []
      if (weekPlan.virtue) items.push(`Virtue: ${weekPlan.virtue}`)
      if (weekPlan.heartQuestion)
        items.push(weekPlan.heartQuestion)
      if (weekPlan.scriptureRef && items.length < 2)
        items.push(weekPlan.scriptureRef)
      return items.length > 0 ? items.slice(0, 2) : defaultInstructions[type]
    }
    case DayBlockType.Together: {
      const items: string[] = []
      if (weekPlan.theme) items.push(`Theme: ${weekPlan.theme}`)
      if (weekPlan.flywheelPlan) items.push(weekPlan.flywheelPlan)
      return items.length > 0 ? items.slice(0, 2) : defaultInstructions[type]
    }
    case DayBlockType.Project: {
      const items: string[] = []
      if (weekPlan.buildLab.title) items.push(weekPlan.buildLab.title)
      if (weekPlan.buildLab.steps.length > 0)
        items.push(weekPlan.buildLab.steps[0])
      return items.length > 0 ? items.slice(0, 2) : defaultInstructions[type]
    }
    default: {
      // For Reading, Math, Speech, etc. — pull from child goals if available
      if (childGoals.length > 0) {
        return childGoals.slice(0, 2)
      }
      return defaultInstructions[type] ?? ['Complete scheduled activities']
    }
  }
}

/**
 * Check whether a block type is "done" in today's DayLog.
 * Checks both section-level done flags and block actualMinutes.
 */
function isBlockDone(type: DayBlockTypeValue, dayLog: DayLog | null): boolean {
  if (!dayLog) return false

  // Check section-level done flags
  switch (type) {
    case DayBlockType.Formation:
      if (dayLog.formation?.done) return true
      break
    case DayBlockType.Reading:
      if (
        dayLog.reading?.handwriting?.done ||
        dayLog.reading?.spelling?.done ||
        dayLog.reading?.sightWords?.done ||
        dayLog.reading?.minecraft?.done ||
        dayLog.reading?.readingEggs?.done ||
        dayLog.reading?.phonemicAwareness?.done ||
        dayLog.reading?.phonicsLesson?.done ||
        dayLog.reading?.decodableReading?.done ||
        dayLog.reading?.spellingDictation?.done
      )
        return true
      break
    case DayBlockType.Speech:
      if (dayLog.speech?.done) return true
      break
    case DayBlockType.Math:
      if (dayLog.math?.done) return true
      break
    case DayBlockType.Together:
      if (dayLog.together?.done) return true
      break
    case DayBlockType.Movement:
      if (dayLog.movement?.done) return true
      break
    case DayBlockType.Project:
      if (dayLog.project?.done) return true
      break
  }

  // Check block-level actualMinutes
  const block = dayLog.blocks.find((b) => b.type === type)
  return (block?.actualMinutes ?? 0) > 0
}

/**
 * Build the Today's Plan blocks for the dashboard by combining:
 * - the child's dayBlocks order/priority
 * - the current WeekPlan content
 * - today's DayLog completion state
 */
export function buildTodayBlocks(
  weekPlan: WeekPlan,
  child: Child,
  dayLog: DayLog | null,
): TodayBlock[] {
  const blockTypes = child.dayBlocks ?? ALL_DAY_BLOCKS
  return blockTypes.map((type) => ({
    type,
    title: blockTitle[type],
    suggestedMinutes: defaultMinutes[type],
    instructions: deriveInstructions(type, weekPlan, child.id),
    done: isBlockDone(type, dayLog),
  }))
}

/**
 * Create a minimal WeekPlan template for the current week.
 */
export function createMinimalWeekPlan(
  weekStart: string,
  weekEnd: string,
  childIds: string[],
): WeekPlan {
  return {
    startDate: weekStart,
    endDate: weekEnd,
    theme: '',
    virtue: '',
    scriptureRef: '',
    heartQuestion: '',
    tracks: [],
    flywheelPlan: '',
    buildLab: { title: '', materials: [], steps: [] },
    childGoals: childIds.map((childId) => ({ childId, goals: [] })),
  }
}
