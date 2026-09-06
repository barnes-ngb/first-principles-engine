import type { WeekEvidence } from '../../core/types'

/**
 * The week's evidence as one short line (UX-219).
 *
 * The weekly review stopped being a report. What is left is a **log**: hours,
 * the observed rate, what the week actually produced, and the parent's own
 * answer. This is the third of those — *"2 books made · 3 reading sessions · 2
 * teach-backs."*
 *
 * ── Why counts and not a narrative ──────────────────────────────────────────
 *
 * The owner's read of the generated review was *"I'm not sure what review is
 * doing. Basically useless, the month is better."* A five-day narrative mostly
 * restates the checklist, and on a thin week the generator writes nothing and
 * the page renders blank cards under bold headings. These numbers are the
 * opposite: they are the unfalsifiable record, they are already computed for the
 * week by the Cloud Function that assembles `WeekEvidence`, and they cannot be
 * empty in a way that reads as the app having nothing to say.
 *
 * ── The two rules this module exists to hold ────────────────────────────────
 *
 * **1. Every count here is one the repo already keeps.** Nothing is invented and
 * nothing costs an extra Firestore read: the four numbers are read straight off
 * `WeeklyReview.evidence`, which `assembleWeekContext` already writes onto the
 * review document. There is no photo or lab count in that shape, so there is no
 * photo or lab count in this line.
 *
 * **2. A missing summary is not a zero.** `undefined` — a week the Sunday cron
 * has not reached yet, or a review generated before `evidence` existed — returns
 * `null` and the caller says nothing. Only a summary that is actually present
 * may report a zero, and then it reports it plainly: *"No books or teach-backs
 * logged this week."* Rendering that sentence off an absent read would be a
 * failure presented as an affirmative records result, which is the one thing
 * this page may not do (`weekHours.ts` holds the same line for hours).
 *
 * Never red, never ranked, never a target — the same rule as the hours beside it.
 */

/** What the line says when the summary is present and every count is zero. */
export const NO_EVIDENCE_LINE = 'No books or teach-backs logged this week.'

const plural = (n: number, unit: string): string =>
  `${n} ${unit}${n === 1 ? '' : 's'}`

/**
 * Structurally narrow one count off an unvalidated `weeklyReviews` document.
 *
 * `WeekEvidence` is written by a Cloud Function whose document type is a
 * hand-kept parallel of the client's, so an off-shape value is possible in a way
 * the types do not admit. Anything that is not a non-negative finite number is
 * treated as zero rather than printed — a `NaN` here would render as
 * *"NaN books made"*.
 */
const countOf = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0

const lengthOf = (v: unknown): number => (Array.isArray(v) ? v.length : 0)

/**
 * The evidence line, or `null` when there is no summary to read.
 *
 * Segments appear only when non-zero, so a real week reads as a short list
 * rather than a row of zeros; a summary with nothing in it gets the one plain
 * sentence above.
 */
export function weekEvidenceCountsLine(
  evidence: WeekEvidence | undefined,
): string | null {
  if (!evidence || typeof evidence !== 'object') return null

  const books = (evidence.books ?? {}) as Partial<WeekEvidence['books']>
  const teachBacks = (evidence.teachBacks ?? {}) as Partial<
    WeekEvidence['teachBacks']
  >

  const made = lengthOf(books.booksCreated)
  const finished = lengthOf(books.booksCompleted)
  const sessions = countOf(books.readingSessions?.count)
  const taught = countOf(teachBacks.count)

  const parts: string[] = []
  if (made > 0) parts.push(`${plural(made, 'book')} made`)
  if (finished > 0) parts.push(`${plural(finished, 'book')} finished`)
  if (sessions > 0) parts.push(plural(sessions, 'reading session'))
  if (taught > 0) parts.push(plural(taught, 'teach-back'))

  if (parts.length === 0) return NO_EVIDENCE_LINE
  return `${parts.join(' · ')}.`
}
