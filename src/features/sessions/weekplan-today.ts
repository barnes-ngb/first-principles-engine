import type { Child, DayLog, WeekPlan } from '../../core/types/domain'
import { DayBlockType } from '../../core/types/enums'
import type { DayBlockType as DayBlockTypeValue } from '../../core/types/enums'
import { ALL_DAY_BLOCKS } from '../today/daylog.model'
import { getTemplateForChild } from '../today/dailyPlanTemplates'

export const BlockStatus = {
  NotStarted: 'not_started',
  InProgress: 'in_progress',
  Logged: 'logged',
} as const
export type BlockStatus = (typeof BlockStatus)[keyof typeof BlockStatus]

export interface TodayBlock {
  type: DayBlockTypeValue
  title: string
  suggestedMinutes: number
  instructions: string[]
  done: boolean
  status: BlockStatus
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
 * Derive instructions for a block type from the WeekPlan.
 * Falls back to child-specific template instructions, then generic defaults.
 */
function deriveInstructions(
  type: DayBlockTypeValue,
  weekPlan: WeekPlan,
  child: Child,
): string[] {
  const childGoals =
    weekPlan.childGoals.find((cg) => cg.childId === child.id)?.goals ?? []
  const template = getTemplateForChild(child.name)
  const templateInstructions = template?.blockInstructions[type]

  // Helper to pick fallback: template-specific > generic defaults
  const fallback = () =>
    templateInstructions ?? defaultInstructions[type] ?? ['Complete scheduled activities']

  switch (type) {
    case DayBlockType.Formation: {
      const items: string[] = []
      if (weekPlan.virtue) items.push(`Virtue: ${weekPlan.virtue}`)
      if (weekPlan.heartQuestion)
        items.push(weekPlan.heartQuestion)
      if (weekPlan.scriptureRef && items.length < 2)
        items.push(weekPlan.scriptureRef)
      return items.length > 0 ? items.slice(0, 2) : fallback()
    }
    case DayBlockType.Together: {
      const items: string[] = []
      if (weekPlan.theme) items.push(`Theme: ${weekPlan.theme}`)
      if (weekPlan.flywheelPlan) items.push(weekPlan.flywheelPlan)
      return items.length > 0 ? items.slice(0, 2) : fallback()
    }
    case DayBlockType.Project: {
      const items: string[] = []
      if (weekPlan.buildLab.title) items.push(weekPlan.buildLab.title)
      if (weekPlan.buildLab.steps.length > 0)
        items.push(weekPlan.buildLab.steps[0])
      return items.length > 0 ? items.slice(0, 2) : fallback()
    }
    default: {
      // For Reading, Math, Speech, etc. — child goals > template > generic
      if (childGoals.length > 0) {
        return childGoals.slice(0, 2)
      }
      return fallback()
    }
  }
}

/**
 * Determine the status of a block in today's DayLog.
 *
 * - Logged: section-level done flag is set OR block has actualMinutes
 * - InProgress: block has notes or some checklist items completed (but not "done")
 * - NotStarted: no data recorded
 */
function getBlockStatus(type: DayBlockTypeValue, dayLog: DayLog | null): BlockStatus {
  if (!dayLog) return BlockStatus.NotStarted

  // Check section-level done flags → Logged
  let sectionDone = false
  let hasPartialData = false

  switch (type) {
    case DayBlockType.Formation:
      sectionDone = !!dayLog.formation?.done
      hasPartialData = !!(dayLog.formation?.gratitude || dayLog.formation?.verse || dayLog.formation?.note)
      break
    case DayBlockType.Reading:
      sectionDone = !!(
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
      break
    case DayBlockType.Speech:
      sectionDone = !!dayLog.speech?.done
      hasPartialData = !!(dayLog.speech?.note || dayLog.speech?.narrationReps?.done)
      if (dayLog.speech?.narrationReps?.done) sectionDone = true
      break
    case DayBlockType.Math:
      sectionDone = !!(dayLog.math?.done || dayLog.math?.numberSense?.done || dayLog.math?.wordProblems?.done)
      hasPartialData = !!(dayLog.math?.note || dayLog.math?.problems)
      break
    case DayBlockType.Together:
      sectionDone = !!dayLog.together?.done
      hasPartialData = !!dayLog.together?.note
      break
    case DayBlockType.Movement:
      sectionDone = !!dayLog.movement?.done
      hasPartialData = !!dayLog.movement?.note
      break
    case DayBlockType.Project:
      sectionDone = !!dayLog.project?.done
      hasPartialData = !!dayLog.project?.note
      break
  }

  if (sectionDone) return BlockStatus.Logged

  // Check block-level actualMinutes
  const block = dayLog.blocks.find((b) => b.type === type)
  if ((block?.actualMinutes ?? 0) > 0) return BlockStatus.Logged

  // Check for partial data in block (notes, checklist)
  if (hasPartialData) return BlockStatus.InProgress
  if (block?.notes) return BlockStatus.InProgress
  if (block?.checklist?.some((i) => i.completed)) return BlockStatus.InProgress

  return BlockStatus.NotStarted
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
  return blockTypes.map((type) => {
    const status = getBlockStatus(type, dayLog)
    return {
      type,
      title: blockTitle[type],
      suggestedMinutes: defaultMinutes[type],
      instructions: deriveInstructions(type, weekPlan, child),
      done: status === BlockStatus.Logged,
      status,
    }
  })
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
