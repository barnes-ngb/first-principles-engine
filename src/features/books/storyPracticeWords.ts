/**
 * The sight-word channel for "Generate a Book" (the chat flow) — FEAT-169.
 *
 * `useBookGenerateChat` used to send `words: []` to `generateStory`, so the
 * only way a parent could ask for sight words was to type them into the story
 * idea as prose — and nothing ever asked the model to treat them as a word
 * list. This module picks the words the chat sends (the child's own practice
 * list, the source `DESIGN_STORY_GENERATION_V2.md` §4.2 / §6.3 planned for
 * this surface and never wired), and words the two places the chat says so:
 * *before* the tap (which words it will try to weave in) and *after* (which
 * of them actually landed on a page). A surface must not claim something it
 * did not do, so the after-line is checked against the page text, not taken
 * from the model's own `wordsOnPage` claim.
 *
 * Pure: no I/O, no React, never throws.
 */

import type { SightWordProgress } from '../../core/types'

/**
 * How many practice words the chat sends. Matches the cap the server's
 * `sightWords` context slice already applies to "words needing work", so the
 * explicit list and the background summary describe the same words. The
 * prompt asks the model to weave in 3-5 of them, so more would only dilute
 * the ask and lengthen the confirmation line.
 */
export const MAX_STORY_PRACTICE_WORDS = 15

const WEAK_LEVELS: ReadonlySet<SightWordProgress['masteryLevel']> = new Set([
  'practicing',
  'new',
])

/**
 * The child's words still being worked on — `practicing` and `new`, the same
 * filter `useSightWordProgress.getWeakWords` and the server slice use — in a
 * deterministic order: words the child has been seen struggling with
 * (`practicing`) before words only just added (`new`); most help requested
 * first; then alphabetical. Lower-cased and de-duplicated. Capped at `max`.
 */
export function selectStoryPracticeWords(
  progress: Iterable<SightWordProgress>,
  max: number = MAX_STORY_PRACTICE_WORDS,
): string[] {
  const seen = new Set<string>()
  const candidates: SightWordProgress[] = []
  for (const p of progress) {
    if (!WEAK_LEVELS.has(p.masteryLevel)) continue
    const word = p.word.trim().toLowerCase()
    if (!word || seen.has(word)) continue
    seen.add(word)
    candidates.push({ ...p, word })
  }
  candidates.sort((a, b) => {
    if (a.masteryLevel !== b.masteryLevel) {
      return a.masteryLevel === 'practicing' ? -1 : 1
    }
    if (a.helpRequested !== b.helpRequested) return b.helpRequested - a.helpRequested
    return a.word.localeCompare(b.word)
  })
  return candidates.slice(0, Math.max(0, max)).map((p) => p.word)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Which of `words` actually appear in the story text, as whole words
 * (case-insensitive; "Mr." matches "Mr." but "an" does not match "and").
 * Returned in the order requested. This — not the model's `wordsOnPage` —
 * is what the chat reports back, so it never claims a word the pages don't hold.
 */
export function practiceWordsUsedIn(
  pages: ReadonlyArray<{ text: string }>,
  words: ReadonlyArray<string>,
): string[] {
  const text = pages.map((p) => p.text ?? '').join('\n')
  if (!text.trim()) return []
  return words.filter((word) => {
    const w = word.trim()
    if (!w) return false
    const re = new RegExp(`(^|[^A-Za-z0-9'])${escapeRegExp(w)}(?=$|[^A-Za-z0-9'])`, 'i')
    return re.test(text)
  })
}

/** The line shown under the echo turn, before the tap: what the chat will try to do. */
export function practiceWordsPreviewLine(childName: string, words: ReadonlyArray<string>): string {
  return `I'll try to weave in some of ${childName}'s practice words: ${words.join(', ')}.`
}

/**
 * The story-draft turn. Says which practice words landed, checked against
 * the pages; says so plainly when none did; says nothing about words when
 * none were asked for (the pre-FEAT-169 line, unchanged).
 */
export function storyDraftMessage(
  title: string,
  requestedWords: ReadonlyArray<string>,
  pages: ReadonlyArray<{ text: string }>,
): string {
  const base = `Here's your story! "${title}"`
  if (requestedWords.length === 0) return base
  const used = practiceWordsUsedIn(pages, requestedWords)
  if (used.length === 0) {
    return `${base} — I couldn't fit your practice words in this time.`
  }
  return `${base} — it uses your practice words: ${used.join(', ')}.`
}
