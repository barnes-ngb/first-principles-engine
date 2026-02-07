import type {
  Artifact,
  DayLog,
  Evaluation,
  HoursAdjustment,
  HoursEntry,
} from '../../core/types/domain'
import { LearningLocation, SubjectBucket } from '../../core/types/enums'
import { formatDateForCsv } from '../../lib/format'

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

export const computeHoursSummary = (
  dayLogs: DayLog[],
  hoursEntries: HoursEntry[],
  adjustments: HoursAdjustment[],
): HoursSummary => {
  const bySubjectMap = new Map<string, { total: number; home: number }>()
  const byDate: Record<string, number> = {}

  const useEntries = hoursEntries.length > 0

  if (useEntries) {
    for (const entry of hoursEntries) {
      const minutes = entryMinutes(entry)
      if (minutes <= 0) continue
      const bucket = entry.subjectBucket ?? 'Other'
      const existing = bySubjectMap.get(bucket) ?? { total: 0, home: 0 }
      existing.total += minutes
      if (entry.location === LearningLocation.Home) existing.home += minutes
      bySubjectMap.set(bucket, existing)
      byDate[entry.date] = (byDate[entry.date] ?? 0) + minutes
    }
  } else {
    for (const log of dayLogs) {
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
    }
  }

  // Apply adjustments
  let adjustmentMinutes = 0
  for (const adj of adjustments) {
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

const toCsvValue = (value: string | number | null | undefined): string => {
  const str = `${value ?? ''}`
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

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

  const useEntries = hoursEntries.length > 0

  const rows = useEntries
    ? [...hoursEntries]
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
    : [...dayLogs]
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
