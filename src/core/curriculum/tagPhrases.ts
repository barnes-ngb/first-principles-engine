/**
 * **The ONE answer to *does this skill tag name this thing* (FIX-226 / UX-347).**
 *
 * Skill tags arrive in a dozen shapes — `math.subtraction.no-regroup`,
 * `reading.comprehension.inferCause`, `phonics.letter-sounds.consonants`,
 * `two-digit.addition` — and two modules have to ask the same question of them:
 * `mapFindingToNode`'s keyword fallback (*which curriculum node is this about?*)
 * and `foundations/curriculumNodeBridge`'s detail resolvers (*which of these
 * sibling concepts does the tag's own detail name?*).
 *
 * They used to ask it two different ways, and **both ways were the same bug**:
 * strip every separator out of the tag and run `String.includes`. That produced
 * `paragraph` containing `graph` (UX-347 — a writing finding written onto a math
 * concept) and `no-regroup` containing `regroup` (Codex round 1 on FIX-224 — the
 * *harder* concept marked solid for a child who had demonstrated the opposite).
 * One technique, two modules, three defects, two of them found by accident.
 *
 * ## The rule
 *
 * A tag is split into **words** on every separator *and* on each camelCase hump,
 * then re-joined into every **phrase** — each contiguous run of those words. A
 * keyword names the tag when it is a **prefix of one whole phrase**.
 *
 *   - `writing.paragraph` → words `writing` · `paragraph`; phrases `writing`,
 *     `writingparagraph`, `paragraph`. `graph` is a prefix of none of them, so it
 *     cannot match — which is UX-347, closed by construction rather than by
 *     re-ordering the tests that happened to expose it.
 *   - `letter-sounds` → phrase `lettersounds`, which the keyword `lettersound` is
 *     a prefix of. **Prefix, not equality**, because the vocabulary these tables
 *     depend on is deliberately stemmed (`measur`, `multipl`, `divis`, `rhym`,
 *     `intelligib`) and because English plurals would otherwise each need an
 *     entry.
 *
 * ## What it deliberately does NOT fix
 *
 * **Negation.** `no-regroup` really does contain the *word* `regroup`, so a
 * keyword `regroup` still matches it and must be tested after the negation — that
 * is a question of meaning, not of boundaries, and `curriculumNodeBridge`'s
 * `NO_REGROUP` rule is where it is answered. Saying so here is the point: a
 * boundary rule that quietly appeared to handle negation would be worse than one
 * that states it does not.
 *
 * **Pure.** No I/O, no clock, no Firestore, and no knowledge of either id
 * namespace — it answers about strings only, so neither consumer owns it.
 */

/**
 * A tag's words: every separator is a boundary, and so is a camelCase hump.
 * `reading.comprehension.inferCause` → `reading` · `comprehension` · `infer` ·
 * `cause`; `two-digit.addition` → `two` · `digit` · `addition`.
 */
export function tagWords(tag: string): string[] {
  return tag
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/**
 * Every contiguous run of a tag's words, joined up — the set a keyword may match
 * against. `letter-sounds` gives `letter`, `lettersounds`, `sounds`.
 */
export function tagPhrases(tag: string): string[] {
  const words = tagWords(tag)
  const phrases: string[] = []
  for (let i = 0; i < words.length; i++) {
    let run = ''
    for (let j = i; j < words.length; j++) {
      run += words[j]
      phrases.push(run)
    }
  }
  return phrases
}

/**
 * Does `tag` name `keyword` — i.e. is the keyword a prefix of one whole phrase of
 * the tag? Pass a pre-computed phrase list when asking many keywords about one
 * tag (the keyword tables do).
 */
export function tagNames(tag: string, keyword: string): boolean {
  return phrasesName(tagPhrases(tag), keyword)
}

/** {@link tagNames} against an already-computed phrase list. */
export function phrasesName(phrases: readonly string[], keyword: string): boolean {
  return phrases.some((phrase) => phrase.startsWith(keyword))
}

/** Does any phrase of the tag match this pattern exactly (anchored both ends)? */
export function phrasesMatch(phrases: readonly string[], pattern: RegExp): RegExpExecArray | null {
  for (const phrase of phrases) {
    const m = pattern.exec(phrase)
    if (m) return m
  }
  return null
}
