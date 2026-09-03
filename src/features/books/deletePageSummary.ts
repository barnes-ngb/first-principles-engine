import type { BookPage } from '../../core/types'

/**
 * What a page holds, in the counts a person can check against the page in
 * front of them (UX-130).
 *
 * Page deletion is destructive and outside Undo's per-page history, and the
 * book auto-saves, so the confirm has to say what actually goes — not "are you
 * sure". Pictures and words are the two things a page can lose that a parent
 * or a kid would miss.
 *
 * Pure and total: an absent page, absent text and absent images all read as
 * empty rather than throwing, because the dialog renders while the page is
 * being removed underneath it.
 */
export function describePageContents(page: Pick<BookPage, 'text' | 'images'> | null | undefined): string {
  const words = countWords(page?.text)
  const pictures = page?.images?.length ?? 0
  if (words === 0 && pictures === 0) return 'This page is empty.'
  const parts: string[] = []
  if (pictures > 0) parts.push(`${pictures} ${pictures === 1 ? 'picture' : 'pictures'}`)
  if (words > 0) parts.push(`${words} ${words === 1 ? 'word' : 'words'}`)
  return `It has ${parts.join(' and ')}.`
}

/** Whitespace-separated runs that contain at least one letter or digit. */
function countWords(text: string | undefined): number {
  if (!text) return 0
  return text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length
}
