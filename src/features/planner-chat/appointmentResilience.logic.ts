/**
 * Appointment Resilience (Slice G)
 *
 * Handles light day templates and auto-reflow of plan items
 * around appointment/light days to preserve weekly pace.
 */

import type {
  AppBlock,
  DayTypeConfig,
  DraftDayPlan,
  DraftPlanItem,
  DraftWeeklyPlan,
  LightDayItem,
  LightDayTemplate,
} from '../../core/types/domain'
import { DayType, SubjectBucket } from '../../core/types/enums'
import { generateItemId, type WeekDay, WEEK_DAYS } from './chatPlanner.logic'

/**
 * Build a light day template from app blocks.
 *
 * Light day structure:
 * - Reading Eggs (45m) OR first app block
 * - 1 tiny writing task (5-10m)
 * - 1 tiny math task (5-10m)
 * - Optional: win card / reading aloud
 */
export function buildLightDayTemplate(appBlocks: AppBlock[]): LightDayTemplate {
  const items: LightDayItem[] = []

  // App blocks (carry over but potentially reduced)
  for (const block of appBlocks) {
    items.push({
      title: block.label,
      subjectBucket: SubjectBucket.Other,
      estimatedMinutes: block.defaultMinutes,
      skillTags: [],
      isAppBlock: true,
    })
  }

  // Tiny writing task
  items.push({
    title: 'Quick writing (copy 1 sentence)',
    subjectBucket: SubjectBucket.LanguageArts,
    estimatedMinutes: 10,
    skillTags: ['writing.copyWords'],
  })

  // Tiny math task
  items.push({
    title: 'Math facts sprint (5 min)',
    subjectBucket: SubjectBucket.Math,
    estimatedMinutes: 5,
    skillTags: ['math.addition.facts'],
  })

  // Win card (optional reading aloud)
  items.push({
    title: 'Read aloud / game (win card)',
    subjectBucket: SubjectBucket.Reading,
    estimatedMinutes: 10,
    skillTags: ['reading.fluency.short'],
  })

  const totalMinutes = items.reduce((sum, item) => sum + item.estimatedMinutes, 0)

  return { items, totalMinutes }
}

/**
 * Apply light day template to a specific day in the plan.
 * Replaces non-app-block items with light day items.
 */
export function applyLightDayToplan(
  dayPlan: DraftDayPlan,
  template: LightDayTemplate,
): DraftDayPlan {
  // Keep existing app blocks
  const existingAppBlocks = dayPlan.items.filter((item) => item.isAppBlock)

  // Build new items from template (skip app blocks since we keep existing ones)
  const templateNonApp = template.items.filter((item) => !item.isAppBlock)
  const newItems: DraftPlanItem[] = templateNonApp.map((item) => ({
    id: generateItemId(),
    title: item.title,
    subjectBucket: item.subjectBucket,
    estimatedMinutes: item.estimatedMinutes,
    skillTags: item.skillTags,
    accepted: true,
  }))

  return {
    day: dayPlan.day,
    timeBudgetMinutes: dayPlan.timeBudgetMinutes,
    items: [...existingAppBlocks, ...newItems],
  }
}

/**
 * Reflow plan items around light/appointment days.
 *
 * Items displaced from light days are redistributed to normal days,
 * prioritizing days with the most remaining budget.
 */
export function reflowPlanAroundLightDays(
  plan: DraftWeeklyPlan,
  dayTypes: DayTypeConfig[],
  appBlocks: AppBlock[],
): DraftWeeklyPlan {
  const lightDayNames = new Set(
    dayTypes
      .filter((d) => d.dayType === DayType.Light || d.dayType === DayType.Appointment)
      .map((d) => d.day),
  )

  if (lightDayNames.size === 0) return plan

  const template = buildLightDayTemplate(appBlocks)
  const displacedItems: DraftPlanItem[] = []
  const newDays: DraftDayPlan[] = []

  for (const day of plan.days) {
    if (lightDayNames.has(day.day)) {
      // Collect displaced non-app items
      const displaced = day.items.filter((item) => !item.isAppBlock && item.accepted)
      displacedItems.push(...displaced)

      // Apply light day template
      newDays.push(applyLightDayToplan(day, template))
    } else {
      newDays.push({ ...day, items: [...day.items] })
    }
  }

  // Redistribute displaced items to normal days (greedy: fill least-loaded)
  const normalDays = newDays.filter((d) => !lightDayNames.has(d.day))

  for (const item of displacedItems) {
    if (normalDays.length === 0) break

    // Find day with most remaining budget
    let bestDay = normalDays[0]
    let bestRemaining = getRemainingBudget(bestDay)
    for (const day of normalDays) {
      const remaining = getRemainingBudget(day)
      if (remaining > bestRemaining) {
        bestDay = day
        bestRemaining = remaining
      }
    }

    bestDay.items.push({ ...item })
  }

  return {
    ...plan,
    days: newDays,
  }
}

/**
 * Get the remaining time budget for a day.
 */
function getRemainingBudget(day: DraftDayPlan): number {
  const used = day.items
    .filter((item) => item.accepted)
    .reduce((sum, item) => sum + item.estimatedMinutes, 0)
  return Math.max(0, day.timeBudgetMinutes - used)
}

/**
 * Determine default day types for a week.
 * Wednesday defaults to light (appointment day).
 */
export function getDefaultDayTypes(): DayTypeConfig[] {
  return WEEK_DAYS.map((day: WeekDay) => ({
    day,
    dayType: day === 'Wednesday' ? DayType.Light : DayType.Normal,
  }))
}

/**
 * Check if a day should be treated as light based on day types config.
 */
export function isLightDay(day: string, dayTypes: DayTypeConfig[]): boolean {
  const config = dayTypes.find((d) => d.day === day)
  return config?.dayType === DayType.Light || config?.dayType === DayType.Appointment
}
