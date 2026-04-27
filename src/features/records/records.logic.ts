import JSZip from 'jszip'

import type {
  Artifact,
  DayLog,
  Evaluation,
  HoursAdjustment,
  HoursEntry,
} from '../../core/types'
import { LearningLocation, SubjectBucket } from '../../core/types/enums'
import { formatDateForCsv, toCsvValue } from '../../core/utils/format'
import { deriveChildIdFromDocId } from '../../core/utils/docId'

export { deriveChildIdFromDocId }

// ─── Hours Summary ───────────────────────────────────────────────────────────

const coreBuckets = new Set<SubjectBucket>([
  SubjectBucket.Reading,
  SubjectBucket.LanguageArts,
  SubjectBucket.Math,
  SubjectBucket.Science,
  SubjectBucket.SocialStudies,
])

export type HoursSummaryRow = {
  subjectBucket: string
  totalMinutes: number
  homeMinutes: number
}

export type HoursSummary = {
  totalMinutes: number
  coreMinutes: number
  coreHomeMinutes: number
  adjustmentMinutes: number
  bySubject: HoursSummaryRow[]
  byDate: Record<string, number>
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

export const computeHoursSummary = (
  dayLogs: DayLog[],
  hoursEntries: HoursEntry[],
  adjustments: HoursAdjustment[],
  childId?: string,
): HoursSummary => {
  // When childId is provided, enforce filtering as a safety net
  const filteredLogs = childId
    ? dayLogs.filter((l) => l.childId === childId)
    : dayLogs
  const filteredEntries = childId
    ? hoursEntries.filter((e) => e.childId === childId)
    : hoursEntries
  const filteredAdj = childId
    ? adjustments.filter((a) => !a.childId || a.childId === childId)
    : adjustments

  const bySubjectMap = new Map<string, { total: number; home: number }>()
  const byDate: Record<string, number> = {}

  // ── SOURCE 1: Hours entries (Dad Lab, manual entries, etc.) ──
  for (const entry of filteredEntries) {
    const minutes = entryMinutes(entry)
    if (minutes <= 0) continue
    const bucket = entry.subjectBucket ?? 'Other'
    const existing = bySubjectMap.get(bucket) ?? { total: 0, home: 0 }
    existing.total += minutes
    if (entry.location === LearningLocation.Home) existing.home += minutes
    bySubjectMap.set(bucket, existing)
    byDate[entry.date] = (byDate[entry.date] ?? 0) + minutes
  }

  // ── SOURCE 2: Day logs (completed checklist items — primary for planner-generated days) ──
  for (const log of filteredLogs) {
    // Check if any block has actual tracked minutes
    const hasActualBlockMinutes = log.blocks.some(b => (b.actualMinutes ?? 0) > 0)

    if (hasActualBlockMinutes) {
      // Use block-level actual minutes (manually tracked sessions)
      for (const block of log.blocks) {
        const minutes = block.actualMinutes ?? 0
        if (minutes <= 0) continue
        const bucket = block.subjectBucket ?? 'Other'
        const existing = bySubjectMap.get(bucket) ?? { total: 0, home: 0 }
        existing.total += minutes
        if (block.location === LearningLocation.Home) existing.home += minutes
        bySubjectMap.set(bucket, existing)
        byDate[log.date] = (byDate[log.date] ?? 0) + minutes
      }
    } else if (log.checklist) {
      // Use checklist completion (planner-generated days)
      for (const item of log.checklist) {
        if (!item.completed) continue
        const minutes = item.estimatedMinutes ?? item.plannedMinutes ?? parseMinutesFromChecklist(item.label)
        if (minutes <= 0) continue
        const bucket = item.subjectBucket ?? 'Other'
        const existing = bySubjectMap.get(bucket) ?? { total: 0, home: 0 }
        existing.total += minutes
        existing.home += minutes // assume home
        bySubjectMap.set(bucket, existing)
        byDate[log.date] = (byDate[log.date] ?? 0) + minutes
      }
    }
  }

  // Apply adjustments
  let adjustmentMinutes = 0
  for (const adj of filteredAdj) {
    adjustmentMinutes += adj.minutes
    const bucket = adj.subjectBucket ?? 'Other'
    const existing = bySubjectMap.get(bucket) ?? { total: 0, home: 0 }
    existing.total += adj.minutes
    if (adj.location === LearningLocation.Home) existing.home += adj.minutes
    bySubjectMap.set(bucket, existing)
    byDate[adj.date] = (byDate[adj.date] ?? 0) + adj.minutes
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
  let coreHomeMinutes = 0

  for (const row of bySubject) {
    totalMinutes += row.totalMinutes
    if (coreBuckets.has(row.subjectBucket as SubjectBucket)) {
      coreMinutes += row.totalMinutes
      coreHomeMinutes += row.homeMinutes
    }
  }

  return {
    totalMinutes,
    coreMinutes,
    coreHomeMinutes,
    adjustmentMinutes,
    bySubject,
    byDate,
  }
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
    (summary.coreHomeMinutes / 60).toFixed(2),
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

const CORE_SUBJECT_LABELS: Record<string, string> = {
  Reading: 'Reading',
  LanguageArts: 'Language Arts',
  Math: 'Math',
  Science: 'Science',
  SocialStudies: 'Social Studies',
}

export function generateComplianceReportHtml(
  input: CompliancePackInput,
): string {
  const { summary, evaluations, artifacts, children, startDate, endDate, childName } = input

  const totalHours = (summary.totalMinutes / 60).toFixed(1)
  const coreHours = (summary.coreMinutes / 60).toFixed(1)
  const coreHomeHours = (summary.coreHomeMinutes / 60).toFixed(1)

  const subjectRows = summary.bySubject
    .map(
      (row) =>
        `<tr>
          <td>${CORE_SUBJECT_LABELS[row.subjectBucket] ?? row.subjectBucket}</td>
          <td class="num">${(row.totalMinutes / 60).toFixed(1)}</td>
          <td class="num">${(row.homeMinutes / 60).toFixed(1)}</td>
          <td class="num">${coreBuckets.has(row.subjectBucket as SubjectBucket) ? 'Core' : ''}</td>
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
  <p class="muted">MO RSMo 167.031 requires 1,000 hours of instruction (600 in core subjects: Reading, Language Arts, Math, Science, Social Studies). At least 600 hours must occur at the regular place of instruction.</p>

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
  <table>
    <thead>
      <tr><th>Subject</th><th class="num">Total Hours</th><th class="num">Home Hours</th><th>Category</th></tr>
    </thead>
    <tbody>
      ${subjectRows}
      <tr style="font-weight:bold">
        <td>TOTAL</td>
        <td class="num">${totalHours}</td>
        <td class="num">${coreHomeHours}</td>
        <td></td>
      </tr>
    </tbody>
  </table>

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
