/**
 * "How many minutes did this child actually school this month" — the
 * functions-side PORT of `collectHoursContributions` and its two helpers
 * (`dayLogMinuteContributions`, `entryMinutes`) from
 * `src/features/records/records.logic.ts`, plus `itemMatchesBlock` from
 * `src/core/utils/itemBlockMatch.ts`.
 *
 * ── Why a port and not an import ─────────────────────────────────────────────
 * `functions/` cannot import from `src/`. Two independent walls, both measured
 * against this exact import (FEAT-163, re-confirmed for FEAT-164):
 *   - `functions/tsconfig.json` sets `rootDir: "./src"`, so any file outside
 *     `functions/src` in the program is TS6059 ("not under rootDir");
 *   - functions compiles with `moduleResolution: "node16"`, under which the
 *     app's own extensionless relative imports (`./enums`) are TS2835.
 * So this is a deliberate second implementation, like `sanitizeJson`. It MUST
 * stay rule-identical to the app-side path; a fixture shared verbatim with
 * `src/features/records/records.logic.test.ts` pins the two together — see
 * `PARITY_FIXTURE` in `monthlyHours.test.ts`, and the mirrored "functions-side
 * port" case in the app-side test.
 *
 * ── The walls are real, but they are not the whole story (ARCH-47) ───────────
 * `functions/src/shared/` now holds rules with exactly ONE definition, compiled
 * by both projects: the shared directory sits INSIDE `functions/src` (so
 * `rootDir` is satisfied and `functions/lib/index.js` never moves) and the app
 * reaches in. `dadLabReportArtifacts` moved there in slice 1, and the doc-id
 * helper this file used to carry inline moved there in slice 2 — it is now
 * `functions/src/shared/docId.ts`, imported by `monthlyReviewData.ts` directly.
 * THIS rule is slice 4, deliberately last: it is the largest, and it is
 * compliance math, which `CLAUDE.md` names propose-and-confirm. Until then the
 * parity fixture above is still the only thing holding the two copies together.
 *
 * ── Why it exists (FEAT-164) ─────────────────────────────────────────────────
 * The monthly review book used to total the `hours` collection ALONE, while the
 * Records page has always computed the child's figure from THREE additive
 * sources — hours entries + day logs + adjustments — through
 * `collectHoursContributions`, "the SINGLE source of truth for how a day log
 * converts into counted minutes… so the two can never diverge (DATA-01)". The
 * book was therefore narrating a smaller month than the record it is meant to
 * be part of (Lincoln, Aug 2026: 34.7 h in the book vs 50.0 h in the app), and
 * because the shortfall is per-subject it could also rank the wrong subject as
 * the month's biggest. Owner decision, 2026-08-29: the book counts all the
 * hours, by the same rule the Records page uses. The book agrees with the
 * record; never the reverse.
 *
 * ── The rule (ported verbatim — do not "improve" it here) ────────────────────
 * Three additive sources, one child filter, one partial-day rule:
 *   1. hours entries — `minutes`, else `hours * 60`; non-positive skipped;
 *   2. day logs — the partial-day rule (below);
 *   3. adjustments — EVERY doc, including zero and negative corrections, and
 *      only when DATA-09-attributed to this child or to `'both'`.
 * Partial-day rule (DATA-14): if ANY block carries `actualMinutes`, the day is
 * in block-actuals mode — untracked blocks count zero, each tracked block is
 * emitted, and any COMPLETED checklist item that does NOT match a
 * block-with-actuals (via `itemMatchesBlock`) is ALSO emitted at Home, so a
 * carried-over item with no block is not silently dropped. Only when NO block
 * tracked time does the day fall back entirely to completed checklist items.
 */

/** The `'Home'` member of `LearningLocation` (`src/core/types/enums.ts`). */
export const LOCATION_HOME = "Home";

/** The DATA-09 sentinel meaning "family-wide time, counts for every child". */
export const ADJUSTMENT_BOTH = "both";

/** One checklist item. Loosely typed — this reads raw Firestore data. */
export interface RawChecklistItem {
  label?: unknown;
  completed?: unknown;
  estimatedMinutes?: unknown;
  plannedMinutes?: unknown;
  subjectBucket?: unknown;
}

/** One day block. Loosely typed — this reads raw Firestore data. */
export interface RawDayBlock {
  title?: unknown;
  subjectBucket?: unknown;
  location?: unknown;
  actualMinutes?: unknown;
  checklist?: unknown;
}

/** The subset of a `days` doc this module reads. */
export interface RawDayLog {
  childId?: unknown;
  date?: unknown;
  blocks?: unknown;
  checklist?: unknown;
}

/** The subset of an `hours` doc this module reads. */
export interface RawHoursEntry {
  childId?: unknown;
  date?: unknown;
  minutes?: unknown;
  hours?: unknown;
  subjectBucket?: unknown;
  location?: unknown;
}

/** The subset of an `hoursAdjustments` doc this module reads. */
export interface RawHoursAdjustment {
  childId?: unknown;
  date?: unknown;
  minutes?: unknown;
  subjectBucket?: unknown;
  location?: unknown;
}

/** One counted minute contribution, with the source it came from. Port of
 *  `HoursContribution` (`records.logic.ts`). */
export interface HoursContribution {
  date: string;
  kind: "entry" | "day-log" | "adjustment";
  subjectBucket: string;
  minutes: number;
  location?: string;
}

/** The month figure the book reads: a total and the per-subject split the
 *  prose ranks subjects off. */
export interface HoursTotals {
  totalMinutes: number;
  minutesBySubject: Record<string, number>;
}

// ── Narrowing helpers (this module reads untyped docs) ───────────────────────

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** `subjectBucket` with the shared `'Other'` default every source applies. */
function bucketOf(value: unknown): string {
  return asString(value) ?? "Other";
}

// ── The ported rule ──────────────────────────────────────────────────────────

/**
 * Minutes on an hours entry. Port of `entryMinutes` (`records.logic.ts`):
 * explicit `minutes` wins, else `hours * 60` rounded, else zero.
 */
export function entryMinutes(entry: RawHoursEntry): number {
  const minutes = asNumber(entry?.minutes);
  if (minutes != null) return minutes;
  const hours = asNumber(entry?.hours);
  if (hours != null) return Math.round(hours * 60);
  return 0;
}

/** `"(25m)"` parsed out of a checklist label. Port of
 *  `parseMinutesFromChecklist` (`records.logic.ts`). */
function parseMinutesFromChecklist(label: string): number {
  const match = label.match(/\((\d+)m\)/);
  return match ? parseInt(match[1]) : 0;
}

/** Item-level half of the partial-day rule, for a day block: ACTUAL minutes if
 *  logged, else zero. A block's `plannedMinutes` never count. */
function blockCountedMinutes(block: RawDayBlock): number {
  return asNumber(block?.actualMinutes) ?? 0;
}

/** Item-level half of the partial-day rule, for a checklist item: PLANNED
 *  minutes for a COMPLETED item, else zero. The item's own `actualMinutes` is
 *  deliberately NOT consulted — counting it would move stored compliance
 *  totals (DATA-11). */
function checklistItemCountedMinutes(item: RawChecklistItem): number {
  if (item?.completed !== true) return 0;
  return (
    asNumber(item?.estimatedMinutes) ??
    asNumber(item?.plannedMinutes) ??
    parseMinutesFromChecklist(asString(item?.label) ?? "")
  );
}

/**
 * Does this completed checklist item represent the same work as this block?
 * Port of `itemMatchesBlock` (`src/core/utils/itemBlockMatch.ts`) — the shared
 * DATA-14 correspondence rule, kept byte-identical so a matched item stays
 * represented by its block and is not double-counted.
 */
export function itemMatchesBlock(
  item: RawChecklistItem,
  block: RawDayBlock,
): boolean {
  const itemLabel = asString(item?.label) ?? "";
  const matchesLabel = asArray(block?.checklist).some(
    (ci) => asString((ci as RawChecklistItem | null)?.label) === itemLabel,
  );
  const titleClean = itemLabel.replace(/\s*\(\d+m\)\s*$/, "");
  const blockTitle = asString(block?.title);
  const matchesTitle =
    blockTitle != null &&
    (blockTitle === titleClean ||
      titleClean.toLowerCase().includes(blockTitle.toLowerCase()));
  return matchesLabel || matchesTitle;
}

/**
 * Canonical per-day-log minute extraction. Port of
 * `dayLogMinuteContributions` (`records.logic.ts`) — keep the two in lockstep.
 */
export function dayLogMinuteContributions(
  log: RawDayLog,
): Array<{ subjectBucket: string; minutes: number; location?: string }> {
  const out: Array<{ subjectBucket: string; minutes: number; location?: string }> = [];
  const blocks = asArray(log?.blocks) as RawDayBlock[];
  const blocksWithActuals = blocks.filter((b) => blockCountedMinutes(b) > 0);
  const hasActualBlockMinutes = blocksWithActuals.length > 0;
  const checklist = asArray(log?.checklist) as RawChecklistItem[];

  if (hasActualBlockMinutes) {
    for (const block of blocks) {
      const minutes = blockCountedMinutes(block);
      if (minutes <= 0) continue;
      out.push({
        subjectBucket: bucketOf(block?.subjectBucket),
        minutes,
        location: asString(block?.location),
      });
    }
    // DATA-14: carry completed checklist items that have no counterpart among
    // the blocks-with-actuals. Deduped via the SAME matcher, so matched items
    // stay represented by their block and only genuinely-unmatched work is
    // added (e.g. an item rolled over from a prior day, which has no block).
    for (const item of checklist) {
      const minutes = checklistItemCountedMinutes(item);
      if (minutes <= 0) continue;
      if (blocksWithActuals.some((block) => itemMatchesBlock(item, block))) continue;
      out.push({
        subjectBucket: bucketOf(item?.subjectBucket),
        minutes,
        // Checklist completions are assumed at the regular place of instruction.
        location: LOCATION_HOME,
      });
    }
  } else {
    for (const item of checklist) {
      const minutes = checklistItemCountedMinutes(item);
      if (minutes <= 0) continue;
      out.push({
        subjectBucket: bucketOf(item?.subjectBucket),
        minutes,
        location: LOCATION_HOME,
      });
    }
  }

  return out;
}

/**
 * THE single counting path for hours. Port of `collectHoursContributions`
 * (`records.logic.ts`, DATA-11) — keep the two in lockstep.
 */
export function collectHoursContributions(
  dayLogs: RawDayLog[],
  hoursEntries: RawHoursEntry[],
  adjustments: RawHoursAdjustment[],
  childId?: string,
): HoursContribution[] {
  // When childId is provided, enforce filtering as a safety net.
  const filteredLogs = childId
    ? dayLogs.filter((l) => l?.childId === childId)
    : dayLogs;
  const filteredEntries = childId
    ? hoursEntries.filter((e) => e?.childId === childId)
    : hoursEntries;
  // DATA-09: explicit attribution — an adjustment counts for this child only
  // when it is tagged to them or to 'both' (legitimate family-wide time, e.g.
  // Dad Lab). Legacy unattributed docs were migrated to 'both' app-side.
  const filteredAdj = childId
    ? adjustments.filter(
        (a) => a?.childId === childId || a?.childId === ADJUSTMENT_BOTH,
      )
    : adjustments;

  const out: HoursContribution[] = [];

  // ── SOURCE 1: Hours entries (Dad Lab, manual entries, etc.) ──
  for (const entry of filteredEntries) {
    const minutes = entryMinutes(entry);
    if (minutes <= 0) continue;
    out.push({
      kind: "entry",
      date: asString(entry?.date) ?? "",
      subjectBucket: bucketOf(entry?.subjectBucket),
      minutes,
      location: asString(entry?.location),
    });
  }

  // ── SOURCE 2: Day logs (block actuals preferred, else completed checklist) ──
  for (const log of filteredLogs) {
    for (const contribution of dayLogMinuteContributions(log)) {
      out.push({ kind: "day-log", date: asString(log?.date) ?? "", ...contribution });
    }
  }

  // ── SOURCE 3: Adjustments — every doc counts, including negative corrections
  // (no minutes guard, unlike entries). ──
  for (const adj of filteredAdj) {
    out.push({
      kind: "adjustment",
      date: asString(adj?.date) ?? "",
      subjectBucket: bucketOf(adj?.subjectBucket),
      minutes: asNumber(adj?.minutes) ?? 0,
      location: asString(adj?.location),
    });
  }

  return out;
}

/**
 * Fold the contributions into the two numbers the book reads. Mirrors the
 * `bySubject` accumulation in `computeHoursSummary` — the total is the sum of
 * the per-subject rows, so the two can never disagree with each other. The
 * home / core / adjustment splits `computeHoursSummary` also derives are
 * compliance-side concerns the book has no use for and are not ported.
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
