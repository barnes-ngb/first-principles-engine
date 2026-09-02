/**
 * The sight-word channel for "Generate a Book" (the chat flow) — FEAT-169,
 * FEAT-172.
 *
 * `useBookGenerateChat` used to send `words: []` to `generateStory`, so the
 * only way a parent could ask for sight words was to type them into the story
 * idea as prose — and nothing ever asked the model to treat them as a word
 * list. FEAT-169 wired the child's own practice list (the source
 * `DESIGN_STORY_GENERATION_V2.md` §4.2 / §6.3 planned for this surface) as the
 * words the chat sends, and worded the two places the chat says so: *before*
 * the tap (which words it will try to weave in) and *after* (which of them
 * actually landed on a page).
 *
 * FEAT-172 adds the rule that was missing: **a list the parent typed wins.**
 * Shelly typed *"Can you include these sight words: our, friend, pretty, …"*
 * and the chat answered with Lincoln's automatic practice list — honest about
 * what it was doing, but answering a question she did not ask while dropping
 * the one she did. `parseRequestedWords` reads an explicit list out of the
 * story idea; when one is present it is the story's word list and the practice
 * list is not consulted. The confirmation lines name the source in play
 * (*"the words you asked for"* vs *"some of {child}'s practice words"*) so the
 * two are never confused.
 *
 * A surface must not claim something it did not do, so the after-line is
 * checked against the page text, not taken from the model's own `wordsOnPage`
 * claim — for both sources.
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

// ── The parent's typed list (FEAT-172) ──────────────────────────

/**
 * Where the story's word list came from.
 *   - `requested` — the parent typed an explicit list into the story idea.
 *   - `practice`  — the child's own `practicing` / `new` words.
 *   - `none`      — nothing typed and nothing to practise; the story carries
 *                   no word list and the chat makes no claim about words.
 */
export const StoryWordSource = {
  Requested: 'requested',
  Practice: 'practice',
  None: 'none',
} as const
export type StoryWordSource = (typeof StoryWordSource)[keyof typeof StoryWordSource]

/**
 * The cue that introduces a typed list: "(sight|practice|spelling|…) words"
 * followed directly by a colon, a dash, "like" or "are". Deliberately narrow —
 * it must never read ordinary prose ("a dragon who loves words", "words of
 * wisdom") as a list, so a match needs BOTH the cue with its separator and a
 * run of single words after it. The word "words" alone is not enough.
 */
const REQUESTED_WORDS_CUE =
  /\b(?:sight[ -]?words?|practice words?|spelling words?|these words|the words|my words|words to (?:include|use|practi[cs]e))\s*(?:[:\-–—]|\blike\b|\bare\b)\s*/i

/** One list item: a word, allowing an apostrophe or hyphen inside ("don't", "ice-cream"). */
const LIST_ITEM = /^[a-z]+(?:['’-][a-z]+)*$/i

/** The joiner between chained items: "dog and sun", "cat or dog". */
const LIST_JOINER = /^(?:and|or)$/i

/**
 * The explicit word list a parent typed into the story idea, if any.
 *
 * Reads a cue such as *"include these sight words: our, friend, pretty"* or
 * *"practice words — could, would, should"* and returns the words after it,
 * lower-cased, de-duplicated, in the order typed. The list ends at the end of
 * the sentence (`.`, `!`, `?`, `;`, or a line break), so *"…where, know. London
 * becomes a hero"* keeps "know" and drops "london". Items are split on commas
 * (an "x and y and z" chain also counts); every item must be a single word,
 * otherwise the text after the cue was prose, not a list, and `[]` is returned.
 *
 * `[]` — never a guess — for an idea with no cue, a cue with nothing usable
 * after it, or a "list" that is really a sentence.
 */
export function parseRequestedWords(idea: string): string[] {
  const text = idea ?? ''
  const cue = REQUESTED_WORDS_CUE.exec(text)
  if (!cue) return []
  const rest = text.slice(cue.index + cue[0].length)
  // The list runs to the end of the sentence or line.
  const sentenceEnd = rest.search(/[.!?;\n]/)
  const listText = sentenceEnd === -1 ? rest : rest.slice(0, sentenceEnd)
  // Commas are the list separator. A comma-item is one word, or an explicit
  // "dog and sun and cat" chain (a leading joiner — ", and sun" — is fine);
  // anything else ("whatever fits the story best") is prose, and the whole
  // idea is then NOT a list. An item that IS the word "and" or "or" is kept,
  // because both are sight words a parent will ask for ("the, and, said").
  let prose = false
  const rawItems = listText.split(',').flatMap((item) => {
    let tokens = item
      .trim()
      .split(/\s+/)
      .map((s) => s.replace(/^["'“”‘’(]+|["'“”‘’)]+$/g, ''))
      .filter(Boolean)
    if (tokens.length > 1 && LIST_JOINER.test(tokens[0])) tokens = tokens.slice(1)
    if (tokens.length <= 1) return tokens
    // word, joiner, word, joiner, word … — an odd count with joiners between.
    const isChain =
      tokens.length % 2 === 1 &&
      tokens.every((t, i) => (i % 2 === 1 ? LIST_JOINER.test(t) : true))
    if (!isChain) {
      prose = true
      return []
    }
    return tokens.filter((_, i) => i % 2 === 0)
  })
  if (prose || rawItems.length === 0) return []
  // A single stray non-word ("a dragon who has these words: none!") makes the
  // whole thing prose — say so with `[]` rather than sending half a sentence.
  if (rawItems.some((item) => !LIST_ITEM.test(item))) return []
  const seen = new Set<string>()
  const words: string[] = []
  for (const item of rawItems) {
    const w = item.toLowerCase()
    if (seen.has(w)) continue
    seen.add(w)
    words.push(w)
  }
  return words
}

/**
 * The one decision (FEAT-172): the parent's typed list wins; the practice
 * list is the fallback only when the parent named none; no list at all when
 * both are empty. Callers read `source` for the confirmation wording.
 */
export function resolveStoryWords(
  idea: string,
  practiceWords: ReadonlyArray<string>,
): { source: StoryWordSource; words: string[] } {
  const requested = parseRequestedWords(idea)
  if (requested.length > 0) return { source: StoryWordSource.Requested, words: requested }
  if (practiceWords.length > 0) {
    return { source: StoryWordSource.Practice, words: [...practiceWords] }
  }
  return { source: StoryWordSource.None, words: [] }
}

// ── Checking and wording ────────────────────────────────────────

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

/** The before-the-tap line for a list the parent typed (FEAT-172). */
export function requestedWordsPreviewLine(words: ReadonlyArray<string>): string {
  return `I'll try to work in the words you asked for: ${words.join(', ')}.`
}

/**
 * The before-the-tap line for whichever source is in play, so the two are
 * never confused; `''` when there is no list (the UI renders nothing).
 */
export function storyWordsPreviewLine(
  source: StoryWordSource,
  childName: string,
  words: ReadonlyArray<string>,
): string {
  if (words.length === 0 || source === StoryWordSource.None) return ''
  return source === StoryWordSource.Requested
    ? requestedWordsPreviewLine(words)
    : practiceWordsPreviewLine(childName, words)
}

/**
 * The story-draft turn. Says which words landed, checked against the pages;
 * says so plainly when none did; says nothing about words when none were
 * asked for (the pre-FEAT-169 line, unchanged). Names the source (FEAT-172):
 * "the words you asked for" for a typed list, "your practice words" otherwise.
 */
export function storyDraftMessage(
  title: string,
  requestedWords: ReadonlyArray<string>,
  pages: ReadonlyArray<{ text: string }>,
  source: StoryWordSource = StoryWordSource.Practice,
): string {
  const base = `Here's your story! "${title}"`
  if (requestedWords.length === 0 || source === StoryWordSource.None) return base
  const label =
    source === StoryWordSource.Requested ? 'the words you asked for' : 'your practice words'
  const used = practiceWordsUsedIn(pages, requestedWords)
  if (used.length === 0) {
    return `${base} — I couldn't fit ${label} in this time.`
  }
  return `${base} — it uses ${label}: ${used.join(', ')}.`
}
