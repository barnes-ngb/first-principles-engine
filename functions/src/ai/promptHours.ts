/**
 * What a PROMPT may be told about hours — one fold, one sentence, no target
 * (UX-410).
 *
 * ── The finding ─────────────────────────────────────────────────────────────
 * `CLAUDE.md` says the counting rule has exactly ONE definition compiled by both
 * projects (`functions/src/shared/hoursContributions.ts`, ARCH-47 slice 4). That
 * is true INSIDE the rule; it says nothing about a surface counting its own way
 * beside it. AUDIT-234's census found three that did, and all three feed prompts:
 *
 *   1. `chat.ts loadHoursSummary` — the `hoursProgress` slice read by **plan**
 *      and **shellyChat**: `hours` documents only (no day logs, no adjustments),
 *      with `minutes` **plus** `hours * 60` where the rule takes minutes *else*
 *      hours, unrounded, and non-positive entries admitted;
 *   2. the weekly-review prompt's `HOURS BY SUBJECT` — `ctx.hours` alone, the
 *      cron never having read `hoursAdjustments` at all; and
 *   3. its per-day `minutesBySubject` — completed checklist items with no
 *      block-actuals rule, so a day tracked on blocks was reported wrongly in
 *      whichever direction that day happened to lean.
 *
 * All three now fold through this module, which folds through the shared rule.
 *
 * ── Why there is no second accumulator here ─────────────────────────────────
 * Contributions → `{ totalMinutes, minutesBySubject }` already has one
 * definition: `summarizeHoursContributions`, written for the monthly review
 * book. Writing a second accumulator here — even a correct one — would be the
 * very thing this row exists to remove, so the book's fold is imported rather
 * than re-derived. What is new here is only the PERIOD-neutral entry point and
 * the sentence.
 *
 * ── No target, no percentage, ever ──────────────────────────────────────────
 * The slice used to print *"Hours logged this year: N hours of 1000 target
 * (P% complete)"*. Owner decision, 2026-09-06: *"When we move to Texas hours
 * aren't the goal"* — so no hours surface in this product states a target, a
 * quota, a percentage or a share, and a model told a percentage will repeat it
 * to a parent in prose. What a prompt may be told is what was logged, by
 * subject, for a named period — the same claim the Review's *Hours and
 * Coverage* makes (`hoursLoggedLine`). Where a prompt needs urgency it gets
 * `UX-213`'s observed rate against a finite body of work, never a quota.
 *
 * The sentence is not literally shared with the client's `hoursLoggedLine`: that
 * one is fixed to *"this week"* and this one names whichever period its caller
 * read. What must not drift is the NUMBER, and that is the fold — which is
 * shared. The absence of a target is pinned by test rather than by prose.
 *
 * Pure — no Firestore read, no clock, nothing environment-specific.
 */

import {
  collectHoursContributions,
  type RawDayLog,
  type RawHoursAdjustment,
  type RawHoursEntry,
} from "../shared/hoursContributions.js";
import {
  summarizeHoursContributions,
  type HoursTotals,
} from "./tasks/monthlyHours.js";

export type { HoursTotals };

/**
 * The whole rule in one call, for any period: three sources in, the two numbers
 * a prompt may state out. Identical in behaviour to `computeMonthHours` — the
 * month is not special, and naming it period-neutrally is what lets the weekly
 * cron and the school-year slice share it without importing "monthly" anything.
 */
export function foldHoursForPrompt(
  dayLogs: RawDayLog[],
  hoursEntries: RawHoursEntry[],
  adjustments: RawHoursAdjustment[],
  childId?: string,
): HoursTotals {
  return summarizeHoursContributions(
    collectHoursContributions(dayLogs, hoursEntries, adjustments, childId),
  );
}

/** One decimal, with a trailing `.0` dropped: 4.8, 5, 0.5. */
function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return hours % 1 === 0 ? `${hours}` : (Math.round(hours * 10) / 10).toString();
}

/**
 * The hours block a prompt gets: a heading, the period in words, the counted
 * total and the per-subject split. Nothing else — no target, no percentage, no
 * share, no ranking.
 *
 * A period with nothing in it says so plainly rather than printing a zero row,
 * and a negative total (adjustments subtract, and a correction must subtract
 * everywhere) is reported as none rather than as a negative duration — the same
 * two rules `hoursLoggedLine` follows on the page.
 */
export function hoursLoggedBlock(
  heading: string,
  periodPhrase: string,
  totals: HoursTotals,
): string {
  const { totalMinutes, minutesBySubject } = totals;
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
    return `${heading}:\nNo hours logged ${periodPhrase}.`;
  }
  const lines = [
    `${heading}:`,
    `Hours logged ${periodPhrase}: ${formatHours(totalMinutes)} hours (${Math.round(totalMinutes)} min)`,
  ];
  const bySubject = Object.entries(minutesBySubject)
    .filter(([, minutes]) => minutes !== 0)
    .sort((a, b) => b[1] - a[1]);
  for (const [subject, minutes] of bySubject) {
    lines.push(`  - ${subject}: ${minutes} min`);
  }
  return lines.join("\n");
}
