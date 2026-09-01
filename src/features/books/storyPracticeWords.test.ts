import { describe, expect, it } from 'vitest'

import type { SightWordProgress } from '../../core/types'
import {
  MAX_STORY_PRACTICE_WORDS,
  practiceWordsPreviewLine,
  practiceWordsUsedIn,
  selectStoryPracticeWords,
  storyDraftMessage,
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
