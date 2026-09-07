// ── "How many activities, and where do I change them?" (UX-258) ──────────────
//
// The setup card used to print up to eight activity names with their cadences,
// joined by `·`, then a bare ` · ...`:
//
//   Prayer and Scripture (daily) · The Good and the Beautiful Math (3x-week) ·
//   Explode the Code (weekly) · Sight word games (daily) · Read aloud (3x-week)
//   · Handwriting (weekly) · Copywork (daily) · Nature study (3x-week) · ...
//
// Roughly 37 of the ~157 words standing between opening the planner and tapping
// Generate (UX-260), for a list nobody can scan and nobody can act on — it is
// read-only here, and the screen that can actually fix a duplicate or a cadence
// is Curriculum. It is also, precisely, where UX-231's week of duplicated
// activities sat visible with no way out of it until UX-241 wired the link.
//
// A count and a link beat a truncated list. The count is the number a parent
// checks ("that looks like too many"); the link is the way to do something about
// it. The names live one tap away on the screen that owns them.
//
// Pure and total — no I/O, no formatting of a cadence, nothing that can throw on
// a malformed stored config.

import type { ActivityConfig } from '../../core/types'

/**
 * The one-line count under the setup card's read-aloud picker.
 *
 * "24 activities" · "24 activities · 1 completed" · "1 activity".
 *
 * Completed configs are named separately rather than folded into the total,
 * because the total is the number that answers "how much is being planned every
 * day" — a completed program plans nothing (`activityConfigsToRoutineText`
 * filters on exactly that flag) and counting it would overstate the day.
 *
 * Returns `null` when there is nothing to count, so the caller renders no
 * container at all rather than a box saying "0 activities".
 */
export function activitySummaryLine(configs: readonly ActivityConfig[]): string | null {
  if (configs.length === 0) return null
  const active = configs.filter((c) => !c.completed).length
  const completed = configs.length - active
  const base = `${active} ${active === 1 ? 'activity' : 'activities'}`
  return completed > 0 ? `${base} · ${completed} completed` : base
}

/** The link out to the screen that owns the list (Curriculum). */
export const VIEW_ACTIVITIES_LABEL = 'View / edit'
