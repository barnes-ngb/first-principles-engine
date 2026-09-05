/**
 * Coverage Engine (was Pace Gauge)
 *
 * Calculates curriculum coverage status — what's been covered, what's current,
 * and what's upcoming. No pace pressure, no deadline math.
 */

import type {
  CurriculumPositionRecord,
  CurriculumSnapshot,
  PaceGaugeResult,
  WorkbookConfig,
} from '../../core/types'
import { PaceStatus } from '../../core/types/enums'
import { formatDateShort } from '../../core/utils/dateKey'

/**
 * Calculate coverage status for a single workbook.
 */
export function calculatePace(
  config: WorkbookConfig,
): PaceGaugeResult {
  const { totalUnits, currentPosition, unitLabel, name } = config
  const unit = unitLabel || 'lesson'

  // Determine coverage status
  let status: PaceStatus
  if (totalUnits <= 0) {
    // No total known — just track position
    status = currentPosition > 0 ? PaceStatus.Current : PaceStatus.NotStarted
  } else if (currentPosition >= totalUnits) {
    status = PaceStatus.Explored
  } else if (currentPosition > 0) {
    status = PaceStatus.Current
  } else {
    status = PaceStatus.NotStarted
  }

  // Build coverage text
  let coverageText: string
  if (totalUnits > 0 && currentPosition >= totalUnits) {
    coverageText = 'Complete!'
  } else if (currentPosition <= 0) {
    coverageText = 'Not started'
  } else if (totalUnits > 0) {
    coverageText = `${unit.charAt(0).toUpperCase() + unit.slice(1)} ${currentPosition} of ${totalUnits} covered`
  } else {
    coverageText = `${unit.charAt(0).toUpperCase() + unit.slice(1)} ${currentPosition} reached`
  }

  return {
    workbookName: name,
    currentPosition,
    totalUnits,
    unitLabel: unit,
    status,
    coverageText,
  }
}

/**
 * Build a human-readable coverage suggestion.
 */
export function buildPaceSuggestion(
  status: PaceStatus,
  _requiredPerWeek: number,
  _plannedPerWeek: number,
  unitLabel: string,
): string {
  switch (status) {
    case PaceStatus.Explored:
      return `All ${unitLabel}s covered. Ready for the next level or deeper practice.`
    case PaceStatus.Current:
      return `Currently working through ${unitLabel}s. Keep going at a comfortable pace.`
    case PaceStatus.Upcoming:
      return `More ${unitLabel}s ahead. No rush — cover what's ready.`
    case PaceStatus.NotStarted:
      return `Not yet started. Jump in when ready.`
  }
}

/**
 * Calculate coverage for multiple workbooks.
 */
export function calculateAllPaces(
  configs: WorkbookConfig[],
): PaceGaugeResult[] {
  return configs.map((config) => calculatePace(config))
}

// ── Observed coverage rate (UX-213) — PARENT-ONLY ────────────────────────────
//
// Everything above this line is the child-facing coverage engine, and it is
// unchanged: no pace pressure, no deadline math, `buildPaceSuggestion`'s
// `_requiredPerWeek` / `_plannedPerWeek` still ignored. That decision was right
// and is not being reversed — it protects a child from "you're behind".
//
// What it also did, as a side effect, was stop the ADULTS noticing that a month
// went by. So the same data gets a second reading with a different audience:
//
//   the child reads   "Lesson 14 of 60 covered."      (calculatePace, above)
//   the parent reads  "4 lessons in 3 weeks."         (this section)
//
// The audience rule is the whole design. Nothing below this line may reach a
// kid-facing surface — see `WeekPaceSection`, which is capability-gated, and the
// invariant test that asserts it renders for a parent and not for a child.
//
// Three further rules, all load-bearing:
//   • **Observed only, never required.** No "should be at lesson 22", no
//     projected finish date, no threshold, nothing red, no "behind".
//   • **A number that cannot be computed is reported as unknown.** There is no
//     position history in this repo, so a rate needs two recorded snapshots;
//     with one, the line says so rather than estimating from anything.
//   • **Zero is reported plainly.** "No lessons covered in 3 weeks" is the
//     sentence that does the work, and it is not softened in either direction.

/** Two snapshots must be at least this far apart to describe a rate. */
export const MIN_BASELINE_DAYS = 7

/** The one thing said when positions are recorded but no baseline exists yet. */
export const NO_BASELINE_NOTICE = 'First week recorded — a rate needs two.'

export type ObservedCoverageKind = 'covered' | 'none' | 'adjusted'

export interface ObservedCoverage {
  configId: string
  name: string
  unitLabel: string
  currentPosition: number
  totalUnits?: number
  kind: ObservedCoverageKind
  /** Units covered since the baseline. `0` for `none`; unused for `adjusted`. */
  unitsCovered: number
  /** Whole weeks between the two recordings, never below 1. */
  weeks: number
  /** `YYYY-MM-DD` of the baseline recording — the "since" in the sentence. */
  since: string
  line: string
}

export interface ObservedCoverageResult {
  /** ISO timestamp of the baseline used, or `null` when none was usable. */
  baselineRecordedAt: string | null
  entries: ObservedCoverage[]
  /** `NO_BASELINE_NOTICE` when a rate is not yet possible, else `null`. */
  notice: string | null
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)

/**
 * Narrow one stored snapshot read straight off a `weeklyReviews` doc.
 *
 * These are unvalidated Firestore documents written by a Cloud Function whose
 * `WeeklyReviewDoc` is a hand-kept parallel of `WeeklyReview`, so an off-shape
 * value is possible in a way the types do not admit. Anything that is not a
 * usable position is dropped rather than coerced — an unknown position must
 * read as unknown, never as zero, because zero is a claim ("no lessons
 * covered") this module would then make on no evidence.
 */
export function normalizeCurriculumSnapshot(
  raw: unknown,
): CurriculumSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.recordedAt !== 'string' || obj.recordedAt === '') return null
  if (!Array.isArray(obj.positions)) return null

  const positions: CurriculumPositionRecord[] = []
  for (const entry of obj.positions) {
    if (!entry || typeof entry !== 'object') continue
    const p = entry as Record<string, unknown>
    if (typeof p.configId !== 'string' || p.configId === '') continue
    if (!isFiniteNumber(p.currentPosition)) continue
    const record: CurriculumPositionRecord = {
      configId: p.configId,
      name: typeof p.name === 'string' && p.name ? p.name : 'Workbook',
      currentPosition: p.currentPosition,
    }
    if (isFiniteNumber(p.totalUnits) && p.totalUnits > 0) {
      record.totalUnits = p.totalUnits
    }
    if (typeof p.unitLabel === 'string' && p.unitLabel) {
      record.unitLabel = p.unitLabel
    }
    if (p.completed === true) record.completed = true
    positions.push(record)
  }

  return {
    recordedAt: obj.recordedAt,
    weekKey: typeof obj.weekKey === 'string' ? obj.weekKey : '',
    positions,
  }
}

const daysBetween = (earlierIso: string, laterIso: string): number | null => {
  const a = Date.parse(earlierIso)
  const b = Date.parse(laterIso)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return (b - a) / 86_400_000
}

/**
 * Pick the most recent earlier snapshot that is far enough back to describe a
 * rate against.
 *
 * The gap is measured on `recordedAt`, **not** on the week the review belongs
 * to, because a parent may regenerate an old review at any time — which
 * re-reads today's positions and stamps them onto a months-old week. Measuring
 * on the week key would then report "no lessons covered in 3 weeks" about two
 * readings taken minutes apart. The recorded moment is the only thing that is
 * actually true about when the positions were seen, so it is what the rate and
 * the "since" date are both built from.
 */
export function selectBaselineSnapshot(
  current: CurriculumSnapshot,
  priors: CurriculumSnapshot[],
): CurriculumSnapshot | null {
  const usable = priors
    .filter((s) => s.positions.length > 0)
    .filter((s) => {
      const gap = daysBetween(s.recordedAt, current.recordedAt)
      return gap !== null && gap >= MIN_BASELINE_DAYS
    })
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
  return usable[0] ?? null
}

/** `lesson 14 of 60`, or `lesson 14` when the total is unknown. */
function positionPhrase(
  currentPosition: number,
  unitLabel: string,
  totalUnits?: number,
): string {
  if (totalUnits && totalUnits > 0) {
    return `${unitLabel} ${currentPosition} of ${totalUnits}`
  }
  return `${unitLabel} ${currentPosition}`
}

const plural = (n: number, unit: string): string =>
  `${n} ${unit}${n === 1 ? '' : 's'}`

function buildLine(entry: Omit<ObservedCoverage, 'line'>): string {
  const where = positionPhrase(
    entry.currentPosition,
    entry.unitLabel,
    entry.totalUnits,
  )
  const head = `${entry.name} — ${where}.`
  const weeks = plural(entry.weeks, 'week')
  const since = formatDateShort(entry.since)

  if (entry.kind === 'adjusted') {
    return `${head} The recorded position moved back since ${since}, so there is no rate to report.`
  }
  if (entry.kind === 'none') {
    return `${head} No ${entry.unitLabel}s covered in ${weeks} (since ${since}).`
  }
  return `${head} ${plural(entry.unitsCovered, entry.unitLabel)} in ${weeks} (since ${since}).`
}

/**
 * What was observed between the week's recorded positions and the most recent
 * usable earlier ones. Pure — no clock, no Firestore, no estimation.
 *
 * Silence is a valid answer, and the common one:
 *   • no snapshot for this week at all → `{ entries: [], notice: null }`;
 *   • positions but no usable baseline → `NO_BASELINE_NOTICE`;
 *   • a workbook absent from the baseline → omitted, with nothing said about it;
 *   • a workbook already marked finished → omitted, because a finished program's
 *     position stops moving and "no lessons covered" would be a false alarm.
 */
export function computeObservedCoverage(
  current: CurriculumSnapshot | null | undefined,
  priors: CurriculumSnapshot[],
): ObservedCoverageResult {
  if (!current || current.positions.length === 0) {
    return { baselineRecordedAt: null, entries: [], notice: null }
  }

  const baseline = selectBaselineSnapshot(current, priors)
  if (!baseline) {
    return { baselineRecordedAt: null, entries: [], notice: NO_BASELINE_NOTICE }
  }

  const gapDays = daysBetween(baseline.recordedAt, current.recordedAt) ?? 0
  const weeks = Math.max(1, Math.round(gapDays / 7))
  const since = baseline.recordedAt.slice(0, 10)
  const byId = new Map(baseline.positions.map((p) => [p.configId, p]))

  const entries: ObservedCoverage[] = []
  for (const position of current.positions) {
    if (position.completed) continue
    const before = byId.get(position.configId)
    if (!before) continue

    const delta = position.currentPosition - before.currentPosition
    const kind: ObservedCoverageKind =
      delta < 0 ? 'adjusted' : delta === 0 ? 'none' : 'covered'
    const partial: Omit<ObservedCoverage, 'line'> = {
      configId: position.configId,
      name: position.name,
      unitLabel: position.unitLabel || before.unitLabel || 'lesson',
      currentPosition: position.currentPosition,
      totalUnits: position.totalUnits,
      kind,
      unitsCovered: Math.max(0, delta),
      weeks,
      since,
    }
    entries.push({ ...partial, line: buildLine(partial) })
  }

  return { baselineRecordedAt: baseline.recordedAt, entries, notice: null }
}

/**
 * Default weekly structure that creates buffer days.
 * Mon/Tue = new instruction + hardest skill
 * Wed = light day (appointments default here)
 * Thu = reinforce + short test
 * Fri = catch-up / project / review
 */
export const DEFAULT_WEEK_STRUCTURE = {
  Monday: { focus: 'new-instruction', intensity: 'high' },
  Tuesday: { focus: 'new-instruction', intensity: 'high' },
  Wednesday: { focus: 'light-day', intensity: 'low' },
  Thursday: { focus: 'reinforce', intensity: 'medium' },
  Friday: { focus: 'catch-up', intensity: 'low' },
} as const
