import { describe, expect, it } from 'vitest'

import {
  assembleSentence,
  canAssembleSentence,
  buildSentenceQuestion,
  generateBuildSentenceQuestion,
  SENTENCE_CAPITAL_TILE,
  SENTENCE_PERIOD_TILE,
  FUNCTION_WORDS,
} from './buildTheSentence'
import { WritingTags } from '../../core/types/skillTags'
import { SENTENCE_LEVEL_CAP } from './questTypes'

/** Deterministic RNG (mulberry32) so generation is reproducible in tests. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('assembleSentence — capital + period are part of the build', () => {
  it('capitalizes the first word and attaches the period (correct order)', () => {
    const out = assembleSentence([SENTENCE_CAPITAL_TILE, 'the', 'cat', 'ran', SENTENCE_PERIOD_TILE])
    expect(out).toBe('The cat ran.')
  })

  it('reflects a forgotten capital faithfully (no silent fixing)', () => {
    expect(assembleSentence(['the', 'cat', 'ran', SENTENCE_PERIOD_TILE])).toBe('the cat ran.')
  })

  it('reflects a misplaced period faithfully', () => {
    const out = assembleSentence([SENTENCE_CAPITAL_TILE, 'the', SENTENCE_PERIOD_TILE, 'cat', 'ran'])
    expect(out).toBe('The. cat ran')
  })
})

describe('canAssembleSentence — solvability/checkability', () => {
  it('is true when tiles contain every word + a capital + a period', () => {
    const tiles = ['ran', 'the', SENTENCE_CAPITAL_TILE, 'cat', SENTENCE_PERIOD_TILE]
    expect(canAssembleSentence('The cat ran.', tiles)).toBe(true)
  })

  it('is false when the capital tile is missing', () => {
    expect(canAssembleSentence('The cat ran.', ['the', 'cat', 'ran', SENTENCE_PERIOD_TILE])).toBe(false)
  })

  it('is false when the period tile is missing', () => {
    expect(canAssembleSentence('The cat ran.', [SENTENCE_CAPITAL_TILE, 'the', 'cat', 'ran'])).toBe(false)
  })

  it('is false when a word is missing', () => {
    expect(
      canAssembleSentence('The cat ran.', [SENTENCE_CAPITAL_TILE, 'the', 'cat', SENTENCE_PERIOD_TILE]),
    ).toBe(false)
  })
})

describe('buildSentenceQuestion — scrambled-to-order, checkable, tap-only', () => {
  it('builds a checkable question whose tiles assemble to the target', () => {
    const q = buildSentenceQuestion(['the', 'cat', 'ran'], 2, seeded(1))
    expect(q).not.toBeNull()
    expect(q!.type).toBe('build-sentence')
    expect(q!.targetSentence).toBe('The cat ran.')
    expect(q!.correctAnswer).toBe(q!.targetSentence)
    // The tiles always include the words + a capital + a period.
    expect(canAssembleSentence(q!.targetSentence, q!.tiles)).toBe(true)
    expect(q!.tiles).toContain(SENTENCE_CAPITAL_TILE)
    expect(q!.tiles).toContain(SENTENCE_PERIOD_TILE)
  })

  it('presents the words scrambled (not pre-ordered) and never shows the sentence as text', () => {
    const q = buildSentenceQuestion(['the', 'big', 'dog', 'slept'], 4, seeded(7))!
    // The target sentence text appears ONLY in the answer fields, never in the
    // prompt/stimulus the child sees.
    expect(q.prompt).not.toContain(q.targetSentence)
    expect(q.stimulus ?? '').not.toContain('dog')
    // Sanity: assembling the tiles in the correct order reproduces the target.
    const correctOrder = [SENTENCE_CAPITAL_TILE, 'the', 'big', 'dog', 'slept', SENTENCE_PERIOD_TILE]
    expect(assembleSentence(correctOrder)).toBe(q.targetSentence)
  })

  it('tags the sentence signal (writing.composition.sentence), NOT a spelling tag', () => {
    const q = buildSentenceQuestion(['the', 'cat', 'ran'], 2, seeded(3))!
    expect(q.skill).toBe(WritingTags.SentenceComposition)
    expect(q.skill.startsWith('writing.spelling')).toBe(false)
  })

  it('caps the question level at SENTENCE_LEVEL_CAP', () => {
    const q = buildSentenceQuestion(['the', 'cat', 'ran'], 99, seeded(2))!
    expect(q.level).toBe(SENTENCE_LEVEL_CAP)
  })

  it('returns null for empty input', () => {
    expect(buildSentenceQuestion([], 2)).toBeNull()
  })
})

describe('generateBuildSentenceQuestion — client-gen from bank + function words', () => {
  it('generates a grammatical, checkable sentence at level from the function-word scaffold alone', () => {
    const q = generateBuildSentenceQuestion({ bankWords: [] }, 2, seeded(11))!
    expect(q).not.toBeNull()
    expect(canAssembleSentence(q.targetSentence, q.tiles)).toBe(true)
    // Function words (the/a/my/I/we/prepositions) are the grammar scaffold.
    const words = q.targetSentence.replace(/\.$/, '').toLowerCase().split(/\s+/)
    expect(words.some((w) => FUNCTION_WORDS.map((f) => f.toLowerCase()).includes(w))).toBe(true)
  })

  it('blends a bank word into a content slot when it fits (his words)', () => {
    // 'frog' is in the noun pool — provided as a bank word it should be eligible
    // to fill the noun slot. Scan seeds until it surfaces (deterministic search).
    let used = false
    for (let s = 0; s < 50 && !used; s++) {
      const q = generateBuildSentenceQuestion({ bankWords: ['frog'] }, 2, seeded(s))!
      if (q.targetSentence.toLowerCase().includes('frog')) {
        used = true
        expect(q.source).toBe('wordBank')
      }
    }
    expect(used).toBe(true)
  })

  it('re-rolls past a sentence already asked this session (avoid-set)', () => {
    // Capture the sentence a fixed seed produces, avoid it, and confirm the
    // generator re-rolls to a DIFFERENT, fresh sentence rather than repeating.
    const first = generateBuildSentenceQuestion({ bankWords: [] }, 1, seeded(3))!
    const avoid = new Set([first.targetSentence.trim().toLowerCase()])
    const again = generateBuildSentenceQuestion({ bankWords: [] }, 1, seeded(3), avoid)
    expect(again).not.toBeNull()
    expect(again!.targetSentence.trim().toLowerCase()).not.toBe(
      first.targetSentence.trim().toLowerCase(),
    )
    expect(avoid.has(again!.targetSentence.trim().toLowerCase())).toBe(false)
  })

  it('returns null when every re-roll collides with the avoid-set', () => {
    // A constant rng makes generation fully deterministic — every attempt yields
    // the same sentence, so avoiding it exhausts the re-rolls and returns null
    // (the caller then falls back to the AI question instead of repeating).
    const constRng = () => 0.5
    const only = generateBuildSentenceQuestion({ bankWords: [] }, 1, constRng)!
    const avoid = new Set([only.targetSentence.trim().toLowerCase()])
    expect(generateBuildSentenceQuestion({ bankWords: [] }, 1, constRng, avoid)).toBeNull()
  })
})
