import type { DadLabReport, HoursAdjustment } from '../../core/types'
import { DadLabStatus, LearningLocation, SubjectBucket } from '../../core/types/enums'
import type { DadLabType } from '../../core/types/enums'
import type { NewHoursAdjustment } from '../records/records.logic'
import { LAB_TYPE_SUBJECTS, subjectsForLabType } from './labTypeSubjects'

/**
 * DATA-16 — Dad Lab hours routing audit (read-only selector + proposal builder).
 *
 * WHY: historical completed `dadLabReports` may have an empty `subjectTags`
 * array. `useDadLabReports.syncComplianceHours` guards on
 * `report.subjectTags.length === 0` and writes **zero** hours for those, so
 * minutes the family actually spent never reached MO compliance totals. This
 * module is the pure, testable core of the in-app `?diag=1` audit that surfaces
 * those reports and proposes additive corrections.
 *
 * INVARIANTS (do not violate — see docs/review/REVIEW_HOME_BASE.md):
 *  - **Never rewrites stored hours or reports.** Corrections are NEW
 *    `hoursAdjustments` entries only (the additive correction path). This module
 *    only *reads* reports/adjustments and *builds* new-adjustment payloads; it
 *    performs no writes.
 *  - **No counting-rule change.** The built adjustments flow through the
 *    existing `collectHoursContributions` entry point unchanged — this file
 *    imports no counting code and touches none.
 *  - **DATA-04 whole-family credit.** Dad Lab credits every child; corrections
 *    use `childId: 'both'`, the DATA-09 whole-family attribution that
 *    `collectHoursContributions` counts for every child.
 */

/** The `source` stamp every adjustment this audit writes carries. Together with
 *  `labReportId` it is the idempotence key — a report already corrected by this
 *  audit is never proposed again. */
export const ROUTING_AUDIT_SOURCE = 'dad-lab-routing-audit'

/**
 * Two tiers, kept deliberately separate:
 *  - `empty-tags`  — the headline case: `subjectTags` empty → minutes routed to
 *    ZERO hours. Gets a propose→confirm write path.
 *  - `informational` — routed already, but the stored tags differ from what the
 *    `LAB_TYPE_SUBJECTS` mapping now implies (predates tag-stamping, or a coarse
 *    manual edit). Visibility only — NO write path in this run (open question in
 *    the DATA-16 ledger row).
 */
export type AuditTier = 'empty-tags' | 'informational'

export interface RoutingAuditRow {
  reportId: string
  title: string
  date: string
  labType: DadLabType
  minutes: number
  tier: AuditTier
  /** The report's current `subjectTags` (empty for the empty-tags tier). */
  currentTags: SubjectBucket[]
  /** `LAB_TYPE_SUBJECTS[labType]` — what the mapping implies. */
  impliedTags: SubjectBucket[]
  /** Minutes the ORIGINAL sync credited PER CHILD (0 for empty-tags). */
  writtenMinutesPerChild: number
  /** Minutes the mapping implies should be credited PER CHILD (DATA-04). */
  impliedMinutesPerChild: number
  /** `impliedMinutesPerChild − writtenMinutesPerChild` — the honest delta. For
   *  the empty-tags tier this is the full implied minutes. */
  deltaMinutesPerChild: number
  /** True when THIS audit has already written a correction for this report
   *  (idempotence guard) — the row renders as "already corrected", never
   *  proposes twice. */
  resolved: boolean
}

export interface RoutingAuditSummary {
  emptyTags: RoutingAuditRow[]
  informational: RoutingAuditRow[]
  /** Sum of the still-unresolved empty-tags rows' implied minutes, PER CHILD
   *  (each child is credited the same amount — DATA-04). */
  unroutedMinutesPerChild: number
  childIds: string[]
}

/**
 * Minutes credited PER CHILD for a given (minutes, tags) pair, computed EXACTLY
 * as `syncComplianceHours` does: `Math.round(minutes / tags.length)` per subject,
 * summed over the subjects. Empty tags → 0 (the silent zero-hours path). Kept
 * byte-identical to the sync so the reconstructed "what should have been
 * written" is honest.
 */
const creditedPerChild = (minutes: number, tags: SubjectBucket[]): number => {
  if (tags.length === 0 || minutes <= 0) return 0
  return Math.round(minutes / tags.length) * tags.length
}

/** Set-equality on subject buckets, order-independent. */
const sameTagSet = (a: SubjectBucket[], b: SubjectBucket[]): boolean => {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((s) => setB.has(s))
}

/** Has THIS audit already corrected the given report? Matches on the structured
 *  `source` + `labReportId` provenance the write path stamps — the idempotence
 *  guard. */
const isAlreadyCorrected = (
  reportId: string,
  adjustments: HoursAdjustment[],
): boolean =>
  adjustments.some(
    (a) => a.source === ROUTING_AUDIT_SOURCE && a.labReportId === reportId,
  )

/**
 * The read-only audit selector. Pure: given completed Dad Lab reports, the
 * family's existing hours adjustments, and the child ids, classify each report
 * into the two tiers and compute the honest per-child deltas.
 *
 * Only `complete` reports are considered (only completed labs sync hours).
 */
export function buildHoursRoutingAudit(
  reports: DadLabReport[],
  existingAdjustments: HoursAdjustment[],
  childIds: string[],
): RoutingAuditSummary {
  const emptyTags: RoutingAuditRow[] = []
  const informational: RoutingAuditRow[] = []

  const completed = reports
    .filter((r) => r.status === DadLabStatus.Complete && !!r.id)
    .sort((a, b) => b.date.localeCompare(a.date))

  for (const report of completed) {
    const minutes = report.totalMinutes ?? 0
    const currentTags = report.subjectTags ?? []
    const impliedTags = subjectsForLabType(report.labType)
    const resolved = isAlreadyCorrected(report.id!, existingAdjustments)

    if (currentTags.length === 0) {
      // Headline case: empty tags → zero hours written. Delta = full implied.
      const impliedMinutesPerChild = creditedPerChild(minutes, impliedTags)
      emptyTags.push({
        reportId: report.id!,
        title: report.title,
        date: report.date,
        labType: report.labType,
        minutes,
        tier: 'empty-tags',
        currentTags,
        impliedTags,
        writtenMinutesPerChild: 0,
        impliedMinutesPerChild,
        deltaMinutesPerChild: impliedMinutesPerChild,
        resolved,
      })
    } else if (minutes > 0 && !sameTagSet(currentTags, impliedTags)) {
      // Informational: routed already, but the stored tags differ from the
      // mapping. These DID credit hours — visibility only, no write path.
      const writtenMinutesPerChild = creditedPerChild(minutes, currentTags)
      const impliedMinutesPerChild = creditedPerChild(minutes, impliedTags)
      informational.push({
        reportId: report.id!,
        title: report.title,
        date: report.date,
        labType: report.labType,
        minutes,
        tier: 'informational',
        currentTags,
        impliedTags,
        writtenMinutesPerChild,
        impliedMinutesPerChild,
        deltaMinutesPerChild: impliedMinutesPerChild - writtenMinutesPerChild,
        resolved,
      })
    }
  }

  const unroutedMinutesPerChild = emptyTags
    .filter((r) => !r.resolved)
    .reduce((acc, r) => acc + r.impliedMinutesPerChild, 0)

  return { emptyTags, informational, unroutedMinutesPerChild, childIds }
}

/**
 * Build the additive `hoursAdjustments` payloads for ONE empty-tags row. Pure —
 * `createdAt` is injected so this stays deterministic/testable.
 *
 * Returns `[]` for anything that must not write: the informational tier (no
 * write path this run) or an already-resolved row (idempotence). One adjustment
 * per implied subject, `childId: 'both'` (DATA-04 whole-family), `minutes` split
 * exactly as `syncComplianceHours` splits (`Math.round(total / subjects)`),
 * `location: 'Home'` (matches the sync so Core-at-home is credited identically),
 * stamped with `source` + `labReportId` provenance and a human-readable reason.
 */
export function buildRoutingAdjustments(
  row: RoutingAuditRow,
  createdAt: string,
): NewHoursAdjustment[] {
  if (row.tier !== 'empty-tags' || row.resolved) return []
  const tags = row.impliedTags
  if (tags.length === 0 || row.minutes <= 0) return []

  const minutesPerSubject = Math.round(row.minutes / tags.length)
  if (minutesPerSubject <= 0) return []

  const reason =
    `Dad Lab routing audit 2026-07 — report ${row.reportId} (${row.title}, ${row.date}) ` +
    `had no subject tags; ${row.minutes}m credited per LAB_TYPE_SUBJECTS[${row.labType}]; ` +
    `whole-family per DATA-04.`

  return tags.map((subject) => ({
    // DATA-04 / DATA-09: 'both' is the whole-family attribution
    // `collectHoursContributions` counts for every child — same semantics as
    // the original Dad Lab sync's per-child fan-out.
    childId: 'both',
    date: row.date,
    minutes: minutesPerSubject,
    reason,
    subjectBucket: subject,
    location: LearningLocation.Home,
    source: ROUTING_AUDIT_SOURCE,
    labReportId: row.reportId,
    createdAt,
  }))
}

// Re-export for panel convenience without a second import site.
export { LAB_TYPE_SUBJECTS }
