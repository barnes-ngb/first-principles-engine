/**
 * The kid-copy readability bar — one definition (FEAT-186).
 *
 * FEAT-178 wrote this bar inside `books/__tests__/artHelpContent.test.ts` to
 * hold the art help's kid voice to London's reading. FEAT-186 needed the same
 * bar for the lock-and-gate wording on Kid Today, the Hero Hub, Banner Rally,
 * Watch and Dad Lab — and a second copy of a readability rule is a rule that
 * drifts. So the helper moved here and both suites import it; neither owns it.
 *
 * ── The proxy, and what it is not ────────────────────────────────────────
 *
 * A cheap stand-in, and deliberately labelled as one. The repo's real
 * orthographic classifier is `functions/src/ai/storyDecodability.ts`, which the
 * app cannot import — it is server-only by design and not in
 * `functions/src/shared/`, the one directory both projects compile. So the bar
 * enforced here counts maximal vowel runs after stripping a trailing silent
 * `e` / `es`. It over-counts some words ("science") and under-counts others
 * ("fire"); it is a floor on carelessness, not a reading measurement. Its job
 * is to make "polished", "reimagine" and "characters" fail loudly in copy a
 * six-year-old has to read alone.
 *
 * ── Two levels, and why ──────────────────────────────────────────────────
 *
 * `expectKidWording` is the bar itself: at most eight words, no word over two
 * syllables by the proxy. It applies to every kid-facing string.
 *
 * `expectKidLine` adds the full stop, and applies only to strings that are
 * *sentences*. A chip label, a button label and a bare count ("2 jobs to go!")
 * are not sentences; demanding a period of them would make the copy worse, not
 * more readable. FEAT-178's help-sheet lines are all sentences, so that suite
 * uses `expectKidLine` throughout, exactly as before.
 */
import { expect } from 'vitest'

/** Maximal vowel runs, after a trailing silent `e`/`es`. See the header. */
export function syllableProxy(word: string): number {
  const letters = word.toLowerCase().replace(/[^a-z]/g, '')
  if (letters === '') return 0 // a numeral or bare punctuation — nothing to say
  // Silent trailing e / es, when something vowel-bearing survives it.
  const trimmed = letters.replace(/(?:es|e)$/, '')
  const base = /[aeiouy]/.test(trimmed) ? trimmed : letters
  return Math.max(1, base.match(/[aeiouy]+/g)?.length ?? 1)
}

export function words(line: string): string[] {
  return line.split(/\s+/).filter((w) => w.trim() !== '')
}

export function sentenceCount(line: string): number {
  return (line.match(/[.!?]/g) ?? []).length
}

/** Word count + syllable bar. Applied to every kid string. */
export function expectKidWording(text: string, where: string) {
  expect(words(text).length, `${where}: over eight words — "${text}"`).toBeLessThanOrEqual(8)
  for (const w of words(text)) {
    expect(syllableProxy(w), `${where}: "${w}" is over two syllables — "${text}"`).toBeLessThanOrEqual(2)
  }
}

/** The full bar, for kid *lines* (titles and headings do not end in a period). */
export function expectKidLine(line: string, where: string) {
  expectKidWording(line, where)
  expect(line.trim().endsWith('.'), `${where}: does not end with a period — "${line}"`).toBe(true)
}
