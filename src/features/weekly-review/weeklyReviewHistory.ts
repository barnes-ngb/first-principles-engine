import { formatDateYmd } from '../../core/utils/format'

/**
 * The week keys immediately before `weekKey`, newest first (UX-213 / UX-214).
 *
 * Pure. Weekly review docs are keyed `{weekKey}_{childId}` and weeks are
 * Sunday-start, so the earlier weeks are derivable by arithmetic — which means
 * the history can be fetched by document id with no `orderBy` query and
 * therefore no new composite index.
 *
 * `weeksBack` is bounded on purpose: a rate wants the most recent EARLIER
 * snapshot, not the whole archive, and an unbounded look-back would turn a page
 * load into an ever-growing read.
 */
export function previousWeekKeys(weekKey: string, weeksBack: number): string[] {
  const start = new Date(weekKey + 'T00:00:00')
  if (Number.isNaN(start.getTime()) || weeksBack <= 0) return []
  const keys: string[] = []
  for (let i = 1; i <= weeksBack; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() - 7 * i)
    keys.push(formatDateYmd(d))
  }
  return keys
}

/** A quarter of look-back: enough to find a baseline across a quiet month. */
export const HISTORY_WEEKS = 12
