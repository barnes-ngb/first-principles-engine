import { describe, expect, it } from 'vitest'

import type { SightWordProgress } from '../../core/types'
import {
  MAX_STORY_PRACTICE_WORDS,
  StoryWordSource,
  parseRequestedWords,
  practiceWordsPreviewLine,
  practiceWordsUsedIn,
  requestedWordsPreviewLine,
  resolveStoryWords,
  selectStoryPracticeWords,
  storyDraftMessage,
  storyReadabilityClause,
  storyWordsPreviewLine,
} from './storyPracticeWords'

function progress(
  word: string,
  masteryLevel: SightWordProgress['masteryLevel'],
  helpRequested = 0,
): SightWordProgress {
  return {
    word,
    masteryLevel,
    helpRequested,
    encounters: 0,
    selfReportedKnown: 0,
    shellyConfirmed: false,
    firstSeen: '2026-01-01T00:00:00.000Z',
    lastSeen: '2026-01-01T00:00:00.000Z',
    lastLevelChange: '2026-01-01T00:00:00.000Z',
  }
}

describe('selectStoryPracticeWords (FEAT-169 — the words the chat sends)', () => {
  it('keeps only practicing + new words, the same filter getWeakWords uses', () => {
    const words = selectStoryPracticeWords([
      progress('the', 'mastered'),
      progress('again', 'practicing'),
      progress('water', 'new'),
      progress('and', 'familiar'),
    ])
    expect(words).toEqual(['again', 'water'])
  })

  it('orders practicing before new, most help requested first, then alphabetically', () => {
    const words = selectStoryPracticeWords([
      progress('yellow', 'new'),
      progress('people', 'practicing', 1),
      progress('another', 'new'),
      progress('carry', 'practicing', 4),
      progress('always', 'practicing', 1),
    ])
    expect(words).toEqual(['carry', 'always', 'people', 'another', 'yellow'])
  })

  it('lower-cases, trims and de-duplicates', () => {
    const words = selectStoryPracticeWords([
      progress(' Mr. ', 'new'),
      progress('mr.', 'practicing'),
      progress('', 'new'),
    ])
    expect(words).toEqual(['mr.'])
  })

  it(`caps at ${MAX_STORY_PRACTICE_WORDS} (the server slice's own cap) — a 22-word list is trimmed, not sent whole`, () => {
    const many = Array.from({ length: 22 }, (_, i) =>
      progress(`w${String(i).padStart(2, '0')}`, 'new'),
    )
    expect(selectStoryPracticeWords(many)).toHaveLength(MAX_STORY_PRACTICE_WORDS)
    expect(selectStoryPracticeWords(many, 3)).toEqual(['w00', 'w01', 'w02'])
  })

  it('is empty for a child with nothing to practise, so the UI makes no claim', () => {
    expect(selectStoryPracticeWords([])).toEqual([])
    expect(selectStoryPracticeWords([progress('the', 'mastered')])).toEqual([])
  })
})

describe('practiceWordsUsedIn — checked against the page text, never the model claim', () => {
  const pages = [
    { text: 'Mr. Steve and the cat went to the water.' },
    { text: '"Come again!" said the yellow bird.' },
  ]

  it('reports only whole-word, case-insensitive hits, in the requested order', () => {
    expect(practiceWordsUsedIn(pages, ['yellow', 'mr.', 'water', 'again', 'people'])).toEqual([
      'yellow',
      'mr.',
      'water',
      'again',
    ])
  })

  it('does not count a word that only appears inside another word', () => {
    expect(practiceWordsUsedIn([{ text: 'The sand was warm.' }], ['and', 'an', 'a'])).toEqual([])
  })

  it('is empty with no text or no words', () => {
    expect(practiceWordsUsedIn([], ['water'])).toEqual([])
    expect(practiceWordsUsedIn([{ text: '' }], ['water'])).toEqual([])
    expect(practiceWordsUsedIn(pages, [])).toEqual([])
  })
})

describe('the two confirmation lines', () => {
  it('previews the exact list before the tap', () => {
    expect(practiceWordsPreviewLine('Lincoln', ['again', 'water'])).toBe(
      "I'll try to weave in some of Lincoln's practice words: again, water.",
    )
  })

  it('the draft turn reports the words that landed, from the pages', () => {
    const msg = storyDraftMessage(
      'Cave Cat',
      ['again', 'water', 'people'],
      [{ text: 'The cat found water.' }, { text: 'Again and again it dug.' }],
    )
    expect(msg).toBe('Here\'s your story! "Cave Cat" — it uses your practice words: again, water.')
  })

  it('says so plainly when none of the requested words landed', () => {
    expect(storyDraftMessage('Cave Cat', ['people'], [{ text: 'The cat dug.' }])).toBe(
      'Here\'s your story! "Cave Cat" — I couldn\'t fit your practice words in this time.',
    )
  })

  it('says nothing about words when none were asked for (the pre-FEAT-169 line)', () => {
    expect(storyDraftMessage('Cave Cat', [], [{ text: 'The cat dug.' }])).toBe(
      'Here\'s your story! "Cave Cat"',
    )
  })
})

// ── FEAT-172: the words the parent typed win ─────────────────────

/** Shelly's report, 2026-09-02, verbatim. */
const SHELLY_IDEA =
  'Can you include these sight words: our, friend, pretty, eight, could, very, should, would, blue, around, where, know. London becomes Spider-Man'

describe('parseRequestedWords — an explicit list typed into the idea (FEAT-172)', () => {
  it("reads Shelly's typed list, in order, and stops at the end of the sentence", () => {
    expect(parseRequestedWords(SHELLY_IDEA)).toEqual([
      'our',
      'friend',
      'pretty',
      'eight',
      'could',
      'very',
      'should',
      'would',
      'blue',
      'around',
      'where',
      'know',
    ])
  })

  it('accepts the other ways a parent writes the cue — dash, "like", "are", "practice words", "words to include"', () => {
    expect(parseRequestedWords('practice words — could, would, should')).toEqual([
      'could',
      'would',
      'should',
    ])
    expect(parseRequestedWords('A dragon story with sight words like the, and, said')).toEqual([
      'the',
      'and',
      'said',
    ])
    expect(parseRequestedWords('The words are cat, dog and sun. A farm story.')).toEqual([
      'cat',
      'dog',
      'sun',
    ])
    expect(parseRequestedWords('Words to include: run, jump')).toEqual(['run', 'jump'])
    expect(parseRequestedWords('sightwords: my, by')).toEqual(['my', 'by'])
  })

  it('lower-cases, de-duplicates, strips quotes and trailing punctuation, and keeps hyphens / apostrophes', () => {
    expect(parseRequestedWords(`Sight words: "Our", our, Don't, ice-cream, FRIEND!`)).toEqual([
      'our',
      "don't",
      'ice-cream',
      'friend',
    ])
  })

  it('is [] — never a guess — for an idea with no cue', () => {
    expect(parseRequestedWords('a puppy who finds a rainbow')).toEqual([])
    expect(parseRequestedWords('')).toEqual([])
    // The word "words" on its own is not a cue.
    expect(parseRequestedWords('a dragon who loves words and, maybe, songs')).toEqual([])
    expect(parseRequestedWords('the words of wisdom - a story about a wise owl')).toEqual([])
  })

  it('keeps "and" / "or" as WORDS when they are list items — both are sight words — and drops them only as joiners', () => {
    expect(parseRequestedWords('sight words: the, and, said, or')).toEqual(['the', 'and', 'said', 'or'])
    expect(parseRequestedWords('sight words: the, and said')).toEqual(['the', 'said'])
    expect(parseRequestedWords('sight words: dog and sun and cat')).toEqual(['dog', 'sun', 'cat'])
  })

  it('is [] when what follows the cue is prose, not a list — a run of words with no commas or joiners', () => {
    expect(parseRequestedWords('use these words: whatever fits the story best!')).toEqual([])
    expect(parseRequestedWords('sight words: our friend pretty')).toEqual([])
    expect(parseRequestedWords('sight words:')).toEqual([])
    expect(parseRequestedWords('sight words: 3 hard ones')).toEqual([])
  })

  it('does not judge vocabulary — any single word a parent lists is sent (what a sight word IS is not decided here)', () => {
    expect(parseRequestedWords('sight words: none. Just a fun story')).toEqual(['none'])
  })
})

describe('resolveStoryWords — typed list wins, practice list is the fallback, else nothing', () => {
  const practice = ['the', 'a', 'he', 'was']

  it('uses the typed list and ignores the practice list entirely when the parent named words', () => {
    expect(resolveStoryWords(SHELLY_IDEA, practice)).toEqual({
      source: StoryWordSource.Requested,
      words: expect.arrayContaining(['our', 'friend', 'know']),
    })
    expect(resolveStoryWords(SHELLY_IDEA, practice).words).not.toContain('the')
  })

  it('falls back to the practice list only when the parent named none', () => {
    expect(resolveStoryWords('London becomes a hero', practice)).toEqual({
      source: StoryWordSource.Practice,
      words: practice,
    })
  })

  it('carries no list, and says so, when neither exists', () => {
    expect(resolveStoryWords('London becomes a hero', [])).toEqual({
      source: StoryWordSource.None,
      words: [],
    })
  })
})

describe('the confirmation lines name their source (FEAT-172)', () => {
  it('the before-the-tap line says "the words you asked for" for a typed list', () => {
    expect(requestedWordsPreviewLine(['our', 'friend'])).toBe(
      "I'll try to work in the words you asked for: our, friend.",
    )
    expect(storyWordsPreviewLine(StoryWordSource.Requested, 'Lincoln', ['our', 'friend'])).toBe(
      "I'll try to work in the words you asked for: our, friend.",
    )
  })

  it("the before-the-tap line still names the child's practice words for that source", () => {
    expect(storyWordsPreviewLine(StoryWordSource.Practice, 'London', ['again'])).toBe(
      "I'll try to weave in some of London's practice words: again.",
    )
  })

  it('renders nothing when there is no list', () => {
    expect(storyWordsPreviewLine(StoryWordSource.None, 'London', [])).toBe('')
    expect(storyWordsPreviewLine(StoryWordSource.Practice, 'London', [])).toBe('')
  })

  it('the draft turn reports a typed list as "the words you asked for", checked against the pages', () => {
    const pages = [{ text: 'Our friend was very brave.' }]
    expect(
      storyDraftMessage('Hero', ['our', 'friend', 'know'], pages, StoryWordSource.Requested),
    ).toBe('Here\'s your story! "Hero" — it uses the words you asked for: our, friend.')
    expect(storyDraftMessage('Hero', ['know'], pages, StoryWordSource.Requested)).toBe(
      'Here\'s your story! "Hero" — I couldn\'t fit the words you asked for in this time.',
    )
  })

  it('the draft turn keeps the FEAT-169 practice wording for the practice source', () => {
    expect(
      storyDraftMessage('Hero', ['our'], [{ text: 'Our hero.' }], StoryWordSource.Practice),
    ).toBe('Here\'s your story! "Hero" — it uses your practice words: our.')
  })
})

// ── Codex P1 on PR #1731: a refinement joined behind the list must not erase it ──

describe('parseRequestedWords keeps a typed list that "Add it" joined a refinement onto', () => {
  it("survives joinIdeas' ' and <refinement>' — the exact shape Codex named", () => {
    // 'include these sight words: our, friend.' + Add 'in space'
    expect(parseRequestedWords('include these sight words: our, friend and in space')).toEqual([
      'our',
      'friend',
    ])
  })

  it('treats any chaining word joinIdeas may use as the boundary, not only "and"', () => {
    expect(parseRequestedWords('sight words: our, friend with a dragon')).toEqual(['our', 'friend'])
    expect(parseRequestedWords('sight words: our, friend then a spaceship lands')).toEqual([
      'our',
      'friend',
    ])
    expect(parseRequestedWords('sight words: our, friend but no cats')).toEqual(['our', 'friend'])
  })

  it('backs off one chain step when the greedy walk crossed into the refinement', () => {
    // 'sight words: cat and dog' + Add 'the boy went'
    expect(parseRequestedWords('sight words: cat and dog and the boy went')).toEqual(['cat', 'dog'])
  })

  it('still reads a plain sentence after the cue as prose, never as a list', () => {
    expect(parseRequestedWords('sight words: whatever fits the story best')).toEqual([])
    expect(parseRequestedWords('sight words: our, friend whatever fits')).toEqual([])
  })

  it('only the LAST item may carry a refinement — a broken chain mid-list is still prose', () => {
    expect(parseRequestedWords('sight words: our and in space, friend')).toEqual([])
  })
})

// ── FEAT-176: the honest line ────────────────────────────────────

describe('storyReadabilityClause (FEAT-176 — say what is above the level)', () => {
  const failing = {
    passed: false,
    levelSource: 'assessed' as const,
    hardWords: [
      { page: 1, word: 'castle' },
      { page: 2, word: 'ready' },
    ],
  }

  it('names the words that may be above the level', () => {
    expect(storyReadabilityClause('London', failing)).toBe(
      "2 words may be above London's level: castle, ready.",
    )
  })

  it('adds the estimate note — and where to fix it — when the level came from age', () => {
    const clause = storyReadabilityClause('London', { ...failing, levelSource: 'age' })
    expect(clause).toContain('(estimated from age')
    expect(clause).toContain("set London's phonics level under Working Levels on the Skill Snapshot")
  })

  it('says nothing when the story passed, when nothing was measured, or when no words were named', () => {
    expect(storyReadabilityClause('London', { ...failing, passed: true })).toBe('')
    expect(storyReadabilityClause('London', undefined)).toBe('')
    expect(storyReadabilityClause('London', { ...failing, hardWords: [] })).toBe('')
  })

  it('de-dupes a word that failed on several pages, and uses the singular', () => {
    expect(
      storyReadabilityClause('London', {
        ...failing,
        hardWords: [
          { page: 1, word: 'castle' },
          { page: 3, word: 'castle' },
        ],
      }),
    ).toBe("1 word may be above London's level: castle.")
  })

  it('stops listing after six words and counts the rest', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ page: 1, word: `w${i}` }))
    const clause = storyReadabilityClause('London', { ...failing, hardWords: many })
    expect(clause).toContain('9 words may be above')
    expect(clause).toContain('w0, w1, w2, w3, w4, w5 and 3 more')
  })

  it('is plain and blameless — it reports on the story, never on the child', () => {
    const clause = storyReadabilityClause('London', failing)
    expect(clause.toLowerCase()).not.toMatch(/can't read|cannot read|too hard for|failed|error/)
    expect(clause).toContain('may be above')
  })
})

describe('storyDraftMessage with a readability report (FEAT-176)', () => {
  const failing = {
    passed: false,
    levelSource: 'assessed' as const,
    hardWords: [{ page: 1, word: 'castle' }],
  }

  it('appends the honest line as its own sentence after a words line', () => {
    expect(
      storyDraftMessage(
        'Cave Cat',
        ['again'],
        [{ text: 'Again the cat dug by the castle.' }],
        StoryWordSource.Practice,
        failing,
        'London',
      ),
    ).toBe(
      'Here\'s your story! "Cave Cat" — it uses your practice words: again.' +
        " 1 word may be above London's level: castle.",
    )
  })

  it('appends it as an em-dash clause when there was no words line', () => {
    expect(
      storyDraftMessage(
        'Cave Cat',
        [],
        [{ text: 'The castle.' }],
        StoryWordSource.None,
        failing,
        'London',
      ),
    ).toBe('Here\'s your story! "Cave Cat" — 1 word may be above London\'s level: castle.')
  })

  it('adds nothing when the story passed', () => {
    expect(
      storyDraftMessage(
        'Cave Cat',
        [],
        [{ text: 'Sam can hop.' }],
        StoryWordSource.None,
        { ...failing, passed: true },
        'London',
      ),
    ).toBe('Here\'s your story! "Cave Cat"')
  })

  it('leaves every pre-FEAT-176 line byte-identical when nothing was measured', () => {
    expect(
      storyDraftMessage('Cave Cat', ['again'], [{ text: 'Again it dug.' }]),
    ).toBe('Here\'s your story! "Cave Cat" — it uses your practice words: again.')
    expect(storyDraftMessage('Cave Cat', [], [{ text: 'x' }])).toBe(
      'Here\'s your story! "Cave Cat"',
    )
    expect(storyDraftMessage('Cave Cat', ['people'], [{ text: 'The cat dug.' }])).toBe(
      'Here\'s your story! "Cave Cat" — I couldn\'t fit your practice words in this time.',
    )
  })
})
