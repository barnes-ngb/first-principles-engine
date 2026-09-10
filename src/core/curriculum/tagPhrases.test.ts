// ── FIX-226 / UX-347 — the word-boundary rule, and what it does not fix ──
//
// `tagPhrases` is the ONE answer to *does this skill tag name this thing*,
// shared by `mapFindingToNode`'s keyword fallback and
// `foundations/curriculumNodeBridge`'s detail resolvers. Both used to ask it with
// `String.includes` over a tag whose separators had been stripped, which is the
// technique that produced UX-347 (`paragraph` contains `graph`) and Codex round
// 1 on FIX-224 (`no-regroup` contains `regroup`).
//
// The first block is the POSITIVE CONTROL for the whole run: it re-creates the
// old technique in three lines and shows it answering wrongly on the same input
// the new rule answers correctly on. Reverting `tagPhrases` to a substring test
// fails this file first.

import { describe, expect, it } from 'vitest'

import { phrasesMatch, phrasesName, tagNames, tagPhrases, tagWords } from './tagPhrases'

/** The technique this module replaced, verbatim. */
function oldTechniqueSaysTagNames(tag: string, keyword: string): boolean {
  return tag.toLowerCase().replace(/[^a-z0-9]/g, '').includes(keyword)
}

describe('the substring technique was the bug — a positive control', () => {
  it('the old rule reads "graph" inside "paragraph"; the new rule does not', () => {
    expect(oldTechniqueSaysTagNames('writing.paragraph', 'graph')).toBe(true)
    expect(tagNames('writing.paragraph', 'graph')).toBe(false)
    // …while the keyword the tag actually names is still found.
    expect(tagNames('writing.paragraph', 'paragraph')).toBe(true)
  })

  it('the old rule reads "data" inside a tag that never says it', () => {
    // The other half of `mapFindingToNode`'s math data rule, same shape.
    expect(oldTechniqueSaysTagNames('reading.metadata.notes', 'data')).toBe(true)
    expect(tagNames('reading.metadata.notes', 'data')).toBe(false)
  })

  it('agrees with the old rule on the vocabulary that actually works', () => {
    // The repair must not cost the loose stems the tables depend on.
    for (const [tag, keyword] of [
      ['phonics.letter-sounds.consonants', 'lettersound'],
      ['math.measurement', 'measur'],
      ['math.multiplication.facts', 'multipl'],
      ['math.division.basic', 'divis'],
      ['speech.intelligibility', 'intelligib'],
      ['math.multi-digit.subtraction', 'multidigit'],
      ['two-digit.addition', 'twodigit'],
      ['fact-family', 'factfamil'],
      ['math.skip-counting', 'skipcount'],
      ['speech.connectedSpeech', 'connectedspeech'],
      ['reading.vocabulary.contextClues', 'contextclue'],
      ['main-idea', 'mainidea'],
      ['multi-syllable', 'multisyllab'],
    ] as const) {
      expect(oldTechniqueSaysTagNames(tag, keyword), `${tag} / ${keyword}`).toBe(true)
      expect(tagNames(tag, keyword), `${tag} / ${keyword}`).toBe(true)
    }
  })
})

describe('tagWords — every separator, and every camelCase hump', () => {
  it('splits on dots, hyphens, underscores, spaces and case', () => {
    expect(tagWords('reading.comprehension.inferCause')).toEqual([
      'reading',
      'comprehension',
      'infer',
      'cause',
    ])
    expect(tagWords('math.two-digit.addition')).toEqual(['math', 'two', 'digit', 'addition'])
    expect(tagWords('math.two_digit addition')).toEqual(['math', 'two', 'digit', 'addition'])
    expect(tagWords('Math.Two-Digit.Addition')).toEqual(['math', 'two', 'digit', 'addition'])
  })

  it('returns nothing for a tag with no letters or digits at all', () => {
    expect(tagWords('...')).toEqual([])
    expect(tagPhrases('...')).toEqual([])
    expect(tagNames('...', 'anything')).toBe(false)
  })
})

describe('tagPhrases — every contiguous run of words', () => {
  it('joins the runs, so a hyphenated phrase is one keyword away', () => {
    expect(tagPhrases('letter-sounds')).toEqual(['letter', 'lettersounds', 'sounds'])
  })

  it('does not join across a gap — only CONTIGUOUS runs', () => {
    // `number-comparison` is a phrase of `number-comparison`, and is NOT a phrase
    // of `number-sense-comparison`, where a word sits between the two.
    expect(tagPhrases('number-comparison')).toContain('numbercomparison')
    expect(tagPhrases('math.number-sense.comparison')).not.toContain('numbercomparison')
  })
})

describe('phrasesName — prefix of a whole phrase', () => {
  it('matches a stem at the start of a phrase and never mid-word', () => {
    const phrases = tagPhrases('math.regrouping')
    expect(phrasesName(phrases, 'regroup')).toBe(true)
    expect(phrasesName(phrases, 'group')).toBe(false)
  })

  it('does NOT rescue a negation — that is a question of meaning, not boundaries', () => {
    // Stated rather than quietly relied on: "no regrouping" really does contain
    // the word "regrouping", so `curriculumNodeBridge` must keep testing the
    // negation first. A boundary rule that appeared to handle this would be
    // worse than one that says it does not.
    expect(tagNames('math.subtraction.no-regroup', 'regroup')).toBe(true)
    expect(tagNames('math.subtraction.no-regroup', 'noregroup')).toBe(true)
  })
})

describe('phrasesMatch — an anchored pattern over the phrases', () => {
  it('reads a numeric band off a whole phrase', () => {
    const m = phrasesMatch(tagPhrases('math.addition.within-20'), /^within(\d+)$/)
    expect(m?.[1]).toBe('20')
  })

  it('returns null when no whole phrase matches', () => {
    expect(phrasesMatch(tagPhrases('math.addition'), /^within(\d+)$/)).toBeNull()
    // Anchored to a WHOLE phrase: `withinish20` is one word, not `within` + `20`.
    expect(phrasesMatch(tagPhrases('math.withinish20'), /^within(\d+)$/)).toBeNull()
    // `within-20-and-beyond` DOES match, because `within` and `20` are adjacent
    // words and therefore a phrase — the rule is contiguity, not the whole tag.
    expect(phrasesMatch(tagPhrases('math.within-20-and-beyond'), /^within(\d+)$/)?.[1]).toBe('20')
  })
})
