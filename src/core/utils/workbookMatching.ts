import type { SubjectBucket } from '../types/enums'

/**
 * Minimal shape for anything that can be compared as a "workbook-like" item.
 * ChecklistItem satisfies this, as do other item-shaped objects.
 */
export interface WorkbookLike {
  label: string
  activityConfigId?: string
  subjectBucket?: SubjectBucket
}

/**
 * Extract a lesson number from a label (e.g., "Lesson 17", "L 5", "Ch 3").
 * Returns null when no lesson number is present.
 */
export function extractLessonNumber(label: string): number | null {
  const match = label.match(/(?:lesson|les|pg|page|ch|chapter|unit)\s*#?\s*(\d+)/i)
  if (match) return parseInt(match[1], 10)
  return null
}

/**
 * Normalize a workbook label for comparison:
 * - lowercase
 * - strip lesson/page/chapter/unit references with numbers
 * - strip time estimates (30m, ~20 min, 30 mins)
 * - collapse separators (em/en dash, hyphen, colon, pipe)
 * - strip common filler suffixes ("book set")
 * - collapse whitespace
 */
export function normalizeWorkbookName(label: string): string {
  let s = label.toLowerCase()
  s = s.replace(
    /(?:lesson|les|pg|page|ch|chapter|unit|l)\s*#?\s*\d+(?:\s*of\s*\d+)?/gi,
    '',
  )
  s = s.replace(/~?\s*\d+\s*(?:m|min|mins|minutes|hr|hrs|hours)\b/gi, '')
  s = s.replace(/\bbook\s*set\b/gi, '')
  s = s.replace(/[—–:|-]+/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

/**
 * Decide whether two items reference the same underlying workbook.
 *
 * Matching signals (in order of strength):
 * 1. Same `activityConfigId` (if both present)
 * 2. Same normalized workbook name
 * 3. One normalized name is a substring of the other (≥5 chars)
 * 4. ≥2 shared non-trivial words AND same subjectBucket (fuzzy fallback)
 */
export function isSameWorkbook(a: WorkbookLike, b: WorkbookLike): boolean {
  if (a.activityConfigId && b.activityConfigId) {
    return a.activityConfigId === b.activityConfigId
  }

  const nameA = normalizeWorkbookName(a.label)
  const nameB = normalizeWorkbookName(b.label)
  if (!nameA || !nameB) return false
  if (nameA === nameB) return true

  const [shorter, longer] = nameA.length <= nameB.length ? [nameA, nameB] : [nameB, nameA]
  if (shorter.length >= 5 && longer.includes(shorter)) {
    return true
  }

  const wordsA = new Set(nameA.split(/\s+/).filter((w) => w.length >= 3))
  const wordsB = new Set(nameB.split(/\s+/).filter((w) => w.length >= 3))
  const shared = [...wordsA].filter((w) => wordsB.has(w))
  if (shared.length >= 2) {
    if (a.subjectBucket && b.subjectBucket && a.subjectBucket !== b.subjectBucket) {
      return false
    }
    return true
  }

  return false
}
