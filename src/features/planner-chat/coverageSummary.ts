import type { DraftWeeklyPlan, PrioritySkill } from '../../core/types'
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
 * How many tag details a coverage entry names before it stops (UX-237).
 *
 * The chip that renders these has one line on a phone. Six details produce a
 * string the chip truncates mid-word — the owner's screenshot ends
 * *"…comparin"* — which reads as a rendering fault rather than a list that ran
 * long. Three fit; the block count is the number that matters anyway.
 */
export const COVERAGE_DETAIL_LIMIT = 3

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
    // UX-237: a tag with no entry in the catalog used to fall back to its own
    // last path segment, so parent-facing copy read "short-i-vs-e 5x, ful 5x".
    // Those are identifiers — a slug and a suffix — not things a person says.
    // A tag the catalog cannot name is still COUNTED in `totalBlocks`; it just
    // isn't named, because naming it wrongly is worse than not naming it. See
    // `skillTags.ts` for the catalog; adding a label there brings a tag back
    // into this list with no change here.
    const details: string[] = []
    for (const [tag, count] of data.tagCounts) {
      const label = SKILL_TAG_MAP[tag]?.label
      if (!label) continue
      if (details.length >= COVERAGE_DETAIL_LIMIT) break
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
    lines.push(
      `  ${entry.subject}: ${entry.totalBlocks} block${entry.totalBlocks === 1 ? '' : 's'}, ${entry.totalMinutes}m${detailStr}`,
    )
  }

  if (prioritySkills.length > 0) {
    const totalPriorityHits = entries.reduce((sum, e) => sum + e.priorityHits, 0)
    lines.push(
      `\nPriority skill alignment: ${totalPriorityHits} ${totalPriorityHits === 1 ? 'block matches' : 'blocks match'} priority skills.`,
    )
  }

  return lines.join('\n')
}
