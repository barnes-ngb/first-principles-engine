import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────

const { chatMock, generateImageMock, sightWordState } = vi.hoisted(() => ({
  chatMock: vi.fn(),
  generateImageMock: vi.fn(),
  // The child's sight-word list the hook reads (FEAT-169). Default: nothing to
  // practise, so every pre-existing test runs exactly as before (`words: []`).
  sightWordState: { progressMap: new Map<string, unknown>(), loading: false },
}))

vi.mock('../../core/ai/useAI', () => ({
  useAI: () => ({
    imageFailureRef: { current: null },
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

vi.mock('./bookThemeInference', () => ({
  inferBookTheme: () => 'fantasy',
}))

vi.mock('./bookTypes', () => ({
  generatePageId: () => 'page-id',
  generateImageId: () => 'image-id',
}))

// Read-only: the hook only ever reads `progressMap` (FEAT-169).
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

// The daily art budget the illustrator now asks for itself (FEAT-168).
// `Infinity` = uncapped, so this hook's existing behaviour is unchanged.
vi.mock('./useBookArtQuota', () => ({
  useBookArtQuota: () => ({
    count: 0,
    limit: 25,
    remaining: Infinity,
    atLimit: false,
    recordGeneration: vi.fn(async () => undefined),
  }),
  recordBookArtGeneration: () => undefined,
}))

// ── Subject under test ──────────────────────────────────────────

import { joinIdeas, useBookGenerateChat } from './useBookGenerateChat'

const baseOpts = {
  familyId: 'family-1',
  childId: 'child-1',
  childName: 'London',
  childAge: 6,
  initialPageCount: 6,
  defaultIllustrationStyle: 'storybook',
}

beforeEach(() => {
  chatMock.mockReset()
  generateImageMock.mockReset()
  sightWordState.progressMap = new Map()
  sightWordState.loading = false
})

/** A `sightWordProgress` doc for the mocked child list. */
function wordDoc(word: string, masteryLevel: 'new' | 'practicing' | 'familiar' | 'mastered', helpRequested = 0) {
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

function setChildWords(...docs: ReturnType<typeof wordDoc>[]) {
  sightWordState.progressMap = new Map(docs.map((d) => [d.word, d]))
}

describe('joinIdeas', () => {
  it('inserts "and" when refinement does not start with a chaining word', () => {
    expect(joinIdeas('a puppy who finds a rainbow', 'a dragon')).toBe(
      'a puppy who finds a rainbow and a dragon',
    )
  })

  it('strips trailing punctuation from the first idea', () => {
    expect(joinIdeas('a puppy.', 'a dragon')).toBe('a puppy and a dragon')
    expect(joinIdeas('a puppy!', 'a dragon')).toBe('a puppy and a dragon')
  })

  it('does not double-up when refinement already starts with a chaining word', () => {
    expect(joinIdeas('a puppy', 'and a dragon')).toBe('a puppy and a dragon')
    expect(joinIdeas('a puppy', 'with a dragon')).toBe('a puppy with a dragon')
    expect(joinIdeas('a puppy', 'or a kitten')).toBe('a puppy or a kitten')
  })

  it('collapses multiple spaces', () => {
    expect(joinIdeas('a puppy  ', '  a dragon')).toBe('a puppy and a dragon')
  })

  it('handles empty parts gracefully', () => {
    expect(joinIdeas('', 'a dragon')).toBe('a dragon')
    expect(joinIdeas('a puppy', '')).toBe('a puppy')
  })
})

describe('useBookGenerateChat clarification state machine', () => {
  it('first kid message creates an echo turn and does NOT call generateStory', async () => {
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a puppy who finds a rainbow')
    })

    expect(chatMock).not.toHaveBeenCalled()
    expect(result.current.chatHistory.length).toBe(2)
    expect(result.current.chatHistory[0]).toMatchObject({
      role: 'kid',
      content: 'a puppy who finds a rainbow',
    })
    expect(result.current.chatHistory[1]).toMatchObject({
      role: 'ai',
      kind: 'echo',
    })
    expect(result.current.chatHistory[1].content).toMatch(/here's what i heard/i)
    expect(result.current.pendingIdea).toBe('a puppy who finds a rainbow')
    expect(result.current.pendingRefinement).toBeNull()
    expect(result.current.canStartStory).toBe(true)
    expect(result.current.clarificationPhase).toBe('clarifying')
    expect(result.current.currentStory).toBeNull()
  })

  it('confirmStartStory triggers generateStory and transitions to ready', async () => {
    const fakeStory = {
      title: 'Rainbow Puppy',
      pages: [
        { pageNumber: 1, text: 'Page 1.', sceneDescription: 'a field' },
        { pageNumber: 2, text: 'Page 2.', sceneDescription: 'a tree' },
      ],
    }
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(fakeStory) })

    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a puppy who finds a rainbow')
    })

    await act(async () => {
      await result.current.confirmStartStory()
    })

    expect(chatMock).toHaveBeenCalledTimes(1)
    expect(chatMock.mock.calls[0][0].taskType).toBe('generateStory')
    expect(result.current.clarificationPhase).toBe('ready')
    expect(result.current.currentStory).toEqual(fakeStory)
    const lastAi = result.current.chatHistory[result.current.chatHistory.length - 1]
    expect(lastAi).toMatchObject({ role: 'ai', kind: 'story-draft' })
  })

  it('second kid message during clarification creates an add-or-change turn and disables canStartStory', async () => {
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a puppy who finds a rainbow')
    })
    await act(async () => {
      await result.current.sendKidMessage('and a dragon')
    })

    expect(chatMock).not.toHaveBeenCalled()
    const lastAi = result.current.chatHistory[result.current.chatHistory.length - 1]
    expect(lastAi).toMatchObject({ role: 'ai', kind: 'add-or-change' })
    expect(result.current.pendingRefinement).toBe('and a dragon')
    expect(result.current.canStartStory).toBe(false)
  })

  it('confirmAddRefinement joins ideas and creates a new echo turn', async () => {
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a puppy who finds a rainbow')
    })
    await act(async () => {
      await result.current.sendKidMessage('a dragon')
    })
    await act(async () => {
      await result.current.confirmAddRefinement()
    })

    expect(result.current.pendingIdea).toBe(
      'a puppy who finds a rainbow and a dragon',
    )
    expect(result.current.pendingRefinement).toBeNull()
    expect(result.current.canStartStory).toBe(true)
    const lastAi = result.current.chatHistory[result.current.chatHistory.length - 1]
    expect(lastAi).toMatchObject({ role: 'ai', kind: 'echo' })
    expect(lastAi.content).toMatch(/a puppy who finds a rainbow and a dragon/)
  })

  it('confirmChangeRefinement replaces pendingIdea and creates a new echo turn', async () => {
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a puppy who finds a rainbow')
    })
    await act(async () => {
      await result.current.sendKidMessage('a robot in space')
    })
    await act(async () => {
      await result.current.confirmChangeRefinement()
    })

    expect(result.current.pendingIdea).toBe('a robot in space')
    expect(result.current.pendingRefinement).toBeNull()
    const lastAi = result.current.chatHistory[result.current.chatHistory.length - 1]
    expect(lastAi).toMatchObject({ role: 'ai', kind: 'echo' })
    expect(lastAi.content).toMatch(/a robot in space/)
  })

  it('confirmStartStory is a no-op when a refinement is pending', async () => {
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a puppy')
    })
    await act(async () => {
      await result.current.sendKidMessage('and a dragon')
    })
    await act(async () => {
      await result.current.confirmStartStory()
    })

    expect(chatMock).not.toHaveBeenCalled()
    expect(result.current.clarificationPhase).toBe('clarifying')
  })

  it('overwrites the pending refinement when a third clarification message arrives', async () => {
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a puppy')
    })
    await act(async () => {
      await result.current.sendKidMessage('and a dragon')
    })
    await act(async () => {
      await result.current.sendKidMessage('and a spaceship')
    })

    expect(result.current.pendingRefinement).toBe('and a spaceship')
    const lastAi = result.current.chatHistory[result.current.chatHistory.length - 1]
    expect(lastAi).toMatchObject({ role: 'ai', kind: 'add-or-change' })
    expect(lastAi.content).toMatch(/got it/i)
  })

  it('after ready phase, sendKidMessage routes to reviseStory', async () => {
    const fakeStory = {
      title: 'Rainbow Puppy',
      pages: [{ pageNumber: 1, text: 'Page 1.', sceneDescription: 'a field' }],
    }
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(fakeStory) })

    const reviseResult = {
      humanResponse: 'Okay, I made the dragon Sparkle.',
      storyUpdated: true,
      updatedStory: {
        title: 'Rainbow Puppy',
        pages: [
          { pageNumber: 1, text: 'Page 1 updated.', sceneDescription: 'a field' },
        ],
      },
      pagesNeedingImageRegen: [1],
    }
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(reviseResult) })

    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a puppy')
    })
    await act(async () => {
      await result.current.confirmStartStory()
    })
    await act(async () => {
      await result.current.sendKidMessage('make the dragon a girl')
    })

    expect(chatMock).toHaveBeenCalledTimes(2)
    expect(chatMock.mock.calls[1][0].taskType).toBe('reviseStory')
    const lastAi = result.current.chatHistory[result.current.chatHistory.length - 1]
    expect(lastAi).toMatchObject({ role: 'ai', kind: 'revision' })
    expect(result.current.currentStory?.pages[0].text).toBe('Page 1 updated.')
  })

  it('abandonDraft clears state during clarification (before any story-draft)', async () => {
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a puppy')
    })
    await act(async () => {
      await result.current.abandonDraft()
    })

    expect(result.current.chatHistory.length).toBe(0)
    expect(result.current.pendingIdea).toBe('')
    expect(result.current.pendingRefinement).toBeNull()
  })

  it('commitAndClose generates an illustration for each page with a sceneDescription', async () => {
    const firestore = await import('firebase/firestore')
    const addDoc = firestore.addDoc as ReturnType<typeof vi.fn>
    const setDoc = firestore.setDoc as ReturnType<typeof vi.fn>
    const getDoc = firestore.getDoc as ReturnType<typeof vi.fn>
    addDoc.mockResolvedValue({ id: 'book-new' })
    setDoc.mockResolvedValue(undefined)

    const fakeStory = {
      title: 'Rainbow Puppy',
      pages: [
        { pageNumber: 1, text: 'Page 1.', sceneDescription: 'a field' },
        { pageNumber: 2, text: 'Page 2.', sceneDescription: 'a tree' },
        // Empty sceneDescription — must NOT call generateImage.
        { pageNumber: 3, text: 'Page 3.', sceneDescription: '' },
      ],
    }
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(fakeStory) })
    generateImageMock
      .mockResolvedValueOnce({ url: 'url-1', storagePath: 'path-1' })
      .mockResolvedValueOnce({ url: 'url-2', storagePath: 'path-2' })

    // After persistStory's setDoc, subsequent getDoc reads return a doc with
    // story pages so the in-loop read+merge can run.
    const bookDocState: { pages: Array<{ images: unknown[]; layout: string }>; coverImageUrl?: string } = {
      pages: fakeStory.pages.map(() => ({ images: [], layout: 'text-only' })),
    }
    getDoc.mockImplementation(async () => ({
      exists: () => true,
      data: () => ({ ...bookDocState, pages: [...bookDocState.pages] }),
    }))

    const { result } = renderHook(() =>
      useBookGenerateChat({ ...baseOpts, defaultIllustrationStyle: 'storybook' }),
    )

    await act(async () => {
      await result.current.sendKidMessage('a puppy who finds a rainbow')
    })
    await act(async () => {
      await result.current.confirmStartStory()
    })

    let returned: string | null = null
    await act(async () => {
      returned = await result.current.commitAndClose()
    })

    expect(returned).toBe('book-new')
    // 2 pages with sceneDescription → 2 calls.
    expect(generateImageMock).toHaveBeenCalledTimes(2)
    expect(generateImageMock.mock.calls[0][0]).toMatchObject({
      familyId: 'family-1',
      prompt: 'a field',
      style: 'book-illustration-storybook',
      size: '1024x1024',
    })
    expect(generateImageMock.mock.calls[1][0]).toMatchObject({
      prompt: 'a tree',
      style: 'book-illustration-storybook',
    })

    // illustrationProgress lands in 'done'.
    expect(result.current.illustrationProgress.phase).toBe('done')

    // Final setDoc for page 1 must include coverImageUrl from page 0's image.
    const coverWrite = setDoc.mock.calls.find(
      (call) => (call[1] as { coverImageUrl?: string }).coverImageUrl === 'url-1',
    )
    expect(coverWrite).toBeTruthy()
  })

  it('commitAndClose passes the RAW illustrationStyle key to generateImage (illustrator handles prefix)', async () => {
    const firestore = await import('firebase/firestore')
    const addDoc = firestore.addDoc as ReturnType<typeof vi.fn>
    const setDoc = firestore.setDoc as ReturnType<typeof vi.fn>
    const getDoc = firestore.getDoc as ReturnType<typeof vi.fn>
    addDoc.mockResolvedValue({ id: 'book-new' })
    setDoc.mockResolvedValue(undefined)
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ pages: [{ images: [], layout: 'text-only' }] }),
    })

    const fakeStory = {
      title: 'One Page',
      pages: [{ pageNumber: 1, text: 'p', sceneDescription: 'a field' }],
    }
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(fakeStory) })
    generateImageMock.mockResolvedValue({ url: 'u', storagePath: 's' })

    const { result } = renderHook(() =>
      useBookGenerateChat({ ...baseOpts, defaultIllustrationStyle: 'minecraft' }),
    )

    await act(async () => {
      await result.current.sendKidMessage('a puppy')
    })
    await act(async () => {
      await result.current.confirmStartStory()
    })
    await act(async () => {
      await result.current.commitAndClose()
    })

    // Contract: hook stores raw style ('minecraft'); illustrator constructs
    // the 'book-illustration-minecraft' prefix before calling generateImage.
    expect(result.current.illustrationStyle).toBe('minecraft')
    expect(generateImageMock).toHaveBeenCalled()
    expect(generateImageMock.mock.calls[0][0]).toMatchObject({
      style: 'book-illustration-minecraft',
    })
  })

  it('commitAndClose continues when one page fails to illustrate', async () => {
    const firestore = await import('firebase/firestore')
    const addDoc = firestore.addDoc as ReturnType<typeof vi.fn>
    const setDoc = firestore.setDoc as ReturnType<typeof vi.fn>
    const getDoc = firestore.getDoc as ReturnType<typeof vi.fn>
    addDoc.mockResolvedValue({ id: 'book-new' })
    setDoc.mockResolvedValue(undefined)
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ pages: [{ images: [], layout: 'text-only' }, { images: [], layout: 'text-only' }] }),
    })

    const fakeStory = {
      title: 'Two-Page Story',
      pages: [
        { pageNumber: 1, text: 'Page 1.', sceneDescription: 'a field' },
        { pageNumber: 2, text: 'Page 2.', sceneDescription: 'a tree' },
      ],
    }
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(fakeStory) })
    // First page rejects, second succeeds.
    generateImageMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ url: 'url-2', storagePath: 'path-2' })

    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a puppy')
    })
    await act(async () => {
      await result.current.confirmStartStory()
    })
    await act(async () => {
      await result.current.commitAndClose()
    })

    expect(generateImageMock).toHaveBeenCalledTimes(2)
    expect(result.current.illustrationProgress.phase).toBe('done')
  })

  it('commitAndClose transitions illustrationProgress idle → illustrating → done', async () => {
    const firestore = await import('firebase/firestore')
    const addDoc = firestore.addDoc as ReturnType<typeof vi.fn>
    const setDoc = firestore.setDoc as ReturnType<typeof vi.fn>
    const getDoc = firestore.getDoc as ReturnType<typeof vi.fn>
    addDoc.mockResolvedValue({ id: 'book-new' })
    setDoc.mockResolvedValue(undefined)
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ pages: [{ images: [], layout: 'text-only' }] }),
    })

    const fakeStory = {
      title: 'One Page',
      pages: [{ pageNumber: 1, text: 'p', sceneDescription: 'a field' }],
    }
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(fakeStory) })

    const phases: string[] = []
    generateImageMock.mockImplementation(async () => {
      phases.push('inside-generate')
      return { url: 'u', storagePath: 's' }
    })

    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    // Idle before any commit.
    expect(result.current.illustrationProgress.phase).toBe('idle')

    await act(async () => {
      await result.current.sendKidMessage('a puppy')
    })
    await act(async () => {
      await result.current.confirmStartStory()
    })
    await act(async () => {
      await result.current.commitAndClose()
    })

    expect(phases).toContain('inside-generate')
    expect(result.current.illustrationProgress.phase).toBe('done')
  })

  it('resume hydrates clarification phase + pendingIdea + pendingRefinement', async () => {
    const firestore = await import('firebase/firestore')
    const getDoc = firestore.getDoc as ReturnType<typeof vi.fn>
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        title: '',
        pages: [],
        reviewState: {
          generateChatState: 'in-progress',
          clarificationPhase: 'clarifying',
          pendingIdea: 'a puppy who finds a rainbow',
          pendingRefinement: 'a dragon',
          chatHistory: [
            { role: 'kid', content: 'a puppy who finds a rainbow', ts: 1 },
            { role: 'ai', content: 'echoed', ts: 2, kind: 'echo' },
            { role: 'kid', content: 'a dragon', ts: 3 },
            { role: 'ai', content: 'add or change?', ts: 4, kind: 'add-or-change' },
          ],
          illustrationStyle: 'minecraft',
        },
      }),
    })

    const { result } = renderHook(() =>
      useBookGenerateChat({ ...baseOpts, resumeBookId: 'book-existing' }),
    )

    await waitFor(() => {
      expect(result.current.pendingIdea).toBe('a puppy who finds a rainbow')
    })
    expect(result.current.pendingRefinement).toBe('a dragon')
    expect(result.current.clarificationPhase).toBe('clarifying')
    expect(result.current.chatHistory.length).toBe(4)
  })

  it('starts a fresh draft at the initial target page count', () => {
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))
    expect(result.current.pageCount).toBe(6)
  })

  it('restores the saved target page count when resuming a draft (FEAT-97)', async () => {
    const firestore = await import('firebase/firestore')
    const getDoc = firestore.getDoc as ReturnType<typeof vi.fn>
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        title: '',
        pages: [],
        generationConfig: { storyIdea: 'a puppy', words: [], style: 'minecraft', pageCount: 14 },
        reviewState: {
          generateChatState: 'in-progress',
          clarificationPhase: 'clarifying',
          pendingIdea: 'a puppy',
          pendingRefinement: null,
          chatHistory: [{ role: 'kid', content: 'a puppy', ts: 1 }],
          illustrationStyle: 'minecraft',
        },
      }),
    })

    const { result } = renderHook(() =>
      useBookGenerateChat({ ...baseOpts, resumeBookId: 'book-existing' }),
    )

    // Hydrates to the saved 14, not the initial default of 6.
    await waitFor(() => {
      expect(result.current.pageCount).toBe(14)
    })
  })
})

// ── FEAT-169: sight words reach generateStory, and a failure names itself ──

describe('useBookGenerateChat sight-word channel (FEAT-169)', () => {
  const fakeStory = {
    title: 'Cave Cat',
    pages: [
      { pageNumber: 1, text: 'The cat found water again.', sceneDescription: 'a cave' },
      { pageNumber: 2, text: 'People came to see.', sceneDescription: 'a crowd' },
    ],
  }

  it("sends the child's practice words as the structured `words` list, not `[]`", async () => {
    setChildWords(wordDoc('water', 'practicing', 2), wordDoc('again', 'new'), wordDoc('the', 'mastered'))
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(fakeStory) })
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await waitFor(() => expect(result.current.storyWords).toEqual(['water', 'again']))
    await act(async () => {
      await result.current.sendKidMessage('a cat in a cave')
    })
    await act(async () => {
      await result.current.confirmStartStory()
    })

    expect(chatMock).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(chatMock.mock.calls[0][0].messages[0].content)
    expect(payload.words).toEqual(['water', 'again'])
    expect(payload.storyIdea).toBe('a cat in a cave')
    // The picked style's theme is kept — words are not fed to inferBookTheme.
    expect(payload.theme).toBe('fantasy')
  })

  it('records the same list on the draft book (generationConfig.words), so the book says what was asked for', async () => {
    setChildWords(wordDoc('water', 'practicing'))
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(fakeStory) })
    const { addDoc } = await import('firebase/firestore')
    const addDocMock = vi.mocked(addDoc)
    addDocMock.mockClear()
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))
    await waitFor(() => expect(result.current.storyWords).toEqual(['water']))

    await act(async () => {
      await result.current.sendKidMessage('a cat in a cave')
    })
    const clarificationDoc = addDocMock.mock.calls[0]?.[1] as { generationConfig?: { words: string[] } }
    expect(clarificationDoc.generationConfig?.words).toEqual(['water'])
  })

  it('sends `words: []` and makes no claim for a child with nothing to practise', async () => {
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(fakeStory) })
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))
    expect(result.current.storyWords).toEqual([])
    await act(async () => {
      await result.current.sendKidMessage('a cat')
    })
    await act(async () => {
      await result.current.confirmStartStory()
    })
    const payload = JSON.parse(chatMock.mock.calls[0][0].messages[0].content)
    expect(payload.words).toEqual([])
    const lastAi = result.current.chatHistory[result.current.chatHistory.length - 1]
    expect(lastAi.content).toBe('Here\'s your story! "Cave Cat"')
  })

  it('the story-draft turn reports which practice words actually landed on a page', async () => {
    setChildWords(wordDoc('water', 'practicing'), wordDoc('again', 'new'), wordDoc('yellow', 'new'))
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(fakeStory) })
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))
    await waitFor(() => expect(result.current.storyWords).toHaveLength(3))
    await act(async () => {
      await result.current.sendKidMessage('a cat')
    })
    await act(async () => {
      await result.current.confirmStartStory()
    })
    const lastAi = result.current.chatHistory[result.current.chatHistory.length - 1]
    expect(lastAi).toMatchObject({ role: 'ai', kind: 'story-draft' })
    // "yellow" was sent but is on no page — it is not claimed.
    expect(lastAi.content).toBe(
      'Here\'s your story! "Cave Cat" — it uses London\'s practice words: water, again.',
    )
  })
})

describe('useBookGenerateChat failure messages (FEAT-169 — a failure that names itself)', () => {
  async function startAndConfirm() {
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))
    await act(async () => {
      await result.current.sendKidMessage('a cat')
    })
    await act(async () => {
      await result.current.confirmStartStory()
    })
    return result
  }

  it('a call that returned nothing says the story did not come back and points at the connection', async () => {
    chatMock.mockResolvedValueOnce(null)
    const result = await startAndConfirm()
    expect(result.current.error).toMatch(/didn't come back/i)
    expect(result.current.error).toMatch(/connection/i)
    expect(result.current.error).toMatch(/nothing was lost/i)
    expect(result.current.clarificationPhase).toBe('clarifying')
    expect(result.current.canStartStory).toBe(true)
  })

  it('a reply the budget cut short (stopReason max_tokens) says so and suggests a Short book', async () => {
    const truncated = JSON.stringify({ title: 'T', pages: [{ pageNumber: 1, text: 'x' }] }).slice(0, -12)
    chatMock.mockResolvedValueOnce({ message: truncated, stopReason: 'max_tokens' })
    const result = await startAndConfirm()
    expect(result.current.error).toMatch(/too long to finish/i)
    expect(result.current.error).toMatch(/short book/i)
    expect(result.current.error).toMatch(/nothing was lost/i)
    expect(result.current.clarificationPhase).toBe('clarifying')
  })

  it('a truncated JSON reply with no stopReason (older deploy) is still recognised as cut short', async () => {
    const truncated = JSON.stringify({ title: 'T', pages: [{ pageNumber: 1, text: 'x' }] }).slice(0, -12)
    chatMock.mockResolvedValueOnce({ message: truncated })
    const result = await startAndConfirm()
    expect(result.current.error).toMatch(/too long to finish/i)
  })

  it('a complete but unreadable reply says so and suggests a plain retry — not the connection', async () => {
    chatMock.mockResolvedValueOnce({ message: 'Sorry, I cannot write that.', stopReason: 'end_turn' })
    const result = await startAndConfirm()
    expect(result.current.error).toMatch(/shape I couldn't read/i)
    expect(result.current.error).toMatch(/nothing was lost/i)
    expect(result.current.error).not.toMatch(/connection/i)
    expect(result.current.clarificationPhase).toBe('clarifying')
  })

  it('the three failures never share a message', async () => {
    const seen = new Set<string>()
    for (const reply of [
      null,
      { message: '{"title":"T","pages":[', stopReason: 'max_tokens' },
      { message: 'nope', stopReason: 'end_turn' },
    ]) {
      chatMock.mockResolvedValueOnce(reply)
      const result = await startAndConfirm()
      expect(result.current.error).toBeTruthy()
      seen.add(result.current.error as string)
    }
    expect(seen.size).toBe(3)
  })
})

// ── FEAT-172: the words the parent typed win ──

describe('useBookGenerateChat — a typed list wins over the practice list (FEAT-172)', () => {
  /** Shelly's report, 2026-09-02. */
  const SHELLY_IDEA =
    'Can you include these sight words: our, friend, pretty, eight, could, very, should, would, blue, around, where, know. London becomes Spider-Man'
  const fakeStory = {
    title: 'Web Hero',
    pages: [
      { pageNumber: 1, text: 'Our friend could be very brave.', sceneDescription: 'a city' },
      { pageNumber: 2, text: 'She knew where to go.', sceneDescription: 'a roof' },
    ],
  }

  it("sends the parent's typed words as `words`, not the child's practice list, and says which source it is", async () => {
    // The child's own list is Lincoln-shaped — the list Shelly was offered.
    setChildWords(wordDoc('the', 'practicing', 3), wordDoc('hut', 'new'), wordDoc('linky', 'new'))
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(fakeStory) })
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage(SHELLY_IDEA)
    })
    expect(result.current.storyWordSource).toBe('requested')
    expect(result.current.storyWords).toEqual([
      'our', 'friend', 'pretty', 'eight', 'could', 'very', 'should', 'would', 'blue', 'around', 'where', 'know',
    ])

    await act(async () => {
      await result.current.confirmStartStory()
    })
    const payload = JSON.parse(chatMock.mock.calls[0][0].messages[0].content)
    expect(payload.words).toEqual(result.current.storyWords)
    expect(payload.words).not.toContain('the')
    expect(payload.words).not.toContain('hut')
  })

  it('records the typed list on the draft book from the FIRST write — not the practice list the render closure held', async () => {
    setChildWords(wordDoc('the', 'practicing'))
    const { addDoc } = await import('firebase/firestore')
    const addDocMock = vi.mocked(addDoc)
    addDocMock.mockClear()
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))
    await waitFor(() => expect(result.current.storyWords).toEqual(['the']))

    await act(async () => {
      await result.current.sendKidMessage('sight words: our, friend. A hero story')
    })
    const clarificationDoc = addDocMock.mock.calls[0]?.[1] as { generationConfig?: { words: string[] } }
    expect(clarificationDoc.generationConfig?.words).toEqual(['our', 'friend'])
  })

  it('the story-draft turn names the typed words as "the words you asked for", checked against the pages', async () => {
    setChildWords(wordDoc('the', 'practicing'))
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(fakeStory) })
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))
    await act(async () => {
      await result.current.sendKidMessage(SHELLY_IDEA)
    })
    await act(async () => {
      await result.current.confirmStartStory()
    })
    const lastAi = result.current.chatHistory[result.current.chatHistory.length - 1]
    expect(lastAi).toMatchObject({ role: 'ai', kind: 'story-draft' })
    // "our", "friend", "could", "very", "where" are on a page; "know" is not ("knew").
    expect(lastAi.content).toBe(
      'Here\'s your story! "Web Hero" — it uses the words you asked for: our, friend, could, very, where.',
    )
  })

  it('falls back to the practice list — and the FEAT-169 wording — when the idea names no words', async () => {
    setChildWords(wordDoc('water', 'practicing'))
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(fakeStory) })
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))
    await waitFor(() => expect(result.current.storyWords).toEqual(['water']))
    await act(async () => {
      await result.current.sendKidMessage('London becomes a hero')
    })
    expect(result.current.storyWordSource).toBe('practice')
    await act(async () => {
      await result.current.confirmStartStory()
    })
    const payload = JSON.parse(chatMock.mock.calls[0][0].messages[0].content)
    expect(payload.words).toEqual(['water'])
    const lastAi = result.current.chatHistory[result.current.chatHistory.length - 1]
    expect(lastAi.content).toBe(
      'Here\'s your story! "Web Hero" — I couldn\'t fit London\'s practice words in this time.',
    )
  })

  it('follows an Add / Change edit of the idea — the list is derived from the idea, never stored', async () => {
    setChildWords(wordDoc('water', 'practicing'))
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))
    await act(async () => {
      await result.current.sendKidMessage('London becomes a hero')
    })
    expect(result.current.storyWordSource).toBe('practice')
    await act(async () => {
      await result.current.sendKidMessage('with the words: our, friend')
    })
    await act(async () => {
      await result.current.confirmAddRefinement()
    })
    expect(result.current.storyWordSource).toBe('requested')
    expect(result.current.storyWords).toEqual(['our', 'friend'])
  })

  it('a typed list never waits on the practice read — the start is not withheld while that list loads', async () => {
    sightWordState.loading = true
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(fakeStory) })
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))
    await act(async () => {
      await result.current.sendKidMessage(SHELLY_IDEA)
    })
    expect(result.current.storyWordsLoading).toBe(false)
    expect(result.current.canStartStory).toBe(true)
    await act(async () => {
      await result.current.confirmStartStory()
    })
    expect(chatMock).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(chatMock.mock.calls[0][0].messages[0].content)
    expect(payload.words).toContain('our')
  })
})

describe('useBookGenerateChat — the active profile is the context (FEAT-173, owner decision 2026-09-02)', () => {
  it('a merge-write never rewrites the draft\'s childId / createdFor — the book stays on the shelf it was created on', async () => {
    const firestore = await import('firebase/firestore')
    const addDoc = vi.mocked(firestore.addDoc)
    const setDoc = vi.mocked(firestore.setDoc)
    const getDoc = vi.mocked(firestore.getDoc)
    addDoc.mockClear()
    setDoc.mockClear()
    addDoc.mockResolvedValue({ id: 'book-new' } as never)
    // Once the draft doc exists, later persists read-merge-write it.
    getDoc.mockImplementation(async () => ({
      exists: () => true,
      data: () => ({ childId: 'child-lincoln', createdFor: 'child-lincoln', pages: [], reviewState: {} }),
    }) as never)

    const { result, rerender } = renderHook(
      ({ active }: { active: string }) =>
        useBookGenerateChat({
          ...baseOpts,
          childId: active,
          attribution: { createdBy: 'parent', createdFor: active },
        }),
      { initialProps: { active: 'child-lincoln' } },
    )
    await act(async () => {
      await result.current.sendKidMessage('London becomes a hero')
    })
    expect((addDoc.mock.calls[0]?.[1] as { childId: string }).childId).toBe('child-lincoln')

    // The header's active child changes under an open draft. FEAT-172 moved
    // the doc with it; the owner rejected that — the profile is the context,
    // and a draft is not re-homed by a persist.
    rerender({ active: 'child-london' })
    await act(async () => {
      await result.current.sendKidMessage('and a spider')
    })
    const merged = setDoc.mock.calls.at(-1)?.[1] as { childId: string; createdFor: string }
    expect(merged).toMatchObject({ childId: 'child-lincoln', createdFor: 'child-lincoln' })
    getDoc.mockReset()
    getDoc.mockResolvedValue({ exists: () => false } as never)
  })
})

describe('useBookGenerateChat waits for the sight-word list to settle (FEAT-169, Codex P1 on PR #1724)', () => {
  const fakeStory = {
    title: 'Cave Cat',
    pages: [{ pageNumber: 1, text: 'The cat found water.', sceneDescription: 'a cave' }],
  }

  it('withholds the start while the list is still loading — a fast tap cannot send words: []', async () => {
    sightWordState.loading = true
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(fakeStory) })
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))
    await act(async () => {
      await result.current.sendKidMessage('a cat in a cave')
    })
    expect(result.current.storyWordsLoading).toBe(true)
    expect(result.current.canStartStory).toBe(false)
    await act(async () => {
      await result.current.confirmStartStory()
    })
    expect(chatMock).not.toHaveBeenCalled()
    expect(result.current.clarificationPhase).toBe('clarifying')
  })

  it('starts once the list has settled, with the words that arrived', async () => {
    sightWordState.loading = true
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(fakeStory) })
    const { result, rerender } = renderHook(() => useBookGenerateChat(baseOpts))
    await act(async () => {
      await result.current.sendKidMessage('a cat in a cave')
    })
    expect(result.current.canStartStory).toBe(false)

    // The read lands.
    sightWordState.loading = false
    setChildWords(wordDoc('water', 'practicing'))
    rerender()
    await waitFor(() => expect(result.current.canStartStory).toBe(true))
    expect(result.current.storyWords).toEqual(['water'])

    await act(async () => {
      await result.current.confirmStartStory()
    })
    expect(chatMock).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(chatMock.mock.calls[0][0].messages[0].content)
    expect(payload.words).toEqual(['water'])
  })
})

describe('useBookGenerateChat — a typed list survives "Add it" (Codex P1 on PR #1731)', () => {
  it('keeps the words the parent asked for when ordinary story detail is added behind them', async () => {
    setChildWords(wordDoc('water', 'practicing'))
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))
    await waitFor(() => expect(result.current.storyWords).toEqual(['water']))
    await act(async () => {
      await result.current.sendKidMessage('A puppy story. Include these sight words: our, friend.')
    })
    expect(result.current.storyWordSource).toBe('requested')
    await act(async () => {
      await result.current.sendKidMessage('in space')
    })
    await act(async () => {
      await result.current.confirmAddRefinement()
    })
    expect(result.current.pendingIdea).toBe(
      'A puppy story. Include these sight words: our, friend and in space',
    )
    // The typed list is still the list — the practice list did not take over.
    expect(result.current.storyWordSource).toBe('requested')
    expect(result.current.storyWords).toEqual(['our', 'friend'])
  })
})
