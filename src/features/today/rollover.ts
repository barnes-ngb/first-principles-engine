import type { ChecklistItem, DayLog } from '../../core/types'

/**
 * Get the previous school day date string (YYYY-MM-DD).
 * Monday → Friday, Tuesday-Friday → previous day.
 * Saturday/Sunday → returns null (weekends aren't school days).
 */
export function getPreviousSchoolDay(dateStr: string): string | null {
  const d = new Date(dateStr + 'T00:00:00')
  const dow = d.getDay() // 0=Sun, 1=Mon, ..., 6=Sat

  if (dow === 0 || dow === 6) return null // Weekend — no rollover

  // Monday → subtract 3 (back to Friday); else subtract 1
  const daysBack = dow === 1 ? 3 : 1
  const prev = new Date(d)
  prev.setDate(prev.getDate() - daysBack)

  const y = prev.getFullYear()
  const m = String(prev.getMonth() + 1).padStart(2, '0')
  const day = String(prev.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Filter yesterday's checklist to items eligible for rollover:
 * - Not completed
 * - Not skipped
 * - Not aspirational (aspirational items don't nag)
 */
export function getItemsToRollOver(checklist: ChecklistItem[]): ChecklistItem[] {
  return checklist.filter(
    (item) => !item.completed && !item.skipped && !item.aspirational,
  )
}

/**
 * Merge rolled-over items into today's checklist, avoiding duplicates.
 *
 * Deduplication rules:
 * 1. If both items have activityConfigId, match on that.
 * 2. Otherwise fall back to label match.
 *
 * Rolled items are appended to the end of the existing checklist.
 */
export function mergeRolledItems(
  todayChecklist: ChecklistItem[],
  rolledItems: ChecklistItem[],
  sourceDate: string,
): ChecklistItem[] {
  const existingConfigIds = new Set(
    todayChecklist
      .filter((item) => item.activityConfigId)
      .map((item) => item.activityConfigId),
  )
  const existingLabels = new Set(
    todayChecklist.map((item) => item.label.toLowerCase()),
  )

  const newItems: ChecklistItem[] = []
  for (const item of rolledItems) {
    // Deduplicate by activityConfigId if both sides have it
    if (item.activityConfigId && existingConfigIds.has(item.activityConfigId)) {
      continue
    }
    // Deduplicate by label
    if (existingLabels.has(item.label.toLowerCase())) {
      continue
    }

    newItems.push({
      ...item,
      // Reset completion state for the new day
      completed: false,
      completedAt: undefined,
      actualMinutes: undefined,
      evidenceArtifactId: undefined,
      evidenceCollection: undefined,
      gradeResult: undefined,
      mastery: undefined,
      engagement: undefined,
      scanned: undefined,
      // Mark as rolled over
      rolledOver: true,
      rolledOverFrom: sourceDate,
    })
  }

  return [...todayChecklist, ...newItems]
}

/**
 * Compute rolled-over checklist for today given yesterday's day log.
 * Returns null if no rollover is needed.
 */
export function computeRollover(
  _todayDate: string,
  todayChecklist: ChecklistItem[],
  previousDayLog: DayLog | null,
): ChecklistItem[] | null {
  if (!previousDayLog?.checklist || previousDayLog.checklist.length === 0) {
    return null
  }

  const eligible = getItemsToRollOver(previousDayLog.checklist)
  if (eligible.length === 0) return null

  const merged = mergeRolledItems(todayChecklist, eligible, previousDayLog.date)

  // If no new items were actually added, no rollover needed
  if (merged.length === todayChecklist.length) return null

  return merged
}

/**
 * Format a "from" date for the rollover provenance display.
 * Returns day name (e.g., "Friday") if within the same week, otherwise the date.
 */
export function formatRolloverSource(fromDate: string): string {
  const d = new Date(fromDate + 'T00:00:00')
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return dayNames[d.getDay()] ?? fromDate
}
