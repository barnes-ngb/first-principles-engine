import type { DraftWeeklyPlan } from '../../core/types/domain'
import { generateItemId } from './chatPlanner.logic'

/**
 * Match patterns like "Lesson 47", "Ch 5", "Chapter 12", "Unit 3", "Page 10"
 * and increment the number by the given amount.
 */
export function advanceLessonNumber(title: string, increment: number): string {
  return title.replace(
    /(Lesson|Ch|Chapter|Unit|Page)\s*(\d+)/gi,
    (_match, prefix: string, num: string) => `${prefix} ${parseInt(num) + increment}`,
  )
}

/**
 * Count how many items per workbook-like title prefix appeared in the plan.
 * Groups items by the text before the first lesson/chapter/unit/page number pattern.
 */
function countItemsPerWorkbook(plan: DraftWeeklyPlan): Map<string, number> {
  const counts = new Map<string, number>()
  const prefixPattern = /^(.*?)\s*(?:Lesson|Ch|Chapter|Unit|Page)\s*\d+/i

  for (const day of plan.days) {
    for (const item of day.items) {
      const match = item.title.match(prefixPattern)
      if (match) {
        const key = match[1].trim().toLowerCase()
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }

  return counts
}

/**
 * Get the workbook prefix key for an item title, if it contains a lesson number.
 */
function getWorkbookKey(title: string): string | null {
  const match = title.match(/^(.*?)\s*(?:Lesson|Ch|Chapter|Unit|Page)\s*\d+/i)
  return match ? match[1].trim().toLowerCase() : null
}

/**
 * Clone a DraftWeeklyPlan, advancing lesson numbers based on how many lessons
 * of each workbook appeared in the original plan.
 */
export function clonePlanWithAdvancedLessons(plan: DraftWeeklyPlan): DraftWeeklyPlan {
  const workbookCounts = countItemsPerWorkbook(plan)

  return {
    ...plan,
    days: plan.days.map((day) => ({
      ...day,
      items: day.items.map((item) => {
        const workbookKey = getWorkbookKey(item.title)
        const increment = workbookKey ? (workbookCounts.get(workbookKey) ?? 0) : 0

        return {
          ...item,
          id: generateItemId(),
          title: increment > 0 ? advanceLessonNumber(item.title, increment) : item.title,
        }
      }),
    })),
  }
}
