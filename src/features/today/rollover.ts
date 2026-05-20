import type { ChecklistItem, DayLog } from '../../core/types'
import { extractLessonNumber, isSameWorkbook } from '../../core/utils/workbookMatching'

/** Recommended upper bound on a merged checklist length (surfaced as a warning, not enforced here). */
const ROLLOVER_ITEM_WARN_THRESHOLD = 15

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

/** Reset completion state on a rolled item and tag provenance. */
function resetRolledItem(item: ChecklistItem, sourceDate: string): ChecklistItem {
  return {
    ...item,
    completed: false,
    completedAt: undefined,
    actualMinutes: undefined,
    evidenceArtifactId: undefined,
    evidenceCollection: undefined,
    gradeResult: undefined,
    mastery: undefined,
    engagement: undefined,
    scanned: undefined,
    rolledOver: true,
    rolledOverFrom: sourceDate,
  }
}

/** Copy planner-set metadata from an existing planned item onto a rolled item when the rolled item lacks it. */
function inheritPlannedMetadata(
  rolled: ChecklistItem,
  planned: ChecklistItem,
): ChecklistItem {
  const out: ChecklistItem = { ...rolled }
  if (!out.skipGuidance && planned.skipGuidance) out.skipGuidance = planned.skipGuidance
  if (!out.block && planned.block) out.block = planned.block
  if (!out.category && planned.category) out.category = planned.category
  if (!out.plannedMinutes && planned.plannedMinutes) out.plannedMinutes = planned.plannedMinutes
  if (!out.estimatedMinutes && planned.estimatedMinutes) out.estimatedMinutes = planned.estimatedMinutes
  if (!out.subjectBucket && planned.subjectBucket) out.subjectBucket = planned.subjectBucket
  if (!out.activityConfigId && planned.activityConfigId) out.activityConfigId = planned.activityConfigId
  if (!out.contentGuide && planned.contentGuide) out.contentGuide = planned.contentGuide
  if (!out.itemType && planned.itemType) out.itemType = planned.itemType
  if (!out.link && planned.link) out.link = planned.link
  if (!out.skillTags?.length && planned.skillTags?.length) out.skillTags = planned.skillTags
  if (!out.ladderRef && planned.ladderRef) out.ladderRef = planned.ladderRef
  if (out.mvdEssential == null && planned.mvdEssential != null) out.mvdEssential = planned.mvdEssential
  return out
}

/**
 * Merge rolled-over items into today's checklist, replacing planned items that reference
 * the same workbook.
 *
 * Dedup rules:
 * - If a rolled item and a planned item reference the same workbook (via `isSameWorkbook`),
 *   the rolled item REPLACES the planned item. The rolled item has a specific lesson
 *   number; the planned item is a generic template.
 * - If BOTH have lesson numbers, the higher lesson number wins (represents the further
 *   progression — the planner already advanced past the rolled lesson).
 * - When the rolled item wins, planner-set metadata (skipGuidance, block, etc.) is
 *   copied over if the rolled item lacks it.
 * - Items with no workbook match are appended at the end.
 */
export function mergeRolledItems(
  todayChecklist: ChecklistItem[],
  rolledItems: ChecklistItem[],
  sourceDate: string,
): ChecklistItem[] {
  const result: ChecklistItem[] = [...todayChecklist]

  for (const rolled of rolledItems) {
    let matchIndex = -1
    for (let i = 0; i < result.length; i++) {
      if (isSameWorkbook(result[i], rolled)) {
        matchIndex = i
        break
      }
    }

    if (matchIndex === -1) {
      result.push(resetRolledItem(rolled, sourceDate))
      continue
    }

    const existing = result[matchIndex]
    const existingLesson = extractLessonNumber(existing.label)
    const rolledLesson = extractLessonNumber(rolled.label)

    if (
      existingLesson != null &&
      rolledLesson != null &&
      existingLesson > rolledLesson
    ) {
      // Planner already advanced past yesterday's unfinished lesson — keep the planned item as-is.
      continue
    }

    // Rolled wins: reset rolled state and inherit planner metadata the rolled item lacks.
    const winner = inheritPlannedMetadata(
      resetRolledItem(rolled, sourceDate),
      existing,
    )
    result[matchIndex] = winner
  }

  if (result.length > ROLLOVER_ITEM_WARN_THRESHOLD) {
    console.warn(
      `[rollover] Merged checklist has ${result.length} items (recommended: <=${ROLLOVER_ITEM_WARN_THRESHOLD}). Budget enforcement should trim this.`,
    )
  }

  return result
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

  // If the merge produced no change (every rolled item matched an existing item at equal/higher lesson), no rollover needed.
  const changed =
    merged.length !== todayChecklist.length ||
    merged.some((item, i) => item !== todayChecklist[i])
  if (!changed) return null

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
