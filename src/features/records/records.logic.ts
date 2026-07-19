import JSZip from 'jszip'

import type {
  Artifact,
  ChecklistItem,
  DayBlock,
  DayLog,
  Evaluation,
  HoursAdjustment,
  HoursEntry,
} from '../../core/types'
import {
  LearningLocation,
  SubjectBucket,
  SubjectBucketLabel,
} from '../../core/types/enums'
import { formatDateForCsv, toCsvValue } from '../../core/utils/format'
import { deriveChildIdFromDocId } from '../../core/utils/docId'
import { itemMatchesBlock } from '../../core/utils/itemBlockMatch'
import {
  getStateConfig,
  type HomeschoolState,
} from '../../core/compliance/stateCompliance'

export { deriveChildIdFromDocId }

// ─── Hours Summary ───────────────────────────────────────────────────────────

// DATA-12: the core-subject set is sourced from the MO compliance config so the
// required-subject list lives in one place. MO is the default and these are the
// same five subjects as before — the counting path (computeHoursSummary) is
// byte-identical. (The counting itself is intentionally NOT parametrized by
// state; TX simply imposes no hours target — see ComplianceDashboard.)
const coreBuckets = new Set<SubjectBucket>(
  getStateConfig('MO').requiredCoreSubjects,
)

export type HoursSummaryRow = {
  subjectBucket: string
  totalMinutes: number
  homeMinutes: number
}

export type HoursSummary = {
  totalMinutes: number
  coreMinutes: number
  /** Home minutes across ALL subjects (core + non-core). */
  homeMinutes: number
  /** Home minutes for CORE subjects only — the MO "≥600 at home" metric. */
  coreHomeMinutes: number
  adjustmentMinutes: number
  bySubject: HoursSummaryRow[]
  byDate: Record<string, number>
}

// ─── DATA-05 / DATA-09: per-kid adjustment attribution ───────────────────────
//
// `HoursAdjustment.childId` is optional on the READ type because legacy
// documents exist without it. Every adjustment we WRITE must be attributed to a
// child (or explicitly to 'both'): new writes go through `NewHoursAdjustment` +
// `assertAttributed` so a `childId` can never be omitted at the source.
//
// DATA-09 closed the read-side leak: the read filter (now in ONE place —
// `collectHoursContributions`, consumed by both `computeHoursSummary` and
// `computeMonthlyTrend`) previously folded unattributed (`!a.childId`)
// adjustments into EVERY child's totals (silently inflating both kids — the
// DATA-05 leak). It now matches `childId === child || childId === 'both'`, so a
// 'both' adjustment counts for both kids (legitimate family-wide time) while a
// child-tagged one counts only for that child. The already-stored unattributed
// docs are migrated to 'both' (`migrateUnattributedAdjustments`), which
// preserves their prior count-for-both behavior — hours-neutral by design.

/** A hours adjustment guaranteed to carry a `childId` — the shape every new
 *  write must use so it can never be counted toward another child (DATA-05). */
export type NewHoursAdjustment = Omit<HoursAdjustment, 'id' | 'childId'> & {
  childId: string
}

/** Runtime guard for the write path: throws if a record would be persisted
 *  without a `childId`. Pure + testable; callers pass the assembled payload and
 *  receive it back unchanged when valid. Generic so it guards both adjustment
 *  writes (`NewHoursAdjustment`) and normal hours-entry writes (FEAT-24 Quick
 *  Add) — any payload that carries a required `childId`. */
export const assertAttributed = <T extends { childId: string }>(entry: T): T => {
  if (!entry.childId) {
    throw new Error('hours write requires a childId (DATA-05 attribution)')
  }
  return entry
}

export const entryMinutes = (entry: HoursEntry): number => {
  if (entry.minutes != null) return entry.minutes
  if (entry.hours != null) return Math.round(entry.hours * 60)
  return 0
}

function parseMinutesFromChecklist(label: string): number {
  const match = label.match(/\((\d+)m\)/)
  return match ? parseInt(match[1]) : 0
}

/** A single minute contribution from one day log, after the canonical
 *  block-vs-checklist rule has been applied. `location` is the block's location
 *  (or `Home` for checklist items, which are assumed at-home). */
export type DayLogContribution = {
  subjectBucket: string
  minutes: number
  location?: string
}

/** Item-level half of the partial-day rule, for a day block: ACTUAL minutes if
 *  logged, else zero. A block's `plannedMinutes` never count — an untracked
 *  block on a tracked day contributes nothing (the documented partial-day
 *  edge). */
const blockCountedMinutes = (block: DayBlock): number => block.actualMinutes ?? 0

/** Item-level half of the partial-day rule, for a checklist item: PLANNED
 *  minutes for a COMPLETED item (`estimatedMinutes ?? plannedMinutes ?? "(Nm)"
 *  parsed from the label`), else zero. An item's own `actualMinutes`
 *  (quest/fluency auto-complete) is deliberately NOT consulted — counting it
 *  would move stored compliance totals (DATA-11). */
const checklistItemCountedMinutes = (item: ChecklistItem): number => {
  if (!item.completed) return 0
  return (
    item.estimatedMinutes ??
    item.plannedMinutes ??
    parseMinutesFromChecklist(item.label)
  )
}

/**
 * Canonical per-day-log minute extraction — the SINGLE source of truth for how a
 * day log converts into counted minutes. Used by both `computeHoursSummary`
 * (totals / compliance) and `computeMonthlyTrend` (the trend chart) so the two
 * can never diverge (DATA-01).
 *
 * Partial-day rule (codified HERE, nowhere else): an item counts its ACTUAL
 * minutes if logged, else its PLANNED minutes if it is a completed checklist
 * item, else ZERO. Concretely: if ANY block has tracked `actualMinutes`, the
 * day is in block-actuals mode — untracked blocks count zero, and each block
 * actual is emitted. DATA-14: in that mode we ALSO emit any COMPLETED checklist
 * item that does NOT correspond (via the shared `itemMatchesBlock` matcher) to
 * a block that already carries `actualMinutes`. A matched item is skipped — its
 * time is already represented by the block it auto-stamped, so it is not
 * double-counted — while an unmatched carried-over item (e.g. rolled over from
 * a prior day, which has no block) is no longer silently dropped. Unmatched
 * items count at Home (checklist work is assumed at the regular place of
 * instruction; this also repairs the Core-at-home figure). Only when NO block
 * tracked time does the day fall back entirely to completed checklist items via
 * `checklistItemCountedMinutes`.
 */
export const dayLogMinuteContributions = (log: DayLog): DayLogContribution[] => {
  const out: DayLogContribution[] = []
  const blocksWithActuals = log.blocks.filter((b) => blockCountedMinutes(b) > 0)
  const hasActualBlockMinutes = blocksWithActuals.length > 0

  if (hasActualBlockMinutes) {
    for (const block of log.blocks) {
      const minutes = blockCountedMinutes(block)
      if (minutes <= 0) continue
      out.push({
        subjectBucket: block.subjectBucket ?? 'Other',
        minutes,
        location: block.location,
      })
    }
    // DATA-14: carry completed checklist items that have no counterpart among
    // the blocks-with-actuals. Deduped via the SAME matcher TodayChecklist uses
    // to auto-stamp block minutes, so matched items stay represented by their
    // block (no double-count) and only genuinely-unmatched work is added.
    for (const item of log.checklist ?? []) {
      const minutes = checklistItemCountedMinutes(item)
      if (minutes <= 0) continue
      if (blocksWithActuals.some((block) => itemMatchesBlock(item, block))) continue
      out.push({
        subjectBucket: item.subjectBucket ?? 'Other',
        minutes,
        // Checklist completions are assumed at the regular place of instruction.
        location: LearningLocation.Home,
      })
    }
  } else if (log.checklist) {
    for (const item of log.checklist) {
      const minutes = checklistItemCountedMinutes(item)
      if (minutes <= 0) continue
      out.push({
        subjectBucket: item.subjectBucket ?? 'Other',
        minutes,
        // Checklist completions are assumed at the regular place of instruction.
        location: LearningLocation.Home,
      })
    }
  }

  return out
}

// ─── Shared counting path (DATA-11) ─────────────────────────────────────────

/** One counted minute contribution from any hours source, with the source it
 *  came from. The full additive model is: hours entries + day logs +
 *  adjustments. */
export type HoursContribution = DayLogContribution & {
  date: string
  kind: 'entry' | 'day-log' | 'adjustment'
}

/**
 * THE single counting path for hours (DATA-11). Applies the child-id
 * safety-net filter and the DATA-09 child/'both' adjustment attribution ONCE,
 * then emits every counted minute from the three additive sources:
 *
 *   1. hours entries (Dad Lab, manual, quest/evaluation sessions) — non-positive
 *      entries are skipped;
 *   2. day logs — via `dayLogMinuteContributions` (the partial-day rule);
 *   3. adjustments (manual, backfill, video-watch, …) — ALL emitted, including
 *      zero and negative minutes (corrections must subtract everywhere).
 *
 * `computeHoursSummary` (compliance totals) and `computeMonthlyTrend` (the
 * trend chart) both consume this list and only differ in how they fold it, so
 * the surfaces cannot drift.
 */
export const collectHoursContributions = (
  dayLogs: DayLog[],
  hoursEntries: HoursEntry[],
  adjustments: HoursAdjustment[],
  childId?: string,
): HoursContribution[] => {
  // When childId is provided, enforce filtering as a safety net.
  const filteredLogs = childId
    ? dayLogs.filter((l) => l.childId === childId)
    : dayLogs
  const filteredEntries = childId
    ? hoursEntries.filter((e) => e.childId === childId)
    : hoursEntries
  // DATA-09: explicit attribution — an adjustment counts for this child only
  // when it is tagged to them or to 'both' (legitimate family-wide time, e.g.
  // Dad Lab). The former `!a.childId` clause silently widened unattributed docs
  // onto BOTH kids (the DATA-05 leak); those legacy docs are migrated to 'both'.
  const filteredAdj = childId
    ? adjustments.filter((a) => a.childId === childId || a.childId === 'both')
    : adjustments

  const out: HoursContribution[] = []

  // ── SOURCE 1: Hours entries (Dad Lab, manual entries, etc.) ──
  for (const entry of filteredEntries) {
    const minutes = entryMinutes(entry)
    if (minutes <= 0) continue
    out.push({
      kind: 'entry',
      date: entry.date,
      subjectBucket: entry.subjectBucket ?? 'Other',
      minutes,
      location: entry.location,
    })
  }

  // ── SOURCE 2: Day logs (block actuals preferred, else completed checklist) ──
  for (const log of filteredLogs) {
    for (const contribution of dayLogMinuteContributions(log)) {
      out.push({ kind: 'day-log', date: log.date, ...contribution })
    }
  }

  // ── SOURCE 3: Adjustments — every doc counts, including negative corrections
  // (no minutes guard, unlike entries). ──
  for (const adj of filteredAdj) {
    out.push({
      kind: 'adjustment',
      date: adj.date,
      subjectBucket: adj.subjectBucket ?? 'Other',
      minutes: adj.minutes,
      location: adj.location,
    })
  }

  return out
}

export const computeHoursSummary = (
  dayLogs: DayLog[],
  hoursEntries: HoursEntry[],
  adjustments: HoursAdjustment[],
  childId?: string,
): HoursSummary => {
  const bySubjectMap = new Map<string, { total: number; home: number }>()
  const byDate: Record<string, number> = {}
  let adjustmentMinutes = 0

  // Single shared counting path (DATA-11): filtering, all three additive
  // sources, and the partial-day rule live in `collectHoursContributions`, so
  // this total can never diverge from the trend chart.
  for (const c of collectHoursContributions(dayLogs, hoursEntries, adjustments, childId)) {
    if (c.kind === 'adjustment') adjustmentMinutes += c.minutes
    const existing = bySubjectMap.get(c.subjectBucket) ?? { total: 0, home: 0 }
    existing.total += c.minutes
    if (c.location === LearningLocation.Home) existing.home += c.minutes
    bySubjectMap.set(c.subjectBucket, existing)
    byDate[c.date] = (byDate[c.date] ?? 0) + c.minutes
  }

  const bySubject: HoursSummaryRow[] = Array.from(bySubjectMap.entries())
    .map(([subjectBucket, { total, home }]) => ({
      subjectBucket,
      totalMinutes: total,
      homeMinutes: home,
    }))
    .sort((a, b) => a.subjectBucket.localeCompare(b.subjectBucket))

  let totalMinutes = 0
  let coreMinutes = 0
  let homeMinutes = 0
  let coreHomeMinutes = 0

  for (const row of bySubject) {
    totalMinutes += row.totalMinutes
    homeMinutes += row.homeMinutes
    if (coreBuckets.has(row.subjectBucket as SubjectBucket)) {
      coreMinutes += row.totalMinutes
      coreHomeMinutes += row.homeMinutes
    }
  }

  return {
    totalMinutes,
    coreMinutes,
    homeMinutes,
    coreHomeMinutes,
    adjustmentMinutes,
    bySubject,
    byDate,
  }
}

// ─── Subject distribution (FEAT-105) ─────────────────────────────────────────
//
// A descriptive "where did the time actually go" rollup DERIVED from the
// canonical `HoursSummary` — never a re-count. Because it folds
// `summary.bySubject` (itself produced by the single counting path,
// `collectHoursContributions` / DATA-11), its `totalMinutes` is structurally
// identical to the compliance total already displayed: no schema change, no new
// counting path, zero writes.
//
// Charter (FEAT-105): descriptive, never evaluative — no targets, no deficit
// language, no per-subject quota. The `Other` bucket, which also absorbs
// untagged time (every source defaults a missing `subjectBucket` to `'Other'`),
// is surfaced honestly as "Other / untagged" — never dropped or redistributed.
// The core / non-core split is shown FACTUALLY (it is the MO statute, not a
// judgment): `coreMinutes` uses the same `coreBuckets` set as the compliance
// path, and `coreMinutes + nonCoreMinutes === totalMinutes`.

export type SubjectDistributionRow = {
  subjectBucket: string
  /** Display label; the catch-all `Other` bucket is labelled "Other / untagged". */
  label: string
  totalMinutes: number
  homeMinutes: number
  /** Share of the grand total in percent (0–100), precise/unrounded (the view
   *  rounds for display). 0 when the grand total is 0. */
  percent: number
  /** A MO core subject (Reading / Language Arts / Math / Science / Social Studies). */
  isCore: boolean
  /** The catch-all bucket — also where untagged time lands. */
  isOther: boolean
}

export type SubjectDistribution = {
  /** One row per subject that recorded time, sorted by minutes DESCENDING (label
   *  ascending on ties). Subjects whose net minutes are exactly zero are omitted. */
  rows: SubjectDistributionRow[]
  totalMinutes: number
  coreMinutes: number
  /** Non-core minutes = total − core. Includes the Other / untagged bucket. */
  nonCoreMinutes: number
  /** Largest single-subject total — the denominator for scaling a bar to the
   *  DATA (never to a target). 0 when there are no rows. */
  maxSubjectMinutes: number
}

/** Human label for a subject bucket, with the catch-all relabelled so untagged
 *  time reads honestly. */
const subjectDistributionLabel = (bucket: string): string => {
  if (bucket === SubjectBucket.Other) return 'Other / untagged'
  return SubjectBucketLabel[bucket as SubjectBucket] ?? bucket
}

/**
 * Pure "hours by subject" distribution over an already-computed `HoursSummary`.
 * Reconciles exactly with the summary's total by construction (it only reshapes
 * `summary.bySubject`), so the on-screen breakdown and the export can never
 * drift from the compliance total (FEAT-105).
 */
export const computeSubjectDistribution = (
  summary: HoursSummary,
): SubjectDistribution => {
  const total = summary.totalMinutes

  const rows: SubjectDistributionRow[] = summary.bySubject
    .filter((row) => row.totalMinutes !== 0)
    .map((row) => ({
      subjectBucket: row.subjectBucket,
      label: subjectDistributionLabel(row.subjectBucket),
      totalMinutes: row.totalMinutes,
      homeMinutes: row.homeMinutes,
      percent: total > 0 ? (row.totalMinutes / total) * 100 : 0,
      isCore: coreBuckets.has(row.subjectBucket as SubjectBucket),
      isOther: row.subjectBucket === SubjectBucket.Other,
    }))
    .sort(
      (a, b) =>
        b.totalMinutes - a.totalMinutes || a.label.localeCompare(b.label),
    )

  // Scale bars to the largest POSITIVE subject; a net-negative subject (from a
  // correcting adjustment) never sets the scale and its bar simply clamps to 0.
  const maxSubjectMinutes = rows.reduce(
    (max, row) => Math.max(max, row.totalMinutes),
    0,
  )

  return {
    rows,
    totalMinutes: total,
    coreMinutes: summary.coreMinutes,
    nonCoreMinutes: total - summary.coreMinutes,
    maxSubjectMinutes,
  }
}

// ─── Monthly Trend ─────────────────────────────────────────────────────────

export type MonthlyTrendDatum = {
  /** "YYYY-MM" */
  month: string
  coreMinutes: number
  nonCoreMinutes: number
  totalMinutes: number
  cumulativeTotal: number
  cumulativeCore: number
}

/**
 * Per-month hours aggregation for the Monthly Trend chart. Consumes the SAME
 * shared counting path (`collectHoursContributions` — child filtering, all
 * three additive sources, partial-day rule) as `computeHoursSummary` (DATA-11),
 * so the cumulative core/total at the end of the period reconciles exactly with
 * the canonical compliance figure for any dataset whose dates fall within
 * [startDate, endDate] (DATA-01).
 *
 * Buckets are created for every month in the inclusive range; months with no
 * activity render as zero.
 */
export const computeMonthlyTrend = (
  dayLogs: DayLog[],
  hoursEntries: HoursEntry[],
  adjustments: HoursAdjustment[],
  startDate: string,
  endDate: string,
  childId?: string,
): MonthlyTrendDatum[] => {
  // Build month buckets across the inclusive range.
  const [startY, startM] = startDate.split('-').map(Number)
  const [endY, endM] = endDate.split('-').map(Number)
  const buckets = new Map<string, { core: number; nonCore: number }>()
  let y = startY
  let m = startM
  while (y < endY || (y === endY && m <= endM)) {
    buckets.set(`${y}-${String(m).padStart(2, '0')}`, { core: 0, nonCore: 0 })
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }

  const tally = (date: string, subjectBucket: string, minutes: number) => {
    if (!date) return
    const bucket = buckets.get(date.slice(0, 7))
    if (!bucket) return
    if (coreBuckets.has(subjectBucket as SubjectBucket)) bucket.core += minutes
    else bucket.nonCore += minutes
  }

  // Single shared counting path (DATA-11) — the same contributions
  // computeHoursSummary folds into the compliance totals, including negative
  // adjustments; only minutes dated outside the range fall out (no bucket).
  for (const c of collectHoursContributions(dayLogs, hoursEntries, adjustments, childId)) {
    tally(c.date, c.subjectBucket, c.minutes)
  }

  const result: MonthlyTrendDatum[] = []
  let cumulativeTotal = 0
  let cumulativeCore = 0
  for (const [month, data] of buckets) {
    const totalMinutes = data.core + data.nonCore
    cumulativeTotal += totalMinutes
    cumulativeCore += data.core
    result.push({
      month,
      coreMinutes: data.core,
      nonCoreMinutes: data.nonCore,
      totalMinutes,
      cumulativeTotal,
      cumulativeCore,
    })
  }
  return result
}

// ─── CSV Generation ──────────────────────────────────────────────────────────

const csvRow = (values: (string | number | null | undefined)[]): string =>
  values.map(toCsvValue).join(',')

export const generateHoursSummaryCsv = (summary: HoursSummary): string => {
  const header = csvRow(['Subject', 'Total Hours', 'Home Hours'])
  const rows = summary.bySubject.map((row) =>
    csvRow([
      row.subjectBucket,
      (row.totalMinutes / 60).toFixed(2),
      (row.homeMinutes / 60).toFixed(2),
    ]),
  )
  const totals = csvRow([
    'TOTAL',
    (summary.totalMinutes / 60).toFixed(2),
    (summary.homeMinutes / 60).toFixed(2),
  ])
  const coreRow = csvRow([
    'CORE TOTAL',
    (summary.coreMinutes / 60).toFixed(2),
    (summary.coreHomeMinutes / 60).toFixed(2),
  ])

  return [header, ...rows, '', totals, coreRow].join('\n')
}

export const generateDailyLogCsv = (
  dayLogs: DayLog[],
  hoursEntries: HoursEntry[],
): string => {
  const header = csvRow([
    'Date',
    'Block Type',
    'Subject',
    'Location',
    'Minutes',
    'Notes',
    'Source',
  ])

  // Include rows from BOTH sources (additive)
  const entryRows = [...hoursEntries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((e) => entryMinutes(e) > 0)
    .map((entry) =>
      csvRow([
        formatDateForCsv(entry.date),
        entry.blockType ?? '',
        entry.subjectBucket ?? '',
        entry.location ?? '',
        entryMinutes(entry),
        entry.notes ?? '',
        entry.source ?? '',
      ]),
    )

  const logRows = [...dayLogs]
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((log) =>
      log.blocks
        .filter((b) => (b.actualMinutes ?? 0) > 0)
        .map((block) =>
          csvRow([
            formatDateForCsv(log.date),
            block.type,
            block.subjectBucket ?? '',
            block.location ?? '',
            block.actualMinutes ?? 0,
            block.notes ?? '',
            'day-log',
          ]),
        ),
    )

  const rows = [...entryRows, ...logRows]

  return [header, ...rows].join('\n')
}

// ─── Markdown Generation ─────────────────────────────────────────────────────

export const generateEvaluationMarkdown = (
  evaluations: Evaluation[],
  children: Array<{ id: string; name: string }>,
  artifacts: Artifact[],
): string => {
  const artifactMap = new Map(artifacts.map((a) => [a.id, a]))

  const lines: string[] = ['# Monthly Evaluations', '']

  for (const ev of evaluations) {
    const child = children.find((c) => c.id === ev.childId)
    const childName = child?.name ?? ev.childId

    lines.push(`## ${childName} — ${ev.monthStart} to ${ev.monthEnd}`)
    lines.push('')

    if (ev.wins.length > 0) {
      lines.push('### Wins')
      for (const win of ev.wins) lines.push(`- ${win}`)
      lines.push('')
    }

    if (ev.struggles.length > 0) {
      lines.push('### Struggles')
      for (const struggle of ev.struggles) lines.push(`- ${struggle}`)
      lines.push('')
    }

    if (ev.nextSteps.length > 0) {
      lines.push('### Next Steps')
      for (const step of ev.nextSteps) lines.push(`- ${step}`)
      lines.push('')
    }

    if (ev.sampleArtifactIds.length > 0) {
      lines.push('### Sample Artifacts')
      for (const id of ev.sampleArtifactIds) {
        const art = artifactMap.get(id)
        if (art) {
          lines.push(
            `- **${art.title}** (${art.type}) — ${art.tags?.engineStage ?? ''} / ${art.tags?.subjectBucket ?? ''}`,
          )
        } else {
          lines.push(`- Artifact ${id}`)
        }
      }
      lines.push('')
    }

    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

export const generatePortfolioMarkdown = (
  artifacts: Artifact[],
  children: Array<{ id: string; name: string }>,
  startDate: string,
  endDate: string,
): string => {
  const lines: string[] = [
    `# Portfolio Index — ${startDate} to ${endDate}`,
    '',
  ]

  // Group by child
  const byChild = new Map<string, Artifact[]>()
  for (const art of artifacts) {
    const childId = art.childId
    const list = byChild.get(childId) ?? []
    list.push(art)
    byChild.set(childId, list)
  }

  for (const [childId, childArtifacts] of byChild) {
    const child = children.find((c) => c.id === childId)
    lines.push(`## ${child?.name ?? childId}`)
    lines.push('')
    lines.push(`| # | Date | Title | Type | Stage | Subject | Domain |`)
    lines.push(`|---|------|-------|------|-------|---------|--------|`)

    const sorted = [...childArtifacts].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    )

    sorted.forEach((art, i) => {
      const date = new Date(art.createdAt).toLocaleDateString()
      lines.push(
        `| ${i + 1} | ${date} | ${art.title} | ${art.type} | ${art.tags?.engineStage ?? ''} | ${art.tags?.subjectBucket ?? ''} | ${art.tags?.domain ?? ''} |`,
      )
    })

    lines.push('')

    // Include image references for photo artifacts
    const photos = sorted.filter((art) => ((art.type as string) === 'Photo' || (art.type as string) === 'photo') && art.uri)
    if (photos.length > 0) {
      lines.push('### Photos')
      lines.push('')
      for (const art of photos) {
        lines.push(`![${art.title}](${art.uri})`)
        lines.push('')
      }
    }
  }

  return lines.join('\n')
}

// ─── Portfolio Auto-Suggest ──────────────────────────────────────────────────

export type ScoredArtifact = {
  artifact: Artifact
  score: number
}

/**
 * Score artifacts for portfolio auto-suggestion.
 * Higher score = more suitable for portfolio highlights.
 * Criteria:
 * - Has ladder reference (+3)
 * - Has content/notes (+1 each)
 * - Has all tags filled (+1)
 * - Is a richer evidence type like Photo/Audio (+1)
 */
export const scoreArtifactsForPortfolio = (
  artifacts: Artifact[],
): ScoredArtifact[] => {
  return artifacts
    .map((artifact) => {
      let score = 0
      if (artifact.tags?.ladderRef) score += 3
      if (artifact.content && artifact.content.length > 20) score += 1
      if (artifact.notes) score += 1
      if (
        artifact.tags?.engineStage &&
        artifact.tags?.subjectBucket &&
        artifact.tags?.domain &&
        artifact.tags?.location
      )
        score += 1
      if (artifact.type === 'Photo' || artifact.type === 'Audio') score += 1
      return { artifact, score }
    })
    .sort((a, b) => b.score - a.score)
}

// ─── Month Helpers ───────────────────────────────────────────────────────────

export const getMonthRange = (
  year: number,
  month: number,
): { start: string; end: string } => {
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  return {
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(lastDay)}`,
  }
}

export const getMonthLabel = (year: number, month: number): string => {
  const date = new Date(year, month - 1, 1)
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
}

// ─── Compliance Pack Zip ────────────────────────────────────────────────────

export type CompliancePackInput = {
  summary: HoursSummary
  dayLogs: DayLog[]
  hoursEntries: HoursEntry[]
  evaluations: Evaluation[]
  artifacts: Artifact[]
  children: Array<{ id: string; name: string }>
  startDate: string
  endDate: string
  childName: string
  /** State whose compliance citation to render. Defaults to MO (DATA-12). */
  homeschoolState?: HomeschoolState
}

export async function buildComplianceZip(
  input: CompliancePackInput,
): Promise<Blob> {
  const {
    summary,
    dayLogs,
    hoursEntries,
    evaluations,
    artifacts,
    children,
    startDate,
    endDate,
    childName,
  } = input

  const zip = new JSZip()
  const prefix = childName ? `${childName.toLowerCase()}-` : ''

  zip.file(
    `${prefix}hours-summary-${startDate}-to-${endDate}.csv`,
    generateHoursSummaryCsv(summary),
  )

  zip.file(
    `${prefix}daily-logs-${startDate}-to-${endDate}.csv`,
    generateDailyLogCsv(dayLogs, hoursEntries),
  )

  if (evaluations.length > 0) {
    zip.file(
      `${prefix}evaluations-${startDate}-to-${endDate}.md`,
      generateEvaluationMarkdown(evaluations, children, artifacts),
    )
  }

  if (artifacts.length > 0) {
    zip.file(
      `${prefix}portfolio-${startDate}-to-${endDate}.md`,
      generatePortfolioMarkdown(artifacts, children, startDate, endDate),
    )
  }

  return zip.generateAsync({ type: 'blob' })
}

// ─── Printable Compliance Report (HTML) ──────────────────────────────────────

export function generateComplianceReportHtml(
  input: CompliancePackInput,
): string {
  const { summary, evaluations, artifacts, children, startDate, endDate, childName } = input

  // DATA-12: the legal citation is sourced from the state compliance config.
  // Defaults to MO, whose citation string is reproduced verbatim — byte-identical.
  const legalCitation = getStateConfig(input.homeschoolState).legalCitation

  const totalHours = (summary.totalMinutes / 60).toFixed(1)
  const coreHours = (summary.coreMinutes / 60).toFixed(1)
  const coreHomeHours = (summary.coreHomeMinutes / 60).toFixed(1)

  // FEAT-105: the subject breakdown rides the same descriptive distribution the
  // Records screen shows — largest first, with a share-of-total column and the
  // honest "Other / untagged" label. Derived from `summary`, so the subject
  // rows still sum to the same total.
  const distribution = computeSubjectDistribution(summary)
  const nonCoreHours = (distribution.nonCoreMinutes / 60).toFixed(1)
  const subjectRows = distribution.rows
    .map(
      (row) =>
        `<tr>
          <td>${row.label}</td>
          <td class="num">${(row.totalMinutes / 60).toFixed(1)}</td>
          <td class="num">${row.percent.toFixed(0)}%</td>
          <td class="num">${(row.homeMinutes / 60).toFixed(1)}</td>
          <td class="num">${row.isCore ? 'Core' : ''}</td>
        </tr>`,
    )
    .join('\n')

  // Daily breakdown: aggregate by date
  const sortedDates = Object.entries(summary.byDate)
    .sort(([a], [b]) => a.localeCompare(b))
  const dailyRows = sortedDates
    .map(
      ([date, minutes]) =>
        `<tr><td>${date}</td><td class="num">${(minutes / 60).toFixed(1)}</td></tr>`,
    )
    .join('\n')

  // Evaluation summaries
  const evalSection =
    evaluations.length > 0
      ? evaluations
          .map((ev) => {
            const child = children.find((c) => c.id === ev.childId)
            return `
              <div class="eval">
                <h4>${child?.name ?? ev.childId} — ${ev.monthStart} to ${ev.monthEnd}</h4>
                ${ev.wins.length > 0 ? `<p><strong>Wins:</strong> ${ev.wins.join('; ')}</p>` : ''}
                ${ev.struggles.length > 0 ? `<p><strong>Struggles:</strong> ${ev.struggles.join('; ')}</p>` : ''}
                ${ev.nextSteps.length > 0 ? `<p><strong>Next Steps:</strong> ${ev.nextSteps.join('; ')}</p>` : ''}
              </div>`
          })
          .join('\n')
      : '<p class="muted">No evaluations recorded for this period.</p>'

  // Portfolio sample (top 10 artifacts)
  const topArtifacts = artifacts.slice(0, 10)
  const portfolioRows = topArtifacts
    .map(
      (art) =>
        `<tr>
          <td>${art.createdAt ? new Date(art.createdAt).toLocaleDateString() : ''}</td>
          <td>${art.title}</td>
          <td>${art.type}</td>
          <td>${art.tags?.subjectBucket ?? ''}</td>
        </tr>`,
    )
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Missouri Homeschool Compliance Report — ${childName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Georgia, serif; font-size: 12pt; line-height: 1.5; padding: 0.75in; color: #222; }
    h1 { font-size: 18pt; margin-bottom: 4pt; }
    h2 { font-size: 14pt; margin-top: 18pt; margin-bottom: 6pt; border-bottom: 1px solid #999; padding-bottom: 2pt; }
    h3 { font-size: 12pt; margin-top: 12pt; margin-bottom: 4pt; }
    h4 { font-size: 11pt; margin-top: 8pt; }
    p { margin-bottom: 6pt; }
    .muted { color: #666; }
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12pt; margin: 12pt 0; }
    .summary-box { border: 1px solid #ccc; border-radius: 4pt; padding: 8pt; text-align: center; }
    .summary-box .label { font-size: 9pt; color: #666; text-transform: uppercase; }
    .summary-box .value { font-size: 20pt; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin: 8pt 0; font-size: 10pt; }
    th, td { border: 1px solid #ccc; padding: 4pt 8pt; text-align: left; }
    th { background: #f5f5f5; font-weight: bold; }
    .num { text-align: right; }
    .eval { margin-bottom: 8pt; padding-left: 8pt; border-left: 3px solid #4caf50; }
    .footer { margin-top: 24pt; padding-top: 8pt; border-top: 1px solid #999; font-size: 9pt; color: #666; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <h1>Missouri Homeschool Compliance Report</h1>
  <p><strong>Student:</strong> ${childName} &nbsp; | &nbsp; <strong>Period:</strong> ${startDate} to ${endDate}</p>
  <p class="muted">${legalCitation}</p>

  <h2>Hours Summary</h2>
  <div class="summary-grid">
    <div class="summary-box">
      <div class="label">Total Hours</div>
      <div class="value">${totalHours}</div>
      <div class="muted">of 1,000 required</div>
    </div>
    <div class="summary-box">
      <div class="label">Core Hours</div>
      <div class="value">${coreHours}</div>
      <div class="muted">of 600 required</div>
    </div>
    <div class="summary-box">
      <div class="label">Core at Home</div>
      <div class="value">${coreHomeHours}</div>
      <div class="muted">of 600 required</div>
    </div>
  </div>

  <h2>Hours by Subject</h2>
  <p class="muted">Where the recorded instructional time went this period, largest first.</p>
  <table>
    <thead>
      <tr><th>Subject</th><th class="num">Total Hours</th><th class="num">% of Total</th><th class="num">Home Hours</th><th>Category</th></tr>
    </thead>
    <tbody>
      ${subjectRows}
      <tr style="font-weight:bold">
        <td>TOTAL</td>
        <td class="num">${totalHours}</td>
        <td class="num">${distribution.totalMinutes > 0 ? '100%' : '&mdash;'}</td>
        <td class="num">${(summary.homeMinutes / 60).toFixed(1)}</td>
        <td></td>
      </tr>
      <tr>
        <td>Core at home (MO &ge;600)</td>
        <td class="num">${coreHours}</td>
        <td class="num"></td>
        <td class="num">${coreHomeHours}</td>
        <td>Core</td>
      </tr>
    </tbody>
  </table>
  <p class="muted">Core subjects (Reading, Language Arts, Math, Science, Social Studies): ${coreHours} h &middot; Everything else: ${nonCoreHours} h. Missouri's statute defines the five core subjects; the rest still count toward total instruction. Shown for reference, not as a target.</p>

  <h2>Daily Instruction Log</h2>
  <p class="muted">${sortedDates.length} school days logged</p>
  <table>
    <thead>
      <tr><th>Date</th><th class="num">Hours</th></tr>
    </thead>
    <tbody>
      ${dailyRows}
    </tbody>
  </table>

  <h2>Evaluation Summaries</h2>
  ${evalSection}

  <h2>Portfolio Samples</h2>
  ${topArtifacts.length > 0
    ? `<table>
        <thead>
          <tr><th>Date</th><th>Title</th><th>Type</th><th>Subject</th></tr>
        </thead>
        <tbody>
          ${portfolioRows}
        </tbody>
      </table>
      ${artifacts.length > 10 ? `<p class="muted">${artifacts.length - 10} additional artifacts not shown.</p>` : ''}`
    : '<p class="muted">No artifacts recorded for this period.</p>'}

  <div class="footer">
    <p>Generated by First Principles Engine on ${new Date().toLocaleDateString()}. This document is intended for Missouri homeschool record-keeping purposes.</p>
  </div>
</body>
</html>`
}
