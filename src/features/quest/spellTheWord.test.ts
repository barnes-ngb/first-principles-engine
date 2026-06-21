import { describe, expect, it } from 'vitest'

import {
  blendSpellingTargets,
  buildSpellWordQuestion,
  generateSpellWordQuestion,
  segmentGraphemes,
  spellingSkillTag,
  FRONTIER_WORDS,
} from './spellTheWord'
import { canAssemble } from './questHelpers'
import { WRITING_LEVEL_CAP } from './questTypes'

// Deterministic rng for reproducible tile order in assertions.
const fixedRng = () => 0.42

describe('segmentGraphemes', () => {
  it('splits CVC words into single letters at low levels', () => {
    expect(segmentGraphemes('cat', 1)).toEqual(['c', 'a', 't'])
    expect(segmentGraphemes('ship', 2)).toEqual(['s', 'h', 'i', 'p']) // no digraph below L3
  })

  it('treats consonant digraphs as single tiles once introduced (L3+)', () => {
    expect(segmentGraphemes('ship', 3)).toEqual(['sh', 'i', 'p'])
    expect(segmentGraphemes('chat', 3)).toEqual(['ch', 'a', 't'])
  })

  it('treats vowel teams as single tiles at L5+', () => {
    expect(segmentGraphemes('train', 5)).toEqual(['t', 'r', 'ai', 'n'])
    expect(segmentGraphemes('light', 5)).toEqual(['l', 'igh', 't'])
  })

  it('always concatenates back to the original word', () => {
    for (const level of [1, 3, 5, 6]) {
      for (const w of ['cat', 'ship', 'train', 'bright', 'cute']) {
        expect(segmentGraphemes(w, level).join('')).toBe(w)
      }
    }
  })
})

describe('blendSpellingTargets — blended word source (sight words + frontier)', () => {
  it('blends the sight-word bank with the phonics frontier, sight words first', () => {
    const targets = blendSpellingTargets({ sightWords: ['said', 'the'] }, 3, 6)
    const words = targets.map((t) => t.word)
    expect(words).toContain('said')
    expect(words).toContain('the')
    // Sight words lead (confidence), frontier follows (stretch).
    expect(targets[0].source).toBe('sightWord')
    expect(targets.some((t) => t.source === 'frontier')).toBe(true)
  })

  it('falls back to frontier-only when the sight-word bank is empty', () => {
    const targets = blendSpellingTargets({ sightWords: [] }, 2, 4)
    expect(targets.length).toBeGreaterThan(0)
    expect(targets.every((t) => t.source === 'frontier')).toBe(true)
  })

  it('returns nothing only when both sources are empty', () => {
    const targets = blendSpellingTargets({ sightWords: [], frontierWords: [] }, 3)
    expect(targets).toEqual([])
  })

  it('dedupes and filters non-alpha / over-long words for the level', () => {
    const targets = blendSpellingTargets(
      { sightWords: ['said', 'said', 'extraordinarily', 'a1b', 'I'] },
      2,
      10,
    )
    const words = targets.map((t) => t.word)
    expect(words.filter((w) => w === 'said')).toHaveLength(1) // deduped
    expect(words).not.toContain('extraordinarily') // too long for L2
    expect(words).not.toContain('a1b') // non-alpha
  })
})

describe('buildSpellWordQuestion — checkable target at the child level', () => {
  it('produces a tile set that can spell the target (checkable)', () => {
    const q = buildSpellWordQuestion({ word: 'ship', source: 'frontier' }, 3, fixedRng)
    expect(q).not.toBeNull()
    expect(canAssemble(q!.targetWord, q!.tiles)).toBe(true)
    expect(q!.targetWord).toBe('ship')
    expect(q!.correctAnswer).toBe('ship')
    expect(q!.type).toBe('spell-word')
  })

  it('never puts the target word in the prompt/stimulus (spoken, not shown)', () => {
    const q = buildSpellWordQuestion({ word: 'train', source: 'sightWord' }, 5, fixedRng)!
    expect(q.prompt.toLowerCase()).not.toContain('train')
    expect(q.stimulus).toBeUndefined()
    // The word is carried only on the spoken cue + answer fields.
    expect(q.audioCue).toBe('train')
  })

  it('tags sight-word vs frontier targets with distinct spelling skills (separable)', () => {
    const sw = buildSpellWordQuestion({ word: 'said', source: 'sightWord' }, 2, fixedRng)!
    const fr = buildSpellWordQuestion({ word: 'cat', source: 'frontier' }, 1, fixedRng)!
    expect(sw.skill).toBe('writing.spelling.sightWord')
    expect(fr.skill).toBe('writing.spelling.phonetic')
    // Both live under writing.spelling — one separable spelling signal, never phonics.
    expect(sw.skill.startsWith('writing.spelling')).toBe(true)
    expect(fr.skill.startsWith('writing.spelling')).toBe(true)
    expect(sw.skill.startsWith('phonics')).toBe(false)
  })

  it('caps the question level at the writing ceiling', () => {
    const q = buildSpellWordQuestion({ word: 'cat', source: 'frontier' }, 99, fixedRng)!
    expect(q.level).toBe(WRITING_LEVEL_CAP)
  })

  it('rejects empty / non-alpha targets', () => {
    expect(buildSpellWordQuestion({ word: '', source: 'frontier' }, 2, fixedRng)).toBeNull()
    expect(buildSpellWordQuestion({ word: 'a1', source: 'frontier' }, 2, fixedRng)).toBeNull()
  })
})

describe('generateSpellWordQuestion', () => {
  it('generates a checkable spell-word question from the blended source', () => {
    const q = generateSpellWordQuestion({ sightWords: ['said'] }, 3, fixedRng)
    expect(q).not.toBeNull()
    expect(q!.type).toBe('spell-word')
    expect(canAssemble(q!.targetWord, q!.tiles)).toBe(true)
  })

  it('returns null when no target is available', () => {
    expect(generateSpellWordQuestion({ sightWords: [], frontierWords: [] }, 3, fixedRng)).toBeNull()
  })

  it('skips a target word already asked this session (avoid-set)', () => {
    // Only "said" is available, but it is in the avoid-set → no fresh target.
    const avoid = new Set(['said'])
    expect(
      generateSpellWordQuestion({ sightWords: ['said'], frontierWords: [] }, 3, fixedRng, avoid),
    ).toBeNull()
  })

  it('picks a non-avoided target when one is available', () => {
    const avoid = new Set(['said'])
    const q = generateSpellWordQuestion(
      { sightWords: ['said', 'play'], frontierWords: [] },
      3,
      fixedRng,
      avoid,
    )
    expect(q).not.toBeNull()
    expect(q!.targetWord).toBe('play')
  })
})

describe('blendSpellingTargets — avoid-set', () => {
  it('excludes already-asked words from the candidate targets', () => {
    const targets = blendSpellingTargets(
      { sightWords: ['said', 'play', 'the'] },
      3,
      6,
      new Set(['said', 'the']),
    )
    const words = targets.map((t) => t.word)
    expect(words).not.toContain('said')
    expect(words).not.toContain('the')
    expect(words).toContain('play')
  })
})

describe('spellingSkillTag', () => {
  it('maps source to the right writing.spelling tag', () => {
    expect(spellingSkillTag('sightWord')).toBe('writing.spelling.sightWord')
    expect(spellingSkillTag('frontier')).toBe('writing.spelling.phonetic')
  })
})

describe('FRONTIER_WORDS', () => {
  it('covers levels 1-6 (CVC → vowel teams), matching build-word', () => {
    for (let l = 1; l <= 6; l++) {
      expect(FRONTIER_WORDS[l]?.length ?? 0).toBeGreaterThan(0)
    }
  })
})
