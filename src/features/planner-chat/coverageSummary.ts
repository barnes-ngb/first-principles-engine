import type { DraftWeeklyPlan, PrioritySkill } from '../../core/types/domain'
import type { SubjectBucket } from '../../core/types/enums'
import { SKILL_TAG_MAP } from '../../core/types/skillTags'

export interface CoverageEntry {
  subject: string
  totalBlocks: number
  totalMinutes: number
  /** How many blocks match a priority skill tag. */
  priorityHits: number
  /** Human-readable detail, e.g. "CVC focus 3x" */
  details: string[]
}

/**
 * Build a coverage summary from a draft plan and priority skills.
 * Groups accepted items by subject, counts priority-skill alignment.
 */
export function buildCoverageSummary(
  plan: DraftWeeklyPlan,
  prioritySkills: PrioritySkill[],
): CoverageEntry[] {
  const priorityTags = new Set(prioritySkills.map((s) => s.tag))

  // Accumulate per subject
  const subjectMap = new Map<
    SubjectBucket | string,
    { blocks: number; minutes: number; priorityHits: number; tagCounts: Map<string, number> }
  >()

  for (const day of plan.days) {
    for (const item of day.items) {
      if (!item.accepted) continue
      const key = item.subjectBucket
      if (!subjectMap.has(key)) {
        subjectMap.set(key, { blocks: 0, minutes: 0, priorityHits: 0, tagCounts: new Map() })
      }
      const entry = subjectMap.get(key)!
      entry.blocks += 1
      entry.minutes += item.estimatedMinutes

      for (const tag of item.skillTags) {
        if (priorityTags.has(tag)) {
          entry.priorityHits += 1
        }
        entry.tagCounts.set(tag, (entry.tagCounts.get(tag) ?? 0) + 1)
      }
    }
  }

  const entries: CoverageEntry[] = []
  for (const [subject, data] of subjectMap) {
    const details: string[] = []
    for (const [tag, count] of data.tagCounts) {
      const def = SKILL_TAG_MAP[tag]
      const label = def?.label ?? tag.split('.').pop() ?? tag
      details.push(`${label} ${count}x`)
    }
    entries.push({
      subject,
      totalBlocks: data.blocks,
      totalMinutes: data.minutes,
      priorityHits: data.priorityHits,
      details,
    })
  }

  // Sort: subjects with priority hits first
  entries.sort((a, b) => b.priorityHits - a.priorityHits || b.totalMinutes - a.totalMinutes)
  return entries
}

/**
 * Format coverage summary as a human-readable string for chat messages.
 */
export function formatCoverageSummaryText(
  entries: CoverageEntry[],
  prioritySkills: PrioritySkill[],
): string {
  if (entries.length === 0) return 'No items scheduled yet.'

  const lines: string[] = []
  lines.push('Coverage this week:')
  for (const entry of entries) {
    const detailStr = entry.details.length > 0 ? ` (${entry.details.join(', ')})` : ''
    lines.push(`  ${entry.subject}: ${entry.totalBlocks} blocks, ${entry.totalMinutes}m${detailStr}`)
  }

  if (prioritySkills.length > 0) {
    const totalPriorityHits = entries.reduce((sum, e) => sum + e.priorityHits, 0)
    lines.push(`\nPriority skill alignment: ${totalPriorityHits} blocks match priority skills.`)
  }

  return lines.join('\n')
}
