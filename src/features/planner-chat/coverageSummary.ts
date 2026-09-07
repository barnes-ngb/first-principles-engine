import type { DraftWeeklyPlan, PrioritySkill } from '../../core/types'
import { SubjectBucket, SubjectBucketLabel } from '../../core/types/enums'
import { SKILL_TAG_MAP } from '../../core/types/skillTags'

export interface CoverageEntry {
  /** The raw `SubjectBucket` this entry folds. The grouping key — never displayed. */
  subject: string
  /** What a parent reads (UX-259). See {@link coverageSubjectLabel}. */
  label: string
  totalBlocks: number
  totalMinutes: number
  /** How many blocks match a priority skill tag. */
  priorityHits: number
  /** Human-readable detail, e.g. "CVC focus 3x" */
  details: string[]
}

/**
 * How many of an unnameable bucket's own item titles the chip names (UX-259).
 *
 * Two, then `+N`. The chip has one line on a phone and this is the same lesson
 * UX-237 learned about tag details: a list that runs long gets truncated
 * mid-word, which reads as a rendering fault.
 */
export const COVERAGE_OTHER_TITLE_LIMIT = 2

/**
 * What a coverage chip calls its bucket.
 *
 * Every real subject gets its catalogued label, which also fixes two identifiers
 * this chip printed raw: `LanguageArts` and `SocialStudies`.
 *
 * **`Other` is named by what is actually in it.** It is routinely the largest
 * bucket on the owner's screen — *"Other: 30 blocks"* against *"Reading: 27
 * blocks"* — and it says nothing and cannot be acted on: there is no "do more
 * Other". Nothing is folded INTO it at this layer (the grouping is on the raw
 * `item.subjectBucket`, and Practical Arts, PE and the rest already have their
 * own chips), so there is no split to make. What it holds is formation, prayer
 * and anything a config left unmapped — and those items have real names.
 *
 * So the chip says the names, not the category. Naming it *"Formation/Prayer"* —
 * the phrase the AI prompt path uses for this bucket — would be a guess, and on a
 * week the family spent packing it would be a false one. UX-237's rule holds:
 * naming something wrongly is worse than not naming it, so a bucket with no
 * usable titles falls back to the bare label rather than inventing one.
 *
 * The fold is untouched — this is display only. `totalBlocks` and `totalMinutes`
 * count exactly what they counted before.
 */
export function coverageSubjectLabel(subject: string, itemTitles: readonly string[]): string {
  const catalogued = SubjectBucketLabel[subject as SubjectBucket]
  if (subject !== SubjectBucket.Other) return catalogued ?? subject

  const named: string[] = []
  for (const title of itemTitles) {
    const trimmed = title.trim()
    if (!trimmed || named.includes(trimmed)) continue
    named.push(trimmed)
  }
  if (named.length === 0) return catalogued ?? subject
  const shown = named.slice(0, COVERAGE_OTHER_TITLE_LIMIT)
  const rest = named.length - shown.length
  return rest > 0 ? `${shown.join(', ')} +${rest}` : shown.join(', ')
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
    {
      blocks: number
      minutes: number
      priorityHits: number
      tagCounts: Map<string, number>
      /** In plan order, so the chip names what the week leads with (UX-259). */
      titles: string[]
    }
  >()

  for (const day of plan.days) {
    for (const item of day.items) {
      if (!item.accepted) continue
      const key = item.subjectBucket
      if (!subjectMap.has(key)) {
        subjectMap.set(key, { blocks: 0, minutes: 0, priorityHits: 0, tagCounts: new Map(), titles: [] })
      }
      const entry = subjectMap.get(key)!
      entry.blocks += 1
      entry.minutes += item.estimatedMinutes
      if (typeof item.title === 'string') entry.titles.push(item.title)

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
      label: coverageSubjectLabel(subject, data.titles),
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
      // UX-259: the same name the chip shows. A parent reading this in the chat
      // and a parent reading the panel are looking at one week.
      `  ${entry.label}: ${entry.totalBlocks} block${entry.totalBlocks === 1 ? '' : 's'}, ${entry.totalMinutes}m${detailStr}`,
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
