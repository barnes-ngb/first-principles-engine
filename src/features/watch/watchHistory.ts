import type { ChecklistItem } from '../../core/types'

/**
 * Watch history (FEAT-139) — "has anyone actually watched this, and when?",
 * derived from the day logs the app already writes.
 *
 * **No new write path, and no new collection.** A completed watch row is already
 * a durable, id-keyed record: `watchVideoId` + `completed: true`, on a day
 * document that carries the child and the date. Reading history off that gives
 * *retroactive* coverage — every video watched before this feature existed shows
 * up — and adds nothing to the completion lane, which is the right trade in a
 * system holding school records. The alternative (a denormalized
 * `lastWatchedAt` on the `WatchVideo` doc) would need a brand-new library write
 * on completion and would only ever know about watches after the change.
 *
 * **Move/swap safe (FEAT-138).** A row moved to another day is carried verbatim,
 * so `watchVideoId` survives a move and history keyed on it is move-proof. A
 * *swapped* row's `watchVideoId` changes before completion — which is correct:
 * the boy watched the replacement, and that is the video that gets credited.
 *
 * Pure and side-effect-free; the bounded read lives in `useWatchHistory.ts`.
 */

/** The slice of a `DayLog` this needs. Deliberately structural — any shape with these fields works. */
export interface WatchHistoryDayLog {
  childId: string
  /** `YYYY-MM-DD`. */
  date: string
  checklist?: ChecklistItem[]
}

export interface WatchHistoryEntry {
  videoId: string
  /** Latest `YYYY-MM-DD` a completed row for this video appears on. */
  lastWatchedOn: string
  /** Child ids that completed it, de-duplicated and sorted for a stable render. */
  childIds: string[]
  /** How many completed rows reference it inside the read window. */
  times: number
}

/** Keyed by `watchVideoId`. A video absent from the map was never watched *in the window*. */
export type WatchHistoryIndex = Record<string, WatchHistoryEntry>

/**
 * `true` for a checklist row that represents a finished watch.
 *
 * Keyed on `watchVideoId` + `completed` rather than on `itemType === 'watch'`.
 * The id is the thing that makes the row joinable, and `watchDayItem.ts` always
 * writes both fields together — so this is strictly the more forgiving test, and
 * a hand-made row that carries the id but lost the type tag still counts.
 * An *incomplete* row is not history: it was planned, not watched.
 */
function isCompletedWatch(item: ChecklistItem): item is ChecklistItem & { watchVideoId: string } {
  return Boolean(item.watchVideoId) && item.completed === true
}

/**
 * Fold day logs into a per-video history index.
 *
 * Order-independent: `lastWatchedOn` takes the max date rather than trusting the
 * caller to pass days in order, so a differently-ordered query can't silently
 * report an older date as the latest.
 */
export function buildWatchHistory(dayLogs: WatchHistoryDayLog[]): WatchHistoryIndex {
  const index: WatchHistoryIndex = {}
  const childSets: Record<string, Set<string>> = {}

  for (const day of dayLogs) {
    for (const item of day.checklist ?? []) {
      if (!isCompletedWatch(item)) continue
      const id = item.watchVideoId
      const existing = index[id]
      if (!existing) {
        index[id] = { videoId: id, lastWatchedOn: day.date, childIds: [], times: 1 }
        childSets[id] = new Set()
      } else {
        existing.times += 1
        // Dates are `YYYY-MM-DD`, so a lexical compare is a chronological one.
        if (day.date > existing.lastWatchedOn) existing.lastWatchedOn = day.date
      }
      childSets[id].add(day.childId)
    }
  }

  for (const id of Object.keys(index)) {
    index[id].childIds = [...childSets[id]].sort()
  }
  return index
}

/**
 * One-line summary for a library row, e.g. `"Watched by Lincoln · 2026-08-04"`.
 * Returns `null` when the video has no entry — the caller decides how to word
 * "not in the window", because that wording must name the window (a bare
 * "never watched" would overclaim beyond what was actually read).
 */
export function summarizeWatchEntry(
  entry: WatchHistoryEntry | undefined,
  childName: (id: string) => string,
): string | null {
  if (!entry) return null
  const who = entry.childIds.map(childName).join(' & ')
  const repeat = entry.times > 1 ? ` · ${entry.times}×` : ''
  return `Watched by ${who} · ${entry.lastWatchedOn}${repeat}`
}
