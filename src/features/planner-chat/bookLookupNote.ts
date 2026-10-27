import type { BookLookupResult } from '../../core/types'

/**
 * What the "Look it up" result did NOT fill, said under the form (UX-464).
 *
 * A long book's lookup can come back without chapter summaries (the server
 * re-ran it asking for titles only, because the full reply was cut short) or
 * with titles for only some chapters. The form saves one chapter per number up
 * to the chapter count either way, so no chapter is lost — but a parent should
 * not find out later that most of the list is bare numbers. `null` when the
 * lookup filled everything it was asked for.
 */
export function bookLookupNote(result: BookLookupResult): string | null {
  const total = Number.isFinite(result.totalChapters) ? result.totalChapters : 0
  if (total < 1) return null
  const titled = new Set(
    (result.chapters ?? [])
      .filter((c) => c.number >= 1 && c.number <= total && (c.title ?? '').trim() !== '')
      .map((c) => c.number),
  ).size
  const parts: string[] = []
  if (result.chapterSummariesOmitted) {
    parts.push('This is a long book, so only chapter titles were looked up — no chapter summaries.')
  }
  if (titled < total) {
    parts.push(
      titled === 0
        ? `No chapter titles were found; all ${total} chapters will be saved by number.`
        : `Found titles for ${titled} of ${total} chapters; the rest will be saved by number.`,
    )
  }
  return parts.length > 0 ? parts.join(' ') : null
}
