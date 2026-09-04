import { describe, expect, it } from 'vitest'

import { generateHint } from '../artHelpContent'
import { describePageContents } from '../deletePageSummary'
import {
  classifyClarificationReply,
  DECLINED_START_NUDGE,
} from '../useBookGenerateChat'
import {
  PAGE_REVISE_SURFACE,
  STORY_CHAT_SURFACE,
  STORY_REVISE_SURFACE,
  StoryGenerationFailure,
  storyGenerationFailureMessage,
} from '../storyGenerationFailure'
import {
  practiceWordsUsedIn,
  storyDraftMessage,
  storyDraftSpokenMessage,
  storyReadabilityClause,
  StoryWordSource,
  type StoryReadabilityNote,
} from '../storyPracticeWords'

// ── UX-109 — the honest line is for the eye, never the ear ───────

const FAILING: StoryReadabilityNote = {
  passed: false,
  levelSource: 'age',
  hardWords: [
    { page: 1, word: 'castle' },
    { page: 2, word: 'dragon' },
    { page: 3, word: 'kingdom' },
  ],
  hardWordCount: 3,
}

const PAGES = [{ text: 'The cat sat.' }, { text: 'A big castle.' }]

describe('UX-109 — the readability clause never reaches the speaker', () => {
  it('keeps the clause on the rendered line', () => {
    const shown = storyDraftMessage(
      'The Brave Knight',
      [],
      PAGES,
      StoryWordSource.None,
      FAILING,
      'London',
    )
    expect(shown).toContain("may be above London's level")
    expect(shown).toContain('castle')
  })

  it('speaks the story line and NOT one word of the clause', () => {
    const spoken = storyDraftSpokenMessage(
      'The Brave Knight',
      [],
      PAGES,
      StoryWordSource.None,
      'London',
    )
    expect(spoken).toBe('Here\'s your story! "The Brave Knight"')
    // The clause's own words, checked one by one — a partial strip would pass
    // a "does not equal the whole clause" assertion and still say "above
    // London's level" out loud.
    for (const fragment of ['above', 'level', 'castle', 'dragon', 'kingdom', 'estimated']) {
      expect(spoken.toLowerCase()).not.toContain(fragment)
    }
  })

  it('is the same line the screen shows, minus the clause — not a second copy', () => {
    const words = ['the', 'and']
    const pages = [{ text: 'The cat and the dog.' }]
    const spoken = storyDraftSpokenMessage('Pets', words, pages, StoryWordSource.Practice, 'London')
    const shown = storyDraftMessage(
      'Pets',
      words,
      pages,
      StoryWordSource.Practice,
      FAILING,
      'London',
    )
    expect(shown.startsWith(spoken)).toBe(true)
    expect(shown.slice(spoken.length).trim()).toBe(
      storyReadabilityClause('London', FAILING),
    )
  })

  it('leaves a passing story identical either way', () => {
    const passing: StoryReadabilityNote = {
      passed: true,
      levelSource: 'assessed',
      hardWords: [],
      hardWordCount: 0,
    }
    expect(storyDraftMessage('Cats', [], PAGES, StoryWordSource.None, passing, 'London')).toBe(
      storyDraftSpokenMessage('Cats', [], PAGES, StoryWordSource.None, 'London'),
    )
  })
})

// ── UX-112 — one honest set of failure messages, four surfaces ───

describe('UX-112 — every generateStory sibling names its failure', () => {
  it('leaves the Generate chat wording byte-identical (FEAT-169)', () => {
    expect(storyGenerationFailureMessage(StoryGenerationFailure.CutShort)).toBe(
      'The story came back too long to finish — it ran out of room before the last page. Nothing was lost: your idea is still here. Try a Short book, then tap "Yes, start my story!" again.',
    )
    expect(storyGenerationFailureMessage(StoryGenerationFailure.NoReply, STORY_CHAT_SURFACE)).toContain(
      '"Yes, start my story!"',
    )
  })

  it('names each surface\'s own button and its own "nothing was lost"', () => {
    const revise = storyGenerationFailureMessage(
      StoryGenerationFailure.Unreadable,
      STORY_REVISE_SURFACE,
    )
    expect(revise).toContain('your story is unchanged')
    expect(revise).toContain('"Send"')

    // The Story Guide's surface was the fourth here until FEAT-187 retired the
    // wizard; it went with its only caller.

    const page = storyGenerationFailureMessage(
      StoryGenerationFailure.NoReply,
      PAGE_REVISE_SURFACE,
    )
    expect(page).toContain('The new page')
    expect(page).toContain('your page is unchanged')
    expect(page).toContain('"Try again"')
  })

  it('never leaves the vague pre-FEAT-169 strings on any surface', () => {
    for (const surface of [
      STORY_CHAT_SURFACE,
      STORY_REVISE_SURFACE,
      PAGE_REVISE_SURFACE,
    ]) {
      for (const kind of Object.values(StoryGenerationFailure)) {
        const msg = storyGenerationFailureMessage(kind, surface)
        expect(msg).not.toMatch(/I had trouble/i)
        expect(msg).not.toMatch(/^Failed to/i)
        // The house shape: what failed, that nothing was lost, what to do.
        expect(msg).toContain('Nothing was lost')
        expect(msg).toMatch(/tap "/i)
      }
    }
  })
})

// ── UX-110 — answering the question is an answer, not an idea ────

describe('UX-110 — a bare yes is the Yes tap', () => {
  it('reads bare affirmatives as the tap', () => {
    for (const text of ['yes', 'Yes!', 'yeah', ' ok ', 'OK.', 'sure', 'yep', 'go', 'start']) {
      expect(classifyClarificationReply(text), text).toBe('affirmative')
    }
  })

  it('reads bare negatives as a decline', () => {
    for (const text of ['no', 'No.', 'nope', 'nah', 'not yet', 'wait']) {
      expect(classifyClarificationReply(text), text).toBe('negative')
    }
  })

  it('leaves anything with more than the word alone — it is a real refinement', () => {
    for (const text of [
      'yes, and a dragon',
      'yes please make it about a cave',
      'no dragons in this one',
      'a dragon who finds a cave',
      'start with a big storm',
    ]) {
      expect(classifyClarificationReply(text), text).toBe('idea')
    }
  })

  it('nudges without changing the idea when the answer was no', () => {
    expect(DECLINED_START_NUDGE).toContain('Yes, start my story!')
    expect(DECLINED_START_NUDGE).not.toMatch(/ADD|CHANGE/)
  })
})

// ── UX-130 — the confirm names what goes ────────────────────────

describe('UX-130 — the delete-page confirm says what is on the page', () => {
  it('counts pictures and words', () => {
    expect(
      describePageContents({
        text: 'The dragon flew over the tall green hills at dawn.',
        images: [{ id: 'a' }, { id: 'b' }] as never,
      }),
    ).toBe('It has 2 pictures and 10 words.')
  })

  it('uses singulars where they belong', () => {
    expect(describePageContents({ text: 'Run!', images: [{ id: 'a' }] as never })).toBe(
      'It has 1 picture and 1 word.',
    )
  })

  it('says empty rather than "0 pictures and 0 words"', () => {
    expect(describePageContents({ text: '   ', images: [] })).toBe('This page is empty.')
    expect(describePageContents(null)).toBe('This page is empty.')
    expect(describePageContents(undefined)).toBe('This page is empty.')
  })

  it('does not count bare punctuation as a word', () => {
    expect(describePageContents({ text: 'Hi — !', images: [] })).toBe('It has 1 word.')
  })
})

// ── UX-134 — whole words, not substrings ────────────────────────

describe('UX-134 — the vocabulary page matches whole words', () => {
  const pages = [{ text: 'The cat went into the barn.' }]

  it('does not take "in" from "into" or "at" from "cat"', () => {
    expect(practiceWordsUsedIn(pages, ['in', 'at'])).toEqual([])
  })

  it('still takes a word that is really there', () => {
    expect(practiceWordsUsedIn(pages, ['the', 'cat', 'barn'])).toEqual(['the', 'cat', 'barn'])
  })

  it('does not put "a" on every page that has any letter a', () => {
    expect(practiceWordsUsedIn([{ text: 'The barn was warm.' }], ['a'])).toEqual([])
    expect(practiceWordsUsedIn([{ text: 'A barn was warm.' }], ['a'])).toEqual(['a'])
  })
})

// ── UX-147 — the conditional door promises no number ────────────

describe('UX-147 — the review chat door is honest about "if"', () => {
  it('never claims a picture will be made', () => {
    for (const audience of ['kid', 'parent'] as const) {
      const hint = generateHint('revisePagePicture', audience)
      expect(hint).toMatch(/may|if/i)
    }
  })

  it('ignores count entirely — no count is knowable in advance', () => {
    const kid = generateHint('revisePagePicture', 'kid')
    expect(generateHint('revisePagePicture', 'kid', 0)).toBe(kid)
    expect(generateHint('revisePagePicture', 'kid', 14)).toBe(kid)
    const parent = generateHint('revisePagePicture', 'parent')
    expect(generateHint('revisePagePicture', 'parent', 0)).toBe(parent)
    expect(generateHint('revisePagePicture', 'parent', 14)).toBe(parent)
  })

  it('leaves every counting door counting', () => {
    expect(generateHint('illustrateBook', 'parent', 14)).toContain('14 paid image calls')
    expect(generateHint('illustrateBook', 'kid', 14)).toBe('Makes 14 pictures. Uses 14 art.')
  })
})
