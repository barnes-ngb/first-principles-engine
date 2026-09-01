/**
 * How a month of school becomes counted minutes — THE definition (ARCH-47 slice 4).
 *
 * ── One rule, two compilers ──────────────────────────────────────────────────
 * This is the counting path behind every hours figure the family has: the
 * Records page, the MO compliance dashboard, the compliance pack, the monthly
 * trend chart, and the monthly review book. It used to exist TWICE —
 * `collectHoursContributions` and its helpers in
 * `src/features/records/records.logic.ts` (plus `itemMatchesBlock` in
 * `src/core/utils/itemBlockMatch.ts`), and a hand-kept port in
 * `functions/src/ai/tasks/monthlyHours.ts` written for FEAT-164 so the book
 * would stop narrating a smaller month than the record it belongs to.
 *
 * The two copies were pinned by a PARITY FIXTURE repeated verbatim in both test
 * files. That fixture is now RETIRED: the rule has one definition, compiled by
 * BOTH projects, so a change that breaks a caller fails to COMPILE on the side
 * that broke rather than waiting for a test author to remember the fixture
 * exists. Its coverage survives in `hoursContributions.test.ts` as tests of the
 * one rule. See `functions/src/shared/README.md` for why the shared directory
 * lives under `functions/` and the four conventions it must honour.
 *
 * The app reaches in from the two files that already owned these exports —
 * `records.logic.ts` and `core/utils/itemBlockMatch.ts` — which keep their paths
 * and their TYPED signatures and delegate here, so every app call site
 * (`computeHoursSummary`, `computeMonthlyTrend`, `TodayChecklist`,
 * `liveDayEdit`, `watchItemCompletion`, the compliance pack, the data-review
 * export) is untouched and none of them was loosened to `unknown` to fit.
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 * Three additive sources, one child filter, one partial-day rule:
 *   1. hours entries (Dad Lab, manual, quest/evaluation sessions) — `minutes`,
 *      else `hours * 60` rounded; NON-POSITIVE entries are skipped;
 *   2. day logs — the partial-day rule below;
 *   3. adjustments (manual, backfill, video-watch, …) — EVERY doc is emitted,
 *      including zero and negative minutes, because a correction must subtract
 *      everywhere; and only when DATA-09-attributed to this child or to
 *      `'both'` (legitimate family-wide time). The former `!a.childId` clause
 *      silently widened unattributed docs onto BOTH kids — the DATA-05 leak;
 *      those legacy docs were migrated to `'both'`, which is hours-neutral.
 *
 * Partial-day rule (DATA-14), codified HERE and nowhere else: an item counts its
 * ACTUAL minutes if logged, else its PLANNED minutes if it is a COMPLETED
 * checklist item, else ZERO. Concretely — if ANY block carries `actualMinutes`,
 * the day is in block-actuals mode: untracked blocks count zero (the documented
 * partial-day edge) and each tracked block is emitted. In that mode we ALSO emit
 * any COMPLETED checklist item that does NOT correspond, via `itemMatchesBlock`,
 * to a block that already carries actuals — a matched item is skipped because
 * its time is already represented by the block it auto-stamped (no
 * double-count), while an unmatched carried-over item (rolled over from a prior
 * day, so it has no block) is no longer silently dropped. Unmatched items count
 * at Home: checklist work is assumed at the regular place of instruction, which
 * also repairs the MO core-at-home figure. Only when NO block tracked time does
 * the day fall back entirely to completed checklist items.
 *
 * `computeHoursSummary` (compliance totals) and `computeMonthlyTrend` (the trend
 * chart) both fold the SAME contribution list and differ only in how, so the
 * surfaces cannot drift (DATA-01 / DATA-11).
 *
 * ── Reading raw documents ────────────────────────────────────────────────────
 * Per this directory's rule 3, inputs are declared STRUCTURALLY and narrowed
 * rather than asserted: on the functions side these are unvalidated Firestore
 * documents. The app's `DayLog` / `HoursEntry` / `HoursAdjustment` are
 * structurally assignable to the `Raw*` shapes, so the app-side wrappers stay
 * typed for their own callers. On well-typed data the narrowing is invisible —
 * it only decides what happens to a field holding a value its type forbids
 * (a `NaN`, a string where a number is declared, a missing required field),
 * where it yields a defined number instead of propagating `NaN` or throwing.
 *
 * Pure — no Firestore read, no date validation, nothing environment-specific.
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

/**
 * A single minute contribution from one day log, after the partial-day rule has
 * been applied. `location` is the block's location (or `Home` for checklist
 * items, which are assumed at the regular place of instruction).
 */
export interface DayLogContribution {
  subjectBucket: string;
  minutes: number;
  location?: string;
}

/**
 * One counted minute contribution from any hours source, with the source it came
 * from. The full additive model is: hours entries + day logs + adjustments.
 */
export interface HoursContribution extends DayLogContribution {
  date: string;
  kind: "entry" | "day-log" | "adjustment";
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

// ── The rule ─────────────────────────────────────────────────────────────────

/**
 * Minutes on an hours entry: explicit `minutes` wins, else `hours * 60` rounded,
 * else zero.
 */
export function entryMinutes(entry: RawHoursEntry): number {
  const minutes = asNumber(entry?.minutes);
  if (minutes != null) return minutes;
  const hours = asNumber(entry?.hours);
  if (hours != null) return Math.round(hours * 60);
  return 0;
}

/** `"(25m)"` parsed out of a checklist label. */
function parseMinutesFromChecklist(label: string): number {
  const match = label.match(/\((\d+)m\)/);
  return match ? parseInt(match[1]) : 0;
}

/**
 * Item-level half of the partial-day rule, for a day block: ACTUAL minutes if
 * logged, else zero. A block's `plannedMinutes` never count — an untracked block
 * on a tracked day contributes nothing (the documented partial-day edge).
 */
function blockCountedMinutes(block: RawDayBlock): number {
  return asNumber(block?.actualMinutes) ?? 0;
}

/**
 * Item-level half of the partial-day rule, for a checklist item: PLANNED minutes
 * for a COMPLETED item (`estimatedMinutes ?? plannedMinutes ?? "(Nm)" parsed
 * from the label`), else zero. An item's own `actualMinutes` (quest/fluency
 * auto-complete) is deliberately NOT consulted — counting it would move stored
 * compliance totals (DATA-11).
 */
function checklistItemCountedMinutes(item: RawChecklistItem): number {
  if (item?.completed !== true) return 0;
  return (
    asNumber(item?.estimatedMinutes) ??
    asNumber(item?.plannedMinutes) ??
    parseMinutesFromChecklist(asString(item?.label) ?? "")
  );
}

/**
 * Does this completed checklist item represent the same work as this block? The
 * shared DATA-14 correspondence rule — the SINGLE answer, used in three places
 * that must agree:
 *  - `TodayChecklist` auto-stamps `actualMinutes` onto the matching block when an
 *    item is checked (and clears it on uncheck);
 *  - `dayLogMinuteContributions` (below) dedups completed checklist items against
 *    blocks that already carry actuals;
 *  - `liveDayEdit` / `watchItemCompletion` mirror the same correspondence when a
 *    live day is edited.
 *
 * Rule (kept byte-identical to the original TodayChecklist auto-set logic):
 *  - label match: the block's own checklist contains an entry whose `label`
 *    equals the item's `label`; OR
 *  - title match: the block has a `title` that either equals the item's label
 *    with a trailing `"(Nm)"` duration suffix stripped, or is a case-insensitive
 *    SUBSTRING of that cleaned label.
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
 * Canonical per-day-log minute extraction — the SINGLE source of truth for how a
 * day log converts into counted minutes, applying the partial-day rule described
 * in this module's header.
 */
export function dayLogMinuteContributions(
  log: RawDayLog,
): DayLogContribution[] {
  const out: DayLogContribution[] = [];
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
    // the blocks-with-actuals. Deduped via the SAME matcher TodayChecklist uses
    // to auto-stamp block minutes, so matched items stay represented by their
    // block (no double-count) and only genuinely-unmatched work is added (e.g.
    // an item rolled over from a prior day, which has no block).
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
        // Checklist completions are assumed at the regular place of instruction.
        location: LOCATION_HOME,
      });
    }
  }

  return out;
}

/**
 * THE single counting path for hours (DATA-11). Applies the child-id safety-net
 * filter and the DATA-09 child/`'both'` adjustment attribution ONCE, then emits
 * every counted minute from the three additive sources described in this
 * module's header.
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
  // Dad Lab). Legacy unattributed docs were migrated to 'both'.
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
