import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LEVEL_STRETCH,
  LEVEL_STRETCH_FOOTNOTE,
  levelStretchHint,
  levelStretchOptions,
  levelStretchPhrase,
  normalizeLevelStretch,
  ownLevelLabel,
} from '../storyLevelStretch'
import { storyDraftMessage, storyReadabilityClause } from '../storyPracticeWords'

/**
 * FEAT-191 — the per-story "one step up", client side.
 *
 * Two things are pinned here: the copy the parent taps, and the honest line's
 * new job. The line used to be silent on a pass, which after this run would mean
 * a book full of bigger words with nothing saying they were asked for.
 */

describe('normalizeLevelStretch', () => {
  it('keeps the three real choices', () => {
    expect(normalizeLevelStretch(0)).toBe(0)
    expect(normalizeLevelStretch(1)).toBe(1)
    expect(normalizeLevelStretch(2)).toBe(2)
  })

  it('defaults to the child’s own level for anything unusable', () => {
    expect(normalizeLevelStretch(undefined)).toBe(DEFAULT_LEVEL_STRETCH)
    expect(normalizeLevelStretch(null)).toBe(0)
    expect(normalizeLevelStretch('two')).toBe(0)
    expect(normalizeLevelStretch(-1)).toBe(0)
  })

  it('clamps an over-large stored value', () => {
    expect(normalizeLevelStretch(9)).toBe(2)
  })
})

describe('the control’s copy', () => {
  it('names the child rather than guessing a pronoun for them', () => {
    expect(ownLevelLabel('Lincoln')).toBe("Lincoln's level")
    // No name on file is not a licence to guess one either.
    expect(ownLevelLabel('  ')).toBe('Their level')
  })

  it('offers the child’s own level first, then the two reaches', () => {
    const options = levelStretchOptions('Lincoln')
    expect(options.map((o) => o.value)).toEqual([0, 1, 2])
    expect(options[0].label).toBe("Lincoln's level")
    expect(options[1].label).toBe('One step up')
    expect(options[2].label).toBe('Two steps up')
  })

  it('says every option is just this book, and where the lasting change lives', () => {
    expect(levelStretchHint(1, 'Lincoln')).toContain('just for this book')
    expect(LEVEL_STRETCH_FOOTNOTE).toContain('Skill Snapshot')
    expect(LEVEL_STRETCH_FOOTNOTE).toContain('Just this book')
  })

  it('shares one phrase with the server prompt and the honest line', () => {
    expect(levelStretchPhrase(1)).toBe('one step up')
    expect(levelStretchPhrase(2)).toBe('two steps up')
  })
})

describe('storyReadabilityClause with a stretch (FEAT-191)', () => {
  const passing = {
    passed: true,
    levelSource: 'assessed' as const,
    hardWords: [],
    hardWordCount: 0,
  }
  const failing = {
    passed: false,
    levelSource: 'assessed' as const,
    hardWords: [
      { page: 1, word: 'castle' },
      { page: 2, word: 'ready' },
    ],
    hardWordCount: 2,
  }

  it('says a passing story was written up, so the bigger words are accounted for', () => {
    expect(storyReadabilityClause('Lincoln', { ...passing, stretch: 1, phonicsLevel: 3 })).toBe(
      'Written one step up (Level 3).',
    )
    expect(storyReadabilityClause('Lincoln', { ...passing, stretch: 2, phonicsLevel: 4 })).toBe(
      'Written two steps up (Level 4).',
    )
  })

  it('stays silent on a passing story with no stretch — unchanged', () => {
    expect(storyReadabilityClause('Lincoln', passing)).toBe('')
    expect(storyReadabilityClause('Lincoln', { ...passing, stretch: 0 })).toBe('')
    expect(storyReadabilityClause('Lincoln', undefined)).toBe('')
  })

  it('measures a failure against the STRETCHED level, and says what it stretched from', () => {
    expect(
      storyReadabilityClause('Lincoln', { ...failing, stretch: 1, phonicsLevel: 3 }),
    ).toBe(
      "2 words may be above Level 3 (one step up from Lincoln's level): castle, ready.",
    )
  })

  it('keeps the pre-FEAT-191 failure wording when nothing was stretched', () => {
    expect(storyReadabilityClause('Lincoln', failing)).toBe(
      "2 words may be above Lincoln's level: castle, ready.",
    )
  })

  it('still names an estimated level alongside the stretch', () => {
    expect(
      storyReadabilityClause('Lincoln', {
        ...failing,
        levelSource: 'age',
        stretch: 1,
        phonicsLevel: 3,
      }),
    ).toContain('(level estimated from age)')
  })

  it('never invents a level number an older deploy did not send', () => {
    const clause = storyReadabilityClause('Lincoln', { ...passing, stretch: 1 })
    expect(clause).toBe('Written one step up.')
    expect(clause).not.toMatch(/Level \d/)
  })
})

describe('storyDraftMessage carries the stretch onto the draft turn', () => {
  const pages = [{ text: 'The ship is black.' }]

  it('appends the written-up clause to a passing draft', () => {
    const line = storyDraftMessage('The Ship', [], pages, 'none', {
      passed: true,
      levelSource: 'assessed',
      hardWords: [],
      hardWordCount: 0,
      stretch: 1,
      phonicsLevel: 3,
    })
    // The em-dash join is `appendClause`'s existing rule — the body ends on a
    // quote, not a full stop, so the clause is attached rather than started.
    expect(line).toBe('Here\'s your story! "The Ship" — Written one step up (Level 3).')
  })

  it('leaves an unstretched passing draft byte-identical', () => {
    const withField = storyDraftMessage('The Ship', [], pages, 'none', {
      passed: true,
      levelSource: 'assessed',
      hardWords: [],
      hardWordCount: 0,
      stretch: 0,
    })
    const without = storyDraftMessage('The Ship', [], pages, 'none')
    expect(withField).toBe(without)
  })
})
