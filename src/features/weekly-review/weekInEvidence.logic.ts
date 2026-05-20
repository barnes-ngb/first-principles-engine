import type { WeekEvidence } from '../../core/types'

/**
 * Hide the section entirely when there's nothing to show for this child.
 * Avoids cluttering the review with empty cells.
 */
export function hasAnyEvidenceToShow(evidence: WeekEvidence): boolean {
  const { books, teachBacks } = evidence
  if (books.booksCreated.length > 0) return true
  if (books.booksCompleted.length > 0) return true
  if (books.readingSessions.count > 0) return true
  if (teachBacks.count > 0) return true
  return false
}
