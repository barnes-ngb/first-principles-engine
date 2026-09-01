/**
 * "How many minutes did this child actually school this month" — the monthly
 * review book's FOLD of the shared hours counting rule.
 *
 * ── What lives here, and what no longer does (ARCH-47 slice 4) ───────────────
 * This module used to carry a hand-kept PORT of the whole counting path —
 * `collectHoursContributions`, `dayLogMinuteContributions`, `entryMinutes` and
 * `itemMatchesBlock`, re-implemented from `src/features/records/records.logic.ts`
 * and `src/core/utils/itemBlockMatch.ts` because `functions/` could not import
 * from `src/`. The two copies were pinned by a PARITY FIXTURE repeated verbatim
 * in both test files.
 *
 * That rule now has exactly ONE definition, in
 * `functions/src/shared/hoursContributions.ts`, compiled by BOTH projects: the
 * shared directory sits INSIDE `functions/src` (so `rootDir` is satisfied and
 * `functions/lib/index.js` never moves) and the app reaches in from the two
 * files that already owned the exports. The port and its fixture are gone —
 * change the rule and break a caller, and it fails to COMPILE on the side that
 * broke, rather than waiting for a test author to remember a fixture exists.
 *
 * What remains here is genuinely the BOOK'S OWN, not a duplicate of anything
 * app-side: the fold from a contribution list to the two numbers the prose
 * reads. The app's equivalent, `computeHoursSummary`, folds the SAME list into a
 * different and larger shape (home / core / core-at-home / adjustment splits and
 * a per-date map) for MO compliance, which the book has no use for.
 *
 * ── Why the book counts this way (FEAT-164) ─────────────────────────────────
 * The monthly review book used to total the `hours` collection ALONE, while the
 * Records page has always computed the child's figure from THREE additive
 * sources — hours entries + day logs + adjustments. The book was therefore
 * narrating a smaller month than the record it is meant to be part of (Lincoln,
 * Aug 2026: 34.7 h in the book vs 50.0 h in the app), and because the shortfall
 * is per-subject it could also rank the wrong subject as the month's biggest.
 * Owner decision, 2026-08-29: the book counts all the hours, by the same rule
 * the Records page uses. The book agrees with the record; never the reverse.
 */

import {
  collectHoursContributions,
  type HoursContribution,
  type RawDayLog,
  type RawHoursAdjustment,
  type RawHoursEntry,
} from "../../shared/hoursContributions.js";

/** The month figure the book reads: a total and the per-subject split the
 *  prose ranks subjects off. */
export interface HoursTotals {
  totalMinutes: number;
  minutesBySubject: Record<string, number>;
}

/**
 * Fold the contributions into the two numbers the book reads. Mirrors the
 * `bySubject` accumulation in `computeHoursSummary` — the total is the sum of
 * the per-subject rows, so the two can never disagree with each other. The
 * home / core / adjustment splits `computeHoursSummary` also derives are
 * compliance-side concerns the book has no use for.
 */
export function summarizeHoursContributions(
  contributions: HoursContribution[],
): HoursTotals {
  const minutesBySubject: Record<string, number> = {};
  for (const c of contributions) {
    minutesBySubject[c.subjectBucket] =
      (minutesBySubject[c.subjectBucket] ?? 0) + c.minutes;
  }
  let totalMinutes = 0;
  for (const minutes of Object.values(minutesBySubject)) totalMinutes += minutes;
  return { totalMinutes, minutesBySubject };
}

/** The whole rule in one call: three sources in, the book's figure out. */
export function computeMonthHours(
  dayLogs: RawDayLog[],
  hoursEntries: RawHoursEntry[],
  adjustments: RawHoursAdjustment[],
  childId?: string,
): HoursTotals {
  return summarizeHoursContributions(
    collectHoursContributions(dayLogs, hoursEntries, adjustments, childId),
  );
}
