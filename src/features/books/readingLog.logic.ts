import type { Book } from '../../core/types'

/**
 * Pure text builders for the reading-session writes (kept out of the component so the
 * Story Call audience threading is unit-testable and the non-call output stays byte-stable).
 *
 * The `audience` param is the ONLY Story Call addition to the existing Share artifact +
 * hours writes (FEAT-95 §3): passing it appends one enriching clause; omitting it yields
 * exactly the pre-Story-Call text.
 */

/** The Share-artifact `content` for a completed read. `audience` (optional) enriches it. */
export function buildReadingCompletionContent(
  book: Pick<Book, 'title' | 'pages' | 'sightWords'>,
  childName: string,
  audience?: string,
): string {
  const hasSightWords = (book.sightWords?.length ?? 0) > 0
  return [
    `${childName} read "${book.title}" — ${book.pages.length} pages`,
    hasSightWords ? `Practiced ${book.sightWords!.length} sight words` : null,
    // Story Call audience enriches the existing Share artifact — no new doc.
    audience ? `Read aloud to ${audience} on a video call` : null,
    `Completed reading on ${new Date().toLocaleDateString()}`,
  ]
    .filter(Boolean)
    .join('. ')
}

/** The hours-entry `notes`. `audience` (optional) appends the Story Call clause. */
export function buildReadingHoursNotes(
  bookTitle: string,
  completed: boolean,
  pagesRead: number,
  totalPages: number,
  sightWordCount: number,
  audience?: string,
): string {
  const words = sightWordCount > 0 ? ` — ${sightWordCount} sight words` : ''
  const base = completed
    ? `Read "${bookTitle}" (${totalPages} pages, completed)${words}`
    : `Read "${bookTitle}" (${pagesRead}/${totalPages} pages)${words}`
  // Story Call audience enriches the existing hours note — no new hours doc.
  const storyCallSuffix = audience ? ` (Story Call — read to ${audience})` : ''
  return base + storyCallSuffix
}
