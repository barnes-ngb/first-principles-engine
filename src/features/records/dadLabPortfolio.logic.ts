/**
 * Dad Lab → Portfolio (FEAT-121).
 *
 * Dad Lab session narratives — predict → try → what we saw — are the charter's
 * richest science evidence, and until this module the portfolio could not see
 * them: `src/features/records/` read only the `artifacts` collection, so the
 * parent-side report narrative never reached the month view or its markdown
 * export.
 *
 * This module is **presentation only**. It reads `DadLabReport`s and `Artifact`s
 * that were already loaded and returns plain view/export data. It writes
 * nothing, changes no schema, and does not touch hours / XP / compliance math
 * (the DATA-04 whole-family credit loops in `useDadLabReports` are untouched).
 *
 * It also does not touch `scoreArtifactsForPortfolio` — lab artifacts carry no
 * `ladderRef` and so rarely reach the auto-suggest top-5, which is a real
 * scoring-fairness question and a named follow-up, not this slice.
 */
import type { Artifact, DadLabReport } from '../../core/types'
import { DadLabStatus } from '../../core/types/enums'
import { computeLabLinkage } from './dataReviewExport.logic'

/**
 * Dad Lab is a whole-family activity by design (DATA-04, resolved 2026-06-09):
 * a completed lab credits compliance hours, XP, and diamonds to *every* child.
 * `DadLabReport` matches that — it carries **no** `childId`. So a lab shows on
 * every child's portfolio with this annotation, rather than being duplicated
 * per child or filtered by a per-child field that does not exist in the shape.
 */
export const DAD_LAB_FAMILY_SCOPE_NOTE =
  'Family lab — Dad Lab runs as a whole-family activity, so it appears on every portfolio.'

/** Heading used by both the month view and the markdown export. */
export const DAD_LAB_SECTION_TITLE = 'Dad Lab'

/** Default cap for a narrative excerpt, in characters. */
export const DAD_LAB_EXCERPT_MAX_CHARS = 240

/** One report, ready to render in the month view or the markdown export. */
export interface DadLabPortfolioEntry {
  /** The report's doc id, when it has one. */
  id?: string
  /** Report title, or a neutral fallback when the lab was saved untitled. */
  title: string
  /** YYYY-MM-DD. */
  date: string
  /**
   * A short narrative excerpt in the family's own words — what we predicted,
   * what we tried, what we saw. Empty string when the lab carries no narrative
   * yet; callers render nothing rather than an empty quote.
   */
  excerpt: string
  /**
   * Lab artifacts from the same month that resolve to this report, counted from
   * **both** directions (see {@link computeLabLinkage}).
   */
  linkedArtifactCount: number
}

/** Trim to `maxChars` at a word boundary, appending an ellipsis when cut. */
const truncateAtWord = (text: string, maxChars: number): string => {
  if (text.length <= maxChars) return text
  const clipped = text.slice(0, maxChars)
  const lastSpace = clipped.lastIndexOf(' ')
  const body = lastSpace > maxChars * 0.5 ? clipped.slice(0, lastSpace) : clipped
  return `${body.trimEnd()}…`
}

const firstNonEmpty = (...candidates: Array<string | undefined>): string => {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim()
    if (trimmed) return trimmed
  }
  return ''
}

/** Kid-words labels for the FEAT-56 three-beat capture, in narrative order. */
const BEAT_LABELS: Array<[keyof NonNullable<DadLabReport['beats']>, string]> = [
  ['predict', 'Predict'],
  ['try', 'Try'],
  ['saw', 'What we saw'],
]

/**
 * A short narrative excerpt for one report.
 *
 * Prefers the FEAT-56 three-beat capture (today's default) because that *is*
 * the family's narrative of the lab; falls back to the parent-side reflection
 * fields, then to the lab's own framing, then to the legacy per-child
 * `childReports` text that pre-FEAT-56 labs carry.
 *
 * Deliberately narrative-only (ETHOS-02): no scores, no marks, no counts framed
 * as grades — the portfolio is portfolio-over-grades.
 */
export const dadLabNarrativeExcerpt = (
  report: DadLabReport,
  maxChars: number = DAD_LAB_EXCERPT_MAX_CHARS,
): string => {
  const beatParts: string[] = []
  for (const [beatId, label] of BEAT_LABELS) {
    const text = report.beats?.[beatId]?.text?.trim()
    if (text) beatParts.push(`${label}: ${text}`)
  }
  if (beatParts.length > 0) return truncateAtWord(beatParts.join(' · '), maxChars)

  const legacy = Object.values(report.childReports ?? {})
  const fallback = firstNonEmpty(
    report.bestMoment,
    report.dadReflection,
    report.description,
    report.question,
    ...legacy.map((r) => r?.observation),
    ...legacy.map((r) => r?.explanation),
    ...legacy.map((r) => r?.prediction),
    ...legacy.map((r) => r?.notes),
  )
  return fallback ? truncateAtWord(fallback, maxChars) : ''
}

/**
 * A lab belongs in the portfolio once it has actually happened. `planned` labs
 * are on the calendar, not in the record, and carry no narrative yet.
 */
const hasHappened = (report: DadLabReport): boolean =>
  report.status === DadLabStatus.Active || report.status === DadLabStatus.Complete

/**
 * Select the month's Dad Lab reports as renderable entries, newest first.
 *
 * `monthStart` / `monthEnd` are inclusive `YYYY-MM-DD` bounds (the same pair
 * `getMonthRange` returns), compared as strings against `report.date`.
 *
 * `monthArtifacts` should be **every** artifact loaded for the month, not the
 * active child's slice: the three-beat capture writes whole-family artifacts
 * (`childId: 'both'`, DATA-04), so filtering to one child before counting would
 * under-report a family lab's evidence.
 */
export const selectDadLabPortfolioEntries = (
  reports: DadLabReport[],
  monthArtifacts: Artifact[],
  monthStart: string,
  monthEnd: string,
): DadLabPortfolioEntry[] => {
  const inMonth = reports.filter(
    (r) => Boolean(r.date) && r.date >= monthStart && r.date <= monthEnd && hasHappened(r),
  )
  // Resolve the lab↔artifact graph from both directions: the three-beat capture
  // (today's default) writes artifacts with NO `labSessionId` — the link lives
  // on the report as `beats[*].items[].artifactId`. A one-directional match
  // would report every three-beat session as having zero evidence.
  const linkage = computeLabLinkage(inMonth, monthArtifacts)

  return [...inMonth]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((report) => ({
      id: report.id,
      title: report.title?.trim() || 'Untitled lab',
      date: report.date,
      excerpt: dadLabNarrativeExcerpt(report),
      linkedArtifactCount: linkage.countForReport(report.id),
    }))
}

/** Plain-language label for a linked-artifact count. Never a score. */
export const linkedArtifactLabel = (count: number): string =>
  count === 1 ? '1 lab photo or recording' : `${count} lab photos or recordings`

/**
 * The markdown block for the month's Dad Labs. Returns `[]` for an empty month
 * so the export gains no empty header.
 *
 * Photo URLs are deliberately absent: the existing per-child Photos section of
 * the portfolio markdown already carries them, and duplicating them would bloat
 * the export with the same links twice.
 */
export const buildDadLabMarkdownSection = (
  entries: DadLabPortfolioEntry[],
): string[] => {
  if (entries.length === 0) return []

  const lines: string[] = [`## ${DAD_LAB_SECTION_TITLE}`, '', `_${DAD_LAB_FAMILY_SCOPE_NOTE}_`, '']
  for (const entry of entries) {
    lines.push(`### ${entry.title} — ${entry.date}`)
    lines.push('')
    if (entry.excerpt) {
      lines.push(entry.excerpt)
      lines.push('')
    }
    lines.push(`Linked this month: ${linkedArtifactLabel(entry.linkedArtifactCount)}`)
    lines.push('')
  }
  return lines
}
