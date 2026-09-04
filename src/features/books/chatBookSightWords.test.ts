import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// FEAT-188 / UX-123 — a chat book is a practice book when a list was in play.
//
// What this asserts that `main` could not: `useBookGenerateChat` never wrote
// `book.sightWords` at all (FEAT-169 left the field unset deliberately,
// pending this decision), so a parent who asked for Lincoln's words through
// the chat got a plain reader while the same ask through "Make a sight word
// book" got the practice one — chips, the "Words to Watch For" page, the
// per-word `sightWordProgress` tap-tracking, the print dialog's highlighting.
// Every "sets" assertion below fails on `main`.
//
// The rule the owner settled (2026-09-04): set it from the words that
// ACTUALLY LANDED on the pages, never the requested list and never the model's
// claim — the same `practiceWordsUsedIn` check the draft turn already reports
// from. A story that missed every word is not a practice book for words it
// does not contain.

// ── Hoisted mocks ───────────────────────────────────────────────

const { chatMock, generateImageMock, sightWordState, illustrateMock } = vi.hoisted(() => ({
  chatMock: vi.fn(),
  generateImageMock: vi.fn(),
  sightWordState: { progressMap: new Map<string, unknown>(), loading: false },
  illustrateMock: vi.fn(async () => undefined),
}))

vi.mock('../../core/ai/useAI', () => ({
  useAI: () => ({
    chat: chatMock,
    generateImage: generateImageMock,
    loading: false,
    error: null,
  }),
  TaskType: { Chat: 'chat' },
}))

vi.mock('../../core/firebase/firestore', () => ({
  booksCollection: () => ({ __collection: 'books' }),
}))

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(async () => ({ id: 'book-new' })),
  doc: vi.fn(() => ({ __ref: true })),
  getDoc: vi.fn(async () => ({ exists: () => false })),
  setDoc: vi.fn(async () => undefined),
}))

vi.mock('./bookThemeInference', () => ({ inferBookTheme: () => 'fantasy' }))
vi.mock('./bookTypes', () => ({
  generatePageId: () => 'page-id',
  generateImageId: () => 'image-id',
}))

vi.mock('./useSightWordProgress', () => ({
  useSightWordProgress: () => ({
    progressMap: sightWordState.progressMap,
    allProgress: [...sightWordState.progressMap.values()],
    loading: sightWordState.loading,
    recordInteraction: vi.fn(),
    confirmMastery: vi.fn(),
    getWeakWords: () => [],
  }),
}))

// The illustration loop is not what this suite is about, and its own writes
// would crowd the one write we are inspecting.
vi.mock('./useBookIllustrator', () => ({
  useBookIllustrator: () => ({ illustrate: illustrateMock }),
}))

// ── Subject under test ──────────────────────────────────────────

import { useBookGenerateChat } from './useBookGenerateChat'

const baseOpts = {
  familyId: 'family-1',
  childId: 'child-1',
  childName: 'Lincoln',
  childAge: 10,
  initialPageCount: 6,
  defaultIllustrationStyle: 'storybook',
}

function wordDoc(word: string) {
  return {
    word,
    masteryLevel: 'practicing' as const,
    helpRequested: 0,
    encounters: 0,
    selfReportedKnown: 0,
    shellyConfirmed: false,
    firstSeen: '2026-01-01T00:00:00.000Z',
    lastSeen: '2026-01-01T00:00:00.000Z',
    lastLevelChange: '2026-01-01T00:00:00.000Z',
  }
}

/**
 * Drive the chat from an idea to a published book and return the payload of
 * the publish write. `commitAndClose` re-persists through the existing doc, so
 * the publish is a `setDoc` — the same single write the book already made,
 * never a second one.
 */
async function publish(idea: string, pageTexts: string[]) {
  const firestore = await import('firebase/firestore')
  const addDoc = firestore.addDoc as ReturnType<typeof vi.fn>
  const setDoc = firestore.setDoc as ReturnType<typeof vi.fn>
  const getDoc = firestore.getDoc as ReturnType<typeof vi.fn>

  const fakeStory = {
    title: 'The Story',
    pages: pageTexts.map((text, i) => ({
      pageNumber: i + 1,
      text,
      sceneDescription: '',
      // The model's own claim about the words it used. Deliberately a lie the
      // rule must not repeat.
      wordsOnPage: ['xylophone', 'aardvark'],
    })),
  }
  chatMock.mockResolvedValueOnce({ message: JSON.stringify(fakeStory) })
  getDoc.mockImplementation(async () => ({
    exists: () => true,
    data: () => ({ pages: fakeStory.pages.map(() => ({ images: [], layout: 'text-only' })) }),
  }))

  const { result } = renderHook(() => useBookGenerateChat(baseOpts))
  await act(async () => {
    await result.current.sendKidMessage(idea)
  })
  await act(async () => {
    await result.current.confirmStartStory()
  })

  const draftWrites = [
    ...addDoc.mock.calls.map((c) => c[1] as Record<string, unknown>),
    ...setDoc.mock.calls.map((c) => c[1] as Record<string, unknown>),
  ]
  setDoc.mockClear()

  await act(async () => {
    await result.current.commitAndClose()
  })

  const published = setDoc.mock.calls[0]?.[1] as Record<string, unknown> | undefined
  return { published, draftWrites }
}

beforeEach(() => {
  chatMock.mockReset()
  generateImageMock.mockReset()
  illustrateMock.mockClear()
  sightWordState.progressMap = new Map()
  sightWordState.loading = false
})

describe('a list the parent typed', () => {
  it('sets book.sightWords to the words that LANDED on the pages', async () => {
    const { published } = await publish(
      'a puppy story with these sight words: our, friend, pretty',
      ['Our dog is here.', 'He is a friend.'],
    )

    // "pretty" never made it onto a page, so the book does not claim it — and
    // neither of the model's invented `wordsOnPage` claims survives.
    expect(published?.sightWords).toEqual(['our', 'friend'])
  })

  it('leaves it UNSET when the story missed every word — that is not a practice book', async () => {
    const { published } = await publish(
      'a puppy story with these sight words: our, friend, pretty',
      ['The dog ran fast.', 'Then it slept.'],
    )

    expect(published).toBeTruthy()
    expect('sightWords' in (published ?? {})).toBe(false)
  })
})

describe('the practice-list fallback', () => {
  it('sets it from the landed words when the child has words and the parent typed none', async () => {
    sightWordState.progressMap = new Map(
      [wordDoc('said'), wordDoc('come'), wordDoc('there')].map((d) => [d.word, d]),
    )

    const { published } = await publish('a puppy who finds a rainbow', [
      'She said hello.',
      'Come and see.',
    ])

    // In the practice list's own deterministic order (`selectStoryPracticeWords`),
    // filtered to the two that landed — "there" is on no page.
    expect(published?.sightWords).toEqual(['come', 'said'])
  })
})

describe('no list in play', () => {
  it('leaves book.sightWords unset — a plain story stays a plain book', async () => {
    const { published } = await publish('a puppy who finds a rainbow', [
      'Our dog is here.',
      'He is a friend.',
    ])

    expect(published).toBeTruthy()
    expect('sightWords' in (published ?? {})).toBe(false)
  })
})

describe('only at publish', () => {
  it('a half-made draft carries no sightWords — it is not a practice book yet', async () => {
    const { draftWrites } = await publish(
      'a puppy story with these sight words: our, friend',
      ['Our dog is a friend.'],
    )

    expect(draftWrites.length).toBeGreaterThan(0)
    for (const write of draftWrites) {
      expect('sightWords' in write).toBe(false)
    }
  })
})

// Codex P1 on PR #1755. `storyToPages` copies the model's own `wordsOnPage`
// claim into `page.sightWordsOnPage` verbatim, and `book.sightWords` is exactly
// what turns on `BookReaderPage`'s effect that calls
// `recordInteraction(word, 'seen')` for every entry in it. So enabling practice
// mode over an unchecked page list would write `sightWordProgress` records for
// words the model invented — a write into the child's own record from a claim
// nothing verified.
describe('turning practice mode on verifies the PAGES too', () => {
  it('rewrites each page to the landed words that page actually holds', async () => {
    const { published } = await publish(
      'a story with these sight words: our, friend, pretty',
      ['Our dog is here.', 'He is a friend.'],
    )

    const pages = published?.pages as Array<{ sightWordsOnPage?: string[] }>
    expect(pages.map((p) => p.sightWordsOnPage)).toEqual([['our'], ['friend']])
    // The model's invented claims reach no page, so the reader records none.
    for (const page of pages) {
      expect(page.sightWordsOnPage).not.toContain('xylophone')
      expect(page.sightWordsOnPage).not.toContain('aardvark')
    }
  })

  it('leaves the pages alone when the book is NOT a practice book', async () => {
    // The field is inert without `sightWords` (`isSightWordBook` gates every
    // reader of it), so rewriting it would widen the change past the defect.
    const { published } = await publish('a puppy who finds a rainbow', [
      'Our dog is here.',
    ])

    expect('sightWords' in (published ?? {})).toBe(false)
    const pages = published?.pages as Array<{ sightWordsOnPage?: string[] }>
    expect(pages[0].sightWordsOnPage).toEqual(['xylophone', 'aardvark'])
  })
})

// Codex P2 on PR #1755. The practice fallback is a live `sightWordProgress`
// read: it starts empty while it loads, and a word mastered since the draft was
// started drops out of `practicing`/`new` altogether. `commitAndClose` does not
// wait on that read the way `confirmStartStory` does — so a resumed draft must
// publish against the list it recorded, not against today's.
describe('a resumed draft publishes against the list it was generated with', () => {
  it('uses the saved generationConfig.words, not the live practice map', async () => {
    const firestore = await import('firebase/firestore')
    const setDoc = firestore.setDoc as ReturnType<typeof vi.fn>
    const getDoc = firestore.getDoc as ReturnType<typeof vi.fn>

    // The live map has moved on since the draft was started: "said" and "come"
    // are mastered and gone, and an unrelated word is now practising.
    sightWordState.progressMap = new Map([[ 'zebra', wordDoc('zebra') ]])

    const storedPages = [
      { text: 'She said hello.', images: [], layout: 'text-only', sightWordsOnPage: [] },
      { text: 'Come and see.', images: [], layout: 'text-only', sightWordsOnPage: [] },
    ]
    getDoc.mockImplementation(async () => ({
      exists: () => true,
      data: () => ({
        title: 'The Story',
        pages: storedPages,
        generationConfig: { words: ['said', 'come', 'there'], pageCount: 6 },
        reviewState: {
          generateChatState: 'in-progress',
          clarificationPhase: 'ready',
          pendingIdea: 'a puppy who finds a rainbow',
          chatHistory: [],
        },
      }),
    }))

    const { result } = renderHook(() =>
      useBookGenerateChat({ ...baseOpts, resumeBookId: 'book-1' }),
    )
    await waitFor(() => expect(result.current.currentStory).not.toBeNull())

    setDoc.mockClear()
    await act(async () => {
      await result.current.commitAndClose()
    })

    const published = setDoc.mock.calls[0]?.[1] as Record<string, unknown>
    // The words the story was actually written around, filtered to the two the
    // pages hold — not `[]` (the live map has neither) and not "zebra".
    expect(published?.sightWords).toEqual(['said', 'come'])
    expect(published?.generationConfig).toMatchObject({
      words: ['said', 'come', 'there'],
    })
  })
})

describe('the persisted shape matches what "Make a sight word book" writes', () => {
  it('is a de-duplicated string array that flips the reader into practice mode', async () => {
    const { published } = await publish(
      'a story with these sight words: our, friend, our',
      ['Our friend is our dog. Our dog!'],
    )

    const written = published?.sightWords as string[]
    expect(Array.isArray(written)).toBe(true)
    expect(written.every((w) => typeof w === 'string')).toBe(true)
    expect(new Set(written).size).toBe(written.length)
    // `BookReaderPage`'s own predicate, byte for byte.
    expect((written?.length ?? 0) > 0).toBe(true)
  })
})
