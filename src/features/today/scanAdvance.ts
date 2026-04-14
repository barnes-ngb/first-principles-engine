import type { ChecklistItem, Recommendation } from '../../core/types'

/**
 * After a scan advances an ActivityConfig's currentPosition, auto-complete
 * checklist items that correspond to lessons bypassed by the advance.
 *
 * Returns updated checklist or null if no changes were made.
 */
export function autoCompleteBypassedItems(
  checklist: ChecklistItem[],
  scannedIndex: number,
  configId: string | undefined,
  scannedLessonNumber: number | null,
  recommendation: Recommendation | undefined,
): ChecklistItem[] | null {
  if (!configId || scannedLessonNumber == null) return null

  const isSkipRecommendation = recommendation === 'skip'
  const now = new Date().toISOString()
  let changed = false

  const updated = checklist.map((item, i) => {
    // Match by direct index (the item the scan was triggered from)
    const isScannedItem = i === scannedIndex

    // Match by activityConfigId for other items sharing the same config
    const isConfigMatch = item.activityConfigId === configId && !!item.activityConfigId

    if (!isScannedItem && !isConfigMatch) return item
    if (item.completed || item.skipped) return item

    changed = true
    return {
      ...item,
      completed: true,
      completedAt: now,
      ...(isSkipRecommendation ? { skipReason: 'ai-recommended' as const } : {}),
      gradeResult: `Scanned via lesson ${scannedLessonNumber}`,
    }
  })

  return changed ? updated : null
}
