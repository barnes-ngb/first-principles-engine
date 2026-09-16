import type { DayLog } from '../../core/types'

export interface PreCompletionScanScope {
  familyId: string
  childId: string
  dateKey: string
}

export interface PreCompletionScanTarget extends PreCompletionScanScope {
  itemId: string
  scanId: string
}

export const hasPersistentChecklistId = (id: unknown): id is string =>
  typeof id === 'string' && id.trim().length > 0

/** A result belongs only to the persisted row and scope whose camera opened. */
export function resolvePreCompletionScanIndex(
  target: PreCompletionScanTarget | null,
  scope: PreCompletionScanScope,
  scanId: string | undefined,
  dayLog: Pick<DayLog, 'childId' | 'date' | 'checklist'> | null,
): number | null {
  if (!target || !hasPersistentChecklistId(target.itemId) || !target.scanId || target.scanId !== scanId
    || target.familyId !== scope.familyId || target.childId !== scope.childId || target.dateKey !== scope.dateKey
    || dayLog?.childId !== target.childId || dayLog.date !== target.dateKey) return null
  const rows = dayLog.checklist ?? []
  const matches = rows.map((row, index) => row.id === target.itemId ? index : -1).filter((index) => index >= 0)
  return matches.length === 1 ? matches[0] : null
}
